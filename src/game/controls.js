// ---------------------------------------------------------------------------
// Player control for a Frog.
//
// The autonomous frog picks its own moves inside Frog.update(); this wraps one
// frog and drives it from the keyboard instead. It does NOT modify or subclass
// Frog — it builds the same hop objects Frog does, using the same exported
// surface helpers, and hands them over. That keeps flab/frog.js untouched so
// the ambient homepage frogs and the game can't drift apart.
//
// Actions (arrow keys + space):
//   ArrowUp    hop forward
//   ArrowLeft  turn left   (instant, no travel)
//   ArrowRight turn right  (instant)
//   ArrowDown  hop backward — turn 180 instantly, then hop forward
//   Space      leap up to a surface overhead; if there's none, a small hop in
//              place so the input still reads as acknowledged
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import {
  footPoint, basisQuaternion, planForward, planLeap, turnHeading,
} from '../flab/surface.js';

// Frog.update() runs _chooseHop() whenever its idle timer passes _delay. A
// player-driven frog must never do that, so we park the timer far in the
// future every frame. (Cheaper and less invasive than patching the class.)
const NEVER = Number.MAX_SAFE_INTEGER;

export class FrogController {
  // `camera` is optional but strongly recommended: without it, left/right are
  // interpreted in the frog's own body frame, which reads as REVERSED whenever
  // the camera is looking at the frog's front (the common case).
  constructor(frog, camera = null) {
    this.frog = frog;
    this.camera = camera;
    this.enabled = false;
    this.queued = null;    // at most one buffered action, so held keys feel responsive
  }

  // Turn sign for a screen-relative request.
  //
  // turnHeading(face, heading, +1) rotates toward the frog's OWN right, which
  // is the player's left whenever the camera sees the frog head-on. Comparing
  // the body-right axis to the camera's right axis is not enough: on faces
  // where the frog is edge-on to the camera that dot product is ~0 and the sign
  // is arbitrary.
  //
  // Instead, test both candidate headings directly — project each one into
  // screen space and keep whichever actually points toward the requested side.
  // That is correct on every face and for any camera angle.
  _screenDir(want) {
    if (!this.camera) return want;
    const f = this.frog;

    // Score a candidate turn by where the frog would LAND if it then hopped —
    // projected to screen x. Using the landing point rather than the heading
    // vector handles headings that point mostly along the camera's view axis,
    // where a raw heading comparison is ambiguous.
    const here = footPoint(f.grid, f.cell, f.face).project(this.camera).x;
    const score = (dir) => {
      const h = turnHeading(f.face, f.heading, dir);
      const step = planForward(f.grid, f.cell, f.face, h);
      const target = step
        ? footPoint(f.grid, step.cell, step.face)
        : footPoint(f.grid, f.cell, f.face).addScaledVector(h, 0.5); // blocked: use the heading
      return target.project(this.camera).x - here;
    };

    const plus = score(+1);
    const minus = score(-1);
    // Both sides equally sideways (frog seen exactly edge-on): keep body frame.
    if (Math.abs(plus - minus) < 1e-6) return want;
    const rightward = plus > minus ? +1 : -1;
    return want > 0 ? rightward : -rightward;
  }

  // True while a hop animation is playing — Frog uses _t < 0 to mean idle.
  get busy() {
    return this.frog._t >= 0;
  }

  enable() {
    this.enabled = true;
    this.frog._timer = 0;
    this.frog._delay = NEVER;   // suppress autonomous hopping
  }

  disable() {
    this.enabled = false;
    this.frog._delay = 0;       // hand it back to its own wandering
    this.frog._timer = 0;
  }

  // Queue an action; it fires as soon as the current hop finishes.
  press(action) {
    if (!this.enabled) return;
    this.queued = action;
  }

  update() {
    if (!this.enabled) return;
    // Keep autonomy suppressed even if Frog.update() reset the delay.
    this.frog._delay = NEVER;
    if (this.busy || !this.queued) return;
    const action = this.queued;
    this.queued = null;
    this._act(action);
  }

