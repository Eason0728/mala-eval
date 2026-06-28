import { fetchConfig, fetchAdminData, submitAdjust } from './api.js';
import { aggregateRatee, round1 } from './scoring.js';

let DATA = null;
let PASS = '';
let CURRENT_Q = '';

function groupByRatee(peerRatings, ratees) {
  const map = new Map(ratees.map((r) => [r, []]));
  peerRatings.forEach((p) => { if (map.has(p.ratee)) map.get(p.ratee).push(p.scores); });
  return map;
}

function results() {
  const { config, peerRatings, adjustments } = DATA;
  const grouped = groupByRatee(peerRatings, config.ratees);
  const adjBy = new Map(adjustments.map((a) => [a.ratee, a]));
  return config.ratees.map((ratee) =>
    aggregateRatee({
      ratee,
      scoresList: grouped.get(ratee),
      adjustment: adjBy.get(ratee) || {},
      wageTable: config.wageTable,
    })
  );
}

function wageText(w) {
  if (w.status === 'ok') return `$${w.wage}`;
  if (w.status === 'insufficient') return '資料不足';
  return '需人工確認';
}
function numText(n) { return n === null ? '—' : round1(n); }

function renderProgress(rows) {
  const total = rows.reduce((a, r) => a + r.responseCount, 0);
  document.getElementById('progress').innerHTML =
    `<b>填寫進度</b>：本季共收到 ${total} 筆互評（${CURRENT_Q}）`;
}

function renderOverview(rows) {
  const head = '<tr><th>同仁</th><th>態度分</th><th>態度調整</th><th>職能分</th><th>職能調整</th><th>最終總分</th><th>時薪</th><th>互評份數</th></tr>';
  const body = rows.map((r) => `<tr>
    <td><a href="#" data-r="${r.ratee}">${r.ratee}</a></td>
    <td>${numText(r.attitude)}</td><td>${r.attitudeAdjust}</td>
    <td>${r.competencyCounted ? numText(r.competency) : '未計'}</td><td>${r.competencyAdjust}</td>
    <td>${numText(r.subtotal)}</td><td>${wageText(r.wage)}</td><td>${r.responseCount}</td>
  </tr>`).join('');
  const host = document.getElementById('overview');
  host.innerHTML = `<b>總覽</b><table>${head}${body}</table>`;
  host.querySelectorAll('a[data-r]').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); renderDetail(a.dataset.r); };
  });
}

function renderDetail(ratee) {
  const { config } = DATA;
  const row = results().find((r) => r.ratee === ratee);
  const adj = DATA.adjustments.find((a) => a.ratee === ratee) || {};
  const items = config.items.map((it, i) =>
    `<tr><td>${it.label}</td><td>${row.itemAverages ? round1(row.itemAverages[i]) : '—'}</td></tr>`).join('');
  document.getElementById('detail').innerHTML = `
    <b>${ratee} 明細</b>
    <table><tr><th>項目</th><th>互評平均</th></tr>${items}</table>
    <div class="card">
      <div>主管調整</div>
      態度 ± <input id="aAdj" type="number" value="${adj.attitudeAdjust || 0}" style="width:70px">
      原因 <input id="aRsn" value="${adj.attitudeReason || ''}"><br><br>
      職能 ± <input id="cAdj" type="number" value="${adj.competencyAdjust || 0}" style="width:70px">
      原因 <input id="cRsn" value="${adj.competencyReason || ''}"><br><br>
      <button id="saveAdj">儲存調整</button>
      <span id="adjMsg" class="muted"></span>
    </div>`;
  document.getElementById('saveAdj').onclick = async () => {
    const payload = {
      type: 'adjust', passcode: PASS, quarter: CURRENT_Q, ratee,
      attitudeAdjust: Number(document.getElementById('aAdj').value) || 0,
      attitudeReason: document.getElementById('aRsn').value,
      competencyAdjust: Number(document.getElementById('cAdj').value) || 0,
      competencyReason: document.getElementById('cRsn').value,
    };
    const msg = document.getElementById('adjMsg');
    try {
      const res = await submitAdjust(payload);
      if (!res.ok) throw new Error();
      msg.textContent = '已儲存';
      await reload();
      renderDetail(ratee);
    } catch { msg.textContent = '儲存失敗，請重試'; }
  };
}

async function reload() {
  DATA = await fetchAdminData(PASS, CURRENT_Q);
  const rows = results();
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
    const rows = results();
    renderProgress(rows);
    renderOverview(rows);
  } catch {
    document.getElementById('gateErr').style.display = 'block';
    document.getElementById('gateErr').textContent = '連線失敗，請稍後再試';
  }
};
