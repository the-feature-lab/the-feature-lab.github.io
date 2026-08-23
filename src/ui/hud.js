// ---------------------------------------------------------------------------
// HUD: an FPS readout (bottom-right), refreshed a few times a second.
// ---------------------------------------------------------------------------
export class HUD {
  constructor(element) {
    this.el = element;
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

    this.el.textContent = `FPS ${this.fps.toFixed(0)}`;
  }
}
