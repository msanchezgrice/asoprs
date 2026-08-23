-- Historical migration reconciled from migrations/002_companion_tables.sql.
create table if not exists companion_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  started_at timestamptz default now(),
  ended_at timestamptz,
  recap_json jsonb,
  created_at timestamptz default now()
);

create table if not exists companion_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references companion_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'model', 'system')),
  transcript text not null,
  prompt_kind text,
  started_at timestamptz not null,
  ended_at timestamptz not null
);

create table if not exists companion_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references companion_sessions(id) on delete cascade,
  event_type text not null,
  payload jsonb default '{}',
  screenshot_url text,
  occurred_at timestamptz default now()
);

create table if not exists pm_briefs (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz default now(),
  summary_json jsonb not null,
  action_items jsonb default '[]',
  status text default 'pending' check (status in ('pending', 'reviewed', 'actioned')),
  created_at timestamptz default now()
);

create table if not exists shipped_changes (
  id uuid primary key default gen_random_uuid(),
  pm_brief_id uuid references pm_briefs(id),
  title text not null,
  description text,
  origin_type text not null check (origin_type in ('request', 'bug', 'pattern', 'annoyance')),
  origin_trace jsonb,
  feature_context jsonb,
  shipped_at timestamptz default now(),
  status text default 'active' check (status in ('active', 'reverted'))
);

create table if not exists change_feedback (
  id uuid primary key default gen_random_uuid(),
  change_id uuid references shipped_changes(id) on delete cascade,
  user_id uuid references auth.users(id),
  rating text not null check (rating in ('better', 'same', 'worse')),
  comment text,
  created_at timestamptz default now()
);

alter table companion_sessions enable row level security;
alter table companion_turns enable row level security;
alter table companion_events enable row level security;
alter table pm_briefs enable row level security;
alter table shipped_changes enable row level security;
alter table change_feedback enable row level security;

create policy "Users own sessions" on companion_sessions
  for all using (auth.uid() = user_id);
create policy "Users see own turns" on companion_turns
  for all using (
    session_id in (select id from companion_sessions where user_id = auth.uid())
  );
create policy "Users see own events" on companion_events
  for all using (
    session_id in (select id from companion_sessions where user_id = auth.uid())
  );
create policy "Authenticated users read briefs" on pm_briefs
  for select using (auth.uid() is not null);
create policy "Authenticated users read changes" on shipped_changes
  for select using (auth.uid() is not null);
create policy "Users can submit change feedback" on change_feedback
  for insert with check (auth.uid() = user_id);
create policy "Users can read own change feedback" on change_feedback
  for select using (auth.uid() = user_id);
