# -*- coding: utf-8 -*-
"""每次執行都產生一整套全新的隨機測試資料，並用「獨立實作」算出預期值。

兩條規矩（Eason 2026-09-03 指定）：
  1. 不重用開發時那組熟悉的資料——那只能證明系統對那組資料能動。
  2. 預期值在這裡自己算，**絕對不 import js/scoring.js**。拿系統自己的函式算預期值
     是循環論證：它算錯，測試也跟著錯。這裡照「規格」重寫一次，兩邊對不上就是有問題。
"""
import math
import random
from datetime import date, timedelta

SURNAMES = '陳林黃張李王吳劉蔡楊許鄭謝洪郭邱曾廖賴徐簡鍾詹'
GIVEN = '志明淑芬家豪雅婷俊傑怡君建宏心怡宗翰佩君柏翰欣怡承翰詩涵冠廷之婷宜蓁彥廷'
WORDS = ['出餐速度再快一點', '謝謝你常常幫忙補位', '客訴處理得很好', '備料要記得先進先出',
         '希望排班可以再彈性', '前場動線需要調整', '新品教育訓練很有幫助', '收班檢查表要落實']


# ── 規格重寫（不是複製實作）────────────────────────────────────
def round1(x):
    """對齊 JS 的 Math.round(n*10)/10：.5 一律往正無窮進位（與 Python 的銀行家捨入不同）。"""
    if x is None:
        return None
    return math.floor(x * 10 + 0.5) / 10


def cap100(x):
    return None if x is None else min(round1(x), 100)


SKILL_PCT = {'A': 1.0, 'B': 0.8, 'C': 0.6, 'D': 0.4}


def kpi_total(items, sel):
    """技能項＝比重×等級%；執行力項＝完成拿比重、未完成 0。任一項沒評→整體未計。"""
    total = 0.0
    for it in items:
        choice = sel.get(it['key'])
        if not choice:
            return None
        if it['type'] == '技能':
            total += it['weight'] * SKILL_PCT[choice]
        else:
            total += it['weight'] if choice == '完成' else 0
    return round1(total)


def make_dataset(rng):
    used = set()

    def name():
        while True:
            n = rng.choice(SURNAMES) + rng.choice(GIVEN) + rng.choice(GIVEN)
            if n not in used:
                used.add(n)
                return n

    n_people = rng.randint(6, 9)
    n_ft = rng.randint(2, 3)                       # 正職人數
    people = []
    for i in range(n_people):
        people.append({
            'name': name(),
            'role': '正職' if i < n_ft else '計時',
            'account': f'{i + 1:03d}',
        })
    rng.shuffle(people)                             # 正職不要固定排前面

    fts = [p for p in people if p['role'] == '正職']
    pts = [p for p in people if p['role'] == '計時']
    manager = rng.choice(fts)                       # 店長：正職中隨機一位
    newbie = rng.choice(pts)                        # 新人：計時中隨機一位

    # 到職日：讓他在階段A那天（假日期 2026-10-03）「已滿月且逾期 N 天」，才驗得到逾期提醒。
    # 逾期 N 天 ⇒ 滿月日 = 10/03 − N ⇒ 到職日 = 滿月日再往前一個月。
    overdue = rng.randint(1, 12)
    due_day = date(2026, 10, 3) - timedelta(days=overdue)
    hire_day = (due_day.replace(year=due_day.year - 1, month=12) if due_day.month == 1
                else due_day.replace(month=due_day.month - 1))
    newbie['hireDate'] = hire_day.isoformat()
    titles = {}
    for p in fts:
        titles[p['name']] = '店長' if p is manager else '儲備幹部'

    def bank(prefix, n, per=5):
        return [{'key': f'{prefix}{i}', 'label': f'{prefix} 題目 {i}',
                 'levels': [f'{5 - k} 星：說明文字' for k in range(5)]} for i in range(1, n + 1)]

    # 題數固定 6/14/5（與正式系統相同，滿分才是 30/70/100，時薪級距才有意義）
    banks = {'ptAttitude': bank('態度', 6), 'ptPerf': bank('表現', 14),
             'ftAttitude': bank('正態', 5), 'ftPerf': []}

    # KPI 範本：兩種職稱各自隨機，比重總和固定 70
    def tpl():
        n_skill = rng.randint(2, 3)
        n_exec = rng.randint(2, 3)
        weights = _split70(rng, n_skill + n_exec)
        items = []
        for i in range(n_skill):
            items.append({'no': i + 1, 'key': f'sk{i + 1}', 'type': '技能',
                          'label': f'技能項目{i + 1}', 'target': f'{rng.randint(5, 40)} 萬',
                          'levels': {'A': '全達成', 'B': '八成', 'C': '六成', 'D': '四成'},
                          'weight': weights[i]})
        for i in range(n_exec):
            items.append({'no': n_skill + i + 1, 'key': f'ex{i + 1}', 'type': '執行力',
                          'label': f'執行力項目{i + 1}', 'target': '',
                          'levels': {'A': '完成', 'B': '', 'C': '', 'D': '未完成'},
                          'weight': weights[n_skill + i]})
        return items

    ft_templates = {'店長': tpl(), '儲備幹部': tpl()}

    tiers = _random_tiers(rng)

    return {
        'people': people, 'manager': manager['name'], 'newbie': newbie['name'],
        'newbieOverdueDays': overdue,
        'accounts': [{'name': p['name'], 'role': p['role'], 'account': p['account'],
                      'hireDate': p.get('hireDate', '')} for p in people],
        'banks': banks, 'tiers': tiers,
        'ftTemplates': ft_templates, 'ftTitles': titles,
        'passcode': f'{rng.randint(1000, 9999)}',
        'defaultPassword': f'{rng.randint(1000, 9999)}',
    }


