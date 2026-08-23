import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mountNavbar } from '../src/site/navbar.js';
import './spritelab.css';
import { SLOTS, DEFAULTS, MODELS, buildSkin } from '../src/flab/skin.js';
import { PEOPLE } from '../src/data/people.js';

mountNavbar(null); // no nav item is "active" — this page is unlisted
// mountNavbar only sets --accent for a known page, so pick one for this tool.
document.documentElement.style.setProperty('--accent', '#71b465'); // PEOPLE green

// ---------------------------------------------------------------------------
// Sprite Lab: pick a lab member, choose their model and per-slot colors, watch
// the character update live, and copy the resulting sprite block back into
// data/people.js. Deliberately unlinked — a tool, not a page.
// ---------------------------------------------------------------------------

// Curated ramps. A plain RGB picker makes skin tones especially hard to find by
// hand, so these give a usable starting point for every slot.
const RAMPS = {
  skin:  ['#ffdfc4', '#f2d0b3', '#e8b98f', '#d9a273', '#cfa78b', '#b98a63',
          '#a3714a', '#8d5a3b', '#70432b', '#57331f', '#3f2418'],
  head:  ['#0d0b0a', '#1f1b18', '#2b2119', '#4a3524', '#5c3b28', '#7e5a2e',
          '#8c6239', '#a8763a', '#c9a227', '#d9b380', '#e8e0d0', '#9a9a9a',
          '#b5462f', '#7e2648'],
  shirt: ['#c94f4f', '#e07a3f', '#c98f3f', '#5aa469', '#3fa8a0', '#4f7fc9',
          '#5b6bb5', '#8a5ac9', '#c95a9b', '#f5e9d0', '#45433b', '#1f2229'],
  pants: ['#375a71', '#2b3a4a', '#3a3f4a', '#1f2229', '#5a4632', '#6b4a2f',
          '#2f4f45', '#4a3550', '#7a7a7a', '#d9d2c2'],
  eyes:  ['#343434', '#1f1b18', '#3d2b1f', '#5c3b28', '#2b3a4a', '#297e7b',
          '#3f6b3f', '#6b4a2f'],
};

const SLOT_KEYS = Object.keys(SLOTS);
const root = document.getElementById('lab');
root.className = 'lab';

// ---- state ----------------------------------------------------------------
let state = { who: PEOPLE[0].id, model: 'guy', colors: {} };

function loadPerson(id) {
  const person = PEOPLE.find((p) => p.id === id);
  const sprite = person?.sprite || {};
  state.who = id;
  state.model = sprite.model || 'guy';
  state.colors = {};
  for (const k of SLOT_KEYS) state.colors[k] = sprite[k] || DEFAULTS[state.model][k];
}
loadPerson(state.who);

// ---- controls -------------------------------------------------------------
const panel = document.createElement('div');
root.appendChild(panel);

// Person selector.
const whoRow = document.createElement('div');
whoRow.className = 'lab-row';
whoRow.innerHTML = '<label for="who">Lab member</label>';
const whoSel = document.createElement('select');
whoSel.id = 'who';
for (const p of PEOPLE) {
  const o = document.createElement('option');
  o.value = p.id; o.textContent = p.name;
  whoSel.appendChild(o);
}
whoSel.value = state.who;
whoSel.addEventListener('change', () => { loadPerson(whoSel.value); syncControls(); refresh(); });
whoRow.appendChild(whoSel);
panel.appendChild(whoRow);

// Model toggle (the "gender selector").
const modelRow = document.createElement('div');
modelRow.className = 'lab-row';
modelRow.innerHTML = '<label>Model</label>';
const seg = document.createElement('div');
seg.className = 'seg';
const modelBtns = {};
for (const m of MODELS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = m;
  b.addEventListener('click', () => { state.model = m; syncControls(); refresh(); });
  modelBtns[m] = b;
  seg.appendChild(b);
}
modelRow.appendChild(seg);
panel.appendChild(modelRow);

