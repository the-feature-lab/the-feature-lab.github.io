// Page configuration. With no Supabase keys the page runs in local demo mode
// (fake GitHub login, localStorage storage, seeded demo community), but only on
// localhost; the live site shows a "not connected yet" notice instead.
// The anon key is public by design; access is enforced by row-level security
// (see supabase/schema.sql). Never put the service-role key here.
export const CONFIG = {
  supabaseUrl: 'https://mzwsarpqletxgtbseiwh.supabase.co',
  supabaseAnonKey: 'sb_publishable_q4FwRQVyAX3MNzz8LeZsHw_Nw2o-8bi', // publishable key (public)

  maxCommentLength: 1000,
};

// Axis text. Internal coordinates run from -1 to 1 with the origin at the
// centre of the cube; no numbers are ever shown.
export const AXES = {
  difficulty: { name: 'Difficulty', low: 'Trivial', high: 'Near impossible' },
  impact: { name: 'Impact', low: 'No impact', high: 'Field-defining' },
  theory: { name: 'Existing theory', low: 'None', high: 'Established' },
};

export const GROUP_NAME = 'Learning Mechanics Group';
