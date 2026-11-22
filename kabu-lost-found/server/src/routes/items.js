
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';
import { notifyMatches } from '../services/matching.js';

const router = Router();

const publicSelect = {
  id: true,
  type: true,
  title: true,
  category: true,
  description: true,
  secretQuestion: true,
  imageUrl: true,
  location: true,
  customLocation: true,
  eventAt: true,
  custody: true,
  status: true,
  createdAt: true,
  user: {
    select: {
      username: true
    }
  }
};

// Convert empty query parameters into undefined before validation.
const emptyToUndefined = (value) =>
  value === '' ? undefined : value;

// Listing statistics
router.get('/stats', async (_req, res) => {
  try {
    const visible = { status: { not: 'REMOVED' } };

    const [active, returned, found, lost] = await Promise.all([
      prisma.item.count({
        where: {
          ...visible,
          status: { in: ['UNCLAIMED', 'CLAIM_PENDING'] }
        }
      }),
      prisma.item.count({
        where: { status: 'RESOLVED' }
      }),
      prisma.item.count({
        where: { ...visible, type: 'FOUND' }
      }),
      prisma.item.count({
        where: { ...visible, type: 'LOST' }
      })
    ]);

    res.json({ active, returned, found, lost });
  } catch (error) {
    console.error('Listing statistics error:', error);
    res.status(500).json({
      error: 'Could not load listing statistics.'
    });
  }
});

// Get public listings with filters
router.get('/', async (req, res) => {
  try {
    const filters = z.object({
      type: z.preprocess(
        emptyToUndefined,
        z.enum(['FOUND', 'LOST']).optional()
      ),
      category: z.preprocess(
        emptyToUndefined,
        z.string().max(50).optional()
      ),
      location: z.preprocess(
        emptyToUndefined,
        z.string().max(100).optional()
      ),
      status: z.preprocess(
        emptyToUndefined,
        z.enum(['UNCLAIMED', 'CLAIM_PENDING', 'RESOLVED']).optional()
      ),
      q: z.preprocess(
        emptyToUndefined,
        z.string().max(100).optional()
      )
    }).parse(req.query);

    const { type, category, location, status, q } = filters;

    const items = await prisma.item.findMany({
      where: {
        status: status || { not: 'REMOVED' },
        ...(type ? { type } : {}),
        ...(category ? { category } : {}),
        ...(location ? { location } : {}),
        ...(q
          ? {
              OR: [
                {
                  title: {
                    contains: q,
                    mode: 'insensitive'
                  }
                },
                {
                  description: {
                    contains: q,
                    mode: 'insensitive'
                  }
                }
              ]
            }
          : {})
      },
      select: publicSelect,
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json(items);
  } catch (error) {
    console.error('Get listings error:', error);

    res.status(error instanceof z.ZodError ? 400 : 500).json({
      error: error instanceof z.ZodError
        ? 'Invalid listing filters.'
        : 'Could not load listings.'
    });
  }
});

// Create a new listing
router.post('/', auth, async (req, res) => {
  try {
    const data = z.object({
      type: z.enum(['FOUND', 'LOST']),
      title: z.string().trim().min(3).max(100),
      category: z.string().trim().min(2).max(50),
      description: z.string().trim().min(10).max(2000),
      secretQuestion: z.string().trim().max(300).optional(),
      imageUrl: z.string().url().optional().or(z.literal('')),
      location: z.string().trim().min(2).max(100),
      customLocation: z.string().trim().max(150).optional(),
      eventAt: z.string().datetime(),
      custody: z.string().trim().max(150).optional()
    }).parse(req.body);

    const item = await prisma.item.create({
      data: {
        ...data,
        imageUrl: data.imageUrl || null,
        userId: req.user.id
      },
      select: publicSelect
    });

    // Matching is best-effort; listing creation should not fail
    // if email delivery is unavailable.
    notifyMatches(item).catch(error =>
      console.error('Match notification error:', error)
    );

    res.status(201).json(item);
  } catch (error) {
    console.error('Create listing error:', error);

    res.status(error instanceof z.ZodError ? 400 : 500).json({
      error: error instanceof z.ZodError
        ? error.issues[0]?.message
        : 'Could not create listing.'
    });
  }
});

// Get listings belonging to the signed-in user
router.get('/mine', auth, async (req, res) => {
  try {
    const items = await prisma.item.findMany({
      where: { userId: req.user.id },
      select: publicSelect,
      orderBy: { createdAt: 'desc' }
    });

    res.json(items);
  } catch (error) {
    console.error('My listings error:', error);

    res.status(500).json({
      error: 'Could not load your listings.'
    });
  }
});

// Update listing status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = z.object({
      status: z.enum(['UNCLAIMED', 'RESOLVED'])
    }).parse(req.body);

    const item = await prisma.item.findUnique({
      where: { id: req.params.id }
    });

    if (!item || item.status === 'REMOVED') {
      return res.status(404).json({
        error: 'Listing not found.'
      });
    }

    if (
      item.userId !== req.user.id &&
      !['ADMIN', 'MODERATOR'].includes(req.user.role)
    ) {
      return res.status(403).json({
        error: 'Not permitted.'
      });
    }

    if (item.status === 'CLAIM_PENDING' && status === 'UNCLAIMED') {
      return res.status(409).json({
        error: 'Resolve or reject the pending claim before reopening this listing.'
      });
    }

    const updated = await prisma.item.update({
      where: { id: item.id },
      data: { status },
      select: publicSelect
    });

    res.json(updated);
  } catch (error) {
    console.error('Update listing status error:', error);

    res.status(error instanceof z.ZodError ? 400 : 500).json({
      error: error instanceof z.ZodError
        ? error.issues[0]?.message
        : 'Could not update listing.'
    });
  }
});

export default router;
