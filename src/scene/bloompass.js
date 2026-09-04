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

    // Separable Gaussian. The old version used a fixed 9-tap kernel and spread
    // the taps to fit `radius` — so at large radius the taps sat many pixels
    // apart with nothing sampled between them, producing 9 discrete copies whose
    // overlaps rippled into visible light/dark bands. Instead we keep the taps a
    // fixed ~1 texel apart (`uStep` = one blur-texel) and take a FIXED number of
    // them (MAX_TAPS), Gaussian-weighting each by its distance from a sigma that
    // scales with radius. So radius only reshapes the weights, never opens gaps.
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: null },
        uStep: { value: new THREE.Vector2(0, 0) }, // one blur-texel on the axis
        uSigma: { value: 1.0 },                    // gaussian sigma, in texels
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tSrc;
        uniform vec2 uStep;   // one blur-texel step on the active axis (UV)
        uniform float uSigma; // gaussian sigma in texels (scales with radius)

        // Fixed tap budget. Taps are one texel apart, so this also caps the
        // effective radius; sized to comfortably cover the default glow. The
        // linear filter integrates within each texel, so there are no gaps.
        const int MAX_TAPS = 48;

        void main() {
          float inv2s2 = 1.0 / (2.0 * uSigma * uSigma);
          vec3 acc = texture2D(tSrc, vUv).rgb;   // center, weight exp(0)=1
          float wsum = 1.0;
          for (int i = 1; i <= MAX_TAPS; i++) {
            float d = float(i);
            float w = exp(-d * d * inv2s2);
            if (w < 0.0015) break;               // negligible tail; stop early
            vec2 off = uStep * d;
            acc += (texture2D(tSrc, vUv + off).rgb +
                    texture2D(tSrc, vUv - off).rgb) * w;
            wsum += 2.0 * w;
          }
          gl_FragColor = vec4(acc / wsum, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    // Composite: the halo bleeds ONLY into empty (black) space — bright shapes
    // glow outward into the dark without the scene itself getting blurrier.
    //   out = base + glow * bloom * emptyMask
    // where emptyMask ~ 1 where base is black and ~ 0 where base has content, so
    // any non-empty pixel is left exactly unchanged. `glow` is the halo strength.
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: null },
        tBloom: { value: null },
        uGlow: { value: glow }, // halo strength (0 = none)
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
          // Empty-space mask: 1 where the base pixel is (near) black, fading to 0
          // as it gains any brightness — so lit pixels stay untouched (no blur).
          float baseLum = max(base.r, max(base.g, base.b));
          float emptyMask = 1.0 - smoothstep(0.0, 0.02, baseLum);
          vec3 outc = base + uGlow * bloom * emptyMask;
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

    // (b) separable Gaussian blur. Taps stay one blur-texel apart (no gaps to
    // ripple); the requested output `radius` becomes a gaussian sigma measured
    // in blur-buffer texels, which reshapes the weights without spreading taps.
    const sigma = Math.max(0.5, this.radius / DOWNSAMPLE / 2); // ~radius covers 2 sigma
    this.blurMat.uniforms.uSigma.value = sigma;

    // Horizontal: brightTarget -> blurA. uStep = one texel on the X axis.
    this.blurMat.uniforms.tSrc.value = this.brightTarget.texture;
    this.blurMat.uniforms.uStep.value.set(1 / this._bw, 0);
    this._draw(this.blurMat, this.blurA);

    // Vertical: blurA -> blurB. uStep = one texel on the Y axis.
    this.blurMat.uniforms.tSrc.value = this.blurA.texture;
    this.blurMat.uniforms.uStep.value.set(0, 1 / this._bh);
    this._draw(this.blurMat, this.blurB);

    // (c) convex composite: glow*blur + (1-glow)*base -> canvas.
    this.compositeMat.uniforms.tBase.value = baseTexture;
    this.compositeMat.uniforms.tBloom.value = this.blurB.texture;
    this.compositeMat.uniforms.uGlow.value = this.glow;
    this._draw(this.compositeMat, null);
  }
}
