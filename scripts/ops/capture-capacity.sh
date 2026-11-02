#!/usr/bin/env bash
# Read-only PostgreSQL/Redis capacity snapshot for a trusted host-side scheduler.
# Secrets are supplied through environment variables, never command-line flags.
set -Eeuo pipefail

for command in psql redis-cli jq awk df; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command" >&2
    exit 2
  }
done

: "${PGHOST:?Set PGHOST to the PostgreSQL host}"
: "${PGDATABASE:?Set PGDATABASE to the monitoring database}"
: "${PGUSER:?Set PGUSER to a read-only monitoring account}"
: "${PGPASSWORD:?Set PGPASSWORD through the host secret manager}"
: "${REDIS_HOST:?Set REDIS_HOST to the Redis host}"
: "${REDISCLI_AUTH:?Set REDISCLI_AUTH through the host secret manager}"

PGPORT="${PGPORT:-5432}"
PGSSLMODE="${PGSSLMODE:-require}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_TLS="${REDIS_TLS:-0}"
PG_STORAGE_LIMIT_BYTES="${PG_STORAGE_LIMIT_BYTES:-0}"
OPS_STORAGE_PATH="${OPS_STORAGE_PATH:-}"
OPS_ALERT_WEBHOOK_URL="${OPS_ALERT_WEBHOOK_URL:-}"
OPS_FORCE_ALERT="${OPS_FORCE_ALERT:-0}"

for value in "$PGPORT" "$REDIS_PORT" "$PG_STORAGE_LIMIT_BYTES"; do
  [[ "$value" =~ ^[0-9]+$ ]] || {
    echo "PGPORT, REDIS_PORT and PG_STORAGE_LIMIT_BYTES must be non-negative integers." >&2
    exit 2
  }
done
[[ "$REDIS_TLS" == "0" || "$REDIS_TLS" == "1" ]] || {
  echo "REDIS_TLS must be 0 or 1." >&2
  exit 2
}
[[ "$OPS_FORCE_ALERT" == "0" || "$OPS_FORCE_ALERT" == "1" ]] || {
  echo "OPS_FORCE_ALERT must be 0 or 1." >&2
  exit 2
}

# Do not echo environment variables: PGPASSWORD and REDISCLI_AUTH are secrets.
export PGPASSWORD PGSSLMODE
pg_json="$(
  psql -X -v ON_ERROR_STOP=1 -Atc "
    SELECT json_build_object(
      'database_size_bytes', pg_database_size(current_database()),
      'max_connections', current_setting('max_connections')::integer,
      'total_connections', (SELECT count(*)::integer FROM pg_stat_activity),
      'active_connections', (
        SELECT count(*)::integer FROM pg_stat_activity WHERE state = 'active'
      )
    )::text;
  "
)"

db_size="$(jq -er '.database_size_bytes' <<<"$pg_json")"
db_max_connections="$(jq -er '.max_connections' <<<"$pg_json")"
db_connections="$(jq -er '.total_connections' <<<"$pg_json")"
db_active_connections="$(jq -er '.active_connections' <<<"$pg_json")"

redis_args=(--no-auth-warning --raw -h "$REDIS_HOST" -p "$REDIS_PORT")
if [[ "$REDIS_TLS" == "1" ]]; then
  redis_args+=(--tls)
fi
export REDISCLI_AUTH
redis_memory="$(redis-cli "${redis_args[@]}" INFO memory)"
redis_stats="$(redis-cli "${redis_args[@]}" INFO stats)"
policy_response="$(redis-cli "${redis_args[@]}" CONFIG GET maxmemory-policy 2>/dev/null || true)"
redis_policy="$(tail -n 1 <<<"$policy_response" | tr -d '\r')"

info_value() {
  local key="$1"
  local info="$2"
  awk -F: -v wanted="$key" '$1 == wanted { gsub(/\r/, "", $2); print $2; exit }' <<<"$info"
}

redis_used_memory="$(info_value used_memory "$redis_memory")"
redis_max_memory="$(info_value maxmemory "$redis_memory")"
redis_evicted_keys="$(info_value evicted_keys "$redis_stats")"
redis_used_memory="${redis_used_memory:-0}"
redis_max_memory="${redis_max_memory:-0}"
redis_evicted_keys="${redis_evicted_keys:-unknown}"

