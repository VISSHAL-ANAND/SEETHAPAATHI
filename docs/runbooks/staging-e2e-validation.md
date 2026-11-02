# Staging end-to-end validation plan

This plan is a release gate, not evidence that the tests have already been executed. Run it only against a separate staging deployment with test credentials and synthetic customer data. Never use production customer data or live payment credentials for these tests.

## Preconditions

- Exact Git commit SHA is deployed to staging and recorded.
- Clean staging database migrations completed successfully.
- Staging PostgreSQL and Redis are persistent and monitored.
- Razorpay test account/key pair and test webhook secret are configured.
- Resend test/sandbox configuration or a controlled test inbox is configured.
- Canonical staging HTTPS origin and same-origin API rewrite are working.
- Upload storage persists across a staging web restart.
- Test catalog has at least one in-stock product, one low-stock product and one product with a configured HSN/tax rate.
- Test admin account and a separate customer account are available.
- Shipping test data includes the configured dispatch office and an explicitly marked synthetic order.
- No live India Post CEPt adapter is enabled; use manual tracking entry only.

Record the commit SHA, deployment/build ID, test timestamp, environment, tester and evidence for each test. Redact session cookies, passwords, payment secrets, customer contact details and webhook payloads.

## Browser and authentication

| ID | Scenario | Expected result |
|---|---|---|
| WEB-01 | Open the canonical staging HTTPS site | Valid TLS certificate, no mixed-content failures, correct canonical metadata |
| WEB-02 | Open public catalog and product details | Catalog is loaded from API; active product details and prices match API |
| WEB-03 | Sign in as customer | Session cookie is HttpOnly/Secure/SameSite as configured; no access token appears in localStorage/sessionStorage |
| WEB-04 | Refresh a signed-in page | Session remains valid; API calls use same-origin /api/v1/* path and rewrite reaches API |
| WEB-05 | Sign out | Session cookie is cleared; protected account routes redirect/return unauthorized |
| WEB-06 | Customer calls admin upload endpoint | Request denied with 401/403; no file written |
| WEB-07 | Admin without products.create submits upload | Request denied; no file written |
| WEB-08 | Admin with products.create uploads a valid PNG/JPEG/WebP up to 5 MB | Upload succeeds, generated filename is used, file is retrievable through intended public upload path |
| WEB-09 | Upload oversized or invalid-signature file, including request without Content-Length | Request rejected (413 for over-limit body); no partial file is written |
| WEB-10 | Cross-origin upload request | Rejected by allowed-origin check |

## Catalog, cart, pricing and checkout

| ID | Scenario | Expected result |
|---|---|---|
| SHOP-01 | Add an in-stock item to cart | Correct variant, quantity and price displayed |
| SHOP-02 | Change quantity above available stock | Server rejects or clamps according to API contract; stock never goes negative |
| SHOP-03 | Apply valid and invalid coupon | Valid coupon discount is calculated server-side; invalid/expired coupon does not change total |
| SHOP-04 | Checkout below ₹500 merchandise value after discounts | ₹50 standard shipping is applied |
| SHOP-05 | Checkout at ₹500 or more after discounts | Shipping is free |
| SHOP-06 | Verify HSN tax breakdown | Item tax uses configured tax rate; checkout total matches server calculation |
| SHOP-07 | Create Razorpay order intent, then abandon payment | Order is not treated as paid; cart remains intact; active stock reservation expires/releases by its policy |
| SHOP-08 | Successful test payment followed by signed payment.captured webhook | Payment becomes captured and order paid exactly once; inventory reservation commits; only purchased quantities are removed from cart |
| SHOP-09 | Add items to cart after checkout intent but before successful capture | Successful webhook removes only purchased quantities; later cart additions remain |
| SHOP-10 | Failed payment webhook | Payment/order failure state is recorded and active reservation is released; no stock is sold |
| SHOP-11 | Deliver identical captured webhook twice | Second delivery is idempotent; inventory is not decremented twice and order history is not duplicated |
| SHOP-12 | Deliver webhook with invalid signature | 401/unauthorized response; no payment/order/inventory state mutation |
| SHOP-13 | Deliver captured payment with mismatched amount/currency | Event is not treated as paid; reconciliation/operator path is visible |
| SHOP-14 | Stock becomes unavailable before capture settlement | Order is not marked paid; captured payment results in pending refund workflow; no partial inventory allocation |
| SHOP-15 | Two concurrent checkouts compete for final unit | At most one reservation succeeds; quantity available/reserved remain consistent |

## Returns, refunds and notifications

| ID | Scenario | Expected result |
|---|---|---|
| REF-01 | Request eligible return for delivered order | Return request recorded; only purchased, not-yet-returned quantities are eligible |
| REF-02 | Request quantity exceeding remaining returnable quantity | Request rejected; state unchanged |
| REF-03 | Complete a partial return and request the same units again | Duplicate returned quantity is rejected |
| REF-04 | Reuse refund idempotency key with different order/amount/reason/return ID | Conflict before any gateway refund call |
| REF-05 | Process partial refund in Razorpay test mode | Gateway refund reference recorded; payment/order states remain correct for a partially refunded payment |
| REF-06 | Process full refund | Cumulative refund amount reconciles; payment is marked refunded; order reaches correct final state and history is recorded |
| REF-07 | Simulate timeout after refund provider may have accepted request | Reconciliation checks internal refund ID before retry; no duplicate refund is created |
| REF-08 | Stop worker during a pending outbox event and restart | Expired lease is reclaimable; event is not lost |
| REF-09 | Force email provider 5xx/timeout | Event retries per outbox policy; persisted error contains safe error type, not recipient/provider body |
| REF-10 | Let event exceed max retries | Event becomes terminal FAILED; alert is raised and operator recovery follows runbook |
| REF-11 | Confirm a successful email notification | Email has stable idempotency key; outbox event is completed once |
| REF-12 | Verify automatic SMS/WhatsApp behavior | Do not expect it: those integrations are not implemented/enabled. Public copy must not promise them |

## Fulfilment and tracking

| ID | Scenario | Expected result |
|---|---|---|
| SHIP-01 | Admin dispatches a PACKED order with consignment ID | Shipment is created; order status/history and tracking event update atomically |
| SHIP-02 | Try to dispatch an unpaid/paid-but-not-packed/cancelled order | Rejected; no shipment or history mutation |
| SHIP-03 | Submit duplicate manifest/dispatch | Existing shipment is returned or conflict handled; no duplicate shipment record |
| SHIP-04 | Add valid tracking status progression | Shipment status and supported order state/history update correctly |
| SHIP-05 | Try an invalid/backward tracking transition | Rejected; no status mutation |
| SHIP-06 | View tracking as the customer | Authenticated order details show manually entered carrier/tracking information |
| SHIP-07 | Query PIN serviceability before CEPt approval | Response stays verified=false; no claim is made that syntactically valid PIN is serviceable |

## Infrastructure, failure and recovery

| ID | Scenario | Expected result |
|---|---|---|
| OPS-01 | Stop Redis in staging | Readiness becomes unhealthy; auth rate-limit increment fails closed; no process-local production fallback |
| OPS-02 | Restore Redis | Readiness returns healthy after Redis ready; rate limiting resumes |
| OPS-03 | Fill Redis close to configured memory threshold in isolated test | Alerts trigger before exhaustion; noeviction remains configured; never use production data for destructive tests |
| OPS-04 | Terminate API/worker while outbox events are leased | Expired leases recover; no event is silently dropped |
| OPS-05 | Restore latest database backup to isolated database | Prisma migration state and representative aggregate counts validate; record restore duration and recovery point |
| OPS-06 | Restart web service | Uploaded images remain available on the chosen persistent/shared storage |
| OPS-07 | Trigger alert condition in staging | Alert reaches configured responsible contacts; acknowledgement/recovery is recorded |
| OPS-08 | Load test representative browse/cart/checkout/worker traffic | Record latency, error rates, DB/Redis usage and queue/outbox backlog; do not publish a capacity claim until evaluated |

## Go-live acceptance

All critical tests must pass or have an explicitly accepted risk approved by the business owner. Critical failures include incorrect price/tax/inventory, a payment marked paid without verified capture, duplicate refund, lost order/notification job, unauthorized upload/admin action, an invalid state transition, unverified shipping represented as available, or database restore failure.

Sign off the exact tested commit SHA—not merely the latest branch name. Re-run affected tests after any change to code, dependencies, environment variables, database migrations or routing.
