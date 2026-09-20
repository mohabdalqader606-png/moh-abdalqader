# AUDIT_EVIDENCE_EXAMPLE.md — Decision Evidence, a real captured example (P0-B)

This is a real evidence record and a real override event, both captured by actually running
`EVIDENCE.runForMaterialItems()` and `planSetQty()` against the live engine with a small
synthetic fixture (item `OIL-1L`, supplier `S-TR-01`, 6 months of stable 950/month demand, 320
units on hand, MOQ 500) — not hand-written. The generating script is not committed (it was a
throwaway one-off to produce this document); the same data can be reproduced by importing the
same fixture shape used throughout `decision-evidence.spec.js`. **`OIL-1L` and `S-TR-01` are
synthetic test data, not a real مركز الكيلاني item or supplier.**

## Conceptual structure (per P0-B item 18)

```
DECISION
├── Decision ID        mua3x0l1rmv0qg_OIL-1L
├── Run ID              mua3x0l1rmv0qg
├── Actor                test-user-id / "Test ADMIN"
├── Timestamp            1789926321206  (decisionTimestamp, epoch ms)
├── Engine Version       1.3.0-DECISION-EVIDENCE
├── Rule Version          ruleVersion.tunable (12 named constants, snapshotted)
├── Input Snapshot
│   ├── Demand            950/month, 6-month series, MEDIUM confidence, no excluded months
│   ├── Inventory         320 available, 320 physical
│   ├── Open PO           0 confirmed, 0 unconfirmed
│   ├── Supplier          S-TR-01 · الشركة التركية للأغذية
│   ├── Lead Time         18 days, source=supplier_master
│   ├── MOQ                500
│   └── Order Multiple     null (none official; no purchase-pattern fallback either, here)
├── Intermediate Calculations
│   ├── dailyDemand          31.21
│   ├── leadTimeDemand       561.82
│   ├── safetyStockQty       218.49  (7 days × dailyDemand)
│   ├── buyingHorizonDays    25      (18 lead + 7 buffer)
│   ├── targetStockLevel     780.31
│   ├── netRequirement       460.31
│   └── quantityRoundedFromNetRequirement  true  (500 ≠ 460.31 — MOQ rounded it up)
├── Final Recommendation   ORDER_SOON, qty 500
├── Priority                3
├── Confidence              MEDIUM
└── Fingerprint             9c486e903a40d9625be3c00eb126f3a33c36f618b6b23159b9f157408c7480ff
```

## The actual stored record (`decisionEvidence`)

```json
{
  "decisionId": "mua3x0l1rmv0qg_OIL-1L",
  "runId": "mua3x0l1rmv0qg",
  "itemCode": "OIL-1L",
  "decisionType": "RECOMMENDATION",
  "decisionTimestamp": 1789926321206,
  "actorId": "test-user-id",
  "actorName": "Test ADMIN",
  "engineVersion": "1.3.0-DECISION-EVIDENCE",
  "ruleVersion": {
    "tunable": {
      "expiryNearDays": 30, "expiryMidDays": 90, "quotationWeight": 0.3,
      "outlierLowRatio": 0.35, "outlierHighRatio": 2.6, "defaultLeadTimeDays": 30,
      "serviceBufferDays": 7, "minCoverageDaysCritical": 7, "minCoverageDaysSoon": 21,
      "overstockCoverageMonths": 6, "deadStockMonthsNoSale": 6, "slowStockCoverageMonths": 3
    }
  },
  "inputSnapshot": {
    "itemCode": "OIL-1L", "itemName": "OIL-1L", "itemGroup": null,
    "supplier": { "code": "S-TR-01", "name": "الشركة التركية للأغذية" },
    "salesHistoryReference": {
      "series": [
        {"month":"2026-03","qty":950}, {"month":"2026-04","qty":950}, {"month":"2026-05","qty":950},
        {"month":"2026-06","qty":950}, {"month":"2026-07","qty":950}, {"month":"2026-08","qty":950}
      ],
      "excludedMonths": []
    },
    "demandPeriod": { "months": 6, "from": "2026-03", "to": "2026-08" },
    "demandRaw": 950, "demandAdjusted": 950, "demandConfidence": "MEDIUM",
    "leadTime": { "days": 18, "source": "supplier_master", "label": "من كشف الموردين (يدوي)" },
    "onHandAvailable": 320, "onHandPhysical": 320,
    "effectiveOnOrder": 0, "unconfirmedOnOrder": 0,
    "openSalesOrders": 0, "openQuotations": 0, "quotationWeight": 0.3,
    "moq": 500, "orderMultiple": null, "orderMultipleSource": null,
    "purchasePattern": null
  },
  "intermediateSnapshot": {
    "dailyDemand": 31.212216790201335, "leadTimeDemand": 561.819902223624,
    "safetyStockDays": 7, "safetyStockQty": 218.48551753140936,
    "buyingHorizonDays": 25, "targetStockLevel": 780.3054197550334,
    "availablePosition": 320, "effectiveOnOrder": 0,
    "netRequirement": 460.3054197550334, "finalRecommendedQty": 500,
    "quantityRoundedFromNetRequirement": true
  },
  "outputSnapshot": {
    "status": "ORDER_SOON", "recommendedQty": 500, "priority": 3, "confidence": "MEDIUM",
    "exceptionStatus": "NORMAL", "supplier": "S-TR-01",
    "reasons": [
      {"k":"المخزون المتاح الحالي","v":"320"},
      {"k":"إجمالي المخزون الفعلي (قبل استبعاد المستودعات الخاصة)","v":"320"},
      {"k":"الطلب الشهري المعدَّل","v":"950.0"},
      {"k":"بالطريق (توريد مؤكد)","v":"0"},
      {"k":"مدة توريد المورد","v":"18 يوم — من كشف الموردين (يدوي)"},
      {"k":"تغطية المخزون الحالية","v":"10.3 يوم"}
    ],
    "narrative": [
      "تغطية مخزون منخفضة مقابل معدل الطلب الحالي",
      "لا يوجد توريد قادم مؤكد بالطريق",
      "مدة توريد المورد 18 يوم — يجب الطلب الآن لتغطية فترة الانتظار"
    ]
  },
  "fingerprint": "9c486e903a40d9625be3c00eb126f3a33c36f618b6b23159b9f157408c7480ff"
}
```