def _split70(rng, n):
    """把 70 分隨機拆成 n 份整數，每份至少 5。"""
    while True:
        cuts = sorted(rng.sample(range(1, 70), n - 1))
        parts = [b - a for a, b in zip([0] + cuts, cuts + [70])]
        if all(p >= 5 for p in parts):
            return parts


def _random_tiers(rng):
    """隨機時薪級距（八級，門檻遞減、時薪遞減）。"""
    bounds = sorted(rng.sample(range(60, 98), 7), reverse=True)
    pay = sorted(rng.sample(range(190, 360), 7), reverse=True)
    tiers = [[f'{bounds[0]} 分以上', f'{pay[0]} 元']]
    for i in range(1, 7):
        tiers.append([f'{bounds[i]}～{bounds[i - 1] - 1} 分', f'{pay[i]} 元'])
    tiers.append([f'{bounds[6] - 1} 分以下', '法定時薪'])
    return tiers


def make_ratings(rng, data):
    """每個人對每個人、每一題的星等都獨立隨機（不是固定循環）。

    每位受評者先抽一個「水準中心」，星等在中心附近浮動——否則全部平均都落在 3 分，
    所有人擠在同一個等第與同一個時薪級距，A/B/C 與其他級距就永遠測不到。
    """
    people = data['people']
    banks = data['banks']
    centers = {}
    pool = [4.8, 4.3, 3.8, 3.2, 2.6]
    for i, p in enumerate(people):
        centers[p['name']] = pool[i % len(pool)] if i < len(pool) else rng.choice(pool)

    def star(name):
        v = round(rng.gauss(centers[name], 0.45))
        return max(1, min(5, int(v)))
    peer = {}      # rater -> ratee -> {'attitude': [...], 'performance': [...] or None}
    for r in people:
        peer[r['name']] = {}
        for t in people:
            if t['name'] == r['name']:
                continue
            att_n = len(banks['ftAttitude'] if t['role'] == '正職' else banks['ptAttitude'])
            entry = {'attitude': [star(t['name']) for _ in range(att_n)]}
            entry['performance'] = ([star(t['name']) for _ in range(len(banks['ptPerf']))]
                                    if t['role'] == '計時' else None)
            peer[r['name']][t['name']] = entry
    self_ = {}
    for p in people:
        att_n = len(banks['ftAttitude'] if p['role'] == '正職' else banks['ptAttitude'])
        self_[p['name']] = {
            'attitude': [star(p['name']) for _ in range(att_n)],
            'performance': ([star(p['name']) for _ in range(len(banks['ptPerf']))]
                            if p['role'] == '計時' else None),
        }
    # 主管 KPI 評分（每位正職）
    kpi = {}
    for p in people:
        if p['role'] != '正職':
            continue
        items = data['ftTemplates'][data['ftTitles'][p['name']]]
        kpi[p['name']] = {it['key']: (rng.choices(['A', 'B', 'C', 'D'], weights=[4, 3, 2, 1])[0]
                                      if it['type'] == '技能'
                                      else rng.choices(['完成', '未完成'], weights=[4, 1])[0])
                          for it in items}
    # 主管 ± 調整（隨機挑 1~2 人）
    adjust = {}
    for p in rng.sample(data['people'], rng.randint(1, 2)):
        adjust[p['name']] = {'att': rng.randint(-3, 3), 'perf': rng.randint(-3, 3)}
    # 新人考核星等
    newbie_scores = {
        'attitude': [star(data['newbie']) for _ in range(len(banks['ptAttitude']))],
        'performance': [star(data['newbie']) for _ in range(len(banks['ptPerf']))],
    }
    msgs = {
        'named': (rng.choice([p['name'] for p in people if p['name'] != data['newbie']]), rng.choice(WORDS)),
        'anon': (rng.choice([p['name'] for p in people if p['name'] != data['newbie']]), rng.choice(WORDS)),
        'company': rng.choice(WORDS),
        'selfnote': rng.choice(WORDS),
        'feedback': rng.choice(WORDS),
    }
    return {'peer': peer, 'self': self_, 'kpi': kpi, 'adjust': adjust,
            'newbie': newbie_scores, 'msgs': msgs}


