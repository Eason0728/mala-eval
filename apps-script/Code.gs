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
// 帳號分頁：姓名｜角色｜帳號｜密碼｜啟用。角色僅接受「正職」／「計時」，其他值直接丟錯（別靜默跳過，
// 避免打錯字的人被悄悄漏掉）。啟用欄僅接受布林 true 或字串 'TRUE'（trim、不分大小寫），其餘一律視為
// 停用——別用 r[4]===true 單獨判斷，否則試算表用文字 TRUE 會把全員誤停用。
function readAccounts() {
  const isEnabled = (v) => v === true || String(v).trim().toUpperCase() === 'TRUE';
  const out = [];
  rng('CFG_accounts').getValues().forEach((r) => {
    if (!r[0]) return; // 無姓名的空列跳過
    if (!isEnabled(r[4])) return; // 停用列先跳過——角色驗證只管會被計入的列，半完成的列不炸全站
    const name = String(r[0]).trim();
    const roleRaw = r[1];
    const role = String(roleRaw).trim();
    if (role !== '正職' && role !== '計時') {
      throw new Error('帳號分頁「' + name + '」的角色欄是「' + roleRaw + '」，只能填「正職」或「計時」');
    }
    out.push({ name, role, account: String(r[2]), password: String(r[3]) });
  });
  return out;
}
// 時薪級距：獨立分頁「時薪級距」（分數區間｜時薪），直接編輯試算表即可改，毋須動程式。
// 分頁不存在時自動建立並填入預設八級距。純數字的時薪欄會自動補「元」。
function readWageTiers() {
  let sh = ss().getSheetByName('時薪級距');
  if (!sh) {
    try {
      sh = ss().insertSheet('時薪級距');
      sh.getRange(1, 1, 1, 2).setValues([['分數區間', '時薪']]);
      const seed = [
        ['96 分以上', '340 元'], ['91～95 分', '300 元'], ['86～90 分', '280 元'],
        ['81～85 分', '230 元'], ['76～80 分', '220 元'], ['71～75 分', '210 元'],
        ['66～70 分', '205 元'], ['65 分以下', '法定時薪'],
      ];
      sh.getRange(2, 1, seed.length, 2).setValues(seed);
    } catch (e) { sh = ss().getSheetByName('時薪級距'); } // 併發建立時讓後到者直接讀
  }
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  const tiers = [];
  for (let i = 1; i < v.length; i++) {
    if (v[i][0] === '' || v[i][0] === null) continue;
    const w = v[i][1];
    tiers.push([String(v[i][0]), typeof w === 'number' ? w + ' 元' : String(w || '')]);
  }
  return tiers;
}

// 當前評核季度＝依日期（台灣時間）算出的「剛結束的上一季」，與前端 fillTarget 一致。
// 例：1~3 月＝去年 Q4、4~6 月＝Q1、7~9 月＝Q2、10~12 月＝Q3。
// 2026-07-04 起取代設定分頁 B1（CFG_quarter），該格保留但不再被讀取。
function currentQuarter() {
  const parts = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-M').split('-');
  const y = Number(parts[0]);
  const q = Math.ceil(Number(parts[1]) / 3) - 1;
  return q === 0 ? (y - 1) + '-Q4' : y + '-Q' + q;
}

// config 有 5 分鐘快取（CacheService）：同仁打開網頁不用每次現讀試算表，載入快很多。
// 代價：直接改試算表（帳號名單、題庫、時薪級距）後，最多等 5 分鐘網頁才看得到新內容。
function publicConfig() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('publicConfig');
  if (hit) return JSON.parse(hit);
  const cfg = {
    ver: 15, // 部署版本標記（15：定稿本季 saveResults/clearResults 寫入結果細項）
    quarter: currentQuarter(),
    accounts: readAccounts().map((a) => ({ name: a.name, role: a.role })),
    banks: {
      ptAttitude: readBank('CFG_pt_attitude'),
      ptPerf: readBank('CFG_pt_perf'),
      ftAttitude: readBank('CFG_ft_attitude'),
      ftPerf: readBank('CFG_ft_perf'),
    },
    wageTiers: readWageTiers(),
  };
  try { cache.put('publicConfig', JSON.stringify(cfg), 300); } catch (e) {} // 快取寫入失敗就略過，功能照常
  return cfg;
}
function checkPass(pass) { return String(pass) === String(rng('CFG_passcode').getValue()); }

