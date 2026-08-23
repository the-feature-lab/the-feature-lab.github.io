import './site.css';
import { PAGES, PAGE_ORDER } from './planets-config.js';

// ---------------------------------------------------------------------------
// Shared page chrome for the content pages:
//  - a black navbar (FLAB brand left; nav items right), each item with a tiny
//    planet icon beside it and, when active, colored its planet's primary hue;
//  - the page title gets its own (larger) planet icon + the primary color;
//  - the page's --accent is set to that primary color.
//
// Planets are static PNG icons (pre-rendered from the GLBs) so they scroll with
// the DOM perfectly — no fixed-canvas lag.
//
// mountNavbar(active) — `active` is a page key ('research'|'people'|'about').
// ---------------------------------------------------------------------------
function orb(iconUrl, cls = 'navorb') {
  const img = document.createElement('img');
  img.className = cls;
  img.src = iconUrl;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  return img;
}

export function mountNavbar(active) {
  const page = PAGES[active];
  if (page) document.documentElement.style.setProperty('--accent', page.color);

  const nav = document.createElement('nav');
  nav.className = 'navbar';

  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = '/';
  brand.textContent = 'FLAB';
  nav.appendChild(brand);

  const links = document.createElement('div');
  links.className = 'links';
  for (const key of PAGE_ORDER) {
    const l = PAGES[key];
    const a = document.createElement('a');
    a.href = l.href;
    if (key === active) {
      a.classList.add('active');
      a.style.setProperty('--nav-active', l.color); // active item = its planet hue
    }
    a.appendChild(orb(l.icon));
    a.appendChild(document.createTextNode(l.label));
    links.appendChild(a);
  }
  nav.appendChild(links);
  document.body.prepend(nav);

  // Give the page title its own (larger) planet icon.
  const titleEl = document.querySelector('.page-title');
  if (titleEl && page) titleEl.prepend(orb(page.icon, 'navorb title-orb'));
}
