import { mountNavbar } from '../src/site/navbar.js';
import './photos.css';
import { PHOTOS } from '../src/data/photos.js';

// This page is not in PAGES, so mountNavbar(null) draws the navbar with no
// active item and no title icon — exactly right for an unlisted page.
mountNavbar(null);

// mountNavbar only sets --accent for a known page; pick one for this one.
// The camera body's own pale blue-grey (sampled from the icon render), the way
// each planet page takes its planet's primary hue.
document.documentElement.style.setProperty('--accent', '#d7e1e4');

// The title icon is the camera model (pre-rendered by scripts/render-icon.mjs)
// rather than a planet — this page isn't one of the planet destinations.
const title = document.querySelector('.page-title');
if (title) {
  const icon = document.createElement('img');
  icon.className = 'navorb title-orb';
  icon.src = '/photos/icon_camera.png';
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  title.prepend(icon);
}

function mountGallery() {
  const mount = document.getElementById('gallery');
  if (!mount) return;

  for (const photo of PHOTOS) {
    const fig = document.createElement('figure');
    fig.className = 'photo';

    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = photo.caption;
    img.loading = 'lazy';       // the second photo need not block first paint
    fig.appendChild(img);

    const cap = document.createElement('figcaption');
    cap.textContent = `${photo.caption} ${photo.year}`;
    if (photo.who) {
      // Who's in the shot, on its own line and dimmer than the caption.
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = photo.who;
      cap.appendChild(who);
    }
    fig.appendChild(cap);

    mount.appendChild(fig);
  }
}

mountGallery();
