import {
  fetchAdminData, submitAdjust, submitSupervisorPerf, submitSupervisorFeedback,
  submitFtTemplate, submitFtTitle, submitSaveResults, submitClearResults,
} from './api.js';
import { round1, raterTotal, averageTotals, averageItems, finalScore, kpiTotal, kpiItemScore, ftAttitudeScale, capScore, gradeFor, wageTierIndex } from './scoring.js';

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
    // 態度：手動值優先（結果細項有該人該值就直接用，它已是最終分、不再套係數），沒有才即時計算。
    // 正職態度每星×1.2（滿分30）只套在即時計算路徑；計時維持原始。
    let attitude; let attManual = false;
    if (seedAtt.has(a.name)) {
      attitude = seedAtt.get(a.name);
      attManual = true;
    } else {
      attitude = averageTotals(attList);
      if (attitude !== null && a.role === '正職') attitude = ftAttitudeScale(attitude);
    }
    // 表現：同樣手動值優先，沒有才即時計算（正職=主管評分；計時=全員互評平均）。
    let performance; let perfManual = false;
    if (seedPerf.has(a.name)) {
      performance = seedPerf.get(a.name);
      perfManual = true;
    } else {
      performance = a.role === '正職' ? (spBy.has(a.name) ? spBy.get(a.name) : null) : averageTotals(perfList);
    }
    const attitudeAdjust = adj.attitudeAdjust || 0;
    const performanceAdjust = adj.performanceAdjust || 0;
    const { score, performanceCounted } = finalScore({ attitude, attitudeAdjust, performance, performanceAdjust });
    return {
      ratee: a.name, role: a.role,
      attitude, attitudeAdjust, performance, performanceAdjust, performanceCounted,
      finalScore: capScore(score), // 實際分數上限 100
      attitudeCount: attList.length, performanceCount: a.role === '正職' ? (spBy.has(a.name) ? 1 : 0) : perfList.length,
      attManual, perfManual,
    };
  });
}

function numText(n) { return n === null ? '—' : round1(n); }
// 總分＝態度分＋表現分（滿分100，不含主管±調整；含調整的另有「實際分數」欄）。
// 表現未計時，總分只算態度分；沒人評態度時顯示「—」。
function totalText(r) {
  if (r.attitude === null || r.attitude === undefined) return '—';
  const perfShown = r.performanceCounted || r.performance !== null;
  return round1(r.attitude + (perfShown ? (r.performance || 0) : 0));
}

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

// 定稿本季：把本季每位同仁的「每項最終分數」算出來（與同仁「我的成績」顯示一致），
// 供寫入「結果細項」凍結。回 { rows:[[受評者,角色,類別,題key,題目,分數]], ftIncomplete:[尚未評完 KPI 的正職] }。
// 正職 KPI 只有整組評完才寫（與 buildMyQuarters 一致：未評完＝未計，不定稿）。
function buildQuarterResults() {
  const { config, peerRecords, supervisorPerf, selfRecords } = DATA;
  const banks = config.banks || {};
  const grp = {}; // 受評者|類別 → [各評核者(含自評)的每題分數陣列]
  const add = (r) => { const k = r.ratee + '|' + r.category; (grp[k] = grp[k] || []).push(r.scores); };
  (peerRecords || []).forEach(add);
  (selfRecords || []).forEach(add);
  const spBy = new Map((supervisorPerf || []).map((s) => [s.ratee, s]));
  const rows = [];
  const ftIncomplete = [];
  config.accounts.forEach((a) => {
    const role = a.role;
    // 態度：每題平均，正職每題 ×1.2、計時原始
    const attBank = role === '正職' ? (banks.ftAttitude || []) : (banks.ptAttitude || []);
    const attList = grp[a.name + '|態度'];
    if (attList && attList.length && attBank.length) {
      const per = averageItems(attList);
      attBank.forEach((it, i) => {
        const s = role === '正職' ? ftAttitudeScale(per[i]) : per[i];
        rows.push([a.name, role, '態度', it.key, it.label, round1(s)]);
      });
    }
    // 表現
    if (role === '計時') {
      const perfBank = banks.ptPerf || [];
      const perfList = grp[a.name + '|表現'];
      if (perfList && perfList.length && perfBank.length) {
        const per = averageItems(perfList);
        perfBank.forEach((it, i) => rows.push([a.name, role, '表現', it.key, it.label, round1(per[i])]));
      }
    } else {
      const { items } = ftItemsFor(a.name);
      const sp = spBy.get(a.name);
      if (items.length) {
        const scored = sp ? items.map((it) => ({ it, score: kpiItemScore(it, (sp.sel || {})[it.key]) })) : null;
        if (scored && scored.every((p) => p.score !== null)) {
          scored.forEach((p) => rows.push([a.name, role, '表現', p.it.key, p.it.label || ('第' + p.it.no + '項'), round1(p.score)]));
        } else {
          ftIncomplete.push(a.name); // 有範本但未評完 → 這次不鎖表現
        }
      }
      // 無範本（如帳號000本人）→ 表現本就未計，不列入待評
    }
  });
  return { rows, ftIncomplete };
}

