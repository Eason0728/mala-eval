// 計時同仁評鑑 — Apps Script 後端
// 職責：持久化與讀取，不重算分數（計分唯一來源在前端 js/scoring.js）。
//
// 需先在 Google Sheet 用「資料 → 命名範圍」建立：
//   CFG_quarter   (1 格)        例：2026-Q1
//   CFG_passcode  (1 格)        主管/管理頁通行碼
//   CFG_ratees    (1 欄多列)    受評同仁名單
//   CFG_items     (6 列 × 7 欄)  key | label | 5星 | 4星 | 3星 | 2星 | 1星
//   CFG_wage      (N 列 × 3 欄)  分下限 | 分上限 | 時薪
// 分頁：設定 / 評分紀錄 / 主管調整 / 結果（標題列見 README）

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function rng(name) { return ss().getRangeByName(name); }

function readConfig() {
  const quarter = rng('CFG_quarter').getValue();
  const ratees = rng('CFG_ratees').getValues().flat().filter(String);
  const items = rng('CFG_items').getValues()
    .filter((r) => r[0])
    .map((r) => ({ key: r[0], label: r[1], levels: r.slice(2, 7) }));
  const wageTable = rng('CFG_wage').getValues()
    .filter((r) => r[0] !== '' && r[0] !== null)
    .map((r) => ({ min: Number(r[0]), max: Number(r[1]), wage: Number(r[2]) }));
  return { quarter, ratees, items, wageTable };
}

function checkPass(pass) {
  return String(pass) === String(rng('CFG_passcode').getValue());
}

// 同季同指紋是否已填過。
function alreadySubmitted(quarter, fingerprint) {
  const values = ss().getSheetByName('評分紀錄').getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === quarter && values[i][10] === fingerprint) return true;
  }
  return false;
}

function handlePeer(p) {
  if (alreadySubmitted(p.quarter, p.fingerprint)) {
    return { ok: false, reason: 'duplicate' };
  }
  const sh = ss().getSheetByName('評分紀錄');
  const now = new Date();
  p.ratings.forEach((r) => {
    sh.appendRow([now, p.quarter, r.ratee].concat(r.scores).concat([p.note || '', p.fingerprint]));
  });
  return { ok: true };
}

function handleAdjust(p) {
  if (!checkPass(p.passcode)) return { ok: false, reason: 'unauthorized' };
  const sh = ss().getSheetByName('主管調整');
  const values = sh.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === p.quarter && values[i][1] === p.ratee) { rowIdx = i + 1; break; }
  }
  const row = [p.quarter, p.ratee, p.attitudeAdjust || 0, p.attitudeReason || '',
               p.competencyAdjust || 0, p.competencyReason || '', new Date(), '主管'];
  if (rowIdx === -1) sh.appendRow(row);
  else sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  return { ok: true };
}

function readAdminData(passcode, quarter) {
  if (!checkPass(passcode)) return { error: 'unauthorized' };
  const config = readConfig();
  const rec = ss().getSheetByName('評分紀錄').getDataRange().getValues();
  const peerRatings = [];
  for (let i = 1; i < rec.length; i++) {
    if (rec[i][1] === quarter) {
      peerRatings.push({ ratee: rec[i][2], scores: rec[i].slice(3, 9).map(Number) });
    }
  }
  const adj = ss().getSheetByName('主管調整').getDataRange().getValues();
  const adjustments = [];
  for (let i = 1; i < adj.length; i++) {
    if (adj[i][0] === quarter) {
      adjustments.push({
        ratee: adj[i][1],
        attitudeAdjust: Number(adj[i][2]) || 0, attitudeReason: adj[i][3] || '',
        competencyAdjust: Number(adj[i][4]) || 0, competencyReason: adj[i][5] || '',
      });
    }
  }
  return { config, peerRatings, adjustments };
}

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'config') return jsonOut(readConfig());
  if (action === 'adminData') {
    return jsonOut(readAdminData(e.parameter.passcode, e.parameter.quarter));
  }
  return jsonOut({ error: 'unknown action' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.type === 'peer') return jsonOut(handlePeer(p));
    if (p.type === 'adjust') return jsonOut(handleAdjust(p));
    return jsonOut({ ok: false, reason: 'unknown type' });
  } finally {
    lock.releaseLock();
  }
}
