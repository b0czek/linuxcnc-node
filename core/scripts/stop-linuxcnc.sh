#!/bin/bash
# Script to stop all LinuxCNC processes

echo "Stopping LinuxCNC processes..."

# Kill LinuxCNC processes
pkill -f "linuxcnc.*sim.ini" 2>/dev/null || true
pkill -f "blank-display" 2>/dev/null || true
pkill -f "milltask" 2>/dev/null || true
pkill -f "io_" 2>/dev/null || true
pkill -f "classicladder_rt" 2>/dev/null || true

# Wait a moment
sleep 1

# Check if any processes are still running
if pgrep -f "linuxcnc|milltask" > /dev/null; then
    echo "Some processes are still running, forcing termination..."
    pkill -9 -f "linuxcnc|milltask|blank-display" 2>/dev/null || true
    sleep 1
fi

echo "LinuxCNC processes stopped"