**Reading it as an auditor would**: *"Why did the system recommend 500 units of OIL-1L?"* — because
demand was a stable 950/month (6 months, no exclusions, MEDIUM confidence), lead time was 18 days
from the supplier master, the buffer added 7 more days (25-day buying horizon), giving a target
stock level of 780.3 against 320 on hand and nothing incoming — a net requirement of 460.3 units,
which MOQ 500 then rounded up to the final 500. Every number in that sentence is a field in the
record above, not a reconstruction from memory or from today's (possibly since-changed) `CONFIG.tunable`.

## An override on top of it (`decisionOverrides`)

The buyer decided the true need was higher (a promotion, a known upcoming shortage — the `reason`
field exists for exactly this and was simply not filled in through this test path) and set the
plan quantity to 1,200 via the existing Purchase Plan quantity field. That is captured as a
**separate, linked event** — the original decision above is untouched:

```json
{
  "overrideId": "mua3x0m0fow442",
  "decisionId": "mua3x0l1rmv0qg_OIL-1L",
  "itemCode": "OIL-1L",
  "overrideTimestamp": 1789926321240,
  "actorId": "test-user-id",
  "actorName": "Test ADMIN",
  "originalStatus": "DECISION_FOUND",
  "originalQty": 500,
  "originalFingerprint": "9c486e903a40d9625be3c00eb126f3a33c36f618b6b23159b9f157408c7480ff",
  "overrideQty": 1200,
  "reason": null
}
```

`originalFingerprint` ties this override to the *exact* evidence state it overrode — if the
original decision record were ever tampered with or accidentally mutated, recomputing its
fingerprint from its current stored content would no longer match `originalFingerprint` here,
which is precisely the tamper-detection property item 10 asked for.

## If no prior evidence exists

If a buyer overrides an item's quantity but the engine was never run since P0-B was deployed (so
no `decisionEvidence` record exists yet for that item), the override is still captured — honestly:

```json
{
  "originalStatus": "NO_PRIOR_EVIDENCE",
  "originalQty": null,
  "originalFingerprint": null,
  "overrideQty": 55
}
```

No original decision is fabricated to fill that gap — see `decision-evidence.spec.js`'s `DE-12b`.

## Historical immutability, demonstrated

`decision-evidence.spec.js`'s `DE-11` is the executable version of this: it builds evidence for
an item (capturing `ruleVersion.tunable.serviceBufferDays: 7`), then mutates
`CONFIG.tunable.serviceBufferDays` to `99` and re-runs the engine. The **original** decision
record, re-read from IndexedDB by its exact `decisionId`, still shows `serviceBufferDays: 7` and
its original fingerprint — only the **new** decision (a new `decisionId`, from a new run) reflects
`99`. That test passes today; it is the permanent, automated form of this document's claim.
