#!/usr/bin/env bash
set -euo pipefail

server="$1"
smoke="$2"
port="${LINUXCNC_GRPC_SMOKE_PORT:-$((52000 + ($$ % 1000)))}"
telemetry_port="${LINUXCNC_POSITION_TELEMETRY_SMOKE_PORT:-$((53000 + ($$ % 1000)))}"
root="$(mktemp -d "${TMPDIR:-/tmp}/linuxcnc-grpc-smoke.XXXXXX")"
cleanup() {
  if [[ -n "${server_pid:-}" ]]; then
    kill -TERM "${server_pid}" 2>/dev/null || true
    for _ in $(seq 1 60); do
      kill -0 "${server_pid}" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "${server_pid}" 2>/dev/null; then
      echo "linuxcnc-grpc-smoke: server did not exit gracefully" >&2
      kill -KILL "${server_pid}" 2>/dev/null || true
      wait "${server_pid}" 2>/dev/null || true
      return 1
    fi
    wait "${server_pid}"
  fi
  rm -rf "$root"
}
trap cleanup EXIT

mkdir -p "$root/workspaces" "$root/active"
cat > "$root/linuxcnc.ini" <<EOF
[DISPLAY]
PROGRAM_PREFIX = $root/active
EOF
: > "$root/nml.conf"

"$server" \
  "--endpoint=127.0.0.1:${port}" \
  "--position-telemetry-endpoint=127.0.0.1:${telemetry_port}" \
  "--ini=$root/linuxcnc.ini" \
  "--nml=$root/nml.conf" \
  "--workspace-root=$root/workspaces" \
  "--active-program-directory=$root/active" \
  "--workspace-ttl-seconds=3600" \
  >"$root/server.log" 2>&1 &
server_pid=$!

for _ in $(seq 1 100); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat "$root/server.log"
    exit 1
  fi
  if grep -q "listening on 127.0.0.1:${port}" "$root/server.log"; then
    break
  fi
  sleep 0.05
done
if ! grep -q "listening on 127.0.0.1:${port}" "$root/server.log"; then
  cat "$root/server.log"
  exit 1
fi
"$smoke" "127.0.0.1:${port}" "127.0.0.1:${telemetry_port}"

# Keep a callback stream active while SIGTERM drives the ordered shutdown.
"$smoke" "127.0.0.1:${port}" --hold-stream &
client_pid=$!
sleep 0.05
kill -TERM "$server_pid"
for _ in $(seq 1 20); do
  kill -0 "$server_pid" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "$server_pid" 2>/dev/null; then
  echo "linuxcnc-grpc-smoke: server exceeded two-second graceful shutdown limit" >&2
  exit 1
fi
wait "$server_pid"
server_pid=""
wait "$client_pid"
