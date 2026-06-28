import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  averageItemScores, attitudeScore, round1, finalSubtotal, lookupWage, aggregateRatee,
} from '../js/scoring.js';

test('averageItemScores 計算每項平均', () => {
  const list = [
    [5, 4, 3, 2, 1, 5],
    [3, 4, 3, 4, 1, 5],
  ];
  assert.deepEqual(averageItemScores(list), [4, 4, 3, 3, 1, 5]);
});

test('averageItemScores 無互評回 null', () => {
  assert.equal(averageItemScores([]), null);
});

test('attitudeScore 為六項平均加總', () => {
  assert.equal(attitudeScore([4, 4, 3, 3, 1, 5]), 20);
});

test('attitudeScore 輸入 null 回 null', () => {
  assert.equal(attitudeScore(null), null);
});

test('round1 四捨五入到一位小數', () => {
  assert.equal(round1(3.456), 3.5);
  assert.equal(round1(20), 20);
});

test('finalSubtotal 第一階段只計態度（職能 null）', () => {
  assert.deepEqual(
    finalSubtotal({ attitude: 24, attitudeAdjust: 2 }),
    { subtotal: 26, competencyCounted: false }
  );
});

test('finalSubtotal 含職能時兩者相加', () => {
  assert.deepEqual(
    finalSubtotal({ attitude: 24, attitudeAdjust: -1, competency: 60, competencyAdjust: 5 }),
    { subtotal: 88, competencyCounted: true }
  );
});

test('finalSubtotal 態度 null 時 subtotal null', () => {
  assert.deepEqual(
    finalSubtotal({ attitude: null }),
    { subtotal: null, competencyCounted: false }
  );
});

const wageTable = [
  { min: 90, max: 100, wage: 200 },
  { min: 80, max: 89, wage: 190 },
  { min: 70, max: 79, wage: 183 },
];

test('lookupWage 命中區間', () => {
  assert.deepEqual(lookupWage(85, wageTable), { status: 'ok', wage: 190 });
  assert.deepEqual(lookupWage(90, wageTable), { status: 'ok', wage: 200 });
});

test('lookupWage 資料不足', () => {
  assert.deepEqual(lookupWage(null, wageTable), { status: 'insufficient' });
});

test('lookupWage 表外需人工確認', () => {
  assert.deepEqual(lookupWage(50, wageTable), { status: 'manual' });
});

const wt = [
  { min: 25, max: 30, wage: 200 },
  { min: 20, max: 24, wage: 190 },
];

test('aggregateRatee 有互評＋態度調整', () => {
  const r = aggregateRatee({
    ratee: '許雅筑',
    scoresList: [[5, 5, 4, 4, 4, 4], [5, 5, 4, 4, 4, 4]],
    adjustment: { attitudeAdjust: 1 },
    wageTable: wt,
  });
  assert.equal(r.ratee, '許雅筑');
  assert.equal(r.responseCount, 2);
  assert.equal(r.attitude, 26);
  assert.equal(r.attitudeAdjust, 1);
  assert.equal(r.competency, null);
  assert.equal(r.subtotal, 27);
  assert.equal(r.competencyCounted, false);
  assert.deepEqual(r.wage, { status: 'ok', wage: 200 });
});

test('aggregateRatee 無互評→資料不足', () => {
  const r = aggregateRatee({ ratee: '王禹婕', scoresList: [], adjustment: {}, wageTable: wt });
  assert.equal(r.attitude, null);
  assert.equal(r.subtotal, null);
  assert.equal(r.responseCount, 0);
  assert.deepEqual(r.wage, { status: 'insufficient' });
});
