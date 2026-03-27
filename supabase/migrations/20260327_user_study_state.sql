create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_flashcard_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'learning', 'mastered')),
  ease_factor numeric(4,2) default 2.50,
  interval_days integer default 0,
  next_review timestamptz,
  last_reviewed timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, flashcard_id)
);

create index if not exists idx_user_flashcard_progress_user_document
  on public.user_flashcard_progress (user_id, document_id);

create index if not exists idx_user_flashcard_progress_due
  on public.user_flashcard_progress (user_id, next_review);

create table if not exists public.user_quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  session_type text not null default 'quiz',
  total_questions integer not null default 0,
  correct_count integer not null default 0,
  score_pct integer not null default 0,
  mode text not null default 'practice',
  completed_at timestamptz not null default now()
);

create index if not exists idx_user_quiz_sessions_user_completed
  on public.user_quiz_sessions (user_id, completed_at desc);

create table if not exists public.user_pdf_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number integer not null,
  color text not null default '#FFEB3B',
  text_content text,
  rects jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_pdf_highlights_user_document
  on public.user_pdf_highlights (user_id, document_id, page_number, created_at);

alter table public.user_profiles enable row level security;
alter table public.user_flashcard_progress enable row level security;
alter table public.user_quiz_sessions enable row level security;
alter table public.user_pdf_highlights enable row level security;

create policy "profiles_select_own"
  on public.user_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "profiles_upsert_own"
  on public.user_profiles
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "flashcard_progress_select_own"
  on public.user_flashcard_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "flashcard_progress_write_own"
  on public.user_flashcard_progress
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "quiz_sessions_select_own"
  on public.user_quiz_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "quiz_sessions_write_own"
  on public.user_quiz_sessions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "highlights_select_own"
  on public.user_pdf_highlights
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "highlights_write_own"
  on public.user_pdf_highlights
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
