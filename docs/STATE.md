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

## Phase 2 checkpoint — returns and refunds
- Reviewed the return and refund services on `main`.
- Fixed completed-return quantities being excluded from cumulative return accounting; previously completed units could be requested again.
- Fixed refund idempotency-key reuse: an existing key must match order, amount, reason, and return ID before any Razorpay operation; mismatches now return a conflict.
- Added focused regression tests for both cases.
- GitHub Actions CI run #142 on commit `7ca5e2c1c5302b879ed4450c5f7ba6958510b4db` passed all steps: clean PostgreSQL migration deployment, API typecheck/lint/tests/build, web typecheck/lint/build, both Docker image builds, and production Compose validation.
- The separate Vercel commit status failed only because the deployment provider reported `Deployment rate limited — retry in 24 hours`; GitHub Actions CI itself succeeded.
- Phase 2 automated CI verification is complete. Live Razorpay refund testing and dedicated PostgreSQL concurrency/reconciliation scenarios remain outstanding.

## Verification
- Clean-database Prisma migration deployment and API checks passed on intermediate commits. The merchandising repair is now a new forward-only migration; the historical empty migration is preserved.
- A mixed active/expired reservation regression test passed on an intermediate commit.
- Web build passed after removing the build-time Google Fonts dependency.
- GitHub Actions run #142 passed on the latest documented `main` commit; Vercel deployment status is separately rate-limited and does not affect the CI workflow result.
- No live Razorpay transaction, production deployment, visual browser QA, or load test has been performed.

## External dependencies
- Actual production database/Redis/JWT/Razorpay/Resend credentials.
- Actual seller legal name, registered address and valid GSTIN.
- Shared object storage if the hosting platform is multi-host or serverless.
- A live carrier PIN-serviceability source if delivery estimates are required.
