import { login, fetchConfig, submitPeer, submitSelf, myScores, changePassword, setDemo, setDemoData, isDemo, fetchNewbieList, submitNewbie } from './api.js';
import { buildDemoData } from './demo.js';
import { splitPeerSubmission } from './validate.js';
import { averageItems, round1, kpiItemScore, ftAttitudeScale, gradeFor, GRADE_TABLE, wageTierIndex, capScore } from './scoring.js';
import { newbieStatus, pendingList, newbieScore } from './newbie.js';

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
// 示範模式用：非開放月份也給一個填寫季度（剛結束的上一季），讓表單畫得出來
function demoTarget(d = new Date()) {
  let y = d.getFullYear();
  let q = Math.floor(d.getMonth() / 3) + 1 - 1;
  if (q < 1) { q = 4; y -= 1; }
  return { year: y, q, quarter: `${y}-Q${q}`, fillMonth: d.getMonth() + 1 };
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

// ===== 非開放期間：本季評分項目唯讀預覽（只看題目，看不到星星、不能評分） =====
function curQuarterLabel(d = new Date()) {
  return `${d.getFullYear()} 年 ${QLABEL[Math.floor(d.getMonth() / 3) + 1]}`;
}
function previewNotice() {
  const div = document.createElement('div');
  div.className = 'msg';
  div.textContent = `👀 ${curQuarterLabel()}評分項目預覽：先看看這一季會用哪些項目評分，開放填寫後才能實際評分。`;
  return div;
}
function previewItemEl(idx, item) {
  const wrap = document.createElement('div');
  wrap.className = 'item';
  const title = document.createElement('div');
  title.textContent = `${idx + 1}. ${item.label}`;
  const help = document.createElement('details');
  help.className = 'help';
  help.innerHTML = '<summary class="muted">星等說明</summary>'
    + item.levels.map((lv, i) => `<div>${5 - i}★ ${lv}</div>`).join('');
  wrap.append(title, help);
  return wrap;
}
function previewBank(label, items, open) {
  const d = document.createElement('details');
  d.className = 'cat';
  if (open) d.open = true;
  const sum = document.createElement('summary');
  sum.textContent = `${label}（${items.length} 題）`;
  d.appendChild(sum);
  items.forEach((it, i) => d.appendChild(previewItemEl(i, it)));
  return d;
}
function closedBannerHtml() {
  return `目前非填寫期間，先開放預覽評分項目（不能評分）。開放填寫時間為每年 1、4、7、10 月的 1～5 號，下次開放：${nextOpenText()}。`;
}
// 正職本人的 KPI 項目預覽（主管評的表現分；資料來自 myScores 的 ftTemplate）
function kpiPreviewCard() {
  const card = document.createElement('div');
  card.className = 'card';
  const heading = '<b>職能表現 KPI（主管評分項目）</b>';
  card.innerHTML = `${heading}<p class="muted">載入中…</p>`;
  myScores(state.auth.account, state.auth.password).then((data) => {
    const tpl = (data && data.ok && Array.isArray(data.ftTemplate)) ? data.ftTemplate : [];
    if (!tpl.length) {
      card.innerHTML = `${heading}<p class="muted">目前還沒有設定你的 KPI 項目。</p>`;
      return;
    }
    const total = tpl.reduce((a, it) => a + (Number(it.weight) || 0), 0);
    const cats = [['技能', '個人工作技能（技能）'], ['執行力', '個人執行力內容（執行力）']];
    let html = `<b>職能表現 KPI（主管評分項目，滿分 ${total} 分）</b><p class="muted">這部分由主管依下列項目評分：</p>`;
    cats.forEach(([key, label]) => {
      const list = tpl.filter((it) => (it.type === '執行力') === (key === '執行力'));
      if (!list.length) return;
      html += `<div style="margin-top:8px"><b>${escapeHtml(label)}</b></div>`;
      list.forEach((it) => {
        const lv = it.levels || {};
        const std = key === '執行力'
          ? `<div>完成：拿 ${Number(it.weight) || 0} 分｜未完成：0 分</div>`
          : ['A', 'B', 'C', 'D'].filter((g) => lv[g]).map((g) => `<div>${g}：${escapeHtml(lv[g])}</div>`).join('');
        html += `<div class="item"><div>${escapeHtml(String(it.no))}. ${escapeHtml(it.label || '')}（${Number(it.weight) || 0} 分）</div>`
          + (it.target ? `<div class="muted">🎯 目標：${escapeHtml(String(it.target))}</div>` : '')
          + (std ? `<details class="help"><summary class="muted">衡量標準</summary>${std}</details>` : '')
          + '</div>';
      });
    });
    card.innerHTML = html;
  }).catch(() => {
    card.innerHTML = `${heading}<p class="muted">KPI 項目載入失敗，請重新整理再試。</p>`;
  });
  return card;
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
  const t = fillTarget() || (state.demo ? demoTarget() : null);
  const open = (state.demo || isFillOpen()) && t;
  const banner = document.getElementById('fillBanner');
  const showIds = ['fillHint', 'forms', 'submit'];
  if (!open) {
    state.fillQuarter = null;
    banner.className = 'card msg';
    banner.textContent = closedBannerHtml();
    showIds.forEach((id) => { document.getElementById(id).style.display = 'none'; });
    document.getElementById('result').style.display = 'none';
    // 唯讀預覽：本季會用來互評的題目（沒有星星、不能送出）
    const host = document.getElementById('forms');
    host.style.display = '';
    host.innerHTML = '';
    host.appendChild(previewNotice());
    host.appendChild(previewBank('評「正職同仁」時填的題目：職能態度', bankFor('正職', 'attitude'), true));
    host.appendChild(previewBank('評「計時同仁」時填的題目：職能態度', bankFor('計時', 'attitude'), false));
    host.appendChild(previewBank('評「計時同仁」時填的題目：職能表現', bankFor('計時', 'perf'), false));
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
  const t = fillTarget() || (state.demo ? demoTarget() : null);
  const open = (state.demo || isFillOpen()) && t;
  const banner = document.getElementById('selfBanner');
  const showIds = ['selfHint', 'selfForms', 'selfMsgs', 'selfSubmit'];
  if (!open) {
    state.selfQuarter = null;
    banner.className = 'card msg';
    banner.textContent = closedBannerHtml();
    showIds.forEach((id) => { document.getElementById(id).style.display = 'none'; });
    document.getElementById('selfResult').style.display = 'none';
    // 唯讀預覽：本季自評（＝別人評你）會用的題目；正職另附本人 KPI 項目
    const host = document.getElementById('selfForms');
    host.style.display = '';
    host.innerHTML = '';
    host.appendChild(previewNotice());
    host.appendChild(previewBank('職能態度（自評題目）', bankFor(state.me.role, 'attitude'), true));
    if (state.me.role === '計時') {
      host.appendChild(previewBank('職能表現（自評題目）', bankFor('計時', 'perf'), true));
    } else {
      host.appendChild(kpiPreviewCard());
    }
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

// 慢動作按鈕：按下後顯示「進行中＋已等待幾秒」，避免同仁以為當機沒反應。
// 打後端要 2～4 秒，原本只把按鈕變灰、文字不變，畫面看起來像沒動作。
// 回傳「結束」函式：呼叫它恢復原文字；傳 false 表示維持不可按（例如已送出成功）。
function btnWaiting(btn, label) {
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

  // 手動填的歷史成績（結果細項）：官方值，不拆自評/他評（已是最終分，態度不再套係數）
  (data.seeded || []).forEach((row) => {
    const q = ensure(row.quarter);
    const isAtt = row.category === '態度';
    const key = isAtt ? 'att' : 'perf';
    const max = isAtt ? (role === '正職' ? 6 : 5) : (role === '計時' ? 5 : undefined);
    (q[key] = q[key] || []).push({ label: row.label, score: row.score, cat: isAtt ? '職能態度' : '職能表現', max });
  });

  const recByQC = {};
  (data.records || []).forEach((r) => {
    recByQC[r.quarter] = recByQC[r.quarter] || {};
    (recByQC[r.quarter][r.category] = recByQC[r.quarter][r.category] || []).push(r.scores);
  });
  const selfByQC = {};
  (data.self || []).forEach((r) => { selfByQC[r.quarter] = selfByQC[r.quarter] || {}; selfByQC[r.quarter][r.category] = r.scores; });
  const spByQ = {};
  (data.supervisorPerf || []).forEach((sp) => { spByQ[sp.quarter] = { sel: sp.sel || {}, actual: sp.actual || {} }; });

  const quarters = new Set([].concat(Object.keys(recByQC), Object.keys(selfByQC), Object.keys(spByQ)));
  quarters.forEach((q) => {
    const qd = ensure(q);
    if (qd.att) return; // 已有手動填的官方值 → 不再計算
    const attBank = bankFor(role, 'attitude');
    const peerAtt = (recByQC[q] && recByQC[q]['態度']) || [];
    const selfAtt = selfByQC[q] && selfByQC[q]['態度'];
    if (peerAtt.length || selfAtt) {
      // 正職態度每星×1.2（滿分30，每題6分）；計時維持原始 1–5（滿分30，每題5分）
      const scale = role === '正職' ? ftAttitudeScale : (v) => v;
      const attMax = role === '正職' ? 6 : 5;
      const off = averageItems(selfAtt ? peerAtt.concat([selfAtt]) : peerAtt);
      qd.att = attBank.map((it, i) => ({ label: it.label, score: scale(off[i]), cat: '職能態度', max: attMax }));
      if (peerAtt.length) { const pa = averageItems(peerAtt); qd.attPeer = attBank.map((it, i) => ({ label: it.label, score: scale(pa[i]), max: attMax })); }
      if (selfAtt) qd.attSelf = attBank.map((it, i) => ({ label: it.label, score: scale(selfAtt[i]), max: attMax }));
    }
    if (role === '計時') {
      const perfBank = bankFor('計時', 'perf');
      const peerPerf = (recByQC[q] && recByQC[q]['表現']) || [];
      const selfPerf = selfByQC[q] && selfByQC[q]['表現'];
      if (peerPerf.length || selfPerf) {
        const off = averageItems(selfPerf ? peerPerf.concat([selfPerf]) : peerPerf);
        qd.perf = perfBank.map((it, i) => ({ label: it.label, score: off[i], cat: '職能表現', max: 5 }));
        if (peerPerf.length) { const pp = averageItems(peerPerf); qd.perfPeer = perfBank.map((it, i) => ({ label: it.label, score: pp[i], max: 5 })); }
        if (selfPerf) qd.perfSelf = perfBank.map((it, i) => ({ label: it.label, score: selfPerf[i], max: 5 }));
      }
    } else if (role === '正職' && spByQ[q]) {
      // 正職職能表現＝依本人職稱範本，每項 比重×等級%（執行力完成=比重、未完成=0）
      const tpl = data.ftTemplate || [];
      const sel = spByQ[q].sel || {};
      const act = spByQ[q].actual || {};
      const perfItems = tpl.map((it) => ({
        label: it.label || `第${it.no}項`, score: kpiItemScore(it, sel[it.key]),
        cat: it.type === '執行力' ? '個人執行力內容（執行力）' : '個人工作技能（技能）',
        max: Number(it.weight) || 0, actual: act[it.key], target: it.target, sel: sel[it.key], type: it.type,
      }));
      if (tpl.length && perfItems.every((p) => p.score !== null)) qd.perf = perfItems;
    }
  });
  return byQuarter;
}

function sumItems(items) { return items ? items.reduce((a, b) => a + b.score, 0) : null; }
function numText(n) { return n === null || n === undefined ? '—' : round1(n); }
// dark=true 時為深色底列（白字），下跌不上紅（會看不到）；淺色底列下跌顯示紅字。
function diffText(cur, prev, dark) {
  if (prev === null || prev === undefined || cur === null || cur === undefined) return '—';
  const d = round1(cur - prev);
  if (d > 0) return `▲+${d}`;
  if (d < 0) return dark ? `▼${d}` : `<span style="color:#d21f0f;font-weight:700">▼${d}</span>`;
  return '＝';
}

// 兩條線折線圖（name1 灰、name2 紅）
function lineChart(labels, s1, s2, name1, name2, yMax) {
  const W = Math.max(560, labels.length * 46);
  const H = 260;
  const padL = 34; const padR = 12; const padT = 30; const padB = 64;
  const x = (i) => padL + (labels.length <= 1 ? 0 : i * (W - padL - padR) / (labels.length - 1));
  const y = (v) => padT + (yMax - v) * (H - padT - padB) / yMax;
  // 有值才畫，遇 null 斷線（正職上季只有態度、KPI 為空 → 態度那段仍畫得出來）
  const poly = (arr, cls) => {
    if (!arr || !arr.length) return '';
    let segs = ''; let run = [];
    const flush = () => {
      if (run.length >= 2) segs += `<polyline class="${cls}" fill="none" stroke-width="2" points="${run.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}" />`;
      run = [];
    };
    arr.forEach((v, i) => { if (v === null || v === undefined) flush(); else run.push({ i, v }); });
    flush();
    const dots = arr.map((v, i) => ((v === null || v === undefined) ? '' : `<circle class="${cls}" cx="${x(i)}" cy="${y(v)}" r="3" />`)).join('');
    return segs + dots;
  };
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

// cats（可選）：與 labels 對齊的分類名陣列；分類變換處插一列分類標題（如職能態度／個人工作技能（技能））
function compareBlock(title, labels, series1, series2, name1, name2, cats) {
  const s1 = labels.map((lb) => { const f = series1.find((x) => x.label === lb); return f ? f.score : null; });
  const s2 = labels.map((lb) => { const f = series2.find((x) => x.label === lb); return f ? f.score : null; });
  const yMax = Math.max(5, Math.ceil(Math.max.apply(null, s1.concat(s2).filter((v) => v !== null).concat([5]))));
  const chart = lineChart(labels, s1, s2, name1, name2, yMax);
  let prevCat = null;
  const rows = labels.map((lb, i) => {
    let head = '';
    if (cats && cats[i] && cats[i] !== prevCat) {
      head = `<tr><td colspan="4" style="text-align:left;background:#fff6f2;font-weight:700;color:var(--brand-dark)">${escapeHtml(cats[i])}</td></tr>`;
      prevCat = cats[i];
    }
    return `${head}<tr><td style="text-align:left">${i + 1}. ${lb}</td><td>${numText(s2[i])}</td><td>${numText(s1[i])}</td><td>${diffText(s2[i], s1[i])}</td></tr>`;
  }).join('');
  return `<div class="card"><b>${title}</b>${chart}
    <table><tr><th>項目</th><th>${name2}</th><th>${name1}</th><th>差</th></tr>${rows}</table></div>`;
}

// 細項分數表（我的成績專用）：分類標題含配分、每分類下方小計、最下方三分類總加總；
// KPI 項目附「目標值／實際值」副行，讓同仁看見問題點。cur/prev 項目物件帶 {label,score,cat,max,actual,target}。
function detailBlock(title, prevItems, curItems, name1, name2, curFinal, prevFinal, showGrade) {
  const labels = curItems.map((x) => x.label);
  const s1 = labels.map((lb) => { const f = prevItems.find((x) => x.label === lb); return f ? f.score : null; });
  const s2 = curItems.map((x) => x.score);
  const yMax = Math.max(6, Math.ceil(Math.max.apply(null, s1.concat(s2).filter((v) => v !== null).concat([6]))));
  const chart = lineChart(labels, s1, s2, name1, name2, yMax);
  const cats = [];
  curItems.forEach((it) => { const c = it.cat || '其他'; if (!cats.includes(c)) cats.push(c); });
  const cfgTxt = (n) => (n ? `<span class="muted"> / ${round1(n)}</span>` : '');
  const HEAD = 'text-align:left;background:#fff6f2;font-weight:700;color:var(--brand-dark)';
  const SUB = 'background:#faf7f5;font-weight:600';
  const GRAND = 'background:var(--brand-dark);color:#fff;font-weight:700';
  let gCur = 0; let gPrev = 0; let gPrevHas = false; let gMax = 0; let body = '';
  cats.forEach((c) => {
    const items = curItems.filter((it) => (it.cat || '其他') === c);
    const cfg = items.reduce((a, b) => a + (Number(b.max) || 0), 0);
    body += `<tr><td colspan="4" style="${HEAD}">${escapeHtml(c)}${cfg ? `（滿分 ${round1(cfg)} 分）` : ''}</td></tr>`;
    let subCur = 0; let subPrev = 0; let subPrevHas = false;
    items.forEach((it) => {
      const i = labels.indexOf(it.label);
      const cur = it.score; const prev = s1[i];
      if (cur !== null && cur !== undefined) subCur += cur;
      if (prev !== null && prev !== undefined) { subPrev += prev; subPrevHas = true; }
      const hasMeta = (it.target !== undefined && it.target !== '') || (it.actual !== undefined && it.actual !== '');
      const meta = hasMeta
        ? `<div class="muted" style="font-size:.8em;margin-top:2px">🎯 目標 ${escapeHtml(String(it.target ?? '—'))}｜實際 <b style="color:var(--brand)">${escapeHtml(String(it.actual ?? '—'))}</b></div>`
        : '';
      body += `<tr><td style="text-align:left">${i + 1}. ${escapeHtml(it.label)}${meta}</td>`
        + `<td>${numText(cur)}${cfgTxt(it.max)}</td><td>${numText(prev)}</td><td>${diffText(cur, prev)}</td></tr>`;
    });
    body += `<tr><td style="text-align:left;${SUB}">小計</td>`
      + `<td style="${SUB}"><b>${round1(subCur)}</b>${cfgTxt(cfg)}</td>`
      + `<td style="${SUB}">${subPrevHas ? round1(subPrev) : '—'}</td>`
      + `<td style="${SUB}">${diffText(subCur, subPrevHas ? subPrev : null)}</td></tr>`;
    gCur += subCur; if (subPrevHas) { gPrev += subPrev; gPrevHas = true; } gMax += cfg;
  });
  // 等第／時薪一律依實際分數（態度＋表現＋主管加減分，上限100）判定；等第徽章僅正職顯示
  const curFinalV = (curFinal !== undefined && curFinal !== null) ? curFinal : gCur;
  const prevFinalV = (prevFinal !== undefined && prevFinal !== null) ? prevFinal : (gPrevHas ? gPrev : null);
  const curFinalCap = capScore(curFinalV);
  const prevFinalCap = capScore(prevFinalV);
  const gc = gradeFor(curFinalCap);
  const gp = gradeFor(prevFinalCap);
  const gTxt = (g) => (showGrade && g ? `<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:10px;background:#fff;color:var(--brand-dark);font-weight:800">${g.grade} 等</span>` : '');
  const capMark = (raw) => (raw !== null && raw > 100 ? '<span style="font-size:.78em;opacity:.85"> （上限100）</span>' : '');
  // 主管加減分 = 實際分數 − (態度＋表現)（用未封頂值算，如實反映主管給的分）
  const curAdj = round1(curFinalV - gCur);
  const prevAdj = (prevFinalV !== null && gPrevHas) ? round1(prevFinalV - gPrev) : null;
  const hasAdj = Math.abs(curAdj) > 0.05 || (prevAdj !== null && Math.abs(prevAdj) > 0.05);
  const adjTxt = (a) => ((a === null || Math.abs(a) < 0.05) ? '—' : (a > 0 ? `+${a}` : `${a}`));
  if (hasAdj) {
    // 有主管加減分：態度＋表現（中間小計）→ 主管加減分 → 實際分數（等第依據，上限100）
    body += `<tr><td style="text-align:left;${SUB}">態度＋表現</td>`
      + `<td style="${SUB}">${round1(gCur)}${gMax ? ` / ${round1(gMax)}` : ''}</td>`
      + `<td style="${SUB}">${gPrevHas ? round1(gPrev) : '—'}</td>`
      + `<td style="${SUB}">${diffText(gCur, gPrevHas ? gPrev : null)}</td></tr>`;
    body += `<tr><td style="text-align:left;${SUB}">主管加減分</td>`
      + `<td style="${SUB}">${adjTxt(curAdj)}</td><td style="${SUB}">${adjTxt(prevAdj)}</td><td style="${SUB}">—</td></tr>`;
    body += `<tr><td style="text-align:left;${GRAND}">實際分數（含加減分）</td>`
      + `<td style="${GRAND}"><b>${round1(curFinalCap)}</b> / 100${capMark(curFinalV)}${gTxt(gc)}</td>`
      + `<td style="${GRAND}">${prevFinalCap !== null ? round1(prevFinalCap) : '—'}${gTxt(gp)}</td>`
      + `<td style="${GRAND}">${diffText(curFinalCap, prevFinalCap, true)}</td></tr>`;
  } else {
    // 無主管加減分：態度＋表現＝最終分（上限100），等第直接標這列
    body += `<tr><td style="text-align:left;${GRAND}">總分（態度＋表現）</td>`
      + `<td style="${GRAND}"><b>${round1(curFinalCap)}</b>${gMax ? `<span style="opacity:.75"> / ${round1(gMax)}</span>` : ''}${capMark(curFinalV)}${gTxt(gc)}</td>`
      + `<td style="${GRAND}">${gPrevHas ? round1(capScore(gPrev)) : '—'}${gTxt(gp)}</td>`
      + `<td style="${GRAND}">${diffText(curFinalCap, gPrevHas ? capScore(gPrev) : null, true)}</td></tr>`;
  }
  return `<div class="card"><b>${title}</b>${chart}
    <table><tr><th>項目</th><th>${name2}</th><th>${name1}</th><th>差</th></tr>${body}</table>
    <div class="muted" style="font-size:.8em;margin-top:6px">${showGrade ? '考核等第' : '時薪落點'}依實際分數（態度＋表現＋主管加減分，上限100）判定，與上方「各季小計」一致。</div></div>`;
}

// 考核等第 × 獎金發放基數對照表；highlight 該季所屬等第。
function gradeTableBlock(curScore) {
  const cur = gradeFor(curScore);
  const rows = GRADE_TABLE.map((g) => {
    const on = cur && g.grade === cur.grade;
    const st = on ? 'background:#fff1c9;font-weight:700' : '';
    return `<tr style="${st}"><td>${g.grade} 等${on ? ' ◀' : ''}</td><td>${g.range}</td><td>${g.baseText}</td></tr>`;
  }).join('');
  return `<div class="card"><b>🏅 考核等第 × 獎金發放基數</b>
    <table><tr><th>考核等第</th><th>分數區間</th><th>實領發放基數</th></tr>${rows}</table>
    <div class="muted" style="font-size:.8em;margin-top:6px">備註：因考核等第導致未分配的剩餘獎金，將會保留至門市的聚餐獎金中，不另行累積或使用。</div></div>`;
}

// 分數落點 → 時薪對照（計時）。級距來自試算表「時薪級距」（config.wageTiers）；未回傳時用內建預設。
function wageBlock(myScore) {
  const DEFAULT_TIERS = [
    ['96 分以上', '340 元'], ['91～95 分', '300 元'], ['86～90 分', '280 元'],
    ['81～85 分', '230 元'], ['76～80 分', '220 元'], ['71～75 分', '210 元'],
    ['66～70 分', '205 元'], ['65 分以下', '法定時薪'],
  ];
  const tiers = (state.config && Array.isArray(state.config.wageTiers) && state.config.wageTiers.length)
    ? state.config.wageTiers : DEFAULT_TIERS;
  const hi = wageTierIndex(tiers, myScore);
  const rows = tiers.map(([r, w], i) => {
    const on = i === hi;
    const st = on ? ' style="background:#fff1c9;font-weight:700"' : '';
    const mark = on && myScore !== null && myScore !== undefined ? ` ◀ 落點 ${round1(myScore)} 分` : '';
    return `<tr${st}><td>${escapeHtml(r)}${mark}</td><td>${escapeHtml(w)}</td></tr>`;
  }).join('');
  return `<div class="card"><b>💰 分數落點時薪對照</b><table><tr><th>實際分數</th><th>時薪</th></tr>${rows}</table></div>`;
}

// 入職考核結果卡（新人才有；showWage＝還沒有任何季成績時，順便顯示時薪落點）
function newbieResultBlock(data, showWage) {
  const n = data && data.newbie;
  if (!n) return '';
  const sc = newbieScore(n.attitude || [], n.performance || []);
  const rowsOf = (items, scores) => items.map((it, i) => {
    const v = (scores || [])[i];
    return `<tr><td>${escapeHtml(it.label)}</td><td>${v === undefined || v === null ? '—' : v}</td></tr>`;
  }).join('');
  const detail = '<details style="margin-top:8px"><summary class="muted" style="cursor:pointer">看每一題的分數</summary>'
    + `<table><tr><th>職能態度</th><th>分數</th></tr>${rowsOf(bankFor('計時', 'attitude'), n.attitude)}</table>`
    + `<table style="margin-top:6px"><tr><th>職能表現</th><th>分數</th></tr>${rowsOf(bankFor('計時', 'perf'), n.performance)}</table></details>`;
  const card = '<div class="card"><b>🌱 入職考核</b>　<span class="muted">到職滿一個月，由店長考核一次</span>'
    + `<div class="muted" style="margin:6px 0">到職日 ${escapeHtml(n.hireDate || '—')}　·　考核日期 ${fmtLocalDate(n.time)}　·　考核者 ${escapeHtml(n.rater || '—')}</div>`
    + '<table><tr><th>職能態度</th><th>職能表現</th><th>總分</th></tr>'
    + `<tr><td>${numText(sc.attitude)} / 30</td><td>${numText(sc.performance)} / 70</td><td><b>${numText(sc.total)}</b> / 100</td></tr></table>`
    + detail + '</div>';
  return card + (showWage && data.role === '計時' ? wageBlock(sc.total) : '');
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
  if (!state.demo && t && now.getDate() < 10 && quarters.includes(t.quarter)) {
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
    // 剛到職的新人：還沒有任何一季成績，但可能已經有入職考核
    const nb0 = newbieResultBlock(data, true);
    const hint = nb0
      ? '目前還沒有你的季評鑑成績，第一次全員互評結束後就會出現在這裡。'
      : '目前尚無可查詢的成績。';
    pane.innerHTML = `${pendingNote}${msgBlock}${nb0}<div class="msg">${hint}</div>`;
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
    const totalCap = capScore(total); // 實際分數上限 100
    const capNote = (total !== null && total > 100) ? '<span class="muted" style="font-size:.75em">（上限100）</span>' : '';
    return `<tr><td>${qLabel(q)}</td><td>${numText(att)}</td><td>${perf === null ? '未計' : numText(perf)}</td><td>${adjText}</td><td><b>${numText(totalCap)}</b>${capNote}</td><td>${diffText(totalCap, capScore(prevTotal))}</td></tr>`;
  }).join('');
  const table = `<div class="card"><b>各季小計</b>（實際分數已含自評與主管調整）<table><tr><th>季度</th><th>職能態度總分</th><th>職能表現總分</th><th>主管調整</th><th>實際分數</th><th>與上季</th></tr>${rows}</table></div>`;

  const curQ = quarters[quarters.length - 1]; // 預設顯示最新一季（可由下拉切換）
  const catList = (q, kind) => [...(byQuarter[q][kind] || [])];
  const official = (q) => [...catList(q, 'att'), ...catList(q, 'perf')];

  // ===== 查詢：季度下拉，選哪一季就看那一季的完整細項（細項＋自評他評＋時薪/等第）=====
  const detailFor = (selQ) => {
    const i = quarters.indexOf(selQ);
    const pQ = i > 0 ? quarters[i - 1] : null; // 前一季（quarters 為舊→新）
    let html = '';
    // 自評 vs 他評（該季，有資料才顯示；手動匯入的歷史季無此拆分）
    const selfItems = [...catList(selQ, 'attSelf'), ...catList(selQ, 'perfSelf')];
    if (selfItems.length) {
      const peerItems = [...catList(selQ, 'attPeer'), ...catList(selQ, 'perfPeer')];
      html += compareBlock(`自評 vs 他評（${qLabel(selQ)}）`, selfItems.map((x) => x.label), peerItems, selfItems, '他評', '自評');
    }
    // 細項（選定季 vs 前一季）
    const title = pQ ? `細項分數：${qLabel(selQ)} vs ${qLabel(pQ)}` : `細項分數：${qLabel(selQ)}`;
    html += detailBlock(title, pQ ? official(pQ) : [], official(selQ),
      pQ ? qLabel(pQ) : '前一季（無資料）', qLabel(selQ),
      qTotal(selQ), pQ ? qTotal(pQ) : null, data.role === '正職');
    // 時薪落點（計時）／考核等第＋獎金（正職）；分數上限 100
    html += (data.role === '計時') ? wageBlock(capScore(qTotal(selQ))) : gradeTableBlock(capScore(qTotal(selQ)));
    return html;
  };

  // 季度下拉（新→舊），預設最新一季；只有一季時不顯示下拉
  const qsDesc = quarters.slice().sort((a, b) => qSortKey(b) - qSortKey(a));
  let selector = '';
  if (qsDesc.length >= 2) {
    const opts = qsDesc.map((q, i) => `<option value="${q}"${i === 0 ? ' selected' : ''}>${qLabel(q)}</option>`).join('');
    selector = `<div class="card"><b>🔎 查詢季度</b>　<select id="qSelect" style="font-size:15px;padding:5px 10px;border-radius:8px;border:1px solid #e3d8d2;background:#fff">${opts}</select>`
      + `<div class="muted" style="font-size:.8em;margin-top:6px">選擇要查看的季度，下方細項${data.role === '計時' ? '、時薪落點' : '、考核等第'}會跟著切換。</div></div>`;
  }

  const nbBlock = newbieResultBlock(data, false); // 有季成績時，時薪落點以季度那張為準
  pane.innerHTML = pendingNote + msgBlock + nbBlock + table + selector + `<div id="qDetail">${detailFor(curQ)}</div>`;
  const qSel = document.getElementById('qSelect');
  if (qSel) qSel.onchange = () => { document.getElementById('qDetail').innerHTML = detailFor(qSel.value); };
}

// ===== 新人入職考核（只有店長看得到這個分頁）=====
// 不受每季 1~5 號的填寫窗限制——新人到職滿月不會剛好落在那五天。
function fmtLocalDate(d) {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}/${x.getMonth() + 1}/${x.getDate()}`;
}
function newbieDraftKey(name) { return `mala-eval-draft:${state.auth.account}:newbie:${name}`; }
function loadNewbieDraft(name) {
  try { return JSON.parse(localStorage.getItem(newbieDraftKey(name)) || 'null'); } catch { return null; }
}
function newbieCard(person) {
  const attItems = bankFor('計時', 'attitude');
  const perfItems = bankFor('計時', 'perf');
  const draft = loadNewbieDraft(person.name) || {};
  const entry = {
    attitude: attItems.map((_, i) => (draft.attitude || [])[i] || 0),
    performance: perfItems.map((_, i) => (draft.performance || [])[i] || 0),
  };
  const save = () => { try { localStorage.setItem(newbieDraftKey(person.name), JSON.stringify(entry)); } catch (e) {} };

  const card = document.createElement('details');
  card.className = 'ratee';
  card.open = true;
  const sum = document.createElement('summary');
  sum.textContent = `${person.name}（${person.role}）`;
  card.appendChild(sum);

  const info = document.createElement('div');
  info.className = 'muted';
  info.style.margin = '4px 0 10px';
  const lateTxt = person.late
    ? `<b style="color:#d21f0f">已逾期 ${person.overdueDays} 天，請盡快完成</b>`
    : (person.overdueDays === 0 ? '<b>今天到期</b>' : `到期後第 ${person.overdueDays} 天`);
  info.innerHTML = `到職日 ${person.hireDate}　·　滿一個月 ${fmtLocalDate(person.dueOn)}　·　${lateTxt}`;
  card.appendChild(info);
  if (draft.attitude || draft.performance) {
    const note = document.createElement('div');
    note.className = 'msg';
    note.textContent = '📝 已自動還原你上次未送出的填寫進度';
    card.appendChild(note);
  }
  card.appendChild(catBlock('職能態度（6 題，滿分 30）', attItems, entry.attitude, true, save));
  card.appendChild(catBlock('職能表現（14 題，滿分 70）', perfItems, entry.performance, false, save));

  const btn = document.createElement('button');
  btn.textContent = `送出「${person.name}」的入職考核`;
  btn.style.marginTop = '10px';
  const msg = document.createElement('div');
  msg.className = 'msg';
  msg.style.display = 'none';
  const say = (cls, text) => { msg.className = `msg ${cls}`; msg.textContent = text; msg.style.display = 'block'; };
  btn.onclick = async () => {
    if (entry.attitude.some((v) => !v) || entry.performance.some((v) => !v)) {
      say('err', '還有題目沒評到，兩個區塊的每一題都要點星星才能送出。');
      return;
    }
    const sc = newbieScore(entry.attitude, entry.performance);
    const yes = await askConfirm(
      `<b>${escapeHtml(person.name)}</b> 的入職考核<br><br>`
      + `職能態度 <b>${sc.attitude}</b> / 30　　職能表現 <b>${sc.performance}</b> / 70<br>`
      + `總分 <b>${sc.total}</b> / 100<br><br>`
      + '送出後<b>不能修改或重填</b>，確定要送出嗎？');
    if (!yes) return;
    const done = btnWaiting(btn, '送出中…');
    try {
      const res = await submitNewbie({
        type: 'newbieSubmit',
        account: state.auth.account, password: state.auth.password,
        ratee: person.name, attitude: entry.attitude, performance: entry.performance,
      });
      if (res && res.ok) {
        try { localStorage.removeItem(newbieDraftKey(person.name)); } catch (e) {}
        renderNewbie();   // 整塊重繪，這顆按鈕會跟著消失，不用還原
        return;
      }
      const why = {
        duplicate: '這位同仁的入職考核已經有人送出過了，不能重複送。',
        forbidden: '只有店長可以填新人入職考核。',
        unauthorized: '登入狀態失效，請重新登入後再試。',
        incomplete: '每一題都要評分（1～5 星）才能送出。',
        demo: '🔒 示範模式：不會實際儲存。',
      }[res && res.reason] || '送出失敗，請稍後再試。';
      say('err', why);
    } catch (e) {
      say('err', '連線失敗，請稍後再試。');
    }
    done();
  };
  card.append(btn, msg);
  return card;
}
async function renderNewbie() {
  const pane = document.getElementById('newbiePane');
  pane.innerHTML = '<p class="muted">載入中…</p>';
  let data;
  try { data = await fetchNewbieList(state.auth.account, state.auth.password); }
  catch (e) { pane.innerHTML = '<div class="msg err">載入失敗，請稍後再試</div>'; return; }
  if (!data || !data.ok) {
    pane.innerHTML = data && data.reason === 'forbidden'
      ? '<div class="msg err">只有店長可以使用新人入職考核。</div>'
      : '<div class="msg err">無法讀取新人名單，請稍後再試。</div>';
    return;
  }
  const doneNames = (data.done || []).map((d) => d.ratee);
  const due = pendingList(data.accounts, doneNames);
  const waiting = (data.accounts || [])
    .map((a) => ({ ...a, ...newbieStatus({ hireDate: a.hireDate, done: doneNames.includes(a.name) }) }))
    .filter((a) => a.state === 'waiting')
    .sort((a, b) => a.daysLeft - b.daysLeft);

  pane.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'card';
  head.innerHTML = '<b>🌱 新人入職考核</b><div class="muted" style="margin-top:6px">'
    + '新進同仁到職滿一個月時，由你單獨考核一次，題目跟計時同仁的季考核一樣（態度 6 題＋表現 14 題，滿分 100）。'
    + '這一筆只做一次，之後他就跟大家一起參加每季評鑑。<br>'
    + '名單依「帳號」分頁的到職日自動出現，填完就會從待辦消失。</div>';
  pane.appendChild(head);

  if (due.length) {
    const sec = document.createElement('div');
    sec.className = 'group'; // 與互評畫面同一種區塊樣式
    const h = document.createElement('h2');
    h.textContent = `待考核（${due.length}）`;
    sec.appendChild(h);
    due.forEach((person) => sec.appendChild(newbieCard(person)));
    pane.appendChild(sec);
  } else {
    const none = document.createElement('div');
    none.className = 'msg';
    none.textContent = '目前沒有需要考核的新人。';
    pane.appendChild(none);
  }

  if (waiting.length) {
    const box = document.createElement('div');
    box.className = 'card';
    box.innerHTML = '<b>⏳ 還沒滿一個月</b><table><tr><th>姓名</th><th>到職日</th><th>滿一個月</th><th>還有幾天</th></tr>'
      + waiting.map((w) => `<tr><td>${escapeHtml(w.name)}（${escapeHtml(w.role)}）</td><td>${escapeHtml(w.hireDate)}</td><td>${fmtLocalDate(w.dueOn)}</td><td>${w.daysLeft} 天</td></tr>`).join('')
      + '</table>';
    pane.appendChild(box);
  }
  if (data.done && data.done.length) {
    const box = document.createElement('div');
    box.className = 'card';
    box.innerHTML = `<details><summary class="muted" style="cursor:pointer">已完成的入職考核（${data.done.length}）</summary><table><tr><th>姓名</th><th>考核者</th><th>考核日期</th></tr>`
      + data.done.map((d) => `<tr><td>${escapeHtml(d.ratee)}</td><td>${escapeHtml(d.rater)}</td><td>${fmtLocalDate(d.time)}</td></tr>`).join('')
      + '</table></details>';
    pane.appendChild(box);
  }
}

// ===== 分頁切換 =====
function switchTab(which) {
  document.getElementById('fillPane').style.display = which === 'fill' ? '' : 'none';
  document.getElementById('selfPane').style.display = which === 'self' ? '' : 'none';
  document.getElementById('scorePane').style.display = which === 'scores' ? '' : 'none';
  document.getElementById('newbiePane').style.display = which === 'newbie' ? '' : 'none';
  document.getElementById('btnFill').classList.toggle('active', which === 'fill');
  document.getElementById('btnSelf').classList.toggle('active', which === 'self');
  document.getElementById('btnMyScores').classList.toggle('active', which === 'scores');
  document.getElementById('btnNewbie').classList.toggle('active', which === 'newbie');
  if (which === 'scores') renderScores();
  if (which === 'newbie') renderNewbie();
}

async function init() {
  const clr = () => {
    const a = document.getElementById('acc'); const p = document.getElementById('pw');
    if (a) a.value = ''; if (p) p.value = '';
  };
  clr(); setTimeout(clr, 300);
  const btn = document.getElementById('loginBtn');
  const done = btnWaiting(btn, '載入中…');
  try {
    state.config = await fetchConfig();
    done();
  } catch {
    done(false);                      // 載入失敗就不要讓人按（按了也會出錯）
    btn.textContent = '請重新整理';
    document.getElementById('loginErr').style.display = 'block';
    document.getElementById('loginErr').textContent = '載入失敗，請重新整理';
  }
}

// ===== 參觀帳號（test）：示範模式——真實同仁端＋主管端畫面，資料全是假的、不會儲存 =====
function enterDemo(res) {
  const demo = buildDemoData(state.config, res.ftTemplates);
  setDemoData(demo);
  setDemo(true); // 之後所有 api 讀取回假資料、寫入不打後端（admin-page 也共用同一旗標）
  state.demo = true;
  state.config = { ...state.config, accounts: demo.accounts }; // 互評名單改假名單
  state.me = { name: demo.meName, role: '計時' };
  state.auth = { account: 'test', password: 'test' };
  document.getElementById('loginGate').style.display = 'none';
  document.getElementById('evalForm').style.display = 'block';
  // 示範橫幅
  const bn = document.createElement('div');
  bn.className = 'card';
  bn.style.cssText = 'border-left:4px solid var(--brand);background:#fff3cd;color:#7a5b00';
  bn.innerHTML = '<b>🔒 示範模式</b>　以下同仁端與主管端畫面皆為<b>虛構假資料</b>，僅供參考。任何評分、留言、儲存都<b>不會實際生效</b>。（可點頁面最下方「主管登入」看主管端）';
  document.getElementById('evalForm').prepend(bn);
  document.getElementById('hello').textContent = `${demo.meName}（計時）你好（示範）`;
  renderIntro();
  renderFill();
  renderSelf();
  switchTab('fill');
}

document.getElementById('loginBtn').onclick = async () => {
  const acc = document.getElementById('acc').value.trim();
  const pw = document.getElementById('pw').value;
  const errBox = document.getElementById('loginErr');
  errBox.style.display = 'none';
  const doneBtn = btnWaiting(document.getElementById('loginBtn'), '開啟中…');
  try {
    const res = await login(acc, pw);
    doneBtn();
    if (!res.ok) { errBox.style.display = 'block'; errBox.textContent = '帳號或密碼錯誤'; return; }
    if (res.visitor) { enterDemo(res); return; } // 參觀帳號：示範模式（真實畫面＋假資料）
    state.me = { name: res.name, role: res.role };
    state.auth = { account: acc, password: pw };
    document.getElementById('loginGate').style.display = 'none';
    document.getElementById('evalForm').style.display = 'block';
    document.getElementById('hello').textContent = `${res.name}（${res.role}）你好`;
    renderIntro();
    renderFill();
    renderSelf();
    // 店長才看得到「新人考核」分頁（依「正職職稱」分頁的職稱判斷）
    document.getElementById('btnNewbie').style.display = res.isManager ? '' : 'none';
    switchTab('fill');
    // 本季已送出過互評 → 收起表格、鎖送出鈕，說明原因
    if (res.alreadyDone && state.fillQuarter) {
      clearPeerDraft(state.fillQuarter);
      document.getElementById('forms').style.display = 'none';
      document.getElementById('submit').disabled = true;
      showResult('ok', `你已經送出過 ${qLabel(state.fillQuarter)} 的評鑑，謝謝！每人每季只能送出一次，無法再修改或重填。`);
    }
  } catch {
    doneBtn();
    errBox.style.display = 'block'; errBox.textContent = '連線失敗，請稍後再試';
  }
};

document.getElementById('btnFill').onclick = () => switchTab('fill');
document.getElementById('btnSelf').onclick = () => switchTab('self');
document.getElementById('btnMyScores').onclick = () => switchTab('scores');
document.getElementById('btnNewbie').onclick = () => switchTab('newbie');
document.getElementById('addPeerMsg').onclick = () => addPeerRow();
document.getElementById('btnLogout').onclick = () => window.location.reload(); // 回登入頁

document.getElementById('savePw').onclick = async () => {
  const msg = document.getElementById('pwMsg');
  if (isDemo()) { msg.className = 'muted'; msg.textContent = '🔒 示範模式：不會實際修改密碼。'; return; }
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
  const done = btnWaiting(btn, '送出中…');
  const quarter = state.fillQuarter;
  const payload = {
    type: 'peer', quarter, rater: state.me.name, raterRole: state.me.role, note: '', ratings: complete,
    account: state.auth.account, password: state.auth.password,
  };
  try {
    const res = await submitPeer(payload);
    if (res.reason === 'demo') { done(); showResult('ok', '🔒 示範模式：這裡不會實際送出，僅供參考。'); }
    else if (res.ok) { done(false); clearPeerDraft(quarter); showResult('ok', `已完成 ${qLabel(quarter)} 的評鑑，謝謝你的回饋！`); document.getElementById('forms').style.display = 'none'; }
    else if (res.reason === 'duplicate') { done(false); clearPeerDraft(quarter); showResult('ok', `你已經評過 ${qLabel(quarter)} 了，謝謝！`); document.getElementById('forms').style.display = 'none'; }
    else { throw new Error('rejected'); }
  } catch { done(); showResult('err', '送出失敗，請稍後再試一次'); }
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
  const done = btnWaiting(btn, '送出中…');
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
    account: state.auth.account, password: state.auth.password,
  };
  try {
    const res = await submitSelf(payload);
    if (res.reason === 'demo') { done(); showSelfResult('ok', '🔒 示範模式：這裡不會實際送出，僅供參考。'); }
    else if (res.ok) { done(false); clearSelfDraft(quarter); showSelfResult('ok', `已完成 ${qLabel(quarter)} 的自評，謝謝！`); document.getElementById('selfForms').style.display = 'none'; }
    else if (res.reason === 'duplicate') { done(false); clearSelfDraft(quarter); showSelfResult('ok', `你已經自評過 ${qLabel(quarter)} 了，謝謝！`); }
    else { throw new Error('rejected'); }
  } catch { done(); showSelfResult('err', '送出失敗，請稍後再試一次'); }
};

init();
