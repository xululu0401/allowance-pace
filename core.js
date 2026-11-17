/* 生活费的给法 · 计算核心（core.js）
 * 问题：大学生活费是按月给好，还是按半月、按周、按天给好？
 *       同样一个月 2000 元，给的次数不同，学生「刚到手手松、快没了才紧」的花法会让钱在一个月里的走势完全不同：
 *       哪天开始只够吃饭、碰上聚餐车票这种大额开销时缺多少、要不要单独留一笔备用金。
 * 模型（设计选择，页面「怎么算的」写明，不是行为经济学定论）：
 *   - 一个月 D 天，第 1 天起按给法分成若干段，每段开头到账；每段金额按天数比例分（分到分，零头给最后一段），合计 = 总额 − 备用金。
 *   - 每天先付「必须花的」（每天固定开销 + 当天的大额事项）；余额不够时从备用金里补，备用金也不够就记为缺口（要临时找人要/借）。
 *   - 付完必须的，再「随手花」：先给这段剩下的天数留好每天固定开销，剩出来的叫「富余」；
 *     随手花 = min(富余, ⌊冲动 × 富余 ÷ 这段还剩几天（含今天）⌋)。冲动 = 1 是把富余均匀摊到每天；> 1 是刚到手时花得快；< 1 是省着花、会有结余。
 *   - 「提前知道」的大额事项：只要它落在这一段里（下次到账之前），算富余时先把它留出来；落在以后几段的，钱还没到手，留不了。
 *     「突然来的」大额事项（修手机、看病）事先不留。看的就是：给的次数越多，手松的时间越短，但每段能提前留出来的也越少。
 *   - 全部以「分」为整数计算，没有浮点误差；独立参考实现 tests/ref.py 用同样的整数规则重写对拍。 */
