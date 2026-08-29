-- ============================================================
-- ترقية v3 — جداول ملخصات محسوبة مسبقاً (تحل مشكلة statement timeout)
--
-- المشكلة: تجميع أكثر من مليون سطر مع COUNT(DISTINCT) عند كل فتح للشاشة
--          يتجاوز مهلة التنفيذ على الخطة المجانية.
-- الحل:   تُحسب الملخصات مرة واحدة بعد كل رفع، والشاشة تقرأ منها مباشرة.
--          كل الأرقام تبقى دقيقة ١٠٠٪ — لا تقريب.
--
-- ينفَّذ في SQL Editor بعد v2.2. آمن التنفيذ أكثر من مرة.
-- ============================================================

-- ---------- 1) جدول الملخص الأساسي: عميل × صنف × شهر ----------
create table if not exists public.cal_sum_item (
  customer_code text not null,
  item_code     text not null,
  ym            date not null,          -- أول يوم في الشهر
  supplier      text,
  qty           numeric not null default 0,
  sales         numeric not null default 0,
  cost          numeric not null default 0,
  profit        numeric not null default 0,
  buys          integer not null default 0,   -- أيام شراء مميزة (فواتير فقط)
  first_date    date,
  last_date     date,
  est           boolean not null default false,
  primary key (customer_code, item_code, ym)
);
create index if not exists cal_sum_item_ym_idx  on public.cal_sum_item(ym);
create index if not exists cal_sum_item_sup_idx on public.cal_sum_item(supplier);

-- ---------- 2) ملخص عميل × شهر (لعدد الفواتير الدقيق) ----------
create table if not exists public.cal_sum_cust (
  customer_code text not null,
  ym            date not null,
  sales         numeric not null default 0,
  cost          numeric not null default 0,
  profit        numeric not null default 0,
  invoices      integer not null default 0,
  first_date    date,
  last_date     date,
  primary key (customer_code, ym)
);
create index if not exists cal_sum_cust_ym_idx on public.cal_sum_cust(ym);

alter table public.cal_sum_item enable row level security;
alter table public.cal_sum_cust enable row level security;

