import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { PositionLogger, PositionPoint } from "../dist";
import { AvailableAxis } from "../dist/types";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Store connected clients
const clients = new Set<any>();

// Initialize position logger
const logger = new PositionLogger();

// HTML page with embedded Three.js visualization
const htmlPage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LinuxCNC 3D Motion Visualization</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #000;
            font-family: Arial, sans-serif;
            overflow: hidden;
        }
        
        #container {
            position: relative;
            width: 100vw;
            height: 100vh;
        }
        
        #info {
            position: absolute;
            top: 10px;
            left: 10px;
            color: white;
            background: rgba(0, 0, 0, 0.7);
            padding: 10px;
            border-radius: 5px;
            z-index: 100;
            font-size: 14px;
            line-height: 1.4;
        }
        
        #controls {
            position: absolute;
            top: 10px;
            right: 10px;
            color: white;
            background: rgba(0, 0, 0, 0.7);
            padding: 10px;
            border-radius: 5px;
            z-index: 100;
        }
        
        button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 8px 16px;
            margin: 2px;
            border-radius: 3px;
            cursor: pointer;
        }
        
        button:hover {
            background: #45a049;
        }
        
        button:disabled {
            background: #666;
            cursor: not-allowed;
        }
        
        .red-button {
            background: #f44336 !important;
        }
        
        .red-button:hover {
            background: #da190b !important;
        }
    </style>
