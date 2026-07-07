// 唯一計分來源：純函式，無 DOM／無網路。前端與 Node 測試共用。

// 單一評核者對某題組各題分數的總分；空回 null。
export function raterTotal(scores) {
  if (!scores || scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0);
}

// 多位評核者總分取平均；空回 null。
export function averageTotals(totalsList) {
  if (!totalsList || totalsList.length === 0) return null;
  return totalsList.reduce((a, b) => a + b, 0) / totalsList.length;
}

// 多位評核者的每題分數 → 每題平均（長度同題數）；空回 null。
// 註：每題平均加總 === averageTotals（線性），故細項與小計一致。
export function averageItems(scoresList) {
  if (!scoresList || scoresList.length === 0) return null;
  const n = scoresList[0].length;
  const sums = new Array(n).fill(0);
  for (const s of scoresList) for (let i = 0; i < n; i++) sums[i] += s[i];
  return sums.map((x) => x / scoresList.length);
}

// 四捨五入到小數 1 位。
export function round1(n) {
  return Math.round(n * 10) / 10;
}

// 實際分數：態度 null → null；表現 null → 只計態度；皆有 → 相加。皆含 ± 調整。
export function finalScore({ attitude, attitudeAdjust = 0, performance = null, performanceAdjust = 0 }) {
  if (attitude === null || attitude === undefined) {
    return { score: null, performanceCounted: false };
  }
  const attitudePart = attitude + attitudeAdjust;
  if (performance === null || performance === undefined) {
    return { score: attitudePart, performanceCounted: false };
  }
  return { score: attitudePart + performance + performanceAdjust, performanceCounted: true };
}

// ===== 正職職能表現（加權 KPI）=====
// 技能項：等級 A/B/C/D = 100/80/60/40%，得分 = 比重 × %。
// 執行力項：完成 = 比重全拿（100%）、未完成 = 0。
export const KPI_SKILL_FACTOR = { A: 1, B: 0.8, C: 0.6, D: 0.4 };

// item: { key, weight, type:'技能'|'執行力' }；sel：技能為 'A'|'B'|'C'|'D'、執行力為 '完成'|'未完成'。
// 未選/無效回 null（代表該項未評）。
export function kpiItemScore(item, sel) {
  const w = Number(item.weight) || 0;
  if (item.type === '執行力') {
    if (sel === '完成') return w;
    if (sel === '未完成') return 0;
    return null;
  }
  const f = KPI_SKILL_FACTOR[sel];
  return f === undefined ? null : round1(w * f);
}

// items 依序；selByKey：{ itemKey: sel }。任一項未評 → 回 null（整體未計）。
export function kpiTotal(items, selByKey) {
  if (!items || !items.length) return null;
  const sels = selByKey || {};
  let total = 0;
  for (const it of items) {
    const s = kpiItemScore(it, sels[it.key]);
    if (s === null) return null;
    total += s;
  }
  return round1(total);
}

// 組合單一受評者完整結果。計時表現=全員互評平均；正職表現=主管單一評分。
export function aggregateRatee({
  ratee, role, attitudeTotals = [], performanceTotals = [], supervisorPerf = null, adjustment = {},
}) {
  const attitude = averageTotals(attitudeTotals);
  const performance = role === '正職' ? supervisorPerf : averageTotals(performanceTotals);
  const attitudeAdjust = adjustment.attitudeAdjust ?? 0;
  const performanceAdjust = adjustment.performanceAdjust ?? 0;
  const { score, performanceCounted } = finalScore({
    attitude, attitudeAdjust, performance, performanceAdjust,
  });
  return {
    ratee, role,
    attitude, attitudeAdjust,
    performance, performanceAdjust,
    performanceCounted,
    finalScore: score,
    attitudeCount: attitudeTotals.length,
    performanceCount: role === '正職' ? (supervisorPerf === null ? 0 : 1) : performanceTotals.length,
  };
}
