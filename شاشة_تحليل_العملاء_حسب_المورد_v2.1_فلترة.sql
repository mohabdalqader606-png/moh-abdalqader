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
