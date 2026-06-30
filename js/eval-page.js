import { login, fetchConfig, submitPeer } from './api.js';
import { validatePeerSubmission } from './validate.js';

const state = { me: null, config: null, ratings: new Map() };
// ratings: ratee -> { rateeRole, attitude:number[], performance:number[]|null }

function bankFor(role, kind) {
  const b = state.config.banks;
  if (role === '計時') return kind === 'attitude' ? b.ptAttitude : b.ptPerf;
  return kind === 'attitude' ? b.ftAttitude : b.ftPerf;
}

function renderStars(values, idx, item, rank) {
  const wrap = document.createElement('div');
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
  help.innerHTML = '<summary class="muted">星等說明</summary>'
    + item.levels.map((lv, i) => `<div>${5 - i}★ ${lv}</div>`).join('');
  wrap.append(title, stars, help);
  return wrap;
}

function renderForms() {
  const host = document.getElementById('forms');
  host.innerHTML = '';
  const ratees = state.config.accounts.filter((a) => a.name !== state.me.name);
  ratees.forEach((r) => {
    const attitudeItems = bankFor(r.role, 'attitude');
    const showPerf = r.role === '計時' && state.me.role === '正職';
    const perfItems = showPerf ? bankFor('計時', 'perf') : [];
    const entry = {
      rateeRole: r.role,
      attitude: new Array(attitudeItems.length).fill(0),
      performance: showPerf ? new Array(perfItems.length).fill(0) : null,
    };
    state.ratings.set(r.name, entry);

    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h3');
    h.textContent = `${r.name}（${r.role}）`;
    card.appendChild(h);
    const a = document.createElement('div');
    a.innerHTML = '<b>職能態度</b>';
    attitudeItems.forEach((it, i) => a.appendChild(renderStars(entry.attitude, i, it)));
    card.appendChild(a);
    if (showPerf) {
      const p = document.createElement('div');
      p.innerHTML = '<b>職能表現</b>';
      perfItems.forEach((it, i) => p.appendChild(renderStars(entry.performance, i, it)));
      card.appendChild(p);
    }
    host.appendChild(card);
  });
}

function showResult(cls, text) {
  const box = document.getElementById('result');
  box.style.display = 'block';
  box.className = `msg ${cls}`;
  box.textContent = text;
}

async function init() {
  try { state.config = await fetchConfig(); }
  catch { document.getElementById('loginErr').style.display = 'block';
    document.getElementById('loginErr').textContent = '載入失敗，請重新整理'; }
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
    document.getElementById('title').textContent = `同仁評鑑（${state.config.quarter}）`;
    document.getElementById('loginGate').style.display = 'none';
    document.getElementById('evalForm').style.display = 'block';
    if (res.alreadyDone) {
      document.getElementById('evalForm').innerHTML =
        '<div class="msg ok">你本季已完成評鑑，謝謝你！</div>';
      return;
    }
    document.getElementById('hello').textContent = `${res.name}（${res.role}）你好`;
    renderForms();
  } catch {
    errBox.style.display = 'block'; errBox.textContent = '連線失敗，請稍後再試';
  }
};

document.getElementById('submit').onclick = async () => {
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
  const payload = {
    type: 'peer', quarter: state.config.quarter,
    rater: state.me.name, raterRole: state.me.role,
    note: document.getElementById('note').value, ratings,
  };
  try {
    const res = await submitPeer(payload);
    if (res.ok) {
      showResult('ok', '已完成，謝謝你的回饋！');
      document.getElementById('forms').style.display = 'none';
    } else if (res.reason === 'duplicate') {
      showResult('ok', '你本季已填寫過，謝謝！');
    } else { throw new Error('rejected'); }
  } catch {
    showResult('err', '送出失敗，請稍後再試一次'); btn.disabled = false;
  }
};

init();
