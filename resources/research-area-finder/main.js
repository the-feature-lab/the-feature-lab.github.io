// Learning Mechanics open research area finder (/resources/research-area-finder/).
// See README.md in this folder for setup.
import { mountNavbar } from '../../src/site/navbar.js';
import '../blog.css';
import './finder.css';
import { CONFIG, AXES, GROUP_NAME } from './config.js';
import { FieldScene } from './scene.js';
import topicsJson from './data/topics.json';
import whitelistJson from './data/whitelist.json';

mountNavbar('resources');
document.body.classList.add('post-page');

// Without Supabase keys the page runs as a local demo, but only on a dev
// machine; the live site shows a notice until it's connected.
const DEV_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const backend = CONFIG.supabaseUrl
  ? await import('./backend-supabase.js')
  : DEV_HOSTS.includes(location.hostname) ? await import('./backend-local.js') : null;

// Categorical slots in fixed order, dark-surface steps of the validated palette;
// topics past 8 go neutral (every point is also labelled by name).
const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const OVERFLOW = '#898781';
const ALL = '__all__';
const CENTRE = { difficulty: 0, impact: 0, theory: 0 };

const VIEWS = [
  { id: 'mine', label: 'Mine' },
  { id: 'global', label: 'Global Aggregate' },
  { id: 'group', label: `${GROUP_NAME} Aggregate` },
];

const $ = (s) => document.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
};

const S = {
  user: null,
  topics: [],        // [{name, color}]
  whitelist: new Set(),
  mine: {},          // topic -> {difficulty, impact, theory}
  all: [],           // [{login, topic, ...p}]
  comments: [],
  summaries: {},
  view: 'mine',
  selected: null,    // focused topic in aggregate views (null = all areas)
  active: null,      // topic being edited in the Mine view
  draft: null,       // its live position
  saved: '',         // "Saved" flash
  switching: false,  // local demo: username input open
  status: '',
};

// ---------- data ----------
const lc = (s) => String(s ?? '').toLowerCase();
const isMe = (login) => S.user && lc(login) === lc(S.user.login);
const inGroup = (login) => S.whitelist.has(lc(login));
const placedCount = () => S.topics.filter((t) => S.mine[t.name]).length;
const allPlaced = () => placedCount() === S.topics.length;

function aggregate(view) {
  const out = {};
  // everyone who responded, you included (your own points are also ringed)
  const rows = S.all.filter((r) => view !== 'group' || inGroup(r.login));
  for (const t of S.topics) {
    const pts = rows.filter((r) => r.topic === t.name);
    const n = pts.length;
    const mean = {}, sd = {};
    for (const k of ['difficulty', 'impact', 'theory']) {
      mean[k] = n ? pts.reduce((s, p) => s + p[k], 0) / n : 0;
      // spread across respondents: sample standard deviation
      sd[k] = n > 1 ? Math.sqrt(pts.reduce((s, p) => s + (p[k] - mean[k]) ** 2, 0) / (n - 1)) : 0;
    }
    out[t.name] = { n, mean, sd, points: pts };
  }
  return out;
}

async function refresh() {
  const [all, comments, summaries, mine] = await Promise.all([
    backend.getAllPlacements(),
    backend.getComments(),
    backend.getSummaries(),
    S.user ? backend.getMyPlacements() : {},
  ]);
  const known = new Set(S.topics.map((t) => t.name));
  Object.assign(S, {
    all: all.filter((r) => known.has(r.topic)),
    comments: comments.filter((c) => c.topic === ALL || known.has(c.topic)),
    summaries,
    mine,
  });
}

async function act(fn) {
  try {
    S.status = '';
    await fn();
  } catch (err) {
    console.error(err);
    S.status = err.message || String(err);
  }
  render();
}

// ---------- editing ----------
let scene;

function setActive(topic) {
  S.active = topic || null;
  S.draft = topic ? { ...(S.mine[topic] ?? CENTRE) } : null;
  S.saved = '';
  render();
}

let saveTimer;
function onDraft(draft, final) {
  S.draft = draft;
  if (!final) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const topic = S.active;
    act(async () => {
      await backend.savePlacement(topic, draft);
      await refresh();
      S.saved = 'Saved';
    });
  }, 250);
}

// ---------- render ----------
function render() {
  renderAuth();
  renderTabs();
  renderPanel();
  pushScene();
}

function pushScene() {
  const mineView = S.view === 'mine';
  scene.edit = mineView && S.active && S.user ? { topic: S.active, draft: { ...S.draft } } : null;
  scene.setData({
    view: mineView ? 'mine' : 'aggregate',
    topics: S.topics,
    mine: S.mine,
    aggregate: mineView ? {} : aggregate(S.view),
    selected: S.selected,
  });
}

