/* SELECT C."CardCode" FROM OCRD C WHERE C."CreateDate" < [%0] */
SELECT
    C."CardCode"                       AS "رمز العميل",
    C."CardName"                       AS "اسم العميل",
    S."SlpName"                        AS "المندوب",
    C."Phone1"                         AS "رقم الهاتف",
    C."E_Mail"                         AS "البريد الإلكتروني",
    C."CreditLine"                     AS "السقف الائتماني",
    IFNULL(TG."ExtraDays", 0)          AS "أيام السماح",

    IFNULL((
        SELECT SUM(J1."Debit" - J1."Credit")
        FROM JDT1 J1
        WHERE J1."ShortName" = C."CardCode" AND J1."ShortName" <> J1."Account"
          AND J1."RefDate" <= '[%0]'
    ), 0)                               AS "الرصيد حتى تاريخ اللقطة",

    IFNULL((
        SELECT SUM(K."CheckSum")
        FROM RCT1 K INNER JOIN ORCT R ON K."DocNum" = R."DocEntry"
        WHERE R."Canceled" = 'N' AND R."CardCode" = C."CardCode"
          AND R."DocDate" <= '[%0]' AND K."DueDate" > '[%0]'
    ), 0)                               AS "الشيكات المؤجلة",

    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-0
    ), 0)                                AS "M0 الشهر الحالي (حتى تاريخ اللقطة)",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-1
    ), 0)                                AS "M1 شهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-2
    ), 0)                                AS "M2 شهرين قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-3
    ), 0)                                AS "M3 3 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-4
    ), 0)                                AS "M4 4 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-5
    ), 0)                                AS "M5 5 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-6
    ), 0)                                AS "M6 6 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-7
    ), 0)                                AS "M7 7 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-8
    ), 0)                                AS "M8 8 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-9
    ), 0)                                AS "M9 9 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-10
    ), 0)                                AS "M10 10 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") = YEAR('[%0]')*12+MONTH('[%0]')-11
    ), 0)                                AS "M11 11 أشهر قبل",
    IFNULL((SELECT SUM(CASE WHEN X."Kind"='I' THEN X."Amt" ELSE -X."Amt" END)
        FROM (SELECT "CardCode","DocTotal" AS "Amt",'I' AS "Kind","DocDate" FROM OINV WHERE "CANCELED"='N'
              UNION ALL SELECT "CardCode","DocTotal",'R',"DocDate" FROM ORIN WHERE "CANCELED"='N') X
        WHERE X."CardCode"=C."CardCode" AND X."DocDate" <= '[%0]'
          AND YEAR(X."DocDate")*12+MONTH(X."DocDate") <= YEAR('[%0]')*12+MONTH('[%0]')-12
    ), 0)                                AS "M12plus أقدم من 12 شهر"

FROM "OCRD" C
LEFT JOIN "OSLP" S  ON C."SlpCode" = S."SlpCode"
LEFT JOIN "OCTG" TG ON C."GroupNum" = TG."GroupNum"
WHERE C."CardType" = 'C'
ORDER BY C."CardName"

