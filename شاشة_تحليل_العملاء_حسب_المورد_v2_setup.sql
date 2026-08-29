-- ============================================================
-- شاشة تحليل العملاء حسب المورد v2 — سكربت الإعداد (ينفَّذ مرة واحدة في SQL Editor)
-- يعتمد على الجاهز مسبقاً: جدول public.profiles + دالة public.app_role()
-- (مستقل تماماً عن جداول ca_ الخاصة بشاشة v1)
-- ============================================================

-- دفعات الرفع: كل "دفعة" = لصقة واحدة من كويري سطور الفواتير (شهر/ربع/سنة...)
create table if not exists public.cal_uploads (
  id uuid primary key default gen_random_uuid(),
  label text,
  date_from date,
  date_to date,
  rows_count integer not null default 0,
  total_sales numeric not null default 0,
  total_cost numeric not null default 0,
  total_profit numeric not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

-- سطور الفواتير/المرتجعات التفصيلية
create table if not exists public.cal_lines (
  id bigint generated always as identity primary key,
  upload_id uuid not null references public.cal_uploads(id) on delete cascade,
  doc_type text not null default 'فاتورة',          -- فاتورة / مرتجع
  doc_no text,
  doc_date date not null,
  customer_code text not null,
  customer_name text,
  salesperson text,                                  -- اختياري من الكويري
  supplier text,                                     -- اختياري من الكويري
  item_code text not null,
  item_name text,
  qty numeric not null default 0,
  net_sales numeric not null default 0,
  total_cost numeric not null default 0,
  gross_profit numeric not null default 0,
  cost_estimated boolean not null default false,     -- الكلفة محسوبة تقديرياً (غير مدلفرة)
  delivered boolean not null default true
);

-- خريطة الأصناف → الموردين (تُدار من الشاشة)
create table if not exists public.cal_item_suppliers (
  item_code text primary key,
  supplier text not null
);

-- خريطة العملاء → المندوبين (تُدار من الشاشة)
create table if not exists public.cal_customer_reps (
  customer_code text primary key,
  salesperson text not null
);

create index if not exists cal_lines_customer_idx on public.cal_lines(customer_code, doc_date);
create index if not exists cal_lines_upload_idx   on public.cal_lines(upload_id);
create index if not exists cal_lines_item_idx     on public.cal_lines(item_code);
create index if not exists cal_uploads_date_idx   on public.cal_uploads(created_at desc);

alter table public.cal_uploads        enable row level security;
alter table public.cal_lines          enable row level security;
alter table public.cal_item_suppliers enable row level security;
alter table public.cal_customer_reps  enable row level security;

-- ---------- القراءة: لأي مستخدم له دور ----------
create policy "cal_uploads_select" on public.cal_uploads
  for select using (public.app_role() in ('admin','editor','viewer'));
create policy "cal_lines_select" on public.cal_lines
  for select using (public.app_role() in ('admin','editor','viewer'));
create policy "cal_item_suppliers_select" on public.cal_item_suppliers
  for select using (public.app_role() in ('admin','editor','viewer'));
create policy "cal_customer_reps_select" on public.cal_customer_reps
  for select using (public.app_role() in ('admin','editor','viewer'));

-- ---------- الإدخال: admin و editor ----------
create policy "cal_uploads_insert" on public.cal_uploads
  for insert with check (public.app_role() in ('admin','editor') and created_by = auth.uid());

create policy "cal_lines_insert" on public.cal_lines
  for insert with check (
    public.app_role() in ('admin','editor')
    and exists (
      select 1 from public.cal_uploads u
      where u.id = upload_id
        and (public.app_role() = 'admin' or u.created_by = auth.uid())
    )
  );

-- ---------- حذف الدفعات: admin أي دفعة، editor دفعاته (السطور تنحذف cascade) ----------
create policy "cal_uploads_delete" on public.cal_uploads
  for delete using (
    public.app_role() = 'admin'
    or (public.app_role() = 'editor' and created_by = auth.uid())
  );

-- ---------- خرائط الموردين/المندوبين: تعديل كامل لـ admin و editor ----------
create policy "cal_item_suppliers_write_ins" on public.cal_item_suppliers
  for insert with check (public.app_role() in ('admin','editor'));
create policy "cal_item_suppliers_write_upd" on public.cal_item_suppliers
  for update using (public.app_role() in ('admin','editor'))
  with check (public.app_role() in ('admin','editor'));
create policy "cal_item_suppliers_write_del" on public.cal_item_suppliers
  for delete using (public.app_role() in ('admin','editor'));

create policy "cal_customer_reps_write_ins" on public.cal_customer_reps
  for insert with check (public.app_role() in ('admin','editor'));
create policy "cal_customer_reps_write_upd" on public.cal_customer_reps
  for update using (public.app_role() in ('admin','editor'))
  with check (public.app_role() in ('admin','editor'));
create policy "cal_customer_reps_write_del" on public.cal_customer_reps
  for delete using (public.app_role() in ('admin','editor'));

-- ============================================================
-- Views تجميعية (تحترم RLS عبر security_invoker) — حتى ما نسحب ملايين السطور للمتصفح
-- ============================================================

-- ملخص لكل عميل
create or replace view public.cal_v_customers
  with (security_invoker = true) as
select
  l.customer_code,
  max(l.customer_name)                                    as customer_name,
  max(coalesce(nullif(l.salesperson,''), r.salesperson))  as salesperson,
  count(distinct l.item_code)                             as items_count,
  count(distinct l.doc_no) filter (where l.doc_type = 'فاتورة') as invoices_count,
  min(l.doc_date)                                         as first_date,
  max(l.doc_date)                                         as last_date,
  sum(l.net_sales)                                        as sales,
  sum(l.total_cost)                                       as cost,
  sum(l.gross_profit)                                     as profit
from public.cal_lines l
left join public.cal_customer_reps r on r.customer_code = l.customer_code
group by l.customer_code;

-- ملخص عميل × مورد (المورد: من الكويري، وإلا من الخريطة، وإلا من بادئة كود الصنف)
create or replace view public.cal_v_customer_suppliers
  with (security_invoker = true) as
select
  l.customer_code,
  coalesce(
    nullif(l.supplier,''),
    m.supplier,
    'مجموعة ' || coalesce(substring(l.item_code from '^[A-Za-z]+'), '؟')
  )                              as supplier,
  count(distinct l.item_code)    as items_count,
  sum(l.net_sales)               as sales,
  sum(l.total_cost)              as cost,
  sum(l.gross_profit)            as profit,
  max(l.doc_date)                as last_date
from public.cal_lines l
left join public.cal_item_suppliers m on m.item_code = l.item_code
group by 1, 2;
-- ============================================================
-- إضافة v2.1: دالتا فلترة بالفترة الزمنية لشاشة تحليل العملاء حسب المورد
-- تُنفَّذ في SQL Editor بعد سكربت v2 الأساسي (ولو نفّذت v2 المحدَّث فهي موجودة أصلاً — إعادة تنفيذها آمنة)
-- الدوال SECURITY INVOKER افتراضياً، فسياسات RLS على cal_lines تظل مطبَّقة
-- ============================================================

create or replace function public.cal_fn_customers(d_from date default null, d_to date default null)
returns table (
  customer_code text, customer_name text, salesperson text,
  items_count bigint, invoices_count bigint,
  first_date date, last_date date,
  sales numeric, cost numeric, profit numeric
)
language sql stable as $$
  select
    l.customer_code,
    max(l.customer_name),
    max(coalesce(nullif(l.salesperson,''), r.salesperson)),
    count(distinct l.item_code),
    count(distinct l.doc_no) filter (where l.doc_type = 'فاتورة'),
    min(l.doc_date), max(l.doc_date),
    sum(l.net_sales), sum(l.total_cost), sum(l.gross_profit)
  from public.cal_lines l
  left join public.cal_customer_reps r on r.customer_code = l.customer_code
  where (d_from is null or l.doc_date >= d_from)
    and (d_to   is null or l.doc_date <= d_to)
  group by l.customer_code;
$$;

create or replace function public.cal_fn_customer_suppliers(d_from date default null, d_to date default null)
returns table (
  customer_code text, supplier text, items_count bigint,
  sales numeric, cost numeric, profit numeric, last_date date
)
language sql stable as $$
  select
    l.customer_code,
    coalesce(nullif(l.supplier,''), m.supplier,
             'مجموعة ' || coalesce(substring(l.item_code from '^[A-Za-z]+'), '؟')),
    count(distinct l.item_code),
    sum(l.net_sales), sum(l.total_cost), sum(l.gross_profit),
    max(l.doc_date)
  from public.cal_lines l
  left join public.cal_item_suppliers m on m.item_code = l.item_code
  where (d_from is null or l.doc_date >= d_from)
    and (d_to   is null or l.doc_date <= d_to)
  group by 1, 2;
$$;
