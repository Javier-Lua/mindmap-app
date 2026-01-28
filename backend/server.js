require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { pipeline } = require('@xenova/transformers');
const kmeans = require('ml-kmeans');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cookieParser = require('cookie-parser');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const jsonwebtoken = require('jsonwebtoken');

const app = express();
const prisma = new PrismaClient();

// Simple in-memory cache for performance
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

const getCached = (key) => {
  const item = cache.get(key);
  if (item && Date.now() - item.time < CACHE_TTL) {
    return item.data;
  }
  cache.delete(key);
  return null;
};

const setCache = (key, data) => {
  cache.set(key, { data, time: Date.now() });
};

// Request deduplication middleware
const requestCache = new Map();
const CACHE_DURATION = 1000; // 1 second

const deduplicateRequests = (req, res, next) => {
  if (req.method === 'GET') return next();
  
  const key = `${req.userId}-${req.method}-${req.path}-${JSON.stringify(req.body)}`;
  const cached = requestCache.get(key);
  
  if (cached && Date.now() - cached.time < CACHE_DURATION) {
    return res.json(cached.response);
  }
  
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    requestCache.set(key, { response: data, time: Date.now() });
    setTimeout(() => requestCache.delete(key), CACHE_DURATION);
    return originalJson(data);
  };
  
  next();
};

