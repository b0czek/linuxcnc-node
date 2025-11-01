#!/bin/bash
# Script to start LinuxCNC simulator for integration testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SIM_DIR="$PROJECT_ROOT/tests/linuxcnc-sim"

cd "$SIM_DIR"

echo "Starting LinuxCNC simulator..."
echo "Configuration: sim.ini"
echo "Directory: $SIM_DIR"
echo ""
echo "To stop LinuxCNC, press Ctrl+C or run: npm run linuxcnc:stop"
echo ""

# Check if LinuxCNC is already running
if pgrep -f "linuxcnc.*sim.ini" > /dev/null; then
    echo "Warning: LinuxCNC appears to already be running"
    echo "Run 'npm run linuxcnc:stop' to stop existing instances"
    exit 1
fi

# Start LinuxCNC
exec linuxcnc sim.ini
