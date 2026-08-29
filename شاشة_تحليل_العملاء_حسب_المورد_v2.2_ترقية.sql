-- ============================================================
-- ترقية v2.2 — تجهيز الشاشة لاستيعاب ٣ سنوات (~900 ألف سطر)
-- ينفَّذ في SQL Editor بعد سكربت v2 الأساسي. آمن التنفيذ أكثر من مرة.
--
-- ماذا تفعل هذه الترقية:
-- 1) تنقل اسم الصنف واسم العميل إلى جدولَي أبعاد بدل تكرارهما مع كل سطر
--    (توفير ~40% من حجم القاعدة: 505MB ← 300MB لثلاث سنوات)
-- 2) تضيف فهرس التاريخ لتسريع فلترة الفترة على ملايين السطور
--
-- ⚠ تحذير: إن كانت لديك بيانات مرفوعة مسبقاً بالتصميم القديم، فالسكربت
--    ينقل الأسماء تلقائياً إلى جداول الأبعاد قبل حذف الأعمدة — لا فقدان بيانات.
-- ============================================================

-- ---------- 1) جدولا الأبعاد ----------
create table if not exists public.cal_items (
  item_code text primary key,
  item_name text
);

create table if not exists public.cal_customers (
  customer_code text primary key,
  customer_name text
);

alter table public.cal_items     enable row level security;
alter table public.cal_customers enable row level security;

do $$ begin
  create policy "cal_items_select" on public.cal_items
    for select using (public.app_role() in ('admin','editor','viewer'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "cal_items_write_ins" on public.cal_items
    for insert with check (public.app_role() in ('admin','editor'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "cal_items_write_upd" on public.cal_items
    for update using (public.app_role() in ('admin','editor'))
    with check (public.app_role() in ('admin','editor'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "cal_customers_select" on public.cal_customers
    for select using (public.app_role() in ('admin','editor','viewer'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "cal_customers_write_ins" on public.cal_customers
    for insert with check (public.app_role() in ('admin','editor'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "cal_customers_write_upd" on public.cal_customers
    for update using (public.app_role() in ('admin','editor'))
    with check (public.app_role() in ('admin','editor'));
exception when duplicate_object then null; end $$;

-- ---------- 2) ترحيل الأسماء الموجودة (إن وُجدت بيانات قديمة) ----------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='cal_lines' and column_name='item_name') then
    insert into public.cal_items (item_code, item_name)
    select l.item_code, max(l.item_name)
    from public.cal_lines l where l.item_name is not null
    group by l.item_code
    on conflict (item_code) do nothing;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='cal_lines' and column_name='customer_name') then
    insert into public.cal_customers (customer_code, customer_name)
    select l.customer_code, max(l.customer_name)
    from public.cal_lines l where l.customer_name is not null
    group by l.customer_code
    on conflict (customer_code) do nothing;
  end if;
end $$;

-- ---------- 3) إسقاط الأعمدة المكرّرة من جدول السطور ----------
-- تُسقط الـ views أولاً لأنها تعتمد على الأعمدة
drop view if exists public.cal_v_customers;
drop view if exists public.cal_v_customer_suppliers;

alter table public.cal_lines drop column if exists item_name;
alter table public.cal_lines drop column if exists customer_name;

-- ---------- 4) فهرس التاريخ لتسريع الفلترة ----------
create index if not exists cal_lines_date_idx on public.cal_lines(doc_date);

-- ---------- 5) إعادة بناء الـ Views والدوال على التصميم الجديد ----------
create or replace view public.cal_v_customers
  with (security_invoker = true) as
select
  l.customer_code,
  max(c.customer_name)                                    as customer_name,
  max(coalesce(nullif(l.salesperson,''), r.salesperson))  as salesperson,
  count(distinct l.item_code)                             as items_count,
  count(distinct l.doc_no) filter (where l.doc_type = 'فاتورة') as invoices_count,
  min(l.doc_date)                                         as first_date,
  max(l.doc_date)                                         as last_date,
  sum(l.net_sales)                                        as sales,
  sum(l.total_cost)                                       as cost,
  sum(l.gross_profit)                                     as profit
from public.cal_lines l
left join public.cal_customers c    on c.customer_code = l.customer_code
left join public.cal_customer_reps r on r.customer_code = l.customer_code
group by l.customer_code;

create or replace view public.cal_v_customer_suppliers
  with (security_invoker = true) as
select
  l.customer_code,
  coalesce(nullif(l.supplier,''), m.supplier,
           'مجموعة ' || coalesce(substring(l.item_code from '^[A-Za-z]+'), '؟')) as supplier,
  count(distinct l.item_code)    as items_count,
  sum(l.net_sales)               as sales,
  sum(l.total_cost)              as cost,
  sum(l.gross_profit)            as profit,
  max(l.doc_date)                as last_date
from public.cal_lines l
left join public.cal_item_suppliers m on m.item_code = l.item_code
group by 1, 2;

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
    max(c.customer_name),
    max(coalesce(nullif(l.salesperson,''), r.salesperson)),
    count(distinct l.item_code),
    count(distinct l.doc_no) filter (where l.doc_type = 'فاتورة'),
    min(l.doc_date), max(l.doc_date),
    sum(l.net_sales), sum(l.total_cost), sum(l.gross_profit)
  from public.cal_lines l
  left join public.cal_customers c     on c.customer_code = l.customer_code
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
