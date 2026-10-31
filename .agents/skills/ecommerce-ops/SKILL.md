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

## India Post Fulfillment Architecture

### Fulfillment Engine & Consignment Tracking
All order dispatches are fulfilled via **India Post (Speed Post / Registered Parcel)**:
- **Courier Partner:** India Post (`courierPartner: 'India Post'` by default).
- **Consignment Tracking Link:**
  `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx`
- **Admin Fulfillment Endpoint:**
  `POST /api/v1/admin/orders/:id/fulfill`
  - Accepts `{ trackingNumber: string }` (India Post consignment barcode / article number).
  - Updates order status to `SHIPPED`, stores the unique `trackingNumber`, sets `shippedAt` to current timestamp, and links the public India Post tracking portal.
  - Automatically records state transition in `OrderStatusHistory` and enqueues customer email/SMS dispatch notifications.

### Serviceability Endpoint
```
GET /api/v1/shipping/serviceability?pincode={pincode}
  → Validates against Indian PIN code regex (/^[1-9][0-9]{5}$/).
  → Returns: {
      success: true,
      serviceable: true,
      carrier: "India Post Speed Post",
      estimatedDays: "3-5 Business Days"
    }
  → India Post covers 100% of postal circles and pincodes nationwide.
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
```

### Cart & Commerce UX Rules
- Cart drawer: side sheet pattern (zero page navigation for bag additions)
- Grammage selector: pill buttons, active state = gold border + fill
- Sticky mobile checkout bar: fixed bottom, `pb-20 md:pb-0` on container to prevent layout shift
- Zero layout shift on font load: `next/font` with `display: swap`
- All form inputs: editorial square (`border-radius: 0`)
