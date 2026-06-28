import { fetchConfig, submitPeer } from './api.js';
import { validatePeerSubmission } from './validate.js';
import { deviceFingerprint } from './fingerprint.js';

const state = { config: null, ratings: new Map() }; // ratee -> number[6]

function storageKey(q) { return `peer_done_${q}`; }

function renderStars(ratee, item, idx) {
  const wrap = document.createElement('div');
  const title = document.createElement('div');
  title.textContent = `${idx + 1}. ${item.label}`;
  const stars = document.createElement('div');
  stars.className = 'stars';
  for (let v = 1; v <= 5; v++) {
    const s = document.createElement('span');
    s.textContent = '★';
    s.onclick = () => {
      state.ratings.get(ratee)[idx] = v;
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

function render() {
  document.getElementById('title').textContent = `計時同仁評鑑（${state.config.quarter}）`;
  const host = document.getElementById('forms');
  host.innerHTML = '';
  state.config.ratees.forEach((ratee) => {
    state.ratings.set(ratee, new Array(state.config.items.length).fill(0));
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h3');
    h.textContent = ratee;
    card.appendChild(h);
    state.config.items.forEach((item, idx) => card.appendChild(renderStars(ratee, item, idx)));
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
  try {
    state.config = await fetchConfig();
  } catch {
    showResult('err', '載入失敗，請重新整理');
    return;
  }
  if (localStorage.getItem(storageKey(state.config.quarter))) {
    document.getElementById('evalSection').innerHTML =
      '<div class="msg ok">這個裝置本季已完成評鑑，謝謝你！</div>';
    return;
  }
  render();
}

document.getElementById('submit').onclick = async () => {
  const ratings = state.config.ratees.map((r) => ({ ratee: r, scores: state.ratings.get(r) }));
  const errs = validatePeerSubmission(ratings, state.config.ratees, state.config.items.length);
  const errBox = document.getElementById('errors');
  if (errs.length) {
    errBox.style.display = 'block';
    errBox.innerHTML = errs.join('<br>');
    return;
  }
  errBox.style.display = 'none';
  const btn = document.getElementById('submit');
  btn.disabled = true;
  const payload = {
    type: 'peer', quarter: state.config.quarter,
    fingerprint: deviceFingerprint(), note: document.getElementById('note').value, ratings,
  };
  try {
    const res = await submitPeer(payload);
    if (res.ok) {
      localStorage.setItem(storageKey(state.config.quarter), '1');
      showResult('ok', '已完成，謝謝你的回饋！');
      document.getElementById('forms').style.display = 'none';
    } else if (res.reason === 'duplicate') {
      localStorage.setItem(storageKey(state.config.quarter), '1');
      showResult('ok', '本裝置本季已填寫過，謝謝！');
    } else {
      throw new Error('rejected');
    }
  } catch {
    showResult('err', '送出失敗，請稍後再試一次');
    btn.disabled = false;
  }
};

init();
