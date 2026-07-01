// 正職／計時分流評鑑 — Apps Script 後端。只持久化，不重算分數（計分在 js/scoring.js）。
// 【第一次安裝】在編輯器選 setupSheet 執行一次（會要求授權），建立分頁/命名範圍/種子資料。
// 命名範圍：CFG_quarter / CFG_passcode / CFG_accounts(N×5) /
//   CFG_pt_attitude / CFG_pt_perf / CFG_ft_attitude / CFG_ft_perf（各 M×7）/ CFG_wage(N×3 保留未用)
// 分頁：設定 / 帳號 / 評分紀錄 / 主管評分 / 主管調整 / 結果

function setupSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const ensure = (name, headers) => {
    let sh = book.getSheetByName(name);
    if (!sh) sh = book.insertSheet(name);
    if (headers) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  };
  const cfg = ensure('設定', null);
  ensure('帳號', ['姓名', '角色', '帳號', '密碼', '啟用']);
  ensure('評分紀錄', ['時間戳', '季度', '評核者', '評核者角色', '受評者', '受評者角色', '類別', '分數JSON', '備註']);
  ensure('主管評分', ['季度', '受評者', '分數JSON', '時間', '操作者']);
  ensure('主管調整', ['季度', '受評者', '態度調整', '態度原因', '表現調整', '表現原因', '時間', '操作者']);
  ensure('結果', ['季度', '受評者', '角色', '態度分', '態度調整', '表現分', '表現調整', '實際分數', '態度份數', '表現份數']);

  // 帳號種子（密碼請部署後改）
  const accSh = book.getSheetByName('帳號');
  const accounts = [
    ['許雅筑', '計時', 'hsu', 'pw-hsu', true],
    ['王鈺屏', '正職', 'wang', 'pw-wang', true],
    ['楊磬瑋', '計時', 'yang', 'pw-yang', true],
    ['林宸妤', '計時', 'lin', 'pw-lin', true],
    ['徐佑昕', '正職', 'hs-yh', 'pw-hsuyh', true],
    ['王禹婕', '計時', 'wang-yj', 'pw-wangyj', true],
  ];
  accSh.getRange(2, 1, accounts.length, 5).setValues(accounts);
  accSh.getRange(2, 4, accounts.length, 1).setNumberFormat('@'); // 密碼文字格式

  // 設定分頁
  cfg.clear();
  cfg.getRange('A1').setValue('季度');   cfg.getRange('B1').setValue('2026-Q1');
  cfg.getRange('A2').setValue('通行碼');
  cfg.getRange('B2').setNumberFormat('@').setValue('mala2026'); // ← 部署後請改掉

  // 四組題庫：先用同一組 6 題種子，請改寫成各自題目。每題 7 欄。
  const seed = [
    ['efficiency', '工作效率與品質', '極迅速且極少失誤，能預見問題。', '能獨立穩定完成，極少需覆核。', '符合基本速度，偶需提醒細節。', '較慢或常有小疏漏，需督導。', '效率明顯落後，常致延遲或漏給。'],
    ['interaction', '與客人互動狀況', '主動觀察顧客需求，獲好評。', '維持親切微笑與標準禮節。', '完成基本招呼點餐，較被動。', '冷漠、需提醒才有禮貌。', '態度消極或曾遭客訴。'],
    ['teamwork', '團隊合作與溝通', '主動支援同仁，溝通精確正向。', '配合度高，回報與交接良好。', '可配合交辦，但不主動。', '訊息不完整，需反覆確認。', '不願支援，甚至起口角。'],
    ['discipline', '規定遵守與紀律', '確實執行規範並主動提醒同仁。', '自律性強，不需提醒。', '偶有小疏忽，一提醒即改。', '常違規，需多次教育。', '嚴重違規或故意不遵守。'],
    ['learning', '學習與主動性', '主動學習超前並分享心得。', '積極學習，新事務快速上手。', '被動接受指導，完成教過範圍。', '進度緩慢，教多次仍不會。', '抗拒學習或長期停滯。'],
    ['attendance', '出勤與守時', '全勤準時且提前就位。', '全勤，極少遲到且先報備。', '每月遲到一次或請假可接受。', '每週遲到或常臨時請假。', '有曠職或嚴重遲到。'],
  ];
  const header = ['key', '題目', '5星', '4星', '3星', '2星', '1星'];
  const blocks = [
    ['A5', 'CFG_pt_attitude', '計時態度題'],
    ['A14', 'CFG_pt_perf', '計時表現題'],
    ['A23', 'CFG_ft_attitude', '正職態度題'],
    ['A32', 'CFG_ft_perf', '正職表現題'],
  ];
  book.getNamedRanges().forEach((nr) => {
    if (['CFG_quarter', 'CFG_passcode', 'CFG_accounts', 'CFG_pt_attitude', 'CFG_pt_perf',
      'CFG_ft_attitude', 'CFG_ft_perf', 'CFG_wage'].indexOf(nr.getName()) >= 0) nr.remove();
  });
  blocks.forEach(([titleCell, rangeName, title]) => {
    const row = Number(titleCell.slice(1));
    cfg.getRange(titleCell).setValue(title);
    cfg.getRange(row + 1, 1, 1, 7).setValues([header]);
    cfg.getRange(row + 2, 1, seed.length, 7).setValues(seed);
    book.setNamedRange(rangeName, cfg.getRange(row + 2, 1, seed.length, 7));
  });

  book.setNamedRange('CFG_quarter', cfg.getRange('B1'));
  book.setNamedRange('CFG_passcode', cfg.getRange('B2'));
  book.setNamedRange('CFG_accounts', accSh.getRange(2, 1, accounts.length, 5));

  return '安裝完成：帳號、四題庫、分頁、命名範圍已建立。請改密碼、通行碼、四組題目。';
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function rng(name) { return ss().getRangeByName(name); }

