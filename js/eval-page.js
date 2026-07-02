import { login, fetchConfig, submitPeer, myScores, changePassword } from './api.js';
import { validatePeerSubmission } from './validate.js';
import { averageItems, round1 } from './scoring.js';

const state = { me: null, auth: null, config: null, ratings: new Map(), fillQuarter: null };

// ===== 季度鎖定與開放時間 =====
// 1月填上年Q4、4月填Q1、7月填Q2、10月填Q3。
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

function bankFor(role, kind) {
  const b = state.config.banks;
  if (role === '計時') return kind === 'attitude' ? b.ptAttitude : b.ptPerf;
  return kind === 'attitude' ? b.ftAttitude : b.ftPerf;
}

// ===== 填寫表單 =====
function renderStars(values, idx, item) {
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
    };
    stars.appendChild(s);
  }
  const help = document.createElement('details');
  help.className = 'help';
  help.innerHTML = '<summary class="muted">星等說明</summary>'
    + item.levels.map((lv, i) => `<div>${5 - i}★ ${lv}</div>`).join('');
  wrap.append(title, stars, help);
  return wrap;
}
function catBlock(label, items, values) {
  const d = document.createElement('details');
  d.className = 'cat';
  const sum = document.createElement('summary');
  sum.textContent = label;
  d.appendChild(sum);
  items.forEach((it, i) => d.appendChild(renderStars(values, i, it)));
  return d;
}
function rateeCard(r) {
  const attitudeItems = bankFor(r.role, 'attitude');
  const showPerf = r.role === '計時' && state.me.role === '正職';
  const perfItems = showPerf ? bankFor('計時', 'perf') : [];
  const entry = {
    rateeRole: r.role,
    attitude: new Array(attitudeItems.length).fill(0),
    performance: showPerf ? new Array(perfItems.length).fill(0) : null,
  };
  state.ratings.set(r.name, entry);
  const card = document.createElement('details');
  card.className = 'ratee';
  const sum = document.createElement('summary');
  sum.textContent = r.name;
  card.appendChild(sum);
  card.appendChild(catBlock('職能態度', attitudeItems, entry.attitude));
  if (showPerf) card.appendChild(catBlock('職能表現', perfItems, entry.performance));
  return card;
}
function renderForms() {
  const host = document.getElementById('forms');
  host.innerHTML = '';
  state.ratings.clear();
  const ratees = state.config.accounts.filter((a) => a.name !== state.me.name);
  [['正職同仁', '正職'], ['計時同仁', '計時']].forEach(([label, role]) => {
    const list = ratees.filter((r) => r.role === role);
    if (!list.length) return;
    const sec = document.createElement('div');
    sec.className = 'group';
    const h = document.createElement('h2');
    h.textContent = label;
    sec.appendChild(h);
    list.forEach((r) => sec.appendChild(rateeCard(r)));
    host.appendChild(sec);
  });
}

function renderFill() {
  const t = fillTarget();
  const open = isFillOpen() && t;
  const banner = document.getElementById('fillBanner');
  const showFill = ['fillHint', 'forms', 'submit'];
  if (!open) {
    state.fillQuarter = null;
    banner.className = 'card msg err';
    banner.textContent = `目前非填寫期間。開放時間為每年 1、4、7、10 月的 1～5 號，下次開放：${nextOpenText()}。`;
    showFill.forEach((id) => { document.getElementById(id).style.display = 'none'; });
    document.getElementById('result').style.display = 'none';
    return;
  }
  state.fillQuarter = t.quarter;
  banner.className = 'card';
  banner.innerHTML = `<b>填寫季度：${t.year} 年 ${QLABEL[t.q]}</b>`;
  showFill.forEach((id) => { document.getElementById(id).style.display = ''; });
  renderForms();
}

function showResult(cls, text) {
  const box = document.getElementById('result');
  box.style.display = 'block';
  box.className = `msg ${cls}`;
  box.textContent = text;
}

// ===== 我的成績 =====
// 把某季某類別的細項分數（label→score）整理出來
function itemsFor(quarterData, category) { return quarterData[category] || null; }

