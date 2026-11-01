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

## Product/integration follow-ups
- [ ] Select and integrate an authoritative India Post PIN-code serviceability source; until then keep the storefront fail-closed.
- [ ] Review remaining return/refund and fulfillment transitions for complete automated regression coverage.
- [ ] Verify product sitemap, canonical URLs, metadata and structured data against actual active products.
- [ ] Review upload content decoding/size limits and consider malware scanning or image re-encoding.
- [ ] Review operational alerts for Redis memory pressure, BullMQ queue depth, webhook failures and refund backlog.

## Deployment constraints
- [ ] Configure actual production environment values; `.env.example` intentionally contains blanks/placeholders.
- [ ] Use shared object storage for multi-host/serverless media; a named Docker volume is single-host persistence only.
- [ ] Do not claim a concurrency capacity target until load-tested.
