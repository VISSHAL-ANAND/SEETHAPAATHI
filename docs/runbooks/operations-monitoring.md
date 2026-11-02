# Production operations and monitoring runbook

Status: repository-side monitoring tooling is prepared; real provider dashboards, host scheduling and alert recipients are not configured yet. Complete the provider-specific steps below before accepting live orders.

## Service health

- Liveness: GET /api/v1/health/live. This indicates that the API process is running; it does not prove database or Redis readiness.
- Readiness: GET /api/v1/health/ready. In production/staging, both PostgreSQL and Redis must be reachable for a ready response.
- Public health: GET /api/v1/health. Use for basic service identity/uptime only.
- Monitor storefront and API availability separately. A healthy API does not prove that Next.js rewrites, browser cookies, or checkout work.

Configure provider health checks to use the readiness route for traffic eligibility and liveness only for process restart decisions. Do not expose internal database/Redis details beyond the public readiness response already returned by the app. The API readiness response reports only broad dependency status; detailed capacity data is collected privately by the host-side script below.


## Automated staging availability and capacity checks

### Staging synthetic availability

`.github/workflows/staging-availability.yml` contains a GitHub Actions probe that runs every 10 minutes after it is enabled. It checks the staging storefront over HTTPS and requires the API `/health/ready` response to report `status: ready`. A failed probe posts a Slack-compatible JSON message (`{"text":"..."}`) to the configured operations webhook.

Configure these repository variables only after a real staging deployment exists:

- `STAGING_MONITORING_ENABLED=true` (enables the scheduled job).
- `STAGING_WEB_URL=https://<staging-storefront-origin>` (origin only).
- `STAGING_API_BASE_URL=https://<staging-api-origin>/api/v1`.

Configure repository secret `MONITORING_ALERT_WEBHOOK_URL` with a webhook that accepts the documented JSON body. Its destination channel must include at least two responsible contacts. Test the route and obtain acknowledgement from both contacts before treating alert routing as complete. Do not put webhook URLs or provider credentials in Git.

This workflow is an availability probe, not browser E2E, payment testing, database restore validation or infrastructure capacity monitoring. It is intentionally skipped until `STAGING_MONITORING_ENABLED` is set to `true`.

### PostgreSQL and Redis capacity snapshot

Run `scripts/ops/capture-capacity.sh` from a trusted host-side scheduler or private operations runner that can reach PostgreSQL and Redis. Do not run it on a public GitHub-hosted runner or expose database/Redis ports to the public internet.

Required environment (inject secrets using the selected host's secret manager):

- PostgreSQL: `PGHOST`, `PGPORT` (default 5432), `PGDATABASE`, `PGUSER` (read-only monitoring account), `PGPASSWORD`, and `PGSSLMODE` (defaults to `require`).
- Redis: `REDIS_HOST`, `REDIS_PORT` (default 6379), `REDISCLI_AUTH`, and `REDIS_TLS=1` when the provider requires TLS.
- Optional provider/storage values: `PG_STORAGE_LIMIT_BYTES` from the provider's database-storage quota and `OPS_STORAGE_PATH` for the persistent upload volume mount.
- Optional alert delivery: `OPS_ALERT_WEBHOOK_URL`, using the same Slack-compatible `{"text":"..."}` payload contract. `OPS_FORCE_ALERT=1` sends a test alert after the snapshot is collected.

The script collects database size and connection utilization, Redis memory/maxmemory/eviction policy and optional upload-filesystem utilization. It reports initial warning/critical thresholds using the table below. Any warning/critical condition exits non-zero; configure the provider scheduler/log monitor to alert on that exit as well as use the webhook. The database size percentage is only an estimate against the quota supplied in `PG_STORAGE_LIMIT_BYTES`; the managed provider dashboard remains authoritative for total storage use, WAL, backups and service-specific quotas.

Schedule the script at least every five minutes, retain aggregate snapshots for trend analysis, and test alert routing with `OPS_FORCE_ALERT=1`. Verify the channel reaches two named people and record each acknowledgement. Use a read-only database role with only the statistics access needed; do not grant application write permissions to the monitoring account. The script never emits credentials or customer records.

## Business-critical signals

| Signal | Initial alert rule | Priority | First response |
|---|---|---|---|
| API readiness unavailable | Any sustained failure for 2 minutes | Critical | Check recent deploy, PostgreSQL connectivity, Redis readiness and environment validation |
| Payment webhook processing | Unprocessed verified events older than 5 minutes | Critical | Check API logs, database locks and Razorpay delivery/retry dashboard; do not manually mark processed |
| Pending refund backlog | A pending refund older than 5 minutes or growing for 10 minutes | Critical | Check reconciliation worker, Razorpay status and provider API; reconcile using the stored internal refund ID before any retry |
| Outbox terminal failures | Any FAILED outbox event | High | Inspect redacted last_error, provider health and retry history; only requeue after cause is fixed |
| Outbox backlog age | Oldest due PENDING event older than 5 minutes | High | Check notification/invoice workers, PostgreSQL, Resend and worker logs |
| Expired outbox lease | Any PROCESSING row with an expired lease | Warning | Check worker crashes/long provider requests; verify the lease owner is no longer executing |
| Redis memory | Above 80% sustained for 10 minutes; critical above 90% | High | Inspect key growth and plan capacity; do not switch to an eviction policy that can evict queue/rate-limit data |
| PostgreSQL capacity | Alert at 75% disk/storage, critical at 85% | High | Review database growth, backups and provider capacity |
| Email delivery | Failed notifications or provider error rate above baseline | High | Check Resend status, verified sender/domain and API key; failed outbox events require controlled recovery |
| Upload failures | Sudden 4xx/5xx increase or any successful upload without correct persistence | Medium/High | Check origin allowlist, session permissions, size limits, disk usage and storage durability |

These are initial operator thresholds, not measured service-level objectives. Tune them against actual traffic and hosting-provider metrics before launch. Route critical alerts to at least two responsible people and test the notification path.

## PostgreSQL checks

Run read-only diagnostic queries against the production database using an authorized, read-only operations account. Do not expose customer payloads, addresses, email addresses, tokens, or payment data in alert messages.

### Outbox health

~~~sql
SELECT
  status,
  event_type,
  count(*) AS event_count,
  min(created_at) AS oldest_created_at
FROM outbox_events
GROUP BY status, event_type
ORDER BY status, event_type;
~~~

### Oldest due and expired-leased outbox events

~~~sql
SELECT
  id,
  event_type,
  aggregate_type,
  aggregate_id,
  status,
  retry_count,
  max_retries,
  leased_until,
  next_retry_at,
  created_at,
  left(coalesce(last_error, ''), 250) AS redacted_error_excerpt
FROM outbox_events
WHERE
  status = 'FAILED'
  OR (status = 'PROCESSING' AND leased_until < now())
  OR (status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= now())
      AND created_at < now() - interval '5 minutes')
