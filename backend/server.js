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
const nodemailer = require('nodemailer');

const app = express();
const prisma = new PrismaClient();

app.use(cors({ 
  origin: process.env.FRONTEND_URL, 
  credentials: true 
}));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

let extractor;
(async () => {
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
})();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.BACKEND_URL}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
  let user = await prisma.user.upsert({
    where: { email: profile.emails[0].value },
    update: { name: profile.displayName },
    create: { email: profile.emails[0].value, name: profile.displayName }
  });
  
  // Create starter notes for new users
  const noteCount = await prisma.note.count({ where: { userId: user.id } });
  if (noteCount === 0) {
    const starterNotes = [
      { title: 'Welcome to Messy Notes', rawText: 'Click anywhere on the mindmap to create new notes. Your thoughts will connect automatically as you write.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click anywhere on the mindmap to create new notes. Your thoughts will connect automatically as you write.' }] }] }, x: 100, y: 100, color: '#FEF3C7' },
      { title: 'Quick Tips', rawText: 'Use Ctrl+K for quick capture, highlight text to link notes, and explore Focus Mode to see connections clearly.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use Ctrl+K for quick capture, highlight text to link notes, and explore Focus Mode to see connections clearly.' }] }] }, x: 400, y: 150, color: '#DBEAFE' },
      { title: 'Your First Idea', rawText: 'Start typing your thoughts here. Messy Notes will help you connect them.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start typing your thoughts here. Messy Notes will help you connect them.' }] }] }, x: 250, y: 300, color: '#E0E7FF' }
    ];
    for (const note of starterNotes) {
      await prisma.note.create({ data: { ...note, userId: user.id } });
    }
  }
  
  done(null, user);
}));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
  const token = jsonwebtoken.sign({ userId: req.user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { 
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.redirect(process.env.FRONTEND_URL);
});

const auth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.get('/api/me', auth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  res.json(user);
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
      y: Math.random() * 500
    }
  });
  res.json(note);
});

app.post('/api/notes', auth, async (req, res) => {
  const note = await prisma.note.create({
    data: {
      userId: req.userId,
      x: req.body.x || Math.random() * 500,
      y: req.body.y || Math.random() * 500,
      folderId: req.body.folderId,
      type: req.body.type || 'text',
      color: req.body.color || '#FFFFFF'
    }
  });
  res.json(note);
});

app.put('/api/notes/:id', auth, async (req, res) => {
  const { content, plainText, title, messyMode, x, y, color } = req.body;
  let data = {};
  
  if (content !== undefined) data.content = content;
  if (plainText !== undefined) data.rawText = plainText;
  if (title !== undefined) data.title = title;
  if (x !== undefined) data.x = x;
  if (y !== undefined) data.y = y;
  if (color !== undefined) data.color = color;
  
  if (plainText && plainText.trim()) {
    const output = await extractor(plainText, { pooling: 'mean', normalize: true });
    const embeddingArray = Array.from(output.data);
    
    // Update embedding using raw SQL since it's Unsupported type
    await prisma.$executeRaw`
      UPDATE "Note" 
      SET embedding = ${embeddingArray}::vector 
      WHERE id = ${req.params.id}
    `;
  }
  
  const note = await prisma.note.update({
    where: { id: req.params.id },
    data
  });
  
  if (messyMode && plainText) {
    const allNotes = await prisma.note.findMany({ 
      where: { userId: req.userId, id: { not: note.id } }, 
      select: { id: true, title: true, rawText: true } 
    });
    
    const plainTextLower = plainText.toLowerCase();
    for (const otherNote of allNotes) {
      const titleLower = otherNote.title.toLowerCase();
      const rawTextLower = (otherNote.rawText || '').toLowerCase();
      
      if (plainTextLower.includes(titleLower) || rawTextLower.includes(note.title.toLowerCase())) {
        const existingLink = await prisma.link.findUnique({
          where: { sourceId_targetId: { sourceId: note.id, targetId: otherNote.id } }
        });
        
        if (existingLink) {
          await prisma.link.update({
            where: { id: existingLink.id },
            data: { strength: { increment: 0.3 } }
          });
        } else {
          await prisma.link.create({
            data: { 
              sourceId: note.id, 
              targetId: otherNote.id, 
              reason: `Both mention "${titleLower}"`,
              strength: 1.0 
            }
          });
        }
      }
    }
  }
  
  res.json(note);
});

