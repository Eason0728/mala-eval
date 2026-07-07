import {
  fetchAdminData, submitAdjust, submitSupervisorPerf, submitSupervisorFeedback,
  submitFtTemplate, submitFtTitle,
} from './api.js';
import { round1, raterTotal, averageTotals, finalScore, kpiTotal } from './scoring.js';

// 取某正職的職稱範本項目
function ftItemsFor(ratee) {
  const title = (DATA.ftTitles || {})[ratee] || '';
  const items = (DATA.ftTemplates || {})[title] || [];
  return { title, items };
}
// 該正職本季的評分 { sel:{key:等級}, actual:{key:實際值} }
function ftPerfFor(ratee) {
  const sp = (DATA.supervisorPerf || []).find((s) => s.ratee === ratee);
  return { sel: (sp && sp.sel) || {}, actual: (sp && sp.actual) || {} };
}
const KPI_LEVELS = { 技能: ['A', 'B', 'C', 'D'], 執行力: ['完成', '未完成'] };
const KPI_LEVEL_LABEL = { A: 'A（100%）', B: 'B（80%）', C: 'C（60%）', D: 'D（40%）', 完成: '完成', 未完成: '未完成' };

// 評分列：依分類（技能/執行力）分組，每組前加分類標題列；項目名（比重）＋衡量標準｜等級下拉｜實際值
const KPI_CAT_LABEL = { 技能: '個人工作技能（技能）', 執行力: '個人執行力內容（執行力）' };
function ftScoreRowsHtml(items, sel, actual) {
  let out = '';
  let prevType = null;
  for (const it of items) {
    if (it.type !== prevType) {
      out += `<tr><td colspan="3" style="text-align:left;background:#fff6f2;font-weight:700;color:var(--brand-dark)">${esc(KPI_CAT_LABEL[it.type] || it.type)}</td></tr>`;
      prevType = it.type;
    }
    const opts = KPI_LEVELS[it.type] || KPI_LEVELS['技能'];
    const cur = sel[it.key] || '';
    const label = it.label || `（第${it.no}項，未命名）`;
    const lv = it.levels || {};
    const std = (it.type === '技能' && (lv.A || lv.B || lv.C || lv.D))
      ? `<div class="muted" style="font-size:.82em">A:${esc(lv.A || '-')}　B:${esc(lv.B || '-')}　C:${esc(lv.C || '-')}　D:${esc(lv.D || '-')}</div>` : '';
    out += `<tr>
      <td style="text-align:left">${it.no}. ${esc(label)} <span class="muted">比重${it.weight}</span>${std}</td>
      <td><select data-sel="${esc(it.key)}"><option value="">—</option>${opts.map((o) =>
    `<option value="${o}" ${cur === o ? 'selected' : ''}>${KPI_LEVEL_LABEL[o] || o}</option>`).join('')}</select></td>
      <td><input data-actual="${esc(it.key)}" value="${esc(actual[it.key] || '')}" placeholder="實際值" style="width:88px"></td>
    </tr>`;
  }
  return out;
}
// 範本編輯列（每項一小塊：基本欄＋衡量標準A/B/C/D。key 存 data 屬性、新列存檔時自動產生）
function ftEditorRowHtml(it, i) {
  it = it || {};
  const lv = it.levels || {};
  return `<div class="ftedit" data-key="${esc(it.key || '')}" style="border:1px solid var(--line);border-radius:8px;padding:8px;margin:6px 0">
    <div>№<input data-f="no" value="${it.no || i + 1}" style="width:36px">
      <select data-f="type"><option value="技能" ${it.type === '技能' ? 'selected' : ''}>技能</option><option value="執行力" ${it.type === '執行力' ? 'selected' : ''}>執行力</option></select>
      <input data-f="label" value="${esc(it.label || '')}" placeholder="項目內容" style="width:150px">
      目標<input data-f="target" value="${esc(it.target || '')}" placeholder="目標值" style="width:64px">
      比重<input data-f="weight" type="number" value="${it.weight || 0}" style="width:50px">
      <button type="button" class="delFtItem tab">刪</button></div>
    <div class="muted" style="margin-top:5px">衡量標準
      A<input data-f="A" value="${esc(lv.A || '')}" placeholder="如100%↑" style="width:76px">
      B<input data-f="B" value="${esc(lv.B || '')}" placeholder="B" style="width:76px">
      C<input data-f="C" value="${esc(lv.C || '')}" placeholder="C" style="width:76px">
      D<input data-f="D" value="${esc(lv.D || '')}" placeholder="D" style="width:76px"></div></div>`;
}

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
  // 正職表現＝依職稱範本比重加權（kpiTotal）；未指定職稱或未評完 → null（未計）
  const spBy = new Map();
  supervisorPerf.forEach((s) => {
    const { items } = ftItemsFor(s.ratee);
    spBy.set(s.ratee, items.length ? kpiTotal(items, s.sel) : null);
  });
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
  const row = buildRows().find((r) => r.ratee === ratee);
  const adj = DATA.adjustments.find((a) => a.ratee === ratee) || {};
  let perfBlock = '';
  if (row.role === '正職') {
    const { title, items } = ftItemsFor(ratee);
    const { sel, actual } = ftPerfFor(ratee);
    const titleOpts = Object.keys(DATA.ftTemplates || {});
    const titleSelect = `<select id="ftTitleSel"><option value="">未指定</option>${titleOpts.map((t) =>
      `<option value="${t}" ${t === title ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    if (!items.length) {
      perfBlock = `<div class="card"><b>主管評：正職職能表現（KPI）</b><br>
        職稱範本：${titleSelect} <button id="saveFtTitle">套用職稱</button> <span id="ftTitleMsg" class="muted"></span>
        <div class="muted">選好職稱範本後即可評分。</div></div>`;
    } else {
      const total = kpiTotal(items, sel);
      perfBlock = `<div class="card"><b>主管評：正職職能表現（KPI）</b>
        <span class="muted">滿分 70，本季小計：${total === null ? '未評完' : numText(total)}</span><br>
        職稱範本：${titleSelect} <button id="saveFtTitle">套用</button> <span id="ftTitleMsg" class="muted"></span>
        <table><tr><th style="text-align:left">項目（比重）</th><th>等級</th><th>實際值</th></tr>${ftScoreRowsHtml(items, sel, actual)}</table>
        <button id="savePerf">儲存表現評分</button> <span id="perfMsg" class="muted"></span>
        <details style="margin-top:10px"><summary class="muted" style="cursor:pointer">✏️ 編輯「${esc(title)}」範本項目（同職稱者一起套用）</summary>
          <div id="ftTplEditor">${items.map((it, i) => ftEditorRowHtml(it, i)).join('')}</div>
          <button id="addFtItem" type="button" class="tab" style="margin-top:6px">＋ 新增項目</button>
          <button id="saveFtTpl">儲存範本</button> <span id="ftTplMsg" class="muted"></span></details></div>`;
    }
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

  // 套用職稱範本
  if (document.getElementById('saveFtTitle')) {
    document.getElementById('saveFtTitle').onclick = async () => {
      const t = document.getElementById('ftTitleSel').value;
      const msg = document.getElementById('ftTitleMsg');
      const btn = document.getElementById('saveFtTitle');
      btn.disabled = true; msg.textContent = '儲存中…';
      try {
        const res = await submitFtTitle({ type: 'ftTitle', passcode: PASS, ratee, title: t });
        if (!res.ok) throw new Error();
      } catch { msg.textContent = '儲存失敗，請重試'; btn.disabled = false; return; }
      try { await reload(); renderDetail(ratee); } catch { msg.textContent = '✅ 已儲存（請重新整理）'; btn.disabled = false; }
    };
  }
  // 儲存 KPI 評分（等級＋實際值）
  if (document.getElementById('savePerf')) {
    document.getElementById('savePerf').onclick = async () => {
      const { items } = ftItemsFor(ratee);
      const sel = {}; const actual = {};
      document.querySelectorAll('[data-sel]').forEach((s) => { sel[s.dataset.sel] = s.value; });
      document.querySelectorAll('[data-actual]').forEach((a) => { actual[a.dataset.actual] = a.value; });
      const btn = document.getElementById('savePerf');
      const msg = document.getElementById('perfMsg');
      if (items.some((it) => !sel[it.key])) { msg.textContent = '請每一項都選等級'; return; }
      btn.disabled = true; msg.textContent = '儲存中…';
      try {
        const res = await submitSupervisorPerf({ type: 'supervisorPerf', passcode: PASS, quarter: CURRENT_Q, ratee, sel, actual });
        if (!res.ok) throw new Error();
      } catch { msg.textContent = '儲存失敗，請重試'; btn.disabled = false; return; }
      try {
        await reload(); renderDetail(ratee);
        document.getElementById('perfMsg').textContent = '✅ 已儲存';
      } catch { msg.textContent = '✅ 已儲存（畫面更新失敗，請重新整理）'; btn.disabled = false; }
    };
  }
  // 範本編輯：新增/刪除項目、儲存整組
  if (document.getElementById('saveFtTpl')) {
    document.getElementById('addFtItem').onclick = () => {
      const host = document.getElementById('ftTplEditor');
      host.insertAdjacentHTML('beforeend', ftEditorRowHtml({ type: '技能', weight: 5 }, host.children.length));
    };
    document.getElementById('ftTplEditor').onclick = (e) => {
      if (e.target.classList.contains('delFtItem')) e.target.closest('.ftedit').remove();
    };
    document.getElementById('saveFtTpl').onclick = async () => {
      const { title } = ftItemsFor(ratee);
      const items = [...document.querySelectorAll('#ftTplEditor .ftedit')].map((r, i) => {
        const g = (f) => r.querySelector(`[data-f="${f}"]`).value;
        return {
          no: Number(g('no')) || i + 1,
          key: r.dataset.key || `k${Date.now().toString(36)}${i}`,
          type: g('type'), label: g('label'), target: g('target'), weight: Number(g('weight')) || 0,
          levels: { A: g('A'), B: g('B'), C: g('C'), D: g('D') },
        };
      });
      const btn = document.getElementById('saveFtTpl');
      const msg = document.getElementById('ftTplMsg');
      btn.disabled = true; msg.textContent = '儲存中…';
      try {
        const res = await submitFtTemplate({ type: 'ftTemplate', passcode: PASS, title, items });
        if (!res.ok) throw new Error();
      } catch { msg.textContent = '儲存失敗，請重試'; btn.disabled = false; return; }
      try { await reload(); renderDetail(ratee); } catch { msg.textContent = '✅ 已儲存（請重新整理）'; btn.disabled = false; }
    };
  }
  document.getElementById('saveFb').onclick = async () => {
    const btn = document.getElementById('saveFb');
    const msg = document.getElementById('fbMsg');
    btn.disabled = true; msg.textContent = '儲存中…';
    try {
      const res = await submitSupervisorFeedback({
        type: 'supervisorFeedback', passcode: PASS, quarter: CURRENT_Q, ratee,
        text: document.getElementById('fbText').value,
      });
      if (!res.ok) throw new Error();
    } catch { msg.textContent = '儲存失敗，請重試'; btn.disabled = false; return; }
    try {
      await reload(); renderDetail(ratee);
      document.getElementById('fbMsg').textContent = '✅ 已儲存';
    } catch { msg.textContent = '✅ 已儲存（畫面更新失敗，請重新整理）'; btn.disabled = false; }
  };
  document.getElementById('saveAdj').onclick = async () => {
    const payload = {
      type: 'adjust', passcode: PASS, quarter: CURRENT_Q, ratee,
      attitudeAdjust: Number(document.getElementById('aAdj').value) || 0,
      attitudeReason: document.getElementById('aRsn').value,
      performanceAdjust: Number(document.getElementById('pAdj').value) || 0,
      performanceReason: document.getElementById('pRsn').value,
    };
    const btn = document.getElementById('saveAdj');
    const msg = document.getElementById('adjMsg');
    btn.disabled = true; msg.textContent = '儲存中…';
    try {
      const res = await submitAdjust(payload);
      if (!res.ok) throw new Error();
    } catch { msg.textContent = '儲存失敗，請重試'; btn.disabled = false; return; }
    try {
      await reload(); renderDetail(ratee);
      document.getElementById('adjMsg').textContent = '✅ 已儲存';
    } catch { msg.textContent = '✅ 已儲存（畫面更新失敗，請重新整理）'; btn.disabled = false; }
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
    document.title = `新竹光復店＿績效評核＿${String(CURRENT_Q).split('-Q')[0]}年${QZH[qNum(CURRENT_Q)]}`;
    const logo = document.querySelector('.brand-logo');
    const logoSrc = logo ? logo.src : 'assets/logo.png';
    document.getElementById('printHeader').innerHTML =
      `<img src="${logoSrc}" alt="麻的小辛辣" style="height:48px;display:block;margin:0 0 10px" />`
      + `<h2 style="border:0;padding:0;margin:0">新竹光復店　績效評核表</h2>`
      + `<div style="margin-top:2px">${quarterLabel(CURRENT_Q)}</div>`;
    window.print();
  };
}