def expectations(data, r):
    """算出每個人的預期分數。全部照規格自己算，不碰系統的任何一行程式。"""
    out = {}
    for p in data['people']:
        name, role = p['name'], p['role']
        # 態度：規格是「每一題先取平均，再把各題加總」（不是先加總再平均）。
        # 兩者數學上相等，但浮點路徑不同，在 .x5 邊界會差 0.1——要跟畫面對得起來就得同序。
        att_lists = [r['peer'][rater][name]['attitude']
                     for rater in r['peer'] if name in r['peer'][rater]]
        att_lists.append(r['self'][name]['attitude'])
        att = _sum_item_avg(att_lists)
        if role == '正職':
            att *= 1.2
        # 表現：計時＝全員互評+自評（同樣每題平均後加總）；正職＝主管 KPI
        if role == '計時':
            perf_lists = [r['peer'][rater][name]['performance']
                          for rater in r['peer'] if name in r['peer'][rater]]
            perf_lists.append(r['self'][name]['performance'])
            perf = _sum_item_avg(perf_lists)
        else:
            items = data['ftTemplates'][data['ftTitles'][name]]
            perf = kpi_total(items, r['kpi'][name])
        adj = r['adjust'].get(name, {'att': 0, 'perf': 0})
        final = cap100(att + adj['att'] + (perf + adj['perf'] if perf is not None else 0))
        out[name] = {
            'role': role,
            'attitude': round1(att),
            'performance': round1(perf) if perf is not None else None,
            'adjust': (adj['att'] + adj['perf']) if perf is not None else adj['att'],
            'final': final,
            'grade': _grade(final),
            'tier': _tier(data['tiers'], final),
        }
    nb = r['newbie']
    out['__newbie__'] = {
        'attitude': sum(nb['attitude']), 'performance': sum(nb['performance']),
        'total': min(sum(nb['attitude']) + sum(nb['performance']), 100),
    }
    return out


def _sum_item_avg(lists):
    """每一題先跨評分者取平均，再把各題加總（與畫面的計算順序一致）。"""
    n = len(lists)
    return sum(sum(one[i] for one in lists) / n for i in range(len(lists[0])))


def _grade(score):
    if score is None:
        return None
    for g, lo in (('A', 85), ('B', 75), ('C', 65), ('D', 0)):
        if score >= lo:
            return g
    return 'D'


def _tier(tiers, score):
    """分數落在哪一列：照級距文字裡的下限門檻由上往下找第一個 score >= 下限。"""
    import re
    if score is None:
        return None
    for i, (rng_text, pay) in enumerate(tiers):
        nums = [int(x) for x in re.findall(r'\d+', rng_text)]
        if not nums:
            continue
        low = min(nums) if len(nums) > 1 else nums[0]
        if '以下' in rng_text:
            continue
        if score >= low:
            return (rng_text, pay)
    return tuple(tiers[-1])
