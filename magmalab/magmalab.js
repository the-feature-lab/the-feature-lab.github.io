// Unlisted tool: live color picker for the magma (RESOURCES) planet's body.
// Loads the planet, and repaints the single body atlas texel (263,40) live as
// you scrub the color input. Lava-crack texels are untouched. Pick a color, then
// paste the hex into MAGMA_BODY_COLOR in src/config.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Matches src/flab/planets.js.
const MAGMA_BODY_TEXELS = [[263, 40]];
const MAGMA_LAVA_TEXELS = [[248, 39], [248, 40]];

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.4, 4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));
const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(3, 4, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0x88aaff, 0.6); fill.position.set(-4, -1, -2); scene.add(fill);

// A few faint stars for context (so a dark body is judged against black).
const starGeo = new THREE.BufferGeometry();
const starPos = [];
for (let i = 0; i < 400; i++) {
  const v = new THREE.Vector3().randomDirection().multiplyScalar(20);
  starPos.push(v.x, v.y, v.z);
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x888888, size: 0.06 })));

let meshes = [];
let srcImage = null; // the original atlas image, redrawn under each recolor

new GLTFLoader().load('/planets/planet_magma.glb', (gltf) => {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const s = 1.6 / (Math.max(size.x, size.y, size.z) || 1);
  model.scale.setScalar(s);
  model.position.set(-center.x * s, -center.y * s, -center.z * s);
  model.traverse((o) => {
    if (o.isMesh && o.material && o.material.map) {
      meshes.push(o);
      if (!srcImage) srcImage = o.material.map.image;
    }
  });
  scene.add(model);
  recolor(); // apply the initial picks
});

// Current colors, driven by the two control rows.
const colors = { body: '#3a4657', lava: '#d23f2e' };

function recolor() {
  if (!srcImage || !srcImage.width) return;
  const canvas = document.createElement('canvas');
  canvas.width = srcImage.width; canvas.height = srcImage.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(srcImage, 0, 0);
  const paint = (texels, color) => { ctx.fillStyle = color; for (const [x, y] of texels) ctx.fillRect(x, y, 1, 1); };
  paint(MAGMA_BODY_TEXELS, colors.body);
  paint(MAGMA_LAVA_TEXELS, colors.lava);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  for (const o of meshes) {
    o.material = o.material.clone();
    o.material.map = tex;
    o.material.needsUpdate = true;
  }
}

// --- UI wiring: one row per color (body, lava) ---
function wireRow(key, pickId, hexId) {
  const pick = document.getElementById(pickId);
  const hex = document.getElementById(hexId);
  const sync = (color) => {
    if (!/^#?[0-9a-fA-F]{6}$/.test(color)) return;
    if (color[0] !== '#') color = '#' + color;
    pick.value = color; hex.value = color;
    colors[key] = color;
    recolor();
  };
  pick.addEventListener('input', () => sync(pick.value));
  hex.addEventListener('change', () => sync(hex.value));
}
wireRow('body', 'bodyPick', 'bodyHex');
wireRow('lava', 'lavaPick', 'lavaHex');

// Copy buttons.
for (const btn of document.querySelectorAll('[data-copy]')) {
  btn.addEventListener('click', () => {
    const el = document.getElementById(btn.dataset.copy);
    navigator.clipboard?.writeText(el.value);
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
