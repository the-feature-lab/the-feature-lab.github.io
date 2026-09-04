import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  CUBE_SIZE, FLAB_SCALE, FROG_FOOTPRINT,
  FROG_IDLE_MEAN, FROG_IDLE_MIN, FROG_LEAP_COOLDOWN,
  FROG_HOP_DUR, FROG_HOP_HEIGHT, FROG_JUMP_HEIGHT, FROG_JUMP_PROB,
  FROG_LEAP_DUR, FROG_LEAP_WEIGHT, FROG_HOVER_SCALE, FROG_HOVER_SPEED,
} from '../config.js';
import {
  footPoint, basisQuaternion, planForward, planLeap, turnHeading, headingsFor,
} from './surface.js';
import { playPop } from './sound.js';

// Key for a surface slot (cell + face) — a frog's "space" that others avoid.
function slotKey(cell, face) {
  return `${cell.x},${cell.y},${cell.z}|${Math.round(face.x)},${Math.round(face.y)},${Math.round(face.z)}`;
}

// Poisson-process inter-move delay: an exponential wait shifted so the floor is
// FROG_IDLE_MIN and the overall mean is FROG_IDLE_MEAN.
function nextDelay() {
  const u = Math.random();
  const mean = Math.max(0, FROG_IDLE_MEAN - FROG_IDLE_MIN);
  return FROG_IDLE_MIN + (-mean * Math.log(1 - u));
}

// ---------------------------------------------------------------------------
// Frog: a little GLB critter that crawls over the FLAB cubes' surfaces. It lives
// on a face of a cube with a heading along that face; once a second it does a
// quick hop — a turn in place, or a forward hop that (via one marching rule)
// may go flat, wrap DOWN around a convex corner, or climb UP onto a taller
// neighbor's wall. Feet always plant on the surface (up = face normal), and
// each hop arcs outward so the frog never clips through a cube.
//
// Construct, then call `load()`; drive with `update(dt)` each frame.
// ---------------------------------------------------------------------------
export class Frog {
  // `colony` is a Set of occupied slot keys shared by all frogs (collision
  // avoidance). `start` is { cell, face, heading } — an EXPOSED surface slot.
  constructor(scene, grid, colony, start) {
    this.scene = scene;
    this.grid = grid;
    this.colony = colony;

    this.group = null;    // positioned/oriented root
    this.model = null;    // inner (cloned) GLB scene; squash/stretch acts here
    this.baseScale = 1;

    // Surface state (an exposed face of the start cube).
    this.cell = { ...start.cell };
    this.face = start.face.clone();       // "up" (outward normal)
    this.heading = start.heading.clone(); // walk direction along the face
    // Reserve the start slot — unless `transient` (a split frog momentarily
    // co-located with its parent, about to hop off to reserve its real slot).
    if (!start.transient) this.colony.add(slotKey(this.cell, this.face));

    // Hop animation state.
    this._delay = nextDelay(); // Poisson wait until the next action
    this._timer = 0;
    this._t = -1;         // 0..1 hop progress, or <0 when idle
    this._hop = null;

    this._history = [];        // recent moves for anti-repetition rules
    this._sinceLeap = FROG_LEAP_COOLDOWN; // start ready to leap

    this.meshes = [];          // pickable meshes (for hover/click raycasts)
    this.hovered = false;
    this._hover = 1;           // current hover-scale multiplier (lerps to target)
  }

  // Build this frog from a pre-scaled template { model, baseScale } (loaded once
  // and cloned per frog).
  build(template) {
    this.baseScale = template.baseScale;
    this._offset = template.offset.clone(); // unscaled feet/center offset
    this.model = template.model.clone(true);

    this.group = new THREE.Group();
    this.group.add(this.model);
    this.meshes = [];
    this.model.traverse((o) => { if (o.isMesh) this.meshes.push(o); });
    this._applyPose(footPoint(this.grid, this.cell, this.face),
                    basisQuaternion(this.face, this.heading));
    this.scene.add(this.group);
  }

