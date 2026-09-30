-- Field Map schema for Supabase. Run once in the SQL editor.
--
-- Security model
--   * Placements and summaries are publicly readable (the aggregates are public).
--     Comments are readable only by their author; the page shows Claude's summary.
--   * Signed-in users can only insert/update/delete their own rows (RLS).
--   * user_id and github_login are stamped by a trigger from auth.uid() and
--     auth.identities (which the user cannot edit), never trusted from the client.
--   * Each user has at most one row per topic in placements and one comment per
--     scope, so a single account can't flood the tables.
--   * summaries and topics have no write policies: only the service-role key
--     (held in GitHub Actions secrets, never in the site) can write them.

create table public.topics (
  name text primary key,
  sort int not null default 0
);

insert into public.topics (name, sort) values
  ('Mechanistic Interpretability', 1),
  ('Reinforcement Learning', 2),
  ('FP Quantization', 3),
  ('Mixture of Experts', 4);

create table public.placements (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  github_login text not null default '',
  topic        text not null references public.topics (name) on update cascade on delete cascade,
  difficulty   real not null check (difficulty between -1 and 1),
  impact       real not null check (impact between -1 and 1),
  theory       real not null check (theory between -1 and 1),
  updated_at   timestamptz not null default now(),
  primary key (user_id, topic)
);

-- topic = '__all__' is a comment on the user's whole spread.
create table public.comments (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  github_login text not null default '',
  topic        text not null,
  body         text not null check (char_length(btrim(body)) between 1 and 1000),
  updated_at   timestamptz not null default now(),
  primary key (user_id, topic)
);

create table public.summaries (
  scope       text not null check (scope in ('global', 'group')),
  topic       text not null,
  body        text not null,
  n_comments  int  not null,
  source_hash text not null,
  updated_at  timestamptz not null default now(),
  primary key (scope, topic)
);

-- Stamp identity server-side and validate comment topics.
create or replace function public.stamp_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  login text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select i.identity_data ->> 'user_name' into login
  from auth.identities i
  where i.user_id = auth.uid() and i.provider = 'github'
  limit 1;

  if login is null then
    raise exception 'a GitHub identity is required';
  end if;

  new.user_id := auth.uid();
  new.github_login := login;
  new.updated_at := now();

  if tg_table_name = 'comments'
     and new.topic <> '__all__'
     and not exists (select 1 from public.topics t where t.name = new.topic) then
    raise exception 'unknown topic %', new.topic;
  end if;

  return new;
end;
$$;

create trigger placements_stamp before insert or update on public.placements
  for each row execute function public.stamp_identity();
create trigger comments_stamp before insert or update on public.comments
  for each row execute function public.stamp_identity();

-- Table privileges for the Data API roles. Newer Supabase projects don't grant
-- these automatically; RLS below still decides which rows each role can touch.
grant usage on schema public to anon, authenticated;
grant select on public.topics, public.placements, public.summaries to anon, authenticated;
grant select, insert, update, delete on public.placements, public.comments to authenticated;

-- Row-level security
alter table public.topics     enable row level security;
alter table public.placements enable row level security;
alter table public.comments   enable row level security;
alter table public.summaries  enable row level security;

create policy "read topics"     on public.topics     for select to anon, authenticated using (true);
create policy "read placements" on public.placements for select to anon, authenticated using (true);
-- Comments are private: the page only shows Claude's summary, so each user can
-- read just their own (the summarizer uses the service-role key).
create policy "read own comments" on public.comments for select to authenticated
  using (user_id = (select auth.uid()));
create policy "read summaries"  on public.summaries  for select to anon, authenticated using (true);

create policy "insert own placement" on public.placements for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "update own placement" on public.placements for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own placement" on public.placements for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "insert own comment" on public.comments for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "update own comment" on public.comments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own comment" on public.comments for delete to authenticated
  using (user_id = (select auth.uid()));
