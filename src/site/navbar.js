import './site.css';

// ---------------------------------------------------------------------------
// Shared top navbar for the content pages: FLAB (brand, -> home) on the left,
// RESEARCH / PEOPLE / ABOUT on the right. Built once in JS and injected, so the
// markup isn't duplicated across pages. Pass the current page key to highlight
// its link.
// ---------------------------------------------------------------------------
const LINKS = [
  { key: 'research', label: 'RESEARCH', href: '/research/' },
  { key: 'people', label: 'PEOPLE', href: '/people/' },
  { key: 'about', label: 'ABOUT', href: '/about/' },
];

export function mountNavbar(active) {
  const nav = document.createElement('nav');
  nav.className = 'navbar';

  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = '/';
  brand.textContent = 'FLAB';
  nav.appendChild(brand);

  const links = document.createElement('div');
  links.className = 'links';
  for (const l of LINKS) {
    const a = document.createElement('a');
    a.href = l.href;
    a.textContent = l.label;
    if (l.key === active) a.classList.add('active');
    links.appendChild(a);
  }
  nav.appendChild(links);

  document.body.prepend(nav);
}
