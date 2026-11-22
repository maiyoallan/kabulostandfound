# KABU Lost & Found v1.1 — review and correction report

## Summary
The original archive had a source-file placement error: `server/src/routes/auth.js` contained the Resend mailer implementation instead of an Express router. That prevented `server/src/index.js` from importing the default authentication router and explains the repeated `does not provide an export named 'default'` startup failure. The actual mailer file already existed at `server/src/services/email.js`.

The archive also included a real `server/.env` and credential-like values in `server/.env.example`. Neither is included in this corrected source package. Rotate any real credentials that were present in the submitted archive before using the project again.

## Corrections made

### Backend startup and authentication
- Restored `server/src/routes/auth.js` as a default-exporting Express router.
- Implemented register, verify, login, and resend endpoints with Zod validation, bcrypt password/OTP hashing, 10-minute OTP expiry, five-attempt verification limit, JWT sessions, institutional-domain checks, and administrator-approved email allowlisting.
- Kept the email delivery implementation in `server/src/services/email.js`.
- When initial email delivery fails after account creation, registration returns an accepted response that allows the existing verification screen to offer the resend action. The user does not need to register a second time.
- Preserved `auth` and `roles` middleware exports in `server/src/middleware/auth.js`.

### Claims and item listings
- Claim creation now reserves an unclaimed item atomically, preventing concurrent users from both creating a pending claim for the same item.
- Claim decisions are restricted to the item owner and pending claims. Accepting a claim rejects other pending claims for that item and creates the private chat session in a transaction.
- Rejection reopens an item only when no pending claims remain.
- Removed listings remain excluded from public listing queries and statistics.
- Public item data includes the found-item verification prompt, not the claimant's private verification answer. The claimant's answer is returned only to the owner in the claims endpoint.
- Matching notifications run best-effort so an email-provider failure does not undo a successfully created listing.

### Uploads, browser behavior, and configuration
- Cloudinary upload signatures now include the transformation and allowed image formats; the client sends those same signed parameters.
- Date/time defaults use the visitor's local clock rather than UTC text sliced into a local datetime field.
- Logout removes only the app's own session keys rather than clearing all session storage for the site.
- Replaced credential-like values in `server/.env.example` with placeholders.
- Updated `.gitignore` and README with credential hygiene, migration-safe setup, and production cautions.

### Preserved
- Original React page design and styling.
- Existing Prisma schema and initial migration.
- Existing route structure, database models, brand copy, and core community flows.
- Existing package manifests and lockfiles.

## Validation performed here
- `node --check` passed for all backend JavaScript files.
- Babel parser successfully parsed `client/src/App.jsx` with JSX enabled.
- A production Vite build could not be run in this Linux review environment because the supplied `node_modules` archive contains Windows-specific optional native packages and lacks the Linux Rollup binary. Run `npm install` on the Windows development computer, then `npm run build` from `client/`.
- Prisma engine validation could not be completed here because the environment could not reach Prisma's binary download host. The existing schema and migration were preserved; validate locally using the installed Prisma tooling.
- No connection to the user's local PostgreSQL instance was available, so no live database or end-to-end API test was performed.

## Remaining work before a university launch
- Add a dedicated administrator/moderator interface in the React client. The protected moderation APIs exist, but the current client does not expose a full admin dashboard.
- Configure and test a verified Resend sender address. The Resend test sender may only deliver to the Resend account owner.
- Configure Cloudinary account-level upload limits and allowed formats; verify direct uploads against the account's security settings.
- Add message notifications/read-state UX, report submission controls in the client, audit logging, and pagination if required for campus scale.
- Conduct a full live test with the preserved PostgreSQL database, real email delivery, Cloudinary, and two separate user accounts.
- Obtain institutional approval and publish privacy, retention, and moderation policies.

## Safe update instructions
1. Back up the existing PostgreSQL database before any update.
2. Extract this corrected package into a new folder; do not overwrite the only copy of the old project.
3. Copy your rotated local secrets into `server/.env` using `server/.env.example` as a guide. Do not put secrets in this archive or share them in chat.
4. From `server/`, run `npm install`, `npx prisma generate`, `npx prisma migrate status`, then `npx prisma migrate deploy` only after reviewing the status. Do not run `prisma migrate reset`.
5. Start the API with `npm run dev`; in another terminal start the client with `npm run dev`.
6. Test health, registration, resend, OTP verification, login, listing creation, claim/decision, and private chat.
