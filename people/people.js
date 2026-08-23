import { mountNavbar } from '../src/site/navbar.js';
import './people.css';
import { peopleByRole } from '../src/data/people.js';

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
