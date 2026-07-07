import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  raterTotal, averageTotals, averageItems, round1, finalScore, aggregateRatee,
  kpiItemScore, kpiTotal,
} from '../js/scoring.js';

test('averageItems 每題平均；加總等於 averageTotals；空回 null', () => {
  assert.deepEqual(averageItems([[5, 4], [3, 4]]), [4, 4]);
  assert.equal(averageItems([]), null);
  const list = [[5, 4, 3], [4, 4, 2]];
  const perItem = averageItems(list);
  const sumPerItem = perItem.reduce((a, b) => a + b, 0);
  const avgTotals = averageTotals(list.map((s) => s.reduce((a, b) => a + b, 0)));
  assert.equal(round1(sumPerItem), round1(avgTotals));
});

test('raterTotal 加總；空回 null', () => {
  assert.equal(raterTotal([5, 4, 3]), 12);
  assert.equal(raterTotal([]), null);
  assert.equal(raterTotal(null), null);
});

test('averageTotals 平均；空回 null', () => {
  assert.equal(averageTotals([10, 20]), 15);
  assert.equal(averageTotals([]), null);
});

test('round1 四捨五入一位', () => {
  assert.equal(round1(15.049), 15);
  assert.equal(round1(15.05), 15.1);
});

test('finalScore：態度 null → null', () => {
  assert.deepEqual(finalScore({ attitude: null }), { score: null, performanceCounted: false });
});

test('finalScore：無表現只計態度（含調整）', () => {
  assert.deepEqual(finalScore({ attitude: 20, attitudeAdjust: 2 }),
    { score: 22, performanceCounted: false });
});

test('finalScore：態度+表現+雙調整', () => {
  assert.deepEqual(
    finalScore({ attitude: 20, attitudeAdjust: 1, performance: 30, performanceAdjust: -2 }),
    { score: 49, performanceCounted: true });
});

test('aggregateRatee 計時：表現=正職互評平均', () => {
  const r = aggregateRatee({
    ratee: '小明', role: '計時',
    attitudeTotals: [20, 22], performanceTotals: [30, 28],
  });
  assert.equal(r.attitude, 21);
  assert.equal(r.performance, 29);
  assert.equal(r.finalScore, 50);
  assert.equal(r.performanceCounted, true);
  assert.equal(r.attitudeCount, 2);
  assert.equal(r.performanceCount, 2);
});

test('aggregateRatee 正職：表現=主管評分（單一）', () => {
  const r = aggregateRatee({
    ratee: '阿華', role: '正職',
    attitudeTotals: [18, 20], supervisorPerf: 33,
  });
  assert.equal(r.attitude, 19);
  assert.equal(r.performance, 33);
  assert.equal(r.finalScore, 52);
  assert.equal(r.performanceCount, 1);
});

test('aggregateRatee 正職：主管未評 → 表現未計、只算態度', () => {
  const r = aggregateRatee({ ratee: '阿華', role: '正職', attitudeTotals: [20], supervisorPerf: null });
  assert.equal(r.performance, null);
  assert.equal(r.performanceCounted, false);
  assert.equal(r.finalScore, 20);
  assert.equal(r.performanceCount, 0);
});

test('aggregateRatee：無人評態度 → 資料不足', () => {
  const r = aggregateRatee({ ratee: '小明', role: '計時', attitudeTotals: [], performanceTotals: [] });
  assert.equal(r.attitude, null);
  assert.equal(r.finalScore, null);
});

test('aggregateRatee：± 調整生效', () => {
  const r = aggregateRatee({
    ratee: '小明', role: '計時',
    attitudeTotals: [20], performanceTotals: [30],
    adjustment: { attitudeAdjust: 2, performanceAdjust: -3 },
  });
  assert.equal(r.finalScore, 49);
});

test('kpiItemScore 技能項：等級 A/B/C/D = 比重×100/80/60/40%', () => {
  assert.equal(kpiItemScore({ weight: 20, type: '技能' }, 'A'), 20);
  assert.equal(kpiItemScore({ weight: 20, type: '技能' }, 'B'), 16);
  assert.equal(kpiItemScore({ weight: 10, type: '技能' }, 'C'), 6);
  assert.equal(kpiItemScore({ weight: 5, type: '技能' }, 'D'), 2);
  assert.equal(kpiItemScore({ weight: 5, type: '技能' }, ''), null); // 未評
});

test('kpiItemScore 執行力項：完成=比重、未完成=0', () => {
  assert.equal(kpiItemScore({ weight: 5, type: '執行力' }, '完成'), 5);
  assert.equal(kpiItemScore({ weight: 5, type: '執行力' }, '未完成'), 0);
  assert.equal(kpiItemScore({ weight: 5, type: '執行力' }, ''), null); // 未評
});

test('kpiTotal 全評完 → 加總；滿分情境=70', () => {
  const items = [
    { key: 'sales', weight: 5, type: '技能' }, { key: 'profit', weight: 10, type: '技能' },
    { key: 'op', weight: 20, type: '技能' }, { key: 'stock', weight: 5, type: '技能' },
    { key: 'google', weight: 5, type: '技能' },
    { key: 'e6', weight: 5, type: '執行力' }, { key: 'e7', weight: 5, type: '執行力' },
    { key: 'e8', weight: 5, type: '執行力' }, { key: 'e9', weight: 5, type: '執行力' },
    { key: 'e10', weight: 5, type: '執行力' },
  ];
  const allA = {};
  items.forEach((it) => { allA[it.key] = it.type === '執行力' ? '完成' : 'A'; });
  assert.equal(kpiTotal(items, allA), 70);
});

test('kpiTotal 混合等級 → 加權加總', () => {
  const items = [
    { key: 'sales', weight: 5, type: '技能' }, // A → 5
    { key: 'profit', weight: 10, type: '技能' }, // B → 8
    { key: 'op', weight: 20, type: '技能' }, // C → 12
    { key: 'e6', weight: 5, type: '執行力' }, // 完成 → 5
    { key: 'e7', weight: 5, type: '執行力' }, // 未完成 → 0
  ];
  const sel = { sales: 'A', profit: 'B', op: 'C', e6: '完成', e7: '未完成' };
  assert.equal(kpiTotal(items, sel), 30);
});

test('kpiTotal 任一項未評 → null（整體未計）', () => {
  const items = [{ key: 'a', weight: 5, type: '技能' }, { key: 'b', weight: 5, type: '執行力' }];
  assert.equal(kpiTotal(items, { a: 'A' }), null); // b 未評
  assert.equal(kpiTotal([], {}), null);
});
