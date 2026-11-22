import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { sendOtp } from '../services/email.js';

const router = Router();
const emailSchema = z.string().trim().email().transform(value => value.toLowerCase());
const allowedDomain = email =>
  email.endsWith('@kabarak.ac.ke') || email.endsWith('@kabarak.co.ke');
const createToken = user => jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '12h' });
const publicUser = user => ({ username: user.username, role: user.role });

router.post('/register', async (req, res) => {
  try {
    const data = z.object({
      email: emailSchema,
      username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
      password: z.string().min(10).max(72)
    }).parse(req.body);

    const approved = allowedDomain(data.email) || Boolean(
      await prisma.approvedEmail.findUnique({ where: { email: data.email } })
    );
    if (!approved) {
      return res.status(403).json({
        error: 'Use a Kabarak email or an administrator-approved student email address.'
      });
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: data.email },
          { username: { equals: data.username, mode: 'insensitive' } }
        ]
      }
    });
    if (existing) return res.status(409).json({ error: 'Email or username is already registered.' });

    const passwordHash = await bcrypt.hash(data.password, 12);
    await prisma.user.create({
      data: { email: data.email, username: data.username, passwordHash }
    });

    const code = String(crypto.randomInt(100000, 1000000));
    await prisma.$transaction([
      prisma.emailOtp.deleteMany({ where: { email: data.email } }),
      prisma.emailOtp.create({
        data: {
          email: data.email,
          codeHash: await bcrypt.hash(code, 10),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      })
    ]);

    // If delivery fails, the account remains unverified and can request another code.
    try {
      await sendOtp(data.email, code);
      return res.status(201).json({ message: 'Account created. Enter the verification code sent to your email.' });
    } catch (deliveryError) {
      console.error('Initial verification email delivery failed:', deliveryError);
      // The account and hashed OTP exist; the verify screen exposes the resend action.
      return res.status(202).json({ message: 'Account created, but the email could not be delivered. Use Resend code to try again.' });
    }
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(error instanceof z.ZodError ? 400 : 500).json({
      error: error instanceof z.ZodError ? error.issues[0]?.message : 'Registration could not be completed. You can request a new verification code if the account was created.'
    });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { email, code } = z.object({
      email: emailSchema,
      code: z.string().regex(/^\d{6}$/)
    }).parse(req.body);

    const otp = await prisma.emailOtp.findFirst({
      where: { email }, orderBy: { createdAt: 'desc' }
    });
    if (!otp || otp.expiresAt <= new Date() || otp.attempts >= 5) {
      return res.status(400).json({ error: 'Code expired or unavailable. Request a new code.' });
    }
    if (!await bcrypt.compare(code, otp.codeHash)) {
      await prisma.emailOtp.update({
        where: { id: otp.id }, data: { attempts: { increment: 1 } }
      });
      return res.status(400).json({ error: 'Incorrect verification code.' });
    }

    const bootstrapAdmins = (process.env.BOOTSTRAP_ADMIN_EMAILS || '')
      .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    const user = await prisma.user.update({
      where: { email },
      data: {
        emailVerifiedAt: new Date(),
        ...(bootstrapAdmins.includes(email) ? { role: 'ADMIN' } : {})
      }
    });
    await prisma.emailOtp.deleteMany({ where: { email } });

    return res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    return res.status(error instanceof z.ZodError ? 400 : 500).json({
      error: error instanceof z.ZodError ? error.issues[0]?.message : 'Email verification failed.'
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = z.object({ email: emailSchema, password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!user.emailVerifiedAt) {
      return res.status(403).json({ error: 'Verify your email before signing in.' });
    }
    return res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    return res.status(error instanceof z.ZodError ? 400 : 500).json({
      error: error instanceof z.ZodError ? error.issues[0]?.message : 'Sign in could not be completed.'
    });
  }
});

router.post('/resend', async (req, res) => {
  try {
    const email = emailSchema.parse(req.body.email);
    const user = await prisma.user.findUnique({ where: { email } });
    // Avoid revealing whether an address has an account or is already verified.
    if (!user || user.emailVerifiedAt) {
      return res.json({ message: 'If the account needs verification, a new code has been sent.' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await prisma.$transaction([
      prisma.emailOtp.deleteMany({ where: { email } }),
      prisma.emailOtp.create({
        data: {
          email,
          codeHash: await bcrypt.hash(code, 10),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      })
    ]);
    await sendOtp(email, code);
    return res.json({ message: 'A new verification code has been sent.' });
  } catch (error) {
    console.error('Resend verification error:', error);
    return res.status(error instanceof z.ZodError ? 400 : 502).json({
      error: error instanceof z.ZodError ? error.issues[0]?.message : 'Could not send a verification email. Check the email provider configuration.'
    });
  }
});


router.post('/forgot-password', async (req, res) => {
  try {
    const email = emailSchema.parse(req.body.email);

    const user = await prisma.user.findUnique({
      where: { email }
    });

    // Always return the same response to avoid revealing registered emails.
    const message = 'If an account exists for this email, a password-reset code will be sent.';

    if (!user) {
      return res.json({ message });
    }

    const code = String(crypto.randomInt(100000, 1000000));

    await prisma.$transaction([
      prisma.passwordResetOtp.deleteMany({ where: { email } }),
      prisma.passwordResetOtp.create({
        data: {
          email,
          codeHash: await bcrypt.hash(code, 10),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      })
    ]);

    try {
      await sendOtp(email, code, 'password-reset');
    } catch (deliveryError) {
      await prisma.passwordResetOtp.deleteMany({ where: { email } });
      console.error('Password-reset email delivery failed:', deliveryError);
    }

    return res.json({ message });
  } catch (error) {
    console.error('Forgot-password error:', error);

    return res.status(error instanceof z.ZodError ? 400 : 500).json({
      error: error instanceof z.ZodError
        ? error.issues[0]?.message
        : 'Password-reset request could not be completed.'
    });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const data = z.object({
      email: emailSchema,
      code: z.string().regex(/^\d{6}$/),
      newPassword: z.string().min(10).max(72)
    }).parse(req.body);

    const otp = await prisma.passwordResetOtp.findFirst({
      where: { email: data.email },
      orderBy: { createdAt: 'desc' }
    });

    if (!otp || otp.expiresAt <= new Date() || otp.attempts >= 5) {
      return res.status(400).json({
        error: 'Reset code expired or unavailable. Request a new code.'
      });
    }

    const validCode = await bcrypt.compare(data.code, otp.codeHash);

    if (!validCode) {
      await prisma.passwordResetOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } }
      });

      return res.status(400).json({
        error: 'Incorrect reset code.'
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Password reset could not be completed.'
      });
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { email: data.email },
        data: { passwordHash }
      }),
      prisma.passwordResetOtp.deleteMany({
        where: { email: data.email }
      })
    ]);

    return res.json({
      message: 'Password changed successfully. You can now sign in.'
    });
  } catch (error) {
    console.error('Reset-password error:', error);

    return res.status(error instanceof z.ZodError ? 400 : 500).json({
      error: error instanceof z.ZodError
        ? error.issues[0]?.message
        : 'Password reset could not be completed.'
    });
  }
});


export default router;
