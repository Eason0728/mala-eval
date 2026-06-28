import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashString, collectFingerprintSource } from '../js/fingerprint.js';

test('hashString 對相同輸入穩定', () => {
  assert.equal(hashString('abc'), hashString('abc'));
});

test('hashString 對不同輸入不同', () => {
  assert.notEqual(hashString('abc'), hashString('abd'));
});

test('collectFingerprintSource 組出特徵字串', () => {
  const nav = { userAgent: 'UA', language: 'zh-TW', platform: 'MacIntel', hardwareConcurrency: 8 };
  const scr = { width: 1440, height: 900, colorDepth: 24 };
  const s = collectFingerprintSource(nav, scr);
  assert.ok(s.includes('UA') && s.includes('1440') && s.includes('zh-TW'));
});
