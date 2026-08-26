import * as THREE from 'three';
import { GUI } from 'lil-gui';
import {
  DEFAULT_CUBE_COLOR, DEFAULT_BRIGHTNESS, PIXEL_SIZE, SIGN_TEXT_COLOR,
  BLOOM_GLOW, BLOOM_THRESHOLD, BLOOM_RADIUS, SETTINGS_KEY,
} from '../config.js';

// ---------------------------------------------------------------------------
// Settings: a DECLARATIVE control panel + localStorage persistence.
//
// Each GUI control is one entry in CONTROLS below, declaring its key, default,
// label, GUI spec, optional folder, and an apply(value, ctx) that pushes the
// value into the live subsystem. The settings object, persistence, apply-on-
// load, and GUI construction are all DERIVED from this one list — so adding a
// knob is a single entry, not edits scattered across four places.
//
// `ctx` carries the hooks + subsystem refs each control needs:
//   { postfx, lighting, fontNames, onCubeColor, onFont, onFrogs, onStarSync,
//     restoreView }
// ---------------------------------------------------------------------------

// Control spec fields:
//   key       unique settings key (also the localStorage key)
//   label     GUI display name
//   folder    optional folder name to group under
//   default   default value (may be a fn(ctx) for values derived from ctx)
//   gui(g,s,on)  builds the lil-gui controller on target `g` for settings `s`,
//                wiring `.onChange(on)`; returns the controller
//   apply(v,ctx) pushes value `v` into the live subsystem
const CONTROLS = [
  {
    key: 'cube', label: 'cube color',
    default: () => '#' + new THREE.Color(DEFAULT_CUBE_COLOR).getHexString(),
    gui: (g, s, on) => g.addColor(s, 'cube').name('cube color').onChange(on),
    apply: (v, ctx) => ctx.onCubeColor(new THREE.Color(v).getHex()),
  },
  {
    key: 'textColor', label: 'text color',
    default: () => '#' + new THREE.Color(SIGN_TEXT_COLOR).getHexString(),
    gui: (g, s, on) => g.addColor(s, 'textColor').name('text color').onChange(on),
    apply: (v, ctx) => ctx.onTextColor(new THREE.Color(v).getHex()),
  },
  {
    key: 'font', label: 'font',
    default: (ctx) => ctx.fontNames[0],
    gui: (g, s, on, ctx) => g.add(s, 'font', ctx.fontNames).name('font').onChange(on),
    apply: (v, ctx) => ctx.onFont(v),
  },
  {
    key: 'frogs', label: 'frogs', default: true,
    gui: (g, s, on) => g.add(s, 'frogs').name('frogs').onChange(on),
    apply: (v, ctx) => ctx.onFrogs(v),
  },

  // key light
  {
    key: 'keyDir', label: 'pos (x, y, z)', folder: 'key light',
    default: (ctx) => {
      const p = ctx.lighting.key.position;
      return `(${p.x}, ${p.y}, ${p.z})`;
    },
    gui: (g, s, on) => g.add(s, 'keyDir').name('pos (x, y, z)').onChange(on),
    apply: (v, ctx) => {
      // Only move the light if all three numbers parse (ignore half-typed input).
      const nums = (v.match(/-?\d+(\.\d+)?/g) || []).map(Number);
      if (nums.length === 3 && nums.every(Number.isFinite)) {
        ctx.lighting.setKeyPosition(nums[0], nums[1], nums[2]);
      }
    },
  },
  {
    key: 'brightness', label: 'brightness', folder: 'key light',
    default: DEFAULT_BRIGHTNESS,
    gui: (g, s, on) => g.add(s, 'brightness', 0, 4, 0.05).name('brightness').onChange(on),
    apply: (v, ctx) => ctx.lighting.setBrightness(v),
  },

  // pixelate
  {
    key: 'pixelate', label: 'enabled', folder: 'pixelate',
    default: (ctx) => ctx.postfx.pixel.enabled,
    gui: (g, s, on) => g.add(s, 'pixelate').name('enabled').onChange(on),
    apply: (v, ctx) => { ctx.postfx.pixel.enabled = v; },
  },
  {
    key: 'pixelSize', label: 'block (css px)', folder: 'pixelate',
    default: PIXEL_SIZE,
    gui: (g, s, on) => g.add(s, 'pixelSize', 1, 40, 1).name('block (css px)').onChange(on),
    apply: (v, ctx) => ctx.postfx.pixel.setPixelSize(v),
  },

  // glow
  {
    key: 'bloom', label: 'enabled', folder: 'glow',
    default: (ctx) => ctx.postfx.bloom.enabled,
    gui: (g, s, on) => g.add(s, 'bloom').name('enabled').onChange(on),
    apply: (v, ctx) => { ctx.postfx.bloom.enabled = v; },
  },
  {
    key: 'glow', label: 'glow', folder: 'glow', default: BLOOM_GLOW,
    gui: (g, s, on) => g.add(s, 'glow', 0, 3, 0.01).name('glow').onChange(on),
    apply: (v, ctx) => { ctx.postfx.bloom.glow = v; },
  },
  {
    key: 'threshold', label: 'threshold', folder: 'glow', default: BLOOM_THRESHOLD,
    gui: (g, s, on) => g.add(s, 'threshold', 0, 1, 0.01).name('threshold').onChange(on),
    apply: (v, ctx) => { ctx.postfx.bloom.threshold = v; },
  },
  {
    key: 'radius', label: 'radius (px)', folder: 'glow', default: BLOOM_RADIUS,
    gui: (g, s, on) => g.add(s, 'radius', 1, 40, 1).name('radius (px)').onChange(on),
    apply: (v, ctx) => { ctx.postfx.bloom.radius = v; },
  },
];

