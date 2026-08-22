#!/usr/bin/env bash
set -euo pipefail

server="$1"
client="$2"
root="$(mktemp -d "${TMPDIR:-/tmp}/linuxcnc-position-wss.XXXXXX")"
grpc_port=$((54000 + ($$ % 500)))
telemetry_port=$((54500 + ($$ % 500)))

cleanup() {
  if [[ -n "${server_pid:-}" ]]; then
    kill -TERM "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$root"
}
trap cleanup EXIT

mkdir -p "$root/workspaces" "$root/active"
printf '[DISPLAY]\nPROGRAM_PREFIX = %s\n' "$root/active" > "$root/linuxcnc.ini"
: > "$root/nml.conf"

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=telemetry-test-ca \
  -keyout "$root/ca.key" -out "$root/ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -subj /CN=localhost \
  -keyout "$root/server.key" -out "$root/server.csr" >/dev/null 2>&1
openssl x509 -req -days 1 -CA "$root/ca.crt" -CAkey "$root/ca.key" -CAcreateserial \
  -in "$root/server.csr" -out "$root/server.crt" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -subj /CN=renderer \
  -keyout "$root/client.key" -out "$root/client.csr" >/dev/null 2>&1
openssl x509 -req -days 1 -CA "$root/ca.crt" -CAkey "$root/ca.key" -CAcreateserial \
  -in "$root/client.csr" -out "$root/client.crt" >/dev/null 2>&1

"$server" \
  "--endpoint=127.0.0.1:${grpc_port}" \
  "--position-telemetry-endpoint=127.0.0.1:${telemetry_port}" \
  "--ini=$root/linuxcnc.ini" \
  "--nml=$root/nml.conf" \
  "--workspace-root=$root/workspaces" \
  "--active-program-directory=$root/active" \
  --tls --mtls \
  "--tls-certificate=$root/server.crt" \
  "--tls-private-key=$root/server.key" \
  "--tls-client-ca=$root/ca.crt" \
  > "$root/server.log" 2>&1 &
server_pid=$!

for _ in $(seq 1 100); do
  grep -q "position telemetry on 127.0.0.1:${telemetry_port}" "$root/server.log" && break
  kill -0 "$server_pid" 2>/dev/null || { cat "$root/server.log"; exit 1; }
  sleep 0.05
done
grep -q "position telemetry on 127.0.0.1:${telemetry_port}" "$root/server.log"

"$client" "127.0.0.1:${telemetry_port}" "$root/ca.crt" \
  "$root/client.crt" "$root/client.key" ok
"$client" "127.0.0.1:${telemetry_port}" "$root/ca.crt" --expect-rejected