(function (root) {
  'use strict';
  var MAX_EVENTS = 8, MAX_TOTAL = 50000, MAX_FIXED = 1000, MAX_EVENT = 20000;
  var MODES = [
    { key: 'month', name: '按月给', short: '按月', len: 0 },
    { key: 'half', name: '按半月给', short: '按半月', len: 15 },
    { key: 'week', name: '按周给', short: '按周', len: 7 },
    { key: 'day', name: '按天给', short: '按天', len: 1 }
  ];

  function defaultState() {
    return {
      total: '2000', days: '30', fixed: '45', k: '1.8', reserve: '0', mode: 'month',
      events: [
        { day: '6', name: '社团聚餐', amt: '120', known: true },
        { day: '19', name: '手机摔了修屏', amt: '260', known: false },
        { day: '26', name: '回家车票', amt: '180', known: true }
      ]
    };
  }

  function half(s) { return String(s == null ? '' : s).replace(/[\uFF01-\uFF5E]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); }).replace(/\u3000/g, ' ').replace(/[,，\s]/g, ''); }
  function num(s) { s = half(s).replace(/。/g, '.'); if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s); return NaN; }
  function isInt(x) { return isFinite(x) && Math.floor(x) === x; }
  function fen(x) { return Math.round(x * 100); }

  function parse(st) {
    var errs = [], P = {};
    st = st && typeof st === 'object' ? st : {};
    function need(v, f, lo, hi, intOnly, msg) {
      var x = num(v);
      if (!isFinite(x)) { errs.push({ field: f, message: msg + '：要填数字' }); return NaN; }
      if (intOnly && !isInt(x)) { errs.push({ field: f, message: msg + '：要填整数' }); return NaN; }
      if (x < lo || x > hi) { errs.push({ field: f, message: msg + '：要在 ' + lo + '–' + hi + ' 之间' }); return NaN; }
      if (!intOnly && Math.abs(Math.round(x * 100) - x * 100) > 1e-6) { errs.push({ field: f, message: msg + '：最多两位小数' }); return NaN; }
      return x;
    }
    P.total = need(st.total, 'total', 100, MAX_TOTAL, false, '一个月给多少');
    P.days = need(st.days, 'days', 28, 31, true, '这个月几天');
    P.fixed = need(st.fixed, 'fixed', 0, MAX_FIXED, false, '每天必须花');
    P.k = need(st.k, 'k', 0.5, 3, false, '刚到手时花得多快');
    P.reserve = need(st.reserve, 'reserve', 0, MAX_TOTAL, false, '单独留的备用金');
    if (isFinite(P.reserve) && isFinite(P.total) && P.reserve > P.total) { errs.push({ field: 'reserve', message: '单独留的备用金：不能比一个月给的总额还多' }); P.reserve = NaN; }
    P.mode = MODES.some(function (m) { return m.key === st.mode; }) ? st.mode : 'month';
    var D = isFinite(P.days) ? P.days : 31;
    var evs = Array.isArray(st.events) ? st.events.slice(0, MAX_EVENTS) : [];
    P.events = evs.map(function (e, i) {
      e = e && typeof e === 'object' ? e : {};
      var nm = String(e.name == null ? '' : e.name).trim().slice(0, 12) || ('第 ' + (i + 1) + ' 笔');
      return {
        name: nm,
        day: need(e.day, 'eday' + i, 1, D, true, nm + ' 在第几天'),
        amt: need(e.amt, 'eamt' + i, 0.01, MAX_EVENT, false, nm + ' 要多少钱'),
        known: !!e.known
      };
    });
    return { P: P, errors: errs };
  }

  /* 给法 → 到账日（从 1 开始）与每段天数 */
  function payDays(mode, D) {
    var m = MODES.filter(function (x) { return x.key === mode; })[0], len = m.len || D, r = [];
    for (var d = 1; d <= D; d += len) r.push(d);
    if (mode === 'half') r = [1, 16];
    return r;
  }
  function payAmounts(pd, D, allowFen) {
    var out = [], sum = 0;
    for (var i = 0; i < pd.length; i++) {
      var len = (i + 1 < pd.length ? pd[i + 1] : D + 1) - pd[i];
      var a = i + 1 < pd.length ? Math.floor(allowFen * len / D) : allowFen - sum;
      out.push(a); sum += a;
    }
    return out;
  }

  /* 逐天模拟一种给法。参数都是「分」与整数，k100 = 冲动 × 100 */
  function simulate(P, mode, reserveYuan) {
    var D = P.days, totalF = fen(P.total), resF = fen(reserveYuan == null ? P.reserve : reserveYuan);
    var fixedF = fen(P.fixed), k100 = Math.round(P.k * 100);
    var pd = payDays(mode, D), amts = payAmounts(pd, D, totalF - resF);
    var big = [], plan = []; for (var t0 = 0; t0 <= D + 1; t0++) { big.push(0); plan.push(0); }
    P.events.forEach(function (e) { big[e.day] += fen(e.amt); if (e.known) plan[e.day] += fen(e.amt); });
    var B = 0, R = resF, rows = [], pi = 0;
    var tot = { pay: 0, fixed: 0, big: 0, fromRes: 0, short: 0, disc: 0, shortDays: 0, tightDays: 0, firstShort: 0, firstTight: 0 };
    for (var t = 1; t <= D; t++) {
      var pay = 0;
      if (pi < pd.length && pd[pi] === t) { pay = amts[pi]; B += pay; pi++; }
      var next = pi < pd.length ? pd[pi] : D + 1, L = next - t;
      var needF = fixedF + big[t], paid = Math.min(B, needF), gap = needF - paid;
      B -= paid;
      var fr = Math.min(R, gap); R -= fr; gap -= fr;
      var held = 0; for (var u = t + 1; u < next; u++) held += plan[u];
      var surplus = B - fixedF * (L - 1) - held, disc = 0;
      if (surplus > 0) disc = Math.min(surplus, Math.floor(k100 * surplus / (100 * L)));
      B -= disc;
      rows.push({ t: t, pay: pay, need: needF, big: big[t], paid: paid, fromRes: fr, short: gap, disc: disc, bal: B, res: R, left: L });
      tot.pay += pay; tot.fixed += Math.min(fixedF, needF - gap); tot.big += big[t]; tot.fromRes += fr; tot.short += gap; tot.disc += disc;
      if (gap > 0) { tot.shortDays++; if (!tot.firstShort) tot.firstShort = t; }
      else if (disc === 0) { tot.tightDays++; if (!tot.firstTight) tot.firstTight = t; }
    }
    var wk = function (a, b) { var s = 0; for (var i = a; i <= b; i++) s += rows[i - 1].disc; return s; };
    return {
      mode: mode, pays: pd.map(function (d, i) { return { day: d, amt: amts[i] }; }), rows: rows,
      short: tot.short, shortDays: tot.shortDays, firstShort: tot.firstShort, tightDays: tot.tightDays, firstTight: tot.firstTight,
      disc: tot.disc, fromRes: tot.fromRes, endBal: B, resLeft: R, left: B + R,
      firstWeek: wk(1, 7), lastWeek: wk(D - 6, D), reserve: resF, needTotal: fixedF * D + big.slice(1, D + 1).reduce(function (a, b) { return a + b; }, 0),
      paidTotal: totalF - resF
    };
  }
  function rankKey(r) { return [r.short, r.pays.length]; } /* 缺得少优先，一样多时给的次数少优先 */
  function better(a, b) { var x = rankKey(a), y = rankKey(b); for (var i = 0; i < x.length; i++) { if (x[i] !== y[i]) return x[i] < y[i]; } return false; }

  /* 这种给法下，备用金最少留几元（整数元）缺口才变 0；其它输入不变。逐元往上试，不假设单调。 */
  function reserveNeeded(P, mode) {
    var top = Math.floor(P.total);
    for (var x = 0; x <= top; x++) { if (simulate(P, mode, x).short === 0) return x; }
    return null;
  }

  function fmt(x, d) { var s = Number(x).toFixed(d == null ? 0 : d); if (d) s = s.replace(/\.?0+$/, ''); return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function yuan(f) { var neg = f < 0; f = Math.abs(f); var y = Math.floor(f / 100), c = f % 100; return (neg ? '-' : '') + fmt(y) + (c ? '.' + (c < 10 ? '0' : '') + c : ''); }
  function modeName(k) { return MODES.filter(function (m) { return m.key === k; })[0].name; }
  function modeShort(k) { return MODES.filter(function (m) { return m.key === k; })[0].short; }

  function compute(st) {
    var pr = parse(st), P = pr.P, o = { ok: pr.errors.length === 0, errors: pr.errors, P: P };
    if (!o.ok) return o;
    o.runs = MODES.map(function (m) { return simulate(P, m.key); });
    var cur = o.runs.filter(function (r) { return r.mode === P.mode; })[0];
    var best = o.runs[0]; o.runs.forEach(function (r) { if (better(r, best)) best = r; });
    o.cur = cur; o.best = best;
    o.level = cur.short > 0 ? 'short' : cur.tightDays > 0 ? 'tight' : 'ok';
    /* 改法：真的改一个输入重算，只留有好处的 */
    var acts = [];
    if (best.short < cur.short) {
      acts.push({ id: 'actMode', kind: 'mode', ch: { mode: best.mode }, short: best.short, text: '改成' + modeName(best.mode) + '：缺口 ' + yuan(cur.short) + ' → ' + yuan(best.short) + ' 元' });
    }
    if (cur.short > 0) {
      var x = reserveNeeded(P, cur.mode);
      if (x != null) {
        var rr = simulate(P, cur.mode, x);
        acts.push({ id: 'actRes', kind: 'reserve', ch: { reserve: String(x) }, reserveYuan: x, short: rr.short, text: '还是' + modeShort(cur.mode) + '给，但每月先单独留 ' + fmt(x) + ' 元备用、只在缺钱那天动：缺口变 0' });
      }
    }
    if (cur.short > 0) {
      var P1 = Object.assign({}, P, { k: 1 }), r1 = simulate(P1, cur.mode);
      if (r1.short < cur.short) acts.push({ id: 'actK', kind: 'k', ch: { k: '1' }, short: r1.short, text: '要是能把富余均匀摊到每天（冲动 1）：缺口 ' + yuan(cur.short) + ' → ' + yuan(r1.short) + ' 元' });
    }
    o.actions = acts;
    return o;
  }
  function applyChange(st, ch) { var s = JSON.parse(JSON.stringify(st)); Object.keys(ch).forEach(function (k) { s[k] = ch[k]; }); return s; }

  function eventsOn(P, t) { return P.events.filter(function (e) { return e.day === t; }).map(function (e) { return e.name; }); }
  function headline(o) {
    var c = o.cur, P = o.P, nm = modeName(c.mode);
    if (c.short > 0) {
      var ev = eventsOn(P, c.firstShort);
      return nm + '：第 ' + c.firstShort + ' 天' + (ev.length ? '（' + ev.join('、') + '）' : '') + '开始缺钱，这个月一共缺 ' + yuan(c.short) + ' 元、' + c.shortDays + ' 天不够付必须的开销。';
    }
    if (c.tightDays > 0) return nm + '：必须的开销都付得上，但有 ' + c.tightDays + ' 天只够吃饭、一分闲钱都没有（第一次在第 ' + c.firstTight + ' 天）。';
    return nm + '：必须的开销天天付得上，每天都有闲钱可花' + (c.left > 0 ? '，月底还剩 ' + yuan(c.left) + ' 元' : '') + '。';
  }
  function explain(o) {
    var c = o.cur, P = o.P, D = P.days, gapAll = c.needTotal - fen(P.total);
    var s = (gapAll > 0 ? '这个月给的钱比必须花的还少 ' + yuan(gapAll) + ' 元，怎么给都至少缺这么多。' : '') + '一个月必须花 ' + yuan(c.needTotal) + ' 元（每天 ' + yuan(fen(P.fixed)) + ' 元 × ' + D + ' 天' + (P.events.length ? ' + 大额 ' + yuan(c.needTotal - fen(P.fixed) * D) + ' 元' : '') + '），给的是 ' + yuan(fen(P.total)) + ' 元。';
    s += '随手花掉 ' + yuan(c.disc) + ' 元：第一周 ' + yuan(c.firstWeek) + ' 元，最后一周 ' + yuan(c.lastWeek) + ' 元。';
    if (c.reserve > 0) s += '备用金 ' + yuan(c.reserve) + ' 元，动用 ' + yuan(c.fromRes) + ' 元。';
    if (o.best.short < c.short) s += '四种给法里' + modeName(o.best.mode) + '缺得最少（' + yuan(o.best.short) + ' 元）。';
    else s += '四种给法里这已经是缺得最少的' + (o.runs.filter(function (r) { return r.short === c.short && r.mode !== c.mode; }).length ? '之一' : '') + '。';
    return s;
  }

  function csvCell(v) { var x = String(v); if (/^[=+\-@]/.test(x)) x = "'" + x; return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }
  function toCSV(o, when) {
    var P = o.P, c = o.cur, rows = [['第几天', '到账（元）', '大额事项', '必须花（元）', '从备用金补（元）', '缺口（元）', '随手花（元）', '当天结束余额（元）']];
    c.rows.forEach(function (r) { rows.push([r.t, r.pay ? yuan(r.pay) : '', eventsOn(P, r.t).join('、'), yuan(r.need), r.fromRes ? yuan(r.fromRes) : '', r.short ? yuan(r.short) : '', yuan(r.disc), yuan(r.bal)]); });
    rows.push([], ['给法', modeName(c.mode)], ['一个月给（元）', yuan(fen(P.total))], ['单独留的备用金（元）', yuan(c.reserve)], ['每天必须花（元）', yuan(fen(P.fixed))], ['刚到手时花得多快（冲动）', fmt(P.k, 2)],
      ['合计缺口（元）', yuan(c.short)], ['缺钱的天', c.shortDays], ['只够吃饭的天', c.tightDays], ['随手花合计（元）', yuan(c.disc)], ['月底剩（元）', yuan(c.left)], ['导出时间', when || ''], ['说明', '默认金额与事项为虚构示例；花钱快慢是模型假设，不是测出来的']);
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function toMD(o, when) {
    var P = o.P, L = [];
    L.push('# 生活费的给法 · 一个月 ' + yuan(fen(P.total)) + ' 元', '', '_导出：' + (when || '') + '_', '', '**' + headline(o) + '**', '', explain(o), '');
    o.actions.forEach(function (a) { L.push('- 改法：' + a.text); });
    L.push('', '| 给法 | 给几次 | 缺口（元） | 缺钱的天 | 只够吃饭的天 | 第一周随手花 | 最后一周随手花 | 月底剩 |', '|---|---|---|---|---|---|---|---|');
    o.runs.forEach(function (r) { L.push('| ' + modeName(r.mode) + (r.mode === o.cur.mode ? '（现在）' : '') + ' | ' + r.pays.length + ' | ' + yuan(r.short) + ' | ' + r.shortDays + ' | ' + r.tightDays + ' | ' + yuan(r.firstWeek) + ' | ' + yuan(r.lastWeek) + ' | ' + yuan(r.left) + ' |'); });
    if (P.events.length) { L.push('', '大额事项：' + P.events.map(function (e) { return '第 ' + e.day + ' 天' + e.name + ' ' + yuan(fen(e.amt)) + ' 元'; }).join('；') + '。'); }
    L.push('', '_逐天模拟（以分为单位的整数计算）：先付必须的，再按「冲动 × 富余 ÷ 这段剩几天」随手花。花钱快慢是假设，默认金额与事项是虚构示例。_');
    return L.join('\n') + '\n';
  }

  var api = { MODES: MODES, MAX_EVENTS: MAX_EVENTS, defaultState: defaultState, num: num, parse: parse, payDays: payDays, payAmounts: payAmounts, simulate: simulate, reserveNeeded: reserveNeeded,
    better: better, compute: compute, applyChange: applyChange, fmt: fmt, yuan: yuan, modeName: modeName, modeShort: modeShort, eventsOn: eventsOn, headline: headline, explain: explain, toCSV: toCSV, toMD: toMD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AppCore = api;
})(typeof window !== 'undefined' ? window : this);
