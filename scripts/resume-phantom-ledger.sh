#!/usr/bin/env bash
set -euo pipefail

JOB_ID="${JOB_ID:-a880ab98-52a7-49ae-b52f-4a1b83a90926}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
MAX_STEPS="${MAX_STEPS:-300}"
MAX_RUNTIME_MINUTES="${MAX_RUNTIME_MINUTES:-360}"
DEV_LOG="${DEV_LOG:-/tmp/drivetimetales-next-dev.log}"
AUDIT_AFTER="${AUDIT_AFTER:-true}"
REPORT_DIR="${REPORT_DIR:-reports/production-autopilot}"
AUDIT_OUTPUT="${AUDIT_OUTPUT:-${REPORT_DIR}/phantom-ledger-ready-audit-latest.json}"
CHECK_ENV="${CHECK_ENV:-true}"
PHANTOM_ENV_FILE="${PHANTOM_ENV_FILE:-.env.local}"
FORCE_RESTART_DEV="${FORCE_RESTART_DEV:-false}"
FORCE_KILL_PORT="${FORCE_KILL_PORT:-false}"
CLEAN_NEXT_BUILD="${CLEAN_NEXT_BUILD:-false}"
DEV_PID_FILE="${DEV_PID_FILE:-/tmp/drivetimetales-next-dev.pid}"
RUN_NEXT_TRANSPORT="${RUN_NEXT_TRANSPORT:-fetch}"
DOCTOR_BEFORE_AUTOPILOT="${DOCTOR_BEFORE_AUTOPILOT:-true}"
DOCTOR_OUTPUT="${DOCTOR_OUTPUT:-${REPORT_DIR}/phantom-ledger-doctor-latest.json}"
DEV_STARTED=false

route_status() {
  curl -s --max-time 10 -o /dev/null -w '%{http_code}' "${BASE_URL%/}/api/admin/production-jobs/run-next" || true
}

wait_for_route() {
  local attempts="${1:-30}"
  local status
  for _ in $(seq 1 "$attempts"); do
    status="$(route_status)"
    if [[ "$status" != "000" ]]; then
      echo "$status"
      return 0
    fi
    sleep 1
  done
  echo "000"
  return 1
}

start_dev_server() {
  local port="$1"
  if [[ "$CLEAN_NEXT_BUILD" == "true" ]]; then
    echo "[phantom-ledger] Removing .next before dev restart"
    rm -rf .next
  fi
  echo "[phantom-ledger] Starting Next dev server on 127.0.0.1:${port}"
  (npx next dev --hostname 127.0.0.1 --port "$port" >"$DEV_LOG" 2>&1 & echo $! > "$DEV_PID_FILE")
  DEV_STARTED=true
}

stop_dev_server() {
  local port="$1"
  local old_pid
  if [[ -f "$DEV_PID_FILE" ]]; then
    old_pid="$(cat "$DEV_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$old_pid" ]]; then
      echo "[phantom-ledger] Stopping existing dev server pid ${old_pid}"
      kill "$old_pid" 2>/dev/null || true
    fi
  fi

  if command -v lsof >/dev/null 2>&1; then
    local port_pids
    port_pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
    if [[ -n "$port_pids" ]]; then
      echo "[phantom-ledger] Stopping process(es) listening on port ${port}: ${port_pids//$'\n'/ }"
      while IFS= read -r pid; do
        [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
      done <<< "$port_pids"
    fi
  fi

  if command -v lsof >/dev/null 2>&1; then
    for _ in $(seq 1 10); do
      if [[ -z "$(lsof -ti "tcp:${port}" 2>/dev/null || true)" ]]; then
        return 0
      fi
      sleep 1
    done
    local lingering_pids
    lingering_pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
    echo "[phantom-ledger] Port ${port} still has listener(s) after stop request: ${lingering_pids//$'\n'/ }" >&2
    if [[ "$FORCE_KILL_PORT" == "true" && -n "$lingering_pids" ]]; then
      echo "[phantom-ledger] FORCE_KILL_PORT=true; sending SIGKILL to lingering listener(s)" >&2
      while IFS= read -r pid; do
        [[ -n "$pid" ]] && kill -9 "$pid" 2>/dev/null || true
      done <<< "$lingering_pids"
      for _ in $(seq 1 5); do
        if [[ -z "$(lsof -ti "tcp:${port}" 2>/dev/null || true)" ]]; then
          return 0
        fi
        sleep 1
      done
    fi
    return 1
  fi

  sleep 2
}

print_route_failure_context() {
  local port="$1"
  echo "[phantom-ledger] run-next route did not become reachable. Dev log: ${DEV_LOG}" >&2
  if command -v lsof >/dev/null 2>&1; then
    local listeners
    listeners="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$listeners" ]]; then
      echo "[phantom-ledger] Listener(s) currently reported on port ${port}:" >&2
      echo "$listeners" >&2
    else
      echo "[phantom-ledger] No listener reported on port ${port}" >&2
    fi
  fi
  if [[ -f "$DEV_LOG" ]]; then
    echo "[phantom-ledger] Last dev log lines:" >&2
    tail -n 40 "$DEV_LOG" >&2 || true
  fi
}