function alreadySubmitted(quarter, rater) {
  const v = ss().getSheetByName('評分紀錄').getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][1] === quarter && v[i][2] === rater) return true;
  return false;
}

// 用帳號＋密碼找該筆帳號資料；找不到回 null。比對方式同 handleLogin（String() 後相等）。
function findAccount(account, password) {
  return readAccounts().find((a) => a.account === String(account) && a.password === String(password)) || null;
}

function handleLogin(p) {
  const acc = readAccounts().find((a) => a.account === String(p.account) && a.password === String(p.password));
  if (!acc) return { ok: false, reason: 'invalid' };
  const quarter = currentQuarter();
  return { ok: true, name: acc.name, role: acc.role, quarter, alreadyDone: alreadySubmitted(quarter, acc.name) };
}

// p: { type:'peer', account, password, ratings:[{ratee, rateeRole, attitude:[], performance:[]|null}] }
// 評核者姓名／角色一律用帳密查到的帳號資料（acc.name/acc.role），季度一律用後端 currentQuarter()，
// 不信前端傳的 rater/raterRole/quarter。
function handlePeer(p) {
  const acc = findAccount(p.account, p.password);
  if (!acc) return { ok: false, reason: 'unauthorized' };
  const quarter = currentQuarter();
  if (alreadySubmitted(quarter, acc.name)) return { ok: false, reason: 'duplicate' };
  const sh = ss().getSheetByName('評分紀錄');
  const now = new Date();
  const rows = [];
  p.ratings.forEach((r) => {
    rows.push([now, quarter, acc.name, acc.role, r.ratee, r.rateeRole, '態度', JSON.stringify(r.attitude), p.note || '']);
    if (Array.isArray(r.performance) && r.performance.length) {
      rows.push([now, quarter, acc.name, acc.role, r.ratee, r.rateeRole, '表現', JSON.stringify(r.performance), p.note || '']);
    }
  });
  // 批次寫入：先組好全部列，最後一次 setValues——一次成功或一次都不寫，
  // 避免寫一半失敗後永久卡死重送（alreadySubmitted 會誤判已送出）。
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
  return { ok: true };
}

// 自評紀錄：時間戳｜季度｜受評者｜角色｜類別｜分數JSON
function alreadySelfSubmitted(quarter, person) {
  const sh = ss().getSheetByName('自評紀錄');
  if (!sh) return false;
  const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][1] === quarter && v[i][2] === person) return true;
  return false;
}

// 自評留言：時間戳｜季度｜發話者｜類型(自己/夥伴/公司)｜對象｜內容
function writeSelfMessages(quarter, person, p) {
  let sh = ss().getSheetByName('自評留言');
  if (!sh) {
    sh = ss().insertSheet('自評留言');
    sh.getRange(1, 1, 1, 7).setValues([['時間戳', '季度', '發話者', '類型', '對象', '內容', '匿名']]);
  } else if (!sh.getRange(1, 7).getValue()) {
    sh.getRange(1, 7).setValue('匿名'); // 舊表補上第 7 欄標題
  }
  const now = new Date();
  const rows = [];
  // 第 7 欄「匿名」：夥伴留言帶勾選值；自己/公司留言留空。舊資料無此欄＝視為具名（顯示名字）。
  if (p.selfNote && String(p.selfNote).trim()) rows.push([now, quarter, person, '自己', person, String(p.selfNote), '']);
  (p.peerMessages || []).forEach((m) => {
    if (m && m.to && m.msg && String(m.msg).trim()) rows.push([now, quarter, person, '夥伴', m.to, String(m.msg), m.anon ? true : false]);
  });
  if (p.companyNote && String(p.companyNote).trim()) rows.push([now, quarter, person, '公司', '', String(p.companyNote), '']);
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
}

