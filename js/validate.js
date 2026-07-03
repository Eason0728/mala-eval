// 互評送出前驗證：回傳錯誤訊息陣列；空陣列代表通過。
function validScores(arr, n) {
  return Array.isArray(arr) && arr.length === n
    && arr.every((s) => Number.isInteger(s) && s >= 1 && s <= 5);
}

// ratings: [{ ratee, attitude:number[], performance:number[]|null }]
// ctx: { ratees:[{name,role}], raterRole, attitudeCounts:{計時,正職}, perfCounts:{計時} }
export function validatePeerSubmission(ratings, ctx) {
  const errors = [];
  const byRatee = new Map((ratings || []).map((r) => [r.ratee, r]));
  for (const { name, role } of ctx.ratees) {
    const r = byRatee.get(name);
    if (!r) { errors.push(`尚未幫「${name}」評分`); continue; }
    if (!validScores(r.attitude, ctx.attitudeCounts[role])) {
      errors.push(`「${name}」的態度評分尚未完成`);
    }
    const needPerf = role === '計時'; // 計時的表現全員互評（2026-07 起）
    if (needPerf && !validScores(r.performance, ctx.perfCounts['計時'])) {
      errors.push(`「${name}」的表現評分尚未完成`);
    }
  }
  return errors;
}
