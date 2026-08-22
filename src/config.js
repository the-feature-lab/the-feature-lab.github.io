// ---------------------------------------------------------------------------
// Shared tunable constants for the FLAB homepage scene. Kept in one place so
// values can be adjusted without hunting through logic. Runtime-mutable state
// (e.g. the live cube color) lives in the modules that own it, not here.
// ---------------------------------------------------------------------------

// --- N-body physics -------------------------------------------------------
export const G = 6.0;             // gravitational constant (tuned for visual scale)
export const SOFTENING = 0.25;    // softening length to avoid close-pass singularities
export const SUBSTEPS = 4;        // physics substeps per frame for stability
export const VOXELS = 4;          // NxNxN voxels a cube shatters into
export const SHATTER_BURST = 0.6; // small outward speed added to each freed voxel

// --- FLAB grid ------------------------------------------------------------
// The word as a pixel bitmap. 'o' = cube, '.' = empty. Cubes are placed on a
// planar grid in the XY plane (facing the camera), pinned rigidly.
export const FLAB = [
  '...................',
  '.ooo.o....oo..ooo..',
  '.o...o...o..o.o..o.',
  '.oo..o...oooo.ooo..',
  '.o...o...o..o.o..o.',
  '.o...ooo.o..o.ooo..',
  '...................',
];

export const CUBE_SIZE = 0.8;      // cube edge length (world units, pre-scale)
export const CELL = 1.0;           // grid pitch (CUBE_SIZE < CELL => small gaps)
export const DEFAULT_CUBE_COLOR = 0x85e0ff; // starting cube color (live-editable)
export const DEFAULT_BRIGHTNESS = 2.0;      // starting light-brightness multiplier

// FLAB placement: the camera stays centered on the origin (so the origin-centered
// star sphere stays centered on screen); to make FLAB appear smaller and shifted
// up, we scale and translate the grid itself. These reproduce the framing of an
// earlier camera tweak (VIEW_HEIGHT=22 camera panned to y=-5), solved back into
// world space for the VIEW_HEIGHT=14 camera:
//   scale   = 14/22        (same on-screen size)
//   offsetY = 14 * (5/22)  (same on-screen vertical position)
export const FLAB_SCALE = 14 / 22;
export const FLAB_OFFSET_Y = 14 * (5 / 22);

// --- Camera / view --------------------------------------------------------
export const VIEW_HEIGHT = 14;     // world height shown on screen (ortho)
// Default view tilted just up-and-left of head-on, so we look a touch down from
// the top-left — the F's top-left cube reads as nearest the camera.
export const CAMERA_POS = [-4, 3, 21];

// --- Post-processing ------------------------------------------------------
export const PIXELATE_ON = true;   // pixelation enabled by default
export const PIXEL_SIZE = 2;       // pixelation block edge in CSS pixels
export const STAR_BASE_PX = 3;     // star point size (CSS px) when pixelation is off
export const BLOOM_ON = false;     // glow disabled by default
export const BLOOM_THRESHOLD = 0.25; // brightness above which a pixel glows
export const BLOOM_GLOW = 0.5;       // convex mix: 0 = off, 1 = fully blurred glow
export const BLOOM_RADIUS = 10;      // blur length-scale in output pixels

// --- Frog -----------------------------------------------------------------
export const FROG_COUNT = 20;        // how many frogs roam the letters
export const FROG_FOOTPRINT = 0.85;  // fraction of a cube's top face the frog occupies
// Inter-move timing is Poisson: exponential delays with mean FROG_IDLE_MEAN,
// clamped to at least FROG_IDLE_MIN.
export const FROG_IDLE_MEAN = 4.0;   // typical seconds between actions
export const FROG_IDLE_MIN = 1.0;    // minimum seconds between actions
export const FROG_LEAP_COOLDOWN = 5; // min moves between vertical leaps
export const FROG_HOP_DUR = 0.17;    // seconds a hop takes
export const FROG_HOP_HEIGHT = 0.175;  // turn-hop peak arc height (world units)
export const FROG_JUMP_HEIGHT = 0.35;  // forward-jump arc height (bigger — it travels)
export const FROG_JUMP_PROB = 0.5;     // chance to jump forward when a cube is ahead
export const FROG_LEAP_DUR = 0.3;      // seconds a long letter-to-letter leap takes (fast)
export const FROG_LEAP_ARC = 0.0;      // no arc in space — straight-line constant-velocity coast
export const FROG_LEAP_WEIGHT = 2.0;   // pick-weight of a leap when one is available

// --- Persistence keys -----------------------------------------------------
// Bump VIEW_KEY when the default framing changes so stale saved views are
// discarded rather than overriding the new default.
export const VIEW_KEY = 'flab.view.v4';
export const SETTINGS_KEY = 'flab.render.settings';
