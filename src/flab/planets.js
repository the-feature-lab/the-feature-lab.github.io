import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { loadFont, FONTS } from './fontcache.js';
import { Walker } from './walker.js';
import {
  PLANET_LABEL_SIZE, PLANET_LABEL_GAP, PLANET_LABEL_COLOR,
  PLANET_HOVER_SCALE, PLANET_HOVER_SPEED,
  PLANET_SPIN_MIN, PLANET_SPIN_MAX,
} from '../config.js';

// A cartoonish wooden signpost planted on a planet's north pole (+Y): a thin
// post with a small plank near the top bearing `label`. Parented to the spinning
// model group so it sits on the surface. Little-Prince vibe.
//
// NOTE: kept but currently UNUSED — enable per-planet via `signpost: true` in a
// planet spec (see main.js). Reverted to floating labels for the first pass;
// revisit this treatment later.
const WOOD = 0x8a5a2b;      // post/plank brown
const SIGN_INK = 0x3a2410;  // engraved text color
function buildSignpost(parent, radius, label) {
  const post = new THREE.Group();
  // Plant at the top of the planet, leaning slightly for charm.
  post.position.set(radius * 0.15, radius * 0.92, radius * 0.15);
  post.rotation.z = -0.12;
  parent.add(post);

  const postH = radius * 1.1;
  const postR = radius * 0.05;
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(postR, postR, postH, 6),
    new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.9 })
  );
  stick.position.y = postH / 2; // base at the plant point
  post.add(stick);

  // Plank crossing near the top.
  const plankW = radius * 1.15;
  const plankH = radius * 0.42;
  const plankD = radius * 0.08;
  const plank = new THREE.Mesh(
    new THREE.BoxGeometry(plankW, plankH, plankD),
    new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.9 })
  );
  plank.position.set(plankW * 0.28, postH * 0.86, 0); // offset like a real signpost arm
  post.add(plank);

  // Engraved label on the plank front.
  loadFont(FONTS['Jersey 10']).then((font) => {
    const size = plankH * 0.5;
    const geo = new TextGeometry(label, {
      font, size, depth: plankD * 0.6, curveSegments: 4, bevelEnabled: false,
    });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
    // Center on the plank, text popping out the front (+Z).
    geo.translate(-bb.min.x - w / 2, -bb.min.y - h / 2, plankD / 2);
    const text = new THREE.Mesh(
      geo, new THREE.MeshStandardMaterial({ color: SIGN_INK, roughness: 0.7 })
    );
    text.position.copy(plank.position);
    post.add(text);
  });
}

