// ---------------------------------------------------------------------------
// Small sound helper. Preloads the "pop" clips and plays a random one on
// demand (e.g. when a frog splits — the new one popping out of the old). Clones
// the Audio per play so rapid pops can overlap. Errors are swallowed: audio may
// be blocked until the first user gesture, which is fine here (pops come from
// clicks, so the gesture requirement is already satisfied).
// ---------------------------------------------------------------------------
const POPS = [
  '/audio/pop_1.mp3',
  '/audio/pop_2.mp3',
  '/audio/pop_3.mp3',
  '/audio/pop_4.mp3',
];

const _cache = POPS.map((src) => {
  const a = new Audio(src);
  a.preload = 'auto';
  a.volume = 0.3;
  return a;
});

export function playPop() {
  const base = _cache[Math.floor(Math.random() * _cache.length)];
  const a = base.cloneNode();
  a.volume = 0.3;
  a.play().catch(() => {}); // ignore autoplay-policy rejections
}
