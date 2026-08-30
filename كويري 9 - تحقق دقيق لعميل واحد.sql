/* SELECT T0."RefDate" FROM JDT1 T0 WHERE T0."RefDate" BETWEEN [%0] AND [%1] */
-- كويري تحقق دقيق لعميل واحد فقط (بديل استخدام: غيّر رمز العميل بالسطر المعلّم أدناه)
-- ياخذ القيود اليدوية والشيكات بعين الاعتبار فعلياً حسب ترتيبها الزمني الحقيقي
SELECT
    W."رقم القيد",
    W."تاريخ الحركة",
    W."نوع الحركة",
    W."تصنيف الحركة",
    W."الحساب المقابل",
    W."مبلغ الحركة الكامل",
    W."شهر الفواتير المخصص له",
    W."المبلغ المخصص لهذا الشهر",
    W."تاريخ نهاية شهر الفواتير",
    W."تاريخ استحقاق الحركة (خام)",
    DAYS_BETWEEN(W."تاريخ نهاية شهر الفواتير", W."تاريخ_للاحتساب") AS "عدد أيام التحصيل"
FROM (
    SELECT
        PMT."TransId"        AS "رقم القيد",
        PMT."RefDate"        AS "تاريخ الحركة",
        PMT."TransType"      AS "نوع الحركة",
        CASE
            WHEN PMT."TransType" = '24' THEN 'قبض (نقد/شيك)'
            WHEN PMT."ContraAct" LIKE 'V%' THEN 'مقاصة مع مورد'
            ELSE 'تسوية / تعديل'
        END AS "تصنيف الحركة",
        PMT."ContraAct"      AS "الحساب المقابل",
        PMT."Amount"         AS "مبلغ الحركة الكامل",
        TO_VARCHAR(SM."SalesMonth", 'YYYY-MM') AS "شهر الفواتير المخصص له",
        (CASE WHEN PMT."Amount" >= 0 THEN 1 ELSE -1 END) *
        GREATEST(
            LEAST(GREATEST(PMT."PrevCumPayment", PMT."CumPayment"), SM."CumSales")
            - GREATEST(LEAST(PMT."PrevCumPayment", PMT."CumPayment"), SM."PrevCumSales"),
            0
        ) AS "المبلغ المخصص لهذا الشهر",
        LAST_DAY(SM."SalesMonth") AS "تاريخ نهاية شهر الفواتير",
        PMT."DueDate" AS "تاريخ استحقاق الحركة (خام)",
        CASE
            WHEN PMT."TransType" = '24' AND PMT."DueDate" IS NOT NULL AND PMT."DueDate" >= PMT."RefDate" THEN PMT."DueDate"
            WHEN PMT."TransType" = '24' THEN PMT."RefDate"
            ELSE NULL
        END AS "تاريخ_للاحتساب"
    FROM (
        SELECT
            X."TransId", X."Line_ID", X."RefDate", X."DueDate", X."TransType", X."ContraAct", X."Amount",
            SUM(X."Amount") OVER (ORDER BY X."RefDate", X."TransId", X."Line_ID" ROWS UNBOUNDED PRECEDING) AS "CumPayment",
            SUM(X."Amount") OVER (ORDER BY X."RefDate", X."TransId", X."Line_ID" ROWS UNBOUNDED PRECEDING) - X."Amount" AS "PrevCumPayment"
        FROM (
            SELECT T0."TransId", T0."Line_ID", T0."RefDate", T0."DueDate", T0."TransType", T0."ContraAct",
                   (T0."Credit" - T0."Debit") AS "Amount"
            FROM "KAYLANI_LIVE"."JDT1" T0
            WHERE T0."ShortName" = 'C0001456'   -- ⬅⬅⬅ غيّر رمز العميل هون
              AND T0."TransType" NOT IN ('13','14')
        ) X
    ) PMT
    INNER JOIN (
        SELECT
            Y."SalesMonth", Y."NetSales",
            SUM(Y."NetSales") OVER (ORDER BY Y."SalesMonth" ROWS UNBOUNDED PRECEDING) AS "CumSales",
            SUM(Y."NetSales") OVER (ORDER BY Y."SalesMonth" ROWS UNBOUNDED PRECEDING) - Y."NetSales" AS "PrevCumSales"
        FROM (
            SELECT
                TO_DATE(TO_VARCHAR(T0."RefDate", 'YYYY-MM') || '-01', 'YYYY-MM-DD') AS "SalesMonth",
                SUM(T0."Debit" - T0."Credit") AS "NetSales"
            FROM "KAYLANI_LIVE"."JDT1" T0
            WHERE T0."ShortName" = 'C0001456'   -- ⬅⬅⬅ ونفس رمز العميل هون كمان
              AND T0."TransType" IN ('13','14')
            GROUP BY TO_DATE(TO_VARCHAR(T0."RefDate", 'YYYY-MM') || '-01', 'YYYY-MM-DD')
        ) Y
    ) SM
    ON LEAST(PMT."PrevCumPayment", PMT."CumPayment") < SM."CumSales"
    AND GREATEST(PMT."PrevCumPayment", PMT."CumPayment") > SM."PrevCumSales"
) W
WHERE W."المبلغ المخصص لهذا الشهر" <> 0
ORDER BY W."تاريخ الحركة", W."شهر الفواتير المخصص له"
