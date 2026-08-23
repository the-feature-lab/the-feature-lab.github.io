import { mountNavbar } from '../src/site/navbar.js';
import './people.css';
import { peopleByRole, PEOPLE } from '../src/data/people.js';

mountNavbar('people');

// Some websites are authored as bare hosts ("jamiesimon.io"); make them
// absolute so the browser doesn't treat them as relative paths.
function href(website) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

// Render the roster into <div id="roster">, one section per role.
function mountRoster() {
  const mount = document.getElementById('roster');
  if (!mount) return;

  for (const group of peopleByRole()) {
    const section = document.createElement('section');
    section.className = 'roster-group';

    const h2 = document.createElement('h2');
    h2.textContent = `${group.label}:`;
    // Names run inline after the label, comma-separated.
    const names = document.createElement('span');
    names.className = 'roster-names';
    group.members.forEach((person, i) => {
      const a = document.createElement('a');
      a.href = href(person.website);
      a.textContent = person.name;
      a.target = '_blank';
      a.rel = 'noopener';
      names.appendChild(a);
      if (i < group.members.length - 1) {
        names.appendChild(document.createTextNode(', '));
      }
    });
    h2.appendChild(document.createTextNode(' '));
    h2.appendChild(names);
    section.appendChild(h2);
    mount.appendChild(section);
  }
}

mountRoster();

// Ring the lab members around the title's planet, each standing on its surface.
// Sprites are pre-rendered PNGs (see scripts/render-people.mjs) because this
// planet is a flat image, not the homepage's live 3D scene.
//
// The layout numbers are tunable live: load /people/?tune for a slider panel,
// adjust, then copy the printed values back into RING below.
const RING = {
  offsetX: 1,      // px, nudge the ring's center right (+) / left (-)
  offsetY: -10,    // px, nudge the ring's center down (+) / up (-)
  radius: 0.8,     // where feet stand, as a fraction of the planet's radius
  sprite: 19,      // sprite height in px
  gap: 20,         // px of extra space between the planet and the title text
};

function mountPlanetRing() {
  const title = document.querySelector('.page-title');
  const orb = title?.querySelector('.navorb');
  if (!orb) return;   // navbar hasn't drawn the title planet

  const ring = document.createElement('div');
  ring.className = 'planet-ring';
  title.appendChild(ring);

  const slots = PEOPLE.map((person) => {
    const slot = document.createElement('div');
    slot.className = 'ringer';
    const img = document.createElement('img');
    img.src = `/people/${person.id}.png`;
    img.alt = person.name;
    slot.appendChild(img);
    ring.appendChild(slot);
    return slot;
  });

  // Lay the ring out from RING. Measured from the orb's real box rather than
  // assumed, so it stays centered if the planet size or title layout changes.
  function layout() {
    const t = title.getBoundingClientRect();
    const o = orb.getBoundingClientRect();
    ring.style.left = `${o.left - t.left + RING.offsetX}px`;
    ring.style.top = `${o.top - t.top + RING.offsetY}px`;
    ring.style.width = `${o.width}px`;
    ring.style.height = `${o.height}px`;

    const r = (o.width / 2) * RING.radius;
    slots.forEach((slot, i) => {
      // Start at the top and go clockwise.
      const deg = (i / slots.length) * 360;
      const rad = (deg - 90) * (Math.PI / 180);
      const x = Math.cos(rad) * r;
      const y = Math.sin(rad) * r;
      slot.style.width = `${RING.sprite}px`;
      slot.style.height = `${RING.sprite}px`;
      slot.style.margin = `${-RING.sprite / 2}px 0 0 ${-RING.sprite / 2}px`;
      // Move the sprite's feet onto the circle, then rotate about those feet so
      // it stands perpendicular to the surface.
      slot.style.transform =
        `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${deg}deg)`;
    });

    // Extra breathing room between the planet and the title text.
    orb.style.marginRight = `${RING.gap}px`;
  }

  layout();
  // The planet is an <img>; its box is only final once it has decoded.
  if (!orb.complete) orb.addEventListener('load', layout, { once: true });
  addEventListener('resize', layout);

  // Opt-in tuning panel: /people/?tune
  if (new URLSearchParams(location.search).has('tune')) mountTuner(layout);
}

// Slider panel for dialing in the ring, shown only with ?tune in the URL. Prints
// a paste-ready RING block so the chosen values can be made permanent.
async function mountTuner(layout) {
  const { GUI } = await import('lil-gui');
  const gui = new GUI({ title: 'planet ring' });
  const on = () => layout();

  gui.add(RING, 'offsetX', -60, 60, 1).name('center x').onChange(on);
  gui.add(RING, 'offsetY', -60, 60, 1).name('center y').onChange(on);
  gui.add(RING, 'radius', 0.3, 2.5, 0.01).name('circle radius').onChange(on);
  gui.add(RING, 'sprite', 8, 80, 1).name('sprite height').onChange(on);
  gui.add(RING, 'gap', 0, 120, 1).name('planet/title gap').onChange(on);

  gui.add({
    copy() {
      const text =
        'const RING = {\n' +
        `  offsetX: ${RING.offsetX},\n` +
        `  offsetY: ${RING.offsetY},\n` +
        `  radius: ${RING.radius},\n` +
        `  sprite: ${RING.sprite},\n` +
        `  gap: ${RING.gap},\n` +
        '};';
      navigator.clipboard?.writeText(text);
      console.log(text);
    },
  }, 'copy').name('copy values');
}

mountPlanetRing();
