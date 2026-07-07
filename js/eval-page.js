import { login, fetchConfig, submitPeer, submitSelf, myScores, changePassword } from './api.js';
import { splitPeerSubmission } from './validate.js';
import { averageItems, round1, kpiItemScore } from './scoring.js';

const state = { me: null, auth: null, config: null, ratings: new Map(), fillQuarter: null, self: null, selfQuarter: null };

// ===== 季度鎖定與開放時間 =====
function fillTarget(d = new Date()) {
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const map = { 1: [y - 1, 4], 4: [y, 1], 7: [y, 2], 10: [y, 3] };
  if (!map[m]) return null;
  const [yr, q] = map[m];
  return { year: yr, q, quarter: `${yr}-Q${q}`, fillMonth: m };
}
function isFillOpen(d = new Date()) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return [1, 4, 7, 10].includes(m) && day >= 1 && day <= 5;
}
function nextOpenText(d = new Date()) {
  const months = [1, 4, 7, 10];
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const nextM = months.find((mm) => mm > m || (mm === m && d.getDate() < 1));
  return nextM ? `${y} 年 ${nextM} 月 1–5 號` : `${y + 1} 年 1 月 1–5 號`;
}
const QLABEL = { 1: '第一季', 2: '第二季', 3: '第三季', 4: '第四季' };
function qNum(quarter) { return Number(String(quarter).split('-Q')[1]); }
function qYear(quarter) { return Number(String(quarter).split('-Q')[0]); }
function qSortKey(quarter) { return qYear(quarter) * 10 + qNum(quarter); }
function qLabel(quarter) { return `${qYear(quarter)} 年 ${QLABEL[qNum(quarter)]}`; }