app.delete('/api/notes/:id', auth, async (req, res) => {
  await prisma.link.deleteMany({ where: { OR: [{ sourceId: req.params.id }, { targetId: req.params.id }] } });
  await prisma.annotation.deleteMany({ where: { noteId: req.params.id } });
  await prisma.note.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

app.post('/api/linker', auth, async (req, res) => {
  const { text, noteId } = req.body;
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  const vector = Array.from(output.data);
  
  // Cast distance calculation but don't select the embedding column
  const suggestions = await prisma.$queryRaw`
    SELECT id, title, "rawText", (embedding <-> ${vector}::vector) as distance
    FROM "Note"
    WHERE "userId" = ${req.userId} AND id != ${noteId} AND embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT 5`;
  
  const results = suggestions.map(s => ({
    id: s.id,
    title: s.title,
    reason: `Similar content about "${text.slice(0, 30)}..."`,
    distance: parseFloat(s.distance)
  }));
  
  res.json({ suggestions: results });
});

app.get('/api/home', auth, async (req, res) => {
  const folders = await prisma.folder.findMany({
    where: { userId: req.userId, parentId: null },
    include: { _count: { select: { notes: true } } }
  });
  const recentNotes = await prisma.note.findMany({
    where: { userId: req.userId },
    orderBy: { updatedAt: 'desc' },
    take: 8,
    select: { id: true, title: true, updatedAt: true, color: true, type: true }
  });
  const totalNotes = await prisma.note.count({ where: { userId: req.userId } });
  const totalLinks = await prisma.link.count({ 
    where: { source: { userId: req.userId } } 
  });
  
  res.json({ folders, recentNotes, stats: { totalNotes, totalLinks } });
});

app.post('/api/folders', auth, async (req, res) => {
  const folder = await prisma.folder.create({
    data: {
      name: req.body.name || 'New Folder',
      userId: req.userId,
      parentId: req.body.parentId
    },
    include: { _count: { select: { notes: true } } }
  });
  res.json(folder);
});

app.put('/api/folders/:id', auth, async (req, res) => {
  const folder = await prisma.folder.update({
    where: { id: req.params.id },
    data: { name: req.body.name }
  });
  res.json(folder);
});

app.delete('/api/folders/:id', auth, async (req, res) => {
  await prisma.note.updateMany({
    where: { folderId: req.params.id },
    data: { folderId: null }
  });
  await prisma.folder.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

app.get('/api/mindmap', auth, async (req, res) => {
  const { folderId } = req.query;
  const where = { userId: req.userId };
  if (folderId && folderId !== 'undefined') where.folderId = folderId;
  
  const notes = await prisma.note.findMany({
    where,
    select: { 
      id: true, title: true, x: true, y: true, color: true, 
      type: true, fileUrl: true, createdAt: true, updatedAt: true,
      rawText: true
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
});

app.get('/api/search', auth, async (req, res) => {
  const { query } = req.query;
  const output = await extractor(query, { pooling: 'mean', normalize: true });
  const vector = Array.from(output.data);
  
  // Don't select the embedding column, just use it for distance calculation
  const results = await prisma.$queryRaw`
    SELECT id, title, "rawText", (embedding <-> ${vector}::vector) as distance
    FROM "Note"
    WHERE "userId" = ${req.userId} AND embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT 10`;
  
  res.json(results.map(r => ({
    ...r,
    distance: parseFloat(r.distance)
  })));
});

app.post('/api/cluster', auth, async (req, res) => {
  // Get embeddings as text representation, then parse
  const notes = await prisma.$queryRaw`
    SELECT id, title, embedding::text as embedding_text
    FROM "Note"
    WHERE "userId" = ${req.userId} AND embedding IS NOT NULL
  `;
  
  if (notes.length < 3) {
    return res.json({ message: 'Not enough notes to cluster', clusters: [] });
  }
  
  // Parse PostgreSQL vector format: [1,2,3,...] to JavaScript array
  const embeddings = notes.map(n => {
    // Remove brackets and split by comma
    const vectorStr = n.embedding_text.replace(/[\[\]]/g, '');
    return vectorStr.split(',').map(parseFloat);
  });
  
  const numClusters = Math.min(5, Math.floor(embeddings.length / 2));
  const result = kmeans(embeddings, numClusters, { initialization: 'kmeans++' });
  
  const clusters = {};
  result.clusters.forEach((clusterIdx, i) => {
    if (!clusters[clusterIdx]) clusters[clusterIdx] = [];
    clusters[clusterIdx].push({
      id: notes[i].id,
      title: notes[i].title
    });
  });
  
  const clusterData = Object.entries(clusters).map(([idx, noteList]) => ({
    id: idx,
    name: `Cluster ${parseInt(idx) + 1}`,
    notes: noteList,
    color: ['#FEE2E2', '#DBEAFE', '#E0E7FF', '#FCE7F3', '#FEF3C7'][parseInt(idx) % 5]
  }));
  
  res.json({ clusters: clusterData });
});

app.get('/api/rediscover', auth, async (req, res) => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const orphans = await prisma.note.findMany({
    where: { 
      userId: req.userId, 
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
      source: { userId: req.userId },
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
});

app.post('/api/rediscover/email', auth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const data = await prisma.note.findMany({
    where: { 
      userId: req.userId,
      AND: [
        { incoming: { none: {} } },
        { outgoing: { none: {} } }
      ]
    },
    take: 5
  });
  
  if (process.env.NODEMAILER_USER && process.env.NODEMAILER_PASS) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.NODEMAILER_USER, pass: process.env.NODEMAILER_PASS }
    });
    
    await transporter.sendMail({
      from: process.env.NODEMAILER_USER,
      to: user.email,
      subject: 'Forgotten Notes from Messy Notes',
      html: `
        <h2>Notes you haven't connected yet:</h2>
        <ul>
          ${data.map(n => `<li><strong>${n.title}</strong></li>`).join('')}
        </ul>
        <p>Visit Messy Notes to reconnect your thoughts!</p>
      `
    });
  }
  
  res.json({ success: true });
});

app.get('/api/notes/:id', auth, async (req, res) => {
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
});

app.post('/api/notes/:id/annotations', auth, async (req, res) => {
  const ann = await prisma.annotation.create({
    data: { 
      noteId: req.params.id, 
      text: req.body.text, 
      comment: req.body.comment 
    }
  });
  res.json(ann);
});

app.put('/api/annotations/:id', auth, async (req, res) => {
  const ann = await prisma.annotation.update({
    where: { id: req.params.id },
    data: { comment: req.body.comment }
  });
  res.json(ann);
});

app.delete('/api/annotations/:id', auth, async (req, res) => {
  await prisma.annotation.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

app.post('/api/links', auth, async (req, res) => {
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
});

app.delete('/api/links/:id', auth, async (req, res) => {
  await prisma.link.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));