/* 生活费的给法 · 核心测试：node --test tests/core.test.cjs
 * 锚点：tests/ref.json（独立 Python 按文字规则重写 + Fraction，300 组 × 4 种给法）、默认场景手算读数、
 *       守恒式、备用金「最少」的两侧、改法真的重算、边界与非法输入、导出。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const A = require(path.join(__dirname, '..', 'core.js'));
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'ref.json'), 'utf8'));
const D = () => A.defaultState();
const MODES = ['month', 'half', 'week', 'day'];

test('默认场景：手算第 1 天、读数、标题', () => {
  const o = A.compute(D());
  assert.ok(o.ok, JSON.stringify(o.errors));
  const c = o.cur; assert.equal(c.mode, 'month');
  /* 手算第 1 天：到账 2000；付 45 → 1955；留出 45×29 = 1305 + 本段内提前知道的聚餐 120、车票 180 = 1605；
   * 富余 350；随手花 = floor(1.8 × 350 ÷ 30) = 21 元 → 余 1934。修手机 260 是突然来的，不提前留。 */
  const r1 = c.rows[0];
  assert.deepEqual([r1.pay, r1.need, r1.disc, r1.bal], [200000, 4500, 2100, 193400]);
  assert.equal(c.rows[5].need, 4500 + 12000); /* 第 6 天聚餐 */
  assert.equal(c.needTotal, 191000); /* 45 × 30 + 120 + 260 + 180 */
  assert.equal(c.short, 19520); assert.equal(c.shortDays, 5); assert.equal(c.firstShort, 26);
  assert.equal(c.tightDays, 7); assert.equal(c.firstTight, 19);
  assert.equal(c.firstWeek, 13466); assert.equal(c.lastWeek, 0); assert.equal(c.left, 0);
  assert.equal(A.headline(o), '按月给：第 26 天（回家车票）开始缺钱，这个月一共缺 195.20 元、5 天不够付必须的开销。');
  assert.equal(A.explain(o), '一个月必须花 1,910 元（每天 45 元 × 30 天 + 大额 560 元），给的是 2,000 元。随手花掉 285.20 元：第一周 134.66 元，最后一周 0 元。四种给法里按半月给缺得最少（164.19 元）。');
  /* 四种给法 */
  const m = Object.fromEntries(o.runs.map((r) => [r.mode, r]));
  assert.deepEqual(MODES.map((k) => m[k].short), [19520, 16419, 26057, 49502]);
  assert.deepEqual(MODES.map((k) => m[k].pays.length), [1, 2, 5, 30]);
  assert.equal(o.best.mode, 'half');
  assert.deepEqual([m.day.firstWeek, m.day.lastWeek, m.week.lastWeek], [12996, 13016, 4336]);
});

test('与独立 Python 实现逐组对拍（300 组 × 4 种给法，含备用金最少几元）', () => {
  assert.equal(REF.cases.length, 300);
  const st = REF.stats;
  assert.ok(st.month_short >= 60 && st.any_zero >= 60 && st.mode_disagree >= 20, '样本要覆盖「缺 / 不缺 / 最优不是按月」：' + JSON.stringify(st));
  let n = 0;
  for (const c of REF.cases) {
    const pr = A.parse(c.state); assert.equal(pr.errors.length, 0, JSON.stringify(pr.errors));
    for (const k of MODES) {
      const r = A.simulate(pr.P, k), e = c.expect[k], msg = JSON.stringify(c.state) + ' ' + k;
      assert.deepEqual({ short: r.short, shortDays: r.shortDays, firstShort: r.firstShort, tightDays: r.tightDays, disc: r.disc, left: r.left, pays: r.pays.length },
        { short: e.short, shortDays: e.shortDays, firstShort: e.firstShort, tightDays: e.tightDays, disc: e.disc, left: e.left, pays: e.pays }, msg);
      assert.equal(r.short > 0 ? A.reserveNeeded(pr.P, k) : 0, e.reserveNeeded, msg + ' 备用金');
      n++;
    }
    assert.equal(A.compute(c.state).best.mode, c.best, '四种里谁最好');
  }
  assert.equal(n, 1200);
});

test('守恒与值域：给的钱 = 付掉的必须开销 + 随手花 + 剩下；余额从不为负', () => {
  for (const c of REF.cases.concat([{ state: D() }])) {
    const P = A.parse(c.state).P;
    for (const k of MODES) {
      const r = A.simulate(P, k);
      const paidNeed = r.rows.reduce((s, x) => s + x.need - x.short, 0);
      assert.equal(Math.round(P.total * 100), paidNeed + r.disc + r.endBal + r.resLeft);
      assert.equal(r.pays.reduce((s, p) => s + p.amt, 0), r.paidTotal);
      r.rows.forEach((x) => { assert.ok(x.bal >= 0 && x.res >= 0 && x.disc >= 0 && x.short >= 0 && x.short <= x.need); assert.ok(Number.isInteger(x.disc)); });
      assert.equal(r.short, r.needTotal - paidNeed);
    }
  }
});