[[ "$redis_used_memory" =~ ^[0-9]+$ ]] || {
  echo "Redis INFO did not return a valid used_memory value." >&2
  exit 2
}
[[ "$redis_max_memory" =~ ^[0-9]+$ ]] || {
  echo "Redis INFO did not return a valid maxmemory value." >&2
  exit 2
}

percentage() {
  awk -v used="$1" -v limit="$2" 'BEGIN { if (limit <= 0) print "unknown"; else printf "%.1f", used * 100 / limit }'
}

assess_percentage() {
  local label="$1"
  local value="$2"
  local warning="$3"
  local critical="$4"
  [[ "$value" != "unknown" ]] || return 0

  if awk -v v="$value" -v t="$critical" 'BEGIN { exit !(v >= t) }'; then
    criticals+=("$label at $value% (critical threshold $critical%)")
  elif awk -v v="$value" -v t="$warning" 'BEGIN { exit !(v >= t) }'; then
    warnings+=("$label at $value% (warning threshold $warning%)")
  fi
}

warnings=()
criticals=()

db_connection_pct="$(percentage "$db_connections" "$db_max_connections")"
redis_memory_pct="$(percentage "$redis_used_memory" "$redis_max_memory")"

assess_percentage "PostgreSQL connections" "$db_connection_pct" "${PG_CONNECTION_WARN_PCT:-75}" "${PG_CONNECTION_CRITICAL_PCT:-90}"
assess_percentage "Redis memory" "$redis_memory_pct" "${REDIS_MEMORY_WARN_PCT:-80}" "${REDIS_MEMORY_CRITICAL_PCT:-90}"

if [[ "$PG_STORAGE_LIMIT_BYTES" -gt 0 ]]; then
  db_storage_pct="$(percentage "$db_size" "$PG_STORAGE_LIMIT_BYTES")"
  assess_percentage "PostgreSQL database-size estimate" "$db_storage_pct" "${PG_STORAGE_WARN_PCT:-75}" "${PG_STORAGE_CRITICAL_PCT:-85}"
else
  db_storage_pct="unknown"
  warnings+=("PostgreSQL storage quota not configured; set PG_STORAGE_LIMIT_BYTES from the provider console")
fi

if [[ -n "$OPS_STORAGE_PATH" ]]; then
  if [[ -e "$OPS_STORAGE_PATH" ]]; then
    disk_pct="$(df -P "$OPS_STORAGE_PATH" | awk 'END { gsub(/%/, "", $5); print $5 }')"
    [[ "$disk_pct" =~ ^[0-9]+$ ]] || {
      echo "Could not read filesystem capacity for OPS_STORAGE_PATH." >&2
      exit 2
    }
    assess_percentage "Upload filesystem" "$disk_pct" "${STORAGE_WARN_PCT:-75}" "${STORAGE_CRITICAL_PCT:-85}"
  else
    disk_pct="missing"
    criticals+=("OPS_STORAGE_PATH does not exist")
  fi
else
  disk_pct="not_configured"
fi

if [[ -z "$redis_policy" ]]; then
  warnings+=("Redis maxmemory-policy could not be read; verify noeviction in the provider console")
elif [[ "$redis_policy" != "noeviction" ]]; then
  criticals+=("Redis maxmemory-policy is '$redis_policy', expected 'noeviction'")
fi

status="OK"
if (("${#criticals[@]}" > 0)); then
  status="CRITICAL"
elif (("${#warnings[@]}" > 0)); then
  status="WARNING"
fi

report="SEETHAPAATHI capacity snapshot: $status
PostgreSQL: database_size_bytes=$db_size, storage_usage_pct=$db_storage_pct, connections=$db_connections/$db_max_connections ($db_connection_pct%), active_connections=$db_active_connections
Redis: used_memory_bytes=$redis_used_memory, maxmemory_bytes=$redis_max_memory, memory_usage_pct=$redis_memory_pct, maxmemory_policy=${redis_policy:-unknown}, evicted_keys=$redis_evicted_keys
Upload filesystem usage: $disk_pct"

for item in "${warnings[@]}"; do
  report="${report}
WARNING: ${item}"
done
for item in "${criticals[@]}"; do
  report="${report}
CRITICAL: ${item}"
done
if [[ "$OPS_FORCE_ALERT" == "1" ]]; then
  report+=$'\nTEST: forced alert delivery requested.'
