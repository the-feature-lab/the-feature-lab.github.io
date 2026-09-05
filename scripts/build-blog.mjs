// Blog build step. Scans content/blog/<slug>/index.md, parses YAML-ish
// frontmatter + renders the markdown body, and emits:
//   - resources/<slug>/index.html  (a post page shell with the rendered body
//     inlined; its post.js mounts the shared navbar + chrome)
//   - src/data/posts.js            (a manifest the RESOURCES index lists from)
//
// Runs before `vite build` (see package.json "prebuild"/"build"), and can be run
// standalone: `node scripts/build-blog.mjs`. Generated files are git-ignored.
//
// Frontmatter is a small subset of YAML (key: "value" / key: value), enough for
// our fields; no external YAML dep. Markdown is rendered with `marked`; math is
// left as raw $...$ / $$...$$ for the client-side KaTeX pass (see post.js).
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const ROOT = path.resolve(import.meta.dirname, '..');
const BLOG_SRC = path.join(ROOT, 'content', 'blog');
const OUT_DIR = path.join(ROOT, 'resources');

// --- tiny frontmatter parser (--- ... --- at file top) ---------------------
function parseFrontmatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v === 'true') v = true; else if (v === 'false') v = false;
    meta[kv[1]] = v;
  }
  return { meta, body: m[2] };
}

// --- notes (tooltip / sidenote / footnote) ---------------------------------
// A post's [SIDENOTE: ...] and [FOOTNOTE: ...] markers all render in ONE style,
// chosen by the post's `notes:` frontmatter (tooltip | sidenote | footnote;
// default tooltip). Collected post-wide (shared numbering + a single footnotes
// list at the end), so this state is reset per post via startNotes().
let noteState = { style: 'tooltip', notes: [] };
function startNotes(style) {
  noteState = { style: (style || 'tooltip'), notes: [] };
}

// Pull [SIDENOTE:/FOOTNOTE: ...] markers out to @@NOTE<n>@@ placeholders,
// collecting each note's markdown body. Bracket-balanced so a note can contain
// markdown links.
function extractNotes(md) {
  const OPENERS = ['[SIDENOTE:', '[FOOTNOTE:'];
  let out = '', i = 0;
  while (i < md.length) {
    const opener = OPENERS.find((o) => md.startsWith(o, i));
    if (!opener) { out += md[i++]; continue; }
    let depth = 1, j = i + opener.length;
    for (; j < md.length && depth > 0; j++) {
      if (md[j] === '[') depth++;
      else if (md[j] === ']') depth--;
    }
    const body = md.slice(i + opener.length, j - 1).trim();
    const n = noteState.notes.length;
    noteState.notes.push(body);
    out += `@@NOTE${n}@@`;
    i = j;
  }
  return out;
}

// Turn a placeholder into inline HTML per the active note style. tooltip/footnote
// use a numbered superscript; sidenote floats an aside into the margin.
function renderNoteMarker(n) {
  const num = n + 1;
  const inner = marked.parseInline(noteState.notes[n]);
  if (noteState.style === 'sidenote') {
    return `<aside class="sidenote">${inner}</aside>`;
  }
  if (noteState.style === 'footnote') {
    return `<sup class="fn-ref" id="fnref-${num}"><a href="#fn-${num}">${num}</a></sup>`;
  }
  // tooltip (default): superscript that reveals a hover card.
  return `<span class="fn"><sup>${num}</sup>` +
         `<span class="fn-tooltip">${inner}</span></span>`;
}

// If the post uses footnote style, render the collected notes as a list at the
// end of the article. Empty otherwise.
function footnotesSection() {
  if (noteState.style !== 'footnote' || !noteState.notes.length) return '';
  const items = noteState.notes.map((body, i) => {
    const num = i + 1;
    return `<li id="fn-${num}">${marked.parseInline(body)} ` +
           `<a class="fn-backref" href="#fnref-${num}">↩</a></li>`;
  }).join('\n');
  return `<section class="footnotes-section">\n<hr />\n<h2>Notes</h2>\n` +
         `<ol class="footnotes-list">\n${items}\n</ol>\n</section>`;
}

// Protect math spans from markdown before rendering, then restore them, so
// markdown never eats `_`, `*`, or `\` inside $...$ / $$...$$ (e.g. `_{ij}`
// would otherwise become <em>). We pull math out to placeholders, run marked,
// and splice the raw math back in for the client-side KaTeX pass (see post.js).
function renderMarkdownWithMath(md) {
  // Pull notes out first (they may contain markdown links).
  const noteMd = extractNotes(md);

  const store = [];
  const stash = (tex) => {
    const key = `@@MATH${store.length}@@`;
    store.push(tex);
    return key;
  };
  // Display math first ($$...$$), then inline ($...$). The inline pattern avoids
  // matching `$$` and doesn't span blank lines.
  let protectedMd = noteMd
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(`$$${tex}$$`))
    .replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_, tex) => stash(`$${tex}$`));

  let html = marked.parse(protectedMd);
  // Restore math. Placeholders may sit inside <p> (inline) or alone (display).
  html = html.replace(/@@MATH(\d+)@@/g, (_, i) => store[Number(i)]);
  // Restore notes per the active style.
  html = html.replace(/@@NOTE(\d+)@@/g, (_, i) => renderNoteMarker(Number(i)));
  return html;
}

