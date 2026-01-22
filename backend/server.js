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

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
app.use(cookieParser());

let extractor;
(async () => {
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
})();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  let user = await prisma.user.upsert({
    where: { email: profile.emails[0].value },
    update: {},
    create: { email: profile.emails[0].value, name: profile.displayName }
  });
  done(null, user);
}));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
  const token = jsonwebtoken.sign({ userId: req.user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.cookie('token', token, { httpOnly: true });
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
      type: req.body.type || 'text'
    }
  });
  res.json(note);
});

app.put('/api/notes/:id', auth, async (req, res) => {
  const { content, plainText, title, messyMode } = req.body;
  let data = { content, rawText: plainText, title };
  if (plainText) {
    const output = await extractor(plainText, { pooling: 'mean', normalize: true });
    data.embedding = Array.from(output.data);
  }
  const note = await prisma.note.update({
    where: { id: req.params.id },
    data
  });
  if (messyMode) {
    const allNotes = await prisma.note.findMany({ where: { userId: req.userId }, select: { id: true, title: true, rawText: true } });
    const mentions = allNotes.filter(n => plainText.includes(n.title) && n.id !== note.id);
    for (const mention of mentions) {
      await prisma.link.upsert({
        where: { sourceId_targetId: { sourceId: note.id, targetId: mention.id } },
        update: { strength: { increment: 0.5 } },
        create: { sourceId: note.id, targetId: mention.id, reason: 'Auto-detected mention', strength: 1.0 }
      });
    }
  }
  res.json(note);
});

app.post('/api/linker', auth, async (req, res) => {
  const { text, noteId } = req.body;
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  const vector = Array.from(output.data);
  const suggestions = await prisma.$queryRaw`
    SELECT id, title, (embedding <-> ${vector}::vector) as distance
    FROM "Note"
    WHERE "userId" = ${req.userId} AND id != ${noteId}
    ORDER BY distance ASC
    LIMIT 3`;
  res.json({ suggestions });
});

app.get('/api/home', auth, async (req, res) => {
  const folders = await prisma.folder.findMany({
    where: { userId: req.userId, parentId: null },
    include: { _count: { select: { notes: true } } }
  });
  const recentNotes = await prisma.note.findMany({
    where: { userId: req.userId },
    orderBy: { updatedAt: 'desc' },
    take: 5
  });
  res.json({ folders, recentNotes });
});

app.get('/api/mindmap', auth, async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.userId },
    select: { id: true, title: true, x: true, y: true, color: true, type: true, fileUrl: true, createdAt: true }
  });
  const links = await prisma.link.findMany({
    where: { source: { userId: req.userId } },
    select: { id: true, sourceId: true, targetId: true, strength: true, reason: true }
  });
  res.json({ nodes: notes, edges: links });
});

app.get('/api/search', auth, async (req, res) => {
  const { query } = req.query;
  const output = await extractor(query, { pooling: 'mean', normalize: true });
  const vector = Array.from(output.data);
  const results = await prisma.$queryRaw`
    SELECT id, title, (embedding <-> ${vector}::vector) as distance
    FROM "Note"
    WHERE "userId" = ${req.userId}
    ORDER BY distance ASC
    LIMIT 10`;
  res.json(results);
});

app.post('/api/cluster', auth, async (req, res) => {
  const notes = await prisma.note.findMany({ where: { userId: req.userId }, select: { id: true, embedding: true } });
  const embeddings = notes.map(n => n.embedding).filter(e => e);
  if (embeddings.length < 2) return res.json({ message: 'Not enough notes' });
  const result = kmeans(embeddings, 5, { initialization: 'kmeans++' });
  const clusters = {};
  result.clusters.forEach((clusterIdx, i) => {
    const noteId = notes[i].id;
    if (!clusters[clusterIdx]) clusters[clusterIdx] = [];
    clusters[clusterIdx].push(noteId);
  });
  let clusterId = 0;
  for (const noteIds of Object.values(clusters)) {
    const name = `Cluster ${++clusterId}`;
    const cluster = await prisma.cluster.upsert({
      where: { name_userId: { name, userId: req.userId } },
      update: {},
      create: { name, userId: req.userId }
    });
    await prisma.note.updateMany({
      where: { id: { in: noteIds }, userId: req.userId },
      data: { clusters: { connect: { id: cluster.id } } }
    });
  }
  res.json({ message: 'Clustered' });
});

app.get('/api/rediscover', auth, async (req, res) => {
  const orphans = await prisma.note.findMany({
    where: { userId: req.userId, incoming: { none: {} }, outgoing: { none: {} } },
    take: 5
  });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.NODEMAILER_USER, pass: process.env.NODEMAILER_PASS }
  });
  transporter.sendMail({
    from: process.env.NODEMAILER_USER,
    to: user.email,
    subject: 'Forgotten Notes in Messy Notes',
    text: 'Here are some orphaned notes:\n' + orphans.map(n => n.title).join('\n')
  }).catch(console.error);
  res.json(orphans);
});

app.get('/api/notes/:id', auth, async (req, res) => {
  const note = await prisma.note.findUnique({
    where: { id: req.params.id, userId: req.userId },
    include: { annotations: true }
  });
  res.json(note);
});

app.post('/api/notes/:id/annotations', auth, async (req, res) => {
  const ann = await prisma.annotation.create({
    data: { noteId: req.params.id, text: req.body.text, comment: req.body.comment }
  });
  res.json(ann);
});

app.post('/api/links', auth, async (req, res) => {
  const link = await prisma.link.create({
    data: { sourceId: req.body.sourceId, targetId: req.body.targetId, strength: 1.0, reason: 'Manual link' }
  });
  res.json(link);
});

app.listen(process.env.PORT, () => console.log(`Server on ${process.env.PORT}`));