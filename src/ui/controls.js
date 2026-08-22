import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VIEW_KEY } from '../config.js';

// ---------------------------------------------------------------------------
// ViewControls: OrbitControls (click-drag orbit, scroll zoom, right-drag pan)
// plus view persistence. The view (camera position + orbit target + ortho zoom)
// is saved to localStorage on every change and restored on load, so the scene
// comes back the way it was left. `restoreDefault()` returns to the new-user
// framing (snapshotted before any saved view is applied).
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

    // Snapshot the default framing before restoring any saved view.
    this._default = {
      pos: camera.position.toArray(),
      target: this.controls.target.toArray(),
      zoom: camera.zoom,
    };

    this._restoreSaved();

    this._saveQueued = false;
    this.controls.addEventListener('change', () => this._save());
  }

  update() {
    this.controls.update();
  }

  _restoreSaved() {
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
      if (v && v.pos && v.target && Number.isFinite(v.zoom)) {
        this.camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
        this.controls.target.set(v.target[0], v.target[1], v.target[2]);
        this.camera.zoom = v.zoom;
        this.camera.updateProjectionMatrix();
        this.controls.update();
      }
    } catch { /* absent/corrupt: keep the default view */ }
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
        }));
      } catch {}
    });
  }

  // Reset to the default framing. controls.update() fires 'change', which
  // re-persists it, so the reset also sticks across reloads.
  restoreDefault() {
    this.camera.position.fromArray(this._default.pos);
    this.controls.target.fromArray(this._default.target);
    this.camera.zoom = this._default.zoom;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
}
