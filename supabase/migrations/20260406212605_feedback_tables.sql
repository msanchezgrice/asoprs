-- Historical migration reconciled from migrations/001_feedback_tables.sql.
create table if not exists feedback_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  screen text not null,
  tag text not null,
  free_text text,
  context_json jsonb,
  created_at timestamptz default now()
);

create table if not exists user_memory_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id),
  exam_date date,
  weak_topics text[] default '{}',
  preferred_session_length_min int default 30,
  preferred_packet_size int default 20,
  last_pain_points text[] default '{}',
  format_usage_stats jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table feedback_entries enable row level security;
alter table user_memory_profiles enable row level security;

create policy "Users can insert own feedback" on feedback_entries
  for insert with check (auth.uid() = user_id);
create policy "Users can read own feedback" on feedback_entries
  for select using (auth.uid() = user_id);
create policy "Admins can read all feedback" on feedback_entries
  for select using (
    exists (
      select 1 from user_memory_profiles
      where user_id = auth.uid() and format_usage_stats->>'role' = 'admin'
    )
  );
create policy "Users can manage own profile" on user_memory_profiles
  for all using (auth.uid() = user_id);
