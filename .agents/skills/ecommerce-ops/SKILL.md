# Seethapaati E-Commerce Operations Skill

## Non-Negotiable Rules

### 1. Zero Secret Leaks
- Never commit `.env`, `.env.*`, `*.key`, `*.pem`, `*.secret`, or any file containing real credentials.
- All environment variables MUST be documented in `.env.example` with placeholder values only.
- All API keys, JWT secrets, DB passwords, and payment credentials must be injected at runtime via environment variables — never hardcoded.
- Pre-commit: scan staged files for patterns matching `rzp_live_`, `re_`, real GSTIN numbers, or JWT tokens before pushing.

### 2. Non-Destructive Refactoring
- Never delete business logic — only extend, replace with improved equivalent, or leave with deprecation comments.
- Database schema migrations must always be `additive` in development and `reversible` in production.
- Preserve all existing service method signatures; add overloads rather than break existing call sites.
- All Prisma schema changes must pass `prisma validate` before commit.

### 3. Minimal File Overwriting
- Edit files surgically — change only the lines required by the task.
- Before overwriting any file > 200 lines, read the entire file first and confirm only target sections are modified.
- Preserve all existing JSDoc / TSDoc comments unrelated to the change.

---

## Shiprocket Fulfillment Architecture

### JWT Caching Strategy (240h / 10-day validity)
```
TOKEN LIFECYCLE:
  Auth Login → Shiprocket JWT (valid 10 days / 240h)
  Cache Key: "shiprocket:jwt_token" in Redis
  Cache TTL: 8 days (691,200 seconds) — refresh before expiry window
  On 401 from any Shiprocket API call:
    1. Delete cache key
    2. Re-authenticate immediately
    3. Retry original request once
  Fallback: In-memory Map<string, {token, expiresAt}> if Redis unavailable
```

### Idempotent Order Generation
```
GUARD CONDITION (must all pass before pushOrderToShiprocket):
  1. order.status === 'PAID' (verified payment captured)
  2. order.shiprocketOrderId IS NULL (not yet pushed)
  3. Payment webhook event processed = true (atomic DB flag)

FLOW:
  payment.captured webhook → handlePaymentCaptured()
    → order.status = PAID (atomic transaction)
    → outbox.enqueueInvoiceGeneration()
    → shippingService.pushOrderToShiprocket() [background, non-blocking]
      → check shiprocketOrderId null guard
      → POST /orders/create/adhoc
      → on success: update order.shiprocketOrderId = data.order_id
      → on failure: log error, do NOT retry immediately (BullMQ retry handles)

DUPLICATE PROTECTION:
  - Check order.shiprocketOrderId !== null before API call
  - Use Redis SET NX (set-if-not-exists) lock: "shiprocket:push:{orderId}"
  - TTL 30 minutes on the lock
```

### Serviceability Endpoint
```
GET /api/shipping/serviceability?pincode={pincode}&weight={grams}
  → Calls Shiprocket: GET /courier/serviceability
    params: pickup_postcode, delivery_postcode, weight, cod=0
  → Returns: { serviceable: bool, couriers: [...], estimatedDays: number }
  → Cache result: Redis key "sr:serviceability:{pincode}:{weight}" TTL 6h
```

### Webhook Handler (/webhooks/shipping)
```
EVENTS:
  - AWB_ASSIGNED: shipment.status → AWB_ASSIGNED, order.trackingNumber = awb
  - PICKED_UP / IN_TRANSIT: shipment.status → IN_TRANSIT
  - OUT_FOR_DELIVERY: shipment.status → OUT_FOR_DELIVERY
  - DELIVERED: shipment.status → DELIVERED, order.deliveredAt = now
  - RTO / RETURNED / CANCELLED: shipment.status → CANCELLED

SECURITY:
  - Validate optional SHIPROCKET_WEBHOOK_TOKEN header if configured
  - Log all incoming payloads for audit trail
  - Return 200 always (Shiprocket retries on non-200)
```

---

## UI Polish Rules

### Typography Hierarchy (Luxury Tea Aesthetic)
```
Primary Headings (h1, h2):
  font-family: 'Cormorant Garamond', 'Playfair Display', serif
  font-weight: 400 (editorial — NOT bold)
  letter-spacing: -0.04em to -0.06em
  line-height: 0.85 to 0.95

Body Copy:
  font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif
  font-size: 12px–14px
  line-height: 1.8–1.95
  font-weight: 400

Micro Labels, Eyebrows, CTAs:
  font-size: 8px–11px
  letter-spacing: 0.15em–0.2em
  text-transform: UPPERCASE
  font-weight: 600
```

### Brand Color Palette
```
Deep Forest Slate:  #1A2820  (primary dark, nav backgrounds)
Warm Linen:         #FAF7F2  (primary canvas/background)
Muted Gold:         #C8A265  (accents, CTAs, hover states)
Current code uses: #241C18 (terroir), #F7F5F0 (canvas), #B8860B (saffron)
These are acceptable — slight warm variation. Use consistently.
```

### Placeholder Purge Checklist
- ❌ "Scroll" / "Scroll down" — replace with directional micro-labels or remove
- ❌ "Lorem ipsum" — must not appear anywhere in production templates
- ❌ "Read more" — replace with contextual link text (e.g. "Explore this blend →")
- ❌ Generic bouncy scroll arrows (animated SVG or emoji arrows) — remove entirely
- ❌ Dummy review text / star ratings with "lorem ipsum" copy — remove or replace with real content
- ❌ "placeholder@example.com" or "test user" display names — remove

### Cart & Commerce UX Rules
- Cart drawer: must open as side sheet, NOT as full-page redirect
- Grammage selector (50g / 100g / 250g): pill buttons, active state = gold border + fill
- Sticky mobile checkout bar: fixed bottom, must not cause layout shift (use `padding-bottom` on body)
- Zero layout shift on font load: use `font-display: swap` with system fallbacks
- All form inputs: border-radius: 0 (editorial square, no pill inputs)

---

## Deployment Rules (Zero-Cost Architecture)
- Health endpoint: `/api/health` → `{ status: "ok", timestamp: ISO8601, uptime: seconds }`
- Keep-alive: configure UptimeRobot or cron-job.org to ping `/api/health` every 14 minutes
- Never log secrets or full request bodies containing card data
- All background jobs (invoice, notification, Shiprocket push) via BullMQ with Redis
- Graceful shutdown: drain BullMQ queues before process.exit()