// Performance monitoring and enhanced logging
app.use((req, res, next) => {
  req.startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`, {
      userId: req.userId || 'unauthenticated',
      duration: `${duration}ms`
    });
    if (duration > 1000) {
      console.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  
  next();
});

// Basic middleware
// CORS configuration - allow credentials and handle development
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100;

const rateLimiter = (req, res, next) => {
  const identifier = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestCounts.has(identifier)) {
    requestCounts.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const userData = requestCounts.get(identifier);
  
  if (now > userData.resetTime) {
    userData.count = 1;
    userData.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (userData.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({ 
      error: 'Too many requests, please try again later.',
      retryAfter: Math.ceil((userData.resetTime - now) / 1000)
    });
  }
  
  userData.count++;
  next();
};

app.use('/api/', rateLimiter);
app.use('/api/', deduplicateRequests);

// Redirect non-API routes to API routes (safety net)
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') && 
      !req.path.startsWith('/auth/') && 
      !req.path.startsWith('/health') &&
      req.path !== '/') {
    console.warn(`Redirecting ${req.method} ${req.path} to /api${req.path}`);
    return res.status(404).json({ 
      error: 'Endpoint not found. Did you mean /api' + req.path + '?',
      correctPath: '/api' + req.path
    });
  }
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      status: 'ok', 
      database: 'connected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('Health check failed:', e);
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: e.message 
    });
  }
});

// Periodic DB health check (instead of on every request)
let dbHealthy = true;
setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbHealthy = true;
  } catch (e) {
    console.error('DB health check failed:', e);
    dbHealthy = false;
  }
}, 30000); // Check every 30 seconds

// Simplified DB check middleware - only fails fast if DB is known to be down
app.use((req, res, next) => {
  if (!dbHealthy && !req.path.includes('/health')) {
    return res.status(503).json({ error: 'Database unavailable' });
  }
  next();
});

let extractor;
(async () => {
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('ML model loaded successfully');
})();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.BACKEND_URL}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await prisma.user.upsert({
      where: { email: profile.emails[0].value },
      update: { name: profile.displayName },
      create: { email: profile.emails[0].value, name: profile.displayName }
    });
    
    const noteCount = await prisma.note.count({ where: { userId: user.id } });
    if (noteCount === 0) {
      const starterNotes = [
        { title: 'Welcome to Messy Notes', rawText: 'Drop anything here - thoughts, files, links. We\'ll help you make sense of it later.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Drop anything here - thoughts, files, links. We\'ll help you make sense of it later.' }] }] }, x: 100, y: 100, color: '#FEF3C7' },
        { title: 'Brain Dump Zone', rawText: 'Quick capture with Ctrl+K. Everything is auto-saved and searchable.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quick capture with Ctrl+K. Everything is auto-saved and searchable.' }] }] }, x: 400, y: 150, color: '#DBEAFE', ephemeral: true },
        { title: 'Organize Later', rawText: 'Use Smart Tidy to auto-group related notes when you\'re ready.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use Smart Tidy to auto-group related notes when you\'re ready.' }] }] }, x: 250, y: 300, color: '#E0E7FF' }
      ];
      for (const note of starterNotes) {
        await prisma.note.create({ data: { ...note, userId: user.id } });
      }
    }
    
    done(null, user);
  } catch (error) {
    console.error('Google auth error:', error);
    done(error, null);
  }
}));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
  const token = jsonwebtoken.sign({ userId: req.user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  
  // Set cookie with correct settings
  res.cookie('token', token, { 
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
  
  // Redirect to frontend
  res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
});

const auth = async (req, res, next) => {
  const token = req.cookies.token;
  
  if (!token) {
    // Silent fail for /api/me - expected during logout
    return res.status(401).json({ 
      error: 'Unauthorized - no token',
      action: 'REAUTH_REQUIRED' 
    });
  }
  
  try {
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET);
    
    const user = await prisma.user.findUnique({ 
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true }
    });
    
    if (!user) {
      res.clearCookie('token');
      return res.status(401).json({ 
        error: 'User not found. Please sign in again.',
        action: 'REAUTH_REQUIRED'
      });
    }
    
    req.userId = decoded.userId;
    req.user = user;
    next();
  } catch (e) {
    res.clearCookie('token');
    res.status(401).json({ 
      error: 'Authentication failed',
      action: 'REAUTH_REQUIRED'
    });
  }
};

app.get('/api/me', auth, async (req, res) => {
  res.json(req.user);
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
});

app.post('/api/upload', auth, async (req, res) => {
  try {
    const { fileName, fileType, fileData } = req.body;
    const buffer = Buffer.from(fileData, 'base64');
    
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: fileType
    }));
    
    const url = `https://${process.env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${fileName}`;
    const note = await prisma.note.create({
      data: {
        userId: req.userId,
        type: fileType.startsWith('image') ? 'image' : (fileType === 'application/pdf' ? 'pdf' : 'voice'),
        fileUrl: url,
        title: fileName,
        x: Math.random() * 500,
        y: Math.random() * 500,
        ephemeral: true
      }
    });
    res.json(note);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

app.post('/api/notes', auth, async (req, res) => {
  try {
    // Build the data object with only the fields that are provided
    const data = {
      userId: req.userId,
      x: req.body.x !== undefined ? req.body.x : Math.random() * 500,
      y: req.body.y !== undefined ? req.body.y : Math.random() * 500,
      type: req.body.type || 'text',
      color: req.body.color || '#FFFFFF',
      ephemeral: req.body.ephemeral !== false,
      priority: req.body.priority || 0,
      weight: 1.0
    };

    // Add optional fields if provided
    if (req.body.folderId) {
      data.folderId = req.body.folderId;
    }
    if (req.body.title) {
      data.title = req.body.title;
    }
    if (req.body.rawText) {
      data.rawText = req.body.rawText;
    }
    if (req.body.content) {
      data.content = req.body.content;
    }
    if (req.body.sticky !== undefined) {
      data.sticky = req.body.sticky;
    }
    if (req.body.archived !== undefined) {
      data.archived = req.body.archived;
    }

    const note = await prisma.note.create({
      data
    });

    // If rawText was provided, generate embedding
    if (req.body.rawText && req.body.rawText.trim() && extractor) {
      try {
        const output = await extractor(req.body.rawText, { 
          pooling: 'mean', 
          normalize: true 
        });
        const embeddingArray = Array.from(output.data);
        
        await prisma.$executeRaw`
          UPDATE "Note" 
          SET embedding = ${embeddingArray}::vector 
          WHERE id = ${note.id}
        `;
        
        console.log(`Generated embedding for new note ${note.id}`);
      } catch (embedError) {
        console.error('Failed to generate embedding for new note:', embedError);
        // Don't fail the request just because embedding failed
      }
    }

    res.json(note);
  } catch (error) {
    console.error('Create note error:', error);
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Invalid user or folder reference. Please refresh and try again.',
        code: 'FOREIGN_KEY_VIOLATION'
      });
    }
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// DELETE ALL notes - MUST come BEFORE /api/notes/:id
app.delete('/api/notes/all', auth, async (req, res) => {
  try {
    const { confirm } = req.query;
    
    if (confirm !== 'DELETE_ALL') {
      return res.status(400).json({ 
        error: 'Must confirm deletion with ?confirm=DELETE_ALL' 
      });
    }
    
    console.log(`Starting delete all for user ${req.userId}`);
    
    // Count notes first
    const noteCount = await prisma.note.count({
      where: { userId: req.userId }
    });
    
    if (noteCount === 0) {
      return res.json({ deleted: 0 });
    }
    
    console.log(`Found ${noteCount} notes to delete`);
    
    // Delete in steps to avoid issues
    try {
      // Step 1: Clear cluster associations
      console.log('Step 1: Clearing cluster associations...');
      await prisma.$executeRaw`
        DELETE FROM "_NoteClusters" 
        WHERE "B" IN (
          SELECT id FROM "Note" WHERE "userId" = ${req.userId}
        )
      `;
      console.log('Cluster associations cleared');
      
      // Step 2: Delete notes (CASCADE handles links and annotations)
      console.log('Step 2: Deleting notes...');
      const result = await prisma.note.deleteMany({
        where: { userId: req.userId }
      });
      console.log(`Deleted ${result.count} notes`);
      
      res.json({ deleted: result.count });
    } catch (deleteError) {
      console.error('Error during deletion:', deleteError);
      throw deleteError;
    }
  } catch (error) {
    console.error('Delete all error:', error);
    console.error('Error name:', error.name);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to delete all notes: ' + error.message,
      code: error.code,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.put('/api/notes/:id', auth, async (req, res) => {
  try {
    const { content, plainText, title, messyMode, x, y, color, ephemeral, sticky, priority, archived } = req.body;
    let data = {};
    
    if (content !== undefined) data.content = content;
    if (plainText !== undefined) data.rawText = plainText;
    if (title !== undefined) data.title = title;
    if (x !== undefined) data.x = x;
    if (y !== undefined) data.y = y;
    if (color !== undefined) data.color = color;
    if (ephemeral !== undefined) data.ephemeral = ephemeral;
    if (sticky !== undefined) data.sticky = sticky;
    if (priority !== undefined) data.priority = priority;
    if (archived !== undefined) data.archived = archived;

    const updatedNote = await prisma.$transaction(async (tx) => {
      const note = await tx.note.findUnique({
        where: { id: req.params.id },
        include: { incoming: true, outgoing: true }
      });
      
      if (!note || note.userId !== req.userId) {
        throw new Error('Note not found');
      }
      
      const linkCount = note.incoming.length + note.outgoing.length;
      const daysSinceUpdate = (Date.now() - new Date(note.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      data.weight = Math.max(0.2, 1 + (linkCount * 0.2) - (daysSinceUpdate * 0.05));
      
      if (plainText && plainText.trim()) {
        const output = await extractor(plainText, { pooling: 'mean', normalize: true });
        const embeddingArray = Array.from(output.data);
        
        await tx.$executeRaw`
          UPDATE "Note" 
          SET embedding = ${embeddingArray}::vector 
          WHERE id = ${req.params.id}
        `;
        
        if (plainText.length > 20) {
          data.ephemeral = false;
        }
      }
      
      return await tx.note.update({
        where: { id: req.params.id },
        data
      });
    });
    
    if (messyMode && plainText) {
      const allNotes = await prisma.note.findMany({ 
        where: { userId: req.userId, id: { not: updatedNote.id }, archived: { not: true } }, 
        select: { id: true, title: true, rawText: true } 
      });
      
      const plainTextLower = plainText.toLowerCase();
      for (const otherNote of allNotes) {
        const titleLower = otherNote.title.toLowerCase();
        const rawTextLower = (otherNote.rawText || '').toLowerCase();
        
        if (plainTextLower.includes(titleLower) || rawTextLower.includes(updatedNote.title.toLowerCase())) {
          const existingLink = await prisma.link.findUnique({
            where: { sourceId_targetId: { sourceId: updatedNote.id, targetId: otherNote.id } }
          });
          
          if (existingLink) {
            await prisma.link.update({
              where: { id: existingLink.id },
              data: { strength: { increment: 0.3 } }
            });
          } else {
            await prisma.link.create({
              data: { 
                sourceId: updatedNote.id, 
                targetId: otherNote.id, 
                reason: `Both mention "${titleLower}"`,
                strength: 1.0 
              }
            });
          }
        }
      }
    }
    
    res.json(updatedNote);
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

app.delete('/api/notes/:id', auth, async (req, res) => {
  try {
    const note = await prisma.note.findUnique({ 
      where: { id: req.params.id },
      select: { userId: true }
    });
    
    if (!note || note.userId !== req.userId) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    await prisma.link.deleteMany({ where: { OR: [{ sourceId: req.params.id }, { targetId: req.params.id }] } });
    await prisma.annotation.deleteMany({ where: { noteId: req.params.id } });
    await prisma.note.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

app.post('/api/notes/batch', auth, async (req, res) => {
  try {
    const { operations } = req.body;
    const results = [];
    
    for (const op of operations) {
      if (op.type === 'update') {
        const result = await prisma.note.update({
          where: { id: op.id },
          data: op.data
        });
        results.push(result);
      } else if (op.type === 'create') {
        const result = await prisma.note.create({
          data: { ...op.data, userId: req.userId }
        });
        results.push(result);
      } else if (op.type === 'delete') {
        await prisma.link.deleteMany({ where: { OR: [{ sourceId: op.id }, { targetId: op.id }] } });
        await prisma.note.delete({ where: { id: op.id } });
        results.push({ id: op.id, deleted: true });
      }
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Batch operation error:', error);
    res.status(500).json({ error: 'Failed to execute batch operations' });
  }
});

app.post('/api/linker', auth, async (req, res) => {
  try {
    const { text, noteId } = req.body;
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);
    
    const suggestions = await prisma.$queryRaw`
      SELECT id, title, "rawText", (embedding <-> ${vector}::vector) as distance
      FROM "Note"
      WHERE "userId" = ${req.userId} AND id != ${noteId} AND embedding IS NOT NULL AND archived IS NOT TRUE
      ORDER BY distance ASC
      LIMIT 5`;
    
    const results = suggestions.map(s => ({
      id: s.id,
      title: s.title,
      reason: `Similar content about "${text.slice(0, 30)}..."`,
      distance: parseFloat(s.distance)
    }));
    
    res.json({ suggestions: results });
  } catch (error) {
    console.error('Linker error:', error);
    res.status(500).json({ error: 'Failed to find suggestions' });
  }
});

app.get('/api/home', auth, async (req, res) => {
  try {
    const folders = await prisma.folder.findMany({
      where: { userId: req.userId, parentId: null },
      include: { _count: { select: { notes: true } } }
    });
    const recentNotes = await prisma.note.findMany({
      where: { userId: req.userId, archived: { not: true } },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: { id: true, title: true, updatedAt: true, color: true, type: true }
    });
    const totalNotes = await prisma.note.count({ where: { userId: req.userId, archived: { not: true } } });
    const totalLinks = await prisma.link.count({ 
      where: { source: { userId: req.userId } } 
    });
    
    res.json({ folders, recentNotes, stats: { totalNotes, totalLinks } });
  } catch (error) {
    console.error('Home data error:', error);
    res.status(500).json({ error: 'Failed to load home data' });
  }
});

app.post('/api/folders', auth, async (req, res) => {
  try {
    const folder = await prisma.folder.create({
      data: {
        name: req.body.name || 'New Folder',
        userId: req.userId,
        parentId: req.body.parentId
      },
      include: { _count: { select: { notes: true } } }
    });
    res.json(folder);
  } catch (error) {
    console.error('Create folder error:', error);
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Invalid user reference. Please sign in again.',
        code: 'FOREIGN_KEY_VIOLATION'
      });
    }
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

app.put('/api/folders/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.folder.findUnique({
      where: { id: req.params.id },
      select: { userId: true }
    });
    
    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    const folder = await prisma.folder.update({
      where: { id: req.params.id },
      data: { name: req.body.name },
      include: { _count: { select: { notes: true } } }
    });
    res.json(folder);
  } catch (error) {
    console.error('Update folder error:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

app.delete('/api/folders/:id', auth, async (req, res) => {
  try {
    const folder = await prisma.folder.findUnique({
      where: { id: req.params.id },
      select: { userId: true }
    });
    
    if (!folder || folder.userId !== req.userId) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    await prisma.note.updateMany({
      where: { folderId: req.params.id },
      data: { folderId: null }
    });
    await prisma.folder.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

app.get('/api/mindmap', auth, async (req, res) => {
  try {
    const { folderId, showArchived } = req.query;
    const where = { userId: req.userId };
    if (folderId && folderId !== 'undefined') where.folderId = folderId;
    if (!showArchived || showArchived === 'false') where.archived = { not: true };
    
    const notes = await prisma.note.findMany({
      where,
      select: { 
        id: true, title: true, x: true, y: true, color: true, 
        type: true, fileUrl: true, createdAt: true, updatedAt: true,
        rawText: true, ephemeral: true, sticky: true, priority: true,
        weight: true, archived: true
      }
    });
    
    const noteIds = notes.map(n => n.id);
    const links = await prisma.link.findMany({
      where: { 
        AND: [
          { sourceId: { in: noteIds } },
          { targetId: { in: noteIds } }
        ]
      },
      select: { id: true, sourceId: true, targetId: true, strength: true, reason: true }
    });
    
    res.json({ nodes: notes, edges: links });
  } catch (error) {
    console.error('Mindmap data error:', error);
    res.status(500).json({ error: 'Failed to load mindmap' });
  }
});

app.get('/api/search', auth, async (req, res) => {
  try {
    const { query, fuzzy } = req.query;
    
    if (fuzzy === 'true') {
      const results = await prisma.note.findMany({
        where: {
          userId: req.userId,
          archived: { not: true },
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { rawText: { contains: query, mode: 'insensitive' } }
          ]
        },
        take: 20,
        select: { id: true, title: true, rawText: true, x: true, y: true }
      });
      return res.json(results);
    }
    
    const output = await extractor(query, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);
    
    const results = await prisma.$queryRaw`
      SELECT id, title, "rawText", x, y, (embedding <-> ${vector}::vector) as distance
      FROM "Note"
      WHERE "userId" = ${req.userId} AND embedding IS NOT NULL AND archived IS NOT TRUE
      ORDER BY distance ASC
      LIMIT 10`;
    
    res.json(results.map(r => ({
      ...r,
      distance: parseFloat(r.distance)
    })));
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.post('/api/cluster', auth, async (req, res) => {
  try {
    const { preview } = req.body;
    
    // Get notes with embeddings
    const notes = await prisma.$queryRaw`
      SELECT id, title, x, y, embedding::text as embedding_text, "rawText"
      FROM "Note"
      WHERE "userId" = ${req.userId} 
        AND embedding IS NOT NULL 
        AND archived IS NOT TRUE
        AND "rawText" IS NOT NULL
        AND LENGTH("rawText") > 20
    `;
    
    if (notes.length < 3) {
      return res.json({ 
        message: 'Not enough notes to cluster. You need at least 3 notes with text content (more than 20 characters each).', 
        clusters: [] 
      });
    }
    
    // Parse embeddings from PostgreSQL vector format
    const embeddings = notes.map(n => {
      // PostgreSQL returns vectors as "[1,2,3,...]" format
      const vectorStr = n.embedding_text.replace(/[\[\]]/g, '');
      return vectorStr.split(',').map(v => parseFloat(v.trim()));
    });
    
    // Validate embeddings
    if (embeddings.some(emb => emb.some(v => isNaN(v)))) {
      console.error('Invalid embeddings detected');
      return res.status(500).json({ 
        error: 'Invalid embedding data. Please regenerate embeddings.' 
      });
    }
    
    // Determine number of clusters (2-5 clusters, max half the notes)
    const numClusters = Math.min(5, Math.max(2, Math.floor(notes.length / 2)));
    
    console.log(`Clustering ${notes.length} notes into ${numClusters} clusters`);
    console.log(`Embedding dimensions: ${embeddings[0].length}`);
    
    // Run k-means clustering
    // ml-kmeans expects: kmeans(data, numberOfClusters, options)
    let result;
    try {
      result = kmeans(embeddings, numClusters, {
        initialization: 'kmeans++',
        maxIterations: 100,
        tolerance: 1e-4,
        seed: 42  // For reproducible results
      });
    } catch (kmeansError) {
      console.error('K-means error:', kmeansError);
      // Fallback: try with just basic parameters
      try {
        result = kmeans(embeddings, numClusters);
      } catch (fallbackError) {
        console.error('K-means fallback also failed:', fallbackError);
        return res.status(500).json({ 
          error: 'Clustering algorithm failed. Try with more notes or different content.',
          details: process.env.NODE_ENV === 'development' ? fallbackError.message : undefined
        });
      }
    }
    
    // Verify we got valid results
    if (!result || !result.clusters || result.clusters.length !== notes.length) {
      console.error('K-means returned invalid results:', result);
      return res.status(500).json({ 
        error: 'Clustering produced invalid results. Please try again.' 
      });
    }
    
    // Group notes by cluster
    const clusters = {};
    result.clusters.forEach((clusterIdx, i) => {
      if (!clusters[clusterIdx]) {
        clusters[clusterIdx] = [];
      }
      clusters[clusterIdx].push({
        id: notes[i].id,
        title: notes[i].title,
        x: parseFloat(notes[i].x),
        y: parseFloat(notes[i].y),
        preview: notes[i].rawText.slice(0, 100)
      });
    });
    
    // Create cluster data with colors and positions
    const clusterColors = ['#FEE2E2', '#DBEAFE', '#E0E7FF', '#FCE7F3', '#FEF3C7'];
    const clusterData = Object.entries(clusters).map(([idx, noteList]) => {
      // Calculate center based on current note positions
      const centerX = noteList.reduce((sum, n) => sum + n.x, 0) / noteList.length;
      const centerY = noteList.reduce((sum, n) => sum + n.y, 0) / noteList.length;
      
      return {
        id: `cluster-${idx}`,
        name: `Group ${parseInt(idx) + 1}`,
        notes: noteList,
        centerX,
        centerY,
        color: clusterColors[parseInt(idx) % clusterColors.length]
      };
    });
    
    // Sort clusters by size (largest first)
    clusterData.sort((a, b) => b.notes.length - a.notes.length);
    
    console.log(`Created ${clusterData.length} clusters:`, 
      clusterData.map(c => `${c.name}: ${c.notes.length} notes`).join(', ')
    );
    
    // If not preview, actually update note positions
    if (!preview) {
      console.log('Applying cluster positions...');
      
      for (const cluster of clusterData) {
        // Calculate radius based on number of notes (more notes = larger circle)
        const radius = Math.min(250, Math.max(100, cluster.notes.length * 40));
        const angleStep = (2 * Math.PI) / cluster.notes.length;
        
        // Position notes in a circle around cluster center
        for (let i = 0; i < cluster.notes.length; i++) {
          const angle = i * angleStep;
          const newX = cluster.centerX + radius * Math.cos(angle);
          const newY = cluster.centerY + radius * Math.sin(angle);
          
          await prisma.note.update({
            where: { id: cluster.notes[i].id },
            data: { 
              x: newX, 
              y: newY,
              // Mark as non-ephemeral since we're organizing them
              ephemeral: false
            }
          });
          
          console.log(`Moved note ${cluster.notes[i].id} to (${newX.toFixed(1)}, ${newY.toFixed(1)})`);
        }
      }
      
      console.log('Cluster positions applied successfully');
    }
    
    res.json({ 
      clusters: clusterData, 
      preview,
      stats: {
        totalNotes: notes.length,
        numClusters: clusterData.length,
        averageClusterSize: Math.round(notes.length / clusterData.length),
        smallestCluster: Math.min(...clusterData.map(c => c.notes.length)),
        largestCluster: Math.max(...clusterData.map(c => c.notes.length))
      }
    });
  } catch (error) {
    console.error('Clustering error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Clustering failed: ' + error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.post('/api/auto-archive', auth, async (req, res) => {
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    
    const ephemeralNotes = await prisma.note.findMany({
      where: {
        userId: req.userId,
        ephemeral: true,
        updatedAt: { lt: twoDaysAgo },
        archived: { not: true }
      }
    });
    
    await prisma.note.updateMany({
      where: {
        userId: req.userId,
        ephemeral: true,
        updatedAt: { lt: twoDaysAgo },
        archived: { not: true }
      },
      data: { archived: true }
    });
    
    res.json({ archivedCount: ephemeralNotes.length, notes: ephemeralNotes });
  } catch (error) {
    console.error('Auto-archive error:', error);
    res.status(500).json({ error: 'Auto-archive failed' });
  }
});

app.get('/api/rediscover', auth, async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const orphans = await prisma.note.findMany({
      where: { 
        userId: req.userId,
        archived: { not: true },
        AND: [
          { incoming: { none: {} } },
          { outgoing: { none: {} } },
          { updatedAt: { lt: oneWeekAgo } }
        ]
      },
      take: 5,
      orderBy: { updatedAt: 'asc' },
      select: { id: true, title: true, updatedAt: true }
    });
    
    const weakConnections = await prisma.note.findMany({
      where: {
        userId: req.userId,
        archived: { not: true },
        updatedAt: { lt: oneWeekAgo }
      },
      include: {
        incoming: true,
        outgoing: true
      },
      take: 5
    });
    
    const surprisingConnections = await prisma.link.findMany({
      where: {
        source: { userId: req.userId, archived: { not: true } },
        strength: { gte: 3 }
      },
      include: {
        source: { select: { id: true, title: true } },
        target: { select: { id: true, title: true } }
      },
      take: 3
    });
    
    res.json({ 
      orphans, 
      weakConnections: weakConnections.filter(n => (n.incoming.length + n.outgoing.length) <= 2),
      surprisingConnections
    });
  } catch (error) {
    console.error('Rediscover error:', error);
    res.status(500).json({ error: 'Failed to load suggestions' });
  }
});

app.get('/api/notes/:id', auth, async (req, res) => {
  try {
    const note = await prisma.note.findUnique({
      where: { id: req.params.id },
      include: { 
        annotations: true,
        incoming: { include: { source: { select: { id: true, title: true } } } },
        outgoing: { include: { target: { select: { id: true, title: true } } } }
      }
    });
    
    if (!note || note.userId !== req.userId) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ error: 'Failed to load note' });
  }
});

app.post('/api/notes/:id/annotations', auth, async (req, res) => {
  try {
    const note = await prisma.note.findUnique({
      where: { id: req.params.id },
      select: { userId: true }
    });
    
    if (!note || note.userId !== req.userId) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    const ann = await prisma.annotation.create({
      data: { 
        noteId: req.params.id, 
        text: req.body.text, 
        comment: req.body.comment 
      }
    });
    res.json(ann);
  } catch (error) {
    console.error('Create annotation error:', error);
    res.status(500).json({ error: 'Failed to create annotation' });
  }
});

app.put('/api/annotations/:id', auth, async (req, res) => {
  try {
    const ann = await prisma.annotation.update({
      where: { id: req.params.id },
      data: { comment: req.body.comment }
    });
    res.json(ann);
  } catch (error) {
    console.error('Update annotation error:', error);
    res.status(500).json({ error: 'Failed to update annotation' });
  }
});

app.delete('/api/annotations/:id', auth, async (req, res) => {
  try {
    await prisma.annotation.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete annotation error:', error);
    res.status(500).json({ error: 'Failed to delete annotation' });
  }
});

app.post('/api/links', auth, async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: {
        id: { in: [req.body.sourceId, req.body.targetId] },
        userId: req.userId
      }
    });
    
    if (notes.length !== 2) {
      return res.status(404).json({ error: 'One or both notes not found' });
    }
    
    const existing = await prisma.link.findUnique({
      where: { 
        sourceId_targetId: { 
          sourceId: req.body.sourceId, 
          targetId: req.body.targetId 
        } 
      }
    });
    
    if (existing) {
      const updated = await prisma.link.update({
        where: { id: existing.id },
        data: { strength: { increment: 0.5 } }
      });
      return res.json(updated);
    }
    
    const link = await prisma.link.create({
      data: { 
        sourceId: req.body.sourceId, 
        targetId: req.body.targetId, 
        strength: 1.0, 
        reason: req.body.reason || 'Manual link' 
      }
    });
    res.json(link);
  } catch (error) {
    console.error('Create link error:', error);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

app.delete('/api/links/:id', auth, async (req, res) => {
  try {
    await prisma.link.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete link error:', error);
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// Get all notes for sidebar (lightweight query) with caching
app.get('/api/notes', auth, async (req, res) => {
  try {
    const cacheKey = `notes-${req.userId}`;
    const cached = getCached(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    const notes = await prisma.note.findMany({
      where: { 
        userId: req.userId,
        archived: { not: true }
      },
      orderBy: { updatedAt: 'desc' },
      select: { 
        id: true, 
        title: true, 
        updatedAt: true, 
        color: true,
        type: true,
        sticky: true,
        ephemeral: true
      }
    });
    
    setCache(cacheKey, notes);
    res.json(notes);
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: 'Failed to load notes' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
});

// Batch delete notes
app.post('/api/notes/batch-delete', auth, async (req, res) => {
  try {
    const { noteIds } = req.body;
    
    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ error: 'noteIds array required' });
    }
    
    // Verify all notes belong to user before deleting
    const notes = await prisma.note.findMany({
      where: { 
        id: { in: noteIds },
        userId: req.userId 
      },
      select: { id: true }
    });
    
    if (notes.length !== noteIds.length) {
      return res.status(403).json({ error: 'Cannot delete notes you do not own' });
    }
    
    // Delete in transaction
    await prisma.$transaction([
      prisma.link.deleteMany({ 
        where: { 
          OR: [
            { sourceId: { in: noteIds } },
            { targetId: { in: noteIds } }
          ]
        }
      }),
      prisma.annotation.deleteMany({ where: { noteId: { in: noteIds } } }),
      prisma.note.deleteMany({ where: { id: { in: noteIds } } })
    ]);
    
    res.json({ deleted: noteIds.length });
  } catch (error) {
    console.error('Batch delete error:', error);
    res.status(500).json({ error: 'Failed to delete notes' });
  }
});

// Token refresh endpoint
app.post('/api/refresh-token', auth, async (req, res) => {
  try {
    // User already authenticated via middleware
    const newToken = jsonwebtoken.sign(
      { userId: req.userId }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.cookie('token', newToken, { 
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Token refresh failed:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});
// =============================================================================
// GRAPH ENDPOINTS - Folder Navigation Graph
// =============================================================================

/**
 * GET /api/graph
 * Get the user's folder navigation graph
 * Returns the saved graph or initializes a new one with existing folders
 */
app.get('/api/graph', auth, async (req, res) => {
  try {
    // Get all non-archived notes for this user
    const notes = await prisma.note.findMany({
      where: { 
        userId: req.userId,
        archived: { not: true }
      },
      select: { id: true, title: true, createdAt: true, updatedAt: true }
    });

    // Get graph metadata and edges
    let graph = await prisma.graph.findUnique({
      where: { userId: req.userId }
    });

    // Initialize metadata if it doesn't exist
    const metadata = graph?.metadata || {};
    
    // Build nodes from actual notes + metadata
    const nodes = notes.map((note, index) => {
      const meta = metadata[note.id] || {};
      return {
        id: note.id,
        label: note.title,
        x: meta.x ?? Math.cos(index * 0.5) * 200,
        y: meta.y ?? Math.sin(index * 0.5) * 200,
        vx: meta.vx ?? 0,
        vy: meta.vy ?? 0,
        radius: meta.radius ?? 8,
        lastVisited: new Date(note.updatedAt).getTime()
      };
    });

    // Get edges from database, or empty array if no graph exists
    const edges = graph?.edges || [];

    res.json({ nodes, edges });
  } catch (error) {
    console.error('Get graph error:', error);
    res.status(500).json({ error: 'Failed to load graph' });
  }
});

/**
 * POST /api/graph
 * Save the user's folder navigation graph
 * Expects: { nodes: [], edges: [] }
 */
app.post('/api/graph', auth, async (req, res) => {
  try {
    const { nodes, edges } = req.body;

    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return res.status(400).json({ 
        error: 'Invalid input: nodes and edges must be arrays' 
      });
    }

    // Extract only visualization metadata from nodes
    const metadata = {};
    nodes.forEach(node => {
      metadata[node.id] = {
        x: node.x,
        y: node.y,
        vx: node.vx || 0,
        vy: node.vy || 0,
        radius: node.radius || 8
      };
    });

    // Upsert the graph with both metadata AND edges
    const graph = await prisma.graph.upsert({
      where: { userId: req.userId },
      update: {
        metadata,
        edges,
        updatedAt: new Date()
      },
      create: {
        userId: req.userId,
        metadata,
        edges: edges || []
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Save graph error:', error);
    res.status(500).json({ error: 'Failed to save graph' });
  }
});

/**
 * PUT /api/graph/nodes/:nodeId
 * Update a single node in the graph (for updating lastVisited)
 */
app.put('/api/graph/nodes/:nodeId', auth, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const updates = req.body; // e.g., { lastVisited: timestamp }

    const graph = await prisma.graph.findUnique({
      where: { userId: req.userId }
    });

    if (!graph) {
      return res.status(404).json({ error: 'Graph not found' });
    }

    // Update the specific node metadata
    const metadata = graph.metadata || {};
    metadata[nodeId] = {
      ...(metadata[nodeId] || {}),
      ...updates
    };

    const updatedGraph = await prisma.graph.update({
      where: { userId: req.userId },
      data: { metadata }
    });

    res.json({
      success: true,
      node: { id: nodeId, ...metadata[nodeId] }
    });
  } catch (error) {
    console.error('Update node error:', error);
    res.status(500).json({ error: 'Failed to update node' });
  }
});

/**
 * DELETE /api/graph/nodes/:nodeId
 * Remove a node and its edges from the graph
 */
app.delete('/api/graph/nodes/:nodeId', auth, async (req, res) => {
  try {
    const { nodeId } = req.params;

    // Delete the actual note (this will cascade to links, annotations)
    const note = await prisma.note.findUnique({
      where: { id: nodeId },
      select: { userId: true }
    });

    if (!note || note.userId !== req.userId) {
      return res.status(404).json({ error: 'Note not found' });
    }

    await prisma.note.delete({ where: { id: nodeId } });

    // Update graph metadata
    const graph = await prisma.graph.findUnique({
      where: { userId: req.userId }
    });

    if (graph) {
      const metadata = graph.metadata || {};
      delete metadata[nodeId];
      
      const edges = (graph.edges || []).filter(
        edge => edge.source !== nodeId && edge.target !== nodeId
      );

      await prisma.graph.update({
        where: { userId: req.userId },
        data: { metadata, edges }
      });
    }

    res.json({ success: true, deletedNodeId: nodeId });
  } catch (error) {
    console.error('Delete node error:', error);
    res.status(500).json({ error: 'Failed to delete node' });
  }
});

// =============================================================================
// CANVAS ENDPOINTS - Note-based (for Graph View)
// =============================================================================

/**
 * GET /api/canvas/note/:noteId
 * Get canvas data for a specific note
 */
app.get('/api/canvas/note/:noteId', auth, async (req, res) => {
  try {
    const { noteId } = req.params;

    // Verify note belongs to user
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { userId: true, title: true }
    });

    if (!note || note.userId !== req.userId) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Try to get existing canvas
    let canvas = await prisma.canvas.findUnique({
      where: { noteId }
    });

    // If no canvas exists, create an empty one
    if (!canvas) {
      canvas = await prisma.canvas.create({
        data: {
          noteId,
          userId: req.userId,
          nodes: [],
          edges: []
        }
      });
    }

    res.json({
      noteId,
      noteName: note.title,
      nodes: canvas.nodes,
      edges: canvas.edges,
      updatedAt: canvas.updatedAt
    });
  } catch (error) {
    console.error('Get canvas error:', error);
    res.status(500).json({ error: 'Failed to load canvas' });
  }
});

/**
 * POST /api/canvas/note/:noteId
 * Save canvas data for a specific note
 */
app.post('/api/canvas/note/:noteId', auth, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { nodes, edges } = req.body;

    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return res.status(400).json({ 
        error: 'Invalid input: nodes and edges must be arrays' 
      });
    }

    // Verify note belongs to user
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { userId: true }
    });

    if (!note || note.userId !== req.userId) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Find existing canvas
    let canvas = await prisma.canvas.findUnique({
      where: { noteId }
    });

    // Update or create
    if (canvas) {
      canvas = await prisma.canvas.update({
        where: { noteId },
        data: {
          nodes,
          edges,
          updatedAt: new Date()
        }
      });
    } else {
      canvas = await prisma.canvas.create({
        data: {
          noteId,
          userId: req.userId,
          nodes,
          edges
        }
      });
    }

    res.json({
      success: true,
      noteId,
      nodes: canvas.nodes,
      edges: canvas.edges,
      updatedAt: canvas.updatedAt
    });
  } catch (error) {
    console.error('Save canvas error:', error);
    res.status(500).json({ error: 'Failed to save canvas' });
  }
});

/**
 * DELETE /api/canvas/note/:noteId
 * Delete canvas for a note
 */
app.delete('/api/canvas/note/:noteId', auth, async (req, res) => {
  try {
    const { noteId } = req.params;

    const canvas = await prisma.canvas.findUnique({
      where: { noteId },
      include: { note: { select: { userId: true } } }
    });

    if (!canvas || canvas.note.userId !== req.userId) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    // Reset to empty canvas
    await prisma.canvas.update({
      where: { noteId },
      data: {
        nodes: [],
        edges: []
      }
    });

    res.json({ success: true, noteId });
  } catch (error) {
    console.error('Clear canvas error:', error);
    res.status(500).json({ error: 'Failed to clear canvas' });
  }
});

// =============================================================================
// CANVAS ENDPOINTS - Folder Content Canvas
// =============================================================================

/**
 * GET /api/canvas/:folderId
 * Get canvas data for a specific folder
 */
app.get('/api/canvas/:folderId', auth, async (req, res) => {
  try {
    const { folderId } = req.params;

    // Verify folder belongs to user
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { userId: true, name: true }
    });

    if (!folder || folder.userId !== req.userId) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Try to get existing canvas
    let canvas = await prisma.canvas.findUnique({
      where: { folderId }
    });

    // If no canvas exists, create an empty one
    if (!canvas) {
      canvas = await prisma.canvas.create({
        data: {
          folderId,
          userId: req.userId,
          nodes: [],
          edges: []
        }
      });
    }

    res.json({
      folderId,
      folderName: folder.name,
      nodes: canvas.nodes,
      edges: canvas.edges,
      updatedAt: canvas.updatedAt
    });
  } catch (error) {
    console.error('Get canvas error:', error);
    res.status(500).json({ error: 'Failed to load canvas' });
  }
});

/**
 * POST /api/canvas/:folderId
 * Save canvas data for a specific folder
 * Expects: { nodes: [], edges: [] }
 */
app.post('/api/canvas/:folderId', auth, async (req, res) => {
  try {
    const { folderId } = req.params;
    const { nodes, edges } = req.body;

    // Validate input
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return res.status(400).json({ 
        error: 'Invalid input: nodes and edges must be arrays' 
      });
    }

    // Verify folder belongs to user
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { userId: true }
    });

    if (!folder || folder.userId !== req.userId) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Upsert the canvas
    const canvas = await prisma.canvas.upsert({
      where: { folderId },
      update: {
        nodes,
        edges,
        updatedAt: new Date()
      },
      create: {
        folderId,
        userId: req.userId,
        nodes,
        edges
      }
    });

    res.json({
      success: true,
      folderId,
      nodes: canvas.nodes,
      edges: canvas.edges,
      updatedAt: canvas.updatedAt
    });
  } catch (error) {
    console.error('Save canvas error:', error);
    res.status(500).json({ error: 'Failed to save canvas' });
  }
});

/**
 * PUT /api/canvas/:folderId/nodes/:nodeId
 * Update a single node in a canvas
 */
app.put('/api/canvas/:folderId/nodes/:nodeId', auth, async (req, res) => {
  try {
    const { folderId, nodeId } = req.params;
    const updates = req.body;

    const canvas = await prisma.canvas.findUnique({
      where: { folderId },
      include: { folder: { select: { userId: true } } }
    });

    if (!canvas || canvas.folder.userId !== req.userId) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    // Update the specific node
    const nodes = canvas.nodes.map(node => 
      node.id === nodeId ? { ...node, ...updates } : node
    );

    const updatedCanvas = await prisma.canvas.update({
      where: { folderId },
      data: { nodes }
    });

    res.json({
      success: true,
      node: nodes.find(n => n.id === nodeId)
    });
  } catch (error) {
    console.error('Update canvas node error:', error);
    res.status(500).json({ error: 'Failed to update canvas node' });
  }
});

/**
 * DELETE /api/canvas/:folderId/nodes/:nodeId
 * Delete a node from a canvas
 */
app.delete('/api/canvas/:folderId/nodes/:nodeId', auth, async (req, res) => {
  try {
    const { folderId, nodeId } = req.params;

    const canvas = await prisma.canvas.findUnique({
      where: { folderId },
      include: { folder: { select: { userId: true } } }
    });

    if (!canvas || canvas.folder.userId !== req.userId) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    // Remove node and related edges
    const nodes = canvas.nodes.filter(node => node.id !== nodeId);
    const edges = canvas.edges.filter(
      edge => edge.fromNode !== nodeId && edge.toNode !== nodeId
    );

    await prisma.canvas.update({
      where: { folderId },
      data: { nodes, edges }
    });

    res.json({ success: true, deletedNodeId: nodeId });
  } catch (error) {
    console.error('Delete canvas node error:', error);
    res.status(500).json({ error: 'Failed to delete canvas node' });
  }
});

/**
 * DELETE /api/canvas/:folderId
 * Delete entire canvas (resets to empty state)
 */
app.delete('/api/canvas/:folderId', auth, async (req, res) => {
  try {
    const { folderId } = req.params;

    const canvas = await prisma.canvas.findUnique({
      where: { folderId },
      include: { folder: { select: { userId: true } } }
    });

    if (!canvas || canvas.folder.userId !== req.userId) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    // Reset to empty canvas
    await prisma.canvas.update({
      where: { folderId },
      data: {
        nodes: [],
        edges: []
      }
    });

    res.json({ success: true, folderId });
  } catch (error) {
    console.error('Clear canvas error:', error);
    res.status(500).json({ error: 'Failed to clear canvas' });
  }
});

// =============================================================================
// BATCH OPERATIONS - For performance
// =============================================================================

/**
 * POST /api/canvas/:folderId/batch
 * Perform multiple operations on a canvas in one request
 * Expects: { operations: [{type: 'add'|'update'|'delete', nodeId?, data?}, ...] }
 */
app.post('/api/canvas/:folderId/batch', auth, async (req, res) => {
  try {
    const { folderId } = req.params;
    const { operations } = req.body;

    if (!Array.isArray(operations)) {
      return res.status(400).json({ error: 'operations must be an array' });
    }

    const canvas = await prisma.canvas.findUnique({
      where: { folderId },
      include: { folder: { select: { userId: true } } }
    });

    if (!canvas || canvas.folder.userId !== req.userId) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    let nodes = [...canvas.nodes];
    let edges = [...canvas.edges];

    // Process operations
    for (const op of operations) {
      switch (op.type) {
        case 'add':
          if (op.node) nodes.push(op.node);
          if (op.edge) edges.push(op.edge);
          break;
        
        case 'update':
          if (op.nodeId && op.data) {
            nodes = nodes.map(n => 
              n.id === op.nodeId ? { ...n, ...op.data } : n
            );
          }
          if (op.edgeId && op.data) {
            edges = edges.map(e => 
              e.id === op.edgeId ? { ...e, ...op.data } : e
            );
          }
          break;
        
        case 'delete':
          if (op.nodeId) {
            nodes = nodes.filter(n => n.id !== op.nodeId);
            edges = edges.filter(e => 
              e.fromNode !== op.nodeId && e.toNode !== op.nodeId
            );
          }
          if (op.edgeId) {
            edges = edges.filter(e => e.id !== op.edgeId);
          }
          break;
      }
    }

    // Save updated canvas
    const updatedCanvas = await prisma.canvas.update({
      where: { folderId },
      data: { nodes, edges }
    });

    res.json({
      success: true,
      processed: operations.length,
      nodes: updatedCanvas.nodes,
      edges: updatedCanvas.edges
    });
  } catch (error) {
    console.error('Batch canvas operation error:', error);
    res.status(500).json({ error: 'Failed to execute batch operations' });
  }
});

// =============================================================================
// UTILITY ENDPOINTS
// =============================================================================

/**
 * GET /api/canvas/list
 * List all canvases for the user (for migration or debugging)
 */
app.get('/api/canvas/list', auth, async (req, res) => {
  try {
    const canvases = await prisma.canvas.findMany({
      where: { userId: req.userId },
      include: {
        folder: {
          select: { id: true, name: true }
        }
      },
      select: {
        id: true,
        folderId: true,
        folder: true,
        updatedAt: true,
        nodes: false,
        edges: false
      }
    });

    const summary = canvases.map(c => ({
      canvasId: c.id,
      folderId: c.folderId,
      folderName: c.folder.name,
      lastUpdated: c.updatedAt
    }));

    res.json({ canvases: summary, total: canvases.length });
  } catch (error) {
    console.error('List canvases error:', error);
    res.status(500).json({ error: 'Failed to list canvases' });
  }
});

app.get('/api/graph/debug', auth, async (req, res) => {
  const graph = await prisma.graph.findUnique({
    where: { userId: req.userId }
  });
  res.json({
    metadata: graph?.metadata || {},
    edges: graph?.edges || [],
    edgeCount: (graph?.edges || []).length
  });
});