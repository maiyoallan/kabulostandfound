import express from 'express';
import http from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { config } from './config.js';
import { prisma } from './db.js';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import claimRoutes from './routes/claims.js';
import notificationRoutes from './routes/notifications.js';
import uploadRoutes from './routes/upload.js';
import adminRoutes from './routes/admin.js';
import reportRoutes from './routes/reports.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.clientOrigin, methods: ['GET', 'POST'] }
});

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.clientOrigin, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'kabu-lost-found-api' });
});
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 15 }), authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, emailVerifiedAt: true }
    });
    if (!user?.emailVerifiedAt) return next(new Error('Invalid or unverified account'));
    socket.user = user;
    next();
  } catch {
    next(new Error('Invalid session'));
  }
});

io.on('connection', socket => {
  let lastMessageAt = 0;

  socket.on('join-claim', async claimId => {
    if (typeof claimId !== 'string' || claimId.length > 64) return;
    const claim = await prisma.claim.findFirst({
      where: {
        id: claimId,
        status: 'ACCEPTED',
        OR: [{ ownerId: socket.user.id }, { claimantId: socket.user.id }]
      },
      select: { id: true }
    });
    if (claim) socket.join(`claim:${claim.id}`);
  });

  socket.on('send-message', async payload => {
    try {
      const now = Date.now();
      if (now - lastMessageAt < 700) return;
      if (!payload || typeof payload.claimId !== 'string' || typeof payload.body !== 'string') return;
      const body = payload.body.trim();
      if (!body || body.length > 1500) return;

      const claim = await prisma.claim.findFirst({
        where: {
          id: payload.claimId,
          status: 'ACCEPTED',
          OR: [{ ownerId: socket.user.id }, { claimantId: socket.user.id }]
        },
        select: { id: true }
      });
      if (!claim) return;

      lastMessageAt = now;
      const message = await prisma.message.create({
        data: { claimId: claim.id, senderId: socket.user.id, body }
      });
      io.to(`claim:${claim.id}`).emit('new-message', {
        id: message.id,
        claimId: claim.id,
        body: message.body,
        sender: `@${socket.user.username}`,
        createdAt: message.createdAt
      });
    } catch (error) {
      console.error('Socket message error:', error);
    }
  });
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`KABU Lost & Found API listening on ${config.port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
