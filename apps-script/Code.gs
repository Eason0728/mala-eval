// 計時同仁評鑑 — Apps Script 後端
// 職責：持久化與讀取，不重算分數（計分唯一來源在前端 js/scoring.js）。
//
// 【第一次安裝】在 Apps Script 編輯器選函式「setupSheet」按執行一次（會要求授權），
// 它會自動建立 4 個分頁、標題列、命名範圍，並把 6 題態度題與名單填好。
// 之後再「部署 → 網頁應用程式」即可。
//
// 命名範圍（setupSheet 會自動建立）：
//   CFG_quarter / CFG_passcode / CFG_ratees / CFG_items(6×7) / CFG_wage(N×3)
// 分頁：設定 / 評分紀錄 / 主管調整 / 結果

// ====== 一次性安裝 ======
function setupSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();

  // 1) 建立/取得分頁
  const ensure = (name, headers) => {
    let sh = book.getSheetByName(name);
    if (!sh) sh = book.insertSheet(name);
    if (headers) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  };
  const cfg = ensure('設定', null);
  ensure('評分紀錄', ['時間戳', '季度', '受評者', '效率', '互動', '團隊', '紀律', '學習', '出勤', '備註', '指紋']);
  ensure('主管調整', ['季度', '受評者', '態度調整', '態度原因', '職能調整', '職能原因', '時間', '操作者']);
  ensure('結果', ['季度', '受評者', '態度分', '態度調整', '職能分', '職能調整', '最終總分', '對應時薪', '互評份數']);

  // 2) 設定分頁內容
  cfg.clear();
  cfg.getRange('A1').setValue('季度');      cfg.getRange('B1').setValue('2026-Q1');
  cfg.getRange('A2').setValue('通行碼');
  cfg.getRange('B2').setNumberFormat('@').setValue('mala2026'); // 文字格式，避免數字被去前導零；← 部署後請改掉

  cfg.getRange('A4').setValue('受評同仁名單');
  const ratees = ['許雅筑', '王鈺屏', '楊磬瑋', '林宸妤', '徐佑昕', '王禹婕'];
  cfg.getRange(5, 2, ratees.length, 1).setValues(ratees.map((r) => [r])); // B5:B10

  cfg.getRange('A12').setValue('評分項目');
  cfg.getRange(13, 1, 1, 7).setValues([['key', '項目', '5星', '4星', '3星', '2星', '1星']]);
  const items = [
    ['efficiency', '工作效率與品質',
      '動作極迅速且極少失誤，能預見問題並在發生前處理。',
      '能獨立且穩定完成工作，極少需要他人覆核。',
      '符合基本速度要求，偶爾需提醒細節（如：漏餐）。',
      '動作較慢或常有小疏漏，需主管在旁督導或提醒。',
      '效率明顯落後，常導致出餐延遲或給錯、漏給餐。'],
    ['interaction', '與客人互動狀況',
      '主動觀察顧客需求（如：主動回答問題或主動提供服務），獲好評。',
      '能維持親切微笑與標準禮節，應對自然。',
      '能完成基本招呼與點餐，雖較被動但無服務過失。',
      '表現冷漠、缺乏眼神接觸，需提醒才會有禮貌。',
      '態度消極、口氣不佳，或曾遭顧客正式投訴。'],
    ['teamwork', '團隊合作與溝通能力',
      '主動觀察同仁壓力點並給予支援，溝通精確且正向。',
      '配合度高，能清楚回報進度並與同仁良好交接。',
      '可配合交辦任務，但不會主動觀察其他同仁的需求。',
      '訊息傳達不完整，需反覆確認才了解其工作進度。',
      '不願配合支援同仁，甚至與同仁發生口角。'],
    ['discipline', '公司規定遵守度與紀律性',
      '能確實執行衛生、服儀規範，並能主動糾正環境和提醒同仁。',
      '自律性強，基本上不需提醒即可遵守所有店內規定。',
      '偶有小疏忽（如：未戴帽子、未回覆群組訊息），經一次提醒後可立即改正。',
      '常違反規定（如：滑手機、服儀不整），需多次教育。',
      '嚴重違規，包含衛生習慣極差或故意不遵守門店紀律。'],
    ['learning', '學習與主動性',
      '會主動詢問新工作技能、學習進度超前，能分享學習心得給同仁。',
      '學習態度積極，交辦的新工作能快速上手並維持穩定。',
      '被動接受指導，能完成教過的範圍，但較少詢問「為什麼」。',
      '學習進度緩慢，同一項目教過多次仍無法獨立操作。',
      '抗拒學習新事物，或長期表現停滯不前。'],
    ['attendance', '出勤與守時狀況',
      '全勤準時，且總是提前 5-10 分鐘完成準備並就位。',
      '全勤，極少遲到（每季僅 2 次 <10 分鐘且有先行報備）。',
      '每月遲到一次，或因私事請假頻率在接受範圍內。',
      '每週遲到一次或常態性臨時請假，已造成排班困擾。',
      '有曠職紀錄，或多次嚴重遲到超過 30 分鐘以上。'],
  ];
  cfg.getRange(14, 1, items.length, 7).setValues(items); // A14:G19

  cfg.getRange('A22').setValue('時薪對照表（範例，請改成實際數字；含職能 70 分後總分才會落在此區間）');
  cfg.getRange(23, 1, 1, 3).setValues([['分下限', '分上限', '時薪']]);
  const wage = [[90, 100, 200], [80, 89, 195], [70, 79, 190], [60, 69, 185], [0, 59, 183]];
  cfg.getRange(24, 1, wage.length, 3).setValues(wage); // A24:C28

  // 3) 命名範圍（先移除同名再建立）
  book.getNamedRanges().forEach((nr) => {
    if (['CFG_quarter', 'CFG_passcode', 'CFG_ratees', 'CFG_items', 'CFG_wage'].indexOf(nr.getName()) >= 0) {
      nr.remove();
    }
  });
  book.setNamedRange('CFG_quarter', cfg.getRange('B1'));
  book.setNamedRange('CFG_passcode', cfg.getRange('B2'));
  book.setNamedRange('CFG_ratees', cfg.getRange(5, 2, ratees.length, 1));
  book.setNamedRange('CFG_items', cfg.getRange(14, 1, items.length, 7));
  book.setNamedRange('CFG_wage', cfg.getRange(24, 1, wage.length, 3));

  return '安裝完成：分頁、命名範圍、6 題與名單已建立。請改掉通行碼與時薪對照表。';
}

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
