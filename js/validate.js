// 互評送出前檢查：把每位受評者分成「已評完」與「未評完」兩組。
// 只有已評完的會被送出計入；未評完名單用於送出前的確認提醒（2026-07 起不再強制評完所有人）。
function validScores(arr, n) {
  return Array.isArray(arr) && arr.length === n
    && arr.every((s) => Number.isInteger(s) && s >= 1 && s <= 5);
}

// ratings: [{ ratee, attitude:number[], performance:number[]|null }]
// ctx: { ratees:[{name,role}], raterRole, attitudeCounts:{計時,正職}, perfCounts:{計時} }
export function splitPeerSubmission(ratings, ctx) {
  const byRatee = new Map((ratings || []).map((r) => [r.ratee, r]));
  const complete = [];
  const incomplete = [];
  for (const { name, role } of ctx.ratees) {
    const r = byRatee.get(name);
    const needPerf = role === '計時'; // 計時的表現全員互評（2026-07 起）
    const done = !!r && validScores(r.attitude, ctx.attitudeCounts[role])
      && (!needPerf || validScores(r.performance, ctx.perfCounts['計時']));
    if (done) complete.push(r);
    else incomplete.push(name);
  }
  return { complete, incomplete };
}
