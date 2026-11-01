# SEETHAPAATHI — Engineering Handover

Last updated: 2026-11-01

## Repository and working branch

- GitHub: https://github.com/VISSHAL-ANAND/SEETHAPAATHI
- Current working branch: `main`
- The current repair work was committed directly to `main`; no branches or pull requests were created.
- Latest known commit when this handover was written: `8edeca7ed096da58e77e4b16c6b179287303c662`. Re-check the branch head before continuing.
- No repository-level `AGENTS.md`, `docs/STATE.md`, or `docs/TASKS.md` was present during the audit. This handover is the current continuity record.

## Product and architecture

SEETHAPAATHI is an e-commerce platform for a South Indian pantry/food brand.

- Web: Next.js App Router, React, TypeScript, Tailwind CSS
- API: NestJS, TypeScript
- Database: PostgreSQL + Prisma
- Redis/BullMQ for caching and background jobs
- Shared Zod/TypeScript contracts
- Razorpay payments and refunds
- India Post manual dispatch/tracking workflow
- Server-authoritative pricing, tax, inventory, checkout and payment confirmation

## Audit baseline

The engineering audit reviewed the main application paths, Prisma migration history, GitHub Actions, checkout/payment/inventory, order/return/refund, fulfillment, auth, uploads, Redis and production deployment configuration.

Initial confirmed CI baseline:
- 134 passed, 10 failed
- 3 failing suites: checkout integration, order service, commerce integration
- Primary database failure: missing `products.merchandising` column due to an empty migration
- A paid-order cancellation test also failed because implementation allowed cancellation without refund

## Repairs committed directly to main

### Database and CI
- Preserved the historical empty merchandising migration file and added a new forward-only migration for the missing column, so databases that already recorded the old migration can apply the repair.
- Added the missing order/shipment `IN_TRANSIT` enum values and order tracking columns/index in a separate additive migration.
- CI clean-database migration deploy now runs before API checks.
- Web TypeScript, lint and build checks are now explicit CI steps.
- Next.js no longer ignores TypeScript or ESLint build errors.
- Removed build-time Google Fonts fetching and use deterministic local system font stacks so builds do not depend on Google Fonts availability.
- Replaced the generic Vite template README with project-specific setup/operations guidance.
- Rewrote the production launch guide to match the current implementation rather than the removed Shiprocket path.

### Orders, checkout, payments and inventory
- Ordinary customer cancellation is limited to unpaid orders; paid and fulfillment-stage orders cannot be cancelled without a refund workflow.
- Checkout no longer clears the cart when a Razorpay order intent is created.
- Cart ID is stored in the immutable order notes; after signed payment capture, the webhook removes only purchased quantities so later cart additions remain.
- Webhook settlement reconciles every order line against committed/active reservations and stock under deterministic row locks.
- Mixed active/expired reservations are handled without marking a partially allocated order paid.
- If payment is captured but the full order cannot be allocated, the order is cancelled and a pending refund record is created for refund reconciliation.
- Refund processing now updates payment status only after cumulative processed refunds cover the captured amount; full and partial return flows restore appropriate order states and history.
- Return rejection/cancellation restores the order to DELIVERED; direct manual completion is blocked so refund processing owns completion.

### Fulfillment and shipping
- Dispatch is serialized with an order-row lock and limited to PAID/PROCESSING/PACKED orders.
- Shipment status changes now add order status history.
- PIN format is no longer treated as proof of serviceability. Until a live carrier serviceability source is configured, the API/storefront report it as unverified.

### Security and infrastructure
- Admin image upload now validates the HttpOnly API session and `products.create` permission server-side.
- Upload accepts PNG/JPEG/WebP up to 5 MB, validates file signatures, rejects SVG, generates filenames and creates its upload directory.
- Upload path can be configured; single-host Compose uses a persistent named volume and internal API URL.
- Redis TLS certificate verification is enabled by default.
- Redis uses `noeviction` plus AOF in the production Compose file to protect BullMQ queue state.
- PostgreSQL and Redis host ports bind to localhost.
- Production Compose now requires database, Redis, JWT, Razorpay, email and actual seller configuration instead of insecure fallback secrets.
- Auth tokens are no longer returned to browser clients or stored in localStorage; frontend uses HttpOnly cookies.
- API client retries only safe methods or requests carrying an explicit idempotency key; unsafe network failures stop rather than replay.
- Production environment validation rejects common placeholder credentials and placeholder seller details.
- Sitemap now fetches active products from the public catalog rather than hardcoding a small product list.

