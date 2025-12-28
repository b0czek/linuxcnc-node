# LinuxCNC 3D Motion Visualization

> ⚠️ **This is a proof of concept demonstration** showing how to use the LinuxCNC Position Logger with real-time 3D visualization.

A simple example that streams LinuxCNC machine position data to a web browser and visualizes tool motion in 3D using Three.js.

## Quick Start

1. **Prerequisites**: LinuxCNC running, Node.js installed, LinuxCNC bindings built
2. **Install**: `npm install`
3. **Run**: `npm start`
4. **Open**: http://localhost:3000
5. **Use**: Click "Start Logging" and move your machine

## Architecture

```
LinuxCNC → Position Logger → WebSocket → Browser → Three.js
```

The server collects position data at 100Hz and streams it to connected browsers for real-time visualization.
