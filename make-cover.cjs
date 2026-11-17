/* 封面 cover.svg（1200×1200），读数与柱子来自 core.js 同一次 compute；再用浏览器截成 cover.png。 */
const fs = require('node:fs');
const A = require('./core.js');
const o = A.compute(A.defaultState());
if (!o.ok || o.cur.short !== 19520) throw new Error('默认场景不对');
const F = "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
const m = Object.fromEntries(o.runs.map((r) => [r.mode, r]));
let bars = ''; const c = o.cur, n = c.rows.length, x0 = 140, W = 920, cw = W / n, top = 360, ch = 290;
let mx = 1; c.rows.forEach((r) => { mx = Math.max(mx, r.bal + r.disc); });
c.rows.forEach((r, i) => {
  const x = x0 + i * cw, hb = Math.max(r.short === 0 && r.disc === 0 ? 6 : 0, r.bal / mx * ch);
  if (r.short > 0) bars += `<rect x="${x + 2}" y="${top}" width="${cw - 4}" height="${ch}" fill="#f6d6d0"/>`;
  bars += `<rect x="${x + 2}" y="${top + ch - hb}" width="${cw - 4}" height="${hb}" fill="${r.short > 0 ? '#b03a2e' : r.disc === 0 ? '#d9a441' : '#5b8c6e'}"/>`;
});
let rows = '';
[['month', '按月给'], ['half', '按半月给'], ['week', '按周给'], ['day', '按天给']].forEach(([k, nm], i) => {
  const x = 140 + i * 235;
  rows += `<text x="${x}" y="800" font-family="${F}" font-size="34" fill="#514c42">${nm}</text><text x="${x}" y="870" font-family="${F}" font-size="50" font-weight="800" fill="#b03a2e">${A.yuan(m[k].short)}</text>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#f3f1ec"/>
  <rect x="60" y="60" width="1080" height="1080" rx="18" fill="#ffffff"/>
  <text x="140" y="215" font-family="${F}" font-size="120" font-weight="800" fill="#22201b">生活费的给法</text>
  <text x="140" y="295" font-family="${F}" font-size="40" fill="#514c42">按月、按半月、按周还是按天给，哪天开始缺钱</text>
  ${bars}
  <text x="140" y="735" font-family="${F}" font-size="30" fill="#857f73">一个月 2,000 元，四种给法这个月缺多少（元）</text>
  ${rows}
  <text x="140" y="980" font-family="${F}" font-size="32" fill="#8a5a12">按月给时先单独留 ${A.reserveNeeded(o.P, 'month')} 元备用，缺口变 0</text>
  <text x="140" y="1095" font-family="${F}" font-size="24" fill="#857f73">逐天模拟 · 花钱快慢是假设 · 金额与开销为虚构示例</text>
</svg>`;
fs.writeFileSync('cover.svg', svg);
fs.writeFileSync('/tmp/cover97.html', '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body>' + svg + '</body></html>');
console.log('cover.svg', svg.length);
