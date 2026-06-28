// 裝置指紋：純函式（可測）＋ 瀏覽器便利函式。

// FNV-1a 32-bit 穩定雜湊 → 8 碼十六進位。
export function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// 從 navigator/screen 組出特徵字串。
export function collectFingerprintSource(nav, screenObj) {
  return [
    nav.userAgent,
    nav.language,
    nav.platform,
    nav.hardwareConcurrency,
    screenObj.width,
    screenObj.height,
    screenObj.colorDepth,
    new Date().getTimezoneOffset(),
  ].join('|');
}

// 瀏覽器端便利函式（不寫單元測試）。
export function deviceFingerprint() {
  return hashString(collectFingerprintSource(navigator, screen));
}
