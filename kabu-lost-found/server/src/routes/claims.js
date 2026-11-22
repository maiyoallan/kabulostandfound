import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();

router.get('/mine', auth, async (req, res) => {
  try {
    const claims = await prisma.claim.findMany({
      where: { OR: [{ claimantId: req.user.id }, { ownerId: req.user.id }] },
      include: {
        item: { select: { id: true, title: true, imageUrl: true, status: true } },
        claimant: { select: { username: true } },
        owner: { select: { username: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(claims.map(claim => ({
      ...claim,
      // Only the finder/owner can see the claimant's private ownership explanation.
      verificationAnswer: claim.ownerId === req.user.id ? claim.verificationAnswer : undefined
    })));
  } catch {
    res.status(500).json({ error: 'Could not load claims.' });
  }
});

router.get('/:id/messages', auth, async (req, res) => {
  try {
    const claim = await prisma.claim.findFirst({
      where: {
        id: req.params.id,
        status: 'ACCEPTED',
        OR: [{ ownerId: req.user.id }, { claimantId: req.user.id }]
      }
    });
    if (!claim) return res.status(404).json({ error: 'Conversation not found.' });

    const messages = await prisma.message.findMany({
      where: { claimId: claim.id },
      include: { sender: { select: { username: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200
    });
    res.json(messages.map(message => ({
      id: message.id,
      body: message.body,
      sender: `@${message.sender.username}`,
      createdAt: message.createdAt
    })));
  } catch {
    res.status(500).json({ error: 'Could not load conversation.' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { itemId, verificationAnswer, message } = z.object({
      itemId: z.string().min(1),
      verificationAnswer: z.string().trim().min(3).max(1000),
      message: z.string().trim().max(500).optional()
    }).parse(req.body);

    const result = await prisma.$transaction(async tx => {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item || item.type !== 'FOUND' || item.status !== 'UNCLAIMED' || item.userId === req.user.id) {
        return { error: 'This listing cannot currently be claimed.' };
      }

      // Atomically reserve the item for one pending claim. Concurrent claims cannot both win.
      const reserved = await tx.item.updateMany({
        where: { id: itemId, status: 'UNCLAIMED' },
        data: { status: 'CLAIM_PENDING' }
      });
      if (reserved.count !== 1) return { error: 'Another claim is already being reviewed for this item.' };

      const claim = await tx.claim.create({
        data: {
          itemId,
          claimantId: req.user.id,
          ownerId: item.userId,
          verificationAnswer,
          message: message || null
        },
        select: {
          id: true, status: true,
          item: { select: { title: true } },
          claimant: { select: { username: true } },
          owner: { select: { username: true } }
        }
      });

      await tx.notification.create({
        data: {
          userId: item.userId,
          type: 'CLAIM',
          title: 'New ownership claim',
          body: `@${req.user.username} has submitted a claim for “${item.title}”.`,
          itemId
        }
      });
      return { claim };
    });

    if (result.error) return res.status(409).json({ error: result.error });
    return res.status(201).json(result.claim);
  } catch (error) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'You have already submitted a claim for this item.' });
    return res.status(error instanceof z.ZodError ? 400 : 500).json({
      error: error instanceof z.ZodError ? error.issues[0]?.message : 'Could not submit claim.'
    });
  }
});

router.patch('/:id/decision', auth, async (req, res) => {
  try {
    const { decision } = z.object({ decision: z.enum(['ACCEPTED', 'REJECTED']) }).parse(req.body);
    const result = await prisma.$transaction(async tx => {
      const claim = await tx.claim.findUnique({ where: { id: req.params.id } });
      if (!claim || claim.ownerId !== req.user.id) return { error: 'Claim not found.' };
      if (claim.status !== 'PENDING') return { error: 'This claim has already been decided.' };

      const updated = await tx.claim.update({
        where: { id: claim.id },
        data: { status: decision },
        include: { item: { select: { id: true, title: true } } }
      });

      if (decision === 'ACCEPTED') {
        await tx.claim.updateMany({
          where: { itemId: claim.itemId, id: { not: claim.id }, status: 'PENDING' },
          data: { status: 'REJECTED' }
        });
        await tx.chatSession.upsert({
          where: { claimId: claim.id },
          create: { claimId: claim.id, users: { connect: [{ id: claim.ownerId }, { id: claim.claimantId }] } },
          update: {}
        });
      } else {
        const remaining = await tx.claim.count({ where: { itemId: claim.itemId, status: 'PENDING' } });
        if (remaining === 0) {
          await tx.item.updateMany({
            where: { id: claim.itemId, status: 'CLAIM_PENDING' },
            data: { status: 'UNCLAIMED' }
          });
        }
      }

      await tx.notification.create({
        data: {
          userId: claim.claimantId,
          type: 'CLAIM',
          title: `Claim ${decision.toLowerCase()}`,
          body: `Your claim for “${updated.item.title}” was ${decision.toLowerCase()}.`,
          itemId: claim.itemId
        }
      });
      return { id: updated.id, status: updated.status };
    });

    if (result.error) return res.status(404).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    return res.status(error instanceof z.ZodError ? 400 : 500).json({
      error: error instanceof z.ZodError ? error.issues[0]?.message : 'Could not update claim.'
    });
  }
});

export default router;
