// Shared runtime for every generated blog post page (resources/<slug>/index.html).
// Mounts the site navbar (RESOURCES active), styles the post, and renders any
// $...$ / $$...$$ math with KaTeX.
import { mountNavbar } from '../src/site/navbar.js';
import './blog.css';
import 'katex/dist/katex.min.css';
import renderMathInElement from 'katex/contrib/auto-render';

mountNavbar('resources');

// Standard "bold vector" macros so posts can write \vx, \vA, \valpha, etc.
// Latin letters map to \mathbf{·}; Greek names map to \boldsymbol{\name}. This
// mirrors the shorthand used across the lab's LaTeX.
function boldMacros() {
  const macros = {};
  const latin = 'abcdefghijklmnopqrstuvwxyz';
  for (const c of latin) {
    macros[`\\v${c}`] = `\\mathbf{${c}}`;
    macros[`\\v${c.toUpperCase()}`] = `\\mathbf{${c.toUpperCase()}}`;
  }
  const greek = [
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
    'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau',
    'upsilon', 'phi', 'chi', 'psi', 'omega',
    'varepsilon', 'vartheta', 'varpi', 'varrho', 'varsigma', 'varphi',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon',
    'Phi', 'Psi', 'Omega',
  ];
  for (const g of greek) macros[`\\v${g}`] = `\\boldsymbol{\\${g}}`;
  return macros;
}

// Render math after the DOM is in place. Delimiters match common usage; the
// post markdown leaves math as raw $...$ / $$...$$ for exactly this pass.
const body = document.querySelector('.post-body');
if (body) {
  renderMathInElement(body, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
    ],
    macros: boldMacros(),
    throwOnError: false,
  });
}

// --- floating table of contents (left rail) --------------------------------
// Auto-built from the post's h2/h3 headings; sticky on the left on wide screens,
// with active-section highlighting via IntersectionObserver (cf. lm.pub).
initTableOfContents();

// --- reader controls: font (sans/serif), text color, background color ------
// Preferences persist in localStorage and apply as CSS variables on .post-main
// (+ the page background). Defaults match the shipped look (sans, site colors).
initReaderControls();

