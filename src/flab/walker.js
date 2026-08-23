import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applySkin } from './skin.js';
import {
  WALKER_HEIGHT, WALKER_SPEED, WALKER_TURN, WALKER_FADE,
  WALKER_IDLE_MEAN, WALKER_IDLE_MIN, WALKER_WALK_MEAN, WALKER_WALK_MIN,
  WALKER_TURN_PROB, WALKER_TURN_MAX, WALKER_TURN_DUR, WALKER_WAVE_PROB,
} from '../config.js';

// ---------------------------------------------------------------------------
// Walker: a little rigged character who lives on a planet's surface, behaving
// like a game NPC rather than a wind-up toy — it stands around, wanders off for
// a few seconds, turns to look somewhere else, and occasionally waves.
//
// Movement is on a great circle: we keep a position unit-vector `p` (the point
// of the sphere it stands on) and a tangent heading `h`, and rotate both about
// (p x h) while walking. Timing is Poisson-ish (exponential waits with a floor)
// so a crowd of walkers never falls into lockstep.
//
// The GLB (Quaternius-style, via FBX2glTF) arrives upright — its
// CharacterArmature node already applies the Z-up -> Y-up rotation. Clip names
// are prefixed like "CharacterArmature|...|Walk", and cube_girl duplicates
// every clip with a ".001" suffix; clipsByName() normalizes both.
//
// Construct with the planet's spinGroup as parent so hover-scaling carries the
// walker along. Call `update(dt)` each frame.
// ---------------------------------------------------------------------------

// Map bare clip names ("Walk") -> AnimationClip, collapsing the GLB's prefixes
// and cube_girl's ".001" duplicates (first one wins).
function clipsByName(clips) {
  const out = new Map();
  for (const c of clips) {
    const bare = c.name.split('|').pop().replace(/\.\d+$/, '');
    if (!out.has(bare)) out.set(bare, c);
  }
  return out;
}

// Exponential wait with a floor, so the overall mean is `mean`.
function poisson(mean, min) {
  const m = Math.max(0, mean - min);
  return min + (-m * Math.log(1 - Math.random()));
}

export class Walker {
  // `parent` is the planet's spinGroup; `radius` its surface radius.
  // `sprite` is a person's { model, head, skin, shirt, pants, eyes } block from
  // data/people.js; it picks the GLB and recolors it.
  constructor(parent, radius, { sprite = null, file = null, phase = Math.random() * Math.PI * 2 } = {}) {
    this.parent = parent;
    this.radius = radius;
    this.sprite = sprite;
    this.model = sprite?.model || 'guy';
    this.file = file || `/cube_${this.model}.glb`;

    this.group = new THREE.Group();
    parent.add(this.group);

    this.mixer = null;
    this.object = null;   // the loaded GLB scene
    this.actions = new Map();   // bare clip name -> AnimationAction
    this.current = null;        // the action currently playing

    // Stand somewhere off the poles, with a tangent heading.
    const tilt = (Math.random() - 0.5) * 1.4;
    this.p = new THREE.Vector3(
      Math.cos(phase) * Math.cos(tilt),
      Math.sin(tilt),
      Math.sin(phase) * Math.cos(tilt)
    ).normalize();

    this.h = new THREE.Vector3(0, 1, 0).cross(this.p);
    if (this.h.lengthSq() < 1e-6) this.h.set(1, 0, 0); // p was (anti)parallel to up
    this.h.normalize();

    // Behavior state. Start idle, staggered so a crowd doesn't move as one.
    this.state = 'idle';
    this._timer = poisson(WALKER_IDLE_MEAN, WALKER_IDLE_MIN) * Math.random();
    this._turnLeft = 0;    // radians remaining in a turn-in-place
    this._turnRate = 0;
    this._drift = Math.random() * Math.PI * 2;

    this._axis = new THREE.Vector3();
    this._x = new THREE.Vector3();
    this._z = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
  }

