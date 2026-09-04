// Single source of truth for each page's planet + theme color, shared by the
// navbar and the page title. `color` is the planet's primary hue (sampled from
// its GLB render); used for the page title and the navbar active-item color.
export const PAGES = {
  research: { label: 'RESEARCH',          href: '/research/', icon: '/planets/icon_sorbetlike.png',    color: '#c8905a' },
  people:   { label: 'PEOPLE',            href: '/people/',   icon: '/planets/icon_earthlike.png',     color: '#71b465' },
  resources: { label: 'RESOURCES',        href: '/resources/', icon: '/planets/icon_magma.png',        color: '#9768a1' },
  about:    { label: 'ABOUT',             href: '/about/',    icon: '/planets/icon_spiky.png',         color: '#9cc5ce' },
};

export const PAGE_ORDER = ['research', 'people', 'resources', 'about'];