function initTableOfContents() {
  const post = document.querySelector('.post-body');
  if (!post) return;

  const headings = Array.from(post.querySelectorAll('h2, h3'));
  if (headings.length < 2) return; // not worth a TOC

  const slugify = (s) => s.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
  const used = new Set();
  for (const h of headings) {
    if (!h.id) {
      let base = slugify(h.textContent) || 'section';
      let id = base, n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      h.id = id;
    }
    used.add(h.id);
  }

  const nav = document.createElement('nav');
  nav.className = 'post-toc';
  const title = document.createElement('div');
  title.className = 'toc-title';
  title.textContent = 'Contents';
  nav.appendChild(title);

  // While > now, scroll-driven highlight updates are suppressed (set on TOC
  // click so the animated scroll doesn't override the clicked section).
  let scrollLockUntil = 0;

  const linkFor = new Map();
  for (const h of headings) {
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent;
    a.className = `toc-${h.tagName.toLowerCase()}`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(h.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${h.id}`);
      // Make the clicked section authoritative immediately, and ignore the
      // scroll events fired during the smooth-scroll animation (which would
      // otherwise settle the highlight on an intermediate section).
      setActive(h.id);
      scrollLockUntil = Date.now() + 900;
    });
    nav.appendChild(a);
    linkFor.set(h.id, a);
  }
  // Insert as the first child of <body> so it's in normal flow — position:sticky
  // then keeps it moving with the page (below the navbar) during top overscroll
  // instead of overlapping it (see .post-toc in blog.css).
  document.body.insertBefore(nav, document.body.firstChild);

  // Active-section highlight: the last heading whose top has scrolled above an
  // anchor line near the top of the viewport. Keeping the line HIGH (a small
  // fixed offset, not a fraction of the viewport) is what avoids an off-by-one
  // on short sections: when a heading is clicked and scrolled to the top, only
  // IT is above the line, not the next heading a short distance below.
  // Recomputed on scroll/resize (rAF-throttled). At the very bottom of the
  // page, force the nearest heading active (short trailing sections may never
  // reach the line).
  const ANCHOR = 40; // px from viewport top (just below where jumps land, ~12px)
  let activeId = null;
  const setActive = (id) => {
    if (id === activeId) return;
    if (activeId) linkFor.get(activeId)?.classList.remove('toc-active');
    activeId = id;
    if (id) linkFor.get(id)?.classList.add('toc-active');
  };
  const recompute = () => {
    // At the page bottom, later sections can't reach the anchor line (not
    // enough scroll room), so pick the heading nearest the top of the viewport
    // from the group that's visible — i.e. the last heading whose top is above
    // the anchor, OR, if we're bottomed out, whichever heading is closest to
    // the anchor from either side. This avoids an off-by-one on short trailing
    // sections while keeping mid-page behavior stable.
    const atBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

    let best = headings[0].id;
    let bestAbove = null;
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= ANCHOR) bestAbove = h.id;
    }
    if (bestAbove) best = bestAbove;

    if (atBottom) {
      // Choose the heading whose top is closest to the anchor line.
      let closest = best, dist = Infinity;
      for (const h of headings) {
        const d = Math.abs(h.getBoundingClientRect().top - ANCHOR);
        if (d < dist) { dist = d; closest = h.id; }
      }
      best = closest;
    }
    setActive(best);
  };
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      if (Date.now() >= scrollLockUntil) recompute(); // skip during click-scroll
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  recompute();
}

function initReaderControls() {
  const main = document.querySelector('.post-main');
  if (!main) return;
  document.body.classList.add('post-page');

  const KEY = 'flab.reader';
  // '' = use the default for that field.
  const DEFAULTS = { font: 'sans', fg: '', bg: '', link: '', visited: '' };
  let prefs = { ...DEFAULTS };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}

  // Default reader theme: scaling-book's dark mode. The pickers open here when
  // the reader hasn't chosen a color.
  const defaultFg = '#e8e8e8';
  const defaultBg = '#1c1c1d';
  const defaultLink = '#79c3b4';       // soft teal, rgb(121,195,180)
  const defaultVisited = '#79c3b4';    // same as link by default

  function apply() {
    main.style.setProperty('--font-prose',
      prefs.font === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)');
    main.style.setProperty('--fg', prefs.fg || defaultFg);
    main.style.setProperty('--link', prefs.link || defaultLink);
    main.style.setProperty('--link-visited', prefs.visited || prefs.link || defaultVisited);
    document.body.style.background = prefs.bg || defaultBg;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(prefs)); }

  // Build the panel.
  const panel = document.createElement('div');
  panel.className = 'reader-controls';
  panel.innerHTML = `
    <div class="rc-row">
      <span class="rc-label">Font</span>
      <select class="rc-font">
        <option value="sans">Sans</option>
        <option value="serif">Serif</option>
      </select>
    </div>
    <div class="rc-row">
      <span class="rc-label">Text</span>
      <input type="color" class="rc-fg" />
    </div>
    <div class="rc-row">
      <span class="rc-label">Background</span>
      <input type="color" class="rc-bg" />
    </div>
    <div class="rc-row">
      <span class="rc-label">Link</span>
      <input type="color" class="rc-link" />
    </div>
    <div class="rc-row">
      <span class="rc-label">Visited</span>
      <input type="color" class="rc-visited" />
    </div>
    <button class="rc-reset">Reset</button>
  `;
  panel.hidden = true; // start hidden; Esc reveals it (see below)
  document.body.appendChild(panel);

  const fontSel = panel.querySelector('.rc-font');
  const fgIn = panel.querySelector('.rc-fg');
  const bgIn = panel.querySelector('.rc-bg');
  const linkIn = panel.querySelector('.rc-link');
  const visitedIn = panel.querySelector('.rc-visited');

  // Seed control values from prefs (fall back to site defaults for the pickers).
  fontSel.value = prefs.font;
  fgIn.value = prefs.fg || defaultFg;
  bgIn.value = prefs.bg || defaultBg;
  linkIn.value = prefs.link || defaultLink;
  visitedIn.value = prefs.visited || prefs.link || defaultVisited;

  fontSel.addEventListener('change', () => { prefs.font = fontSel.value; apply(); save(); });
  fgIn.addEventListener('input', () => { prefs.fg = fgIn.value; apply(); save(); });
  bgIn.addEventListener('input', () => { prefs.bg = bgIn.value; apply(); save(); });
  linkIn.addEventListener('input', () => { prefs.link = linkIn.value; apply(); save(); });
  visitedIn.addEventListener('input', () => { prefs.visited = visitedIn.value; apply(); save(); });
  panel.querySelector('.rc-reset').addEventListener('click', () => {
    prefs = { ...DEFAULTS };
    fontSel.value = prefs.font;
    fgIn.value = defaultFg; bgIn.value = defaultBg;
    linkIn.value = defaultLink; visitedIn.value = defaultVisited;
    apply(); save();
  });

  // Esc toggles the panel's visibility (hidden by default). Matches the site's
  // Esc-to-toggle convention for the homepage menu.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') panel.hidden = !panel.hidden;
  });

  apply();
}
