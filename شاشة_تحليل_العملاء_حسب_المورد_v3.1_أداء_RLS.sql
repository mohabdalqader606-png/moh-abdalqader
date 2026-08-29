-- ============================================================
-- ترقية v3.1 — إصلاح أداء سياسات الحماية (RLS)
--
-- المشكلة: السياسات مكتوبة بصيغة  using (public.app_role() in (...))
--          فتُستدعى الدالة لكل صف على حدة — أي مئات آلاف الاستدعاءات،
--          كل واحد يقرأ من جدول profiles ⇒ statement timeout.
--
-- الحل:   1) تعليم app_role() كـ STABLE حتى يسمح المخطِّط بتخزين نتيجتها.
--         2) تغليف الاستدعاء بـ (select ...) — نمط Supabase المعروف —
--            فيُقيَّم مرة واحدة كـ InitPlan بدل مرة لكل صف.
--
-- الأرقام والصلاحيات لا تتغير إطلاقاً — فقط طريقة التقييم.
-- ينفَّذ في SQL Editor. آمن التنفيذ أكثر من مرة.
-- ============================================================

-- ---------- 1) app_role() تُقيَّم مرة واحدة لكل استعلام ----------
alter function public.app_role() stable;

-- ---------- 2) إعادة كتابة السياسات بنمط (select ...) ----------

-- جداول الملخصات (الأهم — ملايين الصفوف تُقرأ منها)
drop policy if exists "cal_sum_item_select" on public.cal_sum_item;
create policy "cal_sum_item_select" on public.cal_sum_item
  for select using ((select public.app_role()) in ('admin','editor','viewer'));

drop policy if exists "cal_sum_cust_select" on public.cal_sum_cust;
create policy "cal_sum_cust_select" on public.cal_sum_cust
  for select using ((select public.app_role()) in ('admin','editor','viewer'));

-- جدول السطور الخام
drop policy if exists "cal_lines_select" on public.cal_lines;
create policy "cal_lines_select" on public.cal_lines
  for select using ((select public.app_role()) in ('admin','editor','viewer'));

drop policy if exists "cal_lines_insert" on public.cal_lines;
create policy "cal_lines_insert" on public.cal_lines
  for insert with check (
    (select public.app_role()) in ('admin','editor')
    and upload_id in (
      select u.id from public.cal_uploads u
      where (select public.app_role()) = 'admin' or u.created_by = (select auth.uid())
    )
  );

-- جداول الأبعاد
drop policy if exists "cal_items_select" on public.cal_items;
create policy "cal_items_select" on public.cal_items
  for select using ((select public.app_role()) in ('admin','editor','viewer'));
drop policy if exists "cal_items_write_ins" on public.cal_items;
create policy "cal_items_write_ins" on public.cal_items
  for insert with check ((select public.app_role()) in ('admin','editor'));
drop policy if exists "cal_items_write_upd" on public.cal_items;
create policy "cal_items_write_upd" on public.cal_items
  for update using ((select public.app_role()) in ('admin','editor'))
  with check ((select public.app_role()) in ('admin','editor'));

drop policy if exists "cal_customers_select" on public.cal_customers;
create policy "cal_customers_select" on public.cal_customers
  for select using ((select public.app_role()) in ('admin','editor','viewer'));
drop policy if exists "cal_customers_write_ins" on public.cal_customers;
create policy "cal_customers_write_ins" on public.cal_customers
  for insert with check ((select public.app_role()) in ('admin','editor'));
drop policy if exists "cal_customers_write_upd" on public.cal_customers;
create policy "cal_customers_write_upd" on public.cal_customers
  for update using ((select public.app_role()) in ('admin','editor'))
  with check ((select public.app_role()) in ('admin','editor'));

-- الدفعات
drop policy if exists "cal_uploads_select" on public.cal_uploads;
create policy "cal_uploads_select" on public.cal_uploads
  for select using ((select public.app_role()) in ('admin','editor','viewer'));
drop policy if exists "cal_uploads_insert" on public.cal_uploads;
create policy "cal_uploads_insert" on public.cal_uploads
  for insert with check ((select public.app_role()) in ('admin','editor') and created_by = (select auth.uid()));
drop policy if exists "cal_uploads_delete" on public.cal_uploads;
create policy "cal_uploads_delete" on public.cal_uploads
  for delete using (
    (select public.app_role()) = 'admin'
    or ((select public.app_role()) = 'editor' and created_by = (select auth.uid()))
  );

-- خرائط الموردين والمندوبين
drop policy if exists "cal_item_suppliers_select" on public.cal_item_suppliers;
create policy "cal_item_suppliers_select" on public.cal_item_suppliers
  for select using ((select public.app_role()) in ('admin','editor','viewer'));
drop policy if exists "cal_item_suppliers_write_ins" on public.cal_item_suppliers;
create policy "cal_item_suppliers_write_ins" on public.cal_item_suppliers
  for insert with check ((select public.app_role()) in ('admin','editor'));
drop policy if exists "cal_item_suppliers_write_upd" on public.cal_item_suppliers;
create policy "cal_item_suppliers_write_upd" on public.cal_item_suppliers
  for update using ((select public.app_role()) in ('admin','editor'))
  with check ((select public.app_role()) in ('admin','editor'));
drop policy if exists "cal_item_suppliers_write_del" on public.cal_item_suppliers;
create policy "cal_item_suppliers_write_del" on public.cal_item_suppliers
  for delete using ((select public.app_role()) in ('admin','editor'));

drop policy if exists "cal_customer_reps_select" on public.cal_customer_reps;
create policy "cal_customer_reps_select" on public.cal_customer_reps
  for select using ((select public.app_role()) in ('admin','editor','viewer'));
drop policy if exists "cal_customer_reps_write_ins" on public.cal_customer_reps;
create policy "cal_customer_reps_write_ins" on public.cal_customer_reps
  for insert with check ((select public.app_role()) in ('admin','editor'));
drop policy if exists "cal_customer_reps_write_upd" on public.cal_customer_reps;
create policy "cal_customer_reps_write_upd" on public.cal_customer_reps
  for update using ((select public.app_role()) in ('admin','editor'))
  with check ((select public.app_role()) in ('admin','editor'));
drop policy if exists "cal_customer_reps_write_del" on public.cal_customer_reps;
create policy "cal_customer_reps_write_del" on public.cal_customer_reps
  for delete using ((select public.app_role()) in ('admin','editor'));

-- ---------- 3) إحصاءات محدَّثة للمخطِّط بعد بناء الملخصات ----------
analyze public.cal_sum_item;
analyze public.cal_sum_cust;
