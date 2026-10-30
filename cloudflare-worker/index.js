/**
 * Cloudflare Worker: Seethapaati Backend Keep-Alive
 *
 * Runs on a 10-minute cron schedule ("*\/10 * * * *") to prevent serverless/free-tier
 * backend instances (e.g., Render, Railway, Fly.io) from entering cold-start idle sleep.
 */

const DEFAULT_HEALTH_URL = 'https://seethapaati-api.onrender.com/api/v1/health';

/**
 * Perform health probe to the target backend service
 * @param {string} targetUrl
 */
async function probeHealth(targetUrl) {
  const startTime = Date.now();
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Cloudflare-Worker-KeepAlive/1.0 (+https://seethapaati.com)',
        'Accept': 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache, no-store',
      },
    });

    const durationMs = Date.now() - startTime;
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = await response.text();
    }

    return {
      success: response.ok,
      status: response.status,
      durationMs,
      targetUrl,
      payload,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      durationMs: Date.now() - startTime,
      targetUrl,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

export default {
  /**
   * Cron Trigger Handler (invoked by Cloudflare Cron Triggers every 10 minutes)
   */
  async scheduled(event, env, ctx) {
    const targetUrl = env.BACKEND_HEALTH_URL || DEFAULT_HEALTH_URL;
    console.log(`[KeepAlive Cron] Pinging ${targetUrl} at ${new Date().toISOString()}`);

    const result = await probeHealth(targetUrl);

    if (result.success) {
      console.log(`[KeepAlive Success] Backend responded in ${result.durationMs}ms with HTTP ${result.status}`);
    } else {
      console.error(`[KeepAlive Warning] Failed to ping backend: ${result.error || `HTTP ${result.status}`}`);
    }
  },

  /**
   * HTTP Fetch Handler (allows manual ping verification via browser/curl)
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = env.BACKEND_HEALTH_URL || DEFAULT_HEALTH_URL;

    // Direct manual health check trigger
    const result = await probeHealth(targetUrl);

    const body = {
      service: 'seethapaati-keepalive-worker',
      description: 'Pings backend every 10 minutes to eliminate cold starts',
      cronSchedule: '*/10 * * * *',
      target: targetUrl,
      lastCheck: result,
    };

    return new Response(JSON.stringify(body, null, 2), {
      status: result.success ? 200 : 502,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
        'X-KeepAlive-Worker': 'active',
      },
    });
  },
};
