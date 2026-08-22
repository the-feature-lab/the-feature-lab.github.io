import * as THREE from 'three';
import { FLAB, CUBE_SIZE, CELL, FLAB_SCALE, FLAB_OFFSET_Y } from '../config.js';

// ---------------------------------------------------------------------------
// FlabGrid: builds the pinned "FLAB" cubes into a PhysicsWorld and exposes the
// grid geometry the frog needs — occupancy by grid index and a mapping from a
// grid cell to the world position of that cube's TOP face (where the frog sits).
//
// Grid indices: `col` increases with world +X; `gridRow` counts up from the
// bottom, matching world +Y (the bitmap's rows go top->bottom, so the row index
// is flipped when placing).
// ---------------------------------------------------------------------------
export class FlabGrid {
  constructor(physics, color) {
    this.rows = FLAB.length;
    this.cols = Math.max(...FLAB.map((r) => r.length));
    this.cell = CELL * FLAB_SCALE;          // scaled grid pitch
    this.cubeSize = CUBE_SIZE * FLAB_SCALE;  // scaled cube edge
    this.topHalf = this.cubeSize / 2;
    this._x0 = -((this.cols - 1) * this.cell) / 2;
    this._y0 = -((this.rows - 1) * this.cell) / 2 + FLAB_OFFSET_Y;

    this.occupied = new Set();     // grid keys "col,gridRow"
    this.cubeCenters = [];         // world centers of the pinned cubes

    for (let r = 0; r < this.rows; r++) {
      const line = FLAB[r];
      for (let c = 0; c < line.length; c++) {
        if (line[c] !== 'o') continue;
        const gridRow = this.rows - 1 - r; // flip so bitmap row 0 is at the top
        const x = this._x0 + c * this.cell;
        const y = this._y0 + gridRow * this.cell;
        this.cubeCenters.push(new THREE.Vector3(x, y, 0));
        this.occupied.add(this.key(c, gridRow));
        physics.makeCube({
          size: this.cubeSize,
          color,
          mass: 1.0,
          pos: [x, y, 0],
          vel: [0, 0, 0],
          angvel: { x: 0, y: 0, z: 0 },
          shatterable: false,
          fixed: true,
        });
      }
    }
  }

  key(col, gridRow) {
    return `${col},${gridRow}`;
  }

  has(col, gridRow) {
    return this.occupied.has(this.key(col, gridRow));
  }

  // 3D occupancy over integer cells (cx=col, cy=gridRow, cz=depth layer). All
  // FLAB cubes live in the cz=0 layer, so any cell off that layer is empty. This
  // lets the surface walker reason uniformly about all six faces of each cube.
  hasCell(cx, cy, cz) {
    return cz === 0 && this.occupied.has(this.key(cx, cy));
  }

  // World center of the cube at integer cell (cx, cy, cz). Only cz=0 holds real
  // cubes, but the formula is defined for any cell (used for arc geometry).
  cellCenter(cx, cy, cz) {
    return new THREE.Vector3(
      this._x0 + cx * this.cell,
      this._y0 + cy * this.cell,
      cz * this.cell
    );
  }

  // World position of the top face center of the cube at (col, gridRow).
  topAt(col, gridRow) {
    return new THREE.Vector3(
      this._x0 + col * this.cell,
      this._y0 + gridRow * this.cell + this.topHalf,
      0
    );
  }

  // The top-left occupied cell (highest grid row, then lowest col) — a clearly
  // visible, exposed top for placing the frog at start.
  topLeftCell() {
    let best = null;
    for (const k of this.occupied) {
      const [c, gr] = k.split(',').map(Number);
      if (!best || gr > best.gridRow || (gr === best.gridRow && c < best.col)) {
        best = { col: c, gridRow: gr };
      }
    }
    return best;
  }
}
