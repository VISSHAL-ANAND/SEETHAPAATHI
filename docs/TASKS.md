# Engineering Tasks

## Must complete before production
- [ ] Re-check latest CI on current `main`; fix API tests/typecheck/lint/build and web typecheck/lint/build failures without bypassing checks.
- [ ] Run a clean-database migration deployment against the exact current commit.
- [ ] Validate the production environment with real credentials and actual seller/GST details supplied by the business.
- [ ] Configure durable shared object storage for uploads if deploying to serverless or multiple hosts.
- [ ] Run staging end-to-end tests for successful payment, failed payment, duplicate webhook, stockout refund, partial return/refund, full refund, dispatch and tracking.
- [ ] Verify refund reconciliation worker retries and failure recovery against a test Razorpay account.
- [ ] Perform a database backup/restore drill.
- [ ] Load-test with representative catalog, checkout and queue traffic before selecting replica counts.

## Phase 2 — returns and refunds
- [x] Count completed returns when calculating the remaining returnable quantity.
- [x] Reject refund idempotency-key reuse when order, amount, reason, or return ID differs.
- [x] Add regression tests for the two cases.
- [x] Verify return quantity tests and refund idempotency tests in CI (GitHub Actions run #142).
- [ ] Add/verify PostgreSQL concurrency coverage for overlapping partial return requests and concurrent refund creation/completion.
- [ ] Verify refund reconciliation retries, gateway timeout recovery, partial refunds, full refunds, and multiple captured payment attempts.

## Product/integration follow-ups
- [ ] Obtain CEPt integration approval/current contract and whitelist the production API egress IP.
- [ ] Confirm merchant origin PIN and package weight/dimensions required for route-level Speed Post tariff/serviceability checks.
- [ ] Implement the India Post provider adapter only after those prerequisites are verified; keep unknown/error outcomes fail-closed.
- [x] Add regression tests proving malformed PINs are rejected and valid PIN format alone never implies serviceability.
- [x] Expose the serviceability `verified` flag at the top-level API response.
- [ ] Review remaining return/refund and fulfillment transitions for complete automated regression coverage.
- [ ] Verify product sitemap, canonical URLs, metadata and structured data against actual active products.
- [ ] Review upload content decoding/size limits and consider malware scanning or image re-encoding.
- [ ] Review operational alerts for Redis memory pressure, BullMQ queue depth, webhook failures and refund backlog.

## Deployment constraints
- [ ] Configure actual production environment values; `.env.example` intentionally contains blanks/placeholders.
- [ ] Use shared object storage for multi-host/serverless media; a named Docker volume is single-host persistence only.
- [ ] Do not claim a concurrency capacity target until load-tested.
