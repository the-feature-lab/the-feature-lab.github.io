import { G, SOFTENING } from '../config.js';

// ---------------------------------------------------------------------------
// Energy diagnostics for the N-body system, reported as averages per entity.
//   translational KE = 1/2 m |v|^2
//   rotational   KE  = 1/2 I |omega|^2,  I = (1/6) m s^2  (solid cube)
//   potential    U   = -sum_{i<j} G m_i m_j / sqrt(r^2 + eps^2)  (softened law)
// Pure function over a list of physics body records.
// ---------------------------------------------------------------------------
export function computeEnergies(bodies) {
  const n = bodies.length;
  if (n === 0) return { transKE: 0, rotKE: 0, pe: 0, n: 0 };

  let transKE = 0;
  let rotKE = 0;
  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n);
  const mass = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    const t = b.rb.translation();
    px[i] = t.x; py[i] = t.y; pz[i] = t.z; mass[i] = b.mass;

    const v = b.rb.linvel();
    transKE += 0.5 * b.mass * (v.x * v.x + v.y * v.y + v.z * v.z);

    const w = b.rb.angvel();
    const I = (1 / 6) * b.mass * b.size * b.size; // solid cube about its center
    rotKE += 0.5 * I * (w.x * w.x + w.y * w.y + w.z * w.z);
  }

  // Potential energy over unique pairs, matching the softened force law.
  let pe = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = px[j] - px[i];
      const dy = py[j] - py[i];
      const dz = pz[j] - pz[i];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz + SOFTENING * SOFTENING);
      pe += -(G * mass[i] * mass[j]) / r;
    }
  }

  return { transKE: transKE / n, rotKE: rotKE / n, pe: pe / n, n };
}
