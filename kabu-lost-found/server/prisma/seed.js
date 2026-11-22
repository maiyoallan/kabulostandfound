import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const emails = (process.env.BOOTSTRAP_ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
for (const email of emails) await prisma.approvedEmail.upsert({ where:{email}, update:{}, create:{email} });
console.log(`Approved ${emails.length} bootstrap administrator email(s). Register and verify each account, then promote using the protected admin workflow.`);
await prisma.$disconnect();
