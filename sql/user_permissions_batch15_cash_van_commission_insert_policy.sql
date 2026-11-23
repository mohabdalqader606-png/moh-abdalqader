-- ============================================================================
-- USER & PERMISSIONS — BATCH 15: إصلاح RLS لـ cvcomm_state (سياسة INSERT ناقصة)
-- ============================================================================
-- هذا الملف SQL جاهز للتشغيل اليدوي على Supabase SQL Editor فقط.
--
-- المشكلة: استدعاء upsert() من مكتبة supabase-js (المستخدم بزر الحفظ بالشاشة)
-- يُنفَّذ فعلياً كأمر INSERT ... ON CONFLICT DO UPDATE — وRLS بتقيّم سياسة
-- INSERT على أي أمر من هذا النوع بغض النظر إن كانت النتيجة الفعلية تحديثاً
-- (ON CONFLICT) أم إدراجاً جديداً. batch 14 أنشأ سياسة select وسياسة update
-- فقط، فما في أي سياسة INSERT تسمح بالعملية — فكانت كل محاولة حفظ ترجع:
-- "new row violates row-level security policy for table cvcomm_state"
-- حتى مع صلاحية ADMIN/INPUT فعلية ومع إن الصف الوحيد (id=1) أصلاً موجود
-- وبيتحدّث فقط. هذا الملف يضيف سياسة INSERT بنفس شرط سياسة التحديث.
-- ============================================================================

drop policy if exists cvcomm_state_insert on public.cvcomm_state;
create policy cvcomm_state_insert on public.cvcomm_state
  for insert with check (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cashvan-commission'
                 and u.permission in ('INPUT','ADMIN'))
  );