// ===== 草稿自動儲存（localStorage，只存在本裝置，送出後清除） =====
function draftKey(kind, quarter) { return `mala-eval-draft:${state.auth.account}:${kind}:${quarter}`; }
function savePeerDraft() {
  if (!state.fillQuarter) return;
  const obj = {};
  state.ratings.forEach((v, k) => { obj[k] = { attitude: v.attitude, performance: v.performance }; });
  try { localStorage.setItem(draftKey('peer', state.fillQuarter), JSON.stringify(obj)); } catch {}
}
function loadPeerDraft() {
  if (!state.fillQuarter) return null;
  try { const raw = localStorage.getItem(draftKey('peer', state.fillQuarter)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function clearPeerDraft(quarter) {
  const q = quarter || state.fillQuarter;
  if (!q) return;
  try { localStorage.removeItem(draftKey('peer', q)); } catch {}
}
function saveSelfDraft() {
  if (!state.selfQuarter) return;
  const peerMessages = [...document.querySelectorAll('#peerMsgs .peermsg')]
    .map((r) => ({ to: r.querySelector('.peer-to').value, msg: r.querySelector('.peer-msg').value, anon: r.querySelector('.peer-anon-cb').checked }));
  const obj = {
    attitude: state.self.attitude,
    performance: state.self.performance,
    selfNote: document.getElementById('selfNote').value,
    companyNote: document.getElementById('companyNote').value,
    peerMessages,
  };
  try { localStorage.setItem(draftKey('self', state.selfQuarter), JSON.stringify(obj)); } catch {}
}
function loadSelfDraft() {
  if (!state.selfQuarter) return null;
  try { const raw = localStorage.getItem(draftKey('self', state.selfQuarter)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function clearSelfDraft(quarter) {
  const q = quarter || state.selfQuarter;
  if (!q) return;
  try { localStorage.removeItem(draftKey('self', q)); } catch {}
}

function bankFor(role, kind) {
  const b = state.config.banks;
  if (role === '計時') return kind === 'attitude' ? b.ptAttitude : b.ptPerf;
  return kind === 'attitude' ? b.ftAttitude : b.ftPerf;
}

// 開場白用的季度：優先填寫季度，否則剛結束的上一季
function introQuarter() {
  const t = fillTarget();
  if (t) return { year: t.year, q: t.q };
  const d = new Date();
  let y = d.getFullYear();
  let q = Math.floor(d.getMonth() / 3) + 1 - 1;
  if (q < 1) { q = 4; y -= 1; }
  return { year: y, q };
}
function renderIntro() {
  const { year, q } = introQuarter();
  const mrange = { 1: '1 月到 3 月', 2: '4 月到 6 月', 3: '7 月到 9 月', 4: '10 月到 12 月' }[q];
  const nextQ = QLABEL[(q % 4) + 1];
  document.getElementById('introBody').innerHTML = `
    <p>各位夥伴：</p>
    <p>先說聲謝謝。</p>
    <p>${year} 年的${QLABEL[q]}，每一個忙到不可開交的用餐時段、每一次臨時補位、每一句「我來就好」，都是大家一起撐起來的。這三個月，辛苦了。</p>
    <p>這份表單，是想邀請大家一起回顧 ${mrange}的自己，還有身邊的夥伴。</p>
    <p><b>【填寫前，想跟大家說三件事】</b></p>
    <p><b>1. 請放心誠實</b><br />每個星級都有具體的行為描述，照你實際看到的表現給分就好。誠實的回饋不是挑毛病，而是幫夥伴看見自己看不到的地方——這是同事之間最實在的幫忙。</p>
    <p><b>2. 也給自己一點時間</b><br />評自己的時候，不用客氣，也不用苛刻。這三個月有進步的地方，給自己一個大大的掌聲；還卡卡的地方，寫下來，當作給三個月後的自己一個期許。</p>
    <p><b>3. 分數怎麼用，跟大家說清楚</b><br />「態度評分」佔總分的 30%，加上「職能專業」的 70%，就是${nextQ}的時薪標準。我們希望薪水不是黑箱——每一分都有依據，做得好，就看得到。</p>
    <p>大家認真填的每一格，我們都會認真看。<br />期待透過這次的真實回饋，讓團隊更有默契、更有溫度。</p>
    <p>謝謝大家，有你們真好！</p>`;
}

function renderStars(values, idx, item, onSave) {
  const wrap = document.createElement('div');
  wrap.className = 'item';
  const title = document.createElement('div');
  title.textContent = `${idx + 1}. ${item.label}`;
  const stars = document.createElement('div');
  stars.className = 'stars';
  for (let v = 1; v <= 5; v++) {
    const s = document.createElement('span');
    s.textContent = '★';
    s.onclick = () => {
      values[idx] = v;
      [...stars.children].forEach((el, i) => el.classList.toggle('on', i < v));
      if (onSave) onSave();
    };
    stars.appendChild(s);
  }
  if (values[idx]) [...stars.children].forEach((el, i) => el.classList.toggle('on', i < values[idx]));
  const help = document.createElement('details');
  help.className = 'help';
  help.innerHTML = '<summary class="muted">星等說明</summary>'
    + item.levels.map((lv, i) => `<div>${5 - i}★ ${lv}</div>`).join('');
  wrap.append(title, stars, help);
  return wrap;
}
function catBlock(label, items, values, open, onSave) {
  const d = document.createElement('details');
  d.className = 'cat';
  if (open) d.open = true;
  const sum = document.createElement('summary');
  sum.textContent = label;
  d.appendChild(sum);
  items.forEach((it, i) => d.appendChild(renderStars(values, i, it, onSave)));
  return d;
}

// ===== 他評（填寫評鑑）=====
function rateeCard(r, draft) {
  const attitudeItems = bankFor(r.role, 'attitude');
  const showPerf = r.role === '計時'; // 計時的表現全員互評（2026-07 起）
  const perfItems = showPerf ? bankFor('計時', 'perf') : [];
  const entry = {
    rateeRole: r.role,
    attitude: new Array(attitudeItems.length).fill(0),
    performance: showPerf ? new Array(perfItems.length).fill(0) : null,
  };
  const saved = draft && draft[r.name];
  if (saved && Array.isArray(saved.attitude)) entry.attitude = attitudeItems.map((_, i) => saved.attitude[i] || 0);
  if (showPerf && saved && Array.isArray(saved.performance)) entry.performance = perfItems.map((_, i) => saved.performance[i] || 0);
  state.ratings.set(r.name, entry);
  const card = document.createElement('details');
  card.className = 'ratee';
  const sum = document.createElement('summary');
  sum.textContent = r.name;
  card.appendChild(sum);
  card.appendChild(catBlock('職能態度', attitudeItems, entry.attitude, false, savePeerDraft));
  if (showPerf) card.appendChild(catBlock('職能表現', perfItems, entry.performance, false, savePeerDraft));
  return card;
}
function renderForms() {
  const host = document.getElementById('forms');
  host.innerHTML = '';
  state.ratings.clear();
  const draft = loadPeerDraft();
  const ratees = state.config.accounts.filter((a) => a.name !== state.me.name);
  [['正職同仁', '正職'], ['計時同仁', '計時']].forEach(([label, role]) => {
    const list = ratees.filter((r) => r.role === role);
    if (!list.length) return;
    const sec = document.createElement('div');
    sec.className = 'group';
    const h = document.createElement('h2');
    h.textContent = label;
    sec.appendChild(h);
    list.forEach((r) => sec.appendChild(rateeCard(r, draft)));
    host.appendChild(sec);
  });
  if (draft) {
    const note = document.createElement('div');
    note.className = 'msg';
    note.textContent = '📝 已自動還原你上次未送出的填寫進度';
    host.prepend(note);
  }
}
function renderFill() {
  const t = fillTarget();
  const open = isFillOpen() && t;
  const banner = document.getElementById('fillBanner');
  const showIds = ['fillHint', 'forms', 'submit'];
  if (!open) {
    state.fillQuarter = null;
    banner.className = 'card msg err';
    banner.textContent = `目前非填寫期間。開放時間為每年 1、4、7、10 月的 1～5 號，下次開放：${nextOpenText()}。`;
    showIds.forEach((id) => { document.getElementById(id).style.display = 'none'; });
    document.getElementById('result').style.display = 'none';
    return;
  }
  state.fillQuarter = t.quarter;
  banner.className = 'card';
  banner.innerHTML = `<b>填寫季度：${t.year} 年 ${QLABEL[t.q]}</b>`;
  showIds.forEach((id) => { document.getElementById(id).style.display = ''; });
  renderForms();
}

// ===== 自評 =====
function renderSelf() {
  const t = fillTarget();
  const open = isFillOpen() && t;
  const banner = document.getElementById('selfBanner');
  const showIds = ['selfHint', 'selfForms', 'selfMsgs', 'selfSubmit'];
  if (!open) {
    state.selfQuarter = null;
    banner.className = 'card msg err';
    banner.textContent = `目前非填寫期間。開放時間為每年 1、4、7、10 月的 1～5 號，下次開放：${nextOpenText()}。`;
    showIds.forEach((id) => { document.getElementById(id).style.display = 'none'; });
    document.getElementById('selfResult').style.display = 'none';
    return;
  }
  state.selfQuarter = t.quarter;
  banner.className = 'card';
  banner.innerHTML = `<b>自評季度：${t.year} 年 ${QLABEL[t.q]}</b>`;
  showIds.forEach((id) => { document.getElementById(id).style.display = ''; });
  const host = document.getElementById('selfForms');
  host.innerHTML = '';
  const attItems = bankFor(state.me.role, 'attitude');
  const perfItems = state.me.role === '計時' ? bankFor('計時', 'perf') : [];
  const draft = loadSelfDraft();
  state.self = {
    attitude: attItems.map((_, i) => (draft && Array.isArray(draft.attitude) && draft.attitude[i]) || 0),
    performance: perfItems.length ? perfItems.map((_, i) => (draft && Array.isArray(draft.performance) && draft.performance[i]) || 0) : null,
  };
  host.appendChild(catBlock('職能態度（自評）', attItems, state.self.attitude, true, saveSelfDraft));
  if (perfItems.length) host.appendChild(catBlock('職能表現（自評）', perfItems, state.self.performance, true, saveSelfDraft));
  // 留言欄
  document.getElementById('selfNote').value = (draft && draft.selfNote) || '';
  document.getElementById('companyNote').value = (draft && draft.companyNote) || '';
  document.getElementById('selfNote').oninput = saveSelfDraft;
  document.getElementById('companyNote').oninput = saveSelfDraft;
  document.getElementById('peerMsgs').innerHTML = '';
  if (draft && Array.isArray(draft.peerMessages) && draft.peerMessages.length) {
    draft.peerMessages.forEach((m) => addPeerRow(m.to, m.msg, m.anon));
  } else {
    addPeerRow();
  }
  if (draft) {
    const note = document.createElement('div');
    note.className = 'msg';
    note.textContent = '📝 已自動還原你上次未送出的自評進度';
    host.prepend(note);
  }
}

function peerOptions() {
  return state.config.accounts.filter((a) => a.name !== state.me.name)
    .map((a) => `<option value="${a.name}">${a.name}（${a.role}）</option>`).join('');
}
function addPeerRow(to, msg, anon) {
  const host = document.getElementById('peerMsgs');
  const n = host.children.length + 1;
  const row = document.createElement('div');
  row.className = 'peermsg';
  const checked = anon === undefined ? true : !!anon; // 預設匿名
  row.innerHTML = `<div class="muted">夥伴${n}</div>
    <select class="peer-to"><option value="">選擇夥伴…</option>${peerOptions()}</select>
    <textarea class="peer-msg" rows="1" placeholder="想說的話…" style="width:100%"></textarea>
    <label class="peer-anon muted"><input type="checkbox" class="peer-anon-cb"${checked ? ' checked' : ''} /> 匿名（不讓對方知道是我）</label>`;
  host.appendChild(row);
  if (to) row.querySelector('.peer-to').value = to;
  if (msg) row.querySelector('.peer-msg').value = msg;
  row.querySelector('.peer-to').onchange = saveSelfDraft;
  row.querySelector('.peer-msg').oninput = saveSelfDraft;
  row.querySelector('.peer-anon-cb').onchange = saveSelfDraft;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function showResult(cls, text) {
  const box = document.getElementById('result');
  box.style.display = 'block';
  box.className = `msg ${cls}`;
  box.textContent = text;
}
function showSelfResult(cls, text) {
  const box = document.getElementById('selfResult');
  box.style.display = 'block';
  box.className = `msg ${cls}`;
  box.textContent = text;
}

// ===== 我的成績 =====
function buildMyQuarters(data) {
  const role = data.role;
  const byQuarter = {};
  const ensure = (q) => (byQuarter[q] = byQuarter[q] || {});

  // 手動填的歷史成績（結果細項）：官方值，不拆自評/他評
  (data.seeded || []).forEach((row) => {
    const q = ensure(row.quarter);
    const key = row.category === '態度' ? 'att' : 'perf';
    (q[key] = q[key] || []).push({ label: row.label, score: row.score });
  });

  const recByQC = {};
  (data.records || []).forEach((r) => {
    recByQC[r.quarter] = recByQC[r.quarter] || {};
    (recByQC[r.quarter][r.category] = recByQC[r.quarter][r.category] || []).push(r.scores);
  });
  const selfByQC = {};
  (data.self || []).forEach((r) => { selfByQC[r.quarter] = selfByQC[r.quarter] || {}; selfByQC[r.quarter][r.category] = r.scores; });
  const spByQ = {};
  (data.supervisorPerf || []).forEach((sp) => { spByQ[sp.quarter] = sp.sel || {}; });

  const quarters = new Set([].concat(Object.keys(recByQC), Object.keys(selfByQC), Object.keys(spByQ)));
  quarters.forEach((q) => {
    const qd = ensure(q);
    if (qd.att) return; // 已有手動填的官方值 → 不再計算
    const attBank = bankFor(role, 'attitude');
    const peerAtt = (recByQC[q] && recByQC[q]['態度']) || [];
    const selfAtt = selfByQC[q] && selfByQC[q]['態度'];
    if (peerAtt.length || selfAtt) {
      const off = averageItems(selfAtt ? peerAtt.concat([selfAtt]) : peerAtt);
      qd.att = attBank.map((it, i) => ({ label: it.label, score: off[i] }));
      if (peerAtt.length) { const pa = averageItems(peerAtt); qd.attPeer = attBank.map((it, i) => ({ label: it.label, score: pa[i] })); }
      if (selfAtt) qd.attSelf = attBank.map((it, i) => ({ label: it.label, score: selfAtt[i] }));
    }
    if (role === '計時') {
      const perfBank = bankFor('計時', 'perf');
      const peerPerf = (recByQC[q] && recByQC[q]['表現']) || [];
      const selfPerf = selfByQC[q] && selfByQC[q]['表現'];
      if (peerPerf.length || selfPerf) {
        const off = averageItems(selfPerf ? peerPerf.concat([selfPerf]) : peerPerf);
        qd.perf = perfBank.map((it, i) => ({ label: it.label, score: off[i] }));
        if (peerPerf.length) { const pp = averageItems(peerPerf); qd.perfPeer = perfBank.map((it, i) => ({ label: it.label, score: pp[i] })); }
        if (selfPerf) qd.perfSelf = perfBank.map((it, i) => ({ label: it.label, score: selfPerf[i] }));
      }
    } else if (role === '正職' && spByQ[q]) {
      // 正職職能表現＝依本人職稱範本，每項 比重×等級%（執行力完成=比重、未完成=0）
      const tpl = data.ftTemplate || [];
      const sel = spByQ[q];
      const perfItems = tpl.map((it) => ({ label: it.label || `第${it.no}項`, score: kpiItemScore(it, sel[it.key]) }));
      if (tpl.length && perfItems.every((p) => p.score !== null)) qd.perf = perfItems;
    }
  });
  return byQuarter;
}

function sumItems(items) { return items ? items.reduce((a, b) => a + b.score, 0) : null; }
function numText(n) { return n === null || n === undefined ? '—' : round1(n); }
function diffText(cur, prev) {
  if (prev === null || prev === undefined || cur === null || cur === undefined) return '—';
  const d = round1(cur - prev);
  return d > 0 ? `▲+${d}` : d < 0 ? `▼${d}` : '＝';
}

// 兩條線折線圖（name1 灰、name2 紅）
function lineChart(labels, s1, s2, name1, name2, yMax) {
  const W = Math.max(560, labels.length * 46);
  const H = 260;
  const padL = 34; const padR = 12; const padT = 30; const padB = 64;
  const x = (i) => padL + (labels.length <= 1 ? 0 : i * (W - padL - padR) / (labels.length - 1));
  const y = (v) => padT + (yMax - v) * (H - padT - padB) / yMax;
  const poly = (arr, cls) => arr && arr.length
    ? `<polyline class="${cls}" fill="none" stroke-width="2" points="${arr.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" />`
      + arr.map((v, i) => `<circle class="${cls}" cx="${x(i)}" cy="${y(v)}" r="3" />`).join('')
    : '';
  const ticks = []; for (let v = 0; v <= yMax; v++) ticks.push(v);
  const grid = ticks.map((v) =>
    `<line x1="${padL}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}" stroke="#eee" /><text x="4" y="${y(v) + 4}" font-size="11" fill="#999">${v}</text>`).join('');
  const xticks = labels.map((_, i) => `<text x="${x(i)}" y="${H - padB + 16}" font-size="10" fill="#666" text-anchor="middle">${i + 1}</text>`).join('');
  return `<div class="chartwrap"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    ${grid}${xticks}
    <line class="c-prev" x1="${padL}" y1="${H - 22}" x2="${padL + 24}" y2="${H - 22}" stroke-width="2"/><text x="${padL + 30}" y="${H - 18}" font-size="12">${name1}</text>
    <line class="c-cur" x1="${padL + 160}" y1="${H - 22}" x2="${padL + 184}" y2="${H - 22}" stroke-width="2"/><text x="${padL + 190}" y="${H - 18}" font-size="12">${name2}</text>
    ${poly(s1, 'c-prev')}${poly(s2, 'c-cur')}
  </svg></div>`;
}

function compareBlock(title, labels, series1, series2, name1, name2) {
  const s1 = labels.map((lb) => { const f = series1.find((x) => x.label === lb); return f ? f.score : null; });
  const s2 = labels.map((lb) => { const f = series2.find((x) => x.label === lb); return f ? f.score : null; });
  const yMax = Math.max(5, Math.ceil(Math.max.apply(null, s1.concat(s2).filter((v) => v !== null).concat([5]))));
  const chart = lineChart(labels, s1.every((v) => v !== null) ? s1 : null, s2, name1, name2, yMax);
  const rows = labels.map((lb, i) => `<tr><td style="text-align:left">${i + 1}. ${lb}</td><td>${numText(s2[i])}</td><td>${numText(s1[i])}</td><td>${diffText(s2[i], s1[i])}</td></tr>`).join('');
  return `<div class="card"><b>${title}</b>${chart}
    <table><tr><th>項目</th><th>${name2}</th><th>${name1}</th><th>差</th></tr>${rows}</table></div>`;
}

async function renderScores() {
  const pane = document.getElementById('scorePane');
  pane.innerHTML = '<p class="muted">載入中…</p>';
  let data;
  try { data = await myScores(state.auth.account, state.auth.password); }
  catch { pane.innerHTML = '<div class="msg err">載入失敗，請稍後再試</div>'; return; }
  if (!data || !data.ok) { pane.innerHTML = '<div class="msg err">無法讀取成績</div>'; return; }

  const byQuarter = buildMyQuarters(data);
  let quarters = Object.keys(byQuarter).sort((a, b) => qSortKey(a) - qSortKey(b));

  const t = fillTarget();
  const now = new Date();
  let pendingNote = '';
  if (t && now.getDate() < 10 && quarters.includes(t.quarter)) {
    quarters = quarters.filter((q) => q !== t.quarter);
    pendingNote = `<div class="msg">📌 ${qLabel(t.quarter)} 的成績於 ${t.fillMonth} 月 10 號後開放查詢。</div>`;
  }
  let msgBlock = '';
  // 分季呈現：凸顯一則（優先符合條件者，否則最新），其餘收合
  const featuredBlock = (list, title, isFeatured, bubbleOf, moreLabel) => {
    if (!list || !list.length) return '';
    const items = list.slice().sort((a, b) => qSortKey(b.quarter) - qSortKey(a.quarter)); // 新到舊
    let idx = items.findIndex(isFeatured);
    if (idx < 0) idx = 0;
    let inner = bubbleOf(items[idx]);
    const rest = items.filter((_, i) => i !== idx);
    if (rest.length) inner += `<details style="margin-top:6px"><summary class="muted" style="cursor:pointer">${moreLabel}（${rest.length}）</summary>${rest.map(bubbleOf).join('')}</details>`;
    return `<div class="card"><b>${title}</b>${inner}</div>`;
  };
  const cur = introQuarter();
  const curStr = `${cur.year}-Q${cur.q}`;
  const nextStr = (q) => { let y = qYear(q); let n = qNum(q); if (n === 4) { y += 1; n = 1; } else { n += 1; } return `${y}-Q${n}`; };
  // 夥伴留言：本季全部展開，舊季收合（每則標季度）
  const toMe = (data.messagesToMe || []).slice().sort((a, b) => qSortKey(b.quarter) - qSortKey(a.quarter));
  const curMsgs = toMe.filter((m) => m.quarter === curStr);
  const oldMsgs = toMe.filter((m) => m.quarter !== curStr);
  const fromLabel = (m) => `<div class="muted" style="font-size:.85em;margin-top:4px;text-align:right">— ${m.from ? escapeHtml(m.from) : '匿名夥伴'}</div>`;
  const qBubble = (m) => `<div class="msgbubble"><div class="muted" style="font-size:.85em;margin-bottom:4px">📅 ${qLabel(m.quarter)}</div>${escapeHtml(m.msg)}${fromLabel(m)}</div>`;
  let toMeInner = curMsgs.length
    ? curMsgs.map((m) => `<div class="msgbubble">${escapeHtml(m.msg)}${fromLabel(m)}</div>`).join('')
    : '<p class="muted">這一季還沒有夥伴留言給你</p>';
  if (oldMsgs.length) toMeInner += `<details style="margin-top:6px"><summary class="muted" style="cursor:pointer">查看其他季度的留言（${oldMsgs.length}）</summary>${oldMsgs.map(qBubble).join('')}</details>`;
  msgBlock += `<div class="card"><b>💬 夥伴對你說的話</b>${toMeInner}</div>`;
  msgBlock += featuredBlock(
    data.myNotes, '💌 你寫給自己的話',
    (m) => nextStr(m.quarter) === curStr, // 優先「上一季寫給這一季」
    (m) => `<div class="msgbubble"><div class="muted" style="font-size:.85em;margin-bottom:4px">📅 ${qLabel(m.quarter)}的你，寫給 ${qLabel(nextStr(m.quarter))}的你</div>${escapeHtml(m.msg)}</div>`,
    '查看其他季度寫給自己的話',
  );
  msgBlock += featuredBlock(
    data.supervisorFeedback, '📋 主管給你的表現回饋',
    (m) => m.quarter === curStr, // 優先當季
    (m) => `<div class="msgbubble"><div class="muted" style="font-size:.85em;margin-bottom:4px">📅 ${qLabel(m.quarter)}</div>${escapeHtml(m.msg)}</div>`,
    '查看其他季度的表現回饋',
  );

  if (!quarters.length) {
    pane.innerHTML = `${pendingNote}${msgBlock}<div class="msg">目前尚無可查詢的成績。</div>`;
    return;
  }

  // 主管 ± 調整：計入實際分數（表現分未計時，表現調整不計，與 scoring.finalScore 一致）
  const adjByQ = new Map((data.adjustments || []).map((a) => [a.quarter, a]));
  const qTotal = (q) => {
    const att = sumItems(byQuarter[q].att);
    if (att === null) return null;
    const perf = sumItems(byQuarter[q].perf);
    const adj = adjByQ.get(q) || {};
    return att + (adj.attitudeAdjust || 0) + (perf === null ? 0 : perf + (adj.performanceAdjust || 0));
  };
  const rows = quarters.map((q, i) => {
    const att = sumItems(byQuarter[q].att);
    const perf = sumItems(byQuarter[q].perf);
    const adj = adjByQ.get(q) || {};
    const adjVal = att === null ? null : (adj.attitudeAdjust || 0) + (perf === null ? 0 : (adj.performanceAdjust || 0));
    // 有調整就顯示數字（正負抵銷為 0 也顯示 0），完全沒調整才顯示 —
    const hasAdj = att !== null && ((adj.attitudeAdjust || 0) !== 0 || (perf !== null && (adj.performanceAdjust || 0) !== 0));
    const adjText = hasAdj ? (adjVal > 0 ? `+${round1(adjVal)}` : `${round1(adjVal)}`) : '—';
    const total = qTotal(q);
    const prevTotal = i > 0 ? qTotal(quarters[i - 1]) : null;
    return `<tr><td>${qLabel(q)}</td><td>${numText(att)}</td><td>${perf === null ? '未計' : numText(perf)}</td><td>${adjText}</td><td><b>${numText(total)}</b></td><td>${diffText(total, prevTotal)}</td></tr>`;
  }).join('');
  const table = `<div class="card"><b>各季小計</b>（實際分數已含自評與主管調整）<table><tr><th>季度</th><th>職能態度總分</th><th>職能表現總分</th><th>主管調整</th><th>實際分數</th><th>與上季</th></tr>${rows}</table></div>`;

  const curQ = quarters[quarters.length - 1];
  const prevQ = quarters.length >= 2 ? quarters[quarters.length - 2] : null;
  const catList = (q, kind) => [...(byQuarter[q][kind] || [])];
  const official = (q) => [...catList(q, 'att'), ...catList(q, 'perf')];

  // 最新一季 vs 前一季（官方值），直接標季度名稱避免「當季」誤解
  const trendTitle = prevQ ? `細項分數：${qLabel(curQ)} vs ${qLabel(prevQ)}` : `細項分數：${qLabel(curQ)}`;
  const trend = compareBlock(trendTitle, official(curQ).map((x) => x.label),
    prevQ ? official(prevQ) : [], official(curQ), prevQ ? qLabel(prevQ) : '前一季（無資料）', qLabel(curQ));

  // 自評 vs 他評（當季）
  let selfCompare = '';
  const selfItems = [...catList(curQ, 'attSelf'), ...catList(curQ, 'perfSelf')];
  if (selfItems.length) {
    const peerItems = [...catList(curQ, 'attPeer'), ...catList(curQ, 'perfPeer')];
    selfCompare = compareBlock(`自評 vs 他評（${qLabel(curQ)}）`, selfItems.map((x) => x.label), peerItems, selfItems, '他評', '自評');
  }

  // 分數落點 → 時薪對照（計時適用）。級距來自試算表「時薪級距」分頁（config.wageTiers）；
  // 後端尚未回傳時用內建預設，避免空窗。
  let wageTable = '';
  if (data.role === '計時') {
    const DEFAULT_TIERS = [
      ['96 分以上', '340 元'], ['91～95 分', '300 元'], ['86～90 分', '280 元'],
      ['81～85 分', '230 元'], ['76～80 分', '220 元'], ['71～75 分', '210 元'],
      ['66～70 分', '205 元'], ['65 分以下', '法定時薪'],
    ];
    const tiers = (state.config && Array.isArray(state.config.wageTiers) && state.config.wageTiers.length)
      ? state.config.wageTiers : DEFAULT_TIERS;
    wageTable = `<div class="card"><b>💰 分數落點時薪對照</b><table><tr><th>實際分數</th><th>時薪</th></tr>${tiers.map(([r, w]) => `<tr><td>${escapeHtml(r)}</td><td>${escapeHtml(w)}</td></tr>`).join('')}</table></div>`;
  }

  pane.innerHTML = pendingNote + msgBlock + table + selfCompare + trend + wageTable;
}

// ===== 分頁切換 =====
function switchTab(which) {
  document.getElementById('fillPane').style.display = which === 'fill' ? '' : 'none';
  document.getElementById('selfPane').style.display = which === 'self' ? '' : 'none';
  document.getElementById('scorePane').style.display = which === 'scores' ? '' : 'none';
  document.getElementById('btnFill').classList.toggle('active', which === 'fill');
  document.getElementById('btnSelf').classList.toggle('active', which === 'self');
  document.getElementById('btnMyScores').classList.toggle('active', which === 'scores');
  if (which === 'scores') renderScores();
}

async function init() {
  const clr = () => {
    const a = document.getElementById('acc'); const p = document.getElementById('pw');
    if (a) a.value = ''; if (p) p.value = '';
  };
  clr(); setTimeout(clr, 300);
  try {
    state.config = await fetchConfig();
  } catch {
    document.getElementById('loginErr').style.display = 'block';
    document.getElementById('loginErr').textContent = '載入失敗，請重新整理';
  }
}

document.getElementById('loginBtn').onclick = async () => {
  const acc = document.getElementById('acc').value.trim();
  const pw = document.getElementById('pw').value;
  const errBox = document.getElementById('loginErr');
  errBox.style.display = 'none';
  try {
    const res = await login(acc, pw);
    if (!res.ok) { errBox.style.display = 'block'; errBox.textContent = '帳號或密碼錯誤'; return; }
    state.me = { name: res.name, role: res.role };
    state.auth = { account: acc, password: pw };
    document.getElementById('loginGate').style.display = 'none';
    document.getElementById('evalForm').style.display = 'block';
    document.getElementById('hello').textContent = `${res.name}（${res.role}）你好`;
    renderIntro();
    renderFill();
    renderSelf();
    switchTab('fill');
    // 本季已送出過互評 → 收起表格、鎖送出鈕，說明原因
    if (res.alreadyDone && state.fillQuarter) {
      clearPeerDraft(state.fillQuarter);
      document.getElementById('forms').style.display = 'none';
      document.getElementById('submit').disabled = true;
      showResult('ok', `你已經送出過 ${qLabel(state.fillQuarter)} 的評鑑，謝謝！每人每季只能送出一次，無法再修改或重填。`);
    }
  } catch {
    errBox.style.display = 'block'; errBox.textContent = '連線失敗，請稍後再試';
  }
};

document.getElementById('btnFill').onclick = () => switchTab('fill');
document.getElementById('btnSelf').onclick = () => switchTab('self');
document.getElementById('btnMyScores').onclick = () => switchTab('scores');
document.getElementById('addPeerMsg').onclick = () => addPeerRow();
document.getElementById('btnLogout').onclick = () => window.location.reload(); // 回登入頁

document.getElementById('savePw').onclick = async () => {
  const msg = document.getElementById('pwMsg');
  const pw = document.getElementById('newPw').value;
  const pw2 = document.getElementById('newPw2').value;
  if (!pw || pw.length < 4) { msg.className = 'msg err'; msg.textContent = '新密碼至少 4 碼'; return; }
  if (pw !== pw2) { msg.className = 'msg err'; msg.textContent = '兩次輸入不一致'; return; }
  const btn = document.getElementById('savePw');
  btn.disabled = true; msg.className = 'muted'; msg.textContent = '儲存中…';
  try {
    const res = await changePassword(state.auth.account, state.auth.password, pw);
    if (res.ok) {
      state.auth.password = pw;
      document.getElementById('newPw').value = '';
      document.getElementById('newPw2').value = '';
      msg.className = 'msg ok'; msg.textContent = '密碼已更新';
    } else {
      msg.className = 'msg err';
      msg.textContent = res.reason === 'tooshort' ? '新密碼至少 4 碼' : '更新失敗，請重試';
    }
  } catch { msg.className = 'msg err'; msg.textContent = '連線失敗，請稍後再試'; }
  btn.disabled = false;
};

// 送出前的確認小視窗：回傳 true=確定送出、false=回去繼續填
function askConfirm(html) {
  return new Promise((resolve) => {
    const ov = document.getElementById('confirmOverlay');
    document.getElementById('confirmText').innerHTML = html;
    ov.style.display = 'flex';
    const done = (v) => { ov.style.display = 'none'; resolve(v); };
    document.getElementById('confirmOk').onclick = () => done(true);
    document.getElementById('confirmCancel').onclick = () => done(false);
  });
}

document.getElementById('submit').onclick = async () => {
  if (!state.fillQuarter) return;
  const ratees = state.config.accounts.filter((a) => a.name !== state.me.name);
  const ratings = ratees.map((r) => {
    const e = state.ratings.get(r.name);
    return { ratee: r.name, rateeRole: e.rateeRole, attitude: e.attitude, performance: e.performance };
  });
  const ctx = {
    ratees: ratees.map((r) => ({ name: r.name, role: r.role })),
    raterRole: state.me.role,
    attitudeCounts: { 計時: state.config.banks.ptAttitude.length, 正職: state.config.banks.ftAttitude.length },
    perfCounts: { 計時: state.config.banks.ptPerf.length },
  };
  const { complete, incomplete } = splitPeerSubmission(ratings, ctx);
  const errBox = document.getElementById('errors');
  if (!complete.length) {
    errBox.style.display = 'block';
    errBox.textContent = '還沒有任何一位同仁的評分填寫完成，至少要完整評完一位才能送出。';
    return;
  }
  errBox.style.display = 'none';
  const warn = incomplete.length
    ? `<p>以下同仁的評分還沒填完，這次送出<b>不會包含他們</b>：</p>`
      + `<p><b>${incomplete.join('、')}</b></p>`
      + '<p>每人每季只能送出一次，送出後就不能再補評或修改。</p>'
    : '<p>每人每季只能送出一次，送出後就不能再修改或重填。</p>';
  const go = await askConfirm(warn + '<p><b>確定要送出嗎？</b></p>');
  if (!go) return;
  const btn = document.getElementById('submit');
  btn.disabled = true;
  const quarter = state.fillQuarter;
  const payload = { type: 'peer', quarter, rater: state.me.name, raterRole: state.me.role, note: '', ratings: complete };
  try {
    const res = await submitPeer(payload);
    if (res.ok) { clearPeerDraft(quarter); showResult('ok', `已完成 ${qLabel(quarter)} 的評鑑，謝謝你的回饋！`); document.getElementById('forms').style.display = 'none'; }
    else if (res.reason === 'duplicate') { clearPeerDraft(quarter); showResult('ok', `你已經評過 ${qLabel(quarter)} 了，謝謝！`); document.getElementById('forms').style.display = 'none'; }
    else { throw new Error('rejected'); }
  } catch { showResult('err', '送出失敗，請稍後再試一次'); btn.disabled = false; }
};

document.getElementById('selfSubmit').onclick = async () => {
  if (!state.selfQuarter) return;
  const attCount = bankFor(state.me.role, 'attitude').length;
  const perfCount = state.me.role === '計時' ? bankFor('計時', 'perf').length : 0;
  const valid = (arr, n) => Array.isArray(arr) && arr.length === n && arr.every((s) => Number.isInteger(s) && s >= 1 && s <= 5);
  const errBox = document.getElementById('selfErrors');
  if (!valid(state.self.attitude, attCount) || (perfCount && !valid(state.self.performance, perfCount))) {
    errBox.style.display = 'block'; errBox.textContent = '請完成所有項目的評分'; return;
  }
  errBox.style.display = 'none';
  const btn = document.getElementById('selfSubmit');
  btn.disabled = true;
  const quarter = state.selfQuarter;
  const peerMessages = [...document.querySelectorAll('#peerMsgs .peermsg')]
    .map((r) => ({ to: r.querySelector('.peer-to').value, msg: r.querySelector('.peer-msg').value, anon: r.querySelector('.peer-anon-cb').checked }))
    .filter((m) => m.to && m.msg.trim());
  const payload = {
    type: 'self', quarter, person: state.me.name, role: state.me.role,
    attitude: state.self.attitude, performance: state.self.performance,
    selfNote: document.getElementById('selfNote').value,
    companyNote: document.getElementById('companyNote').value,
    peerMessages,
  };
  try {
    const res = await submitSelf(payload);
    if (res.ok) { clearSelfDraft(quarter); showSelfResult('ok', `已完成 ${qLabel(quarter)} 的自評，謝謝！`); document.getElementById('selfForms').style.display = 'none'; }
    else if (res.reason === 'duplicate') { clearSelfDraft(quarter); showSelfResult('ok', `你已經自評過 ${qLabel(quarter)} 了，謝謝！`); btn.disabled = false; }
    else { throw new Error('rejected'); }
  } catch { showSelfResult('err', '送出失敗，請稍後再試一次'); btn.disabled = false; }
};

init();
