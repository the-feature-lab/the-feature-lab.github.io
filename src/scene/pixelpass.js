import * as THREE from 'three';

// ---------------------------------------------------------------------------
// PixelPass: a full-screen post-process that chunks the finished render into
// square blocks of ~N CSS pixels, so the whole image reads as low-res pixel
// art regardless of the 3D geometry underneath.
//
// The scene is rendered to an offscreen render target at full device
// resolution. A fullscreen quad then samples that target with NEAREST
// filtering: for each output fragment we snap its UV to the CENTER of the
// block it falls in, so every fragment in a block reads the same source texel
// — the classic crisp "big pixel" look.
//
// Block size is specified in CSS pixels and multiplied by devicePixelRatio, so
// a 5px block looks the same physical size on a Retina screen (where it spans
// 10 device pixels) as on a 1x screen (5 device pixels).
// ---------------------------------------------------------------------------
export class PixelPass {
  constructor(renderer, { pixelSize = 5, enabled = true } = {}) {
    this.renderer = renderer;
    this.pixelSize = pixelSize; // block edge in CSS pixels
    this.enabled = enabled;

    // Offscreen target the scene renders into. NEAREST filtering is what makes
    // the blocks crisp — no bilinear smoothing between source texels.
    //
    // The target stays LINEAR (default colorSpace). The scene renders into it
    // in linear light with no sRGB encode; the fullscreen copy pass samples it
    // and applies the sRGB encode itself in the shader. Tagging the target sRGB
    // caused a double-convert that darkened the image.
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });

    // Fullscreen triangle + shader. `uResolution` is the render-target size in
    // device pixels; `uBlock` is the block edge in device pixels.
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uBlock: { value: pixelSize },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        uniform float uBlock;

        void main() {
          // Work in device pixels, snap to the block center, back to UV.
          // Color space is left LINEAR here; the final composite (bloom pass)
          // applies the single sRGB encode, so the pixelate on/off paths match.
          vec2 px = vUv * uResolution;
          vec2 snapped = (floor(px / uBlock) + 0.5) * uBlock;
          vec2 uv = snapped / uResolution;
          gl_FragColor = texture2D(tDiffuse, uv);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    // A single oversized triangle covering the screen (cheaper than a quad).
    this.scene = new THREE.Scene();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
    );
    geo.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2)
    );
    this.quad = new THREE.Mesh(geo, this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // Match the offscreen target to the drawing-buffer size (device pixels).
  setSize(width, height) {
    const dpr = this.renderer.getPixelRatio();
    const w = Math.floor(width * dpr);
    const h = Math.floor(height * dpr);
    this.target.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
    this._syncBlock();
  }

  // Block edge in device pixels = CSS px * devicePixelRatio (via renderer DPR).
  _syncBlock() {
    const dpr = this.renderer.getPixelRatio();
    this.material.uniforms.uBlock.value = Math.max(1, this.pixelSize * dpr);
  }

  setPixelSize(cssPx) {
    this.pixelSize = cssPx;
    this._syncBlock();
  }

  // Render `scene`/`camera` through the pixelation pass. By default the result
  // is drawn to the canvas; pass an `output` render target to capture the
  // pixelated (sRGB) image as a texture instead — used to feed the bloom pass.
  //
  // When disabled, the scene is rendered straight through with no chunking.
  render(scene, camera, output = null) {
    if (!this.enabled) {
      this.renderer.setRenderTarget(output);
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(output);
    this.renderer.render(this.scene, this.camera);
  }
}
