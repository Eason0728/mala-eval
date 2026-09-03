// 共用的介面小工具。

// 慢動作按鈕：按下後顯示「進行中＋已等待幾秒」，並鎖住避免重複點。
// 打後端要 2～4 秒，如果只把按鈕變灰、文字不變，畫面看起來像當機沒反應（Eason 2026-09-03 指定）。
// 用法：const done = btnWaiting(btn, '儲存中…');  … done();
//   done()      → 恢復原文字並可再按
//   done(false) → 恢復文字但維持不可按（例如一季只能送一次，已送出成功）
// 任何結束路徑都要呼叫 done()，否則計時器會留著沒清掉。
export function btnWaiting(btn, label) {
  if (!btn) return () => {};
  const original = btn.dataset.origLabel || btn.textContent;
  btn.dataset.origLabel = original;
  btn.disabled = true;
  let sec = 0;
  const paint = () => { btn.textContent = sec ? `${label} ${sec} 秒` : label; };
  paint();
  const timer = setInterval(() => { sec += 1; paint(); }, 1000);
  return (restore = true) => {
    clearInterval(timer);
    btn.textContent = original;
    if (restore) btn.disabled = false;
  };
}
