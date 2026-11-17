'use strict';
/* 注入测试：对 core.js 做一处小改动，看核心测试能不能抓到。跑完自动还原。 */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const F=path.join(__dirname,'../core.js'),src=fs.readFileSync(F,'utf8');
/* 首轮 25/32。没抓到的 7 个：days 下限、lastWeek 窗口 → 补测；「备用金从 0 试」「x > 已留」「k > 1」三个守卫经分析是多余的（reserveNeeded 只在已缺时调用，已缺说明现有备用金不够、0 也不够；k 改法后面还有「r1.short < cur.short 才列」兜底），minBal 没有被任何输出用到，shortDays 并列规则实际碰不到 → 这 5 处直接从 core.js 删掉，变异一并删除。 */
const M=[
["if (best.short < cur.short) {","if (better(best, cur)) {"],
["(gapAll > 0 ?","(gapAll >= 0 ?"],
["return [r.short, r.pays.length];","return [r.short, -r.pays.length];"],
["Math.floor(allowFen * len / D)","Math.round(allowFen * len / D)"],
["if (mode === 'half') r = [1, 16];","if (mode === 'half') r = [1, 15];"],
["var a = i + 1 < pd.length ?","var a = true ?"],
["for (var u = t + 1; u < next; u++) held += plan[u];","for (var u = t + 1; u <= D; u++) held += plan[u];"],
["for (var u = t + 1; u < next; u++) held += plan[u];",""],
["if (e.known) plan[e.day] += fen(e.amt);","plan[e.day] += fen(e.amt);"],
["var surplus = B - fixedF * (L - 1) - held","var surplus = B - fixedF * L - held"],
["Math.floor(k100 * surplus / (100 * L))","Math.round(k100 * surplus / (100 * L))"],
["Math.min(surplus, Math.floor(","Math.max(0, Math.floor("],
["(100 * L)","(100 * (L + 1))"],
["var fr = Math.min(R, gap); R -= fr; gap -= fr;","var fr = 0;"],
["paid = Math.min(B, needF)","paid = needF"],
["else if (disc === 0) { tot.tightDays++;","if (disc === 0) { tot.tightDays++;"],
["if (pi < pd.length && pd[pi] === t)","if (pi < pd.length && pd[pi] <= t + 1)"],
["if (x[i] !== y[i]) return x[i] < y[i];","if (x[i] !== y[i]) return x[i] > y[i];"],
["if (r1.short < cur.short) acts.push","acts.push"],
["P.days = need(st.days, 'days', 28, 31,","P.days = need(st.days, 'days', 1, 31,"],
["P.k = need(st.k, 'k', 0.5, 3,","P.k = need(st.k, 'k', 0, 30,"],
["if (isFinite(P.reserve) && isFinite(P.total) && P.reserve > P.total)","if (false)"],
["day: need(e.day, 'eday' + i, 1, D,","day: need(e.day, 'eday' + i, 1, 31,"],
["st.events.slice(0, MAX_EVENTS)","st.events.slice(0)"],
["if (/^[=+\\-@]/.test(x)) x = \"'\" + x;",""],
["replace(/[,，\\s]/g, '')","replace(/[，\\s]/g, '')"],
["(c ? '.' + (c < 10 ? '0' : '') + c : '')","(c ? '.' + c : '')"],
["wk(D - 6, D)","wk(D - 7, D)"],
["if (!intOnly && Math.abs(Math.round(x * 100) - x * 100) > 1e-6)","if (false)"],
["(ev.length ? '（' + ev.join('、') + '）' : '')","''"],
];
let caught=0;const rows=[];
for(const [a,b] of M){
  if(src.indexOf(a)<0){rows.push('✗ 找不到原文：'+a.slice(0,80));continue;}
  fs.writeFileSync(F,src.replace(a,b));
  let ok=true;try{execFileSync('node',['--test',path.join(__dirname,'core.test.cjs')],{stdio:'pipe',timeout:120000});}catch(e){ok=false;}
  rows.push((ok?'✗ 没抓到':'✓ 抓到')+'：'+a.slice(0,70).replace(/\n/g,'⏎')+' → '+b.slice(0,70).replace(/\n/g,'⏎'));if(!ok)caught++;
}
fs.writeFileSync(F,src);
console.log(rows.join('\n'));console.log('合计 '+caught+'/'+M.length);
