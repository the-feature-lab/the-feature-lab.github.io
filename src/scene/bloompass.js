import * as THREE from 'three';

// ---------------------------------------------------------------------------
// BloomPass: a soft "glow" post-process. Bright pixels bleed a pale halo.
//
//   (a) bright-pass: keep only pixels brighter than `threshold`.
//   (b) blur: a wide separable Gaussian (horizontal then vertical) on a
//       downsampled buffer, so a large radius stays cheap.
//   (c) composite: convex blend, final = glow*blurred + (1-glow)*base.
//
// The blur runs at half resolution (DOWNSAMPLE), which both speeds it up and
// widens the effective radius for free. `radius` is expressed in output pixels.
//
// Input is the already-sRGB pixelated image from PixelPass; we work in that
// space directly, which is fine for an additive glow.
// ---------------------------------------------------------------------------
const DOWNSAMPLE = 2; // blur buffer is 1/DOWNSAMPLE the drawing-buffer size

// Shared fullscreen-triangle geometry (covers clip space with one triangle).
function fullscreenGeo() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
  );
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return geo;
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export class BloomPass {
  constructor(renderer, {
    enabled = true,
    threshold = 0.5,  // brightness (0..1) above which a pixel glows
    glow = 0.5,       // convex mix factor: 0 = no glow, 1 = pure blurred glow
    radius = 10,      // blur length-scale in output pixels
  } = {}) {
    this.renderer = renderer;
    this.enabled = enabled;
    this.threshold = threshold;
    this.glow = glow;
    this.radius = radius;

    const rtOpts = {
      minFilter: THREE.LinearFilter, // linear so the blur samples smoothly
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.brightTarget = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.blurA = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.blurB = new THREE.WebGLRenderTarget(1, 1, rtOpts);

    // Bright-pass: zero out anything dimmer than the threshold.
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: null },
        uThreshold: { value: threshold },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tSrc;
        uniform float uThreshold;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb;
          // Perceptual-ish luminance for the threshold test.
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          // Soft knee around the threshold so the halo doesn't hard-clip.
          float k = smoothstep(uThreshold, uThreshold + 0.15, lum);
          gl_FragColor = vec4(c * k, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    // Separable Gaussian: sampled with a fixed 9-tap kernel, `uDir` picks the
    // axis and `uStep` the tap spacing (radius / taps) in UV units.
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: null },
        uDir: { value: new THREE.Vector2(1, 0) },
        uStep: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tSrc;
        uniform vec2 uDir;   // (1,0) horizontal or (0,1) vertical
        uniform vec2 uStep;  // per-tap offset in UV, already axis-scaled
        void main() {
          // 9-tap Gaussian (weights sum to 1).
          float w[5];
          w[0] = 0.227027; w[1] = 0.194594; w[2] = 0.121621;
          w[3] = 0.054054; w[4] = 0.016216;
          vec3 acc = texture2D(tSrc, vUv).rgb * w[0];
          for (int i = 1; i < 5; i++) {
            vec2 off = uStep * float(i);
            acc += texture2D(tSrc, vUv + off).rgb * w[i];
            acc += texture2D(tSrc, vUv - off).rgb * w[i];
          }
          gl_FragColor = vec4(acc, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    // Composite: convex blend of the blurred glow and the base image:
    //   out = glow * blur + (1 - glow) * base
    // Energy-preserving, so a large flat region (where blur ~= base) keeps its
    // color at any glow factor — glow only shows where there's contrast. The
    // blur is fed by the bright-pass, so unlit areas just get scaled by
    // (1 - glow) and darken slightly; that's the accepted trade-off.
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: null },
        tBloom: { value: null },
        uGlow: { value: glow }, // convex mix factor, 0..1
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tBase;
        uniform sampler2D tBloom;
        uniform float uGlow;

        // Linear -> sRGB encode. This composite is the final blit to the canvas,
        // so it applies the single color-space encode for the whole pipeline
        // (all offscreen targets hold linear color).
        vec3 linearToSRGB(vec3 c) {
          vec3 lo = c * 12.92;
          vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
          return mix(hi, lo, step(c, vec3(0.0031308)));
        }

        void main() {
          vec3 base = texture2D(tBase, vUv).rgb;
          vec3 bloom = texture2D(tBloom, vUv).rgb;
          vec3 outc = mix(base, bloom, uGlow); // (1-uGlow)*base + uGlow*bloom
          gl_FragColor = vec4(linearToSRGB(outc), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.scene = new THREE.Scene();
    this.geo = fullscreenGeo();
    this.quad = new THREE.Mesh(this.geo, this.brightMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(width, height) {
    const dpr = this.renderer.getPixelRatio();
    this._w = Math.floor(width * dpr);
    this._h = Math.floor(height * dpr);
    const bw = Math.max(1, Math.floor(this._w / DOWNSAMPLE));
    const bh = Math.max(1, Math.floor(this._h / DOWNSAMPLE));
    this.brightTarget.setSize(bw, bh);
    this.blurA.setSize(bw, bh);
    this.blurB.setSize(bw, bh);
    this._bw = bw;
    this._bh = bh;
  }

  // Draw the fullscreen quad with `mat` into `target` (null = canvas).
  _draw(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  // baseTexture: the pixelated (sRGB) image. Composites glow onto the canvas.
  render(baseTexture) {
    if (!this.enabled) {
      // No glow: just blit the base image to the canvas (uGlow=0 -> pure base).
      this.compositeMat.uniforms.tBase.value = baseTexture;
      this.compositeMat.uniforms.tBloom.value = baseTexture;
      this.compositeMat.uniforms.uGlow.value = 0;
      this._draw(this.compositeMat, null);
      return;
    }

    // (a) bright-pass into brightTarget (downsampled).
    this.brightMat.uniforms.tSrc.value = baseTexture;
    this.brightMat.uniforms.uThreshold.value = this.threshold;
    this._draw(this.brightMat, this.brightTarget);

    // (b) separable Gaussian blur. Tap spacing = radius spread over the kernel,
    // in UV units of the (downsampled) blur buffer.
    const spread = this.radius / DOWNSAMPLE; // radius in blur-buffer pixels
    const stepX = spread / 4 / this._bw; // 4 = outermost kernel tap index
    const stepY = spread / 4 / this._bh;

    // Horizontal: brightTarget -> blurA.
    this.blurMat.uniforms.tSrc.value = this.brightTarget.texture;
    this.blurMat.uniforms.uStep.value.set(stepX, 0);
    this._draw(this.blurMat, this.blurA);

    // Vertical: blurA -> blurB.
    this.blurMat.uniforms.tSrc.value = this.blurA.texture;
    this.blurMat.uniforms.uStep.value.set(0, stepY);
    this._draw(this.blurMat, this.blurB);

    // (c) convex composite: glow*blur + (1-glow)*base -> canvas.
    this.compositeMat.uniforms.tBase.value = baseTexture;
    this.compositeMat.uniforms.tBloom.value = this.blurB.texture;
    this.compositeMat.uniforms.uGlow.value = this.glow;
    this._draw(this.compositeMat, null);
  }
}
