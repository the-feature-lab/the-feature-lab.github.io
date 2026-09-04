// Render a planet GLB to a 256x256 transparent PNG icon (for the navbar), and
// print the average non-transparent color (a starting point for the theme hue).
//
// Usage: node scripts/render-planet-icon.mjs <glb-url> <outfile>
//   node scripts/render-planet-icon.mjs /planets/planet_cookie_dough.glb public/planets/icon_cookie_dough.png
//
// Requires the Vite dev server running (so bare `three` imports resolve). Pass
// the dev origin via ICON_ORIGIN (default http://localhost:5199).
import { chromium } from 'playwright';
import fs from 'node:fs';

const glbUrl = process.argv[2];
const outFile = process.argv[3];
if (!glbUrl || !outFile) {
  console.error('usage: node scripts/render-planet-icon.mjs <glb-url> <outfile>');
  process.exit(2);
}
const origin = process.env.ICON_ORIGIN || 'http://localhost:5199';
const SIZE = 256;
// Optional magma-planet retint so the icon matches the live planet. Same texels
// as src/flab/planets.js. Pass via env: BODY_COLOR / LAVA_COLOR (hex).
const bodyColor = process.env.BODY_COLOR || '';
const lavaColor = process.env.LAVA_COLOR || '';

const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="app"></div>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(2);
renderer.setSize(${SIZE}, ${SIZE});
renderer.setClearColor(0x000000, 0); // transparent
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0.35, 3.2);
camera.lookAt(0, 0, 0);

// Match the homepage lighting mood: a warm key + cool fill + hemi lift.
const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(3, 4, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0x88aaff, 0.6); fill.position.set(-4, -1, -2); scene.add(fill);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));

new GLTFLoader().load('${glbUrl}', (gltf) => {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const s = 1.6 / (Math.max(size.x, size.y, size.z) || 1);
  model.scale.setScalar(s);
  model.position.set(-center.x * s, -center.y * s, -center.z * s);

  // Optional magma retint (body texel + lava texels), matching planets.js.
  const bodyColor = ${JSON.stringify(bodyColor)};
  const lavaColor = ${JSON.stringify(lavaColor)};
  if (bodyColor || lavaColor) {
    const BODY = [[263, 40]], LAVA = [[248, 39], [248, 40]];
    model.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.map) return;
      const src = o.material.map.image; if (!src || !src.width) return;
      const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
      const cx = cv.getContext('2d'); cx.drawImage(src, 0, 0);
      const paint = (texels, c) => { if (!c) return; cx.fillStyle = c; for (const [x, y] of texels) cx.fillRect(x, y, 1, 1); };
      paint(BODY, bodyColor); paint(LAVA, lavaColor);
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.needsUpdate = true;
      o.material = o.material.clone(); o.material.map = tex; o.material.needsUpdate = true;
    });
  }

  scene.add(model);
  renderer.render(scene, camera);
  window.__done = true;
}, undefined, (err) => { window.__err = String(err); });
</script></body></html>`;

// Write the HTML into the project root so Vite serves it and bare `three`
// imports resolve. Cleaned up afterwards.
const tmpName = `__icon_render_${Date.now()}.html`;
fs.writeFileSync(tmpName, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const cleanup = () => { try { fs.unlinkSync(tmpName); } catch {} };
await page.goto(`${origin}/${tmpName}`, { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForFunction(() => window.__done || window.__err, null, { timeout: 15000 })
  .catch(() => {});
const err = await page.evaluate(() => window.__err);
if (err) { console.error('render error:', err); cleanup(); await browser.close(); process.exit(1); }
if (errors.length) { console.error('page errors:', errors.join('; ')); }

const canvas = await page.$('canvas');
const buf = await canvas.screenshot({ omitBackground: true });
fs.writeFileSync(outFile, buf);

// Average color of opaque pixels, as a theme-hue starting point.
const avg = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const g = c.getContext('webgl2') || c.getContext('webgl');
  const w = c.width, h = c.height;
  const px = new Uint8Array(w * h * 4);
  g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 40) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++; }
  }
  if (!n) return null;
  const hex = (x) => Math.round(x / n).toString(16).padStart(2, '0');
  return '#' + hex(r) + hex(gg) + hex(b);
});
console.log('wrote', outFile, '(' + buf.length + ' bytes) avg color', avg);
cleanup();
await browser.close();
