# SEETHAPAATHI

SEETHAPAATHI is an e-commerce platform for a South Indian pantry and food brand. The repository contains a Next.js storefront/admin console, a NestJS API, shared contracts, PostgreSQL/Prisma persistence, Redis/BullMQ background processing, and Razorpay payment integration.

## Technology

- **Web:** Next.js App Router, React, TypeScript, Tailwind CSS
- **API:** NestJS, TypeScript
- **Database:** PostgreSQL with Prisma migrations
- **Jobs/cache:** Redis and BullMQ
- **Contracts:** shared TypeScript/Zod package
- **Payments:** Razorpay with server-side webhook verification
- **Shipping:** India Post tracking workflow with manual dispatch entry

## Repository layout

```text
apps/
  api/          NestJS API, Prisma schema/migrations, tests
  web/          Next.js storefront and admin console
packages/
  contracts/    Shared API schemas and TypeScript contracts
scripts/        Operational and deployment scripts
.github/        CI workflows
```

## Requirements

- Node.js 20 or newer (CI currently uses Node.js 22)
- npm
- PostgreSQL
- Redis for production queues and distributed rate limiting

## Local development

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Configure the API environment. Start from `.env.example` and supply local PostgreSQL, Redis, JWT, Razorpay test, and seller configuration values. Do not use example credentials or placeholder statutory seller details in production.

3. Generate the Prisma client and apply migrations to your development database:

   ```bash
   npm run db:generate
   npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
   ```

4. Build the shared contracts package:

   ```bash
   npm run build:contracts
   ```

5. Run the API and web app in separate terminals:

   ```bash
   npm run dev:api
   npm run dev:web
   ```

The API uses the configured `PORT` (4000 by default in its environment schema). The Next.js development server uses its standard port 3000.

## Build, typecheck, lint, and tests

Build all workspaces:

```bash
npm run build:all
```

Typecheck and lint:

```bash
npm run typecheck
npm run lint
```

Run API tests:

```bash
npm test --workspace=@seethapaati/api -- --runInBand
```

CI runs Prisma migrations against a clean PostgreSQL service, API typecheck/lint/tests/build, and web typecheck/lint/build. Keep these checks green before deployment.

## Production deployment

See [PRODUCTION_LAUNCH.md](./PRODUCTION_LAUNCH.md) for environment setup, migrations, deployment, and provider configuration.

For Docker Compose, configure the required environment values before starting the stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The Compose stack binds PostgreSQL and Redis to localhost and uses a persistent named volume for storefront uploads on a single Docker host. Multi-host deployments need shared object storage for uploaded images; a local Docker volume is not a distributed storage system.

## Important operational behavior

- **Authentication:** API sessions are carried in HttpOnly cookies. Access tokens are not returned to browser clients or persisted in localStorage.
- **Authorization:** admin operations are guarded by server-side permissions.
- **Uploads:** the admin image endpoint accepts PNG, JPEG, and WebP files up to 5 MB, checks file signatures, and uses generated filenames.
- **Checkout:** cart contents remain available until payment capture is confirmed. The payment webhook removes only the quantities in the order snapshot.
- **Inventory:** payment settlement reconciles every order line; if a captured payment cannot be fully allocated, the order is cancelled and a refund record is queued.
- **Refunds:** payment and order states are updated after the refund provider confirms processing.
- **Shipping:** dispatch is allowed only for eligible paid/fulfillment-stage orders. PIN format validation is not a carrier serviceability check; the storefront reports serviceability as unverified until a live source is configured.

## Production readiness notes

Before enabling live traffic, verify all provider credentials, Razorpay webhook configuration, real registered seller/GST details, database backups, Redis persistence/monitoring, and shared upload storage for multi-host deployments. A green CI run does not replace a production payment/shipping smoke test or a legal/tax review.
