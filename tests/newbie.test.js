import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dueDateOf, daysBetween, newbieStatus, pendingList, newbieScore, NEWBIE_SINCE,
} from '../js/newbie.js';

// 用本地年月日比對——toISOString() 會轉 UTC，台灣 +8 會退一天。
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('dueDateOf 到職滿一個月＝下個月同一日', () => {
  assert.equal(fmt(dueDateOf('2026-09-03')), '2026-10-03');
  assert.equal(fmt(dueDateOf('2026-12-15')), '2027-01-15');
});

test('dueDateOf 下個月沒有那一日時取當月最後一天（1/31→2/28）', () => {
  assert.equal(fmt(dueDateOf('2027-01-31')), '2027-02-28');
  assert.equal(fmt(dueDateOf('2028-01-31')), '2028-02-29'); // 閏年
  assert.equal(fmt(dueDateOf('2026-10-31')), '2026-11-30');
});

test('daysBetween 只算日、不受時分影響', () => {
  assert.equal(daysBetween('2026-10-03', '2026-10-10'), 7);
  assert.equal(daysBetween(new Date(2026, 9, 3, 23, 59), new Date(2026, 9, 4, 0, 1)), 1);
});

test('newbieStatus 沒填到職日＝不是新人', () => {
  assert.equal(newbieStatus({ hireDate: '' }).state, 'none');
  assert.equal(newbieStatus({ hireDate: null }).state, 'none');
});

test('newbieStatus 到職日早於上線日＝既有同仁，不觸發（補填全員到職日也不會爆）', () => {
  assert.equal(newbieStatus({ hireDate: '2024-05-01', today: new Date('2026-10-05') }).state, 'none');
  assert.equal(newbieStatus({ hireDate: NEWBIE_SINCE, today: new Date('2026-10-05') }).state, 'due');
});

test('newbieStatus 還沒滿一個月＝waiting，附還剩幾天', () => {
  const s = newbieStatus({ hireDate: '2026-09-10', today: new Date('2026-10-05') });
  assert.equal(s.state, 'waiting');
  assert.equal(s.daysLeft, 5);
});

test('newbieStatus 滿月當天起＝due；逾期超過 7 天標 late', () => {
  const day0 = newbieStatus({ hireDate: '2026-09-10', today: new Date('2026-10-10') });
  assert.equal(day0.state, 'due');
  assert.equal(day0.overdueDays, 0);
  assert.equal(day0.late, false);
  const late = newbieStatus({ hireDate: '2026-09-10', today: new Date('2026-10-20') });
  assert.equal(late.overdueDays, 10);
  assert.equal(late.late, true);
});

test('newbieStatus 已考核過＝done，不再出現在待辦', () => {
  assert.equal(newbieStatus({ hireDate: '2026-09-10', today: new Date('2026-10-20'), done: true }).state, 'done');
});

test('pendingList 只回待考核者，逾期最久的排最前', () => {
  const accounts = [
    { name: '新人A', role: '計時', hireDate: '2026-09-01' }, // 10/01 到期
    { name: '新人B', role: '計時', hireDate: '2026-09-20' }, // 10/20 到期（未到）
    { name: '新人C', role: '正職', hireDate: '2026-09-05' }, // 10/05 到期
    { name: '老鳥D', role: '計時', hireDate: '' },
    { name: '新人E', role: '計時', hireDate: '2026-09-02' }, // 已考核
  ];
  const list = pendingList(accounts, ['新人E'], new Date('2026-10-10'));
  assert.deepEqual(list.map((x) => x.name), ['新人A', '新人C']);
  assert.equal(list[0].overdueDays, 9);
});

test('newbieScore 態度＋表現直接加總（單一評分者不平均）', () => {
  const att = [5, 5, 5, 5, 5, 5];            // 6 題滿分 30
  const perf = new Array(14).fill(5);        // 14 題滿分 70
  assert.deepEqual(newbieScore(att, perf), { attitude: 30, performance: 70, total: 100 });
  const mid = newbieScore([3, 3, 3, 3, 3, 3], new Array(14).fill(4));
  assert.deepEqual(mid, { attitude: 18, performance: 56, total: 74 });
});

test('newbieScore 沒填完（有 0 分或空）→ 該項與總分皆 null', () => {
  assert.deepEqual(newbieScore([5, 5, 0, 5, 5, 5], new Array(14).fill(5)),
    { attitude: null, performance: 70, total: null });
  assert.deepEqual(newbieScore([], []), { attitude: null, performance: null, total: null });
});