function buildMyQuarters(data) {
  const role = data.role;
  const byQuarter = {}; // quarter -> { 態度:[{label,score}], 表現:[{label,score}] }
  const ensure = (q) => (byQuarter[q] = byQuarter[q] || {});

  // 1) 手動填的（結果細項），優先
  (data.seeded || []).forEach((row) => {
    const q = ensure(row.quarter);
    (q[row.category] = q[row.category] || []).push({ label: row.label, score: row.score });
  });

  // 2) 從評分紀錄計算（沒有手動資料的季度才用）
  const recByQC = {}; // quarter -> {態度:[scores[]], 表現:[scores[]]}
  (data.records || []).forEach((r) => {
    recByQC[r.quarter] = recByQC[r.quarter] || {};
    (recByQC[r.quarter][r.category] = recByQC[r.quarter][r.category] || []).push(r.scores);
  });
  Object.keys(recByQC).forEach((q) => {
    const qd = ensure(q);
    if (!qd['態度']) {
      const avg = averageItems(recByQC[q]['態度']);
      if (avg) qd['態度'] = bankFor(role, 'attitude').map((it, i) => ({ label: it.label, score: avg[i] }));
    }
    if (!qd['表現'] && role === '計時') {
      const avg = averageItems(recByQC[q]['表現']);
      if (avg) qd['表現'] = bankFor('計時', 'perf').map((it, i) => ({ label: it.label, score: avg[i] }));
    }
  });
  // 3) 正職表現：主管評分
  if (role === '正職') {
    (data.supervisorPerf || []).forEach((sp) => {
      const qd = ensure(sp.quarter);
      if (!qd['表現'] && sp.scores.length) {
        qd['表現'] = bankFor('正職', 'perf').map((it, i) => ({ label: it.label, score: sp.scores[i] }));
      }
    });
  }
  return byQuarter;
}

function sumItems(items) { return items ? items.reduce((a, b) => a + b.score, 0) : null; }
function numText(n) { return n === null || n === undefined ? '—' : round1(n); }

