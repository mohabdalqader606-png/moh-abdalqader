-- ============================================================
-- إضافة v3: جدول شرائح ضريبة الأصناف (تعديل يدوي معتمد)
-- يُنفَّذ مرة واحدة من SQL Editor ← Run
-- ============================================================

create table if not exists public.item_brackets (
  item_code  text primary key,
  item_name  text,
  bracket    text not null check (bracket in ('r16','r10','r8','r5','r4','r2','r13.5','x0','out0')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_ib()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_ib_touch on public.item_brackets;
create trigger trg_ib_touch before insert or update on public.item_brackets
  for each row execute function public.touch_ib();

alter table public.item_brackets enable row level security;

drop policy if exists ib_select on public.item_brackets;
drop policy if exists ib_insert on public.item_brackets;
drop policy if exists ib_update on public.item_brackets;
drop policy if exists ib_delete on public.item_brackets;
create policy ib_select on public.item_brackets
  for select to authenticated using (true);
create policy ib_insert on public.item_brackets
  for insert to authenticated
  with check (public.app_role() in ('admin','editor'));
create policy ib_update on public.item_brackets
  for update to authenticated
  using (public.app_role() in ('admin','editor'))
  with check (public.app_role() in ('admin','editor'));
create policy ib_delete on public.item_brackets
  for delete to authenticated
  using (public.app_role() in ('admin','editor'));
