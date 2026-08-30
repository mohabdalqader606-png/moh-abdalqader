/* SELECT T0."RefDate" FROM JDT1 T0 WHERE T0."RefDate" BETWEEN [%0] AND [%1] */
SELECT
    T0."TransId"                       AS "رقم القيد",
    T0."RefDate"                       AS "تاريخ التحصيل",
    T0."DueDate"                       AS "تاريخ استحقاق الشيك (إن وجد)",
    T0."ShortName"                     AS "رمز العميل",
    C."CardName"                       AS "اسم العميل",
    S."SlpName"                        AS "المندوب",
    (T0."Credit" - T0."Debit")         AS "قيمة التحصيل",
    IFNULL(TG."ExtraDays", 0)          AS "أيام السماح",

    IFNULL((
        SELECT SUM(J1."Debit" - J1."Credit")
        FROM JDT1 J1
        WHERE J1."ShortName" = T0."ShortName" AND J1."ShortName" <> J1."Account"
          AND J1."RefDate" <= T0."RefDate" AND J1."TransId" <> T0."TransId"
    ), 0)                               AS "الرصيد قبل هذا التحصيل",

    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-0
    ), 0)                                AS "M0 الشهر الحالي (حتى يوم قبل التحصيل)",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-1
    ), 0)                                AS "M1 شهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-2
    ), 0)                                AS "M2 شهرين قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-3
    ), 0)                                AS "M3 3 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-4
    ), 0)                                AS "M4 4 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-5
    ), 0)                                AS "M5 5 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-6
    ), 0)                                AS "M6 6 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-7
    ), 0)                                AS "M7 7 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-8
    ), 0)                                AS "M8 8 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-9
    ), 0)                                AS "M9 9 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-10
    ), 0)                                AS "M10 10 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-11
    ), 0)                                AS "M11 11 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=T0."ShortName" AND X."DocDate" < T0."RefDate"
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") <= YEAR(T0."RefDate")*12+MONTH(T0."RefDate")-12
    ), 0)                                AS "M12plus أقدم من 12 شهر"

FROM "JDT1" T0
INNER JOIN "OCRD" C ON T0."ShortName" = C."CardCode" AND C."CardType"='C'
LEFT JOIN "OSLP" S ON C."SlpCode" = S."SlpCode"
LEFT JOIN "OCTG" TG ON C."GroupNum" = TG."GroupNum"
WHERE T0."TransType" = '24'
  AND T0."RefDate" BETWEEN '[%0]' AND '[%1]'
ORDER BY T0."ShortName", T0."RefDate"

