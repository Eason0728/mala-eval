// 文字對比度檢查（WCAG 2.1）。Eason 2026-09-03 指定：「文字的配色必須要是對比色，方便閱讀」。
// 改任何配色後跑一次：node tools/contrast-check.js
// 標準：正文 ≥ 4.5、大字（18pt/14pt粗體以上）≥ 3.0。
const hex = (h) => {
  const s = h.replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
const lum = (h) => {
  const [r, g, b] = hex(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// 目前的配色（與 css/style.css 對齊；改 css 就要改這裡）
const C = {
  ink: '#241a15',
  muted: '#7a6249',
  brand: '#ea340c',
  brandDark: '#c42a0a',
  gold: '#ffd803',
  card: '#fffdf8',
  // 天空版白天：最亮 → 最暗
  dayTop: '#fdf1da', dayMid: '#fbf7ee', dayBottom: '#f4eee2',
  // 天空版夜晚
  nightTop: '#1b2444', nightMid: '#141b33', nightBottom: '#0d1122',
  // 夜晚的文字
  nightFg: '#f6ecdd', nightMuted: '#c3ab90', white: '#ffffff',
};

const cases = [
  ['卡片內 主要文字', C.ink, C.card, 4.5],
  ['卡片內 次要文字', C.muted, C.card, 4.5],
  ['卡片內 品牌紅字', C.brandDark, C.card, 4.5],
  ['白天底 主要文字', C.ink, C.dayBottom, 4.5],
  ['白天底 次要文字', C.muted, C.dayBottom, 4.5],
  ['白天底 次要文字（最亮處）', C.muted, C.dayTop, 4.5],
  ['白天底 連結／文字鈕', C.brandDark, C.dayBottom, 4.5],
  ['白天底 連結（最亮處）', C.brandDark, C.dayTop, 4.5],
  ['白天底 區塊標題（大字）', C.brandDark, C.dayMid, 3.0],
  ['夜晚底 主要文字', C.nightFg, C.nightMid, 4.5],
  ['夜晚底 次要文字', C.nightMuted, C.nightMid, 4.5],
  ['夜晚底 次要文字（最亮處）', C.nightMuted, C.nightTop, 4.5],
  ['夜晚底 連結（金）', C.gold, C.nightMid, 4.5],
  ['夜晚底 區塊標題（大字）', C.white, C.nightTop, 3.0],
  // 招牌（.app-header）是品牌識別區塊，字級 23px/900，走大字標準；刻意不動它的紅。
  ['紅底招牌 白字（大字）', C.white, C.brand, 3.0],
  ['紅底按鈕 白字', C.white, C.brandDark, 4.5],      // 15px 粗體不算大字，所以按鈕底用深一階的紅
  ['作用中分頁 白字', C.white, C.brandDark, 4.5],
];

let bad = 0;
console.log('對比度檢查（WCAG 2.1）\n');
for (const [name, fg, bg, min] of cases) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) bad++;
  console.log(`${ok ? '✅' : '❌'} ${name.padEnd(26, '　')} ${r.toFixed(2)} : 1  （需 ≥ ${min}）  ${fg} on ${bg}`);
}
console.log(`\n${bad === 0 ? '全部通過' : bad + ' 項未達標'}`);
process.exit(bad === 0 ? 0 : 1);
