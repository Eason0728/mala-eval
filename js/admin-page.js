import { fetchConfig, fetchAdminData, submitAdjust, submitSupervisorPerf } from './api.js';
import { aggregateRatee, round1, raterTotal } from './scoring.js';

let DATA = null;
let PASS = '';
let CURRENT_Q = '';

function buildRows() {
  const { config, peerRecords, supervisorPerf, adjustments } = DATA;
  const adjBy = new Map(adjustments.map((a) => [a.ratee, a]));
  const spBy = new Map(supervisorPerf.map((s) => [s.ratee, raterTotal(s.scores)]));
  const attMap = new Map(); // ratee -> totals[]
  const perfMap = new Map();
  config.accounts.forEach((a) => { attMap.set(a.name, []); perfMap.set(a.name, []); });
  peerRecords.forEach((r) => {
    const t = raterTotal(r.scores);
    if (t === null) return;
    if (r.category === '態度' && attMap.has(r.ratee)) attMap.get(r.ratee).push(t);
    if (r.category === '表現' && perfMap.has(r.ratee)) perfMap.get(r.ratee).push(t);
  });
  return config.accounts.map((a) => aggregateRatee({
    ratee: a.name, role: a.role,
    attitudeTotals: attMap.get(a.name),
    performanceTotals: perfMap.get(a.name),
    supervisorPerf: a.role === '正職' ? (spBy.has(a.name) ? spBy.get(a.name) : null) : null,
    adjustment: adjBy.get(a.name) || {},
  }));
}

function numText(n) { return n === null ? '—' : round1(n); }

function renderProgress(rows) {
  const att = rows.reduce((a, r) => a + r.attitudeCount, 0);
  const perf = rows.reduce((a, r) => a + r.performanceCount, 0);
  document.getElementById('progress').innerHTML =
    `<b>填寫進度</b>（${CURRENT_Q}）：態度評分 ${att} 筆、表現評分 ${perf} 筆`;
}

function renderOverview(rows) {
  const head = '<tr><th>同仁</th><th>角色</th><th>態度分</th><th>態度±</th><th>表現分</th><th>表現±</th><th>實際分數</th><th>態度份數</th><th>表現份數</th></tr>';
  const body = rows.map((r) => `<tr>
    <td><a href="#" data-r="${r.ratee}">${r.ratee}</a></td>
    <td>${r.role}</td>
    <td>${numText(r.attitude)}</td><td>${r.attitudeAdjust}</td>
    <td>${r.performanceCounted || r.performance !== null ? numText(r.performance) : '未計'}</td><td>${r.performanceAdjust}</td>
    <td>${numText(r.finalScore)}</td><td>${r.attitudeCount}</td><td>${r.performanceCount}</td>
  </tr>`).join('');
  const host = document.getElementById('overview');
  host.innerHTML = `<b>總覽</b><table>${head}${body}</table>`;
  host.querySelectorAll('a[data-r]').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); renderDetail(a.dataset.r); };
  });
}

function renderDetail(ratee) {
  const { config } = DATA;
  const row = buildRows().find((r) => r.ratee === ratee);
  const adj = DATA.adjustments.find((a) => a.ratee === ratee) || {};
  let perfBlock = '';
  if (row.role === '正職') {
    const items = config.banks.ftPerf;
    const sp = DATA.supervisorPerf.find((s) => s.ratee === ratee);
    const cur = sp ? sp.scores : new Array(items.length).fill(0);
    perfBlock = `<div class="card"><b>主管評：正職表現</b><br>
      ${items.map((it, i) => `<div>${it.label}
        <select data-perf="${i}">${[1, 2, 3, 4, 5].map((v) =>
          `<option value="${v}" ${cur[i] === v ? 'selected' : ''}>${v}★</option>`).join('')}</select>
      </div>`).join('')}
      <button id="savePerf">儲存表現評分</button> <span id="perfMsg" class="muted"></span></div>`;
  }
  document.getElementById('detail').innerHTML = `
    <b>${ratee}（${row.role}） 明細</b>
    <div>態度分 ${numText(row.attitude)}｜表現分 ${row.performance === null ? '未計' : numText(row.performance)}｜實際分數 ${numText(row.finalScore)}</div>
    ${perfBlock}
    <div class="card">
      <div>主管 ± 調整</div>
      態度 ± <input id="aAdj" type="number" value="${adj.attitudeAdjust || 0}" style="width:70px">
      原因 <input id="aRsn" value="${adj.attitudeReason || ''}"><br><br>
      表現 ± <input id="pAdj" type="number" value="${adj.performanceAdjust || 0}" style="width:70px">
      原因 <input id="pRsn" value="${adj.performanceReason || ''}"><br><br>
      <button id="saveAdj">儲存調整</button> <span id="adjMsg" class="muted"></span>
    </div>`;

  if (row.role === '正職') {
    document.getElementById('savePerf').onclick = async () => {
      const scores = [...document.querySelectorAll('[data-perf]')].map((s) => Number(s.value));
      const msg = document.getElementById('perfMsg');
      try {
        const res = await submitSupervisorPerf({ type: 'supervisorPerf', passcode: PASS, quarter: CURRENT_Q, ratee, scores });
        if (!res.ok) throw new Error();
        msg.textContent = '已儲存'; await reload(); renderDetail(ratee);
      } catch { msg.textContent = '儲存失敗，請重試'; }
    };
  }
  document.getElementById('saveAdj').onclick = async () => {
    const payload = {
      type: 'adjust', passcode: PASS, quarter: CURRENT_Q, ratee,
      attitudeAdjust: Number(document.getElementById('aAdj').value) || 0,
      attitudeReason: document.getElementById('aRsn').value,
      performanceAdjust: Number(document.getElementById('pAdj').value) || 0,
      performanceReason: document.getElementById('pRsn').value,
    };
    const msg = document.getElementById('adjMsg');
    try {
      const res = await submitAdjust(payload);
      if (!res.ok) throw new Error();
      msg.textContent = '已儲存'; await reload(); renderDetail(ratee);
    } catch { msg.textContent = '儲存失敗，請重試'; }
  };
}

async function reload() {
  DATA = await fetchAdminData(PASS, CURRENT_Q);
  const rows = buildRows();
  renderProgress(rows);
  renderOverview(rows);
}

const adminEntry = document.getElementById('adminEntry');
if (adminEntry) {
  adminEntry.onclick = (e) => {
    e.preventDefault();
    document.getElementById('adminSection').style.display = 'block';
    adminEntry.style.display = 'none';
    document.getElementById('pass').focus();
    document.getElementById('adminSection').scrollIntoView({ behavior: 'smooth' });
  };
}

document.getElementById('enter').onclick = async () => {
  PASS = document.getElementById('pass').value;
  try {
    const cfg = await fetchConfig();
    CURRENT_Q = cfg.quarter;
    const data = await fetchAdminData(PASS, CURRENT_Q);
    if (data.error) { document.getElementById('gateErr').style.display = 'block'; return; }
    DATA = data;
    document.getElementById('gate').style.display = 'none';
    document.getElementById('panel').style.display = 'block';
    const rows = buildRows();
    renderProgress(rows);
    renderOverview(rows);
  } catch {
    document.getElementById('gateErr').style.display = 'block';
    document.getElementById('gateErr').textContent = '連線失敗，請稍後再試';
  }
};
