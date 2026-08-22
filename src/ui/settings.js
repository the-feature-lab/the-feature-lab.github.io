import * as THREE from 'three';
import { GUI } from 'lil-gui';
import {
  DEFAULT_CUBE_COLOR, PIXEL_SIZE, BLOOM_GLOW, BLOOM_THRESHOLD, BLOOM_RADIUS,
  SETTINGS_KEY,
} from '../config.js';

// ---------------------------------------------------------------------------
// Settings: the lil-gui control panel + localStorage persistence. All control
// values survive reloads — `settings` holds the defaults, saved values are
// merged over them on load, then applied to the live subsystems before the GUI
// is built and on every subsequent edit.
//
// `ctx` provides the hooks Settings drives, keeping it decoupled from wiring:
//   { postfx, lighting, onCubeColor(hex), onStarSync(), restoreView() }
// ---------------------------------------------------------------------------
export function initSettings(ctx) {
  const { postfx, lighting } = ctx;

  const settings = {
    cube: '#' + new THREE.Color(DEFAULT_CUBE_COLOR).getHexString(),
    keyDir: `(${lighting.key.position.x}, ${lighting.key.position.y}, ${lighting.key.position.z})`,
    brightness: 1.0,
    frogs: true,
    pixelate: postfx.pixel.enabled,
    pixelSize: PIXEL_SIZE,
    bloom: postfx.bloom.enabled,
    glow: BLOOM_GLOW,
    threshold: BLOOM_THRESHOLD,
    radius: BLOOM_RADIUS,
  };

  // Merge any saved values over the defaults (ignoring unknown/missing keys).
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    for (const k of Object.keys(settings)) {
      if (k in saved) settings[k] = saved[k];
    }
  } catch { /* corrupt/absent storage: fall back to defaults */ }

  const save = () => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  };

  // Push the settings object into the live subsystems.
  function apply() {
    ctx.onCubeColor(new THREE.Color(settings.cube).getHex());

    // Parse a "(x, y, z)" string; only move the light if all three parse (so a
    // half-typed value doesn't snap the light to the origin).
    const nums = (settings.keyDir.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    if (nums.length === 3 && nums.every(Number.isFinite)) {
      lighting.setKeyPosition(nums[0], nums[1], nums[2]);
    }
    lighting.setBrightness(settings.brightness);

    postfx.pixel.enabled = settings.pixelate;
    postfx.pixel.setPixelSize(settings.pixelSize);
    postfx.bloom.enabled = settings.bloom;
    postfx.bloom.glow = settings.glow;
    postfx.bloom.threshold = settings.threshold;
    postfx.bloom.radius = settings.radius;

    ctx.onFrogs(settings.frogs);
    ctx.onStarSync();
  }

  apply(); // restore saved look before first frame

  const onEdit = () => { apply(); save(); };

  const gui = new GUI({ title: 'render' });
  gui.add({ reset: ctx.restoreView }, 'reset').name('restore default view');
  gui.addColor(settings, 'cube').name('cube color').onChange(onEdit);
  gui.add(settings, 'frogs').name('frogs').onChange(onEdit);

  // Key-light direction as a single "(x, y, z)" text field; larger component =
  // that axis's faces are brighter (Y up -> top faces, Z -> camera-facing).
  const lf = gui.addFolder('key light');
  lf.add(settings, 'keyDir').name('pos (x, y, z)').onChange(onEdit);
  lf.add(settings, 'brightness', 0, 4, 0.05).name('brightness').onChange(onEdit);

  const pf = gui.addFolder('pixelate');
  pf.add(settings, 'pixelate').name('enabled').onChange(onEdit);
  pf.add(settings, 'pixelSize', 1, 40, 1).name('block (css px)').onChange(onEdit);

  const bf = gui.addFolder('glow');
  bf.add(settings, 'bloom').name('enabled').onChange(onEdit);
  bf.add(settings, 'glow', 0, 1, 0.01).name('glow').onChange(onEdit);
  bf.add(settings, 'threshold', 0, 1, 0.01).name('threshold').onChange(onEdit);
  bf.add(settings, 'radius', 1, 40, 1).name('radius (px)').onChange(onEdit);

  return { settings, gui };
}
