// Pre-render a GLB to a transparent PNG icon, matching the planet icons in
// public/planets/ (which are 256x256 renders of the planet GLBs).
//
//   node scripts/render-icon.mjs <model.glb> <out.png> [size] [yaw] [pitch]
//
// Kept separate from render-people.mjs: that one is driven by the people data
// and renders a fixed cast, this one is a one-off tool for page icons.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [, , src, out, sizeArg, yawArg, pitchArg] = process.argv;
if (!src || !out) {
  console.error('usage: node scripts/render-icon.mjs <model.glb> <out.png> [size] [yaw] [pitch]');
  process.exit(1);
}
const SIZE = Number(sizeArg || 256);
const YAW = Number(yawArg ?? 0.6);
const PITCH = Number(pitchArg ?? 0.35);

const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'domcontentloaded' });

const dataUrl = await page.evaluate(async ({ src, SIZE, YAW, PITCH }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.9);
  fill.position.set(-4, 1, -2);
  scene.add(fill);

  const gltf = await new GLTFLoader().loadAsync(src);
  const obj = gltf.scene;
  scene.add(obj);
  obj.rotation.set(PITCH, YAW, 0);
  obj.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const camera = new THREE.PerspectiveCamera(30, 1, 0.001, 100);
  // Frame on the largest dimension so the model fills the icon consistently.
  const extent = Math.max(size.x, size.y, size.z);
  const dist = (extent * 0.5) / Math.tan((camera.fov * Math.PI) / 360) * 1.5;
  camera.position.set(center.x, center.y, center.z + dist);
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}, { src, SIZE, YAW, PITCH });

mkdirSync(dirname(resolve(root, out)), { recursive: true });
writeFileSync(resolve(root, out), Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`rendered ${out} (${SIZE}x${SIZE})`);

await browser.close();
await server.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
