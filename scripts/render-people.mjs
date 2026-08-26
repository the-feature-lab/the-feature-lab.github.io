// Pre-render each lab member's cube sprite to a transparent PNG.
//
//   node scripts/render-people.mjs
//
// The People page shows a ring of these around the (static PNG) planet, so the
// sprites need to be flat images rather than live WebGL. We render them here
// with the same GLB + skin code the homepage uses, so a sprite edited in
// /spritelab/ and pasted into data/people.js shows up identically in both.
//
// Output: public/people/<id>.png (committed, so a plain `vite build` works
// without Playwright installed).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'public/people');
const SIZE = 512;   // generous; the page draws them much smaller

mkdirSync(OUT, { recursive: true });

// A dev server gives us the project's own module graph (three, skin.js, the
// people data), so this script can't drift from what the site renders.
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded' });

// Render every person in one page context, returning PNG data URLs.
const shots = await page.evaluate(async (SIZE) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const { buildSkin } = await import('/src/flab/skin.js');
  const { spritedPeople } = await import('/src/data/people.js');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);          // transparent background
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Flat, even lighting: these sit on a flat PNG planet, so strong directional
  // shading would fight the page rather than help.
  scene.add(new THREE.AmbientLight(0xffffff, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(2, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(-3, 1, 2);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
  const loader = new GLTFLoader();
  const cache = {};
  const bare = (n) => n.split('|').pop().replace(/\.\d+$/, '');
  const out = {};

  // Alumni have no sprite; only render the people who do.
  for (const person of spritedPeople()) {
    const sprite = person.sprite;
    const model = sprite.model;
    if (!cache[model]) cache[model] = await loader.loadAsync(`/cube_${model}.glb`);
    const gltf = cache[model];

    const obj = gltf.scene.clone(true);
    scene.add(obj);

    // Pose at the Idle clip's first frame — a neutral standing pose.
    const mixer = new THREE.AnimationMixer(obj);
    const idle = gltf.animations.find((a) => bare(a.name) === 'Idle');
    if (idle) mixer.clipAction(idle).play();
    mixer.update(0);
    obj.updateWorldMatrix(true, true);

    // Recolor to this person's palette.
    const tex = buildSkin(model, sprite);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.map = tex;
      o.material.needsUpdate = true;
    });

    // Frame on the true skinned bounds, so every sprite is cropped the same
    // way regardless of the model's bind pose.
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
        o.localToWorld(v);
        box.expandByPoint(v);
      }
    });
    const size = box.getSize(new THREE.Vector3());
    const mid = box.getCenter(new THREE.Vector3());

    // Straight-on front view, framed to the character's height with a little
    // margin. Feet land at a predictable spot so the page can align them.
    const dist = (size.y * 0.5) / Math.tan((camera.fov * Math.PI) / 360) * 1.12;
    camera.position.set(mid.x, mid.y, mid.z + dist);
    camera.lookAt(mid.x, mid.y, mid.z);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    out[person.id] = renderer.domElement.toDataURL('image/png');

    scene.remove(obj);
  }
  return out;
}, SIZE);

for (const [id, dataUrl] of Object.entries(shots)) {
  const b64 = dataUrl.split(',')[1];
  writeFileSync(resolve(OUT, `${id}.png`), Buffer.from(b64, 'base64'));
  console.log(`  rendered public/people/${id}.png`);
}

await browser.close();
await server.close();

if (errors.length) {
  console.error('\nERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`\n${Object.keys(shots).length} sprites rendered.`);
