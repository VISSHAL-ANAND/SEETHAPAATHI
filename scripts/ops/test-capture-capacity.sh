#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
monitor_script="$repo_root/scripts/ops/capture-capacity.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
mock_bin="$tmp_dir/bin"
mkdir -p "$mock_bin"

cat > "$mock_bin/psql" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$MOCK_PG_JSON"
MOCK

cat > "$mock_bin/redis-cli" <<'MOCK'
#!/usr/bin/env bash
case "$*" in
  *"INFO memory")
    printf 'used_memory:%s\nmaxmemory:%s\n' "$MOCK_REDIS_USED_MEMORY" "$MOCK_REDIS_MAX_MEMORY"
    ;;
  *"INFO stats")
    printf 'evicted_keys:%s\n' "$MOCK_REDIS_EVICTED_KEYS"
    ;;
  *"CONFIG GET maxmemory-policy")
    printf 'maxmemory-policy\n%s\n' "$MOCK_REDIS_POLICY"
    ;;
  *)
    echo "Unexpected redis-cli invocation in test." >&2
    exit 2
    ;;
esac
MOCK

cat > "$mock_bin/curl" <<'MOCK'
#!/usr/bin/env bash
config="$(cat)"
{
  printf 'ARGS:%s\\n' "$*"
  printf 'CONFIG:%s\\n' "$config"
} >> "$MOCK_CURL_LOG"
if [[ "$*" == *"alerts.example.test"* ]]; then
  echo "Webhook URL leaked into curl arguments." >&2
  exit 2
fi
if [[ "$config" != *'url = "https://alerts.example.test/webhook"'* ]]; then
  echo "Webhook URL was not supplied through curl stdin config." >&2
  exit 2
fi
MOCK

chmod +x "$mock_bin/psql" "$mock_bin/redis-cli" "$mock_bin/curl"
export PATH="$mock_bin:$PATH"
export PGHOST="127.0.0.1"
export PGPORT="5432"
export PGDATABASE="monitoring_test"
export PGUSER="monitoring_readonly"
export PGPASSWORD="test-only-database-password"
export PGSSLMODE="require"
export REDIS_HOST="127.0.0.1"
export REDIS_PORT="6379"
export REDISCLI_AUTH="test-only-redis-password"
export REDIS_TLS="0"
export PG_STORAGE_LIMIT_BYTES="1000"
export OPS_STORAGE_PATH=""
export OPS_FORCE_ALERT="0"
export OPS_ALERT_WEBHOOK_URL=""
export PG_CONNECTION_WARN_PCT="75"
export PG_CONNECTION_CRITICAL_PCT="90"
export REDIS_MEMORY_WARN_PCT="80"
export REDIS_MEMORY_CRITICAL_PCT="90"
export MOCK_PG_JSON='{"database_size_bytes":100,"max_connections":100,"total_connections":10,"active_connections":1}'
export MOCK_REDIS_USED_MEMORY="50"
export MOCK_REDIS_MAX_MEMORY="100"
export MOCK_REDIS_EVICTED_KEYS="0"
export MOCK_REDIS_POLICY="noeviction"
export MOCK_CURL_LOG="$tmp_dir/curl.log"
: > "$MOCK_CURL_LOG"

echo "Test 1/3: healthy capacity snapshot does not alert"
healthy_output="$(bash "$monitor_script")"
[[ "$healthy_output" == *"capacity snapshot: OK"* ]] || {
  echo "Healthy snapshot did not report OK." >&2
  exit 1
}
[[ ! -s "$MOCK_CURL_LOG" ]] || {
  echo "Healthy snapshot unexpectedly sent an alert." >&2
  exit 1
}

echo "Test 2/3: forced alert reaches the configured webhook"
export OPS_FORCE_ALERT="1"
export OPS_ALERT_WEBHOOK_URL="https://alerts.example.test/webhook"
forced_output="$(bash "$monitor_script")"
[[ "$forced_output" == *"forced alert delivery requested"* ]] || {
  echo "Forced alert marker is missing." >&2
  exit 1
}
[[ -s "$MOCK_CURL_LOG" ]] || {
  echo "Forced alert did not invoke the webhook client." >&2
  exit 1
}

echo "Test 3/3: critical Redis memory returns non-zero and alerts"
: > "$MOCK_CURL_LOG"
export OPS_FORCE_ALERT="0"
export MOCK_REDIS_USED_MEMORY="95"
set +e
critical_output="$(bash "$monitor_script" 2>&1)"
critical_status=$?
set -e
[[ "$critical_status" -eq 1 ]] || {
  echo "Expected critical snapshot exit code 1; received $critical_status." >&2
  echo "$critical_output" >&2
  exit 1
}
[[ "$critical_output" == *"CRITICAL: Redis memory at 95.0%"* ]] || {
  echo "Critical Redis memory message is missing." >&2
  echo "$critical_output" >&2
  exit 1
}
[[ -s "$MOCK_CURL_LOG" ]] || {
  echo "Critical capacity condition did not invoke the webhook client." >&2
  exit 1
}

echo "Capacity monitoring tests passed."
