import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePeerSubmission } from '../js/validate.js';

const ctx = {
  ratees: [{ name: '計時A', role: '計時' }, { name: '正職B', role: '正職' }],
  raterRole: '正職',
  attitudeCounts: { 計時: 3, 正職: 2 },
  perfCounts: { 計時: 4 },
};

test('正職評核者：計時需態度+表現、正職只需態度 → 通過', () => {
  const ratings = [
    { ratee: '計時A', attitude: [5, 4, 3], performance: [5, 5, 4, 4] },
    { ratee: '正職B', attitude: [4, 5], performance: null },
  ];
  assert.deepEqual(validatePeerSubmission(ratings, ctx), []);
});

test('缺某位受評者 → 報錯', () => {
  const ratings = [{ ratee: '計時A', attitude: [5, 4, 3], performance: [5, 5, 4, 4] }];
  const errs = validatePeerSubmission(ratings, ctx);
  assert.ok(errs.some((e) => e.includes('正職B')));
});

test('態度題未填滿 → 報錯', () => {
  const ratings = [
    { ratee: '計時A', attitude: [5, 4], performance: [5, 5, 4, 4] },
    { ratee: '正職B', attitude: [4, 5], performance: null },
  ];
  assert.ok(validatePeerSubmission(ratings, ctx).some((e) => e.includes('計時A') && e.includes('態度')));
});

test('正職評核者：計時表現未填滿 → 報錯', () => {
  const ratings = [
    { ratee: '計時A', attitude: [5, 4, 3], performance: [5, 5, 0, 4] },
    { ratee: '正職B', attitude: [4, 5], performance: null },
  ];
  assert.ok(validatePeerSubmission(ratings, ctx).some((e) => e.includes('計時A') && e.includes('表現')));
});

test('計時評核者：不需填任何表現 → 通過', () => {
  const ctxPt = { ...ctx, raterRole: '計時' };
  const ratings = [
    { ratee: '計時A', attitude: [5, 4, 3], performance: null },
    { ratee: '正職B', attitude: [4, 5], performance: null },
  ];
  assert.deepEqual(validatePeerSubmission(ratings, ctxPt), []);
});

test('分數超出 1–5 → 報錯', () => {
  const ratings = [
    { ratee: '計時A', attitude: [5, 4, 6], performance: [5, 5, 4, 4] },
    { ratee: '正職B', attitude: [4, 5], performance: null },
  ];
  assert.ok(validatePeerSubmission(ratings, ctx).some((e) => e.includes('計時A')));
});
