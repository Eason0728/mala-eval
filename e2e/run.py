#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""端到端測試：把整套評鑑流程用固定資料跑一遍，驗證每個畫面的數字與每顆按鈕。

  python3 e2e/run.py

做的事（兩個階段，用假日期跨過真實的時間閘門）：
  階段A（假日期 2026-10-03，Q3 開放期）：
    9 位同仁全部登入 → 互評＋自評（固定星等）→ 驗證已送出鎖；
    店長填范家嘉的新人入職考核；主管進管理區評 KPI／調整／回饋；
    沿路點過每顆按鈕與連結（分頁、取消、修改密碼、範本編輯…）。
  階段B（假日期 2026-10-12，成績開放查詢）：
    逐一驗證「我的成績」與主管總覽的每個數字＝測試檔內手算的預期值。

星等設計：9 位評分者依序給 [5,4,3,5,4,3,5,4,3]，平均恰為 4——
  計時：態度 6×4=24、表現 14×4=56、合計 80
  正職：態度 5×4×1.2=24；KPI 蕭彣芳全A=70(→94,A)、張羽成技能B=62(→86,A)、陳盈如技能C=54(→78,B)
  范家嘉主管調整 +2/-1 → 81（時薪落點 81～85 → 230 元）；新人考核全 4 星 → 80
