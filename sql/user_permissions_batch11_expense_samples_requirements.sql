-- ============================================================================
-- BATCH 11: شاشة "عينات المصروفات" — جدول المتطلبات الأخرى (مستندات غير القيود)
-- ============================================================================
-- يُشغَّل يدوياً على Supabase SQL Editor (آمن لإعادة التنفيذ). يعتمد على Batch 9.
-- جدول واحد جديد: expense_sample_requirements — كشف الضمان، شهادات فوائد البنوك، عقود… مع حالة التصوير والبوكس فايل.
-- ============================================================================

create table if not exists public.expense_sample_requirements(
  id            text primary key,
  statement_id  text references public.expense_sample_statements(id) on delete set null,  -- فارغ = عام
  title         text not null,
  category      text not null default '',
  done          boolean not null default false,
  done_at       timestamptz,
  note          text not null default '',
  box           text not null default '',
  seq           integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);
create index if not exists idx_exp_sample_req_st on public.expense_sample_requirements(statement_id);

drop trigger if exists trg_exp_sample_req_upd on public.expense_sample_requirements;
create trigger trg_exp_sample_req_upd before insert or update on public.expense_sample_requirements
  for each row execute function public.set_exp_sample_updated_by();

alter table public.expense_sample_requirements enable row level security;
drop policy if exists exs_req_select on public.expense_sample_requirements;
drop policy if exists exs_req_write  on public.expense_sample_requirements;
create policy exs_req_select on public.expense_sample_requirements
  for select using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'expense-samples')
  );
create policy exs_req_write on public.expense_sample_requirements
  for all using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'expense-samples' and u.permission in ('INPUT','ADMIN'))
  ) with check (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'expense-samples' and u.permission in ('INPUT','ADMIN'))
  );

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'expense_sample_requirements') then
    alter publication supabase_realtime add table public.expense_sample_requirements;
  end if;
end $$;
alter table public.expense_sample_requirements replica identity full;