function readBank(name) {
  return rng(name).getValues().filter((r) => r[0])
    .map((r) => ({ key: r[0], label: r[1], levels: r.slice(2, 7) }));
}
function readAccounts() {
  return rng('CFG_accounts').getValues()
    .filter((r) => r[0] && r[4]) // 有姓名且啟用
    .map((r) => ({ name: r[0], role: r[1], account: String(r[2]), password: String(r[3]) }));
}
function publicConfig() {
  return {
    quarter: rng('CFG_quarter').getValue(),
    accounts: readAccounts().map((a) => ({ name: a.name, role: a.role })),
    banks: {
      ptAttitude: readBank('CFG_pt_attitude'),
      ptPerf: readBank('CFG_pt_perf'),
      ftAttitude: readBank('CFG_ft_attitude'),
      ftPerf: readBank('CFG_ft_perf'),
    },
  };
}
function checkPass(pass) { return String(pass) === String(rng('CFG_passcode').getValue()); }

function alreadySubmitted(quarter, rater) {
  const v = ss().getSheetByName('評分紀錄').getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][1] === quarter && v[i][2] === rater) return true;
  return false;
}

function handleLogin(p) {
  const acc = readAccounts().find((a) => a.account === String(p.account) && a.password === String(p.password));
  if (!acc) return { ok: false, reason: 'invalid' };
  const quarter = rng('CFG_quarter').getValue();
  return { ok: true, name: acc.name, role: acc.role, quarter, alreadyDone: alreadySubmitted(quarter, acc.name) };
}

// p: { type:'peer', quarter, rater, raterRole, ratings:[{ratee, rateeRole, attitude:[], performance:[]|null}] }
function handlePeer(p) {
  if (alreadySubmitted(p.quarter, p.rater)) return { ok: false, reason: 'duplicate' };
  const sh = ss().getSheetByName('評分紀錄');
  const now = new Date();
  p.ratings.forEach((r) => {
    sh.appendRow([now, p.quarter, p.rater, p.raterRole, r.ratee, r.rateeRole, '態度', JSON.stringify(r.attitude), p.note || '']);
    if (Array.isArray(r.performance) && r.performance.length) {
      sh.appendRow([now, p.quarter, p.rater, p.raterRole, r.ratee, r.rateeRole, '表現', JSON.stringify(r.performance), p.note || '']);
    }
  });
  return { ok: true };
}

// p: { type:'supervisorPerf', passcode, quarter, ratee, scores:[] }
function handleSupervisorPerf(p) {
  if (!checkPass(p.passcode)) return { ok: false, reason: 'unauthorized' };
  const sh = ss().getSheetByName('主管評分');
  const v = sh.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < v.length; i++) if (v[i][0] === p.quarter && v[i][1] === p.ratee) { rowIdx = i + 1; break; }
  const row = [p.quarter, p.ratee, JSON.stringify(p.scores), new Date(), '主管'];
  if (rowIdx === -1) sh.appendRow(row); else sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  return { ok: true };
}

