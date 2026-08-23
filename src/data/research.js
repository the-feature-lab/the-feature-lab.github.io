// ---------------------------------------------------------------------------
// Research artifacts — the lab's primary outputs.
//
// Every artifact is either a paper or a blogpost (`kind`). Both are first-class:
// a blogpost is not a lesser thing than a paper, it's a different thing. When a
// paper *also* has a blogpost written about it, that blogpost is subservient —
// it goes in `links` as a secondary link, not as its own artifact.
//
//   id       string   stable slug
//   kind     string   'paper' | 'blogpost'
//   title    string
//   authors  array    see below — order is as printed on the artifact
//   year     number
//   venue    string   where it was published — 'ICLR 2026', 'lm.pub', '' if none.
//                     Rendered after the year, as "(2026, ICLR 2026)".
//   venueUrl string   optional; makes the venue a link — to the publication's
//                     home, not to this artifact (the title already links
//                     there). Leave it off for conferences.
//   links    array    [{ type, url }] — the first is the primary link
//
// authors entries are either:
//   { id: 'dkarkada' }            a lab member, by id from people.js
//   { id: 'dkarkada', eq: true }  ...with equal-contribution marker (*)
//   'Yuxi Liu'                    an outside collaborator, as a plain string
// ---------------------------------------------------------------------------

export const ARTIFACTS = [
  {
    id: 'muon-balanced-solutions',
    kind: 'paper',
    title: 'Muon learns balanced solutions in matrix factorization without slow saddle-to-saddle dynamics',
    authors: [{ id: 'mrhee' }, { id: 'jsimon' }, { id: 'dkarkada' }],
    year: 2026,
    venue: '',
    links: [{ type: 'arXiv', url: 'https://arxiv.org/abs/2606.30509' }],
  },
  {
    id: 'there-will-be-a-scientific-theory',
    kind: 'paper',
    title: 'There will be a scientific theory of deep learning',
    authors: [
      { id: 'jsimon' }, 'Daniel Kunin', 'Alexander Atanasov', 'Enric Boix-Adserà',
      'Blake Bordelon', 'Jeremy Cohen', 'Nikhil Ghosh', 'Florentin Guth',
      'Arthur Jacot', 'Mason Kamb', { id: 'dkarkada' }, 'Eric J. Michaud',
      'Berkan Ottlik', { id: 'jturnbull' },
    ],
    year: 2026,
    venue: '',
    links: [{ type: 'arXiv', url: 'https://arxiv.org/abs/2604.21691' }],
  },
  {
    id: 'predicting-kernel-learning-curves',
    kind: 'paper',
    title: 'Predicting kernel regression learning curves from only raw data statistics',
    authors: [
      { id: 'dkarkada', eq: true }, { id: 'jturnbull', eq: true },
      'Yuxi Liu', { id: 'jsimon' },
    ],
    year: 2026,
    venue: 'ICLR 2026',
    links: [{ type: 'arXiv', url: 'https://arxiv.org/abs/2510.14878' }],
  },
  {
    id: 'deep-linear-nets',
    kind: 'blogpost',
    title: 'Deep linear networks are a surprisingly useful toy model of weight-space dynamics',
    authors: [{ id: 'mrhee' }, { id: 'dkarkada' }, { id: 'jsimon' }],
    year: 2026,
    venue: 'lm.pub',
    venueUrl: 'https://learningmechanics.pub/',
    links: [{ type: 'lm.pub', url: 'https://learningmechanics.pub/deep-linear-nets/' }],
  },
  {
    id: 'scientific-method-two-steps',
    kind: 'blogpost',
    title: 'The scientific method in two steps',
    authors: [{ id: 'jsimon' }],
    year: 2026,
    venue: 'lm.pub',
    venueUrl: 'https://learningmechanics.pub/',
    links: [{ type: 'lm.pub', url: 'https://learningmechanics.pub/perspectives/scientific-method/' }],
  },
  {
    id: 'atlas-of-deep-learning',
    kind: 'blogpost',
    title: 'Towards an atlas of deep learning',
    authors: [{ id: 'dkarkada' }],
    year: 2026,
    venue: 'lm.pub',
    venueUrl: 'https://learningmechanics.pub/',
    links: [{ type: 'lm.pub', url: 'https://learningmechanics.pub/perspectives/science-as-mapmaking/' }],
  },
];

// Section headings for each kind, in display order.
export const KINDS = {
  paper:    { order: 0, label: 'Papers' },
  blogpost: { order: 1, label: 'Essays and blogposts' },
};

// Group ARTIFACTS by kind, newest first within each group.
export function artifactsByKind(artifacts = ARTIFACTS) {
  return Object.keys(KINDS)
    .map((key) => ({
      key,
      kind: KINDS[key],
      items: artifacts.filter((a) => a.kind === key).sort((a, b) => b.year - a.year),
    }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => a.kind.order - b.kind.order)
    .map(({ key, kind, items }) => ({ key, label: kind.label, items }));
}