// p: { type:'self', account, password, attitude:[], performance:[]|null, selfNote, companyNote, peerMessages:[{to,msg,anon}] }
// person/role 一律用帳密查到的帳號資料，季度一律用後端 currentQuarter()，不信前端傳的 person/role/quarter。
function handleSelf(p) {
  const acc = findAccount(p.account, p.password);
  if (!acc) return { ok: false, reason: 'unauthorized' };
  const quarter = currentQuarter();
  if (alreadySelfSubmitted(quarter, acc.name)) return { ok: false, reason: 'duplicate' };
  // 留言先寫（重送頂多重複、不會遺失），「自評紀錄」是防重複的閘門表最後才批次寫——
  // 失敗時 alreadySelfSubmitted 仍判斷未送出，使用者還能重送。
  writeSelfMessages(quarter, acc.name, p);
  let sh = ss().getSheetByName('自評紀錄');
  if (!sh) {
    sh = ss().insertSheet('自評紀錄');
    sh.getRange(1, 1, 1, 6).setValues([['時間戳', '季度', '受評者', '角色', '類別', '分數JSON']]);
  }
  const now = new Date();
  const rows = [[now, quarter, acc.name, acc.role, '態度', JSON.stringify(p.attitude)]];
  if (Array.isArray(p.performance) && p.performance.length) {
    rows.push([now, quarter, acc.name, acc.role, '表現', JSON.stringify(p.performance)]);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  return { ok: true };
}

// p: { type:'supervisorPerf', passcode, quarter, ratee, sel:{key:等級/完成}, actual:{key:實際值} }
// 正職職能表現：主管每項選等級（技能A/B/C/D）或完成/未完成（執行力）＋填實際值。分數由前端依範本比重計算。
function handleSupervisorPerf(p) {
  if (!checkPass(p.passcode)) return { ok: false, reason: 'unauthorized' };
  const sh = ss().getSheetByName('主管評分');
  const v = sh.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < v.length; i++) if (v[i][0] === p.quarter && v[i][1] === p.ratee) { rowIdx = i + 1; break; }
  const payload = JSON.stringify({ sel: p.sel || {}, actual: p.actual || {} });
  const row = [p.quarter, p.ratee, payload, new Date(), '主管'];
  if (rowIdx === -1) sh.appendRow(row); else sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  return { ok: true };
}

// ====== 正職職能表現 KPI：範本（依職稱）＋職稱對應 ======
// 範本分頁「正職表現範本」：職稱｜項次｜key｜類型(技能/執行力)｜項目內容｜目標值｜比重
// 對應分頁「正職職稱」：姓名｜職稱。皆由 seedFtPerf 建立，主管可在管理區編輯。
function ftExec(no) { return { no: no, key: 'exec' + no, type: '執行力', label: '', target: '', levels: { A: '完成', B: '', C: '', D: '未完成' }, weight: 5 }; }
var FT_PERF_TEMPLATES = {
  '店長': [
    { no: 1, key: 'sales', type: '技能', label: '營業額達成率', target: '100%', levels: { A: '100%↑', B: '90～99%', C: '80～89%', D: '80%↓' }, weight: 5 },
    { no: 2, key: 'profit', type: '技能', label: '獲利率', target: '12%', levels: { A: '12%↑', B: '7～11%', C: '2～6%', D: '2%↓' }, weight: 10 },
    { no: 3, key: 'opscore', type: '技能', label: '營運評分表', target: '90', levels: { A: '90↑', B: '80～89', C: '70～79', D: '70↓' }, weight: 20 },
    { no: 4, key: 'stock', type: '技能', label: '盤點正確率', target: '100%', levels: { A: '100%', B: '95～99%', C: '90～94%', D: '89%↓' }, weight: 5 },
    { no: 5, key: 'google', type: '技能', label: '當季度GOOGLE星級', target: '4.8', levels: { A: '4.8↑', B: '4.5~4.7', C: '4.2~4.4', D: '4.2↓' }, weight: 5 },
    ftExec(6), ftExec(7), ftExec(8), ftExec(9), ftExec(10),
  ],
  '儲備幹部': [
    { no: 1, key: 'sales', type: '技能', label: '營業額達成率', target: '100%', levels: { A: '100%↑', B: '90～99%', C: '80～89%', D: '80%↓' }, weight: 5 },
    { no: 2, key: 'profit', type: '技能', label: '獲利率', target: '12%', levels: { A: '12%↑', B: '7～11%', C: '2～6%', D: '2%↓' }, weight: 5 },
    { no: 3, key: 'opscore', type: '技能', label: '營運評分表', target: '90', levels: { A: '90↑', B: '80～89', C: '70～79', D: '70↓' }, weight: 10 },
    { no: 4, key: 'cookerr', type: '技能', label: '餐點製作錯誤次數', target: '3次/季', levels: { A: '3↓', B: '4～6', C: '7～15', D: '16↑' }, weight: 15 },
    { no: 5, key: 'packerr', type: '技能', label: '餐點包裝錯誤次數', target: '3次/季', levels: { A: '3↓', B: '4～6', C: '7～15', D: '16↑' }, weight: 10 },
    ftExec(6), ftExec(7), ftExec(8), ftExec(9), ftExec(10),
  ],
};
var FT_TITLES_SEED = { '蕭彣芳': '店長', '張羽成': '儲備幹部', '陳盈如': '儲備幹部' };

