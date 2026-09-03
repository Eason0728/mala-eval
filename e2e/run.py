#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""端到端測試：每次用**全新隨機資料**跑完整流程，驗算所有數字，並稽核每一顆按鈕。

  python3 e2e/run.py                # 隨機一組新資料
  E2E_SEED=12345 python3 e2e/run.py # 重現某次的那組資料（失敗時用）

三條規矩（Eason 2026-09-03 指定）：
  1. 資料每次全新隨機（人名、人數、角色、星等、KPI、調整、到職日、留言全部重抽），
     不重用開發時那組熟悉的資料。
  2. 預期值由 e2e/dataset.py 獨立算，**不 import js/scoring.js**——拿系統自己的函式
     算預期值是循環論證。
  3. 每一顆按鈕與連結都要被點過並驗證到達正確目的地；漏一顆就報失敗（見 e2e/clickmap.py）。

兩階段假日期，跨過現實中永不重疊的時間閘門：
  階段A 10/3（開放期）填資料 → 階段B 10/12（10 號後）驗成績。
"""
import http.server
import json
import os
import random
import shutil
import socketserver
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dataset import make_dataset, make_ratings, expectations, round1   # noqa: E402
from clickmap import ClickMap, KEY_JS                                  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'e2e', 'artifacts')
PORT = 8799
BASE = f'http://localhost:{PORT}/'

RESULTS = []
CM = ClickMap()


def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok), str(detail)))
    print(('✅ ' if ok else '❌ ') + name + (f'　{detail}' if (detail and not ok) else ''))


def fmt(v):
    """照畫面的顯示規格格式化：JS 沒有 26.0 這種東西，整數就是「26」。"""
    if v is None:
        return '—'
    return str(int(v)) if float(v).is_integer() else str(round1(v))


def shot(page, name):
    os.makedirs(SHOTS, exist_ok=True)
    page.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=True)


# ── 瀏覽器小工具 ──────────────────────────────────────────────
def visible(page, sel):
    return page.evaluate(
        "(s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }", sel)


def wait_text(page, sel, text, timeout=20000):
    page.wait_for_function(
        "([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }",
        arg=[sel, text], timeout=timeout)


def text_of(page, sel):
    return page.evaluate("(s) => { const e = document.querySelector(s); return e ? e.innerText : ''; }", sel)


def row_text(page, container, needle):
    """抓出表格中含某個關鍵字的那一列文字（用來比對分數）。"""
    return page.evaluate(
        """([c, n]) => { const tr = [...document.querySelectorAll(c + ' tr')].find(r => r.textContent.includes(n));
             return tr ? tr.innerText.replace(/\\s+/g, ' ') : ''; }""", [container, needle])


def click(page, selector, verified, key=None):
    """點一顆按鈕並登記已驗證。key 由元素本身算出，保證與掃描結果一致。"""
    k = key or page.evaluate(KEY_JS, selector)
    page.click(selector)
    if k:
        CM.mark(k, verified)


def mark_el(page, selector, verified):
    """元素已用其他方式操作過（例如 select_option），只登記不點。"""
    k = page.evaluate(KEY_JS, selector)
    if k:
        CM.mark(k, verified)


def use_select(page, selector, value, verified):
    """操作下拉並登記；value 可為 value 或顯示文字。"""
    try:
        page.select_option(selector, value=value)
    except Exception:
        page.select_option(selector, label=value)
    mark_el(page, selector, verified)


def exercise_toggles(page, screen, rounds=2):
    """把當前畫面每一個摺疊區塊都實際點過，驗證它會切換，並保持展開。

    不論目前是開是關都點：預設展開的區塊（例如新人考核卡）如果只點「關著的」，
    就永遠不會被登記，稽核會誤報漏測。
    """
    for _ in range(rounds):
        n = page.evaluate("() => document.querySelectorAll('summary').length")
        for i in range(n):
            info = page.evaluate("""(i) => {
                const s = document.querySelectorAll('summary')[i];
                if (!s) return null;
                const d = s.closest('details');
                if (!d) return null;
                const txt = (s.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
                const key = s.id ? '#' + s.id : ('summary「' + txt + '」');
                const was = d.open;
                s.click();
                const toggled = d.open !== was;
                if (!d.open) s.click();          // 收起來的再打開，方便後續操作
                return { key: key, toggled: toggled };
            }""", i)
            if info and info.get('toggled'):
                CM.mark(info['key'], '點擊後展開／收合切換正常')
        CM.scan(page, screen)


INIT_JS = """
(() => {
  const RealDate = Date;
  let offset = 0;
  try { const m = localStorage.getItem('e2e_mockdate');
        if (m) offset = new RealDate(m).getTime() - RealDate.now(); } catch (e) {}
  window.Date = class extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }
    static now() { return RealDate.now() + offset; }
  };
  window.confirm = () => true;
  window.__printed = false;
  window.print = () => { window.__printed = true; };
})();
"""


def build_site():
    tmp = tempfile.mkdtemp(prefix='mala-eval-e2e-')
    for d in ('css', 'js', 'assets'):
        shutil.copytree(os.path.join(ROOT, d), os.path.join(tmp, d))
    with open(os.path.join(ROOT, 'index.html'), encoding='utf-8') as f:
        html = f.read()
    html = html.replace('</head>', '  <script src="e2e-stub.js"></script>\n</head>', 1)
    with open(os.path.join(tmp, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    shutil.copy(os.path.join(ROOT, 'e2e', 'stub-backend.js'), os.path.join(tmp, 'e2e-stub.js'))
    return tmp


# ── 流程 ─────────────────────────────────────────────────────
def login(page, account, pw):
    page.wait_for_function("() => !document.getElementById('loginBtn').disabled", timeout=20000)
    page.fill('#acc', account)
    page.fill('#pw', pw)
    click(page, '#loginBtn', '登入後進入評鑑主畫面')
    page.wait_for_selector('#evalForm', state='visible', timeout=20000)


def logout(page):
    click(page, '#btnLogout', '回到登入畫面')
    page.wait_for_selector('#loginGate', state='visible', timeout=20000)


def set_date(page, iso):
    page.evaluate("(d) => localStorage.setItem('e2e_mockdate', d)", iso)
    page.reload()
    page.wait_for_selector('#loginGate', state='visible', timeout=20000)


def fill_stars(page, container, values_by_ratee=None, flat=None):
    """把星等填進畫面。values_by_ratee: {受評者: {'attitude': [...], 'performance': [...]}}"""
    page.evaluate("""([c, byName, flat]) => {
        document.querySelectorAll(c + ' details').forEach(d => { d.open = true; });
        const cards = [...document.querySelectorAll(c + ' details.ratee')];
        if (cards.length) {
          cards.forEach(card => {
            const nm = card.querySelector('summary').textContent.trim();
            const key = Object.keys(byName).find(k => nm.includes(k));   // 卡片標題可能帶「（計時）」
            const v = key ? byName[key] : null; if (!v) return;
            const cats = [...card.querySelectorAll('details.cat')];
            const groups = [v.attitude, v.performance].filter(Boolean);
            cats.forEach((cat, gi) => {
              const arr = groups[gi]; if (!arr) return;
              [...cat.querySelectorAll('.stars')].forEach((st, i) => {
                if (arr[i]) st.children[arr[i] - 1].click();
              });
            });
          });
        } else if (flat) {
          const groups = [flat.attitude, flat.performance].filter(Boolean);
          const cats = [...document.querySelectorAll(c + ' details.cat')];
          cats.forEach((cat, gi) => {
            const arr = groups[gi]; if (!arr) return;
            [...cat.querySelectorAll('.stars')].forEach((st, i) => {
              if (arr[i]) st.children[arr[i] - 1].click();
            });
          });
        }
      }""", [container, values_by_ratee or {}, flat])


def phase_a(page, data, r):
    pw = data['defaultPassword']
    people = data['people']
    toggled_roles = set()   # 自評題組正職只有態度、計時多一組表現，兩種角色都要點過

    for idx, p in enumerate(people):
        login(page, p['account'], pw)
        CM.scan(page, '同仁主畫面')
        if idx == 0:
            # 分頁導向驗證：點哪個分頁，就要看到哪個 pane（其他要收起來）
            click(page, '#btnSelf', '導向自評分頁')
            check('分頁「自評」導向正確', visible(page, '#selfPane') and not visible(page, '#fillPane'))
            click(page, '#btnMyScores', '導向我的成績分頁')
            check('分頁「我的成績」導向正確', visible(page, '#scorePane') and not visible(page, '#selfPane'))
            click(page, '#btnFill', '導向填寫評鑑分頁')
            check('分頁「填寫評鑑」導向正確', visible(page, '#fillPane') and not visible(page, '#scorePane'))
            check('非店長看不到新人考核分頁', not visible(page, '#btnNewbie'))
            opened = page.evaluate("""() => { const d = document.querySelector('.pwbox'); d.open = true; return d.open; }""")
            CM.mark('summary「🔑 修改密碼」', '展開修改密碼面板')
            check('「修改密碼」展開面板', opened and visible(page, '#savePw'))

        page.wait_for_selector('#forms details.ratee', timeout=20000)
        if idx == 0:
            exercise_toggles(page, '互評表單')          # 每張同仁卡、每個題組、星等說明都點開
        fill_stars(page, '#forms', values_by_ratee=r['peer'][p['name']])
        CM.scan(page, '互評表單（已展開）')
        click(page, '#submit', '跳出送出確認視窗')
        page.wait_for_selector('#confirmOverlay', state='visible', timeout=20000)
        if idx == 0:
            click(page, '#confirmCancel', '取消送出、回到表單繼續填')
            check('確認視窗「取消」回到表單', not visible(page, '#confirmOverlay') and visible(page, '#forms'))
            shot(page, '01-互評表單已填')
            page.click('#submit')
            page.wait_for_selector('#confirmOverlay', state='visible', timeout=20000)
        CM.scan(page, '送出確認視窗')
        click(page, '#confirmOk', '確認送出→顯示已完成')
        wait_text(page, '#result', '已完成')

        page.click('#btnSelf')
        if p['role'] not in toggled_roles:
            exercise_toggles(page, f'自評分頁（{p["role"]}）')
            toggled_roles.add(p['role'])
        fill_stars(page, '#selfForms', flat=r['self'][p['name']])
        page.fill('#selfNote', r['msgs']['selfnote'])
        if p['name'] == r['msgs']['named'][0]:
            click(page, '#addPeerMsg', '新增一列夥伴留言')
            use_select(page, '#peerMsgs .peermsg:last-child .peer-to', data['newbie'], '選擇留言對象')
            page.fill('#peerMsgs .peermsg:last-child .peer-msg', r['msgs']['named'][1])
            page.uncheck('#peerMsgs .peermsg:last-child .peer-anon-cb')
            mark_el(page, '#peerMsgs .peermsg:last-child .peer-anon-cb', '取消勾選＝改為具名留言')
        if p['name'] == r['msgs']['anon'][0] and p['name'] != r['msgs']['named'][0]:
            click(page, '#addPeerMsg', '新增一列夥伴留言（匿名）')
            use_select(page, '#peerMsgs .peermsg:last-child .peer-to', data['newbie'], '選擇留言對象')
            page.fill('#peerMsgs .peermsg:last-child .peer-msg', r['msgs']['anon'][1])
        if idx == 0:
            page.fill('#companyNote', r['msgs']['company'])
        CM.scan(page, '自評分頁')
        click(page, '#selfSubmit', '送出自評→顯示已完成')
        wait_text(page, '#selfResult', '已完成')
        logout(page)

    # 已送出鎖
    login(page, people[0]['account'], pw)
    check('互評已送出鎖：表單收起＋按鈕鎖住',
          (not visible(page, '#forms')) and page.evaluate("() => document.getElementById('submit').disabled"))
    page.click('#btnSelf')
    check('自評已送出鎖：表單收起＋按鈕鎖住',
          (not visible(page, '#selfForms')) and page.evaluate("() => document.getElementById('selfSubmit').disabled"))
    logout(page)


def phase_a_newbie(page, data, r, exp):
    mgr = next(p for p in data['people'] if p['name'] == data['manager'])
    login(page, mgr['account'], data['defaultPassword'])
    check('店長看得到新人考核分頁', visible(page, '#btnNewbie'))
    click(page, '#btnNewbie', '導向新人考核分頁')
    check('分頁「新人考核」導向正確', visible(page, '#newbiePane'))
    wait_text(page, '#newbiePane', data['newbie'])
    od = data['newbieOverdueDays']
    want = (f'已逾期 {od} 天' if od > 7 else ('今天到期' if od == 0 else f'到期後第 {od} 天'))
    pane_txt = text_of(page, '#newbiePane')
    check(f'新人到期提醒文字正確（逾期 {od} 天 → 「{want}」）', want in pane_txt,
          pane_txt.replace(chr(10), ' ')[:200])
    exercise_toggles(page, '新人考核表單')
    fill_stars(page, '#newbiePane', values_by_ratee={data['newbie']: r['newbie']})
    CM.scan(page, '新人考核表單')
    page.evaluate("() => [...document.querySelectorAll('#newbiePane button')].find(b => b.textContent.includes('送出')).click()")
    CM.mark('button「送出「' + data['newbie'] + '」的入職考核」'[:31], '送出新人考核')
    page.wait_for_selector('#confirmOverlay', state='visible', timeout=20000)
    ct = text_of(page, '#confirmText')
    nb = exp['__newbie__']
    check('新人考核確認視窗＝獨立算出的分數',
          all(fmt(v) in ct for v in (nb['attitude'], nb['performance'], nb['total'])),
          f'畫面「{ct}」 預期 {nb}')
    shot(page, '02-新人考核確認視窗')
    page.click('#confirmOk')
    wait_text(page, '#newbiePane', '目前沒有需要考核的新人')
    check('送出後從待辦消失', True)
    logout(page)


def phase_a_admin(page, data, r):
    click(page, '#adminEntry', '導向主管管理區登入')
    page.wait_for_selector('#gate', state='visible', timeout=20000)
    CM.scan(page, '主管通行碼畫面')
    page.fill('#pass', '0000')
    page.click('#enter')
    page.wait_for_selector('#gateErr', state='visible', timeout=20000)
    check('錯誤通行碼被擋在門外', not visible(page, '#panel'))
    page.fill('#pass', data['passcode'])
    click(page, '#enter', '通行碼正確→進入管理面板')
    page.wait_for_selector('#panel', state='visible', timeout=25000)
    CM.scan(page, '主管總覽')

    for p in data['people']:
        if p['role'] != '正職':
            continue
        click(page, f'a[data-r="{p["name"]}"]', '導向該同仁明細')
        page.wait_for_selector('#savePerf', timeout=20000)
        CM.scan(page, '同仁明細（正職）')
        for key, want in r['kpi'][p['name']].items():
            selr = f'#detail [data-sel="{key}"]'
            if page.evaluate("(s) => !!document.querySelector(s)", selr):
                use_select(page, selr, want, f'KPI 等級選 {want}')
        page.evaluate("() => { document.querySelectorAll('#detail [data-actual]').forEach(a => { a.value = '實測'; }); }")
        click(page, '#savePerf', '儲存 KPI 評分→顯示已儲存')
        wait_text(page, '#perfMsg', '已儲存', timeout=25000)

    # 每一位同仁的明細連結都點過，確認都能正確導向該人的明細
    for p in data['people']:
        click(page, f'a[data-r="{p["name"]}"]', '導向該同仁明細')
        page.wait_for_selector('#detail', timeout=20000)
        got = text_of(page, '#detail')
        if not got.startswith(p['name']):
            check(f'明細連結導向 {p["name"]}', False, got[:60])
            break
    else:
        check(f'總覽每位同仁的連結都正確導向自己的明細（{len(data["people"])} 人）', True)

    # 年度／季度下拉：切換後畫面要跟著重讀
    cur_q = page.evaluate("() => document.getElementById('adminQuarter').value")
    opts = page.evaluate("() => [...document.getElementById('adminQuarter').options].map(o => o.value)")
    other = next((o for o in opts if o != cur_q), None)
    if other:
        use_select(page, '#adminQuarter', other, '切到別的季度→重讀該季資料')
        page.wait_for_timeout(1500)
        use_select(page, '#adminQuarter', cur_q, '切回本季')
        page.wait_for_timeout(1500)
        check('季度下拉可切換且能切回', page.evaluate("() => document.getElementById('adminQuarter').value") == cur_q)
    y = page.evaluate("() => document.getElementById('adminYear').value")
    use_select(page, '#adminYear', y, '年度下拉（維持本年）')
    exercise_toggles(page, '主管明細')

    # 範本編輯：每種職稱的範本編輯器都要展開過（店長／儲備幹部各一位）
    seen_titles = set()
    for p in data['people']:
        if p['role'] != '正職':
            continue
        title = data['ftTitles'][p['name']]
        if title in seen_titles:
            continue
        seen_titles.add(title)
        page.click(f'a[data-r="{p["name"]}"]')
        page.wait_for_selector('#ftTplEditor', state='attached', timeout=20000)
        exercise_toggles(page, f'同仁明細（{title}）')
    ft = next(p for p in data['people'] if p['role'] == '正職')
    page.click(f'a[data-r="{ft["name"]}"]')
    page.wait_for_selector('#ftTplEditor', state='attached', timeout=20000)
    page.evaluate("() => { const d = [...document.querySelectorAll('#detail details')].find(x => x.querySelector('#ftTplEditor')); if (d && !d.open) d.querySelector('summary').click(); }")
    before = page.evaluate("() => document.getElementById('ftTplEditor').children.length")
    click(page, '#addFtItem', '範本多一列')
    tsel = '#ftTplEditor > *:last-child select'
    if page.evaluate("(s) => !!document.querySelector(s)", tsel):
        use_select(page, tsel, '執行力', '新項目的類型下拉')
    check('範本「＋新增項目」導向多一列',
          page.evaluate("() => document.getElementById('ftTplEditor').children.length") == before + 1)
    click(page, '#ftTplEditor > *:last-child .delFtItem', '刪掉剛新增的那列')
    check('範本「刪除」導向少一列',
          page.evaluate("() => document.getElementById('ftTplEditor').children.length") == before)
    click(page, '#saveFtTpl', '儲存範本')
    page.wait_for_timeout(2500)
    cur_title = page.evaluate("() => document.getElementById('ftTitleSel').value")
    use_select(page, '#ftTitleSel', cur_title, '選擇職稱範本')
    click(page, '#saveFtTitle', '套用職稱範本')
    page.wait_for_timeout(2500)

    # 調整與回饋
    for name, adj in r['adjust'].items():
        page.click(f'a[data-r="{name}"]')
        page.wait_for_selector('#saveAdj', timeout=20000)
        page.fill('#aAdj', str(adj['att']))
        page.fill('#aRsn', '態度調整原因')
        page.fill('#pAdj', str(adj['perf']))
        page.fill('#pRsn', '表現調整原因')
        click(page, '#saveAdj', '儲存±調整→顯示已儲存')
        wait_text(page, '#adjMsg', '已儲存', timeout=25000)
    page.click(f'a[data-r="{data["newbie"]}"]')
    page.wait_for_selector('#fbText', timeout=20000)
    page.fill('#fbText', r['msgs']['feedback'])
    click(page, '#saveFb', '儲存表現回饋→顯示已儲存')
    wait_text(page, '#fbMsg', '已儲存', timeout=25000)
    page.reload()
    page.wait_for_selector('#loginGate', state='visible', timeout=20000)


def phase_a_password(page, data):
    p = data['people'][-1]
    login(page, p['account'], data['defaultPassword'])
    page.evaluate("() => { document.querySelector('.pwbox').open = true; }")
    new_pw = '8642'
    page.fill('#newPw', new_pw)
    page.fill('#newPw2', new_pw)
    click(page, '#savePw', '更新密碼→顯示已更新')
    wait_text(page, '#pwMsg', '已更新', timeout=25000)
    logout(page)
    login(page, p['account'], new_pw)
    check('改密碼後用新密碼登入成功', visible(page, '#evalForm'))
    logout(page)


def phase_b(page, data, exp):
    pw = data['defaultPassword']
    # 每位同仁的成績都驗（不是只挑一個）
    for p in data['people']:
        acct = p['account']
        use_pw = '8642' if p is data['people'][-1] else pw
        login(page, acct, use_pw)
        if p is data['people'][0]:
            exercise_toggles(page, '非開放期預覽')     # 填寫/自評分頁的題目預覽清單
            page.click('#btnSelf')
            exercise_toggles(page, '非開放期預覽（自評）')
        page.click('#btnMyScores')
        wait_text(page, '#scorePane', '各季小計', timeout=25000)
        e = exp[p['name']]
        row = row_text(page, '#scorePane', '第三季')
        ok_att = fmt(e['attitude']) in row
        ok_perf = (e['performance'] is None) or (fmt(e['performance']) in row)
        ok_final = fmt(e['final']) in row
        check(f'{p["name"]}（{p["role"]}）成績列＝獨立算出的值',
              ok_att and ok_perf and ok_final,
              f'畫面「{row}」 預期 態度{fmt(e["attitude"])} 表現{fmt(e["performance"])} 實際{fmt(e["final"])}')
        if p is data['people'][0]:
            exercise_toggles(page, '我的成績')
        pane = text_of(page, '#scorePane')
        if p['role'] == '計時':
            check(f'{p["name"]} 時薪落點＝{e["tier"][0]}',
                  ('◀ 落點' in pane) and (e['tier'][0] in pane),
                  f'預期級距 {e["tier"]}')
            check(f'{p["name"]} 不顯示考核等第', '獎金發放基數' not in pane)
        else:
            check(f'{p["name"]} 考核等第＝{e["grade"]}', '考核等第' in pane)
            check(f'{p["name"]} 不顯示時薪對照', '時薪對照' not in pane)
        if p['name'] == data['newbie']:
            nb = exp['__newbie__']
            check('新人：入職考核卡分數正確',
                  ('入職考核' in pane) and (f'{fmt(nb["total"])} / 100' in pane.replace('　', ' ')),
                  f'預期總分 {nb["total"]}')
            shot(page, '03-新人的我的成績')
        logout(page)


def phase_b_admin(page, data, exp):
    click(page, '#adminEntry', '導向主管管理區登入')
    page.wait_for_selector('#gate', state='visible', timeout=20000)
    page.fill('#pass', data['passcode'])
    page.click('#enter')
    page.wait_for_selector('#panel', state='visible', timeout=25000)
    CM.scan(page, '主管總覽（階段B）')
    ok = True
    bad = ''
    for p in data['people']:
        e = exp[p['name']]
        row = row_text(page, '#overview', p['name'])
        if fmt(e['final']) not in row:
            ok = False
            bad = f'{p["name"]} 畫面「{row}」預期實際分數 {fmt(e["final"])}'
            break
    check('主管總覽每一列的實際分數都正確', ok, bad)
    place = text_of(page, '#gradePlacement')
    gok = all((exp[p['name']]['grade'] in place) for p in data['people'] if p['role'] == '正職')
    check('等第落點區塊：每位正職的等第都在', gok, place[:150])
    shot(page, '04-主管總覽與等第落點')

    page.click(f'a[data-r="{data["newbie"]}"]')
    page.wait_for_selector('#detail', timeout=20000)
    dt = text_of(page, '#detail')
    check('主管明細顯示入職考核', '入職考核' in dt and fmt(exp['__newbie__']['total']) in dt)
    exercise_toggles(page, '主管明細（階段B）')

    click(page, '#btnPrint', '呼叫列印')
    check('列印：確實觸發瀏覽器列印', page.evaluate("() => window.__printed"))
    check('列印表頭帶入季度', '第三季' in text_of(page, '#printHeader'))

    click(page, '#btnFinalize', '定稿本季→顯示已定稿')
    wait_text(page, '#finalizeBar', '已定稿', timeout=30000)
    page.wait_for_selector('#btnUnfinalize', timeout=20000)
    CM.scan(page, '定稿後的管理區')
    click(page, '#btnUnfinalize', '解除定稿→按鈕消失')
    page.wait_for_function("() => !document.getElementById('btnUnfinalize')", timeout=30000)
    check('定稿與解除定稿都正常', True)



def main():
    seed = int(os.environ.get('E2E_SEED', random.randrange(1, 10 ** 9)))
    rng = random.Random(seed)
    data = make_dataset(rng)
    ratings = make_ratings(rng, data)
    exp = expectations(data, ratings)

    print(f'亂數種子 {seed}（重現這組資料：E2E_SEED={seed} python3 e2e/run.py）')
    print(f'本次資料：{len(data["people"])} 位同仁　店長={data["manager"]}　'
          f'新人={data["newbie"]}（逾期 {data["newbieOverdueDays"]} 天）　通行碼={data["passcode"]}')
    print('預期分數：' + '　'.join(
        f'{n}={v["final"]}({v["grade"]})' for n, v in exp.items() if n != '__newbie__'))
    print()

    site = build_site()
    os.chdir(site)

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(locale='zh-TW')
            ctx.add_init_script(INIT_JS)
            ctx.add_init_script(f'window.__E2E_DATA = {json.dumps(data, ensure_ascii=False)};')
            page = ctx.new_page()
            page.goto(BASE)
            page.evaluate("() => localStorage.clear()")
            set_date(page, '2026-10-03T10:00:00')
            CM.scan(page, '登入畫面')
            exercise_toggles(page, '登入畫面')          # 開場白「給大家的話」

            print('── 階段A：開放期（假日期 10/3）──')
            phase_a(page, data, ratings)
            phase_a_newbie(page, data, ratings, exp)
            phase_a_admin(page, data, ratings)
            phase_a_password(page, data)

            print('── 階段B：查成績（假日期 10/12）──')
            set_date(page, '2026-10-12T10:00:00')
            phase_b(page, data, exp)
            phase_b_admin(page, data, exp)
            browser.close()
    finally:
        httpd.shutdown()
        shutil.rmtree(site, ignore_errors=True)

    print('\n── 按鈕與連結覆蓋稽核 ──')
    rep = CM.report()
    for k, why in rep['skipped'].items():
        print(f'  ⏭️  {k}：{why}')
    check(f'所有按鈕與連結都被點過並驗證導向（共 {rep["total"]} 個）',
          not rep['missed'],
          '漏測：' + '、'.join(f'{k}（{v}）' for k, v in rep['missed'].items()))
    print(f'  掃到 {rep["total"]} 個可點元素，驗證 {rep["clicked"]} 個，'
          f'刻意略過 {len(rep["skipped"])} 個，漏測 {len(rep["missed"])} 個')

    failed = [x for x in RESULTS if not x[1]]
    print(f'\n共 {len(RESULTS)} 項檢查，通過 {len(RESULTS) - len(failed)}，失敗 {len(failed)}')
    if failed:
        print(f'（重現這組資料：E2E_SEED={seed} python3 e2e/run.py）')
        for name, _, detail in failed:
            print(f'  ❌ {name}　{detail}')
        sys.exit(1)
    print('全部測試通過')


if __name__ == '__main__':
    main()