</head>
<body>
    <div id="container">
        <div id="info">
            <div><strong>LinuxCNC 3D Motion Visualization</strong></div>
            <div>Position: <span id="position">X: 0.000, Y: 0.000, Z: 0.000</span></div>
            <div>Motion Type: <span id="motionType">Unknown</span></div>
            <div>History Points: <span id="historyCount">0</span></div>
            <div>Connection: <span id="connectionStatus">Connecting...</span></div>
        </div>
        
        <div id="controls">
            <button id="startBtn">Start Logging</button>
            <button id="stopBtn" disabled>Stop Logging</button>
            <button id="clearBtn">Clear History</button>
            <br>
            <button id="resetViewBtn">Reset View</button>
            <button id="toggleTrailBtn">Toggle Trail</button>
        </div>
    </div>

    <script type="importmap">
    {
        "imports": {
            "three": "https://unpkg.com/three@0.155.0/build/three.module.js",
            "three/addons/": "https://unpkg.com/three@0.155.0/examples/jsm/"
        }
    }
    </script>
    
    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        
        // Make THREE global for easier access
        window.THREE = THREE;
        window.OrbitControls = OrbitControls;
    </script>
    
    <script>
        // Three.js setup
        let scene, camera, renderer, controls;
        let cylinder, workpiece, trailGeometry, trailMaterial, trailLine;
        let trailPoints = [];
        let showTrail = true;
        
        // WebSocket connection
        let ws;
        let isLogging = false;
        
        // Motion type constants (matching LinuxCNC)
        const MotionTypes = {
            0: "None",
            1: "Traverse",
            2: "Linear",
            3: "Circular",
            4: "Tool Change",
            5: "Probing"
        };
        
        function init() {
            // Create scene
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x111111);
            
            // Create camera
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(100, 100, 100);
            
            // Create renderer
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            document.getElementById('container').appendChild(renderer.domElement);
            
            // Add orbit controls
            controls = new window.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.1;
            
            // Create coordinate system
            createCoordinateSystem();
            
            // Create workpiece (cutting tool cylinder)
            createCylinder();
            
            // Create work surface
            createWorkSurface();
            
            // Create tool path trail
            createTrail();
            
            // Add lighting
            addLighting();
            
            // Setup WebSocket
            setupWebSocket();
            
            // Setup controls
            setupControls();
            
            // Start render loop
            animate();
        }
        
        function createCoordinateSystem() {
            // Add coordinate axes
            const axesHelper = new THREE.AxesHelper(50);
            scene.add(axesHelper);
            
            // Add grid
            const gridXY = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
            gridXY.position.y = 0;
            scene.add(gridXY);
            
            // Add labels for axes - skipping font loading for simplicity
        }
        
        function createCylinder() {
            // Create cutting tool (cylinder)
            const geometry = new THREE.CylinderGeometry(2, 2, 20, 16);
            const material = new THREE.MeshLambertMaterial({ color: 0xff6600 });
            cylinder = new THREE.Mesh(geometry, material);
            cylinder.castShadow = true;
            cylinder.position.set(0, 10, 0); // Start position
            scene.add(cylinder);
        }
        
        function createWorkSurface() {
            // Create work surface/table
            const geometry = new THREE.BoxGeometry(200, 5, 200);
            const material = new THREE.MeshLambertMaterial({ color: 0x666666 });
            workpiece = new THREE.Mesh(geometry, material);
            workpiece.receiveShadow = true;
            workpiece.position.set(0, -2.5, 0);
            scene.add(workpiece);
        }
        
        function createTrail() {
            // Create trail line for tool path
            trailGeometry = new THREE.BufferGeometry();
            trailMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
            trailLine = new THREE.Line(trailGeometry, trailMaterial);
            scene.add(trailLine);
        }
        
        function addLighting() {
            // Ambient light
            const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
            scene.add(ambientLight);
            
            // Directional light
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(100, 100, 50);
            directionalLight.castShadow = true;
            directionalLight.shadow.mapSize.width = 2048;
            directionalLight.shadow.mapSize.height = 2048;
            scene.add(directionalLight);
        }
        
        function setupWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = \`\${protocol}//\${window.location.host}\`;
            
            ws = new WebSocket(wsUrl);
            
            ws.onopen = function() {
                document.getElementById('connectionStatus').textContent = 'Connected';
                document.getElementById('connectionStatus').style.color = '#4CAF50';
            };
            
            ws.onclose = function() {
                document.getElementById('connectionStatus').textContent = 'Disconnected';
                document.getElementById('connectionStatus').style.color = '#f44336';
                setTimeout(setupWebSocket, 2000); // Reconnect after 2 seconds
            };
            
            ws.onerror = function() {
                document.getElementById('connectionStatus').textContent = 'Error';
                document.getElementById('connectionStatus').style.color = '#f44336';
            };
            
            ws.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    handlePositionUpdate(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };
        }
        
        function handlePositionUpdate(data) {
            if (data.type === 'position') {
                updateCylinderPosition(data.position);
                updateUI(data.position, data.historyCount);
            } else if (data.type === 'history') {
                updateTrail(data.history);
            }
        }
        
        function updateCylinderPosition(position) {
            if (cylinder) {
                // Scale positions for better visualization (LinuxCNC units are typically inches or mm)
                cylinder.position.set(
                    position.x * 10, // Scale up for visibility
                    position.z * 10 + 10 + 10, // Z becomes Y (height), offset above surface + cylinder half-height
                    -position.y * 10  // Y becomes -Z (depth into screen)
                );
            }
        }
        
        function updateTrail(history) {
            if (!showTrail || !history || history.length === 0) {
                return;
            }
            
            // Update trail points - keep at original position since cylinder is now positioned higher
            trailPoints = history.map(point => new THREE.Vector3(
                point.x * 10,
                point.z * 10 + 10, // Original trail position
                -point.y * 10
            ));
            
            // Update trail geometry
            trailGeometry.setFromPoints(trailPoints);
        }
        
        function updateUI(position, historyCount) {
            document.getElementById('position').textContent = 
                \`X: \${position.x.toFixed(3)}, Y: \${position.y.toFixed(3)}, Z: \${position.z.toFixed(3)}\`;
            document.getElementById('motionType').textContent = 
                MotionTypes[position.motionType] || 'Unknown';
            document.getElementById('historyCount').textContent = historyCount;
        }
        
        function setupControls() {
            document.getElementById('startBtn').onclick = function() {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ command: 'start' }));
                    isLogging = true;
                    this.disabled = true;
                    document.getElementById('stopBtn').disabled = false;
                }
            };
            
            document.getElementById('stopBtn').onclick = function() {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ command: 'stop' }));
                    isLogging = false;
                    this.disabled = true;
                    document.getElementById('startBtn').disabled = false;
                }
            };
            
            document.getElementById('clearBtn').onclick = function() {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ command: 'clear' }));
                    trailPoints = [];
                    trailGeometry.setFromPoints([]);
                }
            };
            
            document.getElementById('resetViewBtn').onclick = function() {
                camera.position.set(100, 100, 100);
                controls.reset();
            };
            
            document.getElementById('toggleTrailBtn').onclick = function() {
                showTrail = !showTrail;
                trailLine.visible = showTrail;
                this.textContent = showTrail ? 'Hide Trail' : 'Show Trail';
            };
        }
        
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        
        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        
        window.addEventListener('resize', onWindowResize);
        
        // Initialize when modules are loaded
        window.addEventListener('DOMContentLoaded', () => {
            // Wait a bit for modules to load
            setTimeout(() => {
                if (window.THREE && window.OrbitControls) {
                    init();
                } else {
                    console.error('THREE.js modules not loaded properly');
                }
            }, 100);
        });
    </script>
</body>
</html>
`;

