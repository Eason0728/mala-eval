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

// 組合單一受評者完整結果。計時表現=正職互評平均；正職表現=主管單一評分。
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
