# Cloudflare Worker — Backend Keep-Alive

A lightweight Cloudflare Worker configured with Cron Triggers to ping the Seethapaati backend `/api/v1/health` endpoint every 10 minutes (`*/10 * * * *`). This prevents free-tier container sleep and eliminates cold starts.

## Files
- `index.js`: Worker implementation with `scheduled()` (cron) and `fetch()` (manual HTTP probe) handlers.
- `wrangler.toml`: Worker configuration with cron trigger.

## Deployment Instructions

```bash
# 1. Navigate to this folder
cd cloudflare-worker

# 2. Test locally
npx wrangler dev

# 3. Deploy to Cloudflare
npx wrangler deploy
```

## Customizing Backend URL
Update `BACKEND_HEALTH_URL` in `wrangler.toml` or set via Cloudflare Dashboard secrets:
```bash
npx wrangler secret put BACKEND_HEALTH_URL
```
