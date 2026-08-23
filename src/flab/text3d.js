import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { loadFont } from './fontcache.js';
import {
  SIGN_TEXT_COLOR,
  SIGN_LINE_GAP, SIGN_PAD_X, SIGN_PAD_Y, SIGN_BORDER,
  SIGN_TEXT_DEPTH, SIGN_BORDER_DEPTH,
} from '../config.js';

// ---------------------------------------------------------------------------
// TextRows: a floating "sign" placard below FLAB — two centered lines of creamy
// text popping forward off a maroon rounded-rectangle face, wrapped in a deeper
// gold/brass border frame. Auto-sized to the text (+ padding), so it re-fits
// when the font is swapped (GUI). Faces the camera; pixelates like everything.
//
// Depth layout (world Z, camera looks down -Z toward origin):
//   text front face at z=0, extruded BACKWARD to -SIGN_TEXT_DEPTH
//   maroon face just behind the text, extruded further back
//   border frame deepest (and inset border thickness around the maroon)
// ---------------------------------------------------------------------------


const mat = (color) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });

// Trace a centered sharp-cornered rectangle onto a Path/Shape `p`.
function traceRect(p, w, h) {
  const x = -w / 2, y = -h / 2;
  p.moveTo(x, y);
  p.lineTo(x + w, y);
  p.lineTo(x + w, y + h);
  p.lineTo(x, y + h);
  p.closePath();
}

// A thin rectangular border FRAME (outline ring), sharp corners, extruded in Z
// and centered on z=0 so it hovers on the main plane.
function frameMesh(outerW, outerH, border, depth, color) {
  const shape = new THREE.Shape();
  traceRect(shape, outerW, outerH);
  const hole = new THREE.Path();
  traceRect(hole, outerW - 2 * border, outerH - 2 * border);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2); // center the thin frame on z=0
  return new THREE.Mesh(geo, mat(color));
}

export class TextRows {
  // opts: { lines: [string, string], y, size }
  constructor(scene, opts) {
    this.scene = scene;
    this.opts = opts;
    this.group = new THREE.Group();
    this.group.position.y = opts.y;
    scene.add(this.group);

    this._token = 0;
    this._textColor = SIGN_TEXT_COLOR; // current text+border color (live-editable)
    this._letters = [];                // letter meshes
    this._border = null;               // border frame mesh
  }

  // Recolor the letters AND the border (they share one color). Persists across
  // font rebuilds.
  setTextColor(hex) {
    this._textColor = hex;
    for (const m of this._letters) m.material.color.set(hex);
    if (this._border) this._border.material.color.set(hex);
  }

  _clear() {
    for (let i = this.group.children.length - 1; i >= 0; i--) {
      const m = this.group.children[i];
      this.group.remove(m);
      m.geometry?.dispose();
      m.material?.dispose();
    }
  }

  // Build (or rebuild) the whole sign with the font at `url`.
  setFont(url) {
    const token = ++this._token;
    return loadFont(url).then((font) => {
      if (token !== this._token) return; // superseded by a newer setFont
      this._clear();
      const { lines, size } = this.opts;

      // Build each line's geometry, measure, and center horizontally.
      const gap = SIGN_LINE_GAP * size;
      const lineMeshes = [];
      const dims = lines.map((text) => {
        const geo = new TextGeometry(text, {
          font, size, depth: SIGN_TEXT_DEPTH, curveSegments: 4, bevelEnabled: false,
        });
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        return { geo, w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, bb };
      });

      const textW = Math.max(...dims.map((d) => d.w));
      const lineH = Math.max(...dims.map((d) => d.h));
      const blockH = lines.length * lineH + (lines.length - 1) * gap;

      dims.forEach((d, i) => {
        // Stack lines top→down, centered as a block on the group origin, and
        // straddle z=0 so the letters float on the main plane.
        const yTop = blockH / 2 - lineH / 2;
        const cy = yTop - i * (lineH + gap);
        d.geo.translate(-d.bb.min.x - d.w / 2, -d.bb.min.y - d.h / 2 + cy, -SIGN_TEXT_DEPTH / 2);
        const mesh = new THREE.Mesh(d.geo, mat(this._textColor));
        lineMeshes.push(mesh);
      });

      // A thin cream outline hovering on z=0 around the text (no background) —
      // sized to the text block + tight padding, sharp corners.
      const innerW = textW + 2 * SIGN_PAD_X;
      const innerH = blockH + 2 * SIGN_PAD_Y;
      const border = frameMesh(
        innerW + 2 * SIGN_BORDER, innerH + 2 * SIGN_BORDER,
        SIGN_BORDER, SIGN_BORDER_DEPTH, this._textColor
      );

      this.group.add(border);
      for (const m of lineMeshes) this.group.add(m);
      this._letters = lineMeshes; // track for live recoloring
      this._border = border;
    }).catch((err) => console.error('[text3d] font load failed:', url, err));
  }
}
