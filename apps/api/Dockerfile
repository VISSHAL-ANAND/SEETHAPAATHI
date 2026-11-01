# ==============================================================================
# Multi-Stage Production Dockerfile for @seethapaati/api (NestJS)
# ==============================================================================

# Stage 1: Base image
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

# Stage 2: Dependencies & Build
FROM base AS builder
WORKDIR /app

# Copy package manifests and lockfile across monorepo
COPY package.json ./
COPY package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install the exact workspace dependency graph
RUN npm ci

# Copy source code and Prisma schema
COPY packages/contracts ./packages/contracts/
COPY apps/api ./apps/api/

# Build shared contracts
RUN npm --workspace=@seethapaati/contracts run build

# Generate Prisma Client
RUN npx --workspace=@seethapaati/api prisma generate

# Build NestJS API
RUN npm --workspace=@seethapaati/api run build

# Stage 3: Lean Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl curl

ENV NODE_ENV=production
ENV PORT=3001

# Run as non-root user for security
USER node

# Copy manifests and built artifacts
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/contracts ./packages/contracts
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/apps/api/prisma ./apps/api/prisma

EXPOSE 3001

# Healthcheck targeting NestJS readiness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/v1/health || exit 1

CMD ["node", "apps/api/dist/main.js"]
