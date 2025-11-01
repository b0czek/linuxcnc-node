#!/bin/bash
# Script to check if LinuxCNC is running

if pgrep -f "linuxcnc.*sim.ini" > /dev/null; then
    echo "✓ LinuxCNC is running"
    pgrep -af "linuxcnc|milltask|blank-display"
    exit 0
else
    echo "✗ LinuxCNC is not running"
    echo ""
    echo "Start it with: npm run linuxcnc:start"
    exit 1
fi
