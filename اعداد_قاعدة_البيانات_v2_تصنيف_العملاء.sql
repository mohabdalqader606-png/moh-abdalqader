-- ============================================================
-- إضافة v2: جدول تصنيف العملاء (تصدير / صفري / معفاة)
-- يُنفَّذ مرة واحدة بعد سكربت الإعداد الأول، من SQL Editor ← Run
-- ============================================================

create table if not exists public.customer_classifications (
  customer_code text primary key,
  customer_name text,
  class         text not null check (class in ('export','zero','exempt')),
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);

create or replace function public.touch_cc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_cc_touch on public.customer_classifications;
create trigger trg_cc_touch before insert or update on public.customer_classifications
  for each row execute function public.touch_cc();

alter table public.customer_classifications enable row level security;

drop policy if exists cc_select on public.customer_classifications;
drop policy if exists cc_insert on public.customer_classifications;
drop policy if exists cc_update on public.customer_classifications;
drop policy if exists cc_delete on public.customer_classifications;
create policy cc_select on public.customer_classifications
  for select to authenticated using (true);
create policy cc_insert on public.customer_classifications
  for insert to authenticated
  with check (public.app_role() in ('admin','editor'));
create policy cc_update on public.customer_classifications
  for update to authenticated
  using (public.app_role() in ('admin','editor'))
  with check (public.app_role() in ('admin','editor'));
create policy cc_delete on public.customer_classifications
  for delete to authenticated
  using (public.app_role() = 'admin');