  _act(action) {
    const f = this.frog;
    switch (action) {
      case 'forward': return this._hopForward(f.heading);
      case 'left':    return this._turn(this._screenDir(-1));
      case 'right':   return this._turn(this._screenDir(+1));
      case 'back': {
        // "Instant turns": flip the heading with no animation, then hop. The
        // frog's rendered orientation comes from (face, heading), so assigning
        // heading and hopping produces a single backward-looking move.
        // (180° is the same either way round, so no screen correction needed.)
        const flipped = turnHeading(f.face, turnHeading(f.face, f.heading, 1), 1);
        f.heading.copy(flipped);
        return this._hopForward(flipped);
      }
      case 'up':      return this._leap();
      default:        return;
    }
  }

  // Walk one step along `heading`, using the same marching rule as the
  // autonomous frog (flat / step-up / wrap-down are all handled by planForward).
  _hopForward(heading) {
    const f = this.frog;
    const fwd = planForward(f.grid, f.cell, f.face, heading);
    if (!fwd) return;
    this._start({
      type: 'forward', kind: fwd.kind,
      next: { cell: fwd.cell, face: fwd.face, heading: fwd.heading },
    });
  }

  _turn(dir) {
    const f = this.frog;
    const nh = turnHeading(f.face, f.heading, dir);
    this._start({
      type: 'turn', kind: 'turn', dir,
      next: { cell: f.cell, face: f.face.clone(), heading: nh },
    });
  }

  // Leap to whatever surface is overhead. With nothing above, hop in place so
  // the player sees the input registered rather than nothing happening.
  _leap() {
    const f = this.frog;
    const leap = planLeap(f.grid, f.cell, f.face, f.heading);
    if (leap) {
      this._start({
        type: 'leap', kind: 'leap',
        next: { cell: leap.cell, face: leap.face, heading: leap.heading },
      });
      return;
    }
    // No ceiling: a turn-shaped hop to the identical slot reads as a bounce.
    this._start({
      type: 'turn', kind: 'turn', dir: 0,
      next: { cell: f.cell, face: f.face.clone(), heading: f.heading.clone() },
    });
  }

  // Fill in the geometry Frog.update() expects, and hand the hop over. Mirrors
  // the bookkeeping Frog does for itself (slot reservation, bow arc).
  _start(hop) {
    const f = this.frog;
    hop.fromPos = footPoint(f.grid, f.cell, f.face);
    hop.toPos = footPoint(f.grid, hop.next.cell, hop.next.face);
    hop.fromQuat = basisQuaternion(f.face, f.heading);
    hop.toQuat = basisQuaternion(hop.next.face, hop.next.heading);
    if (hop.type !== 'leap') hop.bow = f._bowVector(hop);

    // Keep the colony's occupancy set honest so ambient frogs still avoid us.
    if (hop.type !== 'turn') {
      f.colony.delete(slotKeyOf(f.cell, f.face));
      f.colony.add(slotKeyOf(hop.next.cell, hop.next.face));
    }

    f._timer = 0;
    f._t = 0;
    f._hop = hop;
  }
}

// Same slot key format flab/frog.js uses for its shared colony set.
function slotKeyOf(cell, face) {
  return `${cell.x},${cell.y},${cell.z}|${Math.round(face.x)},${Math.round(face.y)},${Math.round(face.z)}`;
}

// Map keyboard events to actions. Returns a teardown fn.
export function bindKeys(controller, target = window) {
  const KEYS = {
    ArrowUp: 'forward', ArrowDown: 'back',
    ArrowLeft: 'left', ArrowRight: 'right',
    ' ': 'up', Spacebar: 'up',
  };
  const onKey = (e) => {
    const action = KEYS[e.key];
    if (!action) return;
    e.preventDefault();   // arrows/space would otherwise scroll the page
    // `controller` may be a forwarder that routes to whichever frog is live.
    controller.press(action);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