function readFtTemplates() {
  let sh = ss().getSheetByName('正職表現範本');
  if (!sh) {
    try { seedFtPerf(); } catch (e) {} // 併發建立時讓後到者直接讀
    sh = ss().getSheetByName('正職表現範本');
  }
  if (!sh) return {};
  const v = sh.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < v.length; i++) {
    const title = v[i][0];
    if (!title) continue;
    (out[title] = out[title] || []).push({
      no: v[i][1], key: String(v[i][2]), type: v[i][3],
      label: v[i][4] || '', target: v[i][5] || '',
      levels: { A: v[i][6] || '', B: v[i][7] || '', C: v[i][8] || '', D: v[i][9] || '' },
      weight: Number(v[i][10]) || 0,
    });
  }
  return out;
}
function readFtTitles() {
  let sh = ss().getSheetByName('正職職稱');
  if (!sh) {
    try { seedFtPerf(); } catch (e) {} // 併發建立時讓後到者直接讀
    sh = ss().getSheetByName('正職職稱');
  }
  if (!sh) return {};
  const v = sh.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < v.length; i++) if (v[i][0]) out[String(v[i][0])] = String(v[i][1] || '');
  return out;
}

// 一次性：建立範本＋職稱對應分頁並填入種子（店長版、儲備幹部版）。
function seedFtPerf() {
  const book = ss();
  let tpl = book.getSheetByName('正職表現範本');
  if (!tpl) tpl = book.insertSheet('正職表現範本');
  tpl.clear();
  tpl.getRange(1, 1, 1, 11).setValues([['職稱', '項次', 'key', '類型', '項目內容', '目標值', 'A', 'B', 'C', 'D', '比重']]);
  const rows = [];
  Object.keys(FT_PERF_TEMPLATES).forEach((title) => {
    FT_PERF_TEMPLATES[title].forEach((it) => {
      const lv = it.levels || {};
      rows.push([title, it.no, it.key, it.type, it.label, it.target, lv.A || '', lv.B || '', lv.C || '', lv.D || '', it.weight]);
    });
  });
  tpl.getRange(2, 1, rows.length, 11).setValues(rows);
  let map = book.getSheetByName('正職職稱');
  if (!map) map = book.insertSheet('正職職稱');
  map.clear();
  map.getRange(1, 1, 1, 2).setValues([['姓名', '職稱']]);
  const mrows = Object.keys(FT_TITLES_SEED).map((n) => [n, FT_TITLES_SEED[n]]);
  map.getRange(2, 1, mrows.length, 2).setValues(mrows);
  return '正職表現範本（' + Object.keys(FT_PERF_TEMPLATES).join('、') + '）＋職稱對應已建立';
}

