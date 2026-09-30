// Supabase backend: GitHub OAuth + Postgres with row-level security.
// Identity (github_login, user_id) is stamped server-side by a trigger, so the
// client can't write rows as anyone else. See supabase/schema.sql.
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from './config.js';

export const mode = 'supabase';
export const demoGroupMembers = [];

const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
let session = null;

const loginOf = (s) => s?.user?.user_metadata?.user_name ?? null; // display only

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function init() {
  session = check(await sb.auth.getSession()).session;
  sb.auth.onAuthStateChange((_evt, s) => { session = s; });
  return session ? { login: loginOf(session) } : null;
}

export async function signIn() {
  // Redirects to GitHub; the page reloads signed in. Default scope only (public profile).
  check(await sb.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: location.origin + location.pathname },
  }));
  return null;
}

export async function signOut() { check(await sb.auth.signOut()); session = null; }

export async function getMyPlacements() {
  const rows = check(await sb.from('placements')
    .select('topic, difficulty, impact, theory')
    .eq('user_id', session.user.id));
  return Object.fromEntries(rows.map(({ topic, ...p }) => [topic, p]));
}

export async function savePlacement(topic, p) {
  check(await sb.from('placements').upsert(
    { user_id: session.user.id, topic, difficulty: p.difficulty, impact: p.impact, theory: p.theory },
    { onConflict: 'user_id,topic' },
  ));
}

export async function deletePlacement(topic) {
  check(await sb.from('placements').delete().eq('user_id', session.user.id).eq('topic', topic));
}

export async function getAllPlacements() {
  const rows = check(await sb.from('placements').select('github_login, topic, difficulty, impact, theory'));
  return rows.map(({ github_login, ...r }) => ({ login: github_login, ...r }));
}

export async function getComments() {
  if (!session) return []; // comments are private; signed-out visitors can't read any
  const rows = check(await sb.from('comments')
    .select('github_login, topic, body, updated_at')
    .order('updated_at', { ascending: false }));
  return rows.map(({ github_login, ...r }) => ({ login: github_login, ...r }));
}

export async function saveComment(topic, body) {
  check(await sb.from('comments').upsert(
    { user_id: session.user.id, topic, body },
    { onConflict: 'user_id,topic' },
  ));
}

export async function deleteComment(topic) {
  check(await sb.from('comments').delete().eq('user_id', session.user.id).eq('topic', topic));
}

export async function getSummaries() {
  const rows = check(await sb.from('summaries').select('scope, topic, body, n_comments, updated_at'));
  return Object.fromEntries(rows.map((r) => [`${r.scope}|${r.topic}`, r]));
}
