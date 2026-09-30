// Local demo backend: localStorage + a seeded fake community.
// Same interface as backend-supabase.js, so swapping backends is a config change.

const KEY = 'fieldmap.local.v1';
const DEFAULT_USER = 'test-user';
export const mode = 'local';

// Demo members of the group aggregate (only exist in local mode).
export const demoGroupMembers = Array.from({ length: 7 }, (_, k) => `demo-lm-${k + 1}`);

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v) => Math.max(-1, Math.min(1, v));

// Rough centres [difficulty, impact, theory] for the demo crowd; the group is
// deliberately a bit different so the two aggregates are distinguishable.
const DEMO_CENTRES = {
  'Mechanistic Interpretability': { all: [0.45, 0.5, -0.45], group: [0.6, 0.35, -0.6] },
  'Reinforcement Learning': { all: [0.35, 0.6, 0.35], group: [0.45, 0.45, 0.05] },
  'FP Quantization': { all: [-0.35, 0.1, 0.15], group: [-0.2, 0.0, 0.4] },
  'Mixture of Experts': { all: [-0.05, 0.3, -0.55], group: [0.15, 0.2, -0.7] },
};

const DEMO_COMMENTS = [
  ['__all__', 'Most of these feel far harder than people admit once you ask for real predictive theory.'],
  ['__all__', 'I put impact high across the board; any of these understood properly would reshape practice.'],
  ['__all__', 'Theory axis is the interesting one: we have lots of empirics and very few theorems.'],
  ['Mechanistic Interpretability', 'Circuits work is impressive but I do not see a unifying theory yet.'],
  ['Mechanistic Interpretability', 'Superposition gives a partial theory. Still near impossible to do at scale.'],
  ['Mechanistic Interpretability', 'High impact if it works, but it may never scale to frontier models.'],
  ['Reinforcement Learning', 'Classical RL theory is mature; the deep RL regime is not.'],
  ['Reinforcement Learning', 'Policy-gradient behaviour in LLM post-training is badly understood.'],
  ['FP Quantization', 'Mostly engineering at this point, and the numerics literature covers a lot.'],
  ['FP Quantization', 'Outlier features make this less trivial than it looks.'],
  ['Mixture of Experts', 'Routing dynamics have almost no theory. Load balancing is all heuristics.'],
  ['Mixture of Experts', 'Moderate impact: mainly an efficiency story.'],
];

const DEMO_SUMMARIES = {
  __all__: 'Respondents broadly agree that the theory behind these areas lags far behind practice. Several comments stress that impact would be high if any of them were properly understood.',
  'Mechanistic Interpretability': 'Commenters see mechanistic interpretability as high-impact but very hard. Superposition is cited as a partial theory, and there is doubt about whether current methods scale.',
  'Reinforcement Learning': 'People separate mature classical RL theory from a poorly understood deep-RL regime, with LLM post-training singled out as especially opaque.',
  'FP Quantization': 'Mostly viewed as engineering with decent numerical grounding, though outlier features are flagged as a real complication.',
  'Mixture of Experts': 'Routing and load balancing are described as heuristic with little theory; impact is framed mainly as efficiency.',
};

function seed(topics) {
  const rng = mulberry32(12345);
  const gauss = () => { // Box-Muller
    const u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const users = {};
  const add = (login, which) => {
    const placements = {};
    for (const t of topics) {
      const c = DEMO_CENTRES[t]?.[which] ?? [rng() * 1.2 - 0.6, rng() * 1.2 - 0.6, rng() * 1.2 - 0.6];
      placements[t] = {
        difficulty: clamp(c[0] + 0.28 * gauss()),
        impact: clamp(c[1] + 0.28 * gauss()),
        theory: clamp(c[2] + 0.28 * gauss()),
      };
    }
    users[login] = { placements, comments: {} };
  };
  for (let k = 1; k <= 22; k++) add(`demo-user-${k}`, 'all');
  demoGroupMembers.forEach((m) => add(m, 'group'));

  const logins = Object.keys(users);
  const day = 864e5;
  DEMO_COMMENTS.forEach(([topic, body], k) => {
    const login = logins[(k * 7) % logins.length];
    users[login].comments[topic] = { body, updated_at: new Date(Date.now() - (k + 1) * day).toISOString() };
  });
  return { users, currentUser: null };
}

let db;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage blocked: keep in memory */ } };

export async function init({ topics }) {
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db?.users) db = seed(topics);
  // local demo: act as test-user until someone signs in as someone else
  db.currentUser ??= DEFAULT_USER;
  db.users[db.currentUser] ??= { placements: {}, comments: {} };
  save();
  return { login: db.currentUser };
}

export async function signIn(login) {
  login = String(login || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login)) throw new Error('That is not a valid GitHub username.');
  db.currentUser = login;
  db.users[login] ??= { placements: {}, comments: {} };
  save();
  return { login };
}

export async function signOut() { db.currentUser = DEFAULT_USER; save(); return { login: DEFAULT_USER }; }

export function resetDemo(topics) { db = seed(topics); save(); }

const me = () => db.users[db.currentUser];

export async function getMyPlacements() { return structuredClone(me()?.placements ?? {}); }

export async function savePlacement(topic, p) { me().placements[topic] = { ...p }; save(); }

export async function deletePlacement(topic) { delete me().placements[topic]; save(); }

export async function getAllPlacements() {
  const out = [];
  for (const [login, u] of Object.entries(db.users)) {
    for (const [topic, p] of Object.entries(u.placements)) out.push({ login, topic, ...p });
  }
  return out;
}

export async function getComments() {
  const out = [];
  for (const [login, u] of Object.entries(db.users)) {
    for (const [topic, c] of Object.entries(u.comments)) out.push({ login, topic, ...c });
  }
  return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function saveComment(topic, body) {
  me().comments[topic] = { body, updated_at: new Date().toISOString() };
  save();
}

export async function deleteComment(topic) { delete me().comments[topic]; save(); }

export async function getSummaries() {
  const out = {};
  for (const scope of ['global', 'group']) {
    for (const [topic, body] of Object.entries(DEMO_SUMMARIES)) {
      out[`${scope}|${topic}`] = { body, demo: true, updated_at: new Date().toISOString() };
    }
  }
  return out;
}
