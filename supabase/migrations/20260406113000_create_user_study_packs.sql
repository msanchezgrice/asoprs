create table if not exists public.user_study_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content_mode text not null check (content_mode in ('mcq', 'flashcards', 'both')),
  section_titles text[] not null default '{}',
  source_document_ids uuid[] not null default '{}',
  output_format text not null default 'docx' check (output_format in ('docx', 'pdf', 'in-app')),
  generation_instructions text,
  pack_json jsonb not null,
  pack_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_study_packs_user_created
  on public.user_study_packs (user_id, created_at desc);

alter table public.user_study_packs enable row level security;

create policy "study_packs_select_own"
  on public.user_study_packs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "study_packs_write_own"
  on public.user_study_packs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
