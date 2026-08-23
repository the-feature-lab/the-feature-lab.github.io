import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Sprite skins for the cube characters.
//
// Both GLBs share a byte-identical 32x32 "Atlas.png" that is a palette map, not
// a painted texture: every vertex's UV lands on one of a handful of solid
// swatches. cube_guy's mesh samples 6 texels, cube_girl's 5. So recoloring a
// character means repainting a few pixels — no re-export, and the widget can
// recolor live.
//
// We rebuild the whole 32x32 image rather than editing the original PNG: it's
// tiny, and it keeps everything in one place.
//
// IMPORTANT: the GLB's texture has flipY = false, so a UV's v coordinate
// indexes image rows directly (row = floor(v * 32)) with NO 1-v flip. Getting
// this wrong paints the swatches into the wrong half of the atlas and every
// character comes out plain white.
// ---------------------------------------------------------------------------

// Texel coordinates (x, y) per model, derived by decoding each GLB's
// TEXCOORD_0 and grouping vertices by the texel they sample. Vertex counts are
// noted so it's clear which slot dominates the silhouette. Some slots cover
// more than one texel (the guy's skin spans two), so each is a list.
// Slot names describe what each swatch actually paints, verified by recoloring
// one slot at a time and looking at the result. Note `head` is the guy's HAT but
// the girl's HAIR — same swatch, different mesh — so it's named for its role
// rather than for either specific garment.
export const SLOTS = {
  head:  { guy: [[2, 9]],          girl: [[2, 21]],  label: 'Hat / hair' },  // 726 / 1040
  skin:  { guy: [[5, 9], [6, 9]],  girl: [[6, 21]],  label: 'Skin' },        // 592 / 368
  shirt: { guy: [[13, 10]],        girl: [[13, 22]], label: 'Shirt' },       // 308 / 436
  pants: { guy: [[17, 10]],        girl: [[17, 22]], label: 'Pants' },       // 160 / 160
  eyes:  { guy: [[10, 10]],        girl: [[9, 21]],  label: 'Eyes' },        // 8 / 8
};

export const SLOT_NAMES = Object.keys(SLOTS);
export const MODELS = ['guy', 'girl'];
export const ATLAS_SIZE = 32;

// Each model's stock colors, so an unset slot looks like the original character.
export const DEFAULTS = {
  guy:  { head: '#cf9f41', skin: '#cfa78b', shirt: '#7e260e', pants: '#375a71', eyes: '#297e7b' },
  girl: { head: '#45433b', skin: '#695140', shirt: '#b9822a', pants: '#375a71', eyes: '#343434' },
};

// Build a THREE.Texture for one character.
//   model  — 'guy' | 'girl'
//   colors — { clothing: '#45433b', ... }; missing slots fall back to DEFAULTS.
export function buildSkin(model, colors = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');

  // The atlas is mostly unused; white keeps any stray sample harmless.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  for (const [slot, def] of Object.entries(SLOTS)) {
    const texels = def[model];
    if (!texels) continue;
    const color = colors[slot] || DEFAULTS[model][slot];
    if (!color) continue;
    ctx.fillStyle = color;
    // Paint each sampled texel individually. Painting the enclosing 4x4 block
    // instead would be wrong: two different slots can share a block.
    for (const [x, y] of texels) ctx.fillRect(x, y, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;   // crisp swatches, no blending
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace; // base-color maps are sRGB
  tex.flipY = false;                     // match the GLB's own texture
  tex.needsUpdate = true;
  return tex;
}

// Apply a skin to a loaded character, cloning materials so characters sharing
// the same GLB don't share a texture.
export function applySkin(root, model, colors) {
  const tex = buildSkin(model, colors);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.map = tex;
    o.material.needsUpdate = true;
  });
  return tex;
}
