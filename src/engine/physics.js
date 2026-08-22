import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { G, SOFTENING, VOXELS, SHATTER_BURST } from '../config.js';

// ---------------------------------------------------------------------------
// PhysicsWorld: the shared N-body + shatter engine used by both the homepage
// and the manybody demo.
//
// Gravity vector is zero — we apply N-body forces ourselves each substep so the
// cubes attract each other (softened inverse-square).
//
// SHATTER MODEL (swap-on-contact): each object starts as ONE solid rigid body
// (stable — no joint-lattice blowup). On a hard enough inter-object contact the
// cube is removed and replaced by a VOXELS^3 grid of free voxel bodies, each
// inheriting the parent's velocity plus a small outward burst. Freed voxels are
// independent rigid bodies that gravitate and collide but don't shatter further.
//
// Rapier must be initialized before constructing: `await PhysicsWorld.init()`.
// ---------------------------------------------------------------------------

let rapierReady = false;

// Standard PBR, but with high roughness so the specular highlight is wide and
// dim — a subtle glint rather than a harsh glancing-angle white flash.
function makeCubeMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
}

export class PhysicsWorld {
  // Initialize the Rapier WASM module once. Idempotent.
  static async init() {
    if (!rapierReady) {
      await RAPIER.init();
      rapierReady = true;
    }
  }

  constructor(scene) {
    this.scene = scene;
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.eventQueue = new RAPIER.EventQueue(true);

    // Unified body list; each rec is { rb, mesh, collider, mass, shatterable,
    // color, size, fixed }.
    this.bodies = [];
    this.recByCollider = new Map(); // collider.handle -> rec
    this.pendingShatter = new Set(); // recs to shatter after the step
  }

  makeCube({ size, color, mass, pos, vel, angvel, shatterable, fixed = false }) {
    const geo = new THREE.BoxGeometry(size, size, size);
    const mesh = new THREE.Mesh(geo, makeCubeMaterial(color));
    this.scene.add(mesh);

    // Fixed bodies are pinned in place (grid layout); dynamic bodies move freely.
    const rbDesc = (fixed
      ? RAPIER.RigidBodyDesc.fixed()
      : RAPIER.RigidBodyDesc.dynamic()
          .setLinvel(vel[0], vel[1], vel[2])
          .setAngvel(angvel)
          .setLinearDamping(0.0)
          .setAngularDamping(0.0)
          .setCanSleep(false)
    ).setTranslation(pos[0], pos[1], pos[2]);
    const rb = this.world.createRigidBody(rbDesc);

    const half = size / 2;
    let colDesc = RAPIER.ColliderDesc.cuboid(half, half, half)
      .setRestitution(1.0)
      .setFriction(0.0)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setDensity(mass / (size * size * size));
    if (shatterable) {
      // Intact cubes report collision-START events: any contact, however soft,
      // triggers a shatter.
      colDesc = colDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    }
    const collider = this.world.createCollider(colDesc, rb);

    const rec = { rb, mesh, collider, mass, shatterable, color, size, fixed };
    this.bodies.push(rec);
    this.recByCollider.set(collider.handle, rec);
    return rec;
  }

  removeRec(rec) {
    const i = this.bodies.indexOf(rec);
    if (i >= 0) this.bodies.splice(i, 1);
    this.recByCollider.delete(rec.collider.handle);
    this.scene.remove(rec.mesh);
    rec.mesh.geometry.dispose();
    rec.mesh.material.dispose();
    this.world.removeRigidBody(rec.rb); // also removes its collider
  }

  // Replace a solid cube with a grid of free voxel bodies.
  shatterCube(rec) {
    if (!rec.shatterable) return;
    const t = rec.rb.translation();
    const q = rec.rb.rotation();
    const lv = rec.rb.linvel();
    const av = rec.rb.angvel();
    const parentPos = new THREE.Vector3(t.x, t.y, t.z);
    const parentQuat = new THREE.Quaternion(q.x, q.y, q.z, q.w);

    const voxelSize = rec.size / VOXELS;
    const voxelMass = rec.mass / (VOXELS * VOXELS * VOXELS);
    const half = (VOXELS - 1) / 2;

    this.removeRec(rec);

    const local = new THREE.Vector3();
    for (let x = 0; x < VOXELS; x++)
      for (let y = 0; y < VOXELS; y++)
        for (let z = 0; z < VOXELS; z++) {
          // Local voxel offset -> world position (respecting the cube's rotation).
          local.set((x - half) * voxelSize, (y - half) * voxelSize, (z - half) * voxelSize);
          const worldOff = local.clone().applyQuaternion(parentQuat);
          const wp = parentPos.clone().add(worldOff);

          // Inherit rigid-body velocity: v = v_cm + omega x r.
          const omega = new THREE.Vector3(av.x, av.y, av.z);
          const spin = omega.clone().cross(worldOff);
          // Small outward burst so the break reads clearly.
          const burst = worldOff.clone().normalize().multiplyScalar(SHATTER_BURST);
          const vel = [lv.x + spin.x + burst.x, lv.y + spin.y + burst.y, lv.z + spin.z + burst.z];

          this.makeCube({
            size: voxelSize,
            color: rec.color,
            mass: voxelMass,
            pos: [wp.x, wp.y, wp.z],
            vel,
            angvel: { x: av.x, y: av.y, z: av.z },
            shatterable: false,
          });
        }
  }

  // N-body gravity: every body attracts every other. Softened inverse-square.
  applyGravity() {
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      const pa = a.rb.translation();
      let fx = 0, fy = 0, fz = 0;
      for (let j = 0; j < bodies.length; j++) {
        if (i === j) continue;
        const b = bodies[j];
        const pb = b.rb.translation();
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const dz = pb.z - pa.z;
        const r2 = dx * dx + dy * dy + dz * dz + SOFTENING * SOFTENING;
        const invR = 1 / Math.sqrt(r2);
        const f = (G * a.mass * b.mass) / r2;
        fx += f * dx * invR;
        fy += f * dy * invR;
        fz += f * dz * invR;
      }
      a.rb.resetForces(false);
      a.rb.addForce({ x: fx, y: fy, z: fz }, true);
    }
  }

  // Drain collision-start events; queue any intact cube that touched anything.
  collectShatters() {
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = this.recByCollider.get(h1);
      const b = this.recByCollider.get(h2);
      if (a?.shatterable) this.pendingShatter.add(a);
      if (b?.shatterable) this.pendingShatter.add(b);
    });
  }

  // Advance the simulation by `dt` seconds using `substeps` fixed substeps.
  // Applies gravity, steps Rapier, collects and resolves shatters.
  step(dt, substeps) {
    const sub = dt / substeps;
    this.world.timestep = sub;
    for (let s = 0; s < substeps; s++) {
      this.applyGravity();
      this.world.step(this.eventQueue);
      this.collectShatters();
    }
    // Apply shatters after stepping so we don't mutate bodies mid-iteration.
    if (this.pendingShatter.size) {
      for (const rec of this.pendingShatter) this.shatterCube(rec);
      this.pendingShatter.clear();
    }
  }

  // Copy rigid-body transforms onto their meshes (call once per frame).
  syncMeshes() {
    for (const body of this.bodies) {
      const t = body.rb.translation();
      const r = body.rb.rotation();
      body.mesh.position.set(t.x, t.y, t.z);
      body.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
