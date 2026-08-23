#!/usr/bin/env bash

set -euo pipefail

readonly PATCH_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly BASE_REVISION_FILE="${PATCH_DIR}/base-revision"

if [[ ! -f "${BASE_REVISION_FILE}" ]]; then
  echo "Missing LinuxCNC base revision file: ${BASE_REVISION_FILE}" >&2
  exit 1
fi

readonly BASE_REVISION="$(<"${BASE_REVISION_FILE}")"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/linuxcnc" >&2
  exit 2
fi

readonly LINUXCNC_DIR="$1"

if ! git -C "${LINUXCNC_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a Git checkout: ${LINUXCNC_DIR}" >&2
  exit 1
fi

actual_revision="$(git -C "${LINUXCNC_DIR}" rev-parse HEAD)"
if [[ "${actual_revision}" != "${BASE_REVISION}" ]]; then
  echo "LinuxCNC revision mismatch." >&2
  echo "Expected: ${BASE_REVISION}" >&2
  echo "Actual:   ${actual_revision}" >&2
  exit 1
fi

shopt -s nullglob
patches=("${PATCH_DIR}"/*.patch)

if [[ ${#patches[@]} -eq 0 ]]; then
  echo "No LinuxCNC patches found in ${PATCH_DIR}" >&2
  exit 1
fi

# Later patches may intentionally edit lines introduced by earlier patches,
# which makes a per-patch reverse check insufficient on a completed series.
# Build the expected final index from the pinned baseline and compare only the
# paths owned by the series. Unrelated working-tree changes remain permitted.
readonly PATCH_INDEX_DIR="$(mktemp -d)"
readonly PATCH_INDEX="${PATCH_INDEX_DIR}/index"
trap 'rm -rf -- "${PATCH_INDEX_DIR}"' EXIT

GIT_INDEX_FILE="${PATCH_INDEX}" git -C "${LINUXCNC_DIR}" read-tree HEAD
for patch in "${patches[@]}"; do
  GIT_INDEX_FILE="${PATCH_INDEX}" git -C "${LINUXCNC_DIR}" apply --cached "${patch}"
done

mapfile -d '' patched_paths < <(
  GIT_INDEX_FILE="${PATCH_INDEX}" git -C "${LINUXCNC_DIR}" \
    diff --cached --name-only -z HEAD
)

if GIT_INDEX_FILE="${PATCH_INDEX}" git -C "${LINUXCNC_DIR}" \
    diff --quiet -- "${patched_paths[@]}"; then
  for patch in "${patches[@]}"; do
    echo "Already applied: $(basename -- "${patch}")"
  done
  echo "LinuxCNC patch series ready: 0 applied, ${#patches[@]} already present"
  exit 0
fi

applied=0
for patch in "${patches[@]}"; do
  patch_name="$(basename -- "${patch}")"

  if git -C "${LINUXCNC_DIR}" apply --check "${patch}" 2>/dev/null; then
    echo "Applying ${patch_name}"
    git -C "${LINUXCNC_DIR}" apply "${patch}"
    ((applied += 1))
  elif git -C "${LINUXCNC_DIR}" apply --reverse --check "${patch}" 2>/dev/null; then
    echo "Already applied: ${patch_name}"
  else
    echo "Patch does not apply cleanly: ${patch_name}" >&2
    exit 1
  fi
done

echo "LinuxCNC patch series ready: ${applied} applied, $((${#patches[@]} - applied)) already present"
