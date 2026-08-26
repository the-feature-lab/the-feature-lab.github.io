import { mountNavbar } from '../src/site/navbar.js';
import './about.css';
import { personById } from '../src/data/people.js';

mountNavbar('about');

// Point the "Jamie" link at whatever the people data says, so it can't drift
// out of sync with the People page.
const pi = personById('jsimon');
const piLink = document.getElementById('pi-link');
if (pi && piLink) piLink.href = pi.website;
