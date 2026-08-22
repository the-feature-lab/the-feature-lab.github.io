import * as THREE from 'three';
import { PixelPass } from './pixelpass.js';
import { BloomPass } from './bloompass.js';
import {
  PIXELATE_ON, PIXEL_SIZE, BLOOM_ON, BLOOM_THRESHOLD, BLOOM_GLOW, BLOOM_RADIUS,
} from '../config.js';

// ---------------------------------------------------------------------------
// PostFX: the full-screen post-process chain. The scene is pixelated into an
// offscreen target, then the bloom pass composites a soft glow to the canvas.
//
// Pipeline: scene --pixelPass--> baseTarget --bloomPass--> canvas.
// The baseTarget needs a depth buffer: when pixelate is OFF the 3D scene renders
// straight into it, so depth testing must work (else cubes draw in the wrong
// z-order). Harmless when pixelate is ON (a fullscreen quad is drawn instead).
// ---------------------------------------------------------------------------
export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;

    this.pixel = new PixelPass(renderer, { pixelSize: PIXEL_SIZE, enabled: PIXELATE_ON });
    this.bloom = new BloomPass(renderer, {
      enabled: BLOOM_ON,
      threshold: BLOOM_THRESHOLD,
      glow: BLOOM_GLOW,
      radius: BLOOM_RADIUS,
    });

    this.baseTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(width, height) {
    const dpr = this.renderer.getPixelRatio();
    this.baseTarget.setSize(Math.floor(width * dpr), Math.floor(height * dpr));
    this.pixel.setSize(width, height);
    this.bloom.setSize(width, height);
  }

  // Render the scene through the pixelation pass into baseTarget, then composite
  // the bloom glow to the canvas.
  render(scene, camera) {
    this.pixel.render(scene, camera, this.baseTarget);
    this.bloom.render(this.baseTarget.texture);
  }
}
