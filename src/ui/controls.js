import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  VIEW_KEY, VIEW_HEIGHT, CONTENT_HALF_W, CONTENT_HALF_H, VIEW_MARGIN, VIEW_TTL_MS,
} from '../config.js';

// ---------------------------------------------------------------------------
// ViewControls: OrbitControls (orbit / zoom-to-cursor) + view persistence +
// responsive fit-to-screen.
//
// The view (camera pos + orbit target + ortho zoom) is saved to localStorage
// with a timestamp. On load it's restored ONLY if fresh (< VIEW_TTL_MS) and the
// user had actually interacted; otherwise the view is FIT to the screen so FLAB
// + the planets are fully visible with margin on any aspect (phones included).
// Until the user touches the camera, a resize/rotate refits; once they interact,
// auto-fit stops so we don't fight them.
// ---------------------------------------------------------------------------
export class ViewControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.9;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 40;
    // Scroll-zoom homes in on the point under the cursor; click+drag still orbits.
    this.controls.zoomToCursor = true;

    // Default framing (position/target) snapshotted before any restore. The zoom
    // is computed responsively, so it isn't part of the snapshot.
    this._default = {
      pos: camera.position.toArray(),
      target: this.controls.target.toArray(),
    };

    this._userTouched = false;
    this._restoreOrFit();

    this._saveQueued = false;
    this.controls.addEventListener('change', () => this._save());
    // A real user gesture (not our programmatic updates) marks the view "touched".
    for (const ev of ['pointerdown', 'wheel']) {
      domElement.addEventListener(ev, () => { this._userTouched = true; }, { passive: true });
    }
  }

  update() { this.controls.update(); }

  // Ortho zoom that fits the content box (+margin) into the current viewport.
  _fitZoom() {
    const aspect = window.innerWidth / window.innerHeight;
    const halfH = VIEW_HEIGHT / 2;                 // world half-height at zoom 1
    const halfW = halfH * aspect;                  // world half-width  at zoom 1
    const needH = CONTENT_HALF_H * VIEW_MARGIN;
    const needW = CONTENT_HALF_W * VIEW_MARGIN;
    // zoom>1 = closer. Fit whichever dimension is tighter.
    return Math.min(halfH / needH, halfW / needW);
  }

  // Fit the view to the screen (default framing + responsive zoom).
  fitView() {
    this.camera.position.fromArray(this._default.pos);
    this.controls.target.fromArray(this._default.target);
    this.camera.zoom = this._fitZoom();
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  // Called on window resize: refit only if the user hasn't taken over the camera.
  onResize() {
    if (!this._userTouched) this.fitView();
  }

  _restoreOrFit() {
    let restored = false;
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
      const fresh = v && Number.isFinite(v.at) && (Date.now() - v.at) < VIEW_TTL_MS;
      if (v && v.pos && v.target && Number.isFinite(v.zoom) && fresh) {
        this.camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
        this.controls.target.set(v.target[0], v.target[1], v.target[2]);
        this.camera.zoom = v.zoom;
        this.camera.updateProjectionMatrix();
        this.controls.update();
        this._userTouched = true; // a saved view means they'd interacted before
        restored = true;
      }
    } catch { /* absent/corrupt: fall through to fit */ }
    if (!restored) this.fitView();
  }

  _save() {
    if (this._saveQueued) return; // coalesce bursts of change events
    this._saveQueued = true;
    requestAnimationFrame(() => {
      this._saveQueued = false;
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify({
          pos: this.camera.position.toArray(),
          target: this.controls.target.toArray(),
          zoom: this.camera.zoom,
          at: Date.now(), // for the freshness (TTL) check on next load
        }));
      } catch {}
    });
  }

  // Reset to the responsive default framing (restore-defaults button).
  restoreDefault() {
    this._userTouched = false;
    this.fitView();
  }
}