// One block per color slot: picker + hex field + curated ramp.
const slotUI = {};
for (const key of SLOT_KEYS) {
  const wrap = document.createElement('div');
  wrap.className = 'slot';

  const head = document.createElement('div');
  head.className = 'slot-head';
  const label = document.createElement('label');
  label.textContent = SLOTS[key].label;
  const picker = document.createElement('input');
  picker.type = 'color';
  const hex = document.createElement('input');
  hex.type = 'text';
  hex.spellcheck = false;
  head.append(label, picker, hex);
  wrap.appendChild(head);

  const ramp = document.createElement('div');
  ramp.className = 'ramp';
  const swatches = [];
  for (const c of RAMPS[key] || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c;
    b.title = c;
    b.addEventListener('click', () => setColor(key, c));
    ramp.appendChild(b);
    swatches.push(b);
  }
  wrap.appendChild(ramp);

  picker.addEventListener('input', () => setColor(key, picker.value));
  hex.addEventListener('change', () => {
    const v = hex.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) setColor(key, v.toLowerCase());
    else syncControls();
  });

  slotUI[key] = { picker, hex, swatches };
  panel.appendChild(wrap);
}

// Copy-paste output.
const out = document.createElement('div');
out.className = 'lab-out';
const ta = document.createElement('textarea');
ta.readOnly = true;
ta.spellcheck = false;
out.appendChild(ta);
const actions = document.createElement('div');
actions.className = 'lab-actions';
const copyBtn = document.createElement('button');
copyBtn.type = 'button';
copyBtn.textContent = 'copy';
copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(ta.value);
  copyBtn.textContent = 'copied!';
  setTimeout(() => { copyBtn.textContent = 'copy'; }, 1200);
});
const resetBtn = document.createElement('button');
resetBtn.type = 'button';
resetBtn.textContent = 'reset';
resetBtn.addEventListener('click', () => { loadPerson(state.who); syncControls(); refresh(); });
actions.append(copyBtn, resetBtn);
out.appendChild(actions);
panel.appendChild(out);

function setColor(key, value) {
  state.colors[key] = value;
  syncControls();
  refresh();
}

// Push state into every control (so they agree after any change).
function syncControls() {
  for (const m of MODELS) modelBtns[m].setAttribute('aria-pressed', String(m === state.model));
  for (const key of SLOT_KEYS) {
    const c = state.colors[key];
    const ui = slotUI[key];
    ui.picker.value = c;
    ui.hex.value = c;
    (RAMPS[key] || []).forEach((rc, i) => {
      ui.swatches[i].setAttribute('aria-pressed', String(rc.toLowerCase() === c.toLowerCase()));
    });
  }
  const parts = SLOT_KEYS.map((k) => `${k}: '${state.colors[k]}'`).join(', ');
  ta.value = `sprite: { model: '${state.model}', ${parts} }`;
}

// ---- live 3D preview ------------------------------------------------------
const view = document.createElement('div');
view.className = 'lab-view';
root.appendChild(view);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
scene.add(new THREE.AmbientLight(0xffffff, 1.9));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 5, 4);
scene.add(key);

const loader = new GLTFLoader();
const cache = new Map();   // model -> { scene, animations }
const stage = new THREE.Group();
scene.add(stage);
let mixer = null;

async function getModel(model) {
  if (!cache.has(model)) cache.set(model, await loader.loadAsync(`/cube_${model}.glb`));
  return cache.get(model);
}

let current = null;   // the model name currently on stage

async function refresh() {
  const gltf = await getModel(state.model);

  // Rebuild only when the base model changes; a recolor just swaps the texture.
  if (current !== state.model) {
    stage.clear();
    const obj = gltf.scene.clone(true);
    stage.add(obj);
    current = state.model;

    mixer = new THREE.AnimationMixer(obj);
    const idle = gltf.animations.find((a) => a.name.split('|').pop().replace(/\.\d+$/, '') === 'Idle');
    if (idle) mixer.clipAction(idle).play();
    mixer.update(0);

    // Frame the character.
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const dist = Math.max(s.x, s.y, s.z) * 2.6;
    camera.position.set(c.x + dist * 0.32, c.y + s.y * 0.1, c.z + dist);
    camera.lookAt(c.x, c.y, c.z);
  }

  const tex = buildSkin(state.model, state.colors);
  stage.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.map = tex;
    o.material.needsUpdate = true;
  });
}

function resize() {
  const r = view.getBoundingClientRect();
  if (!r.width) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  stage.rotation.y += dt * 0.5;   // slow turntable so all sides are visible
  renderer.render(scene, camera);
});

resize();
syncControls();
refresh();
