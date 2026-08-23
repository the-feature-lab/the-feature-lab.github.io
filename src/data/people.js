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
// ---------------------------------------------------------------------------

export const PEOPLE = [
  { id: 'jsimon',    name: 'Jamie Simon',    role: 'pi',        website: 'https://jamiesimon.io',
    aliases: ['James B. Simon', 'James Simon'] },
  { id: 'rfan',      name: 'Raymond Fan',    role: 'postdoc',   website: 'https://rfangit.github.io/' },
  { id: 'dkarkada',  name: 'Dhruva Karkada', role: 'phd',       website: 'https://dkarkada.xyz' },
  { id: 'jturnbull', name: 'Joey Turnbull',  role: 'phd',       website: 'https://joeyturn.github.io/',
    aliases: ['Joseph Turnbull'] },
  { id: 'sjain',     name: 'Samyak Jain',    role: 'phd',       website: 'https://samyakjain0112.github.io/' },
  { id: 'mrhee',     name: 'Mark Rhee',      role: 'undergrad', website: 'https://mrkdh16.github.io/' },
];

// Look up a person by id. Returns undefined for unknown ids so callers can
// fall back to rendering a plain (non-lab) author name.
export function personById(id) {
  return PEOPLE.find((p) => p.id === id);
}

// Role definitions. `order` fixes the display sequence on the People page;
// `one`/`many` are the singular/plural section labels.
export const ROLES = {
  pi:        { order: 0, one: 'PI',            many: 'PIs' },
  postdoc:   { order: 1, one: 'postdoc',       many: 'postdocs' },
  phd:       { order: 2, one: 'PhD student',   many: 'PhD students' },
  undergrad: { order: 3, one: 'undergrad',     many: 'undergrads' },
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
      members,
    }));
}