// 偵測「已定稿的季」是否有漂移：目前即時算出的分數 ≠ 已鎖定的定稿值（代表定稿後又改了評分／範本）。
// 用 受評者|類別|題目 對照每項分數。無即時資料的歷史季（如手動匯入）不算漂移（回 false）。
function quarterHasDrift() {
  const frozen = DATA.results || [];
  if (!frozen.length) return false; // 未定稿
  const { rows } = buildQuarterResults();
  if (!rows.length) return false; // 該季沒有即時評分資料（歷史匯入季）→ 不提醒
  const fmap = new Map();
  frozen.forEach((r) => fmap.set(r.ratee + '|' + r.category + '|' + r.label, round1(r.score)));
  const lmap = new Map();
  rows.forEach((r) => lmap.set(r[0] + '|' + r[2] + '|' + r[4], round1(r[5])));
  if (fmap.size !== lmap.size) return true;
  for (const [k, v] of lmap) if (!fmap.has(k) || fmap.get(k) !== v) return true;
  return false;
}

// 定稿狀態列：顯示本季是否已定稿（結果細項有無資料），並提供定稿／解除定稿按鈕。
function renderFinalizeBar() {
  const host = document.getElementById('finalizeBar');
  if (!host) return;
  const finalized = (DATA.results || []).length > 0;
  const drift = finalized && quarterHasDrift();
  const status = finalized
    ? '<span style="color:#1a7f37;font-weight:600">✅ 本季已定稿（分數已鎖定，修改範本不影響本季）</span>'
    : '<span class="muted">本季尚未定稿（分數仍會隨評分／範本即時變動）</span>';
  const driftWarn = drift
    ? '<div class="finalize-drift">⚠️ 偵測到定稿後有新的評分或範本異動，尚未反映到目前顯示的分數。改完請按「重新定稿」更新。</div>'
    : '';
  host.innerHTML = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <b>📌 ${quarterLabel(CURRENT_Q)} 成績</b>${status}
    <button id="btnFinalize">${finalized ? '重新定稿' : '定稿本季'}</button>
    ${finalized ? '<button id="btnUnfinalize" class="tab">解除定稿</button>' : ''}
    <span id="finalizeMsg" class="muted"></span></div>
    ${driftWarn}
    <div class="muted" style="margin-top:4px;font-size:.85em">定稿＝把本季每人分數存成最終值。之後修改職稱範本只影響未定稿的季度，本季不動。</div>`;

  document.getElementById('btnFinalize').onclick = async () => {
    const { rows, ftIncomplete } = buildQuarterResults();
    const people = new Set(rows.map((r) => r[0])).size;
    if (!rows.length) { document.getElementById('finalizeMsg').textContent = '本季沒有可定稿的成績'; return; }
    const warn = ftIncomplete.length
      ? `\n\n⚠️ ${ftIncomplete.length} 位正職 KPI 尚未評完（${ftIncomplete.join('、')}），這次不會鎖住他們的表現分；評完後再定稿一次即可。`
      : '';
    if (!window.confirm(`要定稿「${quarterLabel(CURRENT_Q)}」嗎？\n\n會把目前 ${people} 位同仁的分數存成最終值，之後修改職稱範本不會再影響這一季。${warn}`)) return;
    const btn = document.getElementById('btnFinalize');
    const msg = document.getElementById('finalizeMsg');
    btn.disabled = true; msg.textContent = '定稿中…';
    try {
      const res = await submitSaveResults({ type: 'saveResults', passcode: PASS, quarter: CURRENT_Q, rows });
      if (!res.ok) throw new Error();
    } catch { msg.textContent = '定稿失敗，請重試'; btn.disabled = false; return; }
    try { await reload(); document.getElementById('finalizeMsg').textContent = '✅ 已定稿'; } catch { msg.textContent = '✅ 已定稿（請重新整理）'; }
  };

  if (document.getElementById('btnUnfinalize')) {
    document.getElementById('btnUnfinalize').onclick = async () => {
      if (!window.confirm(`要解除「${quarterLabel(CURRENT_Q)}」的定稿嗎？\n\n解除後本季分數會回到即時計算（會再次隨評分／範本變動）。`)) return;
      const msg = document.getElementById('finalizeMsg');
      msg.textContent = '解除中…';
      try {
        const res = await submitClearResults({ type: 'clearResults', passcode: PASS, quarter: CURRENT_Q });
        if (!res.ok) throw new Error();
      } catch { msg.textContent = '解除失敗，請重試'; return; }
      try { await reload(); document.getElementById('finalizeMsg').textContent = '✅ 已解除定稿'; } catch { msg.textContent = '✅ 已解除（請重新整理）'; }
    };
  }
}

// 同仁考核結果：分正職／計時兩區塊，顯示各人本季分數落點。
// 正職＝考核等第（依實際分數 gradeFor）＋獎金基數；計時＝實際分數落在哪個時薪級距（wageTierIndex）。
// 落點一律依「實際分數」（含主管±調整、上限100），與同仁「我的成績」判定一致。
function renderGradePlacement(rows) {
  const host = document.getElementById('gradePlacement');
  if (!host) return;
  const tiers = (DATA.config && DATA.config.wageTiers) || [];
  const ft = rows.filter((r) => r.role === '正職');
  const pt = rows.filter((r) => r.role === '計時');

  const ftBody = ft.map((r) => {
    const g = gradeFor(r.finalScore);
    return `<tr><td>${r.ratee}</td><td>${numText(r.finalScore)}</td>
      <td>${g ? g.grade : '—'}</td><td>${g ? esc(g.baseText) : '—'}</td></tr>`;
  }).join('');
  const ftTable = ft.length
    ? `<table><tr><th>同仁</th><th>實際分數</th><th>考核等第</th><th>獎金發放基數</th></tr>${ftBody}</table>`
    : '<div class="muted">本季無正職資料</div>';

  const ptBody = pt.map((r) => {
    const idx = wageTierIndex(tiers, r.finalScore);
    const tier = idx >= 0 ? tiers[idx] : null;
    return `<tr><td>${r.ratee}</td><td>${numText(r.finalScore)}</td>
      <td>${tier ? esc(String(tier[0])) : '—'}</td><td>${tier ? esc(String(tier[1])) : '—'}</td></tr>`;
  }).join('');
  const ptTable = pt.length
    ? `<table><tr><th>同仁</th><th>實際分數</th><th>時薪級距（落點）</th><th>時薪</th></tr>${ptBody}</table>`
    : '<div class="muted">本季無計時資料</div>';

  host.innerHTML = `<b>同仁考核結果 · ${quarterLabel(CURRENT_Q)}</b>
    <div class="grade-block"><div class="grade-subtitle">正職 · 考核等第 × 獎金</div>${ftTable}</div>
    <div class="grade-block"><div class="grade-subtitle">計時 · 時薪級距落點</div>${ptTable}</div>`;
}

function renderOverview(rows) {
  const head = '<tr><th>同仁</th><th>角色</th><th>態度分（30分）</th><th>態度±</th><th>表現分（70分）</th><th>表現±</th><th>總分（100分）</th><th>實際分數</th><th>態度份數</th><th>表現份數</th></tr>';
  const body = rows.map((r) => `<tr>
    <td><a href="#" data-r="${r.ratee}">${r.ratee}</a></td>
    <td>${r.role}</td>
    <td>${numText(r.attitude)}</td><td>${r.attitudeAdjust}</td>
    <td>${r.performanceCounted || r.performance !== null ? numText(r.performance) : '未計'}</td><td>${r.performanceAdjust}</td>
    <td>${totalText(r)}</td>
    <td>${numText(r.finalScore)}</td><td>${r.attManual ? '手動' : r.attitudeCount}</td><td>${r.perfManual ? '手動' : r.performanceCount}</td>
  </tr>`).join('');
  const host = document.getElementById('overview');
  host.innerHTML = `<b>總覽</b><table>${head}${body}</table>`;
  host.querySelectorAll('a[data-r]').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); renderDetail(a.dataset.r); };
  });
}

// 某人某類別（態度/表現）的每題細項：他評平均（不含自己）、自評、總分（含自評的最終分）。
// 正職態度每項 ×1.2；計時原始。資料來自即時評分紀錄，無評分回 null。
function itemBreakdown(ratee, role, category) {
  const banks = (DATA.config && DATA.config.banks) || {};
  const isAtt = category === '態度';
  const bank = isAtt ? (role === '正職' ? banks.ftAttitude : banks.ptAttitude) : banks.ptPerf;
  if (!bank || !bank.length) return null;
  const peers = (DATA.peerRecords || []).filter((r) => r.ratee === ratee && r.category === category).map((r) => r.scores);
  const selfRec = (DATA.selfRecords || []).find((r) => r.ratee === ratee && r.category === category);
  const selfArr = selfRec ? selfRec.scores : null;
  if (!peers.length && !selfArr) return null;
  const peerAvg = peers.length ? averageItems(peers) : null;
  const finalArr = averageItems(selfArr ? peers.concat([selfArr]) : peers);
  const scale = (role === '正職' && isAtt) ? ftAttitudeScale : (v) => v;
  return { bank, peerAvg, selfArr, finalArr, scale };
}
function itemDetailTable(title, bd) {
  if (!bd) return '';
  const { bank, peerAvg, selfArr, finalArr, scale } = bd;
  let total = 0;
  const body = bank.map((it, i) => {
    total += scale(finalArr[i]);
    const pv = peerAvg ? numText(scale(peerAvg[i])) : '—';
    const sv = selfArr ? numText(scale(selfArr[i])) : '—';
    return `<tr><td style="text-align:left">${esc(it.label)}</td><td>${pv}</td><td>${sv}</td><td>${numText(scale(finalArr[i]))}</td></tr>`;
  }).join('');
  return `<div class="grade-block"><div class="grade-subtitle">${title}</div>
    <table><tr><th style="text-align:left">項目</th><th>平均分數</th><th>自評分數</th><th>總分</th></tr>
    ${body}<tr><td style="text-align:left"><b>小計</b></td><td>—</td><td>—</td><td><b>${numText(total)}</b></td></tr></table></div>`;
}
function itemDetailHtml(ratee, role) {
  const attTbl = itemDetailTable('職能態度' + (role === '正職' ? '（每項 ×1.2）' : ''), itemBreakdown(ratee, role, '態度'));
  const perfTbl = role === '計時' ? itemDetailTable('職能表現', itemBreakdown(ratee, role, '表現')) : '';
  if (!attTbl && !perfTbl) return '';
  const note = role === '計時'
    ? '平均分數＝其他同仁互評平均（不含自己）；總分＝含自評的最終分，各分類小計＝上方的態度分／表現分。'
    : '平均分數＝其他同仁互評平均（不含自己）；總分＝含自評的最終分，小計＝上方態度分。正職的職能表現為主管 KPI 評分，明細見下方 KPI 卡片。';
  return `<div class="card"><b>細項分數</b>${attTbl}${perfTbl}<div class="muted" style="font-size:.85em;margin-top:4px">${note}</div></div>`;
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
  const selfAttVal = selfAtt
    ? round1(row.role === '正職' ? ftAttitudeScale(raterTotal(selfAtt.scores)) : raterTotal(selfAtt.scores))
    : '—';
  const selfLine = (selfAtt || selfPerf)
    ? `<div class="muted">自評：態度 ${selfAttVal}｜表現 ${selfPerf ? round1(raterTotal(selfPerf.scores)) : '—'}（已含進上方實際分數）</div>`
    : '<div class="muted">自評：尚未填</div>';
  document.getElementById('detail').innerHTML = `
    <b>${ratee}（${row.role}） 明細</b>
    <div>態度分 ${numText(row.attitude)}｜表現分 ${row.performance === null ? '未計' : numText(row.performance)}｜實際分數 ${numText(row.finalScore)}</div>
    ${selfLine}
    ${itemDetailHtml(ratee, row.role)}
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
  renderFinalizeBar();
  renderOverview(rows);
  renderGradePlacement(rows);
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
    renderFinalizeBar();
    renderOverview(rows);
    renderGradePlacement(rows);
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
