# Engineering State

Last updated: 2026-11-01

## Current branch
- `main` only; repair work is being committed directly to `main` per user instruction.
- No branch or pull request was created for this repair.

## Current product state
- Next.js storefront/admin, NestJS API, PostgreSQL/Prisma, Redis/BullMQ, Razorpay.
- Shipping currently supports manual India Post dispatch/tracking.
- PIN-code serviceability is intentionally reported as unverified until a live carrier source is configured.

## Repair checkpoint
The initial audit found Prisma migration drift, failing CI tests, unauthenticated image upload, unsafe cancellation/refund behavior, partial inventory settlement, premature cart clearing, state synchronization issues, insecure token persistence, Redis TLS/eviction issues, frontend build bypasses, and stale deployment documentation.

Repairs committed so far are recorded in [HANDOFF.md](../HANDOFF.md). They include migrations, order/cancellation policy, webhook inventory reconciliation and refund queueing, cart retention until payment capture, return/refund synchronization, fulfillment guards/history, authenticated image uploads, HttpOnly cookie-only browser auth, safer mutation retries, Redis hardening, production config validation, dynamic sitemap, CI web checks, and documentation updates.

## Verification
- Clean-database Prisma migration deployment and API checks passed on intermediate commits. The merchandising repair is now a new forward-only migration; the historical empty migration is preserved.
- A mixed active/expired reservation regression test passed on an intermediate commit.
- Web build passed after removing the build-time Google Fonts dependency.
- The newest changes (production environment validation, dynamic sitemap, checkout/cart test changes, and documentation) require a fresh green CI run before sign-off.
- No live Razorpay transaction, production deployment, visual browser QA, or load test has been performed.

## External dependencies
- Actual production database/Redis/JWT/Razorpay/Resend credentials.
- Actual seller legal name, registered address and valid GSTIN.
- Shared object storage if the hosting platform is multi-host or serverless.
- A live carrier PIN-serviceability source if delivery estimates are required.
