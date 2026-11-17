/* 生活费的给法 · 界面（ui.js）
 * 读 state → AppCore.compute → 把同一次输出画出来。页面自己不做估算。 */
(function () {
  'use strict';
  var A = window.AppCore;
  var KEY = 'allowance-pace:v1';
  var $ = function (id) { return document.getElementById(id); };
  var PRESETS = [
    { key: 'base', name: '一个月 2000（默认）', note: '虚构示例：一个月 2000 元按月给，每天吃饭通勤 45 元；第 6 天社团聚餐 120、第 26 天回家车票 180（都提前知道），第 19 天手机摔了修屏 260（突然的）；刚到手时花得比均匀快 0.8 倍（冲动 1.8）。' },
    { key: 'steady', name: '花得很均匀的人', note: '虚构示例：同样的钱和开销，冲动 1，富余平均花到每天。', f: function (s) { s.k = '1'; } },
    { key: 'loose', name: '到手就想花', note: '虚构示例：同样的钱和开销，冲动 3，到手的富余前几天就花掉一大半。', f: function (s) { s.k = '3'; } },
    { key: 'none', name: '这个月没有大额', note: '虚构示例：没有聚餐、车票和意外，只有每天 45 元的固定开销，冲动 1.8。', f: function (s) { s.events = []; } }
  ];
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function presetState(k) { var s = A.defaultState(), p = PRESETS.filter(function (q) { return q.key === k; })[0]; if (p.f) p.f(s); return s; }
  function norm(s) { var t = sanitize(s); delete t.mode; return JSON.stringify(t); }
  function presetKey(s) { var j = norm(s); for (var i = 0; i < PRESETS.length; i++) if (norm(presetState(PRESETS[i].key)) === j) return PRESETS[i].key; return null; }

  function str(v, n) { return v == null || typeof v === 'object' ? '' : String(v).slice(0, n); }
  function sanitize(s) {
    if (!s || typeof s !== 'object') return null;
    var d = A.defaultState();
    ['total', 'days', 'fixed', 'k', 'reserve', 'mode'].forEach(function (k) { if (k in s) d[k] = str(s[k], 10); });
    if (Array.isArray(s.events)) d.events = s.events.slice(0, A.MAX_EVENTS).map(function (e) {
      e = e && typeof e === 'object' ? e : {};
      return { day: str(e.day, 4), name: str(e.name, 12), amt: str(e.amt, 10), known: !!e.known };
    });
    return d;
  }
  function load() { try { var t = localStorage.getItem(KEY); if (!t) return null; var j = JSON.parse(t); return j && j.state ? sanitize(j.state) : null; } catch (e) { return null; } }
  var state = load() || A.defaultState(), out = null, tmr = null, picked = 0;
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, state: state })); $('saveTag').textContent = '· 已自动存在本机'; } catch (e) { $('saveTag').textContent = '· 这台设备存不了，刷新会丢'; } }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  var TOP = ['total', 'days', 'fixed', 'k', 'reserve'];
  function fillTop() { TOP.forEach(function (k) { $(k).value = state[k]; }); renderEvents(); }
  TOP.forEach(function (k) { $(k).addEventListener('input', function () { state[k] = this.value; schedule(); }); });
  function schedule() { clearTimeout(tmr); tmr = setTimeout(update, 80); }

  function renderEvents() {
    $('evList').innerHTML = state.events.map(function (e, i) {
      return '<div class="ev"><input data-i="' + i + '" data-f="day" id="eday' + i + '" value="' + esc(e.day) + '" inputmode="numeric" aria-label="第几天">' +
        '<input data-i="' + i + '" data-f="name" id="ename' + i + '" value="' + esc(e.name) + '" maxlength="12" aria-label="是什么">' +
        '<input data-i="' + i + '" data-f="amt" id="eamt' + i + '" value="' + esc(e.amt) + '" inputmode="decimal" aria-label="多少钱">' +
        '<label class="ck"><input type="checkbox" data-i="' + i + '" data-f="known" id="eknown' + i + '"' + (e.known ? ' checked' : '') + '>提前知道</label>' +
        '<button type="button" class="del" data-del="' + i + '" id="edel' + i + '" aria-label="删掉这一笔">删</button></div>';
    }).join('') || '<p class="muted" style="margin:4px 0">这个月没有大额开销。</p>';
    $('addE').disabled = state.events.length >= A.MAX_EVENTS;
  }
  $('evList').addEventListener('input', function (e) { var t = e.target, i = t.getAttribute('data-i'), f = t.getAttribute('data-f'); if (i == null || f === 'known') return; state.events[+i][f] = t.value; schedule(); });
  $('evList').addEventListener('change', function (e) { var t = e.target; if (t.getAttribute('data-f') === 'known') { state.events[+t.getAttribute('data-i')].known = t.checked; update(); } });
  $('evList').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b) return; state.events.splice(+b.getAttribute('data-del'), 1); renderEvents(); update(); });
  $('addE').addEventListener('click', function () { if (state.events.length >= A.MAX_EVENTS) return; state.events.push({ day: '10', name: '新的一笔', amt: '100', known: true }); renderEvents(); update(); });
  $('presets').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (!b) return; var m = state.mode; state = presetState(b.getAttribute('data-p')); state.mode = m; fillTop(); update(); });
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-mode]'); if (!b) return; state.mode = b.getAttribute('data-mode'); picked = 0; update(); });
  $('acts').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || !out || !out.ok) return;
    var a = out.actions.filter(function (x) { return x.id === b.getAttribute('data-act'); })[0]; if (!a) return;
    state = A.applyChange(state, a.ch); fillTop(); update();
  });
  $('tl').addEventListener('click', function (e) { var b = e.target.closest('[data-day]'); if (!b) return; picked = +b.getAttribute('data-day'); renderPick(); });

  function markErrors() {
    document.querySelectorAll('.bad').forEach(function (e) { e.classList.remove('bad'); });
    if (!out.ok) out.errors.forEach(function (er) { var el = $(er.field); if (el) el.classList.add('bad'); });
  }
  function renderPresets() {
    var key = presetKey(state);
    $('presets').innerHTML = PRESETS.map(function (p) { return '<button type="button" class="chip" id="preset_' + p.key + '" data-p="' + p.key + '" aria-pressed="' + (key === p.key) + '">' + esc(p.name) + '</button>'; }).join('');
    var cur = PRESETS.filter(function (p) { return p.key === key; })[0];
    $('presetNote').textContent = cur ? cur.note + (state.mode !== 'month' ? '（现在看的是' + A.modeName(state.mode) + '）' : '') : '你改过的设定（金额、开销、花得多快都是你填的）。';
  }
  function shortText(r) { return r.short > 0 ? '缺 ' + A.yuan(r.short) + ' 元' : '不缺'; }
  function render() {
    var o = out;
    $('errBox').classList.toggle('hide', o.ok);
    ['okBox', 'tlPanel', 'cmpPanel'].forEach(function (id) { $(id).classList.toggle('hide', !o.ok); });
    if (!o.ok) { $('errBox').innerHTML = '先改好标红的地方：<ul>' + o.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>'; return; }
    var c = o.cur;
    $('tabs').innerHTML = o.runs.map(function (r) {
      var isBest = r.mode === o.best.mode && o.runs.every(function (x) { return x === r || x.short > r.short; });
      return '<button type="button" class="tab" id="tab_' + r.mode + '" data-mode="' + r.mode + '" aria-pressed="' + (r.mode === c.mode) + '"><b>' + A.modeName(r.mode) + (isBest ? ' <em>缺得最少</em>' : '') + '</b>' +
        '<span class="s ' + (r.short > 0 ? 'neg' : 'pos') + '">' + shortText(r) + '</span>' +
        '<span>' + (r.short > 0 ? '第 ' + r.firstShort + ' 天起，' + r.shortDays + ' 天不够' : r.tightDays ? r.tightDays + ' 天只够吃饭' : '天天有闲钱') + '</span>' +
        '<span>到账 ' + r.pays.length + ' 次</span></button>';
    }).join('');
    $('headline').textContent = A.headline(o); $('headline').className = 'head' + (o.level === 'short' ? ' neg' : '');
    $('why').textContent = A.explain(o);
    $('acts').innerHTML = o.actions.length ? o.actions.map(function (a) { return '<button type="button" class="act" id="' + a.id + '" data-act="' + a.id + '">→ ' + esc(a.text) + '</button>'; }).join('') : '<span class="muted">' + (o.level === 'short' ? '' : '这种给法下必须的开销都付得上，不用改。') + '</span>';
    renderTimeline();
    $('cmp').innerHTML = '<tr><th>给法</th><th>到账</th><th>缺口</th><th>缺钱的天</th><th>只够吃饭的天</th><th>第一周随手花</th><th>最后一周随手花</th><th>要留备用金</th></tr>' + o.runs.map(function (r) {
      var need = r.short > 0 ? A.reserveNeeded(o.P, r.mode) : 0;
      return '<tr' + (r.mode === c.mode ? ' class="cur"' : '') + '><td>' + A.modeName(r.mode) + '</td><td>' + r.pays.length + ' 次</td><td class="' + (r.short > 0 ? 'neg' : '') + '">' + A.yuan(r.short) + '</td><td>' + r.shortDays + '</td><td>' + r.tightDays + '</td><td>' + A.yuan(r.firstWeek) + '</td><td>' + A.yuan(r.lastWeek) + '</td><td>' + (r.short === 0 ? '不用' : need == null ? '留多少都不够' : '至少 ' + A.fmt(need) + ' 元') + '</td></tr>';
    }).join('');
  }
  function renderTimeline() {
    var c = out.cur, P = out.P, n = c.rows.length, mx = 1;
    c.rows.forEach(function (r) { mx = Math.max(mx, r.bal + r.disc); });
    $('tlTitle').innerHTML = '逐天的钱 · ' + esc(A.modeName(c.mode)) + ' <span class="muted">柱高 = 当天花完必须的之后手上的钱（最高 ' + A.yuan(mx) + ' 元）</span>';
    $('tl').style.gridTemplateColumns = 'repeat(' + n + ',minmax(14px,1fr))';
    $('tl').innerHTML = c.rows.map(function (r) {
      var cls = 'day' + (r.short > 0 ? ' short' : r.disc === 0 ? ' tight' : '') + (r.pay ? ' pay' : '');
      var evs = P.events.filter(function (e) { return e.day === r.t; }), mk = '';
      if (r.pay) mk += '<b>¥</b>';
      if (evs.some(function (e) { return e.known; })) mk += '<s>●</s>';
      if (evs.some(function (e) { return !e.known; })) mk += '<u>!</u>';
      return '<button type="button" class="' + cls + '" data-day="' + r.t + '" id="d' + r.t + '" style="background:none;border:0;padding:0" aria-label="第 ' + r.t + ' 天">' +
        '<span class="mk">' + mk + '</span><span class="colm"><i class="d" style="height:' + (r.disc / mx * 100).toFixed(2) + '%"></i><i style="height:' + (r.bal / mx * 100).toFixed(2) + '%"></i></span>' +
        '<span class="lb">' + r.t + '</span></button>';
    }).join('');
    renderPick();
  }
  function renderPick() {
    if (!out || !out.ok) return;
    var c = out.cur, r = c.rows[(picked || 1) - 1] || c.rows[0];
    var evs = A.eventsOn(out.P, r.t);
    var t = '第 ' + r.t + ' 天' + (picked ? '' : '（点柱子换一天）') + '：' + (r.pay ? '到账 ' + A.yuan(r.pay) + ' 元；' : '') + '必须花 ' + A.yuan(r.need) + ' 元' + (evs.length ? '（含' + evs.join('、') + '）' : '') +
      (r.fromRes ? '，从备用金补 ' + A.yuan(r.fromRes) + ' 元' : '') + (r.short ? '，<b style="color:var(--red)">缺 ' + A.yuan(r.short) + ' 元</b>' : '') + '；随手花 ' + A.yuan(r.disc) + ' 元；当天结束还剩 ' + A.yuan(r.bal) + ' 元' + (c.reserve ? '，备用金还剩 ' + A.yuan(r.res) + ' 元' : '') + '。';
    $('pick').innerHTML = t;
  }
  function update() {
    clearTimeout(tmr); out = A.compute(state);
    markErrors(); renderPresets(); render(); save();
  }

  function stamp() { var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function tag() { return out.ok ? A.modeShort(out.cur.mode) + (out.cur.short ? '缺' + A.yuan(out.cur.short).replace(/,/g, '') + '元' : '不缺') : '待改'; }
  $('dlCsv').addEventListener('click', function () { if (out.ok) download('生活费的给法-逐天.csv', new Blob(['\ufeff' + A.toCSV(out, stamp())], { type: 'text/csv;charset=utf-8' })); });
  $('dlMd').addEventListener('click', function () { if (out.ok) download('生活费的给法-' + tag() + '.md', new Blob([A.toMD(out, stamp())], { type: 'text/markdown;charset=utf-8' })); });
  $('dlJson').addEventListener('click', function () { download('生活费的给法-备份.json', new Blob([JSON.stringify({ app: '生活费的给法', slug: 'allowance-pace', version: 1, exported_at: stamp(), state: state }, null, 2)], { type: 'application/json' })); });
  $('impJson').addEventListener('click', function () { $('impFile').click(); });
  $('impFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { importText(String(rd.result)); }; rd.readAsText(f); this.value = ''; });
  function importText(t) {
    var s = null;
    try { var j = JSON.parse(t); s = sanitize(j && j.state ? j.state : j); } catch (e) { s = null; }
    if (!s) { $('saveTag').textContent = '· 这个文件读不出来，没改动'; return false; }
    state = s; picked = 0; fillTop(); update(); return true;
  }
  $('reset').addEventListener('click', function () { state = A.defaultState(); picked = 0; fillTop(); update(); });

  /* 结果卡 PNG 1080×1350：文字、柱子与表格取自同一次 out */
  function drawCard() {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d'), FF = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, W, H); g.fillStyle = '#ffffff'; g.fillRect(50, 50, W - 100, H - 100);
    var L = 100, Rr = W - 100, maxW = Rr - L, y = 145;
    function font(size, bold) { g.font = (bold ? '700 ' : '') + size + 'px ' + FF; }
    function clip(t, w) { t = String(t); if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
    function wrap(t, size, color, bold, lim) {
      font(size, bold); g.fillStyle = color; var cur = '', n = 0;
      var toks = String(t).match(/[0-9.,]+ ?(?:元|天|次)?[）)。，、；：]?|[（(「]?[A-Za-z]+[）)」。，、；：]?|[（(「]?[^\s（(「][）)」。，、；：]?|\s/g) || [];
      for (var i = 0; i < toks.length; i++) { var ch = toks[i]; if (g.measureText(cur + ch).width > maxW && cur) { if (lim && ++n >= lim) { g.fillText(clip(cur + '…', maxW), L, y); y += size * 1.45; return; } g.fillText(cur, L, y); y += size * 1.45; cur = ch.trim() ? ch : ''; } else cur += ch; }
      if (cur) { g.fillText(cur, L, y); y += size * 1.45; }
    }
    font(54, true); g.fillStyle = '#22201b'; g.fillText('生活费的给法', L, y); y += 54;
    if (!out.ok) { font(42, true); g.fillStyle = '#b03a2e'; g.fillText('还算不了', L, y + 20); y += 90; out.errors.slice(0, 7).forEach(function (e) { wrap('· ' + e.message, 28, '#514c42', false, 2); y += 8; }); y += 30; wrap('改好标红的地方，会自动重算。', 26, '#857f73'); return cv; }
    var o = out, P = o.P, c = o.cur;
    font(26); g.fillStyle = '#857f73'; g.fillText(clip('一个月 ' + A.yuan(Math.round(P.total * 100)) + ' 元 · ' + P.days + ' 天 · 每天必须 ' + A.yuan(Math.round(P.fixed * 100)) + ' 元 · 冲动 ' + A.fmt(P.k, 2) + (c.reserve ? ' · 备用 ' + A.yuan(c.reserve) + ' 元' : ''), maxW), L, y); y += 54;
    wrap(A.headline(o), 34, o.level === 'short' ? '#b03a2e' : '#2d6a4f', true, 3); y += 10;
    /* 逐天柱 */
    var top = y, ch = 230, n = c.rows.length, cw = maxW / n, mx = 1;
    c.rows.forEach(function (r) { mx = Math.max(mx, r.bal + r.disc); });
    c.rows.forEach(function (r, i) {
      var x = L + i * cw;
      if (r.short > 0) { g.fillStyle = '#f6d6d0'; g.fillRect(x + 1, top, cw - 2, ch); }
      var hb = r.bal / mx * ch, hd = r.disc / mx * ch; if (r.short === 0 && r.disc === 0) hb = Math.max(hb, 6); /* 只够吃饭且手上 0 元的天也要看得见 */
      g.fillStyle = r.short > 0 ? '#b03a2e' : r.disc === 0 ? '#d9a441' : '#5b8c6e'; g.fillRect(x + 1, top + ch - hb, cw - 2, hb);
      g.fillStyle = '#c7d8cc'; g.fillRect(x + 1, top + ch - hb - hd, cw - 2, hd);
      if (r.pay) { font(18, true); g.fillStyle = '#3b5b92'; g.textAlign = 'center'; g.fillText('¥', x + cw / 2, top - 6); g.textAlign = 'left'; }
    });
    font(18); g.fillStyle = '#857f73'; g.fillText('第 1 天', L, top + ch + 26); g.textAlign = 'right'; g.fillText('第 ' + n + ' 天', Rr, top + ch + 26); g.textAlign = 'left';
    y = top + ch + 70;
    /* 四种给法表 */
    font(24, true); g.fillStyle = '#514c42'; g.fillText('四种给法', L, y); y += 40;
    var cols = [L + 14, L + 250, L + 470, L + 690];
    font(20); g.fillStyle = '#857f73'; ['给法', '缺口', '缺钱的天', '要留备用金'].forEach(function (h, i) { g.fillText(h, cols[i], y); }); y += 40;
    o.runs.forEach(function (r) {
      var need = r.short > 0 ? A.reserveNeeded(P, r.mode) : 0;
      if (r.mode === c.mode) { g.fillStyle = '#fff3d6'; g.fillRect(L, y - 32, maxW, 46); }
      font(24, r.mode === c.mode); g.fillStyle = '#22201b'; g.fillText(A.modeName(r.mode), cols[0], y);
      g.fillStyle = r.short > 0 ? '#b03a2e' : '#2d6a4f'; g.fillText(r.short > 0 ? A.yuan(r.short) + ' 元' : '不缺', cols[1], y);
      g.fillStyle = '#22201b'; g.fillText(String(r.shortDays), cols[2], y);
      g.fillText(r.short === 0 ? '不用' : need == null ? '留多少都不够' : '至少 ' + A.fmt(need) + ' 元', cols[3], y);
      y += 52;
    });
    y += 14;
    wrap(A.explain(o), 24, '#514c42', false, 4); y += 12;
    o.actions.slice(0, 3).forEach(function (ac) { if (y < H - 220) { wrap('改法：' + ac.text, 25, '#8a5a12', false, 2); y += 4; } });
    y = H - 130;
    wrap('逐天模拟：先付必须的，再按「冲动 × 富余 ÷ 到下次到账还剩几天」随手花。花得多快是假设；默认金额与开销为虚构示例。', 20, '#857f73', false, 2);
    return cv;
  }
  $('dlPng').addEventListener('click', function () { drawCard().toBlob(function (bl) { if (bl) download('生活费的给法-' + tag() + '-1080x1350.png', bl); }, 'image/png'); });

  window.__apUi = { state: function () { return clone(state); }, out: function () { return out; }, importText: importText, drawCard: drawCard, storageKey: KEY };
  fillTop(); update();
})();
