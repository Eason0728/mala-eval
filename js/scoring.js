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

// 實際分數上限 100，不可超過；null/未計原樣回傳。
export const SCORE_CAP = 100;
export function capScore(v) {
  return (v === null || v === undefined) ? v : Math.min(round1(v), SCORE_CAP);
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

// ===== 考核等第 × 實領獎金發放基數 =====
// 依實際分數（滿分 100）判等第；未分配獎金回流公司當季盈餘。
export const GRADE_TABLE = [
  { grade: 'A', min: 85, base: 1, range: '85 分以上', baseText: '1（全額領取）' },
  { grade: 'B', min: 75, base: 0.7, range: '75 分 ~ 84 分', baseText: '0.7（領取七成）' },
  { grade: 'C', min: 65, base: 0.5, range: '65 分 ~ 74 分', baseText: '0.5（領取五成）' },
  { grade: 'D', min: 0, base: 0, range: '64 分以下', baseText: '0（不領取）' },
];
// 回傳 { grade, min, base, range, baseText }；分數為 null/未計 → null。
export function gradeFor(score) {
  if (score === null || score === undefined) return null;
  return GRADE_TABLE.find((g) => score >= g.min) || GRADE_TABLE[GRADE_TABLE.length - 1];
}

// 分數落點 → 時薪級距 index（計時用）。tiers：[[區間文字, 時薪], ...]（自試算表，區間自由文字，
// 如 '96 分以上'／'81～85 分'／'65 分以下'）。以「下限門檻」判定：回傳門檻 ≤ 分數且門檻最高那列；
// 分數 null 或無列 → -1。可容忍小數（85.5 落在 81～85）。
export function wageTierIndex(tiers, score) {
  if (score === null || score === undefined || !Array.isArray(tiers)) return -1;
  let best = -1;
  let bestLow = -Infinity;
  tiers.forEach((row, i) => {
    const s = String((row && row[0]) || '');
    const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    let low;
    if (/以下|以內/.test(s)) low = -Infinity;
    else if (/以上/.test(s)) low = nums.length ? nums[0] : -Infinity;
    else if (nums.length >= 2) low = Math.min(nums[0], nums[1]);
    else if (nums.length === 1) low = nums[0];
    else low = -Infinity;
    if (low <= score && low >= bestLow) { best = i; bestLow = low; }
  });
  return best;
}

// ===== 正職職能態度（滿分 30）=====
// 正職態度為 5 題、每題滿分 6（一顆星＝1.2 分）→ 滿分 30，與「態度佔 30%」一致。
// 計時態度為 6 題原始 1–5 分（滿分 30），不套用此係數。
// 不在此四捨五入：由顯示層 round1，確保細項與小計一致（線性）。
export const FT_ATTITUDE_STAR_FACTOR = 1.2;
export function ftAttitudeScale(v) {
  return v === null || v === undefined ? v : v * FT_ATTITUDE_STAR_FACTOR;
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
// 正職態度套 ftAttitudeScale（×1.2，滿分30；null 不套）；finalScore 一律套 capScore 封頂 100。
export function aggregateRatee({
  ratee, role, attitudeTotals = [], performanceTotals = [], supervisorPerf = null, adjustment = {},
}) {
  let attitude = averageTotals(attitudeTotals);
  if (attitude !== null && role === '正職') attitude = ftAttitudeScale(attitude);
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
    finalScore: capScore(score),
    attitudeCount: attitudeTotals.length,
    performanceCount: role === '正職' ? (supervisorPerf === null ? 0 : 1) : performanceTotals.length,
  };
}