  // Scale the model (per-axis) while KEEPING the feet planted on the surface:
  // the position offset must scale with the same factors, else growing the frog
  // pushes its soles below y=0. `sx/sy/sz` are absolute scale factors.
  _scaleModel(sx, sy, sz) {
    this.model.scale.set(sx, sy, sz);
    this.model.position.set(this._offset.x * sx, this._offset.y * sy, this._offset.z * sz);
  }

  _applyPose(pos, quat) {
    this.group.position.copy(pos);
    this.group.quaternion.copy(quat);
  }

  // Landing states reachable by a single forward hop from THIS face — one per
  // in-face heading (flat / corner-up / corner-down all fall out of the marching
  // rule). Used to place a split-off frog only where the parent could hop.
  reachableSlots() {
    const out = [];
    for (const heading of headingsFor(this.face)) {
      const m = planForward(this.grid, this.cell, this.face, heading);
      out.push({ cell: m.cell, face: m.face, heading: m.heading });
    }
    return out;
  }

  // Force a scripted hop from the current slot to a given landing state (used by
  // a newly split frog to jump out of its parent). Reuses the normal hop path.
  hopTo(next) {
    this._timer = 0;
    this._t = 0;
    const fromPos = footPoint(this.grid, this.cell, this.face);
    const fromQuat = basisQuaternion(this.face, this.heading);
    this._hop = {
      type: 'forward', kind: 'flat', next,
      fromPos, toPos: footPoint(this.grid, next.cell, next.face),
      fromQuat, toQuat: basisQuaternion(next.face, next.heading),
    };
    this.colony.add(slotKey(next.cell, next.face)); // reserve destination
    this._hop.bow = this._bowVector(this._hop);
  }

  // Enumerate the legal hops from the current state and pick one at random.
  _chooseHop() {
    const fromPos = footPoint(this.grid, this.cell, this.face);
    const fromQuat = basisQuaternion(this.face, this.heading);

    const options = [];

    // Forward hop (flat / up / down all fall out of the marching rule).
    const fwd = planForward(this.grid, this.cell, this.face, this.heading);
    const toPos = footPoint(this.grid, fwd.cell, fwd.face);
    const toQuat = basisQuaternion(fwd.face, fwd.heading);
    options.push({
      type: 'forward', kind: fwd.kind,
      next: { cell: fwd.cell, face: fwd.face, heading: fwd.heading },
      fromPos, toPos, fromQuat, toQuat,
      // Weight forward moves so the frog tends to explore rather than spin.
      weight: fwd.kind === 'flat' ? FROG_JUMP_PROB * 2 : FROG_JUMP_PROB * 1.5,
    });

    // Long-range leap: if a cube is visible straight out from the surface (along
    // the face normal), the frog can roll across the gap onto it — but only if it
    // hasn't leapt within the last FROG_LEAP_COOLDOWN moves.
    if (this._sinceLeap >= FROG_LEAP_COOLDOWN) {
      const leap = planLeap(this.grid, this.cell, this.face, this.heading);
      if (leap) {
        options.push({
          type: 'leap', kind: 'leap',
          next: { cell: leap.cell, face: leap.face, heading: leap.heading },
          fromPos,
          toPos: footPoint(this.grid, leap.cell, leap.face),
          fromQuat,
          toQuat: basisQuaternion(leap.face, leap.heading),
          weight: FROG_LEAP_WEIGHT,
        });
      }
    }

    // Two in-place turns (±90° about the face normal), each tagged with its
    // direction so anti-repetition rules can reason about them.
    for (const dir of [-1, 1]) {
      const nh = turnHeading(this.face, this.heading, dir);
      options.push({
        type: 'turn', kind: 'turn', dir,
        next: { cell: this.cell, face: this.face.clone(), heading: nh },
        fromPos, toPos: fromPos.clone(),
        fromQuat, toQuat: basisQuaternion(this.face, nh),
        weight: 1,
      });
    }

    // Anti-repetition filtering:
    //   (a) never turn three times in a row — if the last two moves were turns,
    //       disallow turning again;
    //   (b) never immediately turn back — if the last move was a turn, disallow
    //       the opposite-direction turn.
    const [last, prev] = this._history;
    const mySlot = slotKey(this.cell, this.face);
    const allowed = options.filter((o) => {
      // Collision avoidance: don't move into a slot another frog occupies. Turns
      // stay on the current slot (which we own), so they're always fine.
      if (o.type !== 'turn') {
        const dest = slotKey(o.next.cell, o.next.face);
        if (dest !== mySlot && this.colony.has(dest)) return false;
      }
      if (o.type !== 'turn') return true;
      if (last?.type === 'turn' && prev?.type === 'turn') return false; // (a)
      if (last?.type === 'turn' && o.dir === -last.dir) return false;   // (b)
      return true;
    });
    // Usually a turn is available, but a frog could be boxed in (both turns cut
    // by anti-repetition and forward/leap blocked by neighbors). Return null so
    // it simply waits out the cycle.
    if (allowed.length === 0) return null;

    // Weighted random pick.
    const total = allowed.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * total;
    for (const o of allowed) { if ((r -= o.weight) <= 0) return o; }
    return allowed[allowed.length - 1];
  }