// p: { type:'ftTemplate', passcode, title, items:[{no,key,type,label,target,weight}] } — 覆寫某職稱整組項目
function handleFtTemplate(p) {
  if (!checkPass(p.passcode)) return { ok: false, reason: 'unauthorized' };
  const HEADER = ['職稱', '項次', 'key', '類型', '項目內容', '目標值', 'A', 'B', 'C', 'D', '比重'];
  let sh = ss().getSheetByName('正職表現範本');
  if (!sh) { sh = ss().insertSheet('正職表現範本'); sh.getRange(1, 1, 1, 11).setValues([HEADER]); }
  const v = sh.getDataRange().getValues();
  const keep = [HEADER];
  for (let i = 1; i < v.length; i++) if (v[i][0] && v[i][0] !== p.title) keep.push(v[i]);
  (p.items || []).forEach((it, idx) => {
    const lv = it.levels || {};
    keep.push([p.title, it.no || idx + 1, it.key, it.type, it.label || '', it.target || '', lv.A || '', lv.B || '', lv.C || '', lv.D || '', Number(it.weight) || 0]);
  });
  sh.clearContents();
  sh.getRange(1, 1, keep.length, 11).setValues(keep);
  return { ok: true };
}

// p: { type:'ftTitle', passcode, ratee, title } — 設定某正職用哪個職稱範本
function handleFtTitle(p) {
  if (!checkPass(p.passcode)) return { ok: false, reason: 'unauthorized' };
  let sh = ss().getSheetByName('正職職稱');
  if (!sh) { sh = ss().insertSheet('正職職稱'); sh.getRange(1, 1, 1, 2).setValues([['姓名', '職稱']]); }
  const v = sh.getDataRange().getValues();
  let idx = -1;
  for (let i = 1; i < v.length; i++) if (v[i][0] === p.ratee) { idx = i + 1; break; }
  const row = [p.ratee, p.title || ''];
  if (idx === -1) sh.appendRow(row); else sh.getRange(idx, 1, 1, 2).setValues([row]);
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

// p: { type:'supervisorFeedback', passcode, quarter, ratee, text }
// 主管回饋：每季每人一則，重存即覆蓋。分頁不存在會自動建立。
function handleSupervisorFeedback(p) {
  if (!checkPass(p.passcode)) return { ok: false, reason: 'unauthorized' };
  let sh = ss().getSheetByName('主管回饋');
  if (!sh) {
    sh = ss().insertSheet('主管回饋');
    sh.getRange(1, 1, 1, 4).setValues([['季度', '受評者', '內容', '更新時間']]);
  }
  const v = sh.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < v.length; i++) if (v[i][0] === p.quarter && v[i][1] === p.ratee) { rowIdx = i + 1; break; }
  const row = [p.quarter, p.ratee, String(p.text || ''), new Date()];
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
    if (sp[i][0] === quarter) {
      var d = {};
      try { d = JSON.parse(sp[i][2] || '{}'); } catch (e) { d = {}; }
      supervisorPerf.push({ ratee: sp[i][1], sel: d.sel || {}, actual: d.actual || {} });
    }
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
  // 手動填的歷史成績（結果細項），如第一季
  const resSh = ss().getSheetByName('結果細項');
  const results = [];
  if (resSh) {
    const rv = resSh.getDataRange().getValues();
    for (let i = 1; i < rv.length; i++) {
      if (rv[i][0] === quarter && rv[i][6] !== '' && rv[i][6] !== null) {
        results.push({ ratee: rv[i][1], category: rv[i][3], label: rv[i][5], score: Number(rv[i][6]) });
      }
    }
  }
  // 自評紀錄（含進正式平均、並可獨立呈現）
  const selfSh = ss().getSheetByName('自評紀錄');
  const selfRecords = [];
  if (selfSh) {
    const sv = selfSh.getDataRange().getValues();
    for (let i = 1; i < sv.length; i++) {
      if (sv[i][1] === quarter) {
        selfRecords.push({ ratee: sv[i][2], role: sv[i][3], category: sv[i][4], scores: JSON.parse(sv[i][5] || '[]') });
      }
    }
  }
  // 對公司的話（匿名）
  const msgSh = ss().getSheetByName('自評留言');
  const companyMessages = [];
  if (msgSh) {
    const mv = msgSh.getDataRange().getValues();
    for (let i = 1; i < mv.length; i++) {
      if (mv[i][1] === quarter && mv[i][3] === '公司') companyMessages.push(mv[i][5]);
    }
  }
  // 主管回饋（本季）
  const fbSh = ss().getSheetByName('主管回饋');
  const supervisorFeedback = [];
  if (fbSh) {
    const fv = fbSh.getDataRange().getValues();
    for (let i = 1; i < fv.length; i++) {
      if (fv[i][0] === quarter) supervisorFeedback.push({ ratee: fv[i][1], text: fv[i][2] });
    }
  }
  return {
    config: publicConfig(), peerRecords, supervisorPerf, adjustments, results, selfRecords,
    companyMessages, supervisorFeedback, ftTemplates: readFtTemplates(), ftTitles: readFtTitles(),
  };
}

