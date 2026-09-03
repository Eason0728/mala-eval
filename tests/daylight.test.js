import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

// daylight.js 刻意寫成一般 script（要在 <head> 同步執行、避免夜間開啟閃一下白底），
// 所以這裡用 vm 執行它再取 globalThis.Daylight，而不是 import。
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(import.meta.dirname, '../js/daylight.js'), 'utf8'), ctx);
const { sunTimes, isDaylight } = ctx.Daylight;

const at = (dateStr, h, m = 0) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
};

test('新竹的日出日落與實際值誤差在 10 分鐘內', () => {
  // 對照值：新竹（24.80N, 120.99E）當日實際日出／日落
  const cases = [
    ['2026-09-03', 5 + 33 / 60, 18 + 13 / 60],
    ['2026-06-21', 5 + 6 / 60, 18 + 47 / 60],
    ['2026-12-21', 6 + 38 / 60, 17 + 12 / 60],
    ['2026-03-20', 6 + 0 / 60, 18 + 7 / 60],
  ];
  for (const [day, rise, set] of cases) {
    const t = sunTimes(new Date(`${day}T12:00:00`));
    assert.ok(Math.abs(t.sunrise - rise) < 10 / 60, `${day} 日出誤差過大：${t.sunrise} vs ${rise}`);
    assert.ok(Math.abs(t.sunset - set) < 10 / 60, `${day} 日落誤差過大：${t.sunset} vs ${set}`);
  }
});

test('夏至的白天比冬至長（超過 3 小時）', () => {
  const summer = sunTimes(new Date('2026-06-21T12:00:00'));
  const winter = sunTimes(new Date('2026-12-21T12:00:00'));
  assert.ok((summer.sunset - summer.sunrise) - (winter.sunset - winter.sunrise) > 3);
});

test('isDaylight：正午是白天、半夜是夜晚', () => {
  assert.equal(isDaylight(at('2026-09-03', 12)), true);
  assert.equal(isDaylight(at('2026-09-03', 0)), false);
  assert.equal(isDaylight(at('2026-12-21', 12)), true);
  assert.equal(isDaylight(at('2026-12-21', 23)), false);
});

test('isDaylight：日落前後會翻面（9/3 日落約 18:11）', () => {
  assert.equal(isDaylight(at('2026-09-03', 18, 0)), true);
  assert.equal(isDaylight(at('2026-09-03', 18, 30)), false);
});

test('isDaylight：冬天天黑得早（12/21 17:30 已是夜晚，夏天同時間還是白天）', () => {
  assert.equal(isDaylight(at('2026-12-21', 17, 30)), false);
  assert.equal(isDaylight(at('2026-06-21', 17, 30)), true);
});
