import * as THREE from 'three';

/**
 * Build a "voxel cube": a cube of side `size` made from an NxNxN grid of
 * little voxel cubes. The blockiness is real geometry, not a screen filter.
 *
 * Returns a THREE.Object3D (an InstancedMesh) centered on the origin so it can
 * be dropped straight onto a physics body's transform.
 */
export function makeVoxelCube({ size = 1, voxels = 4, color = 0xffffff } = {}) {
  const count = voxels * voxels * voxels;
  const voxelSize = size / voxels;

  // Voxels are flush (no gap) so the assembled cube reads as one solid block.
  const geo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.0,
    flatShading: true,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const half = (voxels - 1) / 2;
  let i = 0;
  for (let x = 0; x < voxels; x++) {
    for (let y = 0; y < voxels; y++) {
      for (let z = 0; z < voxels; z++) {
        m.makeTranslation(
          (x - half) * voxelSize,
          (y - half) * voxelSize,
          (z - half) * voxelSize
        );
        mesh.setMatrixAt(i++, m);
      }
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.size = size;
  return mesh;
}

/**
 * Build a "voxel sphere": voxels kept only if their center falls within the
 * sphere radius. Same instanced approach. Reserved for later use.
 */
export function makeVoxelSphere({ radius = 1, voxels = 8, color = 0xffffff } = {}) {
  const voxelSize = (radius * 2) / voxels;
  const gap = voxelSize * 0.06;
  const half = (voxels - 1) / 2;

  const positions = [];
  for (let x = 0; x < voxels; x++) {
    for (let y = 0; y < voxels; y++) {
      for (let z = 0; z < voxels; z++) {
        const px = (x - half) * voxelSize;
        const py = (y - half) * voxelSize;
        const pz = (z - half) * voxelSize;
        if (Math.hypot(px, py, pz) <= radius - voxelSize * 0.25) {
          positions.push([px, py, pz]);
        }
      }
    }
  }

  const geo = new THREE.BoxGeometry(
    voxelSize - gap,
    voxelSize - gap,
    voxelSize - gap
  );
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.0,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  positions.forEach((p, i) => {
    m.makeTranslation(p[0], p[1], p[2]);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.radius = radius;
  return mesh;
}
