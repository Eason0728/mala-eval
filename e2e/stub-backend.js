// e2e 測試用的有狀態假後端：攔截 fetch，行為比照 apps-script/Code.gs。
// 資料存 localStorage（跨重新整理仍在），只給 e2e/run.py 用，不會出現在正式站。
(function () {
  var KEY = 'e2e_store';
  var PASSCODE = (typeof window !== 'undefined' && window.__E2E_DATA && window.__E2E_DATA.passcode) || '9999';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || fresh(); } catch (e) { return fresh(); }
  }
  function save(st) { localStorage.setItem(KEY, JSON.stringify(st)); }
  function fresh() {
    return { peer: [], self: [], selfMsgs: [], perf: [], adjust: [], feedback: [], newbie: [], results: {}, pw: {} };
  }

  // ── 測試資料由 run.py 每次隨機產生後注入（window.__E2E_DATA）──────
  // 刻意不寫死：用開發當時那組熟悉的資料去測，只能證明「系統對那組資料能動」。
  var D = (typeof window !== 'undefined' && window.__E2E_DATA) || {};
  var ACCOUNTS = D.accounts;
  var BANKS = D.banks;
  var TIERS = D.tiers;
  var FT_TEMPLATES = D.ftTemplates;
  var FT_TITLES = D.ftTitles;
  if (!ACCOUNTS || !BANKS) throw new Error('e2e stub：沒有收到 window.__E2E_DATA，run.py 沒注入資料');

  // ── 與 Code.gs 相同的規則 ────────────────────────────────────
  function currentQuarter() {
    var d = new Date();                       // e2e 的 Date 已被 run.py 假造
    var y = d.getFullYear(), m = d.getMonth() + 1;
    var q = Math.ceil(m / 3) - 1;
    return q === 0 ? (y - 1) + '-Q4' : y + '-Q' + q;
  }
  function findAccount(account, password) {
    var st = load();
    var acc = null;
    ACCOUNTS.forEach(function (a) { if (a.account === String(account)) acc = a; });
    if (!acc) return null;
    var pw = st.pw[acc.account] || D.defaultPassword || '0000';
    return String(password) === pw ? acc : null;
  }
  function isManager(name) { return FT_TITLES[name] === '店長'; }
  function alreadyPeer(st, q, rater) { return st.peer.some(function (r) { return r.quarter === q && r.rater === rater; }); }
  function alreadySelf(st, q, person) { return st.self.some(function (r) { return r.quarter === q && r.person === person; }); }

  // ── 各端點 ──────────────────────────────────────────────────
  function handleConfig() {
    return {
      ver: 'e2e', quarter: currentQuarter(),
      accounts: ACCOUNTS.map(function (a) { return { name: a.name, role: a.role }; }),
      banks: BANKS, wageTiers: TIERS,
    };
  }
  function handleAdminData(passcode, quarter) {
    if (String(passcode) !== PASSCODE) return { error: 'bad passcode' };
    var st = load();
    var peerRecords = [];
    st.peer.forEach(function (row) {
      if (row.quarter !== quarter) return;
      row.ratings.forEach(function (r) {
        peerRecords.push({ rater: row.rater, ratee: r.ratee, category: '態度', scores: r.attitude });
        if (r.performance) peerRecords.push({ rater: row.rater, ratee: r.ratee, category: '表現', scores: r.performance });
      });
    });
    var selfRecords = [];
    st.self.forEach(function (row) {
      if (row.quarter !== quarter) return;
      selfRecords.push({ ratee: row.person, role: row.role, category: '態度', scores: row.attitude });
      if (row.performance) selfRecords.push({ ratee: row.person, role: row.role, category: '表現', scores: row.performance });
    });
    var results = (st.results[quarter] || []).map(function (r) {
      return { ratee: r[0], role: r[1], category: r[2], key: r[3], label: r[4], score: r[5] };
    });
    return {
      config: handleConfig(),
      peerRecords: peerRecords,
      supervisorPerf: st.perf.filter(function (p) { return p.quarter === quarter; }),
      adjustments: st.adjust.filter(function (a) { return a.quarter === quarter; }),
      results: results,
      selfRecords: selfRecords,
      companyMessages: st.selfMsgs.filter(function (m) { return m.quarter === quarter && m.kind === '公司'; }).map(function (m) { return m.msg; }),
      supervisorFeedback: st.feedback.filter(function (f) { return f.quarter === quarter; }).map(function (f) { return { ratee: f.ratee, text: f.text }; }),
      ftTemplates: FT_TEMPLATES, ftTitles: FT_TITLES,
      newbieRecords: st.newbie,
    };
  }
  var HANDLERS = {
    login: function (p) {
      var acc = findAccount(p.account, p.password);
      if (!acc) return { ok: false, reason: 'invalid' };
      var st = load(); var q = currentQuarter();
      return {
        ok: true, name: acc.name, role: acc.role, quarter: q,
        alreadyDone: alreadyPeer(st, q, acc.name),
        alreadySelfDone: alreadySelf(st, q, acc.name),
        isManager: isManager(acc.name),
      };
    },
    peer: function (p) {
      var acc = findAccount(p.account, p.password);
      if (!acc) return { ok: false, reason: 'unauthorized' };
      var st = load(); var q = currentQuarter();
      if (alreadyPeer(st, q, acc.name)) return { ok: false, reason: 'duplicate' };
      st.peer.push({ quarter: q, rater: acc.name, ratings: p.ratings });
      save(st);
      return { ok: true };
    },
    self: function (p) {
      var acc = findAccount(p.account, p.password);
      if (!acc) return { ok: false, reason: 'unauthorized' };
      var st = load(); var q = currentQuarter();
      if (alreadySelf(st, q, acc.name)) return { ok: false, reason: 'duplicate' };
      st.self.push({ quarter: q, person: acc.name, role: acc.role, attitude: p.attitude, performance: p.performance });
      if (p.selfNote) st.selfMsgs.push({ quarter: q, from: acc.name, kind: '自己', to: acc.name, msg: p.selfNote, anon: false });
      if (p.companyNote) st.selfMsgs.push({ quarter: q, from: acc.name, kind: '公司', to: '', msg: p.companyNote, anon: true });
      (p.peerMessages || []).forEach(function (m) {
        st.selfMsgs.push({ quarter: q, from: acc.name, kind: '夥伴', to: m.to, msg: m.msg, anon: !!m.anon });
      });
      save(st);
      return { ok: true };
    },
    myScores: function (p) {
      var acc = findAccount(p.account, p.password);
      if (!acc) return { ok: false, reason: 'invalid' };
      var st = load(); var name = acc.name;
      var records = [];
      st.peer.forEach(function (row) {
        row.ratings.forEach(function (r) {
          if (r.ratee !== name) return;
          records.push({ quarter: row.quarter, category: '態度', scores: r.attitude });
          if (r.performance) records.push({ quarter: row.quarter, category: '表現', scores: r.performance });
        });
      });
      var self = [];
      st.self.forEach(function (row) {
        if (row.person !== name) return;
        self.push({ quarter: row.quarter, category: '態度', scores: row.attitude });
        if (row.performance) self.push({ quarter: row.quarter, category: '表現', scores: row.performance });
      });
      var title = FT_TITLES[name] || '';
      var nb = null;
      st.newbie.forEach(function (r) { if (r.ratee === name) nb = r; });
      return {
        ok: true, name: name, role: acc.role, records: records, self: self,
        supervisorPerf: st.perf.filter(function (x) { return x.ratee === name; })
          .map(function (x) { return { quarter: x.quarter, sel: x.sel, actual: x.actual }; }),
        seeded: [],
        messagesToMe: st.selfMsgs.filter(function (m) { return m.kind === '夥伴' && m.to === name; })
          .map(function (m) { return { quarter: m.quarter, msg: m.msg, from: m.anon ? '' : m.from }; }),
        myNotes: st.selfMsgs.filter(function (m) { return m.kind === '自己' && m.from === name; })
          .map(function (m) { return { quarter: m.quarter, msg: m.msg }; }),
        supervisorFeedback: st.feedback.filter(function (f) { return f.ratee === name; })
          .map(function (f) { return { quarter: f.quarter, msg: f.text }; }),
        adjustments: st.adjust.filter(function (a) { return a.ratee === name; })
          .map(function (a) { return { quarter: a.quarter, attitudeAdjust: a.attitudeAdjust, performanceAdjust: a.performanceAdjust }; }),
        ftTitle: title, ftTemplate: title ? FT_TEMPLATES[title] : [],
        newbie: nb, hireDate: acc.hireDate || '',
      };
    },
    changePassword: function (p) {
      var acc = findAccount(p.account, p.oldPassword);
      if (!acc) return { ok: false, reason: 'invalid' };
      if (!p.newPassword || String(p.newPassword).length < 4) return { ok: false, reason: 'tooshort' };
      var st = load(); st.pw[acc.account] = String(p.newPassword); save(st);
      return { ok: true };
    },
    supervisorPerf: function (p) {
      if (String(p.passcode) !== PASSCODE) return { ok: false, reason: 'unauthorized' };
      var st = load(); var q = currentQuarter();
      st.perf = st.perf.filter(function (x) { return !(x.quarter === q && x.ratee === p.ratee); });
      st.perf.push({ quarter: q, ratee: p.ratee, sel: p.sel, actual: p.actual });
      save(st); return { ok: true };
    },
    ftTemplate: function (p) {
      if (String(p.passcode) !== PASSCODE) return { ok: false, reason: 'unauthorized' };
      FT_TEMPLATES[p.title] = p.items;    // 只留在記憶體：e2e 不驗範本持久化
      return { ok: true };
    },
    ftTitle: function (p) {
      if (String(p.passcode) !== PASSCODE) return { ok: false, reason: 'unauthorized' };
      FT_TITLES[p.ratee] = p.title;
      return { ok: true };
    },
    adjust: function (p) {
      if (String(p.passcode) !== PASSCODE) return { ok: false, reason: 'unauthorized' };
      var st = load(); var q = currentQuarter();
      st.adjust = st.adjust.filter(function (x) { return !(x.quarter === q && x.ratee === p.ratee); });
      st.adjust.push({ quarter: q, ratee: p.ratee, attitudeAdjust: p.attitudeAdjust, performanceAdjust: p.performanceAdjust });
      save(st); return { ok: true };
    },
    supervisorFeedback: function (p) {
      if (String(p.passcode) !== PASSCODE) return { ok: false, reason: 'unauthorized' };
      var st = load(); var q = currentQuarter();
      st.feedback = st.feedback.filter(function (x) { return !(x.quarter === q && x.ratee === p.ratee); });
      st.feedback.push({ quarter: q, ratee: p.ratee, text: p.text });
      save(st); return { ok: true };
    },
    saveResults: function (p) {
      if (String(p.passcode) !== PASSCODE) return { ok: false, reason: 'unauthorized' };
      var st = load(); st.results[p.quarter] = p.rows; save(st); return { ok: true };
    },
    clearResults: function (p) {
      if (String(p.passcode) !== PASSCODE) return { ok: false, reason: 'unauthorized' };
      var st = load(); delete st.results[p.quarter]; save(st); return { ok: true };
    },
    newbieList: function (p) {
      var acc = findAccount(p.account, p.password);
      if (!acc) return { ok: false, reason: 'unauthorized' };
      if (!isManager(acc.name)) return { ok: false, reason: 'forbidden' };
      var st = load();
      return {
        ok: true,
        accounts: ACCOUNTS.map(function (a) { return { name: a.name, role: a.role, hireDate: a.hireDate || '' }; }),
        done: st.newbie.map(function (r) { return { ratee: r.ratee, rater: r.rater, time: r.time }; }),
      };
    },
    newbieSubmit: function (p) {
      var acc = findAccount(p.account, p.password);
      if (!acc) return { ok: false, reason: 'unauthorized' };
      if (!isManager(acc.name)) return { ok: false, reason: 'forbidden' };
      var st = load();
      var target = null;
      ACCOUNTS.forEach(function (a) { if (a.name === p.ratee) target = a; });
      if (!target) return { ok: false, reason: 'no ratee' };
      if (!target.hireDate) return { ok: false, reason: 'no hire date' };
      if (st.newbie.some(function (r) { return r.ratee === p.ratee; })) return { ok: false, reason: 'duplicate' };
      var bad = function (v) { return !(Number(v) >= 1 && Number(v) <= 5); };
      if (!p.attitude.length || !p.performance.length || p.attitude.some(bad) || p.performance.some(bad)) return { ok: false, reason: 'incomplete' };
      st.newbie.push({ time: new Date().toISOString(), ratee: p.ratee, hireDate: target.hireDate, rater: acc.name, attitude: p.attitude, performance: p.performance });
      save(st); return { ok: true };
    },
  };

  var realFetch = window.fetch.bind(window);
  window.fetch = function (url, opt) {
    var u = String(url);
    if (u.indexOf('script.google.com') < 0) return realFetch(url, opt);
    return new Promise(function (resolve) {
      setTimeout(function () {                      // 模擬網路延遲，btnWaiting 的字樣才驗得到
        var out;
        if (u.indexOf('action=adminData') >= 0) {
          var m = u.match(/passcode=([^&]*)/); var mq = u.match(/quarter=([^&]*)/);
          out = handleAdminData(decodeURIComponent(m ? m[1] : ''), decodeURIComponent(mq ? mq[1] : ''));
        } else if (u.indexOf('action=config') >= 0) {
          out = handleConfig();
        } else if (opt && opt.body) {
          var p = JSON.parse(opt.body);
          out = HANDLERS[p.type] ? HANDLERS[p.type](p) : { ok: false, reason: 'unknown type' };
        } else {
          out = { ok: false, reason: 'bad request' };
        }
        resolve(new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } }));
      }, 400);
    });
  };
})();