// 「結果細項」欄位：季度｜受評者｜角色｜類別｜題key｜題目｜分數（7 欄）。
var RESULT_HEADER = ['季度', '受評者', '角色', '類別', '題key', '題目', '分數'];
function normalizeResultRow(r) {
  const out = (r || []).slice(0, 7);
  while (out.length < 7) out.push('');
  return out;
}
// 定稿某季：把前端算好的每項最終分數寫進「結果細項」，之後讀該季一律用這些固定值（不再即時算、不受改範本影響）。
// 冪等：先移除該季既有列，再整批寫入。rows：[[受評者,角色,類別,題key,題目,分數], ...]。
function handleSaveResults(p) {
  if (!checkPass(p.passcode)) return { ok: false, reason: 'unauthorized' };
  const quarter = p.quarter;
  if (!quarter) return { ok: false, reason: 'no-quarter' };
  let sh = ss().getSheetByName('結果細項');
  if (!sh) { sh = ss().insertSheet('結果細項'); sh.getRange(1, 1, 1, 7).setValues([RESULT_HEADER]); }
  const v = sh.getDataRange().getValues();
  const keep = [RESULT_HEADER];
  for (let i = 1; i < v.length; i++) if (v[i][0] !== quarter) keep.push(normalizeResultRow(v[i])); // 保留其他季
  (p.rows || []).forEach((r) => keep.push(normalizeResultRow([quarter, r[0], r[1], r[2], r[3], r[4], r[5]])));
  sh.clearContents();
  sh.getRange(1, 1, keep.length, 7).setValues(keep);
  return { ok: true, wrote: (p.rows || []).length };
}
// 解除某季定稿：移除該季在「結果細項」的所有列，該季回到即時計算。
function handleClearResults(p) {
  if (!checkPass(p.passcode)) return { ok: false, reason: 'unauthorized' };
  const sh = ss().getSheetByName('結果細項');
  if (!sh) return { ok: true, removed: 0 };
  const v = sh.getDataRange().getValues();
  const keep = [RESULT_HEADER];
  let removed = 0;
  for (let i = 1; i < v.length; i++) { if (v[i][0] !== p.quarter) keep.push(normalizeResultRow(v[i])); else removed++; }
  sh.clearContents();
  sh.getRange(1, 1, keep.length, 7).setValues(keep);
  return { ok: true, removed };
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
    if (p.type === 'changePassword') return jsonOut(handleChangePassword(p));
    if (p.type === 'myScores') return jsonOut(handleMyScores(p));
    if (p.type === 'peer') return jsonOut(handlePeer(p));
    if (p.type === 'self') return jsonOut(handleSelf(p));
    if (p.type === 'supervisorPerf') return jsonOut(handleSupervisorPerf(p));
    if (p.type === 'ftTemplate') return jsonOut(handleFtTemplate(p));
    if (p.type === 'ftTitle') return jsonOut(handleFtTitle(p));
    if (p.type === 'adjust') return jsonOut(handleAdjust(p));
    if (p.type === 'supervisorFeedback') return jsonOut(handleSupervisorFeedback(p));
    if (p.type === 'saveResults') return jsonOut(handleSaveResults(p));
    if (p.type === 'clearResults') return jsonOut(handleClearResults(p));
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

// ====== 一次性：擴大 CFG_accounts 讀取範圍到 200 列 ======
function fixAccountsRange() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sh = book.getSheetByName('帳號');
  book.getNamedRanges().forEach(function (nr) { if (nr.getName() === 'CFG_accounts') nr.remove(); });
  book.setNamedRange('CFG_accounts', sh.getRange(2, 1, 199, 5));
  return 'CFG_accounts 已擴大到 A2:E200';
}