ORDER BY created_at ASC
LIMIT 100;
~~~

### Pending refund age

~~~sql
SELECT
  status,
  count(*) AS refund_count,
  min(created_at) AS oldest_created_at
FROM refunds
GROUP BY status
ORDER BY status;
~~~

~~~sql
SELECT id, order_id, payment_id, amount_cents, currency,
       processing_lease_until, created_at
FROM refunds
WHERE status = 'PENDING'
  AND (processing_lease_until IS NULL OR processing_lease_until < now())
  AND created_at < now() - interval '5 minutes'
ORDER BY created_at ASC
LIMIT 100;
~~~

### Unprocessed payment webhook events

~~~sql
SELECT event_type, count(*) AS event_count, min(created_at) AS oldest_created_at
FROM payment_webhook_events
WHERE processed = false
GROUP BY event_type
ORDER BY oldest_created_at ASC;
~~~

Do not include stored webhook payload JSON in monitoring output. It may contain personal or payment-related information.

## Redis checks

Use the hosting provider's Redis metrics or an authenticated administrative connection. Avoid passing passwords on the command line where they can be captured in shell history or process lists. For redis-cli, prefer the REDISCLI_AUTH environment variable in a protected shell.

Inspect:
- INFO memory: used memory, peak memory and configured maximum.
- INFO persistence: AOF/RDB status and last successful persistence activity.
- INFO clients: connected clients and blocked clients.
- INFO stats: rejected connections and command activity.
- DBSIZE: overall key count (interpret with care; it is not a capacity measure).

Production Redis must retain the configured noeviction policy for correctness-sensitive state. Scale capacity or remove confirmed disposable cache entries; do not change to allkeys-lru or another eviction policy to suppress memory alarms.

The API deliberately fails closed for authentication rate-limit increments if production Redis is unavailable. Do not bypass that guard by switching production to process-local counters.

## Refund and payment incident procedure

1. Stop manual retries or state edits until the gateway's current transaction/refund status is checked.
2. Find the persisted refund by internal refund ID and compare it with Razorpay using the adapter's reconciliation path.
3. Check whether the gateway operation already exists. The same internal idempotency identifier must be used; never generate a new key to “try again”.
4. Preserve the pending record and worker lease semantics. Do not mark the order or payment refunded by hand.
5. Record the incident, provider request/reference ID (not credentials), affected order identifier, observed state and resolution.
6. After recovery, confirm cumulative processed refund amount, payment status, order status history and customer notification outbox state.

## Outbox recovery procedure

- First determine why the worker or provider failed. A repeated failure should not be treated as an invitation to delete a row.
- Check whether the external action already succeeded. Email uses a stable idempotency key; payment/refund operations have their own persisted identifiers and reconciliation rules.
- Do not delete an event or manually change status, retry_count, leased_by, or leased_until in the production database as routine recovery.
- If a terminal FAILED event needs replay, use a reviewed administrative recovery tool or a controlled database change with an audit record and explicit idempotency review. No general-purpose replay UI is currently provided.
- Confirm COMPLETED status and the corresponding business record after recovery.

## Database backups and restore drill

Before launch:
- Enable automatic managed-database backups or schedule encrypted pg_dump backups to storage separate from the database host.
- Define an agreed recovery point objective (RPO) and recovery time objective (RTO) with the business/hosting plan.
- Restrict backup access and encrypt backup files at rest and in transit.
- Keep backup retention aligned with the business/legal retention policy.

Restore drill:
1. Restore a recent backup into an isolated, access-restricted non-production database.
2. Run the Prisma migration status/check against the restored database.
3. Verify representative counts and relations for products, variants/inventory, orders, payments, refunds, outbox and shipment records. Use aggregate counts only; do not export customer data for routine checks.
4. Run API read-only smoke tests against the restored copy.
5. Record backup timestamp, restore duration, migration status, verification results and any gap from the target RPO/RTO.

Do not run restore commands against production as a test.

## Release and incident hygiene

- Record the deployed commit SHA, build ID, migration outcome and release time.
- Keep the previous deploy/build available for rollback where the hosting platform supports it.
- Database migrations must be additive/backward-compatible across the overlap period; do not roll back schema changes by deleting production data.
- After every release, verify readiness, storefront rendering, login/session, public catalog, checkout intent in test mode, payment webhook test event, admin upload and tracking route.
- Do not perform a live charge or refund without the business approving the test amount/account and being ready to reconcile it.
- Keep API secrets, cookies, database URLs, customer contact data and webhook payloads out of logs, screenshots and incident tickets.
