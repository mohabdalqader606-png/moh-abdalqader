/* ============================================================
   الكويري ٢ — الشيكات التفصيلي (اختياري لكن موصى به للدقة)
   نتيجته تُلصق بالمربع الاختياري تحت "➕" بالشاشة
   ============================================================ */

SELECT
    R."CardCode" AS "رمز العميل",
    R."DocNum"   AS "رقم السند",
    R."DocDate"  AS "تاريخ تسجيل السند",
    K."DueDate"  AS "تاريخ الاستحقاق",
    K."CheckSum" AS "قيمة الشيك",
    K."BankCode" AS "البنك"
FROM RCT1 K
INNER JOIN ORCT R ON K."DocNum" = R."DocEntry"
WHERE R."Canceled" = 'N'
ORDER BY R."CardCode", K."DueDate"
