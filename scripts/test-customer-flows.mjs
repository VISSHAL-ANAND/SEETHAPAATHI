#!/usr/bin/env node

/**
 * Retired legacy customer-flow script.
 *
 * The previous script defaulted to a Render endpoint and expected an access token
 * in the JSON response. The application now uses HttpOnly session cookies.
 * This file intentionally makes no network requests. Use the staging validation
 * runbook and scripts/test-staging-api-smoke.mjs for the current staging contract.
 */

console.error(
  'This legacy script is retired: it targets an obsolete bearer-token contract and has no safe default environment. ' +
  'Use scripts/test-staging-api-smoke.mjs with an explicit staging API URL and dedicated staging test account.'
);
process.exit(2);
