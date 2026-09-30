# Learning Mechanics open research area finder

Interactive page at `/resources/research-area-finder/`. Visitors sign in with GitHub and place each research area in a cube by **Difficulty**, **Impact** and **Existing theory**. They can compare with a Global Aggregate and a Learning Mechanics Group Aggregate, leave comments, and read a daily Claude summary of those comments.

It's a hand-built Vite page, not a generated post. It's listed on the RESOURCES index through `content/blog/research-area-finder/index.md`, whose `href:` makes `scripts/build-blog.mjs` add a list entry without generating a page. `.gitignore` has an exception so this folder's `index.html` is tracked.

## Files

| Path | What it is |
|---|---|
| `index.html`, `finder.css` | Page shell (post styles come from `../blog.css`); widget CSS scoped under `.af` |
| `main.js` | Entry: navbar, state, panels, comments |
| `scene.js` | Three.js cube with matplotlib-style back panes, drag editing, aggregates |
| `backend-local.js` / `backend-supabase.js` | Demo storage (localhost only) and the real backend, same interface |
| `config.js` | Supabase URL and public key, axis wording |
| `data/topics.json` | Research areas (order sets the colors) |
| `data/whitelist.json` | GitHub logins in the Learning Mechanics group |
| `supabase/schema.sql` | Tables, row-level security, identity trigger |
| `/scripts/summarize-area-finder.mjs` | Daily Claude summarizer |
| `/.github/workflows/summarize-area-finder.yml` | Scheduled job that runs it |

## Developing

`npm run dev`, then open http://localhost:8000/resources/research-area-finder/. With no Supabase keys the page runs in **demo mode**: you're `@test-user` ("Switch user" takes any name), data is kept in `localStorage`, and the community is seeded demo users. Demo mode only runs on localhost; on flab.world the page shows "isn't connected yet" until `config.js` has Supabase keys.

## Connecting Supabase (one-time)

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Create a GitHub OAuth app (ideally under the the-feature-lab org) with the callback URL `https://<project>.supabase.co/auth/v1/callback`. Paste its client ID and secret into Supabase → Authentication → Providers → GitHub.
3. In Supabase → Authentication → URL Configuration, set the Site URL to `https://flab.world/resources/research-area-finder/` and add `http://localhost:8000/resources/research-area-finder/` to the redirect list for local testing.
4. Put the project URL and **anon** key in `config.js`. The anon key is meant to be public; row-level security is what protects the data.
5. Add three repo secrets for the summarizer: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The service-role key bypasses RLS, so it must only ever go in Actions secrets and never in the site.

## Security

- Placements and summaries are publicly readable, which is what makes the aggregates public. Comments are private: each user can read only their own, and the page shows only Claude's summary.
- Users can only write their own rows. `user_id` and `github_login` are set by a database trigger from `auth.uid()` and `auth.identities`, never from the browser, so nobody can post as someone else.
- Each user gets at most one placement per area and one comment per scope, capped at 1,000 characters.
- All user text is inserted with `textContent`. The summarizer tells Claude to treat comments as data.

## Summaries and cost

The workflow runs once a day. For each view (global, group) and scope (all areas, plus each area) with at least 3 comments, it calls `claude-opus-5-5` at low effort. It skips any scope whose comments haven't changed. That's at most 10 short calls a day: a few cents typically, and around a dollar at worst. Until the secrets exist it logs "Skipping" and exits successfully. Run `node scripts/summarize-area-finder.mjs --dry-run` to see what it would do.

## Editing

- **Add an area:** add it to `data/topics.json` **and** to the `topics` table (`insert into public.topics (name, sort) values ('New Area', 5);`).
- **Group members:** add GitHub logins to `data/whitelist.json`.
- **Axis wording:** `AXES` in `config.js`.
