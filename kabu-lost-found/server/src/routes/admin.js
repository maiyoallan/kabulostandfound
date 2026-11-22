
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, roles } from '../middleware/auth.js';

const r = Router();

r.use(auth, roles('ADMIN', 'MODERATOR'));

// Dashboard summary
r.get('/summary', async (req, res) => {
  try {
    const [users, found, lost, returned, openReports] = await Promise.all([
      prisma.user.count(),
      prisma.item.count({ where: { type: 'FOUND' } }),
      prisma.item.count({ where: { type: 'LOST' } }),
      prisma.item.count({ where: { status: 'RESOLVED' } }),
      prisma.report.count({ where: { status: 'OPEN' } })
    ]);

    res.json({ users, found, lost, returned, openReports });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// View open reports
r.get('/reports', async (req, res) => {
  try {
    const reports = await prisma.report.findMany({
      where: { status: 'OPEN' },
      include: {
        item: { select: { id: true, title: true } },
        reporter: { select: { username: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Submit a report
r.post('/reports', async (req, res) => {
  try {
    const d = z.object({
      itemId: z.string(),
      reason: z.string().min(5).max(500)
    }).parse(req.body);

    const report = await prisma.report.create({
      data: {
        ...d,
        reporterId: req.user.id
      }
    });

    res.status(201).json({ id: report.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Update report status
r.patch('/reports/:id', roles('ADMIN', 'MODERATOR'), async (req, res) => {
  try {
    const status = z.enum(['REVIEWED', 'DISMISSED']).parse(req.body.status);

    const result = await prisma.report.update({
      where: { id: req.params.id },
      data: { status }
    });

    res.json({
      id: result.id,
      status: result.status
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Approve a student's email address (ADMIN only)
r.post('/approved-emails', roles('ADMIN'), async (req, res) => {
  try {
    const email = z.string()
      .email()
      .transform(v => v.trim().toLowerCase())
      .parse(req.body.email);

    const result = await prisma.approvedEmail.upsert({
      where: { email },
      update: {},
      create: {
        email,
        approvedById: req.user.id
      }
    });

    res.status(201).json({
      email: result.email,
      message: 'Email address approved successfully.'
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default r;