test('到账日与分钱：按天比例、零头给最后一段', () => {
  assert.deepEqual(A.payDays('month', 30), [1]);
  assert.deepEqual(A.payDays('half', 31), [1, 16]);
  assert.deepEqual(A.payDays('week', 31), [1, 8, 15, 22, 29]);
  assert.equal(A.payDays('day', 28).length, 28);
  assert.deepEqual(A.payAmounts([1, 8, 15, 22, 29], 30, 200000), [46666, 46666, 46666, 46666, 13336]);
  assert.deepEqual(A.payAmounts([1, 16], 31, 200000), [96774, 103226]);
});

test('备用金「最少」：少 1 元仍缺，刚好那么多就不缺', () => {
  const P = A.parse(D()).P;
  for (const k of MODES) {
    const x = A.reserveNeeded(P, k);
    assert.ok(x > 0);
    assert.equal(A.simulate(P, k, x).short, 0, k);
    assert.ok(A.simulate(P, k, x - 1).short > 0, k + ' 少 1 元');
  }
  assert.equal(A.reserveNeeded(P, 'month'), 240);
  /* 总额根本不够付必须的：留多少都不行 → null，不给备用金改法 */
  const s = D(); s.total = '1000'; const P2 = A.parse(s).P;
  assert.equal(A.reserveNeeded(P2, 'month'), null);
  assert.ok(!A.compute(s).actions.some((a) => a.kind === 'reserve'));
  /* 四种给法都缺 910（= 1910 − 1000）：不给「换给法」改法，说明里直说钱不够 */
  const os = A.compute(s); assert.deepEqual(os.runs.map((r) => r.short), [91000, 91000, 91000, 91000]); assert.deepEqual(os.actions, []);
  assert.ok(A.explain(os).startsWith('这个月给的钱比必须花的还少 910 元，怎么给都至少缺这么多。'), A.explain(os));
  const sd = Object.assign(D(), { total: '1000', mode: 'day' }); assert.ok(!A.compute(sd).actions.some((a) => a.kind === 'mode'));
});

test('改法：每条都真的改输入重算，按钮里的数字和应用后一致', () => {
  const o = A.compute(D());
  assert.deepEqual(o.actions.map((a) => a.text), [
    '改成按半月给：缺口 195.20 → 164.19 元',
    '还是按月给，但每月先单独留 240 元备用、只在缺钱那天动：缺口变 0',
    '要是能把富余均匀摊到每天（冲动 1）：缺口 195.20 → 119.96 元']);
  for (const a of o.actions) {
    const o2 = A.compute(A.applyChange(D(), a.ch));
    assert.equal(o2.cur.short, a.short); assert.ok(o2.cur.short < o.cur.short);
  }
  /* 300 组上：改法都有好处 */
  let k = 0;
  for (const c of REF.cases) {
    const oc = A.compute(c.state);
    for (const a of oc.actions) { k++; assert.ok(A.compute(A.applyChange(c.state, a.ch)).cur.short < oc.cur.short, JSON.stringify(c.state) + a.text); }
    if (oc.cur.short === 0) assert.equal(oc.actions.filter((a) => a.kind !== 'mode').length, 0);
  }
  assert.ok(k >= 100, '改法样本 ' + k);
  const d = D(); A.applyChange(d, { mode: 'day' }); assert.equal(d.mode, 'month');
});

test('够花与只够吃饭：三种结论各自的措辞', () => {
  /* 冲动 1.8 时给 3000 元按月仍会在修手机后缺 10.17 元（前面花得太快）——这是模型本身的结论，单独钉住 */
  const s0 = D(); s0.total = '3000'; assert.equal(A.compute(s0).cur.short, 1017);
  const s = D(); s.total = '3000'; s.k = '1';
  const o = A.compute(s); assert.equal(o.level, 'ok'); assert.equal(o.cur.short, 0); assert.equal(o.cur.tightDays, 0);
  assert.ok(A.headline(o).startsWith('按月给：必须的开销天天付得上，每天都有闲钱可花'), A.headline(o));
  assert.deepEqual(o.actions, []);
  const t = D(); t.events = []; t.total = '1350'; /* 刚好 45 × 30 */
  const o2 = A.compute(t); assert.equal(o2.level, 'tight'); assert.equal(o2.cur.tightDays, 30); assert.equal(o2.cur.disc, 0);
  assert.equal(A.headline(o2), '按月给：必须的开销都付得上，但有 30 天只够吃饭、一分闲钱都没有（第一次在第 1 天）。');
  assert.ok(A.explain(o2).startsWith('一个月必须花 1,350 元'), '给的钱刚好等于必须花的：不说「比必须花的还少」');
  /* 冲动 < 1 会有结余 */
  const u = D(); u.total = '3000'; u.k = '0.5'; assert.ok(A.compute(u).cur.left > 0);
});

