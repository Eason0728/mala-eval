// 新人入職考核：純函式（無 DOM／無網路），前端與 Node 測試共用。
// 規則（2026-09-03）：新進同仁到職滿一個月由「店長」單獨考核一次，題目與計時同仁相同
// （態度 6 題 30 分＋表現 14 題 70 分＝100 分）。考核完之後照常參加每季全員互評。
import { raterTotal, capScore } from './scoring.js';

// 起算日：到職日早於這一天的視為既有同仁，一律不觸發新人考核。
// 目的是讓「帳號」分頁日後補填全體同仁到職日（人事紀錄）時，不會整批冒出待考核。
// 設在 2026-08-01＝功能上線（2026-09-03）前一個月，剛入職還沒考核過的新人仍收得到。
// 要對更早入職的人補做，把這個日期往前調即可。
export const NEWBIE_SINCE = '2026-08-01';

// 只取年月日，避免時分秒與時區造成的一天誤差。
export function dayOnly(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 到職滿一個月的那天＝下個月同一日；該月沒有那一日（1/31→2月）時取當月最後一天。
export function dueDateOf(hireDate) {
  const d = dayOnly(hireDate);
  if (!d) return null;
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + 1, day);
  if (t.getDate() !== day) t.setDate(0); // 溢位（3/3）拉回當月月底（2/28）
  return t;
}

export function daysBetween(a, b) {
  return Math.round((dayOnly(b) - dayOnly(a)) / 86400000);
}

// 某位同仁此刻的新人考核狀態。
// hireDate 空／早於 NEWBIE_SINCE → 'none'（不是新人，不顯示）
// 已考核過 → 'done'；還沒滿月 → 'waiting'；滿月未填 → 'due'（overdueDays > 7 時 late=true）
export function newbieStatus({ hireDate, today = new Date(), done = false }) {
  const hire = dayOnly(hireDate);
  if (!hire) return { state: 'none' };
  if (hire < dayOnly(NEWBIE_SINCE)) return { state: 'none' };
  if (done) return { state: 'done', hire, dueOn: dueDateOf(hire) };
  const dueOn = dueDateOf(hire);
  const diff = daysBetween(dueOn, today); // 負數＝還沒到
  if (diff < 0) return { state: 'waiting', hire, dueOn, daysLeft: -diff };
  return { state: 'due', hire, dueOn, overdueDays: diff, late: diff > 7 };
}

// 待考核清單：只回 state==='due' 的人，逾期最久的排最前面（店長一眼看到最該補的）。
export function pendingList(accounts, doneNames, today = new Date()) {
  const done = new Set(doneNames || []);
  return (accounts || [])
    .map((a) => ({ ...a, ...newbieStatus({ hireDate: a.hireDate, today, done: done.has(a.name) }) }))
    .filter((a) => a.state === 'due')
    .sort((a, b) => b.overdueDays - a.overdueDays);
}

// 新人考核分數：單一評分者，直接加總（不平均），與計時同仁同一把尺。
// 任一題組沒填完（含 0 分）→ 該題組 null，總分 null。
export function newbieScore(attitude, performance) {
  const filled = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((v) => v > 0);
  const att = filled(attitude) ? raterTotal(attitude) : null;
  const perf = filled(performance) ? raterTotal(performance) : null;
  const total = att === null || perf === null ? null : capScore(att + perf);
  return { attitude: att, performance: perf, total };
}
