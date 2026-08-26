import * as THREE from 'three';
import { Timer } from 'three';
import './froggame.css';
import { PIXEL_SIZE, DEFAULT_CUBE_COLOR, FROG_COUNT, SUBSTEPS } from '../src/config.js';
import { PhysicsWorld } from '../src/engine/physics.js';
import { Stage } from '../src/scene/stage.js';
import { Lighting } from '../src/scene/lighting.js';
import { PostFX } from '../src/scene/postfx.js';
import { StarField } from '../src/scene/stars.js';
import { FlabGrid } from '../src/flab/grid.js';
import { spawnFrogs } from '../src/flab/frog.js';
import { ViewControls } from '../src/ui/controls.js';
import { FrogController, bindKeys } from '../src/game/controls.js';

// ---------------------------------------------------------------------------
// Frog game — development harness at /froggame/.
//
// Deliberately standalone: it reuses the homepage's modules but has its own
// bootstrap, so building the game needs no edits to src/main.js or
// src/flab/frog.js (both of which are being worked on elsewhere). When the game
// is ready for the homepage, the integration is small: call startFrogGame()
// with the existing scene + frogs, and route the click through frogs.pick().
// ---------------------------------------------------------------------------

const stage = new Stage(document.getElementById('app'));
const { renderer, scene, camera } = stage;

const postfx = new PostFX(renderer);
const lighting = new Lighting(scene);
const view = new ViewControls(camera, renderer.domElement);

const stars = new StarField(scene, {
  seed: 1337, distance: 20, density: 290, brightness: 0.7,
  blockPx: PIXEL_SIZE * renderer.getPixelRatio(),
});
function syncStarGrid() {
  const dpr = renderer.getPixelRatio();
  stars.setSnap(postfx.pixel.enabled);
  stars.setBlockPx(postfx.pixel.pixelSize * dpr);
  stars.setViewport(
    Math.floor(window.innerWidth * dpr),
    Math.floor(window.innerHeight * dpr)
  );
}
syncStarGrid();
addEventListener('resize', syncStarGrid);

await PhysicsWorld.init();
const physics = new PhysicsWorld(scene);
const grid = new FlabGrid(physics, DEFAULT_CUBE_COLOR);
const frogs = spawnFrogs(scene, grid, camera, FROG_COUNT);

// --- player control -------------------------------------------------------

let controller = null;

const hint = document.createElement('div');
hint.className = 'fg-hint';
document.body.appendChild(hint);

function setHint(html) { hint.innerHTML = html; }
setHint('click a frog to take control');

function takeControl(frog) {
  if (controller) controller.disable();
  controller = new FrogController(frog, camera);
  controller.enable();
  setHint('<b>&uarr;</b> hop &nbsp; <b>&larr; &rarr;</b> turn &nbsp; '
        + '<b>&darr;</b> back &nbsp; <b>space</b> jump up &nbsp; <b>esc</b> release');
}

function release() {
  if (!controller) return;
  controller.disable();
  controller = null;
  setHint('click a frog to take control');
}

// Forward to whichever controller is live, so rebinding on each click isn't
// needed (and stale listeners can't pile up).
bindKeys({ press: (action) => controller?.press(action) });
addEventListener('keydown', (e) => { if (e.key === 'Escape') release(); });

// Click a frog to control it — frogs.pick() already raycasts for hover.
renderer.domElement.addEventListener('pointermove', (e) => {
  frogs.setPointer(
    (e.clientX / innerWidth) * 2 - 1,
    -(e.clientY / innerHeight) * 2 + 1
  );
});
renderer.domElement.addEventListener('click', (e) => {
  frogs.setPointer(
    (e.clientX / innerWidth) * 2 - 1,
    -(e.clientY / innerHeight) * 2 + 1
  );
  const hit = frogs.pick();
  if (hit) takeControl(hit);
});

// --- loop -----------------------------------------------------------------

// Test hook: lets the headless harness drive the game without guessing at
// pixel coordinates. Harmless in normal use.
window.__fg = {
  frogs,
  camera,
  takeControl,
  release,
  get controller() { return controller; },
};

const timer = new Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.033);

  physics.step(dt, SUBSTEPS);
  physics.syncMeshes();
  // The controller must run BEFORE frogs.update(dt) so a queued action starts
  // this frame rather than being overtaken by the autonomous timer.
  controller?.update();
  frogs.update(dt);
  view.update();
  stars.update(camera);

  postfx.render(scene, camera);
});