function renderAuth() {
  const box = $('#auth');
  box.replaceChildren();
  if (backend.mode === 'local') {
    if (S.switching) {
      const input = h('input', { type: 'text', placeholder: 'GitHub username', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'GitHub username' });
      box.append(h('form', { class: 'row', onsubmit: (e) => {
        e.preventDefault();
        act(async () => { S.user = await backend.signIn(input.value); S.switching = false; S.active = null; await refresh(); });
      } }, input,
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Go'),
      h('button', { class: 'btn', type: 'button', onclick: () => { S.switching = false; render(); } }, 'Cancel')));
      queueMicrotask(() => input.focus());
      return;
    }
    box.append(h('span', {}, h('strong', {}, `@${S.user.login}`)), ' ',
      h('button', { class: 'linklike', onclick: () => { S.switching = true; render(); } }, 'Switch user'));
    return;
  }
  if (S.user) {
    box.append(h('span', {}, h('strong', {}, `@${S.user.login}`)), ' ',
      h('button', { class: 'linklike', onclick: () => act(async () => {
        S.user = (await backend.signOut()) ?? null; S.active = null; S.view = 'mine'; await refresh();
      }) }, 'Sign out'));
  } else {
    box.append(h('button', { class: 'btn btn-github', onclick: () => act(() => backend.signIn()) }, githubIcon(), 'Sign in with GitHub'));
  }
}

function renderTabs() {
  $('#view-tabs').replaceChildren(...VIEWS.map((v) => h('button', {
    role: 'tab',
    'aria-selected': String(S.view === v.id),
    class: 'tab' + (S.view === v.id ? ' is-active' : ''),
    onclick: () => { S.view = v.id; S.selected = null; render(); },
  }, v.label)));
}

const dot = (color) => h('span', { class: 'dot', style: `--dot:${color}` });

function renderPanel() {
  const p = $('#panel');
  p.replaceChildren();
  if (S.status) p.append(h('p', { class: 'status', role: 'alert' }, S.status));
  if (S.view === 'mine') return p.append(S.user ? minePanel() : signInCard());
  p.append(...aggregatePanel());
}

function signInCard() {
  return h('div', { class: 'card' },
    h('h4', {}, 'Add your view'),
    h('p', {}, 'Sign in with GitHub to place each research area in the cube. Your GitHub username is shown next to your points and comments.'),
    h('button', { class: 'btn btn-github', onclick: () => act(() => backend.signIn()) }, githubIcon(), 'Sign in with GitHub'));
}

function githubIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'gh');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z');
  svg.append(path);
  return svg;
}

function minePanel() {
  const select = h('select', { id: 'topic-select', 'aria-label': 'Research area to place',
    onchange: (e) => setActive(e.target.value) },
  h('option', { value: '' }, `Choose a research area… (${placedCount()} of ${S.topics.length} placed)`),
  S.topics.map((t) => h('option', { value: t.name, selected: S.active === t.name }, `${S.mine[t.name] ? '✓ ' : '○ '}${t.name}`)));

  const card = h('div', { class: 'card' }, h('label', { class: 'field-label', for: 'topic-select' }, 'Your points'), select);
  if (!S.active) {
    card.append(h('p', { class: 'fine' }, allPlaced()
      ? 'All placed. Pick one to adjust it, or compare with the aggregates above.'
      : 'Pick an area to place it. You can do them in any order.'));
    return card;
  }
  const color = S.topics.find((t) => t.name === S.active)?.color;
  const placed = !!S.mine[S.active];
  card.append(
    h('p', { class: 'hint' }, dot(color),
      h('span', {}, placed ? '' : 'Starts in the centre. ',
        'Drag the dot to set ', h('strong', {}, 'difficulty'), ' and ', h('strong', {}, 'impact'),
        ', and drag its arrows to set ', h('strong', {}, 'existing theory'),
        '. Drag anywhere else to rotate. Changes save automatically.')),
    h('div', { class: 'row between' },
      h('span', { class: 'saved', 'aria-live': 'polite' }, placed ? (S.saved || 'Placed') : 'Not placed yet'),
      placed ? h('button', { class: 'linklike subtle', onclick: () => act(async () => {
        await backend.deletePlacement(S.active); await refresh(); S.draft = { ...CENTRE }; S.saved = '';
      }) }, 'Remove') : null));
  return card;
}

function aggregatePanel() {
  const agg = aggregate(S.view);
  const scope = S.view === 'group' ? 'group' : 'global';
  const people = new Set(S.all.filter((r) => S.view !== 'group' || inGroup(r.login)).map((r) => lc(r.login))).size;

  const pickRow = (name) => { S.selected = S.selected === name ? null : name; render(); };
  const row = (name, color, meta) => h('li', {
    class: 'legend-row' + (S.selected === name ? ' is-active' : ''),
    tabindex: '0', role: 'button', 'aria-pressed': String(S.selected === name),
    onclick: () => pickRow(name),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickRow(name); } },
  }, color ? dot(color) : h('span', { class: 'dot dot-all' }), h('span', { class: 'legend-name' }, name ?? 'All areas'), h('span', { class: 'legend-meta' }, meta));

  const out = [h('div', { class: 'card' },
    h('h4', {}, S.view === 'group' ? GROUP_NAME : 'Everyone'),
    h('p', { class: 'fine' }, 'Dots are averages and shaded regions show ±1 standard deviation; ringed dots are yours. Click an average (or an area below) to see its individual responses.'),
    h('ul', { class: 'legend selectable' },
      row(null, null, `${people} ${people === 1 ? 'person' : 'people'}`),
      S.topics.map((t) => row(t.name, t.color, `n = ${agg[t.name].n}`))))];

  if (S.view === 'group' && people === 0) {
    out.push(h('p', { class: 'fine' }, 'No group members have responded yet. Group membership comes from data/whitelist.json.'));
  }
  out.push(discussion(scope));
  return out;
}