function handleAdjust(p) {
  if (!checkPass(p.passcode)) return { ok: false, reason: 'unauthorized' };
  const sh = ss().getSheetByName('主管調整');
  const v = sh.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < v.length; i++) if (v[i][0] === p.quarter && v[i][1] === p.ratee) { rowIdx = i + 1; break; }
  const row = [p.quarter, p.ratee, p.attitudeAdjust || 0, p.attitudeReason || '',
    p.performanceAdjust || 0, p.performanceReason || '', new Date(), '主管'];
  if (rowIdx === -1) sh.appendRow(row); else sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  return { ok: true };
}

function readAdminData(passcode, quarter) {
  if (!checkPass(passcode)) return { error: 'unauthorized' };
  const rec = ss().getSheetByName('評分紀錄').getDataRange().getValues();
  const peerRecords = [];
  for (let i = 1; i < rec.length; i++) {
    if (rec[i][1] === quarter) {
      peerRecords.push({
        rater: rec[i][2], raterRole: rec[i][3], ratee: rec[i][4], rateeRole: rec[i][5],
        category: rec[i][6], scores: JSON.parse(rec[i][7] || '[]'),
      });
    }
  }
  const sp = ss().getSheetByName('主管評分').getDataRange().getValues();
  const supervisorPerf = [];
  for (let i = 1; i < sp.length; i++) {
    if (sp[i][0] === quarter) supervisorPerf.push({ ratee: sp[i][1], scores: JSON.parse(sp[i][2] || '[]') });
  }
  const adj = ss().getSheetByName('主管調整').getDataRange().getValues();
  const adjustments = [];
  for (let i = 1; i < adj.length; i++) {
    if (adj[i][0] === quarter) {
      adjustments.push({
        ratee: adj[i][1],
        attitudeAdjust: Number(adj[i][2]) || 0, attitudeReason: adj[i][3] || '',
        performanceAdjust: Number(adj[i][4]) || 0, performanceReason: adj[i][5] || '',
      });
    }
  }
  return { config: publicConfig(), peerRecords, supervisorPerf, adjustments };
}

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'config') return jsonOut(publicConfig());
  if (action === 'adminData') return jsonOut(readAdminData(e.parameter.passcode, e.parameter.quarter));
  return jsonOut({ error: 'unknown action' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.type === 'login') return jsonOut(handleLogin(p));
    if (p.type === 'peer') return jsonOut(handlePeer(p));
    if (p.type === 'supervisorPerf') return jsonOut(handleSupervisorPerf(p));
    if (p.type === 'adjust') return jsonOut(handleAdjust(p));
    return jsonOut({ ok: false, reason: 'unknown type' });
  } finally {
    lock.releaseLock();
  }
}

// ====== 一次性：從 repo 讀四組題庫寫入設定分頁（動態排版，不動帳號/通行碼）======
// 需要 UrlFetch 授權；資料檔在 repo（public）：data/banks-<季度>.json
function seedBanksFromRepo() {
  const url = 'https://raw.githubusercontent.com/Eason0728/mala-eval/main/data/banks-2026Q1.json';
  const BANKS = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
  const order = [
    ['CFG_pt_attitude', '計時態度題', BANKS.pt_attitude || []],
    ['CFG_pt_perf', '計時表現題', BANKS.pt_perf || []],
    ['CFG_ft_attitude', '正職態度題', BANKS.ft_attitude || []],
    ['CFG_ft_perf', '正職表現題（待 KPI 模組，暫空）', BANKS.ft_perf || []],
  ];
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = book.getSheetByName('設定');
  cfg.getRange('A5:G400').clearContent();
  book.getNamedRanges().forEach((nr) => {
    if (['CFG_pt_attitude', 'CFG_pt_perf', 'CFG_ft_attitude', 'CFG_ft_perf'].indexOf(nr.getName()) >= 0) nr.remove();
  });
  const header = ['key', '題目', '5星', '4星', '3星', '2星', '1星'];
  let r = 5;
  order.forEach((blk) => {
    const name = blk[0], title = blk[1], rows = blk[2];
    cfg.getRange(r, 1).setValue(title);
    cfg.getRange(r + 1, 1, 1, 7).setValues([header]);
    const list = rows.length ? rows : [['', '', '', '', '', '', '']];
    cfg.getRange(r + 2, 1, list.length, 7).setValues(list);
    book.setNamedRange(name, cfg.getRange(r + 2, 1, list.length, 7));
    r = r + 2 + list.length + 1;
  });
  return '題庫寫入完成：計時態度 ' + (BANKS.pt_attitude || []).length + '、計時表現 ' + (BANKS.pt_perf || []).length
    + '、正職態度 ' + (BANKS.ft_attitude || []).length + '、正職表現 ' + (BANKS.ft_perf || []).length + '（待做）';
}
