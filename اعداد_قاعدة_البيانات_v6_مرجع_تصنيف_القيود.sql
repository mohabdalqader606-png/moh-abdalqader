-- ============================================================
-- إضافة v6: المرجع الدائم لتصنيف قيود حساب الأمانات
-- كل تصنيف يدوي تختاره لقيد (مبيعات/مصاريف/مستوردات...) يُحفظ
-- كمرجع بتوقيع نص البيان (الأرقام تُستبدل بـ #)، وتُطبَّق نفس
-- التصنيفات تلقائياً عند رفع كشف أي فترة قادمة.
-- يُنفَّذ مرة واحدة من SQL Editor ← Run (آمن لإعادة التنفيذ)
-- ============================================================

create table if not exists public.trust_classifications (
  sig        text primary key,
  sample     text,
  cls        text not null check (cls in ('sal','loc','imp','exp','pay','oth')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_tc2()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists trg_tc2_touch on public.trust_classifications;
create trigger trg_tc2_touch before insert or update on public.trust_classifications
  for each row execute function public.touch_tc2();

alter table public.trust_classifications enable row level security;

drop policy if exists tc2_select on public.trust_classifications;
drop policy if exists tc2_insert on public.trust_classifications;
drop policy if exists tc2_update on public.trust_classifications;
drop policy if exists tc2_delete on public.trust_classifications;
create policy tc2_select on public.trust_classifications
  for select to authenticated using (true);
create policy tc2_insert on public.trust_classifications
  for insert to authenticated
  with check (public.app_role() in ('admin','editor'));
create policy tc2_update on public.trust_classifications
  for update to authenticated
  using (public.app_role() in ('admin','editor'))
  with check (public.app_role() in ('admin','editor'));
create policy tc2_delete on public.trust_classifications
  for delete to authenticated
  using (public.app_role() in ('admin','editor'));