  load() {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(this.file, (gltf) => {
        const model = gltf.scene;

        if (gltf.animations.length) {
          this.mixer = new THREE.AnimationMixer(model);
          for (const [name, clip] of clipsByName(gltf.animations)) {
            this.actions.set(name, this.mixer.clipAction(clip));
          }
          // Pose at a real frame BEFORE measuring: a SkinnedMesh's bind-pose
          // bounds are unreliable (Box3.setFromObject ignores the rig, and the
          // two models bind differently), which made them scale inconsistently.
          this.play('Idle', 0);
          this.mixer.update(0);
        }
        model.updateWorldMatrix(true, true);

        // Measure the POSED, SKINNED vertices. A skinned mesh's geometry
        // bounding box describes the bind pose, so it misses where the bones
        // actually put the soles — using it left the characters floating.
        const box = new THREE.Box3();
        const v = new THREE.Vector3();
        model.traverse((o) => {
          if (!o.isMesh) return;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
            o.localToWorld(v);
            box.expandByPoint(v);
          }
        });
        const size = new THREE.Vector3();
        box.getSize(size);

        const tall = size.y || 1;
        const s = (this.radius * 2 * WALKER_HEIGHT) / tall;
        model.scale.setScalar(s);

        // Drop so the soles rest on y=0 — the surface — rather than the
        // model's midpoint. `box` is pre-scale, so scale the offset too.
        model.position.y = -box.min.y * s;

        // Recolor to this person's palette. Clones the material, so walkers
        // sharing a GLB don't share a texture.
        if (this.sprite) applySkin(model, this.model, this.sprite);

        this.object = model;
        this.group.add(model);
        resolve(this);
      }, undefined, reject);
    });
  }

  // Crossfade to a clip by bare name. Falls back to whatever exists.
  play(name, fade = WALKER_FADE) {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    next.reset().play();
    if (this.current && fade > 0) this.current.crossFadeTo(next, fade, false);
    else if (this.current) this.current.stop();
    this.current = next;
  }

  // Pick what to do next when the current activity's timer runs out.
  _chooseNext() {
    if (this.state === 'walk') {
      // Finished a stroll — stand still for a while.
      this.state = 'idle';
      this._timer = poisson(WALKER_IDLE_MEAN, WALKER_IDLE_MIN);
      this.play(Math.random() < WALKER_WAVE_PROB ? 'Wave' : 'Idle');
      return;
    }

    // Coming out of an idle: sometimes turn to face somewhere new first.
    if (this.state === 'idle' && Math.random() < WALKER_TURN_PROB) {
      this.state = 'turn';
      const amount = (Math.random() * 2 - 1) * WALKER_TURN_MAX;
      this._turnLeft = Math.abs(amount);
      this._turnRate = Math.sign(amount) * (this._turnLeft / WALKER_TURN_DUR);
      this._timer = WALKER_TURN_DUR;
      this.play('Walk'); // stepping in place reads better than sliding
      return;
    }

    this.state = 'walk';
    this._timer = poisson(WALKER_WALK_MEAN, WALKER_WALK_MIN);
    this.play('Walk');
  }

  update(dt) {
    if (this.mixer) this.mixer.update(dt);

    this._timer -= dt;
    if (this._timer <= 0) this._chooseNext();

    if (this.state === 'turn') {
      // Rotate the heading in place; don't advance along the surface.
      const step = this._turnRate * dt;
      const use = Math.min(Math.abs(step), this._turnLeft) * Math.sign(step);
      this.h.applyAxisAngle(this.p, use).normalize();
      this._turnLeft -= Math.abs(use);
    } else if (this.state === 'walk') {
      // Gently drift the heading so paths curve instead of running dead straight.
      this._drift += dt * 0.6;
      this.h.applyAxisAngle(this.p, Math.sin(this._drift) * WALKER_TURN * dt).normalize();

      // Step forward along the great circle through p in direction h.
      this._axis.crossVectors(this.p, this.h).normalize();
      this._q.setFromAxisAngle(this._axis, WALKER_SPEED * dt);
      this.p.applyQuaternion(this._q).normalize();
      this.h.applyQuaternion(this._q).normalize();
    }

    // Re-orthogonalize: float drift would otherwise tilt the character.
    this.h.addScaledVector(this.p, -this.h.dot(this.p)).normalize();

    // Stand on the surface: local +Y = outward normal (feet point at the
    // planet's center). These GLBs face +Z rather than the three.js -Z
    // convention, so the model's +Z axis is the heading — using -Z made them
    // moonwalk. makeBasis sets the X/Y/Z columns; pass a right-handed triple.
    this.group.position.copy(this.p).multiplyScalar(this.radius);
    this._z.copy(this.h);
    this._x.crossVectors(this.p, this._z).normalize();
    this._m.makeBasis(this._x, this.p, this._z);
    this.group.quaternion.setFromRotationMatrix(this._m);
  }

  dispose() {
    this.parent.remove(this.group);
    this.mixer?.stopAllAction();
  }
}
