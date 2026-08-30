-- كويري تحقق مستقل: إجمالي رصيد كل العملاء الفعلي من دفتر الأستاذ مباشرة
-- (نفس الطريقة المثبتة والمستخدمة بكويري 1 و3 من أول المحادثة)
SELECT
    SUM(J1."Debit" - J1."Credit") AS "إجمالي رصيد كل العملاء (الحقيقي)"
FROM "KAYLANI_LIVE"."JDT1" J1
INNER JOIN "KAYLANI_LIVE"."OCRD" C ON J1."ShortName" = C."CardCode" AND C."CardType"='C'
WHERE J1."ShortName" <> J1."Account"
