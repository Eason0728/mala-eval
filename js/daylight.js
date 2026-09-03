// 依「當地真正的日出日落」切換白天／夜晚配色。純計算，不打任何 API、不用定位。
// 刻意寫成一般 script（不是 ES module）並放在 <head> 同步載入：這樣在畫面畫出來之前
// class 就已經套好，晚上開啟不會先閃一下白底。功能與測試共用同一份程式，不另外複製。
(function (root) {
  var LAT = 24.80;   // 新竹光復店
  var LON = 120.99;
  var TZ = 8;        // 台灣 UTC+8

  function dayOfYear(d) {
    return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  }

  // 當天的日出、日落（當地時間的小時數，含小數）。極區才會回 null，台灣不會遇到。
  function sunTimes(date, lat, lon, tz) {
    if (lat === undefined) lat = LAT;
    if (lon === undefined) lon = LON;
    if (tz === undefined) tz = TZ;
    var rad = Math.PI / 180;
    var N = dayOfYear(date);
    var decl = 23.44 * rad * Math.sin(2 * Math.PI * (284 + N) / 365); // 太陽赤緯
    // -0.833°＝日出的標準定義（太陽上緣切地平線，含大氣折射），少了它會早關燈晚開燈約 5 分鐘
    var h0 = -0.833 * rad;
    var cosH = (Math.sin(h0) - Math.sin(lat * rad) * Math.sin(decl))
             / (Math.cos(lat * rad) * Math.cos(decl));
    if (cosH > 1) return { sunrise: null, sunset: null, allNight: true };
    if (cosH < -1) return { sunrise: null, sunset: null, allDay: true };
    var H = Math.acos(cosH) / rad / 15;                                // 半日長（小時）
    var B = 2 * Math.PI * (N - 81) / 364;
    var eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // 均時差（分）
    var noon = 12 - (lon - 15 * tz) / 15 - eot / 60;
    return { sunrise: noon - H, sunset: noon + H };
  }

  function isDaylight(now, lat, lon, tz) {
    var t = sunTimes(now, lat, lon, tz);
    if (t.allDay) return true;
    if (t.allNight) return false;
    var h = now.getHours() + now.getMinutes() / 60;
    return h >= t.sunrise && h < t.sunset;
  }

  root.Daylight = { sunTimes: sunTimes, isDaylight: isDaylight, dayOfYear: dayOfYear };

  // 瀏覽器裡：立刻套用，之後每 5 分鐘複查一次（開著頁面跨過日落也會自己換）
  if (typeof document !== 'undefined' && document.documentElement) {
    var apply = function () {
      var day = isDaylight(new Date());
      var el = document.body || document.documentElement;
      el.classList.toggle('tod-day', day);
      el.classList.toggle('tod-night', !day);
      if (root.Skyscape) root.Skyscape.setMode(day ? 'day' : 'night'); // 換太陽／月亮
    };
    apply();
    document.addEventListener('DOMContentLoaded', apply);
    setInterval(apply, 5 * 60 * 1000);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
