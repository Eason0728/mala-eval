import { fetchAdminData, submitAdjust, submitSupervisorPerf, submitSupervisorFeedback } from './api.js';
import { round1, raterTotal, averageTotals, finalScore } from './scoring.js';

let DATA = null;
let PASS = '';
let CURRENT_Q = '';

const QZH = { 1: '第一季', 2: '第二季', 3: '第三季', 4: '第四季' };
function qNum(q) { return Number(String(q).split('-Q')[1]); }
function quarterLabel(q) { return `${String(q).split('-Q')[0]} 年 ${QZH[qNum(q)]}`; }

function currentYQ() {
  const d = new Date();
  return { year: d.getFullYear(), q: Math.floor(d.getMonth() / 3) + 1 };
}
function selectedAdminQuarter() {
  return `${document.getElementById('adminYear').value}-Q${document.getElementById('adminQuarter').value}`;
}
function fillAdminSelectors() {
  // 預設＝剛結束（上一個）季度，跟填寫頁對齊
  const d = new Date();
  let year = d.getFullYear();
  let q = Math.floor(d.getMonth() / 3) + 1 - 1;
  if (q < 1) { q = 4; year -= 1; }
  const ys = document.getElementById('adminYear');
  const qs = document.getElementById('adminQuarter');
  ys.innerHTML = '';
  for (let y = year - 1; y <= year + 1; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = `${y} 年`;
    if (y === year) o.selected = true;
    ys.appendChild(o);
  }
  qs.innerHTML = '';
  ['第一季', '第二季', '第三季', '第四季'].forEach((lbl, i) => {
    const o = document.createElement('option');
    o.value = i + 1; o.textContent = lbl;
    if (i + 1 === q) o.selected = true;
    qs.appendChild(o);
  });
  ys.onchange = qs.onchange = async () => {
    CURRENT_Q = selectedAdminQuarter();
    document.getElementById('detail').innerHTML = '';
    await reload();
  };
}

function buildRows() {
  const { config, peerRecords, supervisorPerf, adjustments, results, selfRecords } = DATA;
  const adjBy = new Map(adjustments.map((a) => [a.ratee, a]));
  const spBy = new Map(supervisorPerf.map((s) => [s.ratee, raterTotal(s.scores)]));
  const attMap = new Map(); // ratee -> 每位評核者的態度總分[]（含自評）
  const perfMap = new Map();
  config.accounts.forEach((a) => { attMap.set(a.name, []); perfMap.set(a.name, []); });
  const addTotal = (r) => {
    const t = raterTotal(r.scores);
    if (t === null) return;
    if (r.category === '態度' && attMap.has(r.ratee)) attMap.get(r.ratee).push(t);
    if (r.category === '表現' && perfMap.has(r.ratee)) perfMap.get(r.ratee).push(t);
  };
  peerRecords.forEach(addTotal);
  (selfRecords || []).forEach(addTotal); // 自評算進正式平均
  // 手動填的成績（結果細項，如第一季）：每人每類別加總
  const seedAtt = new Map(); const seedPerf = new Map();
  (results || []).forEach((r) => {
    const m = r.category === '態度' ? seedAtt : seedPerf;
    m.set(r.ratee, round1((m.get(r.ratee) || 0) + r.score));
  });
  return config.accounts.map((a) => {
    const attList = attMap.get(a.name);
    const perfList = perfMap.get(a.name);
    const adj = adjBy.get(a.name) || {};
    // 態度：優先互評紀錄平均，否則用手動填的加總
    let attitude = averageTotals(attList);
    let attManual = false;
    if (attitude === null && seedAtt.has(a.name)) { attitude = seedAtt.get(a.name); attManual = true; }
    // 表現：正職=主管評分；計時=全員互評平均；皆無則用手動填
    let performance = a.role === '正職' ? (spBy.has(a.name) ? spBy.get(a.name) : null) : averageTotals(perfList);
    let perfManual = false;
    if ((performance === null || performance === undefined) && seedPerf.has(a.name)) { performance = seedPerf.get(a.name); perfManual = true; }
    const attitudeAdjust = adj.attitudeAdjust || 0;
    const performanceAdjust = adj.performanceAdjust || 0;
    const { score, performanceCounted } = finalScore({ attitude, attitudeAdjust, performance, performanceAdjust });
    return {
      ratee: a.name, role: a.role,
      attitude, attitudeAdjust, performance, performanceAdjust, performanceCounted,
      finalScore: score,
      attitudeCount: attList.length, performanceCount: a.role === '正職' ? (spBy.has(a.name) ? 1 : 0) : perfList.length,
      attManual, perfManual,
    };
  });
}

function numText(n) { return n === null ? '—' : round1(n); }

