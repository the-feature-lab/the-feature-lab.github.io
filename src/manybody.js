import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUBSTEPS } from './config.js';
import { PhysicsWorld } from './engine/physics.js';
import { computeEnergies } from './engine/energy.js';

// ---------------------------------------------------------------------------
// Manybody demo: three colored cubes attracting each other under the shared
// N-body + shatter engine (see engine/physics.js), viewed with a perspective
// camera and real shadows. A frozen, self-contained sandbox — no pixelation,
// bloom, starfield, or frog.
// ---------------------------------------------------------------------------
const INIT_SPEED = 0.7; // base magnitude of the randomized initial velocity

// Three colored cubes. Velocities are randomized (zero net momentum) on load.
const BODIES = [
  { color: 0xff5555, mass: 1.0, size: 0.9, pos: [-4.6, 0.0, 0.0] },
  { color: 0x55ff77, mass: 1.0, size: 0.9, pos: [4.6, 0.0, 0.0] },
  { color: 0x5599ff, mass: 1.0, size: 0.9, pos: [0.0, 0.4, 4.2] },
];

// Randomize each body's velocity, then subtract the mass-weighted mean so total
// momentum is exactly zero (the system's center of mass never drifts).
function assignZeroMomentumVelocities(list) {
  const vels = list.map(() => {
    const dir = new THREE.Vector3(
      Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
    ).normalize();
    return dir.multiplyScalar(INIT_SPEED * (0.6 + Math.random() * 0.8));
  });
  const totalMass = list.reduce((s, b) => s + b.mass, 0);
  const p = new THREE.Vector3();
  vels.forEach((v, i) => p.addScaledVector(v, list[i].mass)); // total momentum
  const vCorr = p.multiplyScalar(1 / totalMass);              // = P / M
  vels.forEach((v) => v.sub(vCorr));
  list.forEach((b, i) => { b.vel = [vels[i].x, vels[i].y, vels[i].z]; });
}
assignZeroMomentumVelocities(BODIES);

// --- Scene / renderer / camera --------------------------------------------
const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.1, 1000
);
camera.position.set(0, 5, 16);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.9;
controls.zoomSpeed = 0.9;
controls.minDistance = 3;
controls.maxDistance = 40;

// Lighting: a shadow-casting key + cool fill + hemisphere lift.
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(6, 9, 6);
key.castShadow = true;
scene.add(key);

const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
fill.position.set(-6, -2, -4);
scene.add(fill);

scene.add(new THREE.HemisphereLight(0x223355, 0x0a0a12, 0.7));

// --- Physics: the shared engine -------------------------------------------
await PhysicsWorld.init();
const physics = new PhysicsWorld(scene);

BODIES.forEach((b) => {
  const rec = physics.makeCube({
    size: b.size,
    color: b.color,
    mass: b.mass,
    pos: b.pos,
    vel: b.vel,
    angvel: { x: 0.2, y: 0.3, z: 0.1 },
    shatterable: true,
  });
  rec.mesh.castShadow = true;
  rec.mesh.receiveShadow = true;
});

// --- HUD ------------------------------------------------------------------
const hud = document.getElementById('hud');
let fps = 0;
let hudAccum = 0;

function updateHUD(dt) {
  const inst = dt > 0 ? 1 / dt : 0;
  fps += (inst - fps) * 0.1;

  hudAccum += dt;
  if (hudAccum < 0.2) return; // refresh ~5x/sec
  hudAccum = 0;

  const e = computeEnergies(physics.bodies);
  const f = (x) => (x >= 0 ? ' ' : '') + x.toFixed(3);
  hud.textContent =
    `FPS         ${fps.toFixed(0).padStart(6)}\n` +
    `entities    ${String(e.n).padStart(6)}\n` +
    `KE trans/e  ${f(e.transKE)}\n` +
    `KE rot/e    ${f(e.rotKE)}\n` +
    `PE/e        ${f(e.pe)}`;
}

// --- Render loop ----------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();     // true frame time (for FPS)
  const dt = Math.min(rawDt, 0.033);  // clamped (for physics stability)

  physics.step(dt, SUBSTEPS);
  physics.syncMeshes();
  updateHUD(rawDt);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// --- Resize ---------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
