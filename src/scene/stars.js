import * as THREE from 'three';

// Deterministic RNG (mulberry32) so the starfield is identical every reload.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A field of stars on a (jittered) sphere shell around the origin, drawn as
// THREE.Points. Each star is rendered as a SQUARE POINT sized to exactly one
// pixelation block and snapped to the block grid, so it survives the pixel pass
// as a single lit block (no center-sampling flicker). Points are self-lit and
// depth-tested, so foreground cubes still occlude them.
//
// The seeded pattern (directions + radial jitter) is generated up to maxStars
// once. `density` picks how many are shown; `distance` scales the shell live.
export class StarField {
  constructor(scene, {
    seed = 1337,
    distance = 120,       // shell radius in world units
    density = 40,         // stars per steradian (total ≈ density * 4π)
    brightness = 1.0,     // grey level: 0 = black, 1 = white
    maxStars = 200000,    // upper bound on generated pattern
    jitter = 0.06,        // fractional radial jitter (0 = perfect sphere)
    blockPx = 5,          // pixelation block edge in device pixels (star size)
  } = {}) {
    this.scene = scene;
    this.distance = distance;
    this.density = density;
    this.brightness = brightness;
    this.maxStars = maxStars;

    // Pre-generate a fixed seeded pattern: unit direction + radius multiplier.
    const rng = mulberry32(seed);
    this.dirs = new Array(maxStars);
    this.radMul = new Float32Array(maxStars);
    for (let i = 0; i < maxStars; i++) {
      // Uniform point on the unit sphere.
      const u = rng();
      const v = rng();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const sinPhi = Math.sin(phi);
      this.dirs[i] = new THREE.Vector3(
        sinPhi * Math.cos(theta),
        sinPhi * Math.sin(theta),
        Math.cos(phi)
      );
      this.radMul[i] = 1 + (rng() - 0.5) * 2 * jitter;
    }

    // Custom Points shader: size each star to one block and snap its screen
    // position to the block grid, so the star already looks like a pixelated
    // block before the pixel pass runs.
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uBlock: { value: blockPx },              // block edge, device pixels
        uSnap: { value: 1 },                     // 1 = grid-snap to blocks, 0 = free
        uViewport: { value: new THREE.Vector2(1, 1) }, // drawing-buffer size, device px
        uColor: { value: new THREE.Color().setScalar(brightness) },
      },
      vertexShader: /* glsl */ `
        uniform float uBlock;
        uniform float uSnap;
        uniform vec2 uViewport;
        void main() {
          vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vec3 ndc = clip.xyz / clip.w;
          if (uSnap > 0.5) {
            // Snap the star's screen position to the center of its pixel block so
            // it survives pixelation as exactly one lit block.
            vec2 screen = (ndc.xy * 0.5 + 0.5) * uViewport;    // device pixels
            vec2 snapped = (floor(screen / uBlock) + 0.5) * uBlock;
            vec2 snappedNdc = snapped / uViewport * 2.0 - 1.0;
            gl_Position = vec4(snappedNdc * clip.w, ndc.z * clip.w, clip.w);
          } else {
            // Pixelation off: render at the true position, no grid snapping.
            gl_Position = clip;
          }
          gl_PointSize = uBlock; // point edge in device pixels
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() {
          gl_FragColor = vec4(uColor, 1.0); // flat square point, self-lit
        }
      `,
      depthTest: true,
      depthWrite: true,
    });

    this.points = null;
    this._positions = null;
    // Camera look direction; -Z is a sane default until the first update().
    this._camDir = new THREE.Vector3(0, 0, -1);
    this._lastCamDir = new THREE.Vector3(0, 0, -1);

    this.rebuild(); // create the Points for the current density
  }

  get count() {
    return Math.min(this.maxStars, Math.round(this.density * 4 * Math.PI));
  }

  // Rebuild the Points object (needed when the star count changes).
  rebuild() {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
    }
    const n = this.count;
    this._positions = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this._place();
  }

  // Position stars at `distance` along their fixed directions (live rescale).
  // Only the FAR hemisphere (relative to the camera) is shown: under an ortho
  // camera, near-side stars would render in front of the scene. Near-side stars
  // are pushed far behind the camera so they clip away.
  _place() {
    const n = this.count;
    const p = this._positions;
    const vx = this._camDir.x, vy = this._camDir.y, vz = this._camDir.z;
    for (let i = 0; i < n; i++) {
      const d = this.dirs[i];
      const far = d.x * vx + d.y * vy + d.z * vz > 0;
      if (far) {
        const r = this.distance * this.radMul[i];
        p[i * 3] = d.x * r;
        p[i * 3 + 1] = d.y * r;
        p[i * 3 + 2] = d.z * r;
      } else {
        // Park near-side stars far off-screen so they never render.
        p[i * 3] = p[i * 3 + 1] = 0;
        p[i * 3 + 2] = -1e6;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  // Call each frame with the active camera; re-culls the near hemisphere when
  // the camera has moved enough to matter.
  update(camera) {
    camera.getWorldDirection(this._camDir); // unit vector camera looks along
    if (this._camDir.dot(this._lastCamDir) < 0.9999) {
      this._lastCamDir.copy(this._camDir);
      this._place();
    }
  }

  // The app calls these so stars track the pixelation grid and viewport.
  setBlockPx(px) {
    this.mat.uniforms.uBlock.value = px;
  }

  // Toggle grid-snapping. On when pixelation is active (so each star = one
  // block); off otherwise (stars render freely at their point size).
  setSnap(on) {
    this.mat.uniforms.uSnap.value = on ? 1 : 0;
  }

  setViewport(w, h) {
    this.mat.uniforms.uViewport.value.set(w, h);
  }

  setDistance(d) {
    this.distance = d;
    this._place();       // same pattern, just moved in/out
  }

  setDensity(density) {
    this.density = density;
    this.rebuild();      // count changed → new geometry (seed-stable)
  }

  setBrightness(b) {
    this.brightness = b;
    this.mat.uniforms.uColor.value.setScalar(b);
  }
}