function renderProgress(rows) {
  const attP = rows.filter((r) => r.attitude !== null && r.attitude !== undefined).length;
  const perfP = rows.filter((r) => r.performance !== null && r.performance !== undefined).length;
  document.getElementById('progress').innerHTML =
    `<b>${CURRENT_Q}</b>　態度有分 ${attP} 人、表現有分 ${perfP} 人`;
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function renderCompany() {
  const msgs = (DATA && DATA.companyMessages) || [];
  const host = document.getElementById('companyMsgs');
  if (!host) return;
  host.style.display = msgs.length ? '' : 'none';
  host.innerHTML = msgs.length ? `<b>💬 對公司的話（匿名）</b>${msgs.map((m) => `<div class="msgbubble">${esc(m)}</div>`).join('')}` : '';
}

function renderOverview(rows) {
  const head = '<tr><th>同仁</th><th>角色</th><th>態度分</th><th>態度±</th><th>表現分</th><th>表現±</th><th>實際分數</th><th>態度份數</th><th>表現份數</th></tr>';
  const body = rows.map((r) => `<tr>
    <td><a href="#" data-r="${r.ratee}">${r.ratee}</a></td>
    <td>${r.role}</td>
    <td>${numText(r.attitude)}</td><td>${r.attitudeAdjust}</td>
    <td>${r.performanceCounted || r.performance !== null ? numText(r.performance) : '未計'}</td><td>${r.performanceAdjust}</td>
    <td>${numText(r.finalScore)}</td><td>${r.attManual ? '手動' : r.attitudeCount}</td><td>${r.perfManual ? '手動' : r.performanceCount}</td>
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
        <select data-perf="${i}"><option value="0" disabled ${cur[i] ? '' : 'selected'}>—</option>${[1, 2, 3, 4, 5].map((v) =>
          `<option value="${v}" ${cur[i] === v ? 'selected' : ''}>${v}★</option>`).join('')}</select>
      </div>`).join('')}
      <button id="savePerf">儲存表現評分</button> <span id="perfMsg" class="muted"></span></div>`;
  }
  const fbRow = (DATA.supervisorFeedback || []).find((f) => f.ratee === ratee);
  const fb = fbRow ? fbRow.text : '';
  const selfAtt = (DATA.selfRecords || []).find((s) => s.ratee === ratee && s.category === '態度');
  const selfPerf = (DATA.selfRecords || []).find((s) => s.ratee === ratee && s.category === '表現');
  const selfLine = (selfAtt || selfPerf)
    ? `<div class="muted">自評：態度 ${selfAtt ? round1(raterTotal(selfAtt.scores)) : '—'}｜表現 ${selfPerf ? round1(raterTotal(selfPerf.scores)) : '—'}（已含進上方實際分數）</div>`
    : '<div class="muted">自評：尚未填</div>';
  document.getElementById('detail').innerHTML = `
    <b>${ratee}（${row.role}） 明細</b>
    <div>態度分 ${numText(row.attitude)}｜表現分 ${row.performance === null ? '未計' : numText(row.performance)}｜實際分數 ${numText(row.finalScore)}</div>
    ${selfLine}
    ${perfBlock}
    <div class="card">
      <div>主管 ± 調整</div>
      態度 ± <input id="aAdj" type="number" value="${adj.attitudeAdjust || 0}" style="width:70px">
      原因 <input id="aRsn" value="${adj.attitudeReason || ''}"><br><br>
      表現 ± <input id="pAdj" type="number" value="${adj.performanceAdjust || 0}" style="width:70px">
      原因 <input id="pRsn" value="${adj.performanceReason || ''}"><br><br>
      <button id="saveAdj">儲存調整</button> <span id="adjMsg" class="muted"></span>
    </div>
    <div class="card">
      <div><b>當季表現回饋</b> <span class="muted">（會顯示在這位同仁的「我的成績」，重存即覆蓋）</span></div>
      <textarea id="fbText" rows="3" style="width:100%">${esc(fb)}</textarea><br>
      <button id="saveFb">儲存回饋</button> <span id="fbMsg" class="muted"></span>
    </div>`;

  if (row.role === '正職') {
    document.getElementById('savePerf').onclick = async () => {
      const scores = [...document.querySelectorAll('[data-perf]')].map((s) => Number(s.value));
      const msg = document.getElementById('perfMsg');
      if (scores.some((v) => !v)) { msg.textContent = '請為每一項評分'; return; }
      try {
        const res = await submitSupervisorPerf({ type: 'supervisorPerf', passcode: PASS, quarter: CURRENT_Q, ratee, scores });
        if (!res.ok) throw new Error();
        msg.textContent = '已儲存'; await reload(); renderDetail(ratee);
      } catch { msg.textContent = '儲存失敗，請重試'; }
    };
  }
  document.getElementById('saveFb').onclick = async () => {
    const msg = document.getElementById('fbMsg');
    try {
      const res = await submitSupervisorFeedback({
        type: 'supervisorFeedback', passcode: PASS, quarter: CURRENT_Q, ratee,
        text: document.getElementById('fbText').value,
      });
      if (!res.ok) throw new Error();
      msg.textContent = '已儲存'; await reload(); renderDetail(ratee);
    } catch { msg.textContent = '儲存失敗，請重試'; }
  };
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
  renderCompany();
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
  fillAdminSelectors();
  CURRENT_Q = selectedAdminQuarter();
  try {
    const data = await fetchAdminData(PASS, CURRENT_Q);
    if (data.error) { document.getElementById('gateErr').style.display = 'block'; return; }
    DATA = data;
    document.getElementById('gate').style.display = 'none';
    document.getElementById('panel').style.display = 'block';
    const rows = buildRows();
    renderProgress(rows);
    renderOverview(rows);
    renderCompany();
  } catch {
    document.getElementById('gateErr').style.display = 'block';
    document.getElementById('gateErr').textContent = '連線失敗，請稍後再試';
  }
};

const btnPrint = document.getElementById('btnPrint');
if (btnPrint) {
  btnPrint.onclick = () => {
    document.title = `新竹光復店＿績效評核＿${QZH[qNum(CURRENT_Q)]}`;
    const logo = document.querySelector('.brand-logo');
    const logoSrc = logo ? logo.src : 'assets/logo.png';
    document.getElementById('printHeader').innerHTML =
      `<img src="${logoSrc}" alt="麻的小辛辣" style="height:48px;display:block;margin:0 0 10px" />`
      + `<h2 style="border:0;padding:0;margin:0">新竹光復店　績效評核表</h2>`
      + `<div style="margin-top:2px">${quarterLabel(CURRENT_Q)}</div>`;
    window.print();
  };
}