test('给法的直觉检查：冲动 1、没有大额时四种给法都不缺；冲动越大按月给缺得越多', () => {
  const s = D(); s.events = []; s.k = '1';
  for (const k of MODES) assert.equal(A.simulate(A.parse(s).P, k).short, 0, k);
  let prev = -1;
  for (const k of ['1', '1.5', '2', '3']) { const t = D(); t.k = k; const sh = A.compute(t).runs[0].short; assert.ok(sh >= prev, k); prev = sh; }
  /* 按天给（冲动 ≥ 1）当天富余当天花光：突然的大额只能靠备用金 */
  const d = A.simulate(A.parse(D()).P, 'day'); assert.equal(d.endBal, 0);
});

test('非法输入：逐项报错；全角与千分位能认', () => {
  const s = D(); s.total = '50'; s.days = '32'; s.fixed = 'abc'; s.k = '5'; s.events[0].day = '31'; s.events[1].amt = '0';
  const o = A.compute(s); assert.equal(o.ok, false);
  assert.deepEqual(o.errors.map((e) => e.field).sort(), ['days', 'eamt1', 'fixed', 'k', 'total'].sort());
  const t = D(); t.reserve = '2500'; assert.deepEqual(A.compute(t).errors.map((e) => e.field), ['reserve']);
  assert.equal(A.compute(Object.assign(D(), { days: '27' })).errors[0].field, 'days');
  const t2 = D(); t2.days = '28'; t2.events[2].day = '30'; assert.deepEqual(A.compute(t2).errors.map((e) => e.field), ['eday2']);
  const u = D(); u.total = '２,０００'; u.fixed = '４５'; const o2 = A.compute(u); assert.ok(o2.ok); assert.equal(o2.P.total, 2000);
  const v = D(); v.fixed = '45.123'; assert.equal(A.compute(v).errors[0].field, 'fixed');
  const w = D(); for (let i = 0; i < 9; i++) w.events.push({ day: '1', name: '', amt: '1' });
  const P = A.parse(w).P; assert.equal(P.events.length, 8); assert.equal(P.events[3].name, '第 4 笔');
  assert.equal(A.parse(Object.assign(D(), { mode: 'year' })).P.mode, 'month');
});

test('边界：没有大额、大额全在第 1 天、31 天、备用金等于总额', () => {
  const s = D(); s.events = []; assert.ok(A.compute(s).ok);
  const t = D(); t.events.forEach((e) => { e.day = '1'; }); const ot = A.compute(t); assert.ok(ot.ok); assert.equal(ot.cur.rows[0].need, 4500 + 56000);
  const u = D(); u.days = '31'; assert.equal(A.compute(u).cur.rows.length, 31);
  const v = D(); v.reserve = '2000'; const ov = A.compute(v); assert.ok(ov.ok); assert.equal(ov.cur.paidTotal, 0); assert.equal(ov.cur.disc, 0);
  assert.equal(A.yuan(195020), '1,950.20'); assert.equal(A.yuan(5), '0.05'); assert.equal(A.yuan(-150), '-1.50'); assert.equal(A.yuan(200000), '2,000');
});

test('导出：CSV 防公式注入与行数、MD 含四种给法表', () => {
  const s = D(); s.events[0].name = '=1+2';
  const o = A.compute(s); const csv = A.toCSV(o, '2026-11-17 19:00');
  assert.ok(csv.indexOf("6,,'=1+2,165") > 0, csv.slice(0, 600));
  assert.equal(csv.split('\r\n').filter(Boolean).length, 1 + 30 + 12);
  const md = A.toMD(A.compute(D()), 'w');
  assert.ok(md.indexOf('**按月给：第 26 天') > 0 && md.indexOf('| 按月给（现在） | 1 | 195.20 | 5 | 7 | 134.66 | 0 | 0 |') > 0 && md.indexOf('| 按半月给 | 2 | 164.19 |') > 0 && md.indexOf('虚构示例') > 0, md);
});
