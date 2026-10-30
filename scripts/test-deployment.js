#!/usr/bin/env node

/**
 * Seethapaati Cloud Deployment Verification Script
 *
 * Verifies connectivity for:
 *  1. Cloud PostgreSQL database (via Prisma)
 *  2. Cloud Redis instance (via ioredis using REDIS_URL or host/port)
 *  3. API Health endpoint (/api/v1/health or /api/health)
 *
 * Usage:
 *   node scripts/test-deployment.js
 *   node scripts/test-deployment.js --api https://api.seethapaati.com/api/v1/health
 *   node scripts/test-deployment.js --db "postgresql://..." --redis "rediss://..."
 */

const fs = require('fs');
const path = require('path');

// -----------------------------------------------------------------------------
// Lightweight .env File Loader (Zero external runtime dependencies)
// -----------------------------------------------------------------------------
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

// Merge environment variables (process.env > apps/api/.env > root .env)
const rootEnv = loadEnvFile(path.resolve(__dirname, '../.env'));
const apiEnv = loadEnvFile(path.resolve(__dirname, '../apps/api/.env'));
const webEnv = loadEnvFile(path.resolve(__dirname, '../apps/web/.env.local'));
const mergedEnv = { ...rootEnv, ...apiEnv, ...webEnv, ...process.env };

// -----------------------------------------------------------------------------
// Parse CLI arguments
// -----------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

const DATABASE_URL = getArg('--db', mergedEnv.DATABASE_URL);
const REDIS_URL = getArg('--redis', mergedEnv.REDIS_URL);
const REDIS_HOST = mergedEnv.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(mergedEnv.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = mergedEnv.REDIS_PASSWORD || undefined;

const API_HEALTH_URL =
  getArg('--api', mergedEnv.API_HEALTH_URL) ||
  (mergedEnv.NEXT_PUBLIC_API_URL
    ? `${mergedEnv.NEXT_PUBLIC_API_URL.replace(/\/+$/, '')}/health`
    : 'https://seethapaati-api.onrender.com/api/v1/health');

// Fallback local health endpoint if testing local development
const LOCAL_HEALTH_URL = `http://localhost:${mergedEnv.PORT || 4000}/api/v1/health`;

// -----------------------------------------------------------------------------
// Dynamic Module Resolvers (portable across root and workspace dirs)
// -----------------------------------------------------------------------------
function resolveWorkspaceModule(moduleName) {
  try {
    return require(moduleName);
  } catch (err) {
    try {
      const resolved = path.resolve(__dirname, '../apps/api/node_modules', moduleName);
      return require(resolved);
    } catch {
      return null;
    }
  }
}

// -----------------------------------------------------------------------------
// Test 1: Cloud PostgreSQL Connection via Prisma
// -----------------------------------------------------------------------------
async function testPostgreSQL() {
  const result = { name: 'PostgreSQL Database', status: 'SKIPPED', details: '', latencyMs: 0 };
  if (!DATABASE_URL) {
    result.details = 'DATABASE_URL not configured in environment or CLI';
    return result;
  }

  const prismaPkg = resolveWorkspaceModule('@prisma/client');
  if (!prismaPkg || !prismaPkg.PrismaClient) {
    result.status = 'FAILED';
    result.details = 'Could not load @prisma/client. Run `npm install` in apps/api';
    return result;
  }

  // Mask database password in output
  const maskedUrl = DATABASE_URL.replace(/:([^@:]+)@/, ':****@');
  const startTime = Date.now();
  const prisma = new prismaPkg.PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
    log: ['error'],
  });

  try {
    await prisma.$connect();
    const rows = await prisma.$queryRaw`SELECT 1 as connected, current_database() as db_name, version() as version`;
    result.latencyMs = Date.now() - startTime;
    result.status = 'PASSED';
    const dbName = rows && rows[0] ? rows[0].db_name : 'unknown';
    result.details = `Connected to db "${dbName}" via ${maskedUrl} (${result.latencyMs}ms)`;
  } catch (err) {
    result.latencyMs = Date.now() - startTime;
    result.status = 'FAILED';
    result.details = `Connection failed: ${err.message} (${maskedUrl})`;
  } finally {
    try {
      await prisma.$disconnect();
    } catch {}
  }
  return result;
}

