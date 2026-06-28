// 唯一計分來源：純函式，無 DOM／無網路。前端與 Node 測試共用。

// 同一位受評者的多筆互評（每筆長度 6）→ 每項平均（長度 6）；無互評回 null。
export function averageItemScores(scoresList) {
  if (!scoresList || scoresList.length === 0) return null;
  const n = scoresList[0].length;
  const sums = new Array(n).fill(0);
  for (const scores of scoresList) {
    for (let i = 0; i < n; i++) sums[i] += scores[i];
  }
  return sums.map((s) => s / scoresList.length);
}

// 六項平均加總（0..30）；輸入 null 回 null。
export function attitudeScore(itemAverages) {
  if (itemAverages === null) return null;
  return itemAverages.reduce((a, b) => a + b, 0);
}

// 四捨五入到小數 1 位。
export function round1(n) {
  return Math.round(n * 10) / 10;
}

// 最終小計：態度 null → null；職能 null（第一階段）→ 只計態度；皆有 → 相加。
export function finalSubtotal({ attitude, attitudeAdjust = 0, competency = null, competencyAdjust = 0 }) {
  if (attitude === null || attitude === undefined) {
    return { subtotal: null, competencyCounted: false };
  }
  const attitudePart = attitude + attitudeAdjust;
  if (competency === null || competency === undefined) {
    return { subtotal: attitudePart, competencyCounted: false };
  }
  return { subtotal: attitudePart + competency + competencyAdjust, competencyCounted: true };
}

// 時薪查表：null→資料不足；命中 band→ok；表外→需人工確認。
export function lookupWage(total, wageTable) {
  if (total === null || total === undefined) return { status: 'insufficient' };
  for (const band of wageTable) {
    if (total >= band.min && total <= band.max) return { status: 'ok', wage: band.wage };
  }
  return { status: 'manual' };
}

// 組合單一同仁的完整評鑑結果。
export function aggregateRatee({ ratee, scoresList, adjustment = {}, wageTable }) {
  const itemAverages = averageItemScores(scoresList);
  const attitude = attitudeScore(itemAverages);
  const attitudeAdjust = adjustment.attitudeAdjust ?? 0;
  const competency = adjustment.competency ?? null;
  const competencyAdjust = adjustment.competencyAdjust ?? 0;
  const { subtotal, competencyCounted } = finalSubtotal({
    attitude, attitudeAdjust, competency, competencyAdjust,
  });
  return {
    ratee,
    responseCount: scoresList ? scoresList.length : 0,
    itemAverages,
    attitude,
    attitudeAdjust,
    competency,
    competencyAdjust,
    subtotal,
    competencyCounted,
    wage: lookupWage(subtotal, wageTable),
  };
}