// ====== 個人成績查詢 ======
// 結果細項分頁：季度 | 受評者 | 角色 | 類別 | 題key | 題目 | 分數（手動填，如第一季歷史資料）
function readResultDetail(name) {
  const sh = ss().getSheetByName('結果細項');
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    if (v[i][1] === name && v[i][6] !== '' && v[i][6] !== null) {
      out.push({ quarter: v[i][0], category: v[i][3], label: v[i][5], score: Number(v[i][6]) });
    }
  }
  return out;
}

// p: { type:'changePassword', account, oldPassword, newPassword } → 同仁改自己密碼
function handleChangePassword(p) {
  if (!p.newPassword || String(p.newPassword).length < 4) return { ok: false, reason: 'tooshort' };
  const sh = ss().getSheetByName('帳號');
  const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][2]) === String(p.account)) {
      if (String(v[i][3]) !== String(p.oldPassword)) return { ok: false, reason: 'wrong' };
      const cell = sh.getRange(i + 1, 4);
      cell.setNumberFormat('@'); // 文字格式，保留前導零
      cell.setValue(String(p.newPassword));
      return { ok: true };
    }
  }
  return { ok: false, reason: 'notfound' };
}

// p: { type:'myScores', account, password } → 只回傳本人的資料
function handleMyScores(p) {
  const acc = readAccounts().find((a) => a.account === String(p.account) && a.password === String(p.password));
  if (!acc) return { ok: false, reason: 'invalid' };
  const name = acc.name;
  const rec = ss().getSheetByName('評分紀錄').getDataRange().getValues();
  const records = [];
  for (let i = 1; i < rec.length; i++) {
    if (rec[i][4] === name) records.push({ quarter: rec[i][1], category: rec[i][6], scores: JSON.parse(rec[i][7] || '[]') });
  }
  const sp = ss().getSheetByName('主管評分').getDataRange().getValues();
  const supervisorPerf = [];
  for (let i = 1; i < sp.length; i++) {
    if (sp[i][1] === name) {
      var d = {};
      try { d = JSON.parse(sp[i][2] || '{}'); } catch (e) { d = {}; }
      supervisorPerf.push({ quarter: sp[i][0], sel: d.sel || {}, actual: d.actual || {} });
    }
  }
  // 正職職能表現 KPI：本人職稱＋該職稱範本（前端據此＋sel 算表現分）
  const ftTitle = readFtTitles()[name] || '';
  const ftTemplate = ftTitle ? (readFtTemplates()[ftTitle] || []) : [];
  const selfSh = ss().getSheetByName('自評紀錄');
  const self = [];
  if (selfSh) {
    const sv = selfSh.getDataRange().getValues();
    for (let i = 1; i < sv.length; i++) {
      if (sv[i][2] === name) self.push({ quarter: sv[i][1], category: sv[i][4], scores: JSON.parse(sv[i][5] || '[]') });
    }
  }
  // 別人對我說的話（匿名）＋我給自己的話
  const msgSh = ss().getSheetByName('自評留言');
  const messagesToMe = [];
  const myNotes = [];
  if (msgSh) {
    const mv = msgSh.getDataRange().getValues();
    for (let i = 1; i < mv.length; i++) {
      if (mv[i][3] === '夥伴' && mv[i][4] === name) {
        // 第 7 欄為 TRUE 才匿名；空白（舊資料）或 FALSE 都回傳發話者名字。
        const anon = mv[i][6] === true || String(mv[i][6]).toUpperCase() === 'TRUE';
        messagesToMe.push({ quarter: mv[i][1], msg: mv[i][5], from: anon ? '' : mv[i][2] });
      }
      if (mv[i][3] === '自己' && mv[i][2] === name) myNotes.push({ quarter: mv[i][1], msg: mv[i][5] });
    }
  }
  // 主管 ± 調整（各季，前端計入實際分數；不回傳原因欄）
  const adjSh = ss().getSheetByName('主管調整');
  const adjustments = [];
  if (adjSh) {
    const av = adjSh.getDataRange().getValues();
    for (let i = 1; i < av.length; i++) {
      if (av[i][1] === name) adjustments.push({ quarter: av[i][0], attitudeAdjust: Number(av[i][2]) || 0, performanceAdjust: Number(av[i][4]) || 0 });
    }
  }
  // 主管給我的表現回饋（各季）
  const fbSh = ss().getSheetByName('主管回饋');
  const supervisorFeedback = [];
  if (fbSh) {
    const fv = fbSh.getDataRange().getValues();
    for (let i = 1; i < fv.length; i++) {
      if (fv[i][1] === name && String(fv[i][2] || '').trim()) supervisorFeedback.push({ quarter: fv[i][0], msg: fv[i][2] });
    }
  }
  return {
    ok: true, name, role: acc.role, records, supervisorPerf, seeded: readResultDetail(name),
    self, messagesToMe, myNotes, supervisorFeedback, adjustments, ftTitle, ftTemplate,
  };
}