// -----------------------------------------------------------------------------
// Test 2: Cloud Redis Connection via ioredis
// -----------------------------------------------------------------------------
async function testRedis() {
  const result = { name: 'Redis Cache & Queues', status: 'SKIPPED', details: '', latencyMs: 0 };
  const hasRedisConfig = Boolean(REDIS_URL || mergedEnv.REDIS_HOST);

  if (!hasRedisConfig) {
    result.details = 'REDIS_URL or REDIS_HOST not configured';
    return result;
  }

  const Redis = resolveWorkspaceModule('ioredis');
  if (!Redis) {
    result.status = 'FAILED';
    result.details = 'Could not load ioredis module. Run `npm install` in apps/api';
    return result;
  }

  const startTime = Date.now();
  let client = null;
  const targetDesc = REDIS_URL ? REDIS_URL.replace(/:([^@:]+)@/, ':****@') : `${REDIS_HOST}:${REDIS_PORT}`;

  try {
    const opts = {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    };

    client = REDIS_URL
      ? new Redis(REDIS_URL, opts)
      : new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD, ...opts });
    client.on('error', () => {});
    client.on('error', () => {});

    await client.connect();
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error(`Unexpected PING response: ${pong}`);
    }

    // Test write/read/delete roundtrip
    const testKey = 'seethapaati:deploy:test';
    await client.set(testKey, 'ok', 'EX', 10);
    const readBack = await client.get(testKey);
    await client.del(testKey);

    result.latencyMs = Date.now() - startTime;
    result.status = readBack === 'ok' ? 'PASSED' : 'FAILED';
    result.details = `PING + read/write verified on ${targetDesc} (${result.latencyMs}ms)`;
  } catch (err) {
    result.latencyMs = Date.now() - startTime;
    result.status = 'FAILED';
    result.details = `Connection failed: ${err.message} (${targetDesc})`;
  } finally {
    if (client) {
      try {
        await client.quit();
      } catch {
        try {
          client.disconnect();
        } catch {}
      }
    }
  }
  return result;
}

// -----------------------------------------------------------------------------
// Test 3: Backend /api/health Endpoint
// -----------------------------------------------------------------------------
async function testHealthEndpoint() {
  const result = { name: 'Backend Health Route', status: 'SKIPPED', details: '', latencyMs: 0 };
  const targetUrls = [API_HEALTH_URL];
  if (LOCAL_HEALTH_URL !== API_HEALTH_URL) {
    targetUrls.push(LOCAL_HEALTH_URL);
  }

  let lastError = null;
  for (const url of targetUrls) {
    const startTime = Date.now();
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'User-Agent': 'SeethapaatiDeploymentTest/1.0' },
        signal: AbortSignal.timeout(6000),
      });

      result.latencyMs = Date.now() - startTime;
      if (response.ok) {
        const body = await response.json().catch(() => ({}));
        result.status = 'PASSED';
        result.details = `HTTP ${response.status} from ${url} (${result.latencyMs}ms) — service: ${body.service || 'ok'}`;
        return result;
      } else {
        lastError = `HTTP ${response.status} from ${url}`;
      }
    } catch (err) {
      lastError = `${err.message} from ${url}`;
    }
  }

  result.status = 'FAILED';
  result.details = `Could not reach health endpoint: ${lastError}`;
  return result;
}

// -----------------------------------------------------------------------------
// Runner & Report Output
// -----------------------------------------------------------------------------
async function run() {
  console.log('\n================================================================');
  console.log(' SEETHAPAATI CLOUD DEPLOYMENT VERIFICATION');
  console.log('================================================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Environment: ${mergedEnv.NODE_ENV || 'production'}\n`);

  const tests = [
    await testPostgreSQL(),
    await testRedis(),
    await testHealthEndpoint(),
  ];

  console.log('RESULTS:');
  console.log('----------------------------------------------------------------');
  let hasFailure = false;

  for (const t of tests) {
    let icon = '⚪ [SKIP]';
    if (t.status === 'PASSED') icon = '🟢 [PASS]';
    if (t.status === 'FAILED') {
      icon = '🔴 [FAIL]';
      hasFailure = true;
    }
    console.log(`${icon} ${t.name}`);
    console.log(`       ${t.details}`);
    if (t.latencyMs > 0) {
      console.log(`       Latency: ${t.latencyMs}ms`);
    }
    console.log('');
  }

  console.log('----------------------------------------------------------------');
  if (hasFailure) {
    console.log('⚠️  Deployment verification finished with warnings or failures.');
    console.log('    Check environment variables in Render/Vercel dashboard.');
    process.exit(1);
  } else {
    console.log('✅ All configured deployment targets responded successfully.');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
