import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Surface navigation for the frog crawling over the voxel cubes.
//
// State = { cell, face, heading }:
//   cell    : integer voxel coords {x,y,z} of the cube the frog stands on
//   face    : outward unit normal of the face it stands on ("up")
//   heading : unit direction it walks along that face (⊥ to face)
//
// A single "forward hop" rule handles all cases by checking neighbor occupancy,
// exactly like marching over a voxel surface:
//
//   1. STEP UP (concave): if a cube sits ahead-and-up (cell+heading+face),
//      climb onto its facing wall.  new face = heading, new heading = -face.
//   2. STEP FLAT: else if the cube directly ahead (cell+heading) is solid,
//      walk onto it.  face/heading unchanged.
//   3. STEP DOWN (convex): else (ahead is empty) wrap around the edge onto the
//      SAME cube's next face.  new face = -heading... wait, new face = heading? no:
//      wrapping over a convex edge -> new face = old heading is wrong; the frog
//      tips forward so its new "up" becomes the old heading's opposite of travel.
//      Correct: new face = -heading, new heading = face.
//
// (The exact new-basis formulas are derived and unit-tested in the move fns.)
// ---------------------------------------------------------------------------

// Snap a vector to the nearest axis unit vector (guards float drift).
function axisSnap(v) {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
  if (ax >= ay && ax >= az) return new THREE.Vector3(Math.sign(v.x), 0, 0);
  if (ay >= az) return new THREE.Vector3(0, Math.sign(v.y), 0);
  return new THREE.Vector3(0, 0, Math.sign(v.z));
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cellShift = (cell, dir) => ({ x: cell.x + dir.x, y: cell.y + dir.y, z: cell.z + dir.z });

// The four headings available on a given face (perpendicular unit dirs).
export function headingsFor(face) {
  const f = axisSnap(face);
  // Pick any axis not parallel to the face, build the tangent frame.
  const ref = Math.abs(f.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  const a = new THREE.Vector3().crossVectors(ref, f).normalize();
  const b = new THREE.Vector3().crossVectors(f, a).normalize();
  return [a.clone(), b.clone(), a.clone().negate(), b.clone().negate()].map(axisSnap);
}

// World point where the frog's feet rest: cube center + face * halfEdge.
export function footPoint(grid, cell, face) {
  const c = grid.cellCenter(cell.x, cell.y, cell.z);
  return c.addScaledVector(axisSnap(face), grid.topHalf);
}

// Orientation quaternion from a surface basis. Empirically the model's nose
// points along its local +Z, so we want local +Z -> heading and local +Y ->
// face. makeBasis(x, y, z) maps local +X/+Y/+Z to its columns, so the third
// column is `heading` and the first is a right vector consistent with it.
export function basisQuaternion(face, heading) {
  const up = axisSnap(face);
  const fwd = axisSnap(heading);
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  const m = new THREE.Matrix4().makeBasis(right, up, fwd);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

// Plan a forward hop. Returns { cell, face, heading, kind } for the landing
// state, where kind ∈ 'up' | 'flat' | 'down' selects the arc style.
export function planForward(grid, cell, face, heading) {
  const f = axisSnap(face);
  const h = axisSnap(heading);

  const aheadUp = cellShift(cell, V(h.x + f.x, h.y + f.y, h.z + f.z));
  const ahead = cellShift(cell, h);

  if (grid.hasCell(aheadUp.x, aheadUp.y, aheadUp.z)) {
    // STEP UP onto the wall of the taller neighbor.
    // new up = -heading? The frog climbs the near wall of the block ahead-up:
    // that wall faces back toward the frog, i.e. its normal = -heading.
    return {
      cell: aheadUp,
      face: h.clone().negate(),
      heading: f.clone(),
      kind: 'up',
    };
  }
  if (grid.hasCell(ahead.x, ahead.y, ahead.z)) {
    // STEP FLAT onto the adjacent cube, same face/heading.
    return { cell: ahead, face: f.clone(), heading: h.clone(), kind: 'flat' };
  }
  // STEP DOWN: wrap over the convex edge onto the same cube's next face.
  // new up = heading (the frog tips over the edge onto the face it was walking
  // toward), new heading = -face.
  return {
    cell: { ...cell },
    face: h.clone(),
    heading: f.clone().negate(),
    kind: 'down',
  };
}

// Long-range leap: cast a ray outward along the face normal ("up" off the
// surface) and find the nearest cube across empty space. Returns the landing
// state { cell, face, heading } — the frog lands on that cube's near face
// (normal = -rayDir) facing back the way it came (heading reversed) — or null
// if nothing is in view within `maxRange` cells.
export function planLeap(grid, cell, face, heading, maxRange = 64) {
  const dir = axisSnap(face);       // ray direction = current "up"
  // Require at least one empty cell first (a real gap), then the first solid.
  for (let d = 1; d <= maxRange; d++) {
    const c = { x: cell.x + dir.x * d, y: cell.y + dir.y * d, z: cell.z + dir.z * d };
    if (grid.hasCell(c.x, c.y, c.z)) {
      if (d < 2) return null;       // adjacent cube — that's a normal step, not a leap
      return {
        cell: c,
        face: dir.clone().negate(),      // land on the face pointing back at us
        heading: axisSnap(heading).clone(), // forward is unchanged (frog rolls, not spins)
        dist: d,
      };
    }
  }
  return null;
}

// Turn in place: rotate the heading 90° about the face normal (dir = +1/-1).
export function turnHeading(face, heading, dir) {
  const f = axisSnap(face);
  const h = axisSnap(heading);
  // rotate h about f by ±90°: h' = ±(f × h)
  const rot = new THREE.Vector3().crossVectors(f, h);
  return axisSnap(dir > 0 ? rot : rot.negate());
}