function discussion(scope) {
  const topic = S.selected ?? ALL;
  const summary = S.summaries[`${scope}|${topic}`];
  // Only the high-level summary is shown; individual comments are readable only
  // by their author and the summarizer (see supabase/schema.sql).
  const sumCard = h('div', { class: 'summary' }, h('div', { class: 'summary-label' }, 'What people are saying'));
  if (summary) {
    sumCard.append(h('p', {}, summary.body),
      h('p', { class: 'fine' }, summary.demo
        ? 'Sample text (local demo), standing in for the daily Claude summary.'
        : `Summarized by Claude from ${summary.n_comments} comments · ${new Date(summary.updated_at).toLocaleDateString()}`));
  } else {
    sumCard.append(h('p', { class: 'fine' }, 'No summary yet. Claude summarizes the comments once a day, once there are at least 3.'));
  }

  const block = h('div', { class: 'card discussion' },
    h('h4', {}, `Discussion · ${S.selected ?? 'All areas'}`), sumCard);

  if (!S.user) {
    block.append(h('p', { class: 'fine' }, 'Sign in with GitHub to add a comment.'));
  } else if (scope === 'group' && !inGroup(S.user.login)) {
    block.append(h('p', { class: 'fine' }, `Only ${GROUP_NAME} members' comments appear here. Yours show in the Global view.`));
  } else {
    block.append(commentForm(topic));
  }
  return block;
}

function commentForm(topic) {
  const existing = S.comments.find((c) => isMe(c.login) && c.topic === topic);
  const max = CONFIG.maxCommentLength;
  const count = h('span', { class: 'muted' });
  const ta = h('textarea', { rows: '3', maxlength: String(max), placeholder: topic === ALL ? 'A comment on your whole placement…' : `A comment on where you put ${topic}…`,
    oninput: () => { count.textContent = `${ta.value.length}/${max}`; } });
  ta.value = existing?.body ?? '';
  count.textContent = `${ta.value.length}/${max}`;
  return h('form', { class: 'comment-form', onsubmit: (e) => {
    e.preventDefault();
    const body = ta.value.trim();
    if (!body) return;
    act(async () => { await backend.saveComment(topic, body); await refresh(); });
  } },
  h('label', { class: 'field-label' }, topic === ALL ? 'Your comment on your whole spread' : `Your comment on ${topic}`),
  ta,
  h('div', { class: 'row between' }, count,
    h('span', { class: 'row' },
      existing ? h('button', { type: 'button', class: 'btn', onclick: () => act(async () => { await backend.deleteComment(topic); await refresh(); }) }, 'Delete') : null,
      h('button', { type: 'submit', class: 'btn btn-primary' }, existing ? 'Update' : 'Post'))));
}

// ---------- boot ----------
async function boot() {
  if (!backend) {
    $('.af').replaceChildren(h('p', { class: 'af-notice' }, 'The research area finder isn’t connected yet. Check back soon.'));
    return;
  }
  S.topics = topicsJson.topics.map((name, k) => ({ name, color: PALETTE[k] ?? OVERFLOW }));
  S.whitelist = new Set([...(whitelistJson.members ?? []), ...backend.demoGroupMembers].map(lc));

  scene = new FieldScene($('#viz'), AXES, {
    onDraft,
    onSelect: (topic) => {
      if (S.view === 'mine') { if (topic && topic !== S.active) setActive(topic); return; }
      S.selected = topic && topic !== S.selected ? topic : null; // click again to collapse
      render();
    },
  });
  $('#reset-view').addEventListener('click', () => scene.resetView());
  $('#mode-note').hidden = backend.mode !== 'local';
  $('#reset-demo')?.addEventListener('click', (e) => {
    e.preventDefault();
    backend.resetDemo(S.topics.map((t) => t.name));
    location.reload();
  });

  // Keyboard: arrows move difficulty/impact, PageUp/PageDown move existing theory.
  const STEP = 0.05;
  const keys = {
    ArrowLeft: [-STEP, 0, 0], ArrowRight: [STEP, 0, 0],
    ArrowUp: [0, STEP, 0], ArrowDown: [0, -STEP, 0],
    PageUp: [0, 0, STEP], PageDown: [0, 0, -STEP],
  };
  document.addEventListener('keydown', (e) => {
    // only while the cube has focus, so arrows still scroll the page otherwise
    if (S.view !== 'mine' || !S.active || !keys[e.key] || e.target !== scene.renderer.domElement) return;
    e.preventDefault();
    scene.nudge(...keys[e.key]);
  });

  await act(async () => {
    S.user = await backend.init({ topics: S.topics.map((t) => t.name) });
    await refresh();
  });
}

boot();
