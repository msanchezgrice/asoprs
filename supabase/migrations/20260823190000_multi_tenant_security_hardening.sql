-- Multi-tenant security hardening before opening ASOPRS to additional users.
--
-- Design rules:
--   * the service role bypasses RLS and therefore never needs an allow-all policy;
--   * end-user grants are least-privilege and every personal row is owner-scoped;
--   * legacy personal tables without a trustworthy owner key are quarantined;
--   * AI rate limits are enforced atomically in Postgres, not in process memory.

-- ---------------------------------------------------------------------------
-- 1. Administrative and personalized data must never be generally readable.
-- ---------------------------------------------------------------------------

do $security$
declare
  target_table text;
  policy_record record;
begin
  foreach target_table in array array[
    'builder_roles',
    'admin_settings',
    'user_features',
    'pm_briefs',
    'shipped_changes'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', target_table);

    -- Remove every historical policy on these tables. In particular, policies
    -- named "Service role ..." used USING (true) without a TO clause, which
    -- made them apply to anon/authenticated users as well.
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format(
        'drop policy %I on public.%I',
        policy_record.policyname,
        target_table
      );
    end loop;

    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      target_table
    );
  end loop;
end
$security$;

-- Authenticated users may inspect only their own role and feature assignments.
-- Writes and all access to settings/briefs/change internals remain server-only.
create policy builder_roles_select_own
  on public.builder_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on table public.builder_roles to authenticated;

create policy user_features_select_own
  on public.user_features
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on table public.user_features to authenticated;

-- Remove the historical self-asserted admin path. A user could otherwise put
-- role=admin in their own mutable JSON profile and read everybody's feedback.
drop policy if exists "Admins can read all feedback" on public.feedback_entries;
drop policy if exists "Users can insert own feedback" on public.feedback_entries;
drop policy if exists "Users can read own feedback" on public.feedback_entries;
drop policy if exists feedback_entries_insert_own on public.feedback_entries;
drop policy if exists feedback_entries_select_own on public.feedback_entries;

create policy feedback_entries_insert_own
  on public.feedback_entries
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      (
        coalesce(feedback_type, 'user') = 'user'
        and coalesce(user_role, 'user') = 'user'
      )
      or exists (
        select 1
        from public.builder_roles role_assignment
        where role_assignment.user_id = (select auth.uid())
          and role_assignment.role in ('admin', 'builder')
          and coalesce(feedback_type, 'user') = 'builder'
      )
    )
  );

create policy feedback_entries_select_own
  on public.feedback_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Make the mutable profile policy explicit for both existing and new rows.
drop policy if exists "Users can manage own profile" on public.user_memory_profiles;
drop policy if exists user_memory_profiles_manage_own on public.user_memory_profiles;

create policy user_memory_profiles_manage_own
  on public.user_memory_profiles
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Harden companion and change-feedback policies to explicit authenticated
-- ownership. Server-side jobs continue to work through the service role.
drop policy if exists "Users own sessions" on public.companion_sessions;
drop policy if exists "Users see own turns" on public.companion_turns;
drop policy if exists "Users see own events" on public.companion_events;
drop policy if exists "Users can submit change feedback" on public.change_feedback;
drop policy if exists "Users can read own change feedback" on public.change_feedback;
drop policy if exists companion_sessions_manage_own on public.companion_sessions;
drop policy if exists companion_turns_manage_own on public.companion_turns;
drop policy if exists companion_events_manage_own on public.companion_events;
drop policy if exists change_feedback_insert_own on public.change_feedback;
drop policy if exists change_feedback_select_own on public.change_feedback;

create policy companion_sessions_manage_own
  on public.companion_sessions
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy companion_turns_manage_own
  on public.companion_turns
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.companion_sessions session
      where session.id = companion_turns.session_id
        and session.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.companion_sessions session
      where session.id = companion_turns.session_id
        and session.user_id = (select auth.uid())
    )
  );

