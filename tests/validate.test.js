import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPeerSubmission } from '../js/validate.js';

const ctx = {
  ratees: [{ name: '計時A', role: '計時' }, { name: '正職B', role: '正職' }],
  raterRole: '正職',
  attitudeCounts: { 計時: 3, 正職: 2 },
  perfCounts: { 計時: 4 },
};

test('全部評完 → 全員 complete、incomplete 為空', () => {
  const ratings = [
    { ratee: '計時A', attitude: [5, 4, 3], performance: [5, 5, 4, 4] },
    { ratee: '正職B', attitude: [4, 5], performance: null },
  ];
  const { complete, incomplete } = splitPeerSubmission(ratings, ctx);
  assert.equal(complete.length, 2);
  assert.deepEqual(incomplete, []);
});

test('完全沒評某位 → 該位列入 incomplete，其餘照常 complete', () => {
  const ratings = [{ ratee: '計時A', attitude: [5, 4, 3], performance: [5, 5, 4, 4] }];
  const { complete, incomplete } = splitPeerSubmission(ratings, ctx);
  assert.deepEqual(complete.map((r) => r.ratee), ['計時A']);
  assert.deepEqual(incomplete, ['正職B']);
});

test('態度題只填一半 → 該位列入 incomplete', () => {
  const ratings = [
    { ratee: '計時A', attitude: [5, 4, 0], performance: [5, 5, 4, 4] },
    { ratee: '正職B', attitude: [4, 5], performance: null },
  ];
  const { complete, incomplete } = splitPeerSubmission(ratings, ctx);
  assert.deepEqual(complete.map((r) => r.ratee), ['正職B']);
  assert.deepEqual(incomplete, ['計時A']);
});

test('正職評核者：計時表現未填滿 → 該位列入 incomplete', () => {
  const ratings = [
    { ratee: '計時A', attitude: [5, 4, 3], performance: [5, 5, 0, 4] },
    { ratee: '正職B', attitude: [4, 5], performance: null },
  ];
  const { incomplete } = splitPeerSubmission(ratings, ctx);
  assert.deepEqual(incomplete, ['計時A']);
});

test('計時評核者：計時同樣需態度+表現才算評完（全員互評）', () => {
  const ctxPt = { ...ctx, raterRole: '計時' };
  const done = [
    { ratee: '計時A', attitude: [5, 4, 3], performance: [5, 5, 4, 4] },
    { ratee: '正職B', attitude: [4, 5], performance: null },
  ];
  assert.deepEqual(splitPeerSubmission(done, ctxPt).incomplete, []);
  const noPerf = [
    { ratee: '計時A', attitude: [5, 4, 3], performance: null },
    { ratee: '正職B', attitude: [4, 5], performance: null },
  ];
  assert.deepEqual(splitPeerSubmission(noPerf, ctxPt).incomplete, ['計時A']);
});

test('分數超出 1–5 → 視為未評完', () => {
  const ratings = [
    { ratee: '計時A', attitude: [5, 4, 6], performance: [5, 5, 4, 4] },
    { ratee: '正職B', attitude: [4, 5], performance: null },
  ];
  assert.deepEqual(splitPeerSubmission(ratings, ctx).incomplete, ['計時A']);
});

test('全員都沒評 → complete 為空（前端據此擋下送出）', () => {
  const ratings = [
    { ratee: '計時A', attitude: [0, 0, 0], performance: [0, 0, 0, 0] },
    { ratee: '正職B', attitude: [0, 0], performance: null },
  ];
  const { complete, incomplete } = splitPeerSubmission(ratings, ctx);
  assert.equal(complete.length, 0);
  assert.deepEqual(incomplete, ['計時A', '正職B']);
});