echo "[phantom-ledger] Verifying run-next route at ${BASE_URL}"
if [[ "$CHECK_ENV" != "false" ]]; then
  node scripts/check-production-env.js --env-path "$PHANTOM_ENV_FILE" >/dev/null
fi
set -a
source "$PHANTOM_ENV_FILE"
set +a
port="$(node -e "const u=new URL(process.argv[1]); console.log(u.port || (u.protocol === 'https:' ? '443' : '80'))" "$BASE_URL")"

if [[ "$FORCE_RESTART_DEV" == "true" ]]; then
  stop_dev_server "$port" || true
  start_dev_server "$port"
  status="$(wait_for_route 45)" || true
else
  status="$(route_status)"
fi

if [[ "$status" == "000" ]]; then
  echo "[phantom-ledger] Route unavailable on first check; retrying before starting dev server"
  status="$(wait_for_route 5)" || true
fi

if [[ "$status" == "000" ]]; then
  echo "[phantom-ledger] Route still unavailable"
  if [[ "$DEV_STARTED" != "true" ]]; then
    start_dev_server "$port"
  else
    echo "[phantom-ledger] Dev server was already started in this run; not starting a duplicate listener"
  fi
  status="$(wait_for_route 45)" || {
    print_route_failure_context "$port"
    exit 1
  }
fi

if [[ "$status" != "405" && "$status" != "200" && "$status" != "400" ]]; then
  if [[ "$FORCE_RESTART_DEV" == "true" ]]; then
    echo "[phantom-ledger] Route returned ${status} after forced restart. Dev log: ${DEV_LOG}" >&2
  fi
  echo "[phantom-ledger] Unexpected run-next route status: ${status}" >&2
  exit 1
fi

echo "[phantom-ledger] run-next route reachable with status ${status}"
if [[ "$DOCTOR_BEFORE_AUTOPILOT" != "false" ]]; then
  echo "[phantom-ledger] Running read-only doctor before autopilot"
  mkdir -p "$(dirname "$DOCTOR_OUTPUT")"
  doctor_status=0
  node scripts/phantom-ledger-doctor.js \
    --job-id "$JOB_ID" \
    --base-url "$BASE_URL" \
    --env-path "$PHANTOM_ENV_FILE" \
    --dev-log "$DEV_LOG" \
    --json > "$DOCTOR_OUTPUT" || doctor_status=$?
  if [[ "$doctor_status" -ne 0 ]]; then
    echo "[phantom-ledger] Doctor preflight failed. Report: ${DOCTOR_OUTPUT}" >&2
    exit "$doctor_status"
  fi
fi

echo "[phantom-ledger] Resuming existing job ${JOB_ID}; publish endpoints are not invoked by production-autopilot"

autopilot_status=0
npm run production:autopilot -- \
  --job-id "$JOB_ID" \
  --base-url "$BASE_URL" \
  --run-next-transport "$RUN_NEXT_TRANSPORT" \
  --max-steps "$MAX_STEPS" \
  --max-runtime-minutes "$MAX_RUNTIME_MINUTES" || autopilot_status=$?

if [[ "$AUDIT_AFTER" != "false" ]]; then
  echo "[phantom-ledger] Auditing Content Approval Ready for Review state"
  audit_status=0
  node scripts/audit-phantom-ledger-ready.js --job-id "$JOB_ID" --output "$AUDIT_OUTPUT" || audit_status=$?
  if [[ "$audit_status" -ne 0 ]]; then
    echo "[phantom-ledger] Audit did not prove Ready for Review. Report: ${AUDIT_OUTPUT}" >&2
    exit "$audit_status"
  fi
fi

if [[ "$autopilot_status" -ne 0 ]]; then
  echo "[phantom-ledger] Autopilot exited with status ${autopilot_status}" >&2
  exit "$autopilot_status"
fi
