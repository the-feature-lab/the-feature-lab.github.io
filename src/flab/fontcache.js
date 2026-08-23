import { FontLoader } from 'three/addons/loaders/FontLoader.js';

// ---------------------------------------------------------------------------
// Shared font registry + cached loader. Both the sign (text3d.js) and the planet
// labels pull from here so they use the same typefaces and each JSON loads once.
// ---------------------------------------------------------------------------
export const FONTS = {
  'Jersey 10': '/fonts/Jersey10.typeface.json',
  'Micro 5': '/fonts/Micro5.typeface.json',
  'Tiny5': '/fonts/Tiny5.typeface.json',
  'Pixelify Sans': '/fonts/PixelifySans.typeface.json',
  'Bitcount Grid Double': '/fonts/BitcountGridDouble.typeface.json',
  'Aeogo Pixellated': '/fonts/AeogoPixellated.typeface.json',
  'Helvetiker Bold': '/fonts/helvetiker_bold.typeface.json',
};

const _loader = new FontLoader();
const _cache = new Map(); // url -> Promise<Font>

export function loadFont(url) {
  if (!_cache.has(url)) {
    _cache.set(url, new Promise((resolve, reject) => {
      _loader.load(url, resolve, undefined, reject);
    }));
  }
  return _cache.get(url);
}
