#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo "usage: $0 <composition-source> [service-source ...]" >&2
  exit 2
fi

control_source="$1"
source_files=("$@")

if grep -Eq 'grpc::(ServerContext|ServerReader|ServerWriter|ServerReaderWriter|ServerAsyncReader|ServerAsyncWriter|ServerAsyncReaderWriter)' -- "$control_source"; then
  echo "synchronous or completion-queue gRPC API remains in the composition source" >&2
  exit 1
fi

if grep -Eq 'grpc::Service\b|public [A-Za-z0-9_:]+::Service\b' -- "$control_source"; then
  echo "non-callback gRPC service implementation remains in the composition source" >&2
  exit 1
fi

# The listed RPC implementations use callback reactors. Program upload is a
# separately reviewed bounded synchronous service and is intentionally omitted.
# Fixed daemon-owned runtime/control threads are reviewed separately by name.
unexpected_threads="$(grep -En 'std::thread ' "${source_files[@]}" |
  grep -Ev 'std::thread (position_poller_|pruner_|timer_|control_thread_)([ (;]|$)' || true)"
if [[ -n "$unexpected_threads" ]]; then
  echo "unreviewed application thread remains in the gRPC server sources:" >&2
  echo "$unexpected_threads" >&2
  exit 1
fi

for reviewed_thread in position_poller_ control_thread_; do
  count="$(grep -Eho "std::thread ${reviewed_thread}([ (;]|$)" "${source_files[@]}" | wc -l)"
  if [[ "$count" -ne 1 ]]; then
    echo "reviewed fixed thread ${reviewed_thread} must appear exactly once" >&2
    exit 1
  fi
done

timer_count="$(grep -Eho 'std::thread timer_([ (;]|$)' "${source_files[@]}" |
  wc -l || true)"
if grep -Eq 'std::thread timer_([ (;]|$)' "${source_files[@]}" &&
   [[ "$timer_count" -ne 1 ]]; then
  echo "reviewed fixed thread timer_ must appear exactly once" >&2
  exit 1
fi

exit 0
