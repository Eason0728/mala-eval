import { APPS_SCRIPT_URL } from './config.js';

// ===== 示範模式（參觀帳號 test）：讀取回假資料、寫入不打後端 =====
// eval-page 於參觀登入後呼叫 setDemoData()＋setDemo(true)。因 ES module 為單例，
// admin-page 也共用同一份旗標與資料，故主管端一樣吃到假資料、且完全不寫入。
let _demo = false;
let _demoData = null;
export function setDemo(v) { _demo = !!v; }
export function isDemo() { return _demo; }
export function setDemoData(d) { _demoData = d; }

async function postJSON(payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 避開 CORS preflight
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('network');
  return res.json();
}

export async function fetchConfig() {
  const res = await fetch(`${APPS_SCRIPT_URL}?action=config`);
  if (!res.ok) throw new Error('network');
  return res.json();
}

export function login(account, password) {
  return postJSON({ type: 'login', account, password });
}
export function myScores(account, password) {
  if (_demo && _demoData) return Promise.resolve(_demoData.myScores);
  return postJSON({ type: 'myScores', account, password });
}
export function changePassword(account, oldPassword, newPassword) {
  return postJSON({ type: 'changePassword', account, oldPassword, newPassword });
}
// 示範模式：所有寫入一律不打後端，回 demo 讓呼叫端顯示「示範，不會儲存」。
function demoWrite() { return Promise.resolve({ ok: false, reason: 'demo' }); }
export function submitPeer(payload) { return _demo ? demoWrite() : postJSON(payload); }
export function submitSelf(payload) { return _demo ? demoWrite() : postJSON(payload); }
export function submitSupervisorPerf(payload) { return _demo ? demoWrite() : postJSON(payload); }
export function submitFtTemplate(payload) { return _demo ? demoWrite() : postJSON(payload); }
export function submitFtTitle(payload) { return _demo ? demoWrite() : postJSON(payload); }
export function submitAdjust(payload) { return _demo ? demoWrite() : postJSON(payload); }
export function submitSupervisorFeedback(payload) { return _demo ? demoWrite() : postJSON(payload); }
export function submitSaveResults(payload) { return _demo ? demoWrite() : postJSON(payload); }
export function submitClearResults(payload) { return _demo ? demoWrite() : postJSON(payload); }
export function changePasswordDemoGuard() { return _demo; }

export async function fetchAdminData(passcode, quarter) {
  if (_demo && _demoData) return _demoData.adminData; // 示範：任何通行碼都回假資料
  const url = `${APPS_SCRIPT_URL}?action=adminData`
    + `&passcode=${encodeURIComponent(passcode)}&quarter=${encodeURIComponent(quarter)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('network');
  return res.json();
}
