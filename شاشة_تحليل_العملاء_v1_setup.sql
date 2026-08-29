-- ============================================================
-- شاشة تحليل العملاء — سكربت الإعداد (ينفَّذ مرة واحدة في SQL Editor)
-- يعتمد على الجاهز مسبقاً: جدول public.profiles + دالة public.app_role()
-- ============================================================

-- لقطات التحليل: كل "لقطة" = لصقة واحدة من كويري SAP بتاريخ معين
create table if not exists public.ca_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  label text,
  months jsonb not null default '[]'::jsonb,      -- تسميات الأشهر من الأقدم للأحدث مثل ["2024-09","2024-10",...]
  rows_count integer not null default 0,
  total_sales12 numeric not null default 0,
  total_balance numeric not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

-- صفوف العملاء داخل كل لقطة
create table if not exists public.ca_customer_rows (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references public.ca_snapshots(id) on delete cascade,
  code text not null,
  name text not null,
  salesperson text,
  balance numeric not null default 0,
  credit_limit numeric,
  monthly_sales jsonb not null default '[]'::jsonb -- مصفوفة أرقام بمحاذاة months في اللقطة (من الأقدم للأحدث)
);

create index if not exists ca_customer_rows_snapshot_idx on public.ca_customer_rows(snapshot_id);
create index if not exists ca_snapshots_date_idx on public.ca_snapshots(snapshot_date desc, created_at desc);

alter table public.ca_snapshots     enable row level security;
alter table public.ca_customer_rows enable row level security;

-- القراءة: لأي مستخدم له دور (admin / editor / viewer)
create policy "ca_snapshots_select" on public.ca_snapshots
  for select using (public.app_role() in ('admin','editor','viewer'));

create policy "ca_rows_select" on public.ca_customer_rows
  for select using (public.app_role() in ('admin','editor','viewer'));

-- الإدخال: admin و editor فقط (واللقطة تُسجَّل باسم منشئها)
create policy "ca_snapshots_insert" on public.ca_snapshots
  for insert with check (public.app_role() in ('admin','editor') and created_by = auth.uid());

create policy "ca_rows_insert" on public.ca_customer_rows
  for insert with check (
    public.app_role() in ('admin','editor')
    and exists (
      select 1 from public.ca_snapshots s
      where s.id = snapshot_id
        and (public.app_role() = 'admin' or s.created_by = auth.uid())
    )
  );

-- الحذف: admin أي لقطة، editor لقطاته فقط (صفوف العملاء تُحذف تلقائياً بالـ cascade)
create policy "ca_snapshots_delete" on public.ca_snapshots
  for delete using (
    public.app_role() = 'admin'
    or (public.app_role() = 'editor' and created_by = auth.uid())
  );

-- تعديل تسمية/تاريخ اللقطة: نفس قاعدة الحذف
create policy "ca_snapshots_update" on public.ca_snapshots
  for update using (
    public.app_role() = 'admin'
    or (public.app_role() = 'editor' and created_by = auth.uid())
  )
  with check (
    public.app_role() = 'admin'
    or (public.app_role() = 'editor' and created_by = auth.uid())
  );
