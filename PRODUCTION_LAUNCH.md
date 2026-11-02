# SEETHAPAATHI — Production Deployment Guide

This guide describes the deployment path supported by the current repository. It intentionally does not promise automatic courier booking, live PIN-code serviceability, or a particular throughput target unless those integrations have been configured and load-tested.

## 1. Architecture

- Next.js storefront and admin console: `apps/web`
- NestJS API: `apps/api`
- PostgreSQL with Prisma migrations
- Redis/BullMQ for background jobs and distributed coordination
- Razorpay for payment collection and refund processing
- India Post tracking workflow with manual admin dispatch/tracking updates

## 2. Required environment configuration

Use `.env.example` as a variable checklist, not as a source of production credentials. The example seller identity and GSTIN are placeholders. The API deliberately rejects placeholder seller details and placeholder GSTIN values in production.

### Web application

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Browser-facing API URL, including `/api/v1` |
| `INTERNAL_API_URL` | Server-to-server API URL; in Docker Compose use `http://api:3001/api/v1` |
| `NEXT_PUBLIC_SITE_URL` | Canonical storefront origin |
| `NEXT_PUBLIC_STORE_NAME` | Store display name |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Public Razorpay key ID |
| `UPLOAD_DIR` | Persistent upload directory; Docker Compose and Render configure their persistent storage paths |
| `UPLOAD_ALLOWED_ORIGINS` | Comma-separated exact storefront origins allowed to submit admin uploads |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Optional Search Console token |
| `NEXT_PUBLIC_LEGAL_ENTITY_NAME` | Actual registered legal entity; must match API `SELLER_LEGAL_NAME`
| `NEXT_PUBLIC_BUSINESS_REGISTRATION_LABEL`, `NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER` | Optional paired public registration disclosure, only when verified and applicable
| `NEXT_PUBLIC_FSSAI_LICENSE_NUMBER` | Verified 14-digit FSSAI licence/registration number for the relevant licensed business/premises
| `NEXT_PUBLIC_REGISTERED_OFFICE` | Verified registered-office address; must match the statutory business records used by the API
| `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` | Actual designated grievance officer
| `NEXT_PUBLIC_GRIEVANCE_EMAIL`, `NEXT_PUBLIC_PRIVACY_EMAIL`, `NEXT_PUBLIC_LEGAL_EMAIL`, `NEXT_PUBLIC_SUPPORT_EMAIL` | Real, monitored business mailboxes
| `NEXT_PUBLIC_SUPPORT_PHONE_DISPLAY`, `NEXT_PUBLIC_SUPPORT_PHONE_E164`, `NEXT_PUBLIC_WHATSAPP_PHONE` | Verified support/WhatsApp numbers; use `+91XXXXXXXXXX` and `91XXXXXXXXXX` formats for the numeric values

### API

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Set to `production` |
| `PORT` | API listening port |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Recommended Redis connection string; use `rediss://` for TLS providers |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Alternative Redis connection configuration |
| `JWT_SECRET` | Unique random secret, at least 32 characters in production |
| `JWT_EXPIRES_IN` | Session lifetime |
| `CORS_ORIGIN` | Explicit comma-separated trusted web origins; no wildcard |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay API credentials |
| `RAZORPAY_WEBHOOK_SECRET` | Exact secret configured for the Razorpay webhook |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email provider and verified sender |
| `SELLER_LEGAL_NAME`, `SELLER_TRADE_NAME` | Actual registered seller identity |
| `SELLER_GSTIN` | Actual valid GSTIN; state prefix must match `SELLER_STATE_CODE` |
| `SELLER_ADDRESS_LINE1`, `SELLER_ADDRESS_LINE2`, `SELLER_CITY`, `SELLER_STATE`, `SELLER_STATE_CODE`, `SELLER_PINCODE` | Actual statutory seller address |

The web `NEXT_PUBLIC_LEGAL_ENTITY_NAME` and `NEXT_PUBLIC_REGISTERED_OFFICE` disclosures must describe the same verified business identity/address as the API invoice configuration. Public registration and FSSAI details must be checked against the actual licences/registrations and applicable premises; do not copy historic hard-coded website values into production without verification.

Also configure `ADMIN_INITIAL_PASSWORD` before running the initial seed. Do not commit production secrets or real customer data.

## 3. Domain, routing and public business disclosures

Before building the production web application:

1. Purchase the domain and choose the canonical HTTPS origin (for example, `https://shop.your-actual-domain.in`). The value must be an origin only—no path, query, fragment, credentials or trailing slash.
2. Configure `NEXT_PUBLIC_SITE_URL` to that canonical origin. The Next.js production build rejects a missing or non-HTTPS origin.
3. Configure `NEXT_PUBLIC_API_URL` and `INTERNAL_API_URL` for the selected host. The browser sends same-origin `/api/v1/*` requests; `apps/web/next.config.ts` rewrites those requests to the configured API service.
4. Configure `CORS_ORIGIN` and `UPLOAD_ALLOWED_ORIGINS` with the exact storefront origin(s), not wildcard values.
5. Set every `NEXT_PUBLIC_*` statutory and support detail in the web build environment. These are public values bundled into the storefront; do not put credentials or private information in them.
6. Make the web identity/address values agree with the API's `SELLER_*` invoice settings where they describe the same legal entity. Have the business owner verify the entity name, GSTIN, registered office, FSSAI number, officer and contact channels against actual records.

The required public business configuration is also listed in `.env.example`. The web build deliberately rejects missing/placeholder production disclosures. CI uses test fixture values only; they are not real business details.

