// 互評送出前驗證：回傳錯誤訊息陣列；空陣列代表通過。
export function validatePeerSubmission(ratings, ratees, itemCount) {
  const errors = [];
  const byRatee = new Map((ratings || []).map((r) => [r.ratee, r]));
  for (const ratee of ratees) {
    const r = byRatee.get(ratee);
    if (!r) {
      errors.push(`尚未幫「${ratee}」評分`);
      continue;
    }
    if (!Array.isArray(r.scores) || r.scores.length !== itemCount) {
      errors.push(`「${ratee}」的評分項目不完整`);
      continue;
    }
    for (const s of r.scores) {
      if (!Number.isInteger(s) || s < 1 || s > 5) {
        errors.push(`「${ratee}」有項目尚未打分或分數無效`);
        break;
      }
    }
  }
  return errors;
}
