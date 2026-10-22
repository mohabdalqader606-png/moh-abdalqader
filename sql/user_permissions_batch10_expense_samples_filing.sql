-- ============================================================================
-- BATCH 10: شاشة "عينات المصروفات" — جدول البوكس فايل والترتيب لكل مصروف
-- ============================================================================
-- يُشغَّل يدوياً على Supabase SQL Editor (آمن لإعادة التنفيذ). يعتمد على Batch 9.
-- جدول واحد جديد: expense_sample_filing — لكل (كشف، حساب مصروف): رقم البوكس فايل، الترتيب داخله، ملاحظة.
-- ============================================================================

create table if not exists public.expense_sample_filing(
  id            text primary key,                  -- statement_id|acct
  statement_id  text not null references public.expense_sample_statements(id) on delete cascade,
  acct          text not null,
  exp           text,
  box           text not null default '',          -- رقم/اسم البوكس فايل
  seq           integer,                           -- الترتيب داخل البوكس
  note          text not null default '',
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);
create index if not exists idx_exp_sample_filing_st on public.expense_sample_filing(statement_id);

drop trigger if exists trg_exp_sample_filing_upd on public.expense_sample_filing;
create trigger trg_exp_sample_filing_upd before insert or update on public.expense_sample_filing
  for each row execute function public.set_exp_sample_updated_by();

alter table public.expense_sample_filing enable row level security;
drop policy if exists exs_filing_select on public.expense_sample_filing;
drop policy if exists exs_filing_write  on public.expense_sample_filing;
create policy exs_filing_select on public.expense_sample_filing
  for select using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'expense-samples')
  );
create policy exs_filing_write on public.expense_sample_filing
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
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'expense_sample_filing') then
    alter publication supabase_realtime add table public.expense_sample_filing;
  end if;
end $$;
alter table public.expense_sample_filing replica identity full;
