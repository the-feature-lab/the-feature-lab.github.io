// ---------------------------------------------------------------------------
// The lab roster.
//
// One record per person. Attributes are expected to grow (photo, research
// interests, start year, alumni status, ...) — add fields here and read them
// wherever they're needed; consumers should tolerate missing optional fields.
//
//   id      string  stable slug; research.js references authors by this
//   name    string  display name
//   role    string  must be a key in ROLES below
//   website string  personal site (absolute URL, or bare host to be normalized)
//
// `aliases` (optional) lists other spellings that appear in author lists
// elsewhere ("James B. Simon"), so imported metadata can be matched to a person.
//
// `sprite` is OPTIONAL, and having one is separate from being SHOWN: whether a
// person's character appears on the planets is decided by their role's
// `sprites` flag (see ROLES). Alumni keep their sprite; it just isn't drawn.
// It is the person's little cube character on the homepage PEOPLE planet:
// a base `model` ('guy' | 'girl') plus one color per recolorable slot. Slot
// names and what they paint are defined in flab/skin.js. Edit these by hand, or
// use the builder at /spritelab/ and paste the result back here.
// ---------------------------------------------------------------------------

export const PEOPLE = [
  { id: 'jsimon',    name: 'Jamie Simon',    role: 'pi',        website: 'https://jamiesimon.io',
    aliases: ['James B. Simon', 'James Simon'],
    sprite: { model: 'guy', head: '#d9b380', skin: '#f2d0b3', shirt: '#4fbbc9', pants: '#1f2229', eyes: '#225c9b' }
  },
  { id: 'rfan',      name: 'Raymond Fan',    role: 'postdoc',   website: 'https://rfangit.github.io/',
    sprite: { model: 'guy', head: '#0d0b0a', skin: '#f2d0b3', shirt: '#a8a69f', pants: '#1f2229', eyes: '#343434' }
  },
  { id: 'dkarkada',  name: 'Dhruva Karkada', role: 'phd',       website: 'https://dkarkada.xyz',
    sprite: { model: 'guy', head: '#0d0b0a', skin: '#a3714a', shirt: '#ead7ae', pants: '#503535', eyes: '#1f1b18' }
  },
  { id: 'jturnbull', name: 'Joey Turnbull',  role: 'phd',       website: 'https://joeyturn.github.io/',
    aliases: ['Joseph Turnbull'],
    sprite: { model: 'guy', head: '#2b2119', skin: '#f2d0b3', shirt: '#6f2311', pants: '#3a3f4a', eyes: '#343434' }
  },
  { id: 'sjain',     name: 'Samyak Jain',    role: 'phd',       website: 'https://samyakjain0112.github.io/',
    sprite: { model: 'guy', head: '#0d0b0a', skin: '#57331f', shirt: '#072e69', pants: '#2f4f45', eyes: '#1f1b18' }
  },
  { id: 'mrhee',     name: 'Mark Rhee',      role: 'undergrad', website: 'https://mrkdh16.github.io/',
    sprite: { model: 'guy', head: '#0d0b0a', skin: '#f2d0b3', shirt: '#c0a5be', pants: '#2b3a4a', eyes: '#343434' }
  },
  // Alumni keep their sprite; the `alumni` role is what hides it.
  { id: 'bottlik',   name: 'Berkan Ottlik',  role: 'alumni',    website: 'https://berkan.xyz/',
    sprite: { model: 'guy', head: '#5c3b28', skin: '#e8b98f', shirt: '#5aa469', pants: '#3a3f4a', eyes: '#3d2b1f' }
  },
];

// Look up a person by id. Returns undefined for unknown ids so callers can
// fall back to rendering a plain (non-lab) author name.
export function personById(id) {
  return PEOPLE.find((p) => p.id === id);
}

// Everyone whose cube character should be DRAWN: they have a sprite, and their
// role shows sprites (alumni don't). The homepage walkers, the People-page ring,
// and the pre-render script all use this rather than PEOPLE, so a person with no
// sprite — or one whose role hides it — can't break them.
export function spritedPeople(people = PEOPLE) {
  return people.filter((p) => p.sprite && ROLES[p.role]?.sprites !== false);
}

// Everyone with sprite data at all, shown or not — for the /spritelab/ editor,
// which should still be able to edit an alum's character.
export function editablePeople(people = PEOPLE) {
  return people.filter((p) => p.sprite);
}

// Role definitions. `order` fixes the display sequence on the People page;
// `one`/`many` are the singular/plural section labels.
export const ROLES = {
  pi:        { order: 0, one: 'PI',            many: 'PIs' },
  postdoc:   { order: 1, one: 'postdoc',       many: 'postdocs' },
  phd:       { order: 2, one: 'PhD student',   many: 'PhD students' },
  undergrad: { order: 3, one: 'undergrad',     many: 'undergrads' },
  // `rule: true` draws a pale divider above this group; `sprites: false` keeps
  // its members off the planets. Alumni keep their sprite data — graduating is
  // just a `role` change, and nothing about their appearance is lost.
  alumni:    { order: 4, one: 'alumni',        many: 'alumni', rule: true, sprites: false },
};

// Group PEOPLE into [{ key, label, members }], ordered by ROLES[].order.
// Empty roles are omitted; the label is pluralized when the group has >1 member.
export function peopleByRole(people = PEOPLE) {
  const known = Object.keys(ROLES);
  return known
    .map((key) => ({ key, role: ROLES[key], members: people.filter((p) => p.role === key) }))
    .filter((g) => g.members.length > 0)
    .sort((a, b) => a.role.order - b.role.order)
    .map(({ key, role, members }) => ({
      key,
      label: members.length > 1 ? role.many : role.one,
      rule: !!role.rule,
      members,
    }));
}