  update(dt) {
    if (!this.group) return;

    // Smoothly approach the hover scale (framerate-independent lerp).
    const hoverTarget = this.hovered ? FROG_HOVER_SCALE : 1;
    this._hover += (hoverTarget - this._hover) * (1 - Math.exp(-FROG_HOVER_SPEED * dt));

    if (this._t < 0) {
      // Idle: hover grows the frog UPWARD from its planted feet (feet stay on the
      // surface; only the top rises). Grow Y more than XZ for an "up" stretch.
      const bs = this.baseScale;
      const sy = bs * this._hover;
      const sxz = bs * (1 + (this._hover - 1) * 0.4); // widen less than it grows tall
      this._scaleModel(sxz, sy, sxz);
      this._timer += dt;
      if (this._timer < this._delay) return;
      this._timer = 0;
      this._delay = nextDelay();

      const hop = this._chooseHop();
      if (!hop) return; // fully boxed in this cycle; try again next delay

      this._t = 0;
      this._hop = hop;

      // Reserve the destination slot and release the origin so other frogs can
      // flow in behind. (A turn keeps the same slot — no change needed.)
      if (hop.type !== 'turn') {
        this.colony.delete(slotKey(this.cell, this.face));
        this.colony.add(slotKey(hop.next.cell, hop.next.face));
      }

      // Leap cooldown: reset on a leap, otherwise count moves since.
      this._sinceLeap = hop.type === 'leap' ? 0 : this._sinceLeap + 1;

      // Record the move for anti-repetition rules (keep the last two).
      this._history.unshift({ type: hop.type, dir: hop.dir });
      this._history.length = Math.min(this._history.length, 2);
      // Precompute the arc's outward bow (grounded hops only; leaps go straight).
      if (hop.type !== 'leap') hop.bow = this._bowVector(hop);
      return;
    }

    const hop = this._hop;
    const dur = hop.type === 'leap' ? FROG_LEAP_DUR : FROG_HOP_DUR;
    this._t += dt / dur;
    const t = Math.min(this._t, 1);
    const e = t * t * (3 - 2 * t);          // smoothstep for orientation + travel
    const arc = Math.sin(t * Math.PI);      // 0..1..0 bump

    if (hop.type === 'leap') {
      // In space: a straight-line coast at constant velocity (no gravity, so no
      // arc). Forward stays fixed; the frog just rolls 180° about its own forward
      // axis (local +Z) early in the flight so its feet end up on the far wall.
      this.group.position.lerpVectors(hop.fromPos, hop.toPos, t);
      const rollT = Math.min(t / 0.4, 1);        // roll completes in the first 40%
      const roll = (rollT * rollT * (3 - 2 * rollT)) * Math.PI; // eased 0..180°
      this.group.quaternion.copy(hop.fromQuat).multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll)
      );
    } else {
      // Grounded hops: lerp along the surface + an outward bow so the body swings
      // around edges through empty space (never clipping a cube).
      const p = new THREE.Vector3().lerpVectors(hop.fromPos, hop.toPos, e);
      p.addScaledVector(hop.bow, arc);
      this.group.position.copy(p);
      this.group.quaternion.copy(hop.fromQuat).slerp(hop.toQuat, e);
    }

    // Squash & stretch along the frog's local up (belly stays on-ish surface),
    // multiplied by the current hover scale. Feet stay planted (_scaleModel).
    const stretch = arc;
    const sy = 1 + 0.28 * stretch - 0.18 * (1 - stretch);
    const sxz = 1 / Math.sqrt(sy);
    const bs = this.baseScale * this._hover;
    this._scaleModel(bs * sxz, bs * sy, bs * sxz);

    if (this._t >= 1) {
      // Land: commit the new surface state and snap to it exactly.
      this.cell = hop.next.cell;
      this.face = hop.next.face.clone();
      this.heading = hop.next.heading.clone();
      this._applyPose(hop.toPos, hop.toQuat);
      this._scaleModel(this.baseScale * this._hover, this.baseScale * this._hover, this.baseScale * this._hover);
      this._t = -1;
      this._hop = null;
    }
  }

  // Outward bow for the hop arc, in world units. Turns and flat hops just pop
  // straight up along the face normal; corner wraps bow along the average of the
  // start and end normals so the frog swings clear around the edge.
  _bowVector(hop) {
    const up = this.face.clone().normalize();
    // (Leaps are straight-line coasts and don't use a bow.)
    if (hop.type === 'turn') {
      return up.multiplyScalar(FROG_HOP_HEIGHT);
    }
    if (hop.kind === 'flat') {
      return up.multiplyScalar(FROG_JUMP_HEIGHT);
    }
    // Corner wrap (up/down): bow along the blended normal of both faces so the
    // path bulges away from the shared edge.
    const n0 = this.face.clone().normalize();
    const n1 = hop.next.face.clone().normalize();
    const blend = n0.add(n1);
    if (blend.lengthSq() < 1e-6) blend.copy(up); // antipodal guard
    return blend.normalize().multiplyScalar(FROG_JUMP_HEIGHT);
  }
}

