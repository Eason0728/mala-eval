import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePeerSubmission } from '../js/validate.js';

const ratees = ['A', 'B'];

test('全部填妥→無錯誤', () => {
  const ratings = [
    { ratee: 'A', scores: [5, 4, 3, 2, 1, 5] },
    { ratee: 'B', scores: [1, 2, 3, 4, 5, 1] },
  ];
  assert.deepEqual(validatePeerSubmission(ratings, ratees, 6), []);
});

test('缺一位受評者→報錯', () => {
  const ratings = [{ ratee: 'A', scores: [5, 4, 3, 2, 1, 5] }];
  const errs = validatePeerSubmission(ratings, ratees, 6);
  assert.ok(errs.some((e) => e.includes('B')));
});

test('分數超出範圍→報錯', () => {
  const ratings = [
    { ratee: 'A', scores: [6, 4, 3, 2, 1, 5] },
    { ratee: 'B', scores: [1, 2, 3, 4, 5, 1] },
  ];
  const errs = validatePeerSubmission(ratings, ratees, 6);
  assert.ok(errs.length > 0);
});