fi

printf '%s\n' "$report"

if [[ "$status" != "OK" || "$OPS_FORCE_ALERT" == "1" ]]; then
  if [[ -z "$OPS_ALERT_WEBHOOK_URL" ]]; then
    echo "OPS_ALERT_WEBHOOK_URL is required to deliver non-OK/test alerts." >&2
    exit 2
  fi
  command -v curl >/dev/null 2>&1 || {
    echo "curl is required to deliver alert notifications." >&2
    exit 2
  }
  payload="$(jq -n --arg text "$report" '{text: $text}')"
  if ! curl --silent --show-error --fail --max-time 10 \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    "$OPS_ALERT_WEBHOOK_URL" >/dev/null; then
    echo "Alert delivery failed; webhook response details were suppressed." >&2
    exit 2
  fi
fi

if [[ "$status" != "OK" ]]; then
  exit 1
fi
\nWARNING: '"$item"
done
for item in "${criticals[@]}"; do
  report+=$'\nCRITICAL: ' "$item"
done
if [[ "$OPS_FORCE_ALERT" == "1" ]]; then
  report+=$'\nTEST: forced alert delivery requested.'
fi

printf '%s\n' "$report"

if [[ "$status" != "OK" || "$OPS_FORCE_ALERT" == "1" ]]; then
  if [[ -z "$OPS_ALERT_WEBHOOK_URL" ]]; then
    echo "OPS_ALERT_WEBHOOK_URL is required to deliver non-OK/test alerts." >&2
    exit 2
  fi
  command -v curl >/dev/null 2>&1 || {
    echo "curl is required to deliver alert notifications." >&2
    exit 2
  }
  payload="$(jq -n --arg text "$report" '{text: $text}')"
  if ! curl --silent --show-error --fail --max-time 10 \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    "$OPS_ALERT_WEBHOOK_URL" >/dev/null; then
    echo "Alert delivery failed; webhook response details were suppressed." >&2
    exit 2
  fi
fi

if [[ "$status" != "OK" ]]; then
  exit 1
fi
\nCRITICAL: '"$item"
done
if [[ "$OPS_FORCE_ALERT" == "1" ]]; then
  report+=$'\nTEST: forced alert delivery requested.'
fi

printf '%s\n' "$report"

if [[ "$status" != "OK" || "$OPS_FORCE_ALERT" == "1" ]]; then
  if [[ -z "$OPS_ALERT_WEBHOOK_URL" ]]; then
    echo "OPS_ALERT_WEBHOOK_URL is required to deliver non-OK/test alerts." >&2
    exit 2
  fi
  command -v curl >/dev/null 2>&1 || {
    echo "curl is required to deliver alert notifications." >&2
    exit 2
  }
  payload="$(jq -n --arg text "$report" '{text: $text}')"
  if ! curl --silent --show-error --fail --max-time 10 \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    "$OPS_ALERT_WEBHOOK_URL" >/dev/null; then
    echo "Alert delivery failed; webhook response details were suppressed." >&2
    exit 2
  fi
fi

if [[ "$status" != "OK" ]]; then
  exit 1
fi
\nWARNING: '"$item"
done
for item in "${criticals[@]}"; do
  report+=$'\nCRITICAL: ' "$item"
done
if [[ "$OPS_FORCE_ALERT" == "1" ]]; then
  report+=$'\nTEST: forced alert delivery requested.'
fi

printf '%s\n' "$report"

if [[ "$status" != "OK" || "$OPS_FORCE_ALERT" == "1" ]]; then
  if [[ -z "$OPS_ALERT_WEBHOOK_URL" ]]; then
    echo "OPS_ALERT_WEBHOOK_URL is required to deliver non-OK/test alerts." >&2
    exit 2
  fi
  command -v curl >/dev/null 2>&1 || {
    echo "curl is required to deliver alert notifications." >&2
    exit 2
  }
  payload="$(jq -n --arg text "$report" '{text: $text}')"
  if ! curl --silent --show-error --fail --max-time 10 \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    "$OPS_ALERT_WEBHOOK_URL" >/dev/null; then
    echo "Alert delivery failed; webhook response details were suppressed." >&2
    exit 2
  fi
fi

if [[ "$status" != "OK" ]]; then
  exit 1
fi