export function initSettings(ctx) {
  // Build the settings object from the schema defaults.
  const settings = {};
  for (const c of CONTROLS) {
    settings[c.key] = typeof c.default === 'function' ? c.default(ctx) : c.default;
  }

  // Merge any saved values over the defaults (ignoring unknown/missing keys).
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    for (const c of CONTROLS) if (c.key in saved) settings[c.key] = saved[c.key];
  } catch { /* corrupt/absent storage: fall back to defaults */ }

  const save = () => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  };

  // Push every control's value into its live subsystem, then sync the star grid
  // (which depends on the pixelation state, so it runs after all applies).
  function apply() {
    for (const c of CONTROLS) c.apply(settings[c.key], ctx);
    ctx.onStarSync();
  }
  apply(); // restore saved look before first frame

  const onEdit = () => { apply(); save(); };

  // Reset every control to its default, re-apply, persist, restore the view, and
  // refresh the GUI displays. (Derived from the schema, so it covers all knobs.)
  function restoreDefaults() {
    for (const c of CONTROLS) {
      settings[c.key] = typeof c.default === 'function' ? c.default(ctx) : c.default;
    }
    apply();
    save();
    ctx.restoreView();
    ctx.onRestoreDefaults?.(); // extra reset hooks (e.g. cull frogs back to one)
    for (const ctrl of controllers) ctrl.updateDisplay();
  }

  // Build the GUI: a top-level reset action, then each control in its folder.
  const gui = new GUI({ title: 'render' });
  gui.add({ reset: restoreDefaults }, 'reset').name('restore defaults');
  const folders = new Map(); // name -> lil-gui folder
  const target = (name) => {
    if (!name) return gui;
    if (!folders.has(name)) folders.set(name, gui.addFolder(name));
    return folders.get(name);
  };
  const controllers = CONTROLS.map((c) => c.gui(target(c.folder), settings, onEdit, ctx));

  // Menu visibility: hidden by default (camera-ready), toggled with Esc, and its
  // open/closed state is remembered across loads.
  const MENU_KEY = 'flab.menuOpen';
  let menuOpen = false;
  try { menuOpen = localStorage.getItem(MENU_KEY) === '1'; } catch {}
  const applyMenu = () => { gui.domElement.style.display = menuOpen ? '' : 'none'; };
  applyMenu();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      menuOpen = !menuOpen;
      applyMenu();
      try { localStorage.setItem(MENU_KEY, menuOpen ? '1' : '0'); } catch {}
    }
  });

  return { settings, gui };
}
