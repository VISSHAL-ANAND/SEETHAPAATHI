# ==============================================================================
# Multi-Stage Production Dockerfile for @seethapaati/web (Next.js Standalone)
# ==============================================================================

# Stage 1: Base image
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Stage 2: Dependencies & Build
FROM base AS builder
WORKDIR /app

# Copy package manifests and lockfile across monorepo
COPY package.json ./
COPY package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/web/package.json ./apps/web/

# Install the exact dependency graph recorded in package-lock.json
RUN npm ci

# Copy source code
COPY packages/contracts ./packages/contracts/
COPY apps/web ./apps/web/

# Build shared contracts
RUN npm --workspace=@seethapaati/contracts run build

# Build-time configuration consumed by Next.js rewrites and NEXT_PUBLIC_* bundles.
ARG INTERNAL_API_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STORE_NAME
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID
ARG NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
ENV INTERNAL_API_URL=${INTERNAL_API_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_STORE_NAME=${NEXT_PUBLIC_STORE_NAME}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_RAZORPAY_KEY_ID=${NEXT_PUBLIC_RAZORPAY_KEY_ID}
ENV NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=${NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION}

# Build Next.js storefront in standalone output mode
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm --workspace=@seethapaati/web run build

# Stage 3: Lean Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Run as non-root user for security
USER node

# Copy public static assets and standalone server bundle
COPY --chown=node:node --from=builder /app/apps/web/public ./apps/web/public
COPY --chown=node:node --from=builder /app/apps/web/.next/standalone ./
COPY --chown=node:node --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

# Healthcheck targeting Next.js homepage
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
