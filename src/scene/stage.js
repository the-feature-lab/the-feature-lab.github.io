import * as THREE from 'three';
import { VIEW_HEIGHT, CAMERA_POS } from '../config.js';

// ---------------------------------------------------------------------------
// Stage: the renderer, the scene, and the orthographic camera, plus a single
// resize handler that fans out to subscribers (post-fx, starfield, etc.).
//
// Orthographic camera: no perspective foreshortening — equivalent to a camera
// at infinite distance. Parallel lines stay parallel; every cube renders the
// same size regardless of depth. The camera stays centered on the world origin
// so the (origin-centered) star sphere stays centered on screen; the FLAB grid
// itself is moved/scaled instead (see flab/grid.js).
// ---------------------------------------------------------------------------
export class Stage {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    const f = this._frustum();
    this.camera = new THREE.OrthographicCamera(f.left, f.right, f.top, f.bottom, 0.1, 1000);
    this.camera.position.set(CAMERA_POS[0], CAMERA_POS[1], CAMERA_POS[2]);
    this.camera.lookAt(0, 0, 0);

    this._resizeCbs = [];
    window.addEventListener('resize', () => this._onResize());
  }

  _frustum() {
    const aspect = window.innerWidth / window.innerHeight;
    const h = VIEW_HEIGHT / 2;
    return { left: -h * aspect, right: h * aspect, top: h, bottom: -h };
  }

  // Register a callback fired on window resize with (width, height).
  onResize(cb) {
    this._resizeCbs.push(cb);
  }

  _onResize() {
    const fr = this._frustum();
    this.camera.left = fr.left;
    this.camera.right = fr.right;
    this.camera.top = fr.top;
    this.camera.bottom = fr.bottom;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    for (const cb of this._resizeCbs) cb(window.innerWidth, window.innerHeight);
  }
}
