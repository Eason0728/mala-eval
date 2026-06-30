import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  raterTotal, averageTotals, round1, finalScore, aggregateRatee,
} from '../js/scoring.js';

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
