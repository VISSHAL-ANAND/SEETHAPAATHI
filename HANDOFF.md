# SEETHAPAATHI — Engineering Handover

Last updated: 2026-11-03

## Repository and working branch

- GitHub: https://github.com/VISSHAL-ANAND/SEETHAPAATHI
- Current working branch: `main`
- The current repair work was committed directly to `main`; no branches or pull requests were created.
- Latest verified `main` head: `c49c4cc371312913b603142ec3c728e4a3314fbc` (`docs(readme): link release gates and production runbooks`). GitHub Actions run #257 passed on this exact SHA.
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


## 2026-11-02 continuation checkpoint — Phase 4/5/6 and CEPt last

### Execution order and guardrails
- User reconfirmed the order: Phase 4 security/operations → Phase 5 production readiness → Phase 6 test/E2E → Phase 3 India Post CEPt → hosting.
- All edits are committed directly on `main`; no branch/PR was created in this continuation.
- No domain was purchased, no DNS was changed, no provider secrets were configured, and no production deploy was triggered.

### Phase 4 implementation in this continuation
- Removed the Redis TLS certificate-verification bypass from both BullMQ application code and `scripts/test-deployment.js`.
- Production/staging BullMQ queue absence now raises a service-unavailable error; asynchronous enqueue errors propagate. Development-only null fallback retained.
- Redis readiness is driven by ioredis `ready`/close/end/error lifecycle, not TCP connect. Rate-limit `INCR` and expiry are atomic via Lua; production auth rate limiting fails closed when Redis is unavailable.
- Resend request timeout is bounded to 10 seconds. Notification outbox claim batch lowered to five for sequential delivery within the two-minute lease.
- Email/provider and outbox/worker failure details are redacted from persisted errors/logs. Refund reconciliation logging records error type without provider/customer payloads.
- Admin upload route enforces a request-body byte cap while streaming, before multipart parsing; keeps server-side session/permission checks and file-signature validation.
- Added regression tests around Redis, queue, email, notification/invoice/refund workers, outbox lease ownership/retries, and shipping dispatch/state changes.
- Added `docs/runbooks/operations-monitoring.md`.

### Phase 5 implementation in this continuation
- Added same-origin Next.js rewrite for browser `/api/v1/*` requests to the configured API service. The web service must be given the correct internal/public API URL for the selected host.
- Removed the guessed `seethapaati.com` production canonical fallback; production site origin must be configured as HTTPS.
- Centralized public business/legal/support details in `apps/web/src/lib/business-info.ts`. Production build requires legal entity, FSSAI, registered office, grievance/support contacts and valid phone formats. Business identity/contact values are not invented.
- Passed these public build values through Dockerfile, Docker Compose, Render Blueprint and CI build/test configuration.
- Docker Compose web/API/DB/Redis host ports bind to localhost; use a separately configured HTTPS reverse proxy for public access.
- Corrected storefront copy that disagreed with code: GST is shown as calculated from HSN rates; free shipping begins at ₹500 after discounts and is ₹50 below threshold; India Post tracking is manually entered; no automatic SMS/WhatsApp notifications are claimed; unsupported return/refund and support response guarantees were removed.
- Added `docs/runbooks/domain-and-hosting-cutover.md` and `docs/runbooks/business-owner-launch-inputs.md`.
- Business owner/legal/tax review remains mandatory for legal identity, GSTIN, FSSAI licence, registered office, grievance/support details, product/allergen claims and return/refund policy.

### Phase 6 verification evidence
- GitHub Actions run #237 on commit `edb1c44` succeeded: clean Postgres migrations, API typecheck/lint/tests/build, web typecheck/lint/build, API/web Docker image builds and production Compose validation.
- This run is not the final verification of later commits. Re-run/confirm full CI against the exact current `main` head before phase sign-off.
- A live browser E2E test, test-mode Razorpay transactions/refunds, provider-level shipping smoke test, database restore drill and load test were not run; there is no provisioned staging environment/credential access in this task.

### Phase 3 India Post / CEPt public research refresh
- Official PIB release dated 11 March 2026 says APT 2.0 introduced real-time delivery updates, OTP delivery and API integration with e-commerce partners. This confirms API integration is an active capability, but does not provide a merchant API contract or credentials.
- Current India Post pages distinguish Speed Post Parcel (Domestic), India Post Parcel (Contractual), and India Post Parcel Last Mile. The 2021 CEPt API v9 and 2021 onboarding SOP remain historical pending confirmation by CEPT of the current APT 2.0 onboarding and contract.
- Updated `docs/runbooks/india-post-cept-onboarding.md` with these distinctions and new questions for CEPT.
- No Customer ID/contract eligibility, approved current specification, UAT credentials, production credentials, static egress IP allowlisting or UAT approval were obtained. No live adapter is enabled; API serviceability continues fail-closed.

### Current handoff gates
1. Confirm successful full CI on the exact latest `main` SHA.
2. User/business owner supplies verified legal/tax/contact/policy inputs (see `docs/runbooks/business-owner-launch-inputs.md`).
3. Choose domain and hosting provider; configure same-origin routing, production secrets and durable upload storage.
4. Complete staging browser/payment/refund/shipping tests, backup restore and load/security review.
5. Obtain current CEPT/Apt 2.0 merchant documentation/UAT/allowlisting, then implement/certify the India Post adapter.
6. Only then proceed to domain DNS and production hosting cutover.

Never mark the project fully launch-ready until all external and staging gates above have evidence.


## 2026-11-03 status — current-main CI verified

- Current branch remains `main`; latest verified SHA is `c49c4cc371312913b603142ec3c728e4a3314fbc`.
- GitHub Actions [run #257](https://github.com/VISSHAL-ANAND/SEETHAPAATHI/actions/runs/41499771409) passed on the exact current SHA.
- It passed clean PostgreSQL migrations, API typecheck/lint/tests/build, web typecheck/lint/build, both production Docker builds and production Compose validation.
- API test report: **31 suites passed, 205 tests passed, 0 failures**.
- Phase 4 repository security/operations changes and regression tests are in place. Actual host/provider monitoring and alert delivery remain pending.
- Phase 5 deployment templates, same-origin API routing, loopback port bindings, domain/legal disclosure gates and runbooks are in place. Owner legal/business values, domain, host, production secrets and shared storage choice remain pending.
- Phase 6 automated CI is green on the exact head. Real staging browser E2E, Razorpay test payment/refund runs, shipping dispatch journey, restore drill, load test and final security/business acceptance remain pending.
- Phase 3 public research and safe fail-closed PIN validation are in place. Live India Post integration remains blocked on current merchant eligibility/contract, Customer ID, APT/CEPT specification, UAT credentials, IP allowlisting and written production approval. No guessed API adapter has been implemented.
- Hosting remains intentionally unstarted. Do not change DNS, add live credentials, create production services or deploy until the remaining gates are closed.
