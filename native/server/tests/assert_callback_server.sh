#!/usr/bin/env bash
set -euo pipefail

source_file="$1"
if grep -Eq 'grpc::(ServerContext|ServerReader|ServerWriter|ServerReaderWriter|ServerAsyncReader|ServerAsyncWriter|ServerAsyncReaderWriter)' "$source_file"; then
  echo "synchronous or completion-queue gRPC API remains in grpc_server.cc" >&2
  exit 1
fi

if grep -Eq 'grpc::Service\b|public [A-Za-z0-9_:]+::Service\b' "$source_file"; then
  echo "non-callback gRPC service implementation remains in grpc_server.cc" >&2
  exit 1
fi

# RPC implementations may use callback reactors only. Fixed daemon-owned
# runtime/control threads are reviewed separately by name.
unexpected_threads="$(grep -En 'std::thread ' "$source_file" |
  grep -Ev 'std::thread (position_poller_|pruner_|timer_|control)([ (;]|$)' || true)"
if [[ -n "$unexpected_threads" ]]; then
  echo "unreviewed application thread remains in grpc_server.cc:" >&2
  echo "$unexpected_threads" >&2
  exit 1
fi


for reviewed_thread in position_poller_ pruner_ timer_ control; do
  count="$(grep -Ec "std::thread ${reviewed_thread}([ (;]|$)" "$source_file")"
  if [[ "$count" -ne 1 ]]; then
    echo "reviewed fixed thread ${reviewed_thread} must appear exactly once" >&2
    exit 1
  fi
done
