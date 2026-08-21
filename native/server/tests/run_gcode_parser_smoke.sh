#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: run_gcode_parser_smoke <smoke-binary>" >&2
  exit 2
fi

binary=$1

# The parser smoke fixtures are owned by this native test and remain
# independent from package-owned files.
fixture_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/fixtures" && pwd)
ini="$fixture_dir/config.ini"
program="$fixture_dir/simple_linear.ngc"
parameter_file="$fixture_dir/sim_mm.var"
tool_table="$fixture_dir/sim_mm.tbl"
workdir=$(mktemp -d "${TMPDIR:-/tmp}/linuxcnc-gcode-parser.XXXXXX")
trap 'rm -rf "$workdir"' EXIT

# The fixture INI names sim_mm.var relative to the process directory. Keep
# that parameter state in the temporary directory so a smoke run never writes
# sim_mm.var or sim_mm.var.bak into the repository.
cp "$ini" "$workdir/machine.ini"
cp "$parameter_file" "$workdir/sim_mm.var"
cp "$tool_table" "$workdir/sim_mm.tbl"

cd "$workdir"
EMC2_HOME="${EMC2_HOME:-}" "$binary" "$workdir/machine.ini" "$program"
