# KABU Lost & Found

A privacy-first lost-and-found portal for the Kabarak University community. This full-stack application uses React/Vite, Express, PostgreSQL/Prisma, email OTP verification, username-only public identity, item listings, claims, private Socket.IO chat, match notifications, Cloudinary image uploads, and role-based moderation.

## Requirements
- Node.js 20 or newer
- PostgreSQL 15 or newer
- Resend account and a sender address permitted by that account
- Cloudinary account for image uploads (optional during local API testing)

## Important: protect your credentials
- Never share or commit `server/.env` or `client/.env`.
- Copy `server/.env.example` to `server/.env` and replace every placeholder with your own values.
- Generate a unique `JWT_SECRET` of at least 32 random characters.
- The source archive supplied for review contained environment credential material. Treat any credentials that were present in that archive as exposed and rotate them before further use (database password, Resend key, and any other real provider keys).
- Keep `.env.example` limited to placeholders. The corrected package does this.

## Local setup
1. Create the PostgreSQL database `kabu_lost_found` if it does not already exist.
2. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, and provider values.
3. From `server/` run:
   ```bash
   npm install
   npx prisma generate
   npx prisma migrate deploy
   npm run dev
   ```
   `prisma migrate deploy` applies pending migrations and does not drop existing data. Do not run `prisma migrate reset` against a database you want to preserve.
4. In another terminal, copy `client/.env.example` to `client/.env` and from `client/` run:
   ```bash
   npm install
   npm run dev
   ```
5. Open `http://localhost:5173`.

## Database preservation
The existing Prisma schema and initial migration are retained in this package. For the existing local database, keep a backup before any schema change. Check migration status with `npx prisma migrate status` before applying migrations. This corrected package does not include a database dump and does not attempt to modify or replace your local database records.

## Email policy
`@kabarak.ac.ke` and `@kabarak.co.ke` addresses are accepted. Other addresses are accepted only when their exact normalized address exists in `ApprovedEmail`. OTPs are hashed, expire after 10 minutes, and allow at most five verification attempts. Configure a sender address accepted by your Resend account; the Resend test sender may be restricted to the account owner's address.

## Initial administrator
Set `BOOTSTRAP_ADMIN_EMAILS` to one or more trusted institutional email addresses before those users verify their accounts. The role is assigned after successful email verification. Keep this setting restricted and remove it after initial administrator provisioning if appropriate.

## Features and limitations
- Public listings show usernames rather than email addresses.
- Listing owners and claimants can access accepted-claim chat.
- Only one pending claim can reserve an item at a time.
- Admin/moderator API endpoints are present. The current client interface remains the community interface; a dedicated moderation dashboard is a follow-on UI task.
- Cloudinary upload signing is present. Configure Cloudinary and verify account-level upload restrictions before production use.
- Matching notifications are best-effort; an email provider outage does not prevent a listing from being published.

## Production checklist
Use HTTPS, managed PostgreSQL with backups, strong unique secrets, exact production CORS origins, verified email sender/domain, Cloudinary upload restrictions, retention/privacy policies, institutional approval, monitored logs, and a security review before a university-wide launch. This app does not independently verify current student enrollment; domain acceptance and administrator-approved addresses are operational controls.
