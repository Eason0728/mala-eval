// 示範假資料：給參觀帳號（test/test）用，餵進真實畫面，完全不碰真實同仁資料。
// 依真實題庫／KPI 範本長度生成，數值固定（不隨機，示範每次一致）。全部是虛構人名與分數。

const FAKE = [
  { name: '王大明', role: '計時' },
  { name: '陳曉華', role: '計時' },
  { name: '林美芳', role: '計時' },
  { name: '黃志強', role: '正職' },
  { name: '周雅婷', role: '正職' },
];
export const DEMO_ME = '王大明'; // 參觀者以此虛構身分看同仁端

// 依題數給一組固定分數（1..5 循環，偏中上）
function seq(n, start) { return Array.from({ length: n }, (_, i) => ((start + i) % 5) + 1); }
function bankLen(banks, key) { return (banks[key] || []).length; }

// config：{ banks, wageTiers }（真實設定，可原樣用）；ftTemplates：登入回傳的真實 KPI 範本
export function buildDemoData(config, ftTemplates) {
  const banks = config.banks || {};
  const tmpl = ftTemplates || {};
  const nAtt = bankLen(banks, 'ptAttitude');   // 計時態度題數
  const nPerf = bankLen(banks, 'ptPerf');       // 計時表現題數
  const nFtAtt = bankLen(banks, 'ftAttitude');  // 正職態度題數
  const Q = '2026-Q2';
  const Qprev = '2026-Q1';
  const accounts = FAKE.map((f) => ({ name: f.name, role: f.role }));

  // 正職 → 指派真實範本職稱（輪流）
  const titles = Object.keys(tmpl);
  const ftTitles = {};
  FAKE.filter((f) => f.role === '正職').forEach((f, i) => { ftTitles[f.name] = titles[i % (titles.length || 1)] || ''; });

  // ---- 我的成績（王大明・計時）----
  const myScores = {
    ok: true, name: DEMO_ME, role: '計時',
    records: [
      { quarter: Q, category: '態度', scores: seq(nAtt, 3) },
      { quarter: Q, category: '態度', scores: seq(nAtt, 2) },
      { quarter: Q, category: '表現', scores: seq(nPerf, 3) },
      { quarter: Q, category: '表現', scores: seq(nPerf, 2) },
      { quarter: Qprev, category: '態度', scores: seq(nAtt, 2) },
      { quarter: Qprev, category: '表現', scores: seq(nPerf, 2) },
    ],
    self: [
      { quarter: Q, category: '態度', scores: seq(nAtt, 4) },
      { quarter: Q, category: '表現', scores: seq(nPerf, 4) },
    ],
    supervisorPerf: [],
    seeded: [],
    messagesToMe: [
      { quarter: Q, msg: '謝謝你這季常常主動補位，大家都有看到！', from: '' },
      { quarter: Q, msg: '外場遇到狀況時你處理得很穩，繼續加油。', from: '陳曉華' },
    ],
    myNotes: [{ quarter: Qprev, msg: '下一季想把出餐速度再練快一點。' }],
    supervisorFeedback: [{ quarter: Q, msg: '整體表現穩定、主動性佳，請續維持。' }],
    adjustments: [{ quarter: Q, attitudeAdjust: 1, performanceAdjust: 0 }],
    ftTitle: '', ftTemplate: [],
  };

  // ---- 主管 adminData ----
  const peerRecords = [];
  FAKE.forEach((f, idx) => {
    const attLen = f.role === '正職' ? nFtAtt : nAtt;
    peerRecords.push({ rater: '（示範）', raterRole: '計時', ratee: f.name, rateeRole: f.role, category: '態度', scores: seq(attLen, idx + 2) });
    peerRecords.push({ rater: '（示範）', raterRole: '計時', ratee: f.name, rateeRole: f.role, category: '態度', scores: seq(attLen, idx + 3) });
    if (f.role === '計時') {
      peerRecords.push({ rater: '（示範）', raterRole: '計時', ratee: f.name, rateeRole: f.role, category: '表現', scores: seq(nPerf, idx + 2) });
      peerRecords.push({ rater: '（示範）', raterRole: '計時', ratee: f.name, rateeRole: f.role, category: '表現', scores: seq(nPerf, idx + 3) });
    }
  });
  const selfRecords = FAKE.map((f) => ({
    ratee: f.name, role: f.role, category: '態度',
    scores: seq(f.role === '正職' ? nFtAtt : nAtt, 4),
  })).concat(FAKE.filter((f) => f.role === '計時').map((f) => ({
    ratee: f.name, role: f.role, category: '表現', scores: seq(nPerf, 4),
  })));
  const supervisorPerf = [];
  FAKE.filter((f) => f.role === '正職').forEach((f) => {
    const items = tmpl[ftTitles[f.name]] || [];
    const sel = {}; const actual = {};
    items.forEach((it, i) => {
      sel[it.key] = it.type === '執行力' ? (i % 3 === 2 ? '未完成' : '完成') : ['A', 'B', 'C', 'B'][i % 4];
      actual[it.key] = '';
    });
    supervisorPerf.push({ ratee: f.name, sel, actual });
  });
  const adminData = {
    config: { accounts, banks: config.banks, wageTiers: config.wageTiers },
    peerRecords, supervisorPerf,
    adjustments: [{ ratee: '黃志強', attitudeAdjust: 1, attitudeReason: '（示範）', performanceAdjust: -2, performanceReason: '（示範）' }],
    results: [],
    selfRecords,
    companyMessages: ['（示範）希望排班可以早一點公布。', '（示範）冷氣有點不冷，再麻煩看一下～'],
    supervisorFeedback: [{ ratee: '王大明', text: '（示範）整體穩定，續維持。' }],
    ftTemplates: tmpl, ftTitles,
  };

  return { accounts, myScores, adminData, meName: DEMO_ME };
}
