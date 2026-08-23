import { mountNavbar } from '../src/site/navbar.js';
import './research.css';
import { artifactsByKind } from '../src/data/research.js';
import { personById } from '../src/data/people.js';

mountNavbar('research');

// Some websites are authored as bare hosts ("jamiesimon.io"); make them
// absolute so the browser doesn't treat them as relative paths.
function href(website) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function external(a, url) {
  a.href = href(url);
  a.target = '_blank';
  a.rel = 'noopener';
}

// One author. Names are deliberately not links and not visually distinguished —
// the title already links out, and highlighting lab members made the author
// lines read as mottled. Lab members are still referenced by id in the data, so
// the connection is there for anything that needs it.
function renderAuthor(entry) {
  const plain = typeof entry === 'string';
  const person = plain ? undefined : personById(entry.id);

  // An id that doesn't resolve shouldn't blank out the author list.
  const name = plain ? entry : (person ? person.name : entry.id);
  const node = document.createElement('span');

  node.textContent = name;

  if (!plain && entry.eq) {
    const star = document.createElement('sup');
    star.textContent = '*';
    const wrap = document.createElement('span');
    wrap.appendChild(node);
    wrap.appendChild(star);
    return wrap;
  }
  return node;
}

function renderArtifact(artifact) {
  const li = document.createElement('li');
  li.className = 'artifact';

  // Title, linking to the primary (first) link.
  const titleLine = document.createElement('div');
  titleLine.className = 'artifact-title';
  const primary = artifact.links[0];
  if (primary) {
    const a = document.createElement('a');
    a.textContent = artifact.title;
    external(a, primary.url);
    titleLine.appendChild(a);
  } else {
    titleLine.textContent = artifact.title;
  }

  // "(2026)" or "(2026, ICLR 2026)" / "(2026, lm.pub)". The venue is linked to
  // the primary link when there is one.
  const meta = document.createElement('span');
  meta.className = 'artifact-meta';
  meta.appendChild(document.createTextNode(` (${artifact.year}`));
  if (artifact.venue) {
    meta.appendChild(document.createTextNode(', '));
    if (artifact.venueUrl) {
      const v = document.createElement('a');
      v.textContent = artifact.venue;
      external(v, artifact.venueUrl);
      meta.appendChild(v);
    } else {
      meta.appendChild(document.createTextNode(artifact.venue));
    }
  }
  meta.appendChild(document.createTextNode(')'));

  // Any links beyond the primary one — the title already links to the
  // primary, so repeating it is noise.
  for (const link of artifact.links.slice(1)) {
    const a = document.createElement('a');
    a.textContent = `[${link.type}]`;
    external(a, link.url);
    meta.appendChild(document.createTextNode(' '));
    meta.appendChild(a);
  }
  titleLine.appendChild(meta);
  li.appendChild(titleLine);

  // Author line, comma-separated.
  const authors = document.createElement('div');
  authors.className = 'artifact-authors';
  artifact.authors.forEach((entry, i) => {
    authors.appendChild(renderAuthor(entry));
    if (i < artifact.authors.length - 1) {
      authors.appendChild(document.createTextNode(', '));
    }
  });
  li.appendChild(authors);

  return li;
}

// Render the artifact list into <div id="artifacts">, one section per kind.
function mountArtifacts() {
  const mount = document.getElementById('artifacts');
  if (!mount) return;

  for (const group of artifactsByKind()) {
    const section = document.createElement('section');
    section.className = 'artifact-group';

    const h2 = document.createElement('h2');
    h2.textContent = group.label;
    section.appendChild(h2);

    const ul = document.createElement('ul');
    for (const artifact of group.items) ul.appendChild(renderArtifact(artifact));
    section.appendChild(ul);
    mount.appendChild(section);
  }
}

mountArtifacts();