// Candidate faces for an exposed surface slot, preference-ordered.
const FROG_FACES = [
  new THREE.Vector3(0, 1, 0),   // top
  new THREE.Vector3(1, 0, 0),   // right
  new THREE.Vector3(-1, 0, 0),  // left
  new THREE.Vector3(0, -1, 0),  // bottom
  new THREE.Vector3(0, 0, 1),   // front (always exposed — one cube deep)
];

// All EXPOSED slots on the grid ({cell, face, heading}); a slot is exposed when
// the neighbor cell in the face direction is empty (frog isn't wedged in).
function exposedSlots(grid) {
  const cells = [...grid.occupied].map((k) => {
    const [col, gridRow] = k.split(',').map(Number);
    return { x: col, y: gridRow, z: 0 };
  });
  cells.sort((a, b) => b.y - a.y || a.x - b.x); // deterministic order
  const slots = [];
  for (const cell of cells) {
    for (const face of FROG_FACES) {
      if (grid.hasCell(cell.x + face.x, cell.y + face.y, cell.z + face.z)) continue;
      slots.push({ cell, face, heading: headingsFor(face)[0] });
    }
  }
  return slots;
}

// ---------------------------------------------------------------------------
// spawnFrogs: load the GLB once (shared template) and manage a colony of frogs.
// Starts with `count`; a frog can split in two on click (a new frog leaps to a
// free neighboring slot). Frogs are hoverable (raycast) and grow while hovered.
// Returns { update, setEnabled, setPointer, pick, split, reset }.
// ---------------------------------------------------------------------------
export function spawnFrogs(scene, grid, camera, count) {
  const colony = new Set();           // occupied slot keys (collision avoidance)
  let frogs = [];
  let template = null;                // { model, baseScale } once the GLB loads
  let enabled = true;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-2, -2);
  let hovering = false;               // is a frog under the pointer right now?

  function addFrog(slot) {
    const f = new Frog(scene, grid, colony, slot);
    if (template) { f.build(template); f.group.visible = enabled; }
    frogs.push(f);
    return f;
  }

  // Initial frogs, spread across distinct exposed slots.
  const slots = exposedSlots(grid);
  const n = Math.min(count, slots.length);
  const stride = Math.max(1, Math.floor(slots.length / n));
  const used = new Set();
  for (let i = 0, picked = 0; picked < n && i < slots.length * 2; i++) {
    const slot = slots[(i * stride) % slots.length];
    const key = slotKey(slot.cell, slot.face);
    if (used.has(key)) continue;
    used.add(key);
    addFrog(slot);
  }

  // Load the model once; scale to a template; build every frog.
  new GLTFLoader().load('/frog.glb', (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const cubeEdge = CUBE_SIZE * FLAB_SCALE;
    const footprint = Math.max(size.x, size.z) || 1;
    const baseScale = (cubeEdge * FROG_FOOTPRINT) / footprint;
    model.scale.setScalar(baseScale);
    model.position.set(-center.x * baseScale, -box.min.y * baseScale, -center.z * baseScale);
    // Unscaled local offsets so a frog can re-anchor its feet at any scale.
    template = { model, baseScale, offset: new THREE.Vector3(-center.x, -box.min.y, -center.z) };
    for (const f of frogs) { f.build(template); f.group.visible = enabled; }
  }, undefined, (err) => console.error('[frog] failed to load /frog.glb', err));

  function removeFrog(f) {
    colony.delete(slotKey(f.cell, f.face));
    if (f.group) scene.remove(f.group);
    frogs = frogs.filter((x) => x !== f);
  }

  return {
    update(dt) {
      if (!enabled) return;
      // Hover: the frog under the pointer grows.
      raycaster.setFromCamera(pointer, camera);
      let hit = null;
      for (const f of frogs) {
        if (f.meshes.length && raycaster.intersectObjects(f.meshes, false).length) { hit = f; break; }
      }
      for (const f of frogs) f.hovered = (f === hit);
      for (const f of frogs) f.update(dt);
      hovering = hit !== null;
    },
    // Whether a frog is under the pointer (drives the pointer cursor, OR'd in by
    // planets since both share renderer.domElement.style.cursor).
    isHovering() { return hovering; },
    setEnabled(on) {
      enabled = on;
      for (const f of frogs) if (f.group) f.group.visible = on;
    },
    setPointer(x, y) { pointer.set(x, y); },
    // The frog under the pointer (for click handling), or null.
    pick() {
      raycaster.setFromCamera(pointer, camera);
      for (const f of frogs) {
        if (f.meshes.length && raycaster.intersectObjects(f.meshes, false).length) return f;
      }
      return null;
    },
    // Split a frog: a new frog jumps OUT of it to a free slot the parent could
    // hop to (a reachable face, via the same marching rules), if any.
    split(frog) {
      if (!template) return false;
      const dest = frog.reachableSlots().filter(
        (s) => !colony.has(slotKey(s.cell, s.face))
      );
      if (!dest.length) return false;
      const to = dest[Math.floor(Math.random() * dest.length)];
      // Spawn co-located with the parent (transient: don't reserve the shared
      // slot), then hop it out to the destination (which reserves the dest slot).
      const child = addFrog({
        cell: frog.cell, face: frog.face, heading: frog.heading, transient: true,
      });
      child.hopTo(to);
      playPop(); // the new frog popping out of the old one
      return true;
    },
    // Cull back to a single frog (for "restore defaults").
    reset() {
      while (frogs.length > 1) removeFrog(frogs[frogs.length - 1]);
    },
  };
}
