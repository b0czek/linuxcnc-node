#!/usr/bin/env bash
set -euo pipefail

image="${1:-linuxcnc-simulator:test}"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
fixture="$(mktemp -d "${TMPDIR:-/tmp}/linuxcnc-simulator-config.XXXXXX")"
container="linuxcnc-simulator-acceptance-$$"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf -- "$fixture"
}
trap cleanup EXIT

cp -a "$repo_root/docker/test-fixture/." "$fixture/"
docker run --detach \
  --name "$container" \
  --cap-add SYS_NICE \
  --cap-add IPC_LOCK \
  --cap-add IPC_OWNER \
  --ulimit rtprio=99 \
  --ulimit memlock=-1:-1 \
  --shm-size 256m \
  --env "LINUXCNC_UID=$(id -u)" \
  --env "LINUXCNC_GID=$(id -g)" \
  --volume "$fixture:/config:rw" \
  "$image" >/dev/null

deadline=$((SECONDS + 60))
while (( SECONDS < deadline )); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")"
  if [[ "$status" == healthy ]]; then
    break
  fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "$container")" != true ]]; then
    docker logs "$container" >&2
    exit 1
  fi
  sleep 1
done

if [[ "${status:-}" != healthy ]]; then
  docker logs "$container" >&2
  exit 1
fi

docker exec "$container" linuxcnc-grpc-live-integration \
  127.0.0.1:50051 \
  /opt/linuxcnc-simulator/test/simple_linear.ngc \
  127.0.0.1:50052

docker stop --time 15 "$container" >/dev/null
if [[ "$(docker inspect --format '{{.State.ExitCode}}' "$container")" != 0 ]]; then
  docker logs "$container" >&2
  exit 1
fi