### Phase 2 — returns and refunds (automated CI verified)
- `apps/api/src/modules/returns/return.service.ts`: completed returns now remain included in cumulative returned-quantity accounting, preventing a customer from returning the same purchased units again after a previous return completes.
- `apps/api/src/modules/returns/refund.service.ts`: refund idempotency keys are now bound to the original order, amount, reason, and return ID. Reuse with different request details fails with `REFUND_IDEMPOTENCY_KEY_REUSED` before contacting Razorpay.
- Added `return.service.spec.ts` and `refund.service.spec.ts` regression tests.
- These changes are committed directly to `main`.
- GitHub Actions run #142 passed on commit `7ca5e2c1c5302b879ed4450c5f7ba6958510b4db`, including the API test suite containing both new regression tests. Vercel separately reported a deployment rate limit; this is not a GitHub Actions test/build failure.
- Phase 2 automated CI verification is complete. Dedicated database concurrency tests and live Razorpay refund/reconciliation tests remain open.

### Phase 3 — shipping serviceability (foundation in progress)
- Added `apps/api/src/modules/fulfillment/shipping.service.spec.ts` covering malformed PIN rejection, whitespace normalization, and fail-closed handling of valid PINs without a configured provider.
- `GET /shipping/serviceability` now exposes `verified` at the top level in addition to the nested `data.verified` value.
- No live India Post/CEPt integration has been activated. Route-level checks require confirmed CEPt onboarding/API contract, public egress IP allowlisting, merchant origin PIN, and parcel weight/dimensions. Keep serviceability unverified until these are available.

## Verification status

Do not assume the latest commit is green merely because earlier commits passed.

Observed successful checks on earlier intermediate commits:
- Prisma migrations deployed successfully against a clean PostgreSQL CI service.
- API typecheck, lint, tests and build passed on an intermediate run after the database/order fixes.
- The mixed-reservation webhook tests passed on an intermediate run.
- The Next.js web build passed after removing the Google Fonts build-time network dependency.

Observed failures that were subsequently addressed:
- A webhook test run failed because it ran before the test mock update; the later test commit added reservation/refund/cart mocks and mixed reservation coverage.
- Checkout tests initially still expected cart deletion at gateway intent creation; those assertions were updated to require cart retention until payment capture.
- Enabling web typecheck exposed five existing UI accesses to `ApiClientError.status`; the API error class now exposes HTTP status.

GitHub Actions run #142 passed on the latest documented `main` commit. It completed clean migrations, API typecheck/lint/tests/build, web typecheck/lint/build, API/web Docker builds and production Compose validation. The independent Vercel deployment check was rate-limited (`retry in 24 hours`). For future commits, re-check CI and verify:
1. API tests including `env.schema.spec.ts`, `webhook.service.spec.ts`, and `checkout.integration.spec.ts`.
2. API typecheck/lint/build.
3. Web typecheck/lint/build.
4. Clean Prisma migration deployment.

## Known remaining limitations / external dependencies

- PIN-code serviceability is deliberately unverified; a live carrier serviceability API/data source must be selected and configured before the storefront can promise delivery.
- Uploads use local filesystem storage. The named Docker volume is persistent on a single host only. Multi-host/serverless deployments need shared object storage; credentials and provider choice are not available in the repository.
- No live Razorpay credentials or webhook dashboard access were available for an end-to-end live payment/refund test.
- Actual seller legal identity, registered address, GSTIN and verified email sender must be supplied by the business. Repository examples are placeholders and production validation rejects them.
- Docker Compose is a single-host baseline; multi-host scaling requires a load balancer, shared storage, and load testing. No throughput target is verified.
- Product sitemap is dynamic, but the storefront should still be checked for product metadata/SEO correctness in a browser.
- Visual browser QA and production deployment were not performed through this repository-only audit.

## Required continuation workflow

1. Confirm current `main` head and latest GitHub Actions result.
2. Fix any newly surfaced CI failures; do not weaken typecheck/lint/build gates to make CI green.
3. Add targeted regression tests for any remaining untested return/refund/fulfillment state transitions.
4. Review upload storage for the actual hosting provider and integrate object storage if multi-host/serverless deployment is required.
5. Verify production environment variables with the business; do not invent seller or provider secrets.
6. Run a staging end-to-end flow: signup, cart, checkout, payment captured, payment failed, duplicate webhook, stockout refund, partial return/refund, full refund, dispatch, tracking.
7. Perform a backup/restore drill and representative load test before production sign-off.
8. Preserve Git history and continue direct-to-`main` only while the user maintains that instruction. Do not create branches unless the user changes this instruction.

Never claim a test, visual check, deployment, or external integration succeeded unless the corresponding evidence is available.

## Migration integrity caution

The original empty merchandising migration was briefly populated and then restored to its original empty content. The order/shipping reconciliation migration was also briefly edited to include merchandising and then restored to its first committed content. The final merchandising repair is in a separate new forward-only migration. Before deploying to any database, run `prisma migrate status` and inspect `_prisma_migrations` if that database may have deployed during either brief window. If it recorded a checksum for temporary contents, do not deploy blindly; reconcile the migration history deliberately. The connected Render workspace had no SEETHAPAATHI service, so no Render deployment was observed during this audit.
