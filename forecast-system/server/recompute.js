const pool = require('../db/pool');
const { analyzeGroup, groupByPair } = require('./forecast');
const { getCalendarAndSettings } = require('./settingsStore');
const { isoDate, workingDaysBetween } = require('./workdays');

async function recomputeAll() {
  const { settings, cal } = await getCalendarAndSettings();
  const today = isoDate(new Date());

  const { rows } = await pool.query(
    'SELECT cust_code,cust_name,item_code,item_name,wd_date,qty,uom,rep,cust_category,item_category FROM withdrawals ORDER BY cust_code,item_code,wd_date'
  );
  const groups = groupByPair(rows);

  const { rows: prevForecasts } = await pool.query('SELECT cust_code,item_code,expected_date,expected_qty,last_wd_date FROM forecasts');
  const prevMap = new Map(prevForecasts.map((f) => [f.cust_code + '||' + f.item_code, f]));

  const client = await pool.connect();
  let accuracyLogged = 0;
  try {
    await client.query('BEGIN');
    for (const [key, g] of groups) {
      const prev = prevMap.get(key);
      if (prev && prev.expected_date) {
        const newEvents = g.events.filter((e) => e.date > prev.last_wd_date);
        if (newEvents.length) {
          const actual = newEvents[0];
          const { rows: exists } = await client.query(
            'SELECT 1 FROM accuracy_log WHERE cust_code=$1 AND item_code=$2 AND predicted_date=$3 AND actual_date=$4 LIMIT 1',
            [g.custCode, g.itemCode, prev.expected_date, actual.date]
          );
          if (!exists.length) {
            const errDays = workingDaysBetween(prev.expected_date, actual.date, cal);
            const errQtyPct = actual.qty ? Math.abs((+prev.expected_qty || 0) - actual.qty) / actual.qty * 100 : null;
            await client.query(
              `INSERT INTO accuracy_log(cust_code,item_code,cust_name,item_name,predicted_date,predicted_qty,actual_date,actual_qty,err_days,err_qty_pct)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [g.custCode, g.itemCode, g.custName, g.itemName, prev.expected_date, prev.expected_qty, actual.date, actual.qty, errDays, errQtyPct]
            );
            accuracyLogged++;
          }
        }
      }

      const a = analyzeGroup(g.events, today, cal, settings);
      await client.query(
        `INSERT INTO forecasts(cust_code,item_code,cust_name,item_name,rep,cust_category,item_category,uom,
           n_obs,last_wd_date,avg_interval,median_interval,cv_interval,avg_qty,median_qty,mad_qty,
           trend,rel_slope,dom_dow,dom_pct,seasonal_ok,expected_date,expected_qty,qty_low,qty_high,
           confidence,status,anomaly_dir,anomaly_z,days_since_last,overdue_wd,computed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,now())
         ON CONFLICT (cust_code,item_code) DO UPDATE SET
           cust_name=$3,item_name=$4,rep=$5,cust_category=$6,item_category=$7,uom=$8,n_obs=$9,last_wd_date=$10,
           avg_interval=$11,median_interval=$12,cv_interval=$13,avg_qty=$14,median_qty=$15,mad_qty=$16,
           trend=$17,rel_slope=$18,dom_dow=$19,dom_pct=$20,seasonal_ok=$21,expected_date=$22,expected_qty=$23,
           qty_low=$24,qty_high=$25,confidence=$26,status=$27,anomaly_dir=$28,anomaly_z=$29,days_since_last=$30,
           overdue_wd=$31,computed_at=now()`,
        [
          g.custCode, g.itemCode, g.custName, g.itemName, g.rep, g.custCategory, g.itemCategory, g.uom,
          a.n, a.last.date, a.avgInt, a.medInt, a.cvInt, a.avgQty, a.medQty, a.madQty,
          a.trend, a.relSlope, a.domDow, a.domPct, a.seasonalOk, a.expDate, a.expQty, a.qtyLow, a.qtyHigh,
          a.confidence, a.status, a.anomaly ? a.anomaly.dir : null, a.anomaly ? a.anomaly.z : null,
          a.daysSinceLast, a.overdueWD,
        ]
      );
    }
    // احذف توقعات لأزواج لم يعد لها بيانات سحب (نادر، لكن للسلامة)
    const activeKeys = [...groups.keys()];
    if (activeKeys.length) {
      await client.query(
        `DELETE FROM forecasts WHERE (cust_code||'||'||item_code) NOT IN (${activeKeys.map((_, i) => '$' + (i + 1)).join(',')})`,
        activeKeys
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { pairs: groups.size, accuracyLogged };
}

module.exports = { recomputeAll };
