/* SELECT T0."CreateDate" FROM OWDD T0 WHERE T0."CreateDate" BETWEEN [%0] AND [%1] */
SELECT
    T0."WddCode"                       AS "رقم طلب الموافقة",
    T0."CreateDate"                    AS "تاريخ طلب الموافقة",
    I."DocDate"                        AS "تاريخ الفاتورة",
    I."DocNum"                         AS "رقم الفاتورة",
    I."CardCode"                       AS "رمز العميل",
    I."CardName"                       AS "اسم العميل",
    I."DocTotal"                       AS "قيمة الفاتورة",
    IFNULL(I."ExtraDays", IFNULL(TG."ExtraDays", 0)) AS "أيام السماح",
    C."CreditLine"                     AS "السقف الائتماني",

    IFNULL((
        SELECT SUM(J1."Debit" - J1."Credit")
        FROM JDT1 J1 INNER JOIN OJDT J0 ON J1."TransId" = J0."TransId"
        WHERE J1."ShortName" = I."CardCode" AND J1."ShortName" <> J1."Account"
          AND J0."RefDate" <= I."DocDate" AND J1."TransId" <> I."TransId"
    ), 0)                               AS "الرصيد قبل الفاتورة",

    IFNULL((
        SELECT SUM(K."CheckSum")
        FROM RCT1 K INNER JOIN ORCT R ON K."DocNum" = R."DocEntry"
        WHERE R."Canceled" = 'N' AND R."CardCode" = I."CardCode"
          AND R."DocDate" < I."DocDate" AND K."DueDate" >= I."DocDate"
    ), 0)                               AS "الشيكات المؤجلة",

    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=I."CardCode" AND X."DocDate" < I."DocDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(I."DocDate")*12+MONTH(I."DocDate")-0
    ), 0)                                AS "M0 الشهر الحالي (حتى يوم قبل الفاتورة)",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=I."CardCode" AND X."DocDate" < I."DocDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(I."DocDate")*12+MONTH(I."DocDate")-1
    ), 0)                                AS "M1 شهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=I."CardCode" AND X."DocDate" < I."DocDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(I."DocDate")*12+MONTH(I."DocDate")-2
    ), 0)                                AS "M2 شهرين قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=I."CardCode" AND X."DocDate" < I."DocDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(I."DocDate")*12+MONTH(I."DocDate")-3
    ), 0)                                AS "M3 3 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=I."CardCode" AND X."DocDate" < I."DocDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(I."DocDate")*12+MONTH(I."DocDate")-4
    ), 0)                                AS "M4 4 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=I."CardCode" AND X."DocDate" < I."DocDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(I."DocDate")*12+MONTH(I."DocDate")-5
    ), 0)                                AS "M5 5 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=I."CardCode" AND X."DocDate" < I."DocDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(I."DocDate")*12+MONTH(I."DocDate")-6
    ), 0)                                AS "M6 6 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=I."CardCode" AND X."DocDate" < I."DocDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(I."DocDate")*12+MONTH(I."DocDate")-7
    ), 0)                                AS "M7 7 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=I."CardCode" AND X."DocDate" < I."DocDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(I."DocDate")*12+MONTH(I."DocDate")-8
    ), 0)                                AS "M8 8 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=I."CardCode" AND X."DocDate" < I."DocDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") <= YEAR(I."DocDate")*12+MONTH(I."DocDate")-9
    ), 0)                                AS "M9plus أقدم من 9 أشهر",

    CASE T0."Status" WHEN 'Y' THEN 'Approved' WHEN 'N' THEN 'Rejected' WHEN 'W' THEN 'Waiting' ELSE T0."Status" END AS "حالة الموافقة"

FROM "OWDD" T0
LEFT JOIN "OINV" I  ON T0."DocEntry" = I."DocEntry" AND T0."IsDraft" = 'N'
LEFT JOIN "OCRD" C  ON I."CardCode" = C."CardCode"
LEFT JOIN "OCTG" TG ON I."GroupNum" = TG."GroupNum"
WHERE T0."WtmCode" = 14   -- Aging Overdue2
  AND T0."CreateDate" BETWEEN '[%0]' AND '[%1]'
ORDER BY I."CardCode", I."DocDate"