// 兩條線（上季 vs 當季）的細項折線圖
function lineChart(labels, prev, cur, prevQ, curQ, yMax) {
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
    <line class="c-prev" x1="${padL}" y1="${H - 22}" x2="${padL + 24}" y2="${H - 22}" stroke-width="2"/><text x="${padL + 30}" y="${H - 18}" font-size="12">上季（${prevQ ? qLabel(prevQ) : '—'}）</text>
    <line class="c-cur" x1="${padL + 150}" y1="${H - 22}" x2="${padL + 174}" y2="${H - 22}" stroke-width="2"/><text x="${padL + 180}" y="${H - 18}" font-size="12">當季（${qLabel(curQ)}）</text>
    ${poly(prev, 'c-prev')}${poly(cur, 'c-cur')}
  </svg></div>`;
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

  // 本季（正在填寫的季度）成績要 10 號後才開放查詢
  const t = fillTarget();
  const now = new Date();
  let pendingNote = '';
  if (t && now.getDate() < 10 && quarters.includes(t.quarter)) {
    quarters = quarters.filter((q) => q !== t.quarter);
    pendingNote = `<div class="msg">📌 ${qLabel(t.quarter)} 的成績於 ${t.fillMonth} 月 10 號後開放查詢。</div>`;
  }

  if (!quarters.length) {
    pane.innerHTML = `${pendingNote}<div class="msg">目前尚無可查詢的成績。</div>`;
    return;
  }

  // 小計表
  const rows = quarters.map((q, i) => {
    const att = sumItems(byQuarter[q]['態度']);
    const perf = sumItems(byQuarter[q]['表現']);
    const total = att === null ? null : att + (perf === null ? 0 : perf);
    const prevTotal = i > 0 ? (() => { const p = quarters[i - 1]; const a = sumItems(byQuarter[p]['態度']); const pf = sumItems(byQuarter[p]['表現']); return a === null ? null : a + (pf === null ? 0 : pf); })() : null;
    let diff = '—';
    if (prevTotal !== null && total !== null) {
      const d = round1(total - prevTotal);
      diff = d > 0 ? `▲+${d}` : d < 0 ? `▼${d}` : '＝';
    }
    return `<tr><td>${qLabel(q)}</td><td>${numText(att)}</td><td>${perf === null ? '未計' : numText(perf)}</td><td><b>${numText(total)}</b></td><td>${diff}</td></tr>`;
  }).join('');
  const table = `<b>各季小計</b><table><tr><th>季度</th><th>職能態度總分</th><th>職能表現總分</th><th>實際分數</th><th>與上季</th></tr>${rows}</table>`;

  // 細項折線圖：當季 vs 上季
  const curQ = quarters[quarters.length - 1];
  const prevQ = quarters.length >= 2 ? quarters[quarters.length - 2] : null;
  const catList = (q) => [...(byQuarter[q]['態度'] || []), ...(byQuarter[q]['表現'] || [])];
  const curItems = catList(curQ);
  const labels = curItems.map((x) => x.label);
  const curVals = curItems.map((x) => x.score);
  const prevVals = prevQ ? labels.map((lb) => {
    const found = catList(prevQ).find((x) => x.label === lb);
    return found ? found.score : null;
  }) : null;
  const allVals = curVals.concat(prevVals ? prevVals.filter((v) => v !== null) : []);
  const yMax = Math.max(5, Math.ceil(Math.max.apply(null, allVals.length ? allVals : [5])));
  const chart = `<b>細項分數：當季 vs 上季</b>${lineChart(labels, prevVals && prevVals.every((v) => v !== null) ? prevVals : null, curVals, prevQ, curQ, yMax)}`;

  // 細項對照表（含項目名稱）
  const itemRows = labels.map((lb, i) => {
    const cv = curVals[i];
    const pv = prevVals ? prevVals[i] : null;
    let d = '—';
    if (pv !== null && pv !== undefined) {
      const dd = round1(cv - pv);
      d = dd > 0 ? `▲+${dd}` : dd < 0 ? `▼${dd}` : '＝';
    }
    return `<tr><td style="text-align:left">${i + 1}. ${lb}</td><td>${pv === null || pv === undefined ? '—' : round1(pv)}</td><td>${round1(cv)}</td><td>${d}</td></tr>`;
  }).join('');
  const itemTable = `<b>細項對照</b><table><tr><th>項目</th><th>上季</th><th>當季</th><th>變化</th></tr>${itemRows}</table>`;

  pane.innerHTML = pendingNote
    + `<div class="card">${table}</div>`
    + `<div class="card">${chart}</div>`
    + `<div class="card">${itemTable}</div>`;
}

// ===== 分頁切換 =====
function switchTab(which) {
  const fill = which === 'fill';
  document.getElementById('fillPane').style.display = fill ? '' : 'none';
  document.getElementById('scorePane').style.display = fill ? 'none' : '';
  document.getElementById('btnFill').classList.toggle('active', fill);
  document.getElementById('btnMyScores').classList.toggle('active', !fill);
  if (!fill) renderScores();
}

async function init() {
  // 登入欄位預設空白，避免瀏覽器自動帶入存過的帳密
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
    renderFill();
    switchTab('fill');
  } catch {
    errBox.style.display = 'block'; errBox.textContent = '連線失敗，請稍後再試';
  }
};

document.getElementById('btnFill').onclick = () => switchTab('fill');
document.getElementById('btnMyScores').onclick = () => switchTab('scores');

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
      state.auth.password = pw; // 之後查成績仍可用
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
  const errs = validatePeerSubmission(ratings, ctx);
  const errBox = document.getElementById('errors');
  if (errs.length) { errBox.style.display = 'block'; errBox.innerHTML = errs.join('<br>'); return; }
  errBox.style.display = 'none';
  const btn = document.getElementById('submit');
  btn.disabled = true;
  const quarter = state.fillQuarter;
  const payload = {
    type: 'peer', quarter,
    rater: state.me.name, raterRole: state.me.role,
    note: '', ratings,
  };
  try {
    const res = await submitPeer(payload);
    if (res.ok) {
      showResult('ok', `已完成 ${qLabel(quarter)} 的評鑑，謝謝你的回饋！`);
      document.getElementById('forms').style.display = 'none';
    } else if (res.reason === 'duplicate') {
      showResult('ok', `你已經評過 ${qLabel(quarter)} 了，謝謝！`);
      btn.disabled = false;
    } else { throw new Error('rejected'); }
  } catch {
    showResult('err', '送出失敗，請稍後再試一次'); btn.disabled = false;
  }
};

init();
