# Engineering Tasks

## Current release gates (do not deploy until every applicable item is closed)

### Phase 4 — security and operations
- [x] Remove Redis TLS certificate-verification bypasses from app and deployment verification tooling.
- [x] Fail explicitly on unavailable production BullMQ queues; propagate enqueue failures.
- [x] Make Redis readiness reflect the ready lifecycle and apply rate-limit counter TTL atomically.
- [x] Fail closed for production auth rate limiting when Redis is unavailable.
- [x] Bound outbound email requests and reduce sequential notification batch size within the database outbox lease.
- [x] Redact provider response bodies and sensitive error messages from persisted/logged worker failures.
- [x] Enforce upload request byte limit while streaming, before multipart parsing.
- [x] Add worker/outbox/Redis/queue/upload-related regression coverage.
- [x] Document production monitoring, alert thresholds and recovery procedures.
- [ ] Configure actual provider/host alerts and route a test alert to two responsible contacts.
- [ ] Verify Redis/DB capacity monitoring and retention with the selected provider.

### Phase 5 — production-readiness and deployment preparation
- [x] Add same-origin browser API rewrite through configured API URL.
- [x] Require canonical HTTPS storefront origin for production build and remove the unpurchased hard-coded domain.
- [x] Require public statutory/business/support fields at production web build; pass them through Docker, Render and CI paths.
- [x] Bind production Compose application, database and Redis ports to host loopback.
- [x] Add domain cutover, operations monitoring, and business-owner input runbooks.
- [x] Align storefront shipping threshold/charge with API pricing (₹500 free-shipping threshold after discounts; ₹50 below).
- [x] Remove unsupported automatic tracking/SMS/WhatsApp and unsupported response-time/replacement/refund guarantees from affected public copy.
- [x] Correct GST display explanation to match the server-side item tax breakdown.
- [ ] Business owner confirms legal entity, registration/CIN applicability, FSSAI licence, registered office, GSTIN, grievance officer, public emails and contact numbers.
- [ ] Business owner approves actual return/refund policy, shipping charge/threshold and product/allergen/marketing claims.
- [ ] Choose domain and hosting provider; configure canonical URLs, internal API routing, exact CORS/upload origins and HTTPS.
- [ ] Choose shared object storage if deployment is serverless/multi-host; current local/disk uploads are single-instance only.
- [ ] Configure actual production secrets in the selected host secret manager.

### Phase 6 — full testing and E2E validation
- [x] Add regression tests for Redis readiness and auth rate-limit failure behavior.
- [x] Add regression tests for production queue unavailable/enqueue failure behavior.
- [x] Add regression tests for email timeouts, notification worker bounded batches and retry behavior.
- [x] Add regression tests for outbox lease ownership, retries and terminal failures.
- [x] Add regression tests for refund-reconciliation and invoice worker lifecycle.
- [x] Add regression tests for shipment dispatch eligibility, duplicate creation and tracking transitions.
- [x] Confirm full CI run #237 on commit `edb1c44`: clean migrations, API typecheck/lint/tests/build, web typecheck/lint/build, API/web Docker builds and production Compose validation passed.
- [x] Obtain a successful full CI run for the exact current `main` head: run #257 on `c49c4cc371312913b603142ec3c728e4a3314fbc`; 31 API test suites and 205 tests passed, plus API/web typecheck/lint/build, clean migrations, both Docker image builds and production Compose validation.
- [ ] Run browser E2E on a real staging origin: sign-in/session, catalog, cart, checkout, admin upload, order history and tracking.
- [ ] Run Razorpay test-mode success/failure/duplicate webhook/stockout/refund/partial and full refund scenarios.
- [ ] Run the staging shipping/dispatch/manual tracking journey and confirm notification behavior.
- [ ] Perform a database backup/restore drill and document RPO/RTO achieved.
- [ ] Load-test representative catalog, checkout, DB and worker traffic; choose replica/capacity only from measured results.
- [ ] Perform final security review and owner acceptance on the exact deployment commit.

### Phase 3 — India Post CEPt (last engineering integration phase)
- [x] Keep PIN syntax separate from verified carrier serviceability; unknown/provider-unavailable states remain fail-closed.
- [x] Add tests for malformed PINs and unverified valid PINs.
- [x] Document onboarding and implementation gate.
- [x] Refresh public research with 2026 APT 2.0 announcement and current parcel product pages; mark 2021 CEPT API material historical until reconfirmed.
- [ ] Merchant obtains confirmation of eligible postal product, current API version, APT/CEPT onboarding process and required customer agreement/Customer ID.
- [ ] Obtain current official API specification, UAT URL/credentials, authentication details, static IP allowlisting and test approval.
- [ ] Confirm origin PIN and measured parcel weight/dimensions/service profile.
- [ ] Implement only against the approved current specification; add contract tests and all failure-mode tests.
- [ ] Complete CEPT UAT/certification and written production rollout approval before enabling the adapter.
- [ ] Enable live serviceability only after production approval and monitoring.

### Hosting — final step only
- [ ] Domain purchased and canonical hostname chosen.
- [ ] Hosting target/account selected and verified.
- [ ] DNS records and TLS certificate configured using provider-issued values.
- [ ] Production environment configured and readiness health checks pass.
- [ ] CI green on the exact deployed commit; all production go-live gates signed.
- [ ] Controlled production smoke checks completed and rollback path verified.

## Phase 2 — returns and refunds
- [x] Count completed returns when calculating remaining returnable quantities.
- [x] Reject refund idempotency-key reuse with mismatched order, amount, reason or return ID.
- [x] Add targeted regression tests.
- [x] Verify tests in GitHub Actions run #142.
- [ ] Add/verify PostgreSQL concurrency coverage for overlapping partial returns and concurrent refund completion.
- [ ] Verify real test-gateway reconciliation, timeout recovery, partial/full refunds and multiple captured payment attempts.

## Product follow-ups
- [ ] Verify active product SEO metadata/structured data and image rights with business owner.
- [ ] Review product nutrition, allergen, FSSAI and origin claims with actual evidence.
- [ ] Consider image re-encoding/malware scanning after selecting the storage pipeline.


## Latest CI evidence — 2026-11-03

- Current `main` head at verification: `c49c4cc371312913b603142ec3c728e4a3314fbc`.
- GitHub Actions run [#257](https://github.com/VISSHAL-ANAND/SEETHAPAATHI/actions/runs/41499771409): success on the exact head.
- API tests: 31 suites passed, 205 tests passed, 0 failed.
- API/web typecheck and lint, API/web builds, clean PostgreSQL migrations, API/web production Docker builds and Compose validation all passed.
- This is automated CI evidence only; it is not staging E2E or production acceptance.
