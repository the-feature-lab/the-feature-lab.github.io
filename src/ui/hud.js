import { computeEnergies } from '../engine/energy.js';

// ---------------------------------------------------------------------------
// HUD: FPS + per-entity average energies, refreshed a few times a second.
// Reads the physics body list to compute energies (see engine/energy.js).
// ---------------------------------------------------------------------------
export class HUD {
  constructor(element, physics) {
    this.el = element;
    this.physics = physics;
    this.fps = 0;
    this._accum = 0;
  }

  // Call each frame with the true (unclamped) frame time.
  update(dt) {
    // Exponentially-smoothed FPS.
    const inst = dt > 0 ? 1 / dt : 0;
    this.fps += (inst - this.fps) * 0.1;

    this._accum += dt;
    if (this._accum < 0.2) return; // refresh ~5x/sec
    this._accum = 0;

    const e = computeEnergies(this.physics.bodies);
    const f = (x) => (x >= 0 ? ' ' : '') + x.toFixed(3);
    this.el.textContent =
      `FPS         ${this.fps.toFixed(0).padStart(6)}\n` +
      `entities    ${String(e.n).padStart(6)}\n` +
      `KE trans/e  ${f(e.transKE)}\n` +
      `KE rot/e    ${f(e.rotKE)}\n` +
      `PE/e        ${f(e.pe)}`;
  }
}
