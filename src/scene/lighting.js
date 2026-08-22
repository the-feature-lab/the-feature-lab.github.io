import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Lighting: directional lights (distance-independent, so brightness stays even
// as cubes roam — no "spotlight" hot spots). A bright key defines the lit side;
// a dimmer back light from the exact ANTIPODAL direction lifts the far faces so
// they aren't near-black (keeps some contrast for form). A cool side fill adds a
// hint of color separation; a hemisphere light adds a faint spacey tint. Shadow
// casting is disabled. A master `brightness` multiplier scales all lights.
// ---------------------------------------------------------------------------
export class Lighting {
  constructor(scene) {
    this.key = new THREE.DirectionalLight(0xffffff, 2.4);
    this.key.position.set(9, 6, 6);

    // Antipodal back light: same axis, opposite side, ~40% of the key. White so
    // it neutrally fills the shadowed faces instead of tinting them blue.
    this.back = new THREE.DirectionalLight(0xffffff, 1.0);
    this.back.position.set(-6, -9, -6);

    // Cool side fill for a hint of color separation, kept subtle.
    this.fill = new THREE.DirectionalLight(0x88aaff, 0.35);
    this.fill.position.set(-6, -2, -4);

    this.hemi = new THREE.HemisphereLight(0x223355, 0x0a0a12, 0.6);

    this.lights = [this.key, this.back, this.fill, this.hemi];
    this.lights.forEach((l) => scene.add(l));
    this._base = this.lights.map((l) => l.intensity);
  }

  // Scale all light intensities together by `mult`.
  setBrightness(mult) {
    this.lights.forEach((l, i) => { l.intensity = this._base[i] * mult; });
  }

  // Move the key light (the direction things are lit from).
  setKeyPosition(x, y, z) {
    this.key.position.set(x, y, z);
  }
}
