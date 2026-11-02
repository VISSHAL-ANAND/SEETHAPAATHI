# Engineering State

Last updated: 2026-11-02

## Current execution checkpoint — Phase 4/5/6/3 ordered continuation

Approved order: Phase 4 security/operations → Phase 5 production-readiness/deployment preparation → Phase 6 testing and E2E validation → Phase 3 India Post CEPt integration → hosting. All repository changes continue directly on `main`; no branches are created. No domain purchase, DNS cutover, external provider credential change, or production deployment has been performed.

### Phase 4 — security and operations (repository work substantially implemented; final CI for latest head pending)
- Removed the Redis TLS certificate-verification bypass from the BullMQ application configuration and the deployment verification script. TLS is verified by default.
- Production/staging queue submissions fail explicitly when a queue is unavailable; asynchronous enqueue errors propagate. Development retains the local fallback.
- Redis readiness now tracks the authenticated/ready lifecycle rather than TCP connect. Rate-limit counter increments and expiry creation are atomic; production authentication rate limiting fails closed when Redis is unavailable.
- Outbound Resend requests have a bounded timeout; notification outbox batches are limited to five so sequential sends are less likely to outlive the two-minute lease. Email, notification, invoice, refund-worker and outbox retry/lease regression tests were added.
- Provider response bodies are not copied into email/outbox error records; worker polling/reconciliation logs use safe error labels.
- Admin upload request bytes are capped while reading the stream, before multipart parsing; the existing authenticated admin permission and image-signature checks remain.
- Added deployment/operations monitoring and recovery runbooks.
- Remaining external operations work: configure real host alerts, a tested backup/restore procedure and actual provider monitoring in the chosen hosting account.

### Phase 5 — production readiness / deployment preparation (repository templates implemented; owner/domain/host values pending)
- Added same-origin Next.js rewrites for browser `/api/v1/*` requests and made production canonical HTTPS origin required.
- Render, Docker and CI paths now pass public business disclosure values. Docker Compose binds web/API/DB/Redis host ports to loopback; public access is intended through an HTTPS reverse proxy.
- The website no longer hard-codes the unpurchased canonical domain. Public statutory/contact disclosures are centralized and required at production web build time.
- Public policies were corrected where code showed mismatches (GST display, ₹50 below ₹500 post-discount free-shipping threshold, manual India Post tracking, no automatic SMS/WhatsApp tracking).
- Created `docs/runbooks/domain-and-hosting-cutover.md`, `docs/runbooks/operations-monitoring.md`, and `docs/runbooks/business-owner-launch-inputs.md`.
- The legal entity, registration/FSSAI details, registered office, GSTIN, grievance/support contacts, return policy, product claims, canonical domain and host-specific URLs remain owner-supplied/verified inputs. Legal/tax counsel must review statutory policies and disclosures.

### Phase 6 — testing and E2E validation (CI coverage expanded; latest full run pending)
- Added regression coverage for queue availability/enqueue errors, Redis readiness and atomic rate-limit counters, notification/email behavior, outbox lease ownership/retries, refund and invoice workers, and shipment dispatch/state transitions.
- A full GitHub Actions run #237 on commit `edb1c44` passed clean migrations, API typecheck/lint/tests/build, web typecheck/lint/build, both Docker image builds, and production Compose validation.
- Later changes after `edb1c44` need a green run on the exact current `main` head before this phase can be signed off.
- No real staging browser journey, Razorpay transaction/refund, backup restore drill, production load test or provider-level smoke test has been performed. These require staging/credentials/business approval and must remain go-live gates.

### Phase 3 — India Post CEPt integration (public research updated; adapter remains disabled)
- The current API only validates PIN syntax and returns `verified: false`; manual India Post consignment entry/tracking remains supported.
- Official public 2026 information confirms APT 2.0 includes API integration with e-commerce partners; it does not publish the merchant API contract, credentials, UAT access or onboarding authorization needed to implement safely.
- Updated `docs/runbooks/india-post-cept-onboarding.md` distinguishes current India Post parcel products and labels the 2021 SOP/API guide as historical pending CEPT confirmation.
- No merchant Customer ID/contract confirmation, current APT/CEPT technical specification, credentials, UAT approval or production egress IP allowlisting is available. Do not implement guessed endpoints or report route serviceability until those are supplied and certified.

### Hosting
- Intentionally not started. The user will purchase a domain and select hosting after the engineering phases. Do not configure DNS, certificates, live secrets, production services or trigger a deployment before final sign-off.


## Current branch
- `main` only; repair work is being committed directly to `main` per user instruction.
- No branch or pull request was created for this repair.

## Current product state
- Next.js storefront/admin, NestJS API, PostgreSQL/Prisma, Redis/BullMQ, Razorpay.
- Shipping currently supports manual India Post dispatch/tracking.
- PIN-code serviceability is intentionally reported as unverified until a live carrier source is configured. The API now exposes `verified` both at the response top level and in `data`.

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
- GitHub Actions run #150 passed on commit `95a4d1fbd1496f44a83255a9d17fae1fd3dc8ffa` (18 workflow steps, including clean migrations, API/web checks, Docker builds, and production Compose validation). Subsequent documentation commits still require their own CI result.
- No live Razorpay transaction, production deployment, visual browser QA, or load test has been performed.

## External dependencies
- Actual production database/Redis/JWT/Razorpay/Resend credentials.
- Actual seller legal name, registered address and valid GSTIN.
- Shared object storage if the hosting platform is multi-host or serverless.
- A live carrier PIN-serviceability source if delivery estimates are required.

## Phase 3 checkpoint — shipping serviceability foundation
- Added `shipping.service.spec.ts` regression coverage for malformed PIN rejection, whitespace normalization, and the fail-closed response for valid PINs when no live provider is configured.
- Updated `GET /shipping/serviceability` to expose `verified` at the top level as well as inside `data`, so clients can distinguish PIN syntax validation from carrier-confirmed serviceability.
- This is foundation work only: no live CEPt/India Post request is enabled. Live route checks remain blocked on CEPt onboarding/IP allowlisting, confirmed current API contract, origin PIN, and parcel weight/dimensions.

## Phase 3 checkpoint — CEPt onboarding research
- Added `docs/runbooks/india-post-cept-onboarding.md` with the documented Department of Posts Circle/Division → HDMS ticket → CEPT testing → production rollout process, preparation checklist, questions for CEPT, and implementation gates.
- Public official SOP reviewed: dated 04 August 2021. It says the customer approaches a Circle Marketing Executive; the ME shares the latest API document and raises the request through Circle/Division, which raises the HDMS integration ticket. The ticket records customer details, postal services, API/SFTP mode, Customer ID, and customer public IP. CEPT then coordinates testing and records production rollout.
- The SOP lists `salesndist.cept@indiapost.gov.in` for operational issues initiating tickets. Confirm this contact and the process are still current with CEPT.
- No private access, credentials, approval, UAT access, or production IP allowlisting have been obtained. No live adapter has been implemented or enabled. Current public documents are dated 2021; implementation remains gated on current CEPT documentation/UAT access and merchant parcel inputs.
