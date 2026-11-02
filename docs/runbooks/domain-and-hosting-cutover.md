# Domain and hosting cutover runbook

Status: preparation only. No domain has been purchased, no DNS records have been changed, and no production deployment has been triggered.

## 1. Decisions that must be made after the domain is purchased

- Choose the hosting target for the API and storefront. The repository has a Render Blueprint and a Docker Compose single-host option; the final target is not yet selected.
- Choose one canonical storefront origin, for example `https://shop.example`. Decide whether `www` redirects to the apex domain or the reverse.
- Decide how browser requests to `/api/v1/*` reach the API. The browser API client deliberately uses a same-origin relative path so HttpOnly session cookies remain first-party. The selected host must route those requests to the API service. Do not assume that setting `NEXT_PUBLIC_API_URL` alone creates this proxy.
- Keep HTTPS enabled on the storefront and API. Never expose PostgreSQL or Redis to the public internet.

## 2. Environment values to configure

Set actual values only after the domain and hosting provider are known:

| Variable | Required value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical HTTPS storefront origin, no path or trailing slash |
| `NEXT_PUBLIC_API_URL` | Browser-facing API origin/path expected by the selected host and server-side code |
| `INTERNAL_API_URL` | API URL reachable from the web service during build and server rendering |
| `CORS_ORIGIN` | Exact trusted storefront origin(s), comma-separated; no wildcard |
| `UPLOAD_ALLOWED_ORIGINS` | Exact browser origin(s) allowed to submit admin uploads |
| `RAZORPAY_WEBHOOK_SECRET` | Secret matching the webhook configured in the Razorpay dashboard |
| `EMAIL_FROM` | Verified sender address at the transactional email provider |

`NEXT_PUBLIC_SITE_URL` is a build-time public value in the Next.js application. Changing it requires a new web build/deployment.

The Render Blueprint now asks for `NEXT_PUBLIC_SITE_URL` instead of assuming `seethapaati.com`. Docker Compose already requires it. Do not put credentials in this file, in Git, or in DNS records.

## 3. Host-specific configuration

### Docker Compose on one Linux host

- Put a maintained reverse proxy (for example, Caddy or Nginx) in front of the web and API services.
- The Compose file publishes the web and API ports on loopback only: web `127.0.0.1:3000`, API `127.0.0.1:3001`. The host reverse proxy can reach them; remote clients cannot connect directly to those ports.
- Configure HTTPS on ports 443 and HTTP-to-HTTPS redirection on port 80. Route storefront requests to port 3000 and `/api/v1/*` requests to the API on port 3001, preserving the full path and forwarding the original host/proto headers.
- Keep PostgreSQL and Redis loopback-only. Do not open ports 5432 or 6379 in the cloud firewall.
- Persist PostgreSQL, Redis and upload data. The upload volume is single-host storage only; do not add web replicas until shared object storage is implemented.

### Managed hosting

- Add the purchased domain in the hosting provider dashboard and copy the exact DNS records it provides. Do not invent A, AAAA, CNAME, or verification records.
- Confirm that the provider's routing configuration sends browser `/api/v1/*` requests to the API service while keeping the browser-visible origin same-site.
- Configure health checks to use `/api/v1/health/ready` for API readiness, not only the lightweight liveness endpoint.
- Confirm persistent upload storage, database backups, Redis persistence and allowed network access for the selected provider.
- The Render Blueprint is an optional template, not evidence that Render has been selected or that any Render service exists.

## 4. DNS and certificate cutover checklist

1. Register the domain with the chosen registrar.
2. Add the domain to the chosen hosting provider and copy the exact DNS records from that provider.
3. Add only the provider-specified DNS records; wait for the provider to confirm ownership and certificate issuance.
4. Select one canonical hostname and configure redirects from alternate hostnames.
5. Verify HTTPS certificate validity, HTTP-to-HTTPS redirect, and absence of mixed-content requests.
6. Configure the exact origins in `CORS_ORIGIN` and `UPLOAD_ALLOWED_ORIGINS`.
7. Set the canonical URL and API routing variables, then rebuild/redeploy the web app.
8. Verify login, logout, cart, checkout, admin upload, and Razorpay webhook reachability through the public hostnames.

## 5. Go-live gates

Do not switch live traffic until all are true:

- CI passes on the exact deployment commit.
- Clean database migration deployment succeeds and a tested backup/restore path exists.
- Production secrets, real seller/GST details, verified email sender and Razorpay live credentials are supplied by the business.
- Browser `/api/v1/*` requests reach the API and session cookies work on the purchased domain.
- Upload storage survives redeploy/restart on the actual host.
- Razorpay test payment, duplicate webhook, failed payment, refund and webhook retry flows pass in staging.
- Redis readiness, outbox backlog/failures, database health and application errors are monitored.
- Admin access is verified and the initial admin password is changed/removed from bootstrap configuration.
- No staging secrets or test credentials remain in the production environment.

This runbook is intentionally host-neutral. Do not create DNS records, issue certificates, open firewall ports, or trigger a deployment until the domain and hosting target are confirmed.