create policy companion_events_manage_own
  on public.companion_events
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.companion_sessions session
      where session.id = companion_events.session_id
        and session.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.companion_sessions session
      where session.id = companion_events.session_id
        and session.user_id = (select auth.uid())
    )
  );

create policy change_feedback_insert_own
  on public.change_feedback
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy change_feedback_select_own
  on public.change_feedback
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Personal-data mutation goes through authenticated, bounded API handlers.
-- Browser roles retain owner-scoped reads but cannot bypass API validation.
do $personal_table_privileges$
declare
  target_table text;
begin
  foreach target_table in array array[
    'user_profiles',
    'user_flashcard_progress',
    'user_quiz_sessions',
    'user_pdf_highlights',
    'user_study_packs',
    'feedback_entries',
    'user_memory_profiles',
    'companion_sessions',
    'companion_turns',
    'companion_events',
    'change_feedback'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    execute format(
      'revoke all privileges on table public.%I from public, anon',
      target_table
    );
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated',
      target_table
    );
    execute format(
      'grant select on table public.%I to authenticated',
      target_table
    );
  end loop;
end
$personal_table_privileges$;

-- NOT VALID preserves unknown legacy rows while enforcing every future write.
do $bounded_personal_rows$
begin
  if not exists (select 1 from pg_constraint where conname = 'companion_sessions_recap_size') then
    alter table public.companion_sessions
      add constraint companion_sessions_recap_size
      check (recap_json is null or octet_length(recap_json::text) <= 48000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companion_turns_content_size') then
    alter table public.companion_turns
      add constraint companion_turns_content_size
      check (
        char_length(transcript) between 1 and 8000
        and (prompt_kind is null or char_length(prompt_kind) <= 100)
      ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companion_events_content_size') then
    alter table public.companion_events
      add constraint companion_events_content_size
      check (
        char_length(event_type) between 1 and 100
        and octet_length(coalesce(payload, '{}'::jsonb)::text) <= 16000
        and (screenshot_url is null or char_length(screenshot_url) <= 500)
      ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_entries_content_size') then
    alter table public.feedback_entries
      add constraint feedback_entries_content_size
      check (
        char_length(screen) between 1 and 100
        and char_length(tag) between 1 and 100
        and (free_text is null or char_length(free_text) <= 4000)
        and (page_category is null or char_length(page_category) <= 100)
        and (context_json is null or octet_length(context_json::text) <= 8000)
      ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_memory_profiles_content_size') then
    alter table public.user_memory_profiles
      add constraint user_memory_profiles_content_size
      check (
        cardinality(coalesce(weak_topics, '{}'::text[])) <= 50
        and octet_length(array_to_string(coalesce(weak_topics, '{}'::text[]), '')) <= 5000
        and preferred_session_length_min between 5 and 240
        and preferred_packet_size between 1 and 100
      ) not valid;
  end if;
end
$bounded_personal_rows$;

do $bounded_study_rows$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_study_packs_content_size') then
    alter table public.user_study_packs
      add constraint user_study_packs_content_size
      check (
        char_length(title) between 1 and 200
        and cardinality(section_titles) <= 5
        and cardinality(source_document_ids) <= 5
        and (generation_instructions is null or char_length(generation_instructions) <= 2000)
        and octet_length(pack_json::text) <= 750000
        and char_length(pack_text) <= 750000
      ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_pdf_highlights_content_size') then
    alter table public.user_pdf_highlights
      add constraint user_pdf_highlights_content_size
      check (
        page_number between 1 and 10000
        and (text_content is null or char_length(text_content) <= 10000)
        and octet_length(rects::text) <= 64000
      ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_quiz_sessions_value_bounds') then
    alter table public.user_quiz_sessions
      add constraint user_quiz_sessions_value_bounds
      check (
        total_questions between 1 and 500
        and correct_count between 0 and total_questions
        and score_pct between 0 and 100
      ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'change_feedback_comment_size') then
    alter table public.change_feedback
      add constraint change_feedback_comment_size
      check (comment is null or char_length(comment) <= 2000) not valid;
  end if;
end
$bounded_study_rows$;

-- The production audit found zero NULLs in these ownership columns. Enforcing
-- NOT NULL closes the RLS-unowned-row state for all future writes.
alter table public.feedback_entries alter column user_id set not null;
alter table public.user_memory_profiles alter column user_id set not null;
alter table public.companion_sessions alter column user_id set not null;
alter table public.companion_turns alter column session_id set not null;
alter table public.companion_events alter column session_id set not null;
alter table public.change_feedback alter column user_id set not null;
alter table public.builder_roles alter column user_id set not null;
alter table public.user_features alter column user_id set not null;

-- Opening signups is not a safe time to leave the feedback-to-code loop
-- autonomous. An administrator may re-enable individual stages later, but the
-- launch baseline keeps proposal approval, builds, review, and merge manual.
update public.admin_settings
set
  value = value || jsonb_build_object(
    'mode', 'dry_run',
    'auto_merge_enabled', false,
    'auto_approve_proposals', false,
    'auto_trigger_build', false,
    'auto_run_approval_agent', false
  ),
  updated_at = now()
where key = 'approval_config';

-- ---------------------------------------------------------------------------
-- 2. The shared study library is read-only to browser roles.
-- ---------------------------------------------------------------------------

do $library$
declare
  target_table text;
  policy_record record;
begin
  foreach target_table in array array[
    'documents',
    'document_chunks',
    'flashcards',
    'mcq_questions'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'Required shared library table public.% is missing', target_table;
    end if;

    execute format('alter table public.%I enable row level security', target_table);

    -- Reset unknown historical policies so no forgotten browser-write policy
    -- can combine with the grants below.
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format(
        'drop policy %I on public.%I',
        policy_record.policyname,
        target_table
      );
    end loop;

    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      target_table
    );
    execute format(
      'grant select on table public.%I to anon, authenticated',
      target_table
    );
    execute format(
      'create policy shared_library_read on public.%I for select to anon, authenticated using (true)',
      target_table
    );
  end loop;
end
$library$;

-- Direct RPC execution would bypass authenticated API quotas and make vector
-- search an anonymous database-amplification endpoint. Cover every overload.
do $search_rpc_privileges$
declare
  search_function regprocedure;
begin
  for search_function in
    select function_info.oid::regprocedure
    from pg_proc function_info
    join pg_namespace namespace_info on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'search_chunks'
  loop
    execute format(
      'revoke all privileges on function %s from public, anon, authenticated',
      search_function
    );
    execute format(
      'grant execute on function %s to service_role',
      search_function
    );
  end loop;
end
$search_rpc_privileges$;

create index if not exists idx_document_chunks_document_id
  on public.document_chunks (document_id);
create index if not exists idx_flashcards_document_id
  on public.flashcards (document_id);
create index if not exists idx_mcq_questions_document_id
  on public.mcq_questions (document_id);

-- Server-side document list endpoints can fetch exact counts without loading
-- tens of thousands of child IDs. SECURITY INVOKER preserves base-table RLS.
create or replace view public.document_content_counts
with (security_invoker = true)
as
select
  document.id as document_id,
  coalesce(flashcard_counts.flashcard_count, 0)::bigint as flashcard_count,
  coalesce(mcq_counts.mcq_count, 0)::bigint as mcq_count
from public.documents document
left join (
  select flashcard.document_id, count(*)::bigint as flashcard_count
  from public.flashcards flashcard
  group by flashcard.document_id
) flashcard_counts on flashcard_counts.document_id = document.id
left join (
  select mcq.document_id, count(*)::bigint as mcq_count
  from public.mcq_questions mcq
  group by mcq.document_id
) mcq_counts on mcq_counts.document_id = document.id;

revoke all privileges on table public.document_content_counts
  from public, anon, authenticated;
grant select on table public.document_content_counts to service_role;

-- ---------------------------------------------------------------------------
-- 3. Quarantine ambiguous legacy personal-data tables.
-- ---------------------------------------------------------------------------

do $legacy$
declare
  target_table text;
  policy_record record;
  has_reliable_user_id boolean;
begin
  foreach target_table in array array[
    'quiz_attempts',
    'study_progress',
    'study_sessions',
    'pdf_highlights'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', target_table);

    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format(
        'drop policy %I on public.%I',
        policy_record.policyname,
        target_table
      );
    end loop;

    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      target_table
    );

    select
      exists (
        select 1
        from information_schema.columns column_info
        where column_info.table_schema = 'public'
          and column_info.table_name = target_table
          and column_info.column_name = 'user_id'
          and column_info.data_type = 'uuid'
      )
      and exists (
        select 1
        from information_schema.table_constraints table_constraint
        join information_schema.key_column_usage key_column
          on key_column.constraint_catalog = table_constraint.constraint_catalog
          and key_column.constraint_schema = table_constraint.constraint_schema
          and key_column.constraint_name = table_constraint.constraint_name
        join information_schema.constraint_column_usage referenced_column
          on referenced_column.constraint_catalog = table_constraint.constraint_catalog
          and referenced_column.constraint_schema = table_constraint.constraint_schema
          and referenced_column.constraint_name = table_constraint.constraint_name
        where table_constraint.constraint_type = 'FOREIGN KEY'
          and table_constraint.table_schema = 'public'
          and table_constraint.table_name = target_table
          and key_column.column_name = 'user_id'
          and referenced_column.table_schema = 'auth'
          and referenced_column.table_name = 'users'
          and referenced_column.column_name = 'id'
      )
    into has_reliable_user_id;

    if has_reliable_user_id then
      -- Ownership is only considered reliable for a UUID user_id protected by
      -- a foreign key to auth.users(id). Rows without an owner remain
      -- inaccessible, and no NOT NULL conversion is guessed.
      execute format(
        'grant select, insert, update, delete on table public.%I to authenticated',
        target_table
      );
      execute format(
        'create policy legacy_owner_access on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
        target_table
      );
    end if;
  end loop;
end
$legacy$;

-- ---------------------------------------------------------------------------
-- 4. Companion screenshots are private, bounded, and folder-owner isolated.
-- ---------------------------------------------------------------------------

-- The study PDFs remain intentionally public to read, but only the service
-- role may write them. The historical "Service upload PDFs" policy applied to
-- PUBLIC and therefore allowed anonymous uploads.
update storage.buckets
set
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = array['application/pdf']::text[]
where id = 'pdfs';

do $pdf_storage_policies$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') like '%pdfs%'
        or coalesce(with_check, '') like '%pdfs%'
      )
  loop
    execute format('drop policy %I on storage.objects', policy_record.policyname);
  end loop;
end
$pdf_storage_policies$;

update storage.buckets
set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'companion-screenshots';

create or replace function public.can_upload_companion_screenshot(p_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := split_part(p_name, '/', 2);
begin
  if v_user_id is null
    or split_part(p_name, '/', 1) <> v_user_id::text
    or v_session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or not exists (
      select 1
      from public.companion_sessions session
      where session.id::text = v_session_id
        and session.user_id = v_user_id
    )
  then
    return false;
  end if;

  -- Serialize quota decisions per user. Without this lock, concurrent uploads
  -- can all observe the same pre-insert count and collectively exceed a cap.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('companion-screenshot:' || v_user_id::text, 0)
  );

  return
    (
      select count(*)
      from storage.objects object
      where object.bucket_id = 'companion-screenshots'
        and object.name >= v_user_id::text || '/'
        and object.name < v_user_id::text || '0'
    ) < 1000
    and (
      select count(*)
      from storage.objects object
      where object.bucket_id = 'companion-screenshots'
        and object.name >= v_user_id::text || '/'
        and object.name < v_user_id::text || '0'
        and object.created_at >= pg_catalog.now() - interval '24 hours'
    ) < 120;
end
$function$;

revoke all privileges on function public.can_upload_companion_screenshot(text)
  from public, anon;
grant execute on function public.can_upload_companion_screenshot(text)
  to authenticated;

do $storage_policies$
declare
  policy_record record;
begin
  -- Remove every prior policy that mentions this bucket, regardless of its
  -- historical name, before installing the owner-folder contract.
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') like '%companion-screenshots%'
        or coalesce(with_check, '') like '%companion-screenshots%'
      )
  loop
    execute format('drop policy %I on storage.objects', policy_record.policyname);
  end loop;
end
$storage_policies$;

create policy companion_screenshots_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'companion-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy companion_screenshots_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'companion-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_upload_companion_screenshot(name)
  );

create policy companion_screenshots_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'companion-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'companion-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy companion_screenshots_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'companion-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- 5. Query-aligned indexes for per-user and per-session access paths.
-- ---------------------------------------------------------------------------

create index if not exists idx_feedback_entries_user_created
  on public.feedback_entries (user_id, created_at desc);
create index if not exists idx_companion_sessions_user_started
  on public.companion_sessions (user_id, started_at desc);
create index if not exists idx_companion_turns_session_started
  on public.companion_turns (session_id, started_at desc);
create index if not exists idx_companion_events_session_occurred
  on public.companion_events (session_id, occurred_at desc);
create index if not exists idx_change_feedback_user_created
  on public.change_feedback (user_id, created_at desc);
create index if not exists idx_change_feedback_change_created
  on public.change_feedback (change_id, created_at desc);
create index if not exists idx_pm_briefs_user_generated
  on public.pm_briefs (user_id, generated_at desc);
create index if not exists idx_shipped_changes_pm_brief
  on public.shipped_changes (pm_brief_id);

-- ---------------------------------------------------------------------------
-- 6. Durable, atomic, service-only API rate limiting.
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all privileges on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.api_rate_limits (
  actor text not null,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (actor, action)
);

alter table private.api_rate_limits enable row level security;
revoke all privileges on table private.api_rate_limits
  from public, anon, authenticated;
grant select, insert, update, delete on table private.api_rate_limits
  to service_role;

create index if not exists idx_api_rate_limits_updated
  on private.api_rate_limits (updated_at);

create or replace function public.consume_api_rate_limit(
  p_actor text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if p_actor is null or length(p_actor) = 0 or length(p_actor) > 256 then
    raise exception 'Invalid rate-limit actor';
  end if;
  if p_action is null or length(p_action) = 0 or length(p_action) > 128 then
    raise exception 'Invalid rate-limit action';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000000 then
    raise exception 'Invalid rate limit';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 2678400 then
    raise exception 'Invalid rate-limit window';
  end if;

  insert into private.api_rate_limits as rate_limit (
    actor,
    action,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_actor,
    p_action,
    v_now,
    1,
    v_now
  )
  on conflict (actor, action) do update
  set
    window_started_at = case
      when rate_limit.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        then v_now
      else rate_limit.window_started_at
    end,
    request_count = case
      when rate_limit.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        then 1
      else least(rate_limit.request_count + 1, p_limit + 1)
    end,
    updated_at = v_now
  returning rate_limit.window_started_at, rate_limit.request_count
  into v_window_started_at, v_request_count;

  allowed := v_request_count <= p_limit;
  remaining := greatest(p_limit - v_request_count, 0);
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      ceil(
        extract(
          epoch from (
            v_window_started_at
            + make_interval(secs => p_window_seconds)
            - v_now
          )
        )
      )::integer,
      1
    )
  end;

  return next;
end
$function$;

revoke all privileges on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;
