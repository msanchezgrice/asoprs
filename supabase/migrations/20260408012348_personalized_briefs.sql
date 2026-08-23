-- Historical migration reconciled from migrations/003_personalized_briefs.sql.
alter table pm_briefs
  add column if not exists user_id uuid references auth.users(id) default null,
  add column if not exists brief_type text default 'global'
    check (brief_type in ('global', 'user'));

create index if not exists idx_pm_briefs_user_id on pm_briefs(user_id);
create index if not exists idx_pm_briefs_brief_type on pm_briefs(brief_type);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'pm_briefs_global_read' and tablename = 'pm_briefs'
  ) then
    create policy pm_briefs_global_read on pm_briefs
      for select using (brief_type = 'global');
  end if;

  if not exists (
    select 1 from pg_policies
    where policyname = 'pm_briefs_user_read' and tablename = 'pm_briefs'
  ) then
    create policy pm_briefs_user_read on pm_briefs
      for select using (brief_type = 'user' and user_id = auth.uid());
  end if;
end
$$;