// Deterministic RNG (mulberry32) so each planet's spin is fixed across reloads.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Planets: GLB planets (future nav links), each placed at an explicit position
// with a floating label above it. Each planet spins slowly at a deterministic
// seeded rate/direction. Hovering a planet smoothly scales it up (and back down
// on exit) via a continuous lerp.
//
// The planet GLBs are lumpy, not spheres: `diameter` is derived from the
// model's y extent, so the nominal radius overshoots the real surface almost
// everywhere and walkers standing at it appear to hover. Ray-cast inward from
// many directions and take the mean hit radius — that's the height to walk at.
function meanSurfaceRadius(model, fallback) {
  const meshes = [];
  model.traverse((o) => { if (o.isMesh) meshes.push(o); });
  if (!meshes.length) return fallback;

  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3();
  let sum = 0, n = 0;
  const SAMPLES = 128;
  // Distances are measured from the model's own centre, which sits at its
  // local origin (planets.js recenters it above).
  // Fibonacci sphere: evenly spread directions without clustering at the poles.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < SAMPLES; i++) {
    const y = 1 - (i / (SAMPLES - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    dir.set(Math.cos(th) * r, y, Math.sin(th) * r);
    ray.set(dir.clone().multiplyScalar(fallback * 8), dir.clone().negate());
    const hit = ray.intersectObjects(meshes, true)[0];
    if (hit) { sum += hit.point.length(); n++; }
  }
  return n ? sum / n : fallback;
}

// spawnPlanets(scene, camera, renderer, { planets: [{file,label,diameter,pos:[x,y]}] })
//   spec.walker: true, or { files: ['/cube_guy.glb', ...] } — characters that
//   stroll the planet's surface (see flab/walker.js).
//   -> { update(dt), setPointer(ndcX, ndcY) }
// ---------------------------------------------------------------------------
export function spawnPlanets(scene, camera, renderer, { planets: specs, seed = 20250822 }) {
  const rng = mulberry32(seed);
  const items = [];              // { group, spinGroup, axis, rate, hovered, scale }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-2, -2); // offscreen until first move

  specs.forEach((spec) => {
    const [px, py] = spec.pos;
    const group = new THREE.Group();
    group.position.set(px, py, spec.pos[2] ?? 0);
    scene.add(group);

    // A child group holds the model so hover-scaling and spin don't fight the
    // label (which lives directly under `group`, unscaled).
    const spinGroup = new THREE.Group();
    group.add(spinGroup);

    // Slow gentle spin: a mostly-upright axis with a slight tilt, a seeded rate
    // in [MIN, MAX], and a random direction — each planet drifts differently.
    // (spinGroup carries any walkers, so creatures turn with the planet.)
    const axis = new THREE.Vector3((rng() - 0.5) * 0.5, 1, (rng() - 0.5) * 0.5).normalize();
    const dir = rng() < 0.5 ? -1 : 1;
    const rate = dir * (PLANET_SPIN_MIN + rng() * (PLANET_SPIN_MAX - PLANET_SPIN_MIN));

    const item = {
      group, spinGroup, axis, rate,
      diameter: spec.diameter, radius: spec.diameter / 2,
      href: spec.href || null,
      center: new THREE.Vector3(px, py, spec.pos[2] ?? 0),
      hovered: false, scale: 1, meshes: [],
    };
    items.push(item);

    new GLTFLoader().load(spec.file, (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3(); box.getSize(size);
      const center = new THREE.Vector3(); box.getCenter(center);
      const s = spec.diameter / (size.y || 1);
      model.scale.setScalar(s);
      model.position.set(-center.x * s, -center.y * s, -center.z * s);
      // Measure the surface BEFORE parenting: once the model is under
      // spinGroup/group it inherits the planet's world offset, and a raycast
      // fired from the origin would miss it entirely.
      model.updateMatrixWorld(true);
      item.walkRadius = meanSurfaceRadius(model, item.radius);
      if (item.walkers) for (const w of item.walkers) w.radius = item.walkRadius;

      spinGroup.add(model);
      model.traverse((o) => { if (o.isMesh) item.meshes.push(o); });
    }, undefined, (err) => console.error('[planets] failed to load', spec.file, err));

    // Opt-in: a little character strolling around this planet's surface.
    // Parented to spinGroup so hover-scaling carries it. Deliberately NOT added
    // to item.meshes — it must not become a click/hover target for the planet.
    if (spec.walker) {
      const opts = typeof spec.walker === 'object' ? spec.walker : {};
      // `sprites` is a list of per-person { model, head, skin, ... } blocks;
      // each becomes one recolored character, spaced around the planet.
      const sprites = opts.sprites || [null];
      item.walkers = sprites.map(
        (sprite, i, arr) => new Walker(spinGroup, item.walkRadius ?? item.radius, {
          sprite,
          phase: (i / arr.length) * Math.PI * 2,
        })
      );
      for (const w of item.walkers) {
        w.load().catch((err) => console.error('[planets] walker failed', err));
      }
    }

    if (spec.signpost) {
      // EXPERIMENT: a Little-Prince-style wooden signpost planted on the planet.
      buildSignpost(spinGroup, item.radius, spec.label);
    } else {
      // Floating label above the planet.
      loadFont(FONTS['Jersey 10']).then((font) => {
        const geo = new TextGeometry(spec.label, {
          font, size: PLANET_LABEL_SIZE, depth: 0.08, curveSegments: 4, bevelEnabled: false,
        });
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
        const ly = item.radius + PLANET_LABEL_GAP;
        geo.translate(-bb.min.x - w / 2, -bb.min.y - h / 2 + ly, -0.04);
        const label = new THREE.Mesh(
          geo, new THREE.MeshStandardMaterial({ color: PLANET_LABEL_COLOR, roughness: 0.6 })
        );
        group.add(label);
      });
    }
  });

  // Update the pointer in normalized device coords (-1..1) for hover raycasts.
  function setPointer(ndcX, ndcY) {
    pointer.set(ndcX, ndcY);
  }

  // The planet currently under the pointer (or null).
  function pick() {
    raycaster.setFromCamera(pointer, camera);
    for (const it of items) {
      if (it.meshes.length && raycaster.intersectObjects(it.meshes, false).length) {
        return it;
      }
    }
    return null;
  }

  function updateHover() {
    const hit = pick();
    for (const it of items) it.hovered = (it === hit);
    renderer.domElement.style.cursor = hit ? 'pointer' : ''; // cursor feedback
  }

  const q = new THREE.Quaternion();
  return {
    update(dt) {
      updateHover();
      for (const it of items) {
        // Spin the model.
        q.setFromAxisAngle(it.axis, it.rate * dt);
        it.spinGroup.quaternion.multiply(q);
        // Smoothly approach the hover/rest scale (framerate-independent lerp).
        const target = it.hovered ? PLANET_HOVER_SCALE : 1;
        const k = 1 - Math.exp(-PLANET_HOVER_SPEED * dt);
        it.scale += (target - it.scale) * k;
        it.spinGroup.scale.setScalar(it.scale);
        if (it.walkers) for (const w of it.walkers) w.update(dt);
      }
    },
    setPointer,
    pick, // the planet under the pointer (for click handling), or null
  };
}