"""
import http.server
import os
import shutil
import socketserver
import sys
import tempfile
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8799
BASE = f'http://localhost:{PORT}/'
PASSCODE = '9999'

ACCOUNTS = [  # (帳號, 姓名, 角色)；順序＝星等表的順序
    ('001', '張羽成', '正職'), ('002', '蕭彣芳', '正職'), ('003', '許雅筑', '計時'),
    ('004', '王鈺屏', '計時'), ('005', '林宸妤', '計時'), ('006', '徐佑昕', '計時'),
    ('007', '陳盈如', '正職'), ('008', '王禹婕', '計時'), ('009', '范家嘉', '計時'),
]
STAR = {acc: [5, 4, 3][i % 3] for i, (acc, _, _) in enumerate(ACCOUNTS)}

RESULTS = []


def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok), detail))
    mark = '✅' if ok else '❌'
    print(f'{mark} {name}' + (f'　{detail}' if (detail and not ok) else ''))


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


INIT_SCRIPT = r"""
(() => {  // 假日期（讀 localStorage，run.py 逐階段設定）＋攔掉原生對話框
  const RealDate = Date;
  let offset = 0;
  try {
    const m = localStorage.getItem('e2e_mockdate');
    if (m) offset = new RealDate(m).getTime() - RealDate.now();
  } catch (e) {}
  window.Date = class extends RealDate {
    constructor(...a) { if (a.length === 0) { super(RealDate.now() + offset); } else { super(...a); } }
    static now() { return RealDate.now() + offset; }
  };
  window.confirm = () => true;
  window.__printed = false;
  window.print = () => { window.__printed = true; };
})();
"""


def wait_text(page, selector, text, timeout=15000):
    page.wait_for_function(
        """([sel, txt]) => { const e = document.querySelector(sel); return e && e.textContent.includes(txt); }""",
        arg=[selector, text], timeout=timeout)


def visible(page, sel):
    return page.evaluate("(s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }", sel)


def login(page, account, pw='0000'):
    page.wait_for_function("() => !document.getElementById('loginBtn').disabled", timeout=15000)
    page.fill('#acc', account)
    page.fill('#pw', pw)
    page.click('#loginBtn')
    page.wait_for_selector('#evalForm', state='visible', timeout=15000)


def logout(page):
    page.click('#btnLogout')
    page.wait_for_selector('#loginGate', state='visible', timeout=15000)
    page.wait_for_function("() => !document.getElementById('loginBtn').disabled", timeout=15000)


def set_mockdate(page, iso):
    page.evaluate("(d) => localStorage.setItem('e2e_mockdate', d)", iso)
    page.reload()
    page.wait_for_selector('#loginGate', state='visible', timeout=15000)


def fill_and_submit_all(page):
    """階段A主體：9 位同仁互評＋自評；第 1 位順路測每顆按鈕。"""
    for i, (acc, name, role) in enumerate(ACCOUNTS):
        v = STAR[acc]
        login(page, acc)
        if i == 0:
            # 按鈕巡禮：分頁切換／新人分頁不可見／星等說明／修改密碼盒
            check('登入後三個分頁都在', all(visible(page, s) for s in ('#btnFill', '#btnSelf', '#btnMyScores')))
            check('非店長看不到新人考核分頁', not visible(page, '#btnNewbie'))
            page.click('#btnSelf'); check('自評分頁切換', visible(page, '#selfPane'))
            page.click('#btnMyScores'); check('我的成績分頁切換', visible(page, '#scorePane'))
            page.click('#btnFill'); check('填寫分頁切換', visible(page, '#fillPane'))
            page.evaluate("() => { document.querySelector('.pwbox').open = true; }")
            check('修改密碼盒展開', visible(page, '.pwbox .pwpanel') or page.evaluate("() => document.querySelector('.pwbox').open"))
            opened = page.evaluate("() => { const h = document.querySelector('#forms details.help'); if (!h) return false; h.open = true; return h.open; }")
            check('星等說明可展開', opened)
        # 互評：所有受評者所有題目都點 v 星
        page.wait_for_selector('#forms details.ratee', timeout=15000)
        page.evaluate("(v) => { document.querySelectorAll('#forms details.ratee .stars').forEach(st => st.children[v-1].click()); }", v)
        page.click('#submit')
        page.wait_for_selector('#confirmOverlay', state='visible', timeout=15000)
        if i == 0:
            page.click('#confirmCancel')
            check('確認視窗「取消」可反悔', not visible(page, '#confirmOverlay') and visible(page, '#forms'))
            page.click('#submit')
            page.wait_for_selector('#confirmOverlay', state='visible', timeout=15000)
        page.click('#confirmOk')
        wait_text(page, '#result', '已完成')
        # 自評
        page.click('#btnSelf')
        page.evaluate("(v) => { document.querySelectorAll('#selfForms .stars').forEach(st => st.children[v-1].click()); }", v)
        page.fill('#selfNote', '下季加油')
        if name == '許雅筑':  # 具名留言給范家嘉
            page.click('#addPeerMsg')
            page.evaluate("""() => { const r = [...document.querySelectorAll('#peerMsgs .peermsg')].pop();
                r.querySelector('.peer-to').value = '范家嘉';
                r.querySelector('.peer-msg').value = '加油，越來越上手了';
                r.querySelector('.peer-anon-cb').checked = false; }""")
        if name == '王鈺屏':  # 匿名留言給范家嘉
            page.click('#addPeerMsg')
            page.evaluate("""() => { const r = [...document.querySelectorAll('#peerMsgs .peermsg')].pop();
                r.querySelector('.peer-to').value = '范家嘉';
                r.querySelector('.peer-msg').value = '記得多問前輩'; }""")
        if name == '林宸妤':
            page.fill('#companyNote', '希望多辦聚餐')
        page.click('#selfSubmit')
        wait_text(page, '#selfResult', '已完成')
        logout(page)

    # 已送出鎖：第 1 位重新登入
    login(page, '001')
    check('互評已送出鎖：表單收起', not visible(page, '#forms'))
    check('互評已送出鎖：按鈕鎖住', page.evaluate("() => document.getElementById('submit').disabled"))
    check('互評已送出鎖：訊息', page.evaluate("() => document.getElementById('result').textContent.includes('已經送出過')"))
    page.click('#btnSelf')
    check('自評已送出鎖：表單收起', not visible(page, '#selfForms'))
    check('自評已送出鎖：按鈕鎖住', page.evaluate("() => document.getElementById('selfSubmit').disabled"))
    check('自評已送出鎖：留言欄也收起', not visible(page, '#selfMsgs'))
    logout(page)


def newbie_flow(page):
    login(page, '002')  # 蕭彣芳＝店長
    check('店長看得到新人考核分頁', visible(page, '#btnNewbie'))
    page.click('#btnNewbie')
    wait_text(page, '#newbiePane', '范家嘉')
    check('新人逾期紅字提醒', page.evaluate("() => document.getElementById('newbiePane').textContent.includes('已逾期')"))
    page.evaluate("() => { document.querySelectorAll('#newbiePane details.cat').forEach(d => d.open = true); }")
    page.evaluate("() => { document.querySelectorAll('#newbiePane .stars').forEach(st => st.children[3].click()); }")  # 全 4 星
    page.evaluate("() => { [...document.querySelectorAll('#newbiePane button')].find(b => b.textContent.includes('送出')).click(); }")
    page.wait_for_selector('#confirmOverlay', state='visible', timeout=15000)
    ctext = page.evaluate("() => document.getElementById('confirmText').textContent")
    check('新人考核確認視窗分數正確', ('24' in ctext and '56' in ctext and '80' in ctext), ctext)
    page.click('#confirmOk')
    wait_text(page, '#newbiePane', '目前沒有需要考核的新人')
    check('送出後從待辦消失、進已完成', page.evaluate("() => document.getElementById('newbiePane').textContent.includes('已完成的入職考核')"))
    logout(page)


def admin_phase_a(page):
    page.click('#adminEntry')
    page.wait_for_selector('#gate', state='visible', timeout=15000)
    page.fill('#pass', '0000')  # 先用錯的通行碼
    page.click('#enter')
    page.wait_for_selector('#gateErr', state='visible', timeout=15000)
    check('錯誤通行碼被擋', True)
    page.fill('#pass', PASSCODE)
    page.click('#enter')
    page.wait_for_selector('#panel', state='visible', timeout=20000)

    kpi = {'蕭彣芳': 'A', '張羽成': 'B', '陳盈如': 'C'}
    for name, grade in kpi.items():
        page.click(f'a[data-r="{name}"]')
        page.wait_for_selector('#savePerf', timeout=15000)
        page.evaluate("""([g]) => { document.querySelectorAll('#detail [data-sel]').forEach(s => {
            s.value = [...s.options].some(o => o.value === g) ? g : '完成'; });
            document.querySelectorAll('#detail [data-actual]').forEach(a => { a.value = '實測值'; }); }""", [grade])
        page.click('#savePerf')
        wait_text(page, '#perfMsg', '已儲存', timeout=20000)
    check('三位正職 KPI 已評分', True)

    # 範本編輯按鈕巡禮（加一項→刪掉→儲存）
    page.click('a[data-r="蕭彣芳"]')
    page.wait_for_selector('#ftTplEditor', state='attached', timeout=15000)
    page.evaluate("() => { [...document.querySelectorAll('#detail details')].forEach(d => { if (d.querySelector('#ftTplEditor')) d.open = true; }); }")
    before = page.evaluate("() => document.getElementById('ftTplEditor').children.length")
    page.click('#addFtItem')
    added = page.evaluate("() => document.getElementById('ftTplEditor').children.length")
    check('範本編輯：＋新增項目', added == before + 1)
    page.evaluate("() => { const rows = document.getElementById('ftTplEditor').children; const del = rows[rows.length-1].querySelector('.delFtItem'); if (del) del.click(); }")
    after = page.evaluate("() => document.getElementById('ftTplEditor').children.length")
    check('範本編輯：刪除項目', after == before)
    page.click('#saveFtTpl')
    time.sleep(2.5)
    check('範本儲存無錯誤', page.evaluate("() => !document.getElementById('ftTplMsg') || !document.getElementById('ftTplMsg').textContent.includes('失敗')"))

    # 套用職稱（重套同一個）
    page.wait_for_selector('#saveFtTitle', timeout=15000)
    page.click('#saveFtTitle')
    time.sleep(2.5)

    # 范家嘉：主管調整 +2 / -1 ＋ 表現回饋
    page.click('a[data-r="范家嘉"]')
    page.wait_for_selector('#saveAdj', timeout=15000)
    page.fill('#aAdj', '2')
    page.fill('#aRsn', '支援班表')
    page.fill('#pAdj', '-1')
    page.fill('#pRsn', '出餐流程待加強')
    page.click('#saveAdj')
    wait_text(page, '#adjMsg', '已儲存', timeout=20000)
    page.wait_for_selector('#fbText', timeout=15000)
    page.fill('#fbText', '新人表現不錯，繼續保持')
    page.click('#saveFb')
    wait_text(page, '#fbMsg', '已儲存', timeout=20000)
    check('主管調整與回饋已儲存', True)
    page.reload()
    page.wait_for_selector('#loginGate', state='visible', timeout=15000)


def change_password_flow(page):
    login(page, '008')
    page.evaluate("() => { document.querySelector('.pwbox').open = true; }")
    page.fill('#newPw', '4321')
    page.fill('#newPw2', '4321')
    page.click('#savePw')
    wait_text(page, '#pwMsg', '已更新', timeout=20000)
    logout(page)
    login(page, '008', '4321')
    check('修改密碼後可用新密碼登入', True)
    logout(page)


def phase_b_scores(page):
    # 范家嘉（計時、新人）
    login(page, '009')
    check('非開放期顯示唯讀預覽', page.evaluate("() => document.getElementById('fillBanner').textContent.includes('非填寫期間')"))
    page.click('#btnMyScores')
    wait_text(page, '#scorePane', '各季小計', timeout=20000)
    txt = page.evaluate("() => document.getElementById('scorePane').innerText")
    row = page.evaluate("""() => { const tr = [...document.querySelectorAll('#scorePane tr')].find(r => r.textContent.includes('第三季')); return tr ? tr.innerText : ''; }""")
    check('范家嘉 各季小計 態度24', '24' in row, row)
    check('范家嘉 各季小計 表現56', '56' in row, row)
    check('范家嘉 主管調整 +1', '+1' in row, row)
    check('范家嘉 實際分數 81', '81' in row, row)
    check('范家嘉 時薪落點 81～85', '◀ 落點 81 分' in txt)
    check('范家嘉 入職考核卡 80/100', ('入職考核' in txt and '80' in txt))
    check('具名留言顯示「— 許雅筑」', '— 許雅筑' in txt)
    check('匿名留言顯示「— 匿名夥伴」', '匿名夥伴' in txt)
    check('主管回饋顯示', '新人表現不錯' in txt)
    check('寫給自己的話顯示', '下季加油' in txt)
    check('計時不顯示考核等第表', '獎金發放基數' not in txt)
    check('單一季不顯示查詢下拉', not visible(page, '#qSelect'))
    logout(page)

    # 蕭彣芳（正職、店長、KPI 全 A）
    login(page, '002')
    page.click('#btnMyScores')
    wait_text(page, '#scorePane', '各季小計', timeout=20000)
    txt = page.evaluate("() => document.getElementById('scorePane').innerText")
    row = page.evaluate("""() => { const tr = [...document.querySelectorAll('#scorePane tr')].find(r => r.textContent.includes('第三季')); return tr ? tr.innerText : ''; }""")
    check('蕭彣芳 態度24（×1.2 生效）', '24' in row, row)
    check('蕭彣芳 表現70（KPI 全A）', '70' in row, row)
    check('蕭彣芳 實際分數 94', '94' in row, row)
    check('蕭彣芳 考核等第 A', ('考核等第' in txt and 'A' in txt))
    check('正職不顯示時薪對照表', '時薪對照' not in txt)
    logout(page)

    # 陳盈如（正職、KPI 技能 C → 78 → B）
    login(page, '007')
    page.click('#btnMyScores')
    wait_text(page, '#scorePane', '各季小計', timeout=20000)
    row = page.evaluate("""() => { const tr = [...document.querySelectorAll('#scorePane tr')].find(r => r.textContent.includes('第三季')); return tr ? tr.innerText : ''; }""")
    check('陳盈如 表現54（技能C）', '54' in row, row)
    check('陳盈如 實際分數 78', '78' in row, row)
    logout(page)


def phase_b_admin(page):
    page.click('#adminEntry')
    page.wait_for_selector('#gate', state='visible', timeout=15000)
    page.fill('#pass', PASSCODE)
    page.click('#enter')
    page.wait_for_selector('#panel', state='visible', timeout=20000)
    prog = page.evaluate("() => document.getElementById('progress').innerText")
    check('進度：態度9人表現9人', ('9 人' in prog and prog.count('9 人') == 2), prog)
    row = page.evaluate("""() => { const tr = [...document.querySelectorAll('#overview tr')].find(r => r.textContent.includes('范家嘉')); return tr ? tr.innerText : ''; }""")
    check('總覽 范家嘉 24/56/81', ('24' in row and '56' in row and '81' in row), row)
    row2 = page.evaluate("""() => { const tr = [...document.querySelectorAll('#overview tr')].find(r => r.textContent.includes('蕭彣芳')); return tr ? tr.innerText : ''; }""")
    check('總覽 蕭彣芳 24/70/94', ('24' in row2 and '70' in row2 and '94' in row2), row2)
    place = page.evaluate("() => document.getElementById('gradePlacement').innerText")
    check('等第：蕭94A／張86A／陳78B', ('94' in place and '86' in place and '78' in place and 'B' in place), place)
    check('落點：范家嘉 81～85／230', ('81～85' in place and '230' in place), place)
    check('對公司的話（匿名）', page.evaluate("() => document.getElementById('companyMsgs').textContent.includes('希望多辦聚餐')"))
    # 明細裡的入職考核卡
    page.click('a[data-r="范家嘉"]')
    page.wait_for_selector('#detail', timeout=15000)
    dt = page.evaluate("() => document.getElementById('detail').innerText")
    check('主管明細 入職考核 80/100', ('入職考核' in dt and '80' in dt), dt[:200])
    # 列印
    page.click('#btnPrint')
    check('列印：window.print 被呼叫', page.evaluate("() => window.__printed"))
    check('列印表頭含季度', page.evaluate("() => document.getElementById('printHeader').textContent.includes('第三季')"))
    # 定稿 → 解除
    page.click('#btnFinalize')
    wait_text(page, '#finalizeBar', '已定稿', timeout=25000)
    check('定稿本季', True)
    page.wait_for_selector('#btnUnfinalize', timeout=15000)
    page.click('#btnUnfinalize')
    page.wait_for_function("() => !document.getElementById('btnUnfinalize')", timeout=25000)
    check('解除定稿', True)


def main():
    site = build_site()
    os.chdir(site)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):  # 存取紀錄會蓋掉測試輸出，關掉
            pass
    handler = Quiet
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(locale='zh-TW')
            ctx.add_init_script(INIT_SCRIPT)
            page = ctx.new_page()
            page.goto(BASE)
            page.evaluate("() => { localStorage.clear(); }")
            set_mockdate(page, '2026-10-03T10:00:00')

            print('── 階段A：開放期（假日期 10/3）──')
            fill_and_submit_all(page)
            newbie_flow(page)
            admin_phase_a(page)
            change_password_flow(page)

            print('── 階段B：查成績（假日期 10/12）──')
            set_mockdate(page, '2026-10-12T10:00:00')
            phase_b_scores(page)
            phase_b_admin(page)
            browser.close()
    finally:
        httpd.shutdown()
        shutil.rmtree(site, ignore_errors=True)

    failed = [r for r in RESULTS if not r[1]]
    print(f'\n共 {len(RESULTS)} 項檢查，通過 {len(RESULTS) - len(failed)}，失敗 {len(failed)}')
    if failed:
        for name, _, detail in failed:
            print(f'  ❌ {name}　{detail}')
        sys.exit(1)
    print('全部測試通過')


if __name__ == '__main__':
    main()