// ====== 一次性：建立某季「結果細項」空白模板供手動填分（如第一季歷史資料）======
function seedResultTemplate(quarter) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sh = book.getSheetByName('結果細項');
  if (!sh) sh = book.insertSheet('結果細項');
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 7).setValues([['季度', '受評者', '角色', '類別', '題key', '題目', '分數']]);
  }
  // 四組題庫迴圈外各讀一次存變數，迴圈內依角色取用，避免每人重複呼叫 readBank()。
  const ptAtt = readBank('CFG_pt_attitude');
  const ptPerf = readBank('CFG_pt_perf');
  const ftAtt = readBank('CFG_ft_attitude');
  const ftPerf = readBank('CFG_ft_perf');
  const rows = [];
  readAccounts().forEach((a) => {
    const att = a.role === '計時' ? ptAtt : ftAtt;
    const perf = a.role === '計時' ? ptPerf : ftPerf;
    att.forEach((it) => rows.push([quarter, a.name, a.role, '態度', it.key, it.label, '']));
    perf.forEach((it) => rows.push([quarter, a.name, a.role, '表現', it.key, it.label, '']));
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  return '已建立 ' + quarter + ' 結果細項模板 ' + rows.length + ' 列，請填「分數」欄';
}

// ====== 一次性：從 repo 讀歷史成績寫入「結果細項」（自動代入，如第一季）======
// 需要 UrlFetch 授權；資料檔在 repo（public）：data/results-<季度>.json
function seedResultsFromRepo() {
  const url = 'https://raw.githubusercontent.com/Eason0728/mala-eval/main/data/results-2026Q1.json';
  const rows = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sh = book.getSheetByName('結果細項');
  if (!sh) sh = book.insertSheet('結果細項');
  sh.clear();
  sh.getRange(1, 1, 1, 7).setValues([['季度', '受評者', '角色', '類別', '題key', '題目', '分數']]);
  const data = rows.map((r) => [r.quarter, r.ratee, r.role, r.category, r.key, r.label, r.score]);
  if (data.length) sh.getRange(2, 1, data.length, 7).setValues(data);
  return '結果細項寫入 ' + data.length + ' 列（' + (rows[0] && rows[0].quarter) + '）';
}
