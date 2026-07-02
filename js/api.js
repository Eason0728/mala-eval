import { APPS_SCRIPT_URL } from './config.js';

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
  return postJSON({ type: 'myScores', account, password });
}
export function changePassword(account, oldPassword, newPassword) {
  return postJSON({ type: 'changePassword', account, oldPassword, newPassword });
}
export function submitPeer(payload) { return postJSON(payload); }
export function submitSelf(payload) { return postJSON(payload); }
export function submitSupervisorPerf(payload) { return postJSON(payload); }
export function submitAdjust(payload) { return postJSON(payload); }

export async function fetchAdminData(passcode, quarter) {
  const url = `${APPS_SCRIPT_URL}?action=adminData`
    + `&passcode=${encodeURIComponent(passcode)}&quarter=${encodeURIComponent(quarter)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('network');
  return res.json();
}
