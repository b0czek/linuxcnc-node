import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { state } from "./state";

/**
 * Initialize the Three.js scene, camera, renderer, and controls
 */
export function initScene(container: HTMLElement): void {
  // Scene
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x1a1a1a);

  // Camera
  state.camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  state.camera.position.set(100, 100, 100);
  state.camera.lookAt(0, 0, 0);

  // Renderer
  state.renderer = new THREE.WebGLRenderer({ antialias: true });
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(state.renderer.domElement);

  // Controls
  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.controls.enableDamping = true;
  state.camera.up.set(0, 0, 1);
  state.controls.update();

  // Grid / Helpers
  const gridHelper = new THREE.GridHelper(200, 20);
  gridHelper.rotation.x = Math.PI / 2;
  state.scene.add(gridHelper);
  const axesHelper = new THREE.AxesHelper(10);
  state.scene.add(axesHelper);

  // Tool (Cone)
  const coneHeight = 10;
  const geometry = new THREE.ConeGeometry(2, coneHeight, 32);
  geometry.translate(0, -coneHeight / 2, 0); // Shift geometry so tip is at origin
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  state.toolMesh = new THREE.Mesh(geometry, material);
  state.toolMesh.rotation.x = -Math.PI / 2; // Point along -Z
  state.toolMesh.position.set(0, 0, 0);
  state.scene.add(state.toolMesh);

  // Lights
  const light = new THREE.AmbientLight(0xffffff, 0.5);
  state.scene.add(light);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(10, 10, 10);
  state.scene.add(directionalLight);
}

/**
 * Handle window resize
 */
export function onWindowResize(): void {
  if (!state.camera || !state.renderer) return;
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Main render loop
 */
export function animate(): void {
  requestAnimationFrame(animate);
  if (state.controls) state.controls.update();
  if (state.renderer && state.scene && state.camera) {
    state.renderer.render(state.scene, state.camera);
  }
}
