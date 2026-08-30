-- ============================================================
-- إضافة v5: أرشيف تدقيق البيان الجمركي مقابل فاتورة المورد
-- وحدة مستقلة تماماً عن جداول الإقرار — جدول واحد فقط
-- يُنفَّذ مرة واحدة من SQL Editor ← Run (آمن لإعادة التنفيذ)
-- ============================================================

create table if not exists public.customs_audits (
  id         uuid primary key default gen_random_uuid(),
  ts         timestamptz not null default now(),
  data       jsonb not null,
  ship       jsonb,
  created_by uuid references auth.users(id)
);

create index if not exists idx_ca_ts on public.customs_audits (ts desc);

create or replace function public.set_ca_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists trg_ca_created on public.customs_audits;
create trigger trg_ca_created before insert on public.customs_audits
  for each row execute function public.set_ca_created();

alter table public.customs_audits enable row level security;

drop policy if exists ca_select on public.customs_audits;
drop policy if exists ca_insert on public.customs_audits;
drop policy if exists ca_delete on public.customs_audits;
create policy ca_select on public.customs_audits
  for select to authenticated using (true);
create policy ca_insert on public.customs_audits
  for insert to authenticated
  with check (public.app_role() in ('admin','editor'));
create policy ca_delete on public.customs_audits
  for delete to authenticated
  using (public.app_role() = 'admin' or created_by = auth.uid());
