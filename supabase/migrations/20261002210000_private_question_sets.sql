-- Private question sets: study content visible only to explicitly granted users.
--
-- The repository is public, so question content is stored here (never in the
-- codebase) and served through RLS-scoped reads. The service role manages sets,
-- questions and access grants; end users can only read sets they were granted
-- and record their own progress on those sets.

create table if not exists public.private_question_sets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  description text,
  extras jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.private_question_set_access (
  set_id uuid not null references public.private_question_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (set_id, user_id)
);

create index if not exists idx_private_question_set_access_user
  on public.private_question_set_access (user_id);

create table if not exists public.private_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.private_question_sets(id) on delete cascade,
  position integer not null,
  section text not null,
  question text not null,
  options text[] not null default '{}',
  correct_index integer,
  answer text not null,
  explanation text,
  pearl text,
  created_at timestamptz not null default now(),
  unique (set_id, position),
  check (
    (cardinality(options) = 0 and correct_index is null)
    or (correct_index >= 0 and correct_index < cardinality(options))
  )
);

create table if not exists public.private_question_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.private_questions(id) on delete cascade,
  set_id uuid not null references public.private_question_sets(id) on delete cascade,
  card_result text check (card_result in ('got_it', 'missed')),
  quiz_result text check (quiz_result in ('correct', 'incorrect')),
  quiz_attempts integer not null default 0 check (quiz_attempts >= 0),
  quiz_correct integer not null default 0 check (quiz_correct >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index if not exists idx_private_question_progress_user_set
  on public.private_question_progress (user_id, set_id);

alter table public.private_question_sets enable row level security;
alter table public.private_question_set_access enable row level security;
alter table public.private_questions enable row level security;
alter table public.private_question_progress enable row level security;

revoke all privileges on table public.private_question_sets from public, anon, authenticated;
revoke all privileges on table public.private_question_set_access from public, anon, authenticated;
revoke all privileges on table public.private_questions from public, anon, authenticated;
revoke all privileges on table public.private_question_progress from public, anon, authenticated;

-- Grants are read-only except for a user's own progress rows.
create policy private_question_set_access_select_own
  on public.private_question_set_access
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy private_question_sets_select_granted
  on public.private_question_sets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.private_question_set_access access
      where access.set_id = private_question_sets.id
        and access.user_id = (select auth.uid())
    )
  );

create policy private_questions_select_granted
  on public.private_questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.private_question_set_access access
      where access.set_id = private_questions.set_id
        and access.user_id = (select auth.uid())
    )
  );

create policy private_question_progress_select_own
  on public.private_question_progress
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy private_question_progress_insert_own
  on public.private_question_progress
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.private_questions question
      join public.private_question_set_access access
        on access.set_id = question.set_id
      where question.id = private_question_progress.question_id
        and question.set_id = private_question_progress.set_id
        and access.user_id = (select auth.uid())
    )
  );

create policy private_question_progress_update_own
  on public.private_question_progress
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.private_questions question
      join public.private_question_set_access access
        on access.set_id = question.set_id
      where question.id = private_question_progress.question_id
        and question.set_id = private_question_progress.set_id
        and access.user_id = (select auth.uid())
    )
  );

grant select on table public.private_question_set_access to authenticated;
grant select on table public.private_question_sets to authenticated;
grant select on table public.private_questions to authenticated;
grant select, insert, update on table public.private_question_progress to authenticated;