## 4. Install and build

From the repository root:

```bash
npm ci
npm run db:generate
npm run build:all
npm run typecheck
npm run lint
```

The root `npm run build` command does not build every workspace. Use `npm run build:all` when a complete contracts + API + web build is required.

## 5. Database deployment

Back up the production database before applying migrations. Then deploy the committed migrations:

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

Do not use `prisma migrate dev` against production. Do not patch production tables manually to work around migration drift. Verify the migration history on a clean staging database before production rollout.

Seed only when initializing a new environment:

```bash
npm run db:seed
```

Do not rerun seed operations against an existing production store without reviewing the seed script's effects.

## 6. Docker Compose deployment

Configure all required environment variables in the deployment environment before starting the stack:

```bash
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

PostgreSQL and Redis are bound to localhost for host-only administration. Redis uses `noeviction` and AOF persistence because evicting BullMQ queue keys can lose job state. Monitor Redis memory and queue health; `noeviction` causes writes to fail when Redis reaches its memory limit.

The Compose uploads volume is suitable for a single Docker host. It is not shared storage across multiple hosts. If web replicas run on different hosts, configure shared object storage or a shared filesystem and point `UPLOAD_DIR`/the upload implementation at that storage before enabling multi-host deployment.

The Compose file is a single-host deployment baseline. Do not scale API or web replicas with fixed host port mappings unless a load balancer/reverse proxy and shared storage are configured. No 5,000-concurrent-user capacity claim is made without representative load testing.

## 7. Render Blueprint deployment

The repository's `render.yaml` defines PostgreSQL, Redis Key Value, the API and the web service. The Blueprint expects you to supply the production secrets and statutory seller details through the Render Dashboard.

- Set `NEXT_PUBLIC_API_URL` to the browser-facing API URL ending in `/api/v1`.
- Set `INTERNAL_API_URL` to the API URL reachable by the web service during Next.js build and runtime, ending in `/api/v1`.
- Set `CORS_ORIGIN` on the API and `UPLOAD_ALLOWED_ORIGINS` on the web service to the exact trusted storefront origin(s).
- Configure the actual Razorpay live keys, webhook secret, Resend key, verified sender, and seller legal/GST/address values.
- The web service has a 1 GB persistent disk mounted at the upload directory and is intentionally configured for one instance. Render persistent disks are single-instance and prevent horizontal scaling/zero-downtime deploys; use shared object storage before scaling the web service. See the [Render persistent disk limitations](https://render.com/docs/disks).
- The API is also configured as one instance by default. Increase API instances only after load testing and confirming Redis/database capacity. Render autoscaling requires an eligible workspace plan; see [Render scaling](https://render.com/docs/scaling).

The repository contains a Blueprint definition only. No Render service for this repository was found in the connected Render workspace during this audit, and no deployment was triggered.

## 8. Razorpay configuration

1. Configure the live Razorpay key ID and secret in the API environment.
2. Configure the public key ID in the web environment.
3. In the Razorpay dashboard, register the webhook endpoint:

   ```text
   https://<your-api-host>/api/v1/webhooks/razorpay
   ```

4. Set the webhook secret to the same value as `RAZORPAY_WEBHOOK_SECRET`.
5. Enable at least `payment.captured` and `payment.failed`.
6. Perform a controlled end-to-end payment and refund test in a non-production environment before switching to live traffic.

Payment state is finalized by the signed server-side webhook, not by the browser success callback. A captured payment whose full inventory allocation fails is cancelled and entered into the refund reconciliation queue.

## 9. Shipping and serviceability

The current shipping workflow supports admin-entered India Post tracking numbers and shipment status updates. It does not contain a verified Shiprocket integration. Do not configure Shiprocket credentials or expect automated courier booking from this code.

PIN-code format validation is not a live India Post serviceability lookup. Until an authoritative serviceability provider is integrated, the storefront reports the destination as unverified and does not promise delivery dates.

## 10. Upload storage

The admin upload endpoint requires a valid API session with `products.create` permission. It accepts PNG, JPEG, and WebP images up to 5 MB, verifies file signatures, and generates server-side filenames. SVG uploads are rejected.

For a single-host Docker deployment, the Compose volume persists files across container recreation. For managed/serverless or multi-host hosting, local container storage is not sufficient; configure durable shared object storage before relying on uploaded media.

## 11. Pre-launch verification

- [ ] Configure and independently verify public legal entity, registration, FSSAI, registered office, grievance officer and customer support disclosures.
- [ ] Confirm web public business disclosures match API seller/invoice identity and address.
- [ ] Confirm the purchased canonical HTTPS domain, same-origin API rewrite and exact allowed origins.
- [ ] Configure production PostgreSQL and verify backups/restore procedure.
- [ ] Configure Redis TLS, persistence, memory alerts, and queue monitoring.
- [ ] Configure strong JWT, database, Redis, Razorpay, and email secrets.
- [ ] Configure explicit CORS/upload origins and HTTPS.
- [ ] Apply migrations on a clean staging database and verify rollback/restore plan.
- [ ] Run CI on the exact deployment commit; confirm API and web checks are green.
- [ ] Test customer signup/login, cart, checkout, successful payment, failed payment, duplicate webhook, out-of-stock refund, return, full refund, partial refund, and shipment tracking.
- [ ] Verify upload durability on the actual hosting platform.
- [ ] Run representative load tests before selecting replica counts or claiming capacity.
- [ ] Verify statutory invoice output and actual seller data before issuing live invoices.

A passing CI workflow is necessary but does not replace a staging payment test, restore drill, security review, or legal/tax review.