// Serve the main page
app.get("/", (req, res) => {
  res.send(htmlPage);
});

// WebSocket connection handling
wss.on("connection", (ws) => {
  console.log("Client connected");
  clients.add(ws);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleClientMessage(data);
    } catch (error) {
      console.error("Error parsing client message:", error);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    clients.delete(ws);
  });

  // Send initial status
  sendCurrentPosition();
});

// Handle client commands
function handleClientMessage(data: any) {
  switch (data.command) {
    case "start":
      startLogging();
      break;
    case "stop":
      stopLogging();
      break;
    case "clear":
      clearHistory();
      break;
  }
}

// Position logging functions
let loggingInterval: ReturnType<typeof setInterval> | null = null;

function startLogging() {
  if (loggingInterval) {
    return; // Already logging
  }

  console.log("Starting position logging...");
  logger.start({ interval: 0.01, maxHistorySize: 5000 });

  // Send position updates to all clients
  loggingInterval = setInterval(() => {
    sendCurrentPosition();
    sendHistoryUpdate();
  }, 10); // Send updates at 100Hz
}

function stopLogging() {
  if (loggingInterval) {
    console.log("Stopping position logging...");
    clearInterval(loggingInterval);
    loggingInterval = null;
    logger.stop();
  }
}

function clearHistory() {
  console.log("Clearing position history...");
  logger.clear();

  // Notify all clients
  broadcast({
    type: "history",
    history: [],
  });
}

function sendCurrentPosition() {
  const position = logger.getCurrentPosition();
  const historyCount = logger.getHistoryCount();

  broadcast({
    type: "position",
    position,
    historyCount,
  });
}

function sendHistoryUpdate() {
  // Send recent history points (last 1000 points for trail)
  const recentHistory = logger.getRecentHistory(1000);
  // console.log(
  //   `Last point: X${recentHistory[recentHistory.length - 1]?.x.toFixed(
  //     3
  //   )} Y${recentHistory[recentHistory.length - 1]?.y.toFixed(
  //     3
  //   )} Z${recentHistory[recentHistory.length - 1]?.z.toFixed(3)}`
  // );

  broadcast({
    type: "history",
    history: recentHistory,
  });
}

function broadcast(data: any) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === 1) {
      // WebSocket.OPEN
      client.send(message);
    }
  });
}

// Error handling
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  stopLogging();
  server.close(() => {
    process.exit(0);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(
    `🚀 LinuxCNC 3D Visualization Server running on http://localhost:${PORT}`
  );
  console.log("📊 Real-time 3D motion visualization with Three.js");
  console.log("🔧 Connect to LinuxCNC and start logging to see motion data");
});
