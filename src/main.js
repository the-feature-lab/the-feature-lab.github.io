import * as THREE from 'three';
import { Timer } from 'three';
import { PIXEL_SIZE, STAR_BASE_PX, SUBSTEPS, DEFAULT_CUBE_COLOR, FROG_COUNT } from './config.js';
import { PhysicsWorld } from './engine/physics.js';
import { Stage } from './scene/stage.js';
import { Lighting } from './scene/lighting.js';
import { PostFX } from './scene/postfx.js';
import { StarField } from './scene/stars.js';
import { FlabGrid } from './flab/grid.js';
import { spawnFrogs } from './flab/frog.js';
import { TextRows } from './flab/text3d.js';
import { FONTS } from './flab/fontcache.js';
import { spawnPlanets } from './flab/planets.js';
import { HUD } from './ui/hud.js';
import { ViewControls } from './ui/controls.js';
import { initSettings } from './ui/settings.js';

// ---------------------------------------------------------------------------
// FLAB homepage: an N-body cube sandbox spelling "FLAB", with a pixelation +
// bloom post-process, a starfield, and a frog that hops around the letters.
// This file just wires the modules together and runs the render loop.
// ---------------------------------------------------------------------------

const stage = new Stage(document.getElementById('app'));
const { renderer, scene, camera } = stage;

const postfx = new PostFX(renderer);
const lighting = new Lighting(scene);
const controls = new ViewControls(camera, renderer.domElement);

// Starfield: grid-snapped, block-sized points so each star survives the pixel
// pass as one lit block. Kept in sync with the pixel grid (see syncStarGrid).
const stars = new StarField(scene, {
  seed: 1337,
  distance: 20,
  density: 290,
  brightness: 0.7,
  blockPx: PIXEL_SIZE * renderer.getPixelRatio(),
});

// When pixelating: size each star to one block and snap it to the grid. When
// not: no snapping, small fixed size (so stars don't shrink to one device pixel).
function syncStarGrid() {
  const dpr = renderer.getPixelRatio();
  stars.setSnap(postfx.pixel.enabled);
  stars.setBlockPx((postfx.pixel.enabled ? postfx.pixel.pixelSize : STAR_BASE_PX) * dpr);
  stars.setViewport(
    Math.floor(window.innerWidth * dpr),
    Math.floor(window.innerHeight * dpr)
  );
}

// Physics + the FLAB grid + the frog.
await PhysicsWorld.init();
const physics = new PhysicsWorld(scene);
const grid = new FlabGrid(physics, DEFAULT_CUBE_COLOR);
const frogs = spawnFrogs(scene, grid, FROG_COUNT);

// Floating 3D text below FLAB (the homepage's name + tagline). The pixelation
// pass renders these blocky to match the cubes; the font is switchable (GUI).
const sign = new TextRows(scene, {
  lines: ['FEATURE LAB @ UC BERKELEY', 'FUNDAMENTAL SCIENCE OF AI'],
  y: -0.4,          // vertical center of the sign block (tucked up near FLAB)
  size: 0.42,
});
// initSettings() applies the (possibly persisted) font on load.

// Slowly-spinning planets below the text (future nav links). Explicit positions
// so planets can sit anywhere; outer two are raised, middle lowered (a gentle
// upward-cupping arc). Sizes per spec: PEOPLE largest, RESEARCH medium, ABOUT smaller.
const planets = spawnPlanets(scene, camera, renderer, {
  planets: [
    { file: '/planets/planet_sorbetlike.glb', label: 'RESEARCH', diameter: 1.7, pos: [-4.4, -4.1], href: '/research/' },
    { file: '/planets/planet_earthlike.glb',  label: 'PEOPLE',   diameter: 1.7, pos: [0, -4.7], href: '/people/' },
    { file: '/planets/planet_spiky.glb',      label: 'ABOUT',    diameter: 1.4, pos: [4.4, -4.1], href: '/about/' },
  ],
});

const hud = new HUD(document.getElementById('hud'), physics);

// GUI + persisted settings. Settings drives the live subsystems via these hooks.
initSettings({
  postfx,
  lighting,
  onStarSync: syncStarGrid,
  onFrogs: (on) => frogs.setEnabled(on),
  fontNames: Object.keys(FONTS),
  onFont: (name) => sign.setFont(FONTS[name]),
  onTextColor: (hex) => sign.setTextColor(hex),
  restoreView: () => controls.restoreDefault(),
  onCubeColor: (hex) => {
    for (const body of physics.bodies) {
      body.color = hex;
      body.mesh.material.color.set(hex);
    }
  },
});

// Keep post-fx targets and the star grid in step with the window.
stage.onResize((w, h) => {
  postfx.setSize(w, h);
  syncStarGrid();
});

// Feed pointer position (normalized device coords) to the planets for hover.
window.addEventListener('pointermove', (e) => {
  planets.setPointer(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
});

// Click a planet -> navigate to its page (straight link for now; a fancier
// zoom/fade transition can come later).
renderer.domElement.addEventListener('click', (e) => {
  planets.setPointer(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  const hit = planets.pick();
  if (hit && hit.href) window.location.href = hit.href;
});

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
const timer = new Timer();

function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const rawDt = timer.getDelta();     // true frame time (for FPS)
  const dt = Math.min(rawDt, 0.033);  // clamped (for physics stability)

  physics.step(dt, SUBSTEPS);
  physics.syncMeshes();
  frogs.update(dt);
  planets.update(dt);
  hud.update(rawDt);
  controls.update();
  stars.update(camera);               // cull near-hemisphere stars for the view
  postfx.render(scene, camera);       // pixelate + bloom -> canvas
}
animate();