do $$ begin
  create policy "cal_sum_item_select" on public.cal_sum_item
    for select using (public.app_role() in ('admin','editor','viewer'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "cal_sum_cust_select" on public.cal_sum_cust
    for select using (public.app_role() in ('admin','editor','viewer'));
exception when duplicate_object then null; end $$;

-- ---------- 3) دالة إعادة بناء الملخصات ----------
-- تُستدعى بمدى تواريخ (الشهور المتأثرة فقط) أو بلا مدى لإعادة بناء كل شيء.
create or replace function public.cal_refresh(d_from date default null, d_to date default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  m_from date := case when d_from is null then null else date_trunc('month', d_from)::date end;
  m_to   date := case when d_to   is null then null else date_trunc('month', d_to)::date end;
  n_item bigint; n_cust bigint;
begin
  -- الفحص يسري على المستخدمين المسجَّلين فقط. التنفيذ من SQL Editor (بلا JWT)
  -- يتم بصلاحية مالك المشروع أصلاً، فلا حاجة لحارس إضافي.
  if auth.uid() is not null and coalesce(public.app_role(),'') not in ('admin','editor') then
    raise exception 'غير مصرح — يلزم دور admin أو editor';
  end if;

  -- إعادة البناء قد تستغرق دقائق على ملايين السطور
  set local statement_timeout = '600s';

  delete from public.cal_sum_item
   where (m_from is null or ym >= m_from) and (m_to is null or ym <= m_to);

  insert into public.cal_sum_item
    (customer_code, item_code, ym, supplier, qty, sales, cost, profit, buys, first_date, last_date, est)
  select
    l.customer_code,
    l.item_code,
    date_trunc('month', l.doc_date)::date,
    coalesce(nullif(l.supplier,''), m.supplier,
             'مجموعة ' || coalesce(substring(l.item_code from '^[A-Za-z]+'), '؟')),
    sum(l.qty), sum(l.net_sales), sum(l.total_cost), sum(l.gross_profit),
    count(distinct l.doc_date) filter (where l.doc_type = 'فاتورة'),
    min(l.doc_date), max(l.doc_date),
    bool_or(l.cost_estimated)
  from public.cal_lines l
  left join public.cal_item_suppliers m on m.item_code = l.item_code
  where (m_from is null or l.doc_date >= m_from)
    and (m_to   is null or l.doc_date <  (m_to + interval '1 month'))
  group by 1,2,3,4;
  get diagnostics n_item = row_count;

  delete from public.cal_sum_cust
   where (m_from is null or ym >= m_from) and (m_to is null or ym <= m_to);

  insert into public.cal_sum_cust
    (customer_code, ym, sales, cost, profit, invoices, first_date, last_date)
  select
    l.customer_code,
    date_trunc('month', l.doc_date)::date,
    sum(l.net_sales), sum(l.total_cost), sum(l.gross_profit),
    count(distinct l.doc_no) filter (where l.doc_type = 'فاتورة'),
    min(l.doc_date), max(l.doc_date)
  from public.cal_lines l
  where (m_from is null or l.doc_date >= m_from)
    and (m_to   is null or l.doc_date <  (m_to + interval '1 month'))
  group by 1,2;
  get diagnostics n_cust = row_count;

  return format('تم تحديث الملخصات: %s صف أصناف · %s صف عملاء', n_item, n_cust);
end $$;

revoke all on function public.cal_refresh(date,date) from public;
grant execute on function public.cal_refresh(date,date) to authenticated;

-- ---------- 4) دوال القراءة — تقرأ من الملخصات (سريعة جداً) ----------
create or replace function public.cal_fn_customers(d_from date default null, d_to date default null)
returns table (
  customer_code text, customer_name text, salesperson text,
  items_count bigint, invoices_count bigint,
  first_date date, last_date date,
  sales numeric, cost numeric, profit numeric
)
language sql stable as $$
  with a as (
    select s.customer_code,
           sum(s.sales) sales, sum(s.cost) cost, sum(s.profit) profit,
           sum(s.invoices)::bigint invoices,
           min(s.first_date) fd, max(s.last_date) ld
    from public.cal_sum_cust s
    where (d_from is null or s.ym >= date_trunc('month', d_from)::date)
      and (d_to   is null or s.ym <= date_trunc('month', d_to)::date)
    group by 1
  ), b as (
    select i.customer_code, count(distinct i.item_code)::bigint items
    from public.cal_sum_item i
    where (d_from is null or i.ym >= date_trunc('month', d_from)::date)
      and (d_to   is null or i.ym <= date_trunc('month', d_to)::date)
    group by 1
  )
  select a.customer_code,
         c.customer_name,
         coalesce(r.salesperson,''),
         coalesce(b.items,0), a.invoices,
         a.fd, a.ld,
         a.sales, a.cost, a.profit
  from a
  left join b on b.customer_code = a.customer_code
  left join public.cal_customers c     on c.customer_code = a.customer_code
  left join public.cal_customer_reps r on r.customer_code = a.customer_code;
$$;

create or replace function public.cal_fn_customer_suppliers(d_from date default null, d_to date default null)
returns table (
  customer_code text, supplier text, items_count bigint,
  sales numeric, cost numeric, profit numeric, last_date date
)
language sql stable as $$
  select i.customer_code, i.supplier,
         count(distinct i.item_code)::bigint,
         sum(i.sales), sum(i.cost), sum(i.profit),
         max(i.last_date)
  from public.cal_sum_item i
  where (d_from is null or i.ym >= date_trunc('month', d_from)::date)
    and (d_to   is null or i.ym <= date_trunc('month', d_to)::date)
  group by 1,2;
$$;

-- ---------- 5) تحرير مساحة: فهارس لم تعد مستخدَمة على جدول السطور ----------
-- بعد اعتماد الملخصات، جدول السطور يُقرأ فقط عند إعادة البناء (بالتاريخ)
-- وعند حذف دفعة (بالـ upload_id). الفهرسان أدناه يستهلكان ~130MB لكل مليون سطر.
drop index if exists public.cal_lines_item_idx;
drop index if exists public.cal_lines_customer_idx;

-- ---------- 6) بناء الملخصات لأول مرة على البيانات الموجودة ----------
-- إن كانت البيانات ضخمة وتوقّف التنفيذ، نفّذها سنة بسنة:
--   select public.cal_refresh('2024-01-01','2024-12-31');
--   select public.cal_refresh('2025-01-01','2025-12-31');
-- تُنفَّذ في خطوة منفصلة (حتى لا يُلغى السكربت كله إن طالت):
--   select public.cal_refresh();