// Fenced callout directives. A block delimited by
//   ::: callout Optional Title
//   ...content...
//   :::
// becomes <aside class="callout"> with an optional rendered <div class="callout-
// title"> header (bold, underlined — see blog.css) followed by the content, all
// rendered as markdown (and math). Lets a post box off asides like the
// "Illustrative papers" lists so they read as titled insets.
function renderBody(md) {
  const parts = [];
  // Capture: (1) directive name, (2) optional rest-of-line title, (3) body.
  const fence = /^:::[ \t]*([\w-]+)[ \t]*([^\n]*)\n([\s\S]*?)\n:::[ \t]*$/gm;
  let last = 0, m;
  while ((m = fence.exec(md)) !== null) {
    if (m.index > last) parts.push({ callout: null, md: md.slice(last, m.index) });
    parts.push({ callout: m[1], title: m[2].trim(), md: m[3] });
    last = m.index + m[0].length;
  }
  if (last < md.length) parts.push({ callout: null, md: md.slice(last) });

  return parts.map(({ callout, title, md }) => {
    const inner = renderMarkdownWithMath(md);
    if (!callout) return inner;
    const head = title ? `<div class="callout-title">${esc(title)}</div>\n` : '';
    return `<aside class="callout callout-${callout}">\n${head}${inner}\n</aside>`;
  }).join('\n');
}

// Escape for safe embedding in an HTML attribute / text node.
function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Human date: "2026-09-04" -> "September 4, 2026".
function displayDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// --- per-post page shell ---------------------------------------------------
function postHtml({ meta, bodyHtml }) {
  const title = meta.title || 'Untitled';

  // Distill-style author block: labeled AUTHORS / PUBLISHED columns, bordered
  // above and below (see .post-byline in blog.css). No affiliation column.
  // Plural label for comma-lists or collective authors (e.g. "FLAB" = the lab).
  const COLLECTIVE_AUTHORS = new Set(['flab']);
  const plural = meta.author &&
    (meta.author.includes(',') || COLLECTIVE_AUTHORS.has(meta.author.trim().toLowerCase()));
  const authors = meta.author
    ? `<div class="byline-col">
        <div class="byline-label">${plural ? 'Authors' : 'Author'}</div>
        <div class="byline-value">${esc(meta.author)}</div>
      </div>`
    : '';
  const published = meta.date
    ? `<div class="byline-col">
        <div class="byline-label">Published</div>
        <div class="byline-value">${esc(displayDate(meta.date))}</div>
      </div>`
    : '';
  const byline = (authors || published)
    ? `<div class="post-byline">${authors}${published}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} — the feature lab</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  ${meta.description ? `<meta name="description" content="${esc(meta.description)}" />` : ''}
  ${meta.author ? `<meta name="author" content="${esc(meta.author)}" />` : ''}
  <!-- Post defaults to the scaling-book dark theme; paint it to avoid a flash. -->
  <style>html,body{background:#1c1c1d;margin:0}</style>
  <link rel="preload" href="/fonts/Roboto-latin.woff2" as="font" type="font/woff2" crossorigin />
</head>
<body>
  <main class="post-main">
    <article class="post">
      <header class="post-header">
        <h1 class="post-title">${esc(title)}</h1>
        ${byline}
      </header>
      <div class="post-body">
${bodyHtml}
      </div>
    </article>
  </main>
  <script type="module" src="/resources/post.js"></script>
</body>
</html>
`;
}

// --- main ------------------------------------------------------------------
function build() {
  if (!fs.existsSync(BLOG_SRC)) {
    console.log('[blog] no content/blog/ — nothing to build');
    fs.mkdirSync(path.join(ROOT, 'src', 'data'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'src', 'data', 'posts.js'),
      '// AUTO-GENERATED by scripts/build-blog.mjs — do not edit.\nexport const POSTS = [];\n');
    return [];
  }

  const slugs = fs.readdirSync(BLOG_SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const manifest = [];
  for (const slug of slugs) {
    const mdPath = path.join(BLOG_SRC, slug, 'index.md');
    if (!fs.existsSync(mdPath)) continue;
    const raw = fs.readFileSync(mdPath, 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    if (meta.hidden) continue;

    startNotes(meta.notes);            // reset note numbering + pick style
    const bodyHtml = renderBody(body) + footnotesSection();

    // Write the post page.
    const outDir = path.join(OUT_DIR, slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), postHtml({ meta, bodyHtml }));

    // Copy any sibling assets (images, videos, data) into the post dir.
    for (const f of fs.readdirSync(path.join(BLOG_SRC, slug))) {
      if (f === 'index.md') continue;
      const src = path.join(BLOG_SRC, slug, f);
      if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(outDir, f));
    }

    manifest.push({
      slug,
      title: meta.title || slug,
      description: meta.description || '',
      author: meta.author || '',
      date: meta.date || '',
      dateDisplay: meta.date ? displayDate(meta.date) : '',
      href: `/resources/${slug}/`,
    });
  }

  // Newest first.
  manifest.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  fs.mkdirSync(path.join(ROOT, 'src', 'data'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'src', 'data', 'posts.js'),
    '// AUTO-GENERATED by scripts/build-blog.mjs — do not edit.\n' +
    `export const POSTS = ${JSON.stringify(manifest, null, 2)};\n`
  );

  console.log(`[blog] built ${manifest.length} post(s): ${manifest.map((p) => p.slug).join(', ') || '(none)'}`);
  return manifest;
}

build();
