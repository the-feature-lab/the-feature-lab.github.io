import { mountNavbar } from '../src/site/navbar.js';
import './resources.css';
import { POSTS } from '../src/data/posts.js';

mountNavbar('resources');

// Render the post list from the generated manifest (scripts/build-blog.mjs).
const list = document.getElementById('post-list');
if (list) {
  if (!POSTS.length) {
    const empty = document.createElement('p');
    empty.className = 'page-blurb';
    empty.textContent = 'Nothing here just yet — check back soon.';
    list.appendChild(empty);
  } else {
    for (const post of POSTS) {
      const a = document.createElement('a');
      a.className = 'post-card';
      a.href = post.href;

      const h = document.createElement('h2');
      h.className = 'post-card-title';
      h.textContent = post.title;
      a.appendChild(h);

      const meta = [post.author, post.dateDisplay].filter(Boolean).join(' · ');
      if (meta) {
        const m = document.createElement('div');
        m.className = 'post-card-meta';
        m.textContent = meta;
        a.appendChild(m);
      }

      if (post.description) {
        const d = document.createElement('p');
        d.className = 'post-card-desc';
        d.textContent = post.description;
        a.appendChild(d);
      }

      list.appendChild(a);
    }
  }
}
