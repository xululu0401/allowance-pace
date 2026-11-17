#!/usr/bin/env python3
"""生活费的给法 · 独立参考实现（只按文字规则重写，不读 core.js）。
规则（以分为整数）：
  到账日：按月 [1]；按半月 [1,16]；按周 1,8,15,...；按天 1..D。每段金额 = floor(可发 × 段长 / D)，最后一段拿余数。
  每天：先付 固定 + 当天大额（余额 → 备用金 → 缺口）；
       留出 = 固定 × (这段剩余天数 − 1) + 本段内今天之后的「提前知道」大额；
       富余 = 余额 − 留出；富余 > 0 时随手花 = min(富余, floor(k100 × 富余 / (100 × 这段剩余天数)))。
  只够吃饭的天 = 没缺口且随手花 = 0。
  备用金最少几元：从 0 元逐元往上试，第一个让缺口 = 0 的整数元。
输出 tests/ref.json：300 组随机设定 × 4 种给法。用 Fraction 交叉检查 floor 与守恒。"""
import json, random
from fractions import Fraction
from pathlib import Path

MODES = ['month', 'half', 'week', 'day']


def pays(mode, D):
    if mode == 'month':
        return [1]
    if mode == 'half':
        return [1, 16]
    step = 7 if mode == 'week' else 1
    return list(range(1, D + 1, step))


def run(cfg, mode, reserve_yuan=None):
    D = cfg['days']
    total = cfg['total_f']
    res = (cfg['reserve_f'] if reserve_yuan is None else reserve_yuan * 100)
    fixed = cfg['fixed_f']
    k100 = cfg['k100']
    pd = pays(mode, D)
    avail = total - res
    amts = []
    for i, d in enumerate(pd):
        end = pd[i + 1] if i + 1 < len(pd) else D + 1
        if i + 1 < len(pd):
            a = Fraction(avail * (end - d), D)
            amts.append(a.numerator // a.denominator)
        else:
            amts.append(avail - sum(amts))
    big = {}
    known = {}
    for e in cfg['events']:
        big[e['day']] = big.get(e['day'], 0) + e['amt_f']
        if e['known']:
            known[e['day']] = known.get(e['day'], 0) + e['amt_f']
    bal, R = 0, res
    short = short_days = tight = disc_sum = first_short = 0
    paid_need = 0
    for t in range(1, D + 1):
        if t in pd:
            bal += amts[pd.index(t)]
        nxt = min([d for d in pd if d > t], default=D + 1)
        L = nxt - t
        need = fixed + big.get(t, 0)
        pay = need if bal >= need else bal
        bal -= pay
        g = need - pay
        take = g if R >= g else R
        R -= take
        g -= take
        paid_need += need - g
        hold = fixed * (L - 1) + sum(known.get(u, 0) for u in range(t + 1, nxt))
        s = bal - hold
        d = 0
        if s > 0:
            q = Fraction(k100 * s, 100 * L)
            d = min(s, q.numerator // q.denominator)
        bal -= d
        disc_sum += d
        if g > 0:
            short += g
            short_days += 1
            if not first_short:
                first_short = t
        elif d == 0:
            tight += 1
        assert bal >= 0 and R >= 0
    # 守恒：给的 = 付掉的必须开销 + 随手花 + 剩余
    assert total == paid_need + disc_sum + bal + R
    return dict(short=short, shortDays=short_days, firstShort=first_short, tightDays=tight, disc=disc_sum, left=bal + R, pays=len(pd))


def need_reserve(cfg, mode):
    for x in range(0, cfg['total_f'] // 100 + 1):
        if run(cfg, mode, x)['short'] == 0:
            return x
    return None


def main():
    rng = random.Random(20261117)
    cases = []
    stats = {'month_short': 0, 'day_short': 0, 'any_zero': 0, 'mode_disagree': 0}
    while len(cases) < 300:
        D = rng.choice([28, 29, 30, 31])
        fixed = rng.randint(20, 80) * 100 + rng.choice([0, 0, 50, 37])
        k100 = rng.choice([50, 80, 100, 120, 150, 180, 220, 300, 133])
        nev = rng.randint(0, 5)
        evs = [{'day': rng.randint(1, D), 'amt_f': rng.randint(20, 600) * 100 + rng.choice([0, 0, 99]), 'known': rng.random() < 0.6, 'name': 'e%d' % i} for i in range(nev)]
        needed = fixed * D + sum(e['amt_f'] for e in evs)
        total = int(needed * rng.uniform(0.95, 1.35)) // 100 * 100 + rng.choice([0, 0, 50])
        total = max(10000, min(total, 5000000))
        res = rng.choice([0, 0, 0, 100, 300]) * 100
        if res > total:
            res = 0
        cfg = dict(days=D, total_f=total, fixed_f=fixed, k100=k100, reserve_f=res, events=evs)
        out = {}
        for m in MODES:
            r = run(cfg, m)
            r['reserveNeeded'] = need_reserve(cfg, m) if r['short'] > 0 else 0
            out[m] = r
        if out['month']['short'] > 0: stats['month_short'] += 1
        if out['day']['short'] > 0: stats['day_short'] += 1
        if any(out[m]['short'] == 0 for m in MODES): stats['any_zero'] += 1
        best = min(MODES, key=lambda m: (out[m]['short'], out[m]['pays']))
        if best != 'month': stats['mode_disagree'] += 1
        st = {'total': '%d.%02d' % divmod(total, 100), 'days': str(D), 'fixed': '%d.%02d' % divmod(fixed, 100), 'k': str(k100 / 100), 'reserve': str(res // 100), 'mode': 'month',
              'events': [{'day': str(e['day']), 'name': e['name'], 'amt': '%d.%02d' % divmod(e['amt_f'], 100), 'known': e['known']} for e in evs]}
        cases.append({'state': st, 'expect': out, 'best': best})
    Path(__file__).with_name('ref.json').write_text(json.dumps({'generator': 'tests/ref.py seed 20261117', 'stats': stats, 'cases': cases}, ensure_ascii=False))
    print('300 组写入 ref.json', stats)


if __name__ == '__main__':
    main()
