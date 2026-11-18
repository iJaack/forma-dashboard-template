// Nutrition estimate per diary entry and per day. Pure functions (unit-tested); reference tables in nut_ref.js (window.NUTREF, generic data only).
// Rules: macros come from the diary values as logged; micronutrients only from entries whose items carry quantities (or explicit label values).
// An entry without items or explicit nutrients is "stima mancante": nothing is invented for it.
(function(){'use strict';var R=window.NUTREF,N=window.NUT={};if(!R)return;
var KEYS=R.keys,MAC=['kcal','protein','carbs','fat'];
function add(a,k,v){a[k]=(a[k]||0)+v;}
// one entry -> {v:{nutrient:amount}, supp:{nutrient:amount from supplements}, miss:{nutrient:true} (some item lacks it), cov:'full'|'partial'|'none', unmatched:[names], supps:[{s,n,g}]}
N.entry=function(e){var items=Array.isArray(e.items)?e.items:null,o={v:{},supp:{},miss:{},cov:'none',unmatched:[],supps:[],c:{},est:false};
  if(!items||!items.length){o.unmatched.push(e.title||'voce senza nome');}
  else{var ok=0;items.forEach(function(it){
    if(it.f&&R.foods[it.f]&&it.g!=null){var f=R.foods[it.f];ok++;o.est=true;KEYS.forEach(function(k){var p=f.per100[k];if(p==null){o.miss[k]=true;return}add(o.v,k,p*it.g/100);(o.c[k]||(o.c[k]=[])).push([f.name,p*it.g/100,f.src[k]]);});}
    else if(it.s&&R.supps[it.s]){var s=R.supps[it.s],q=s.per==='g'?(it.g!=null?it.g:null):(it.n!=null?it.n:it.g!=null?null:1);if(q==null){o.unmatched.push(it.label||s.name);return}ok++;
      o.supps.push({s:it.s,n:s.per==='g'?null:q,g:s.per==='g'?q:null});for(var k in s.v){add(o.v,k,s.v[k]*q);add(o.supp,k,s.v[k]*q);(o.c[k]||(o.c[k]=[])).push([s.name,s.v[k]*q,'etichetta']);}}
    else o.unmatched.push(it.x||it.label||it.f||it.s||'voce');});
    o.cov=ok&&!o.unmatched.length?'full':ok?'partial':'none';}
  if(e.nutrients&&typeof e.nutrients==='object'){for(var k in e.nutrients)if(KEYS.indexOf(k)>=0&&isFinite(e.nutrients[k])){o.v[k]=+e.nutrients[k];delete o.miss[k];}if(o.cov==='none'){o.cov='full';o.unmatched=[];}}
  // macros as logged in the diary win over the reference estimate
  MAC.forEach(function(k){if(e[k]!=null&&isFinite(e[k]))o.v[k]=+e[k];});
  return o;};
// one day: totals and quality flags
N.day=function(entries,day){var E=(entries||[]).filter(function(e){return e&&e.day===day}),con={},t={},supp={},miss={},mac={},unmatched=[],supps={},kAll=0,kCov=0,nNone=0,nPart=0;
  E.forEach(function(e){var r=N.entry(e);for(var ck in r.c)r.c[ck].forEach(function(x){var m=con[ck]||(con[ck]={}),id=x[0]+'|'+x[2];m[id]=(m[id]||0)+x[1];});KEYS.forEach(function(k){if(r.v[k]!=null)add(t,k,r.v[k]);if(r.supp[k])add(supp,k,r.supp[k]);if(r.miss[k])miss[k]=true;});
    MAC.forEach(function(k){if(e[k]==null&&r.cov!=='full')mac[k]=true;}); // macro not logged and not fully estimated -> day value is a lower bound
    if(r.cov!=='full'){r.cov==='none'?nNone++:nPart++;r.unmatched.forEach(function(u){unmatched.push({day:day,time:e.time||null,title:e.title||'',item:u,partial:r.cov==='partial'})});}
    var kc=e.kcal!=null?+e.kcal:0;kAll+=kc;if(r.cov==='full')kCov+=kc;
    r.supps.forEach(function(s){var a=supps[s.s]||(supps[s.s]={s:s.s,n:0,g:0,times:[]});a.n+=s.n||0;a.g+=s.g||0;a.times.push(e.time||'');});});
  // EPA+DHA combined (EFSA reference)
  if(t.epa!=null||t.dha!=null)t.epa_dha=(t.epa||0)+(t.dha||0);if(supp.epa||supp.dha)supp.epa_dha=(supp.epa||0)+(supp.dha||0);if(miss.epa||miss.dha)miss.epa_dha=true;
  var top={};for(var k2 in con)top[k2]=Object.keys(con[k2]).map(function(id){var p=id.split('|');return {name:p[0],src:p[1],v:con[k2][id]}}).sort(function(a,b){return b.v-a.v});
  return {day:day,n:E.length,top:top,tot:t,supp:supp,miss:miss,macPartial:mac,unmatched:unmatched,supps:supps,nNone:nNone,nPart:nPart,kcalCovered:kAll?kCov/kAll:null,partial:nNone+nPart>0};};
// % of reference: NRV (Reg. UE 1169/2011) or the stated reference for fibre / EPA+DHA / sodium
N.ref=function(k){if(R.nrv[k]!=null)return {v:R.nrv[k],src:'NRV Reg. UE 1169/2011'};if(R.refs[k])return {v:R.refs[k].v,src:R.refs[k].src};return null;};
N.pct=function(k,v){var r=N.ref(k);return r&&v!=null?v/r.v*100:null;};
// macro split: grams and % of kcal (4/4/9); null when kcal is missing
N.macros=function(tot){var k=tot.kcal;if(!k)return null;var p=(tot.protein||0)*4,c=(tot.carbs||0)*4,f=(tot.fat||0)*9;
  return {kcal:k,protein:{g:tot.protein,pct:p/k*100},carbs:{g:tot.carbs,pct:c/k*100},fat:{g:tot.fat,pct:f/k*100}};};
// supplements vs plan: [{s, label, want:{n|g}, got:{n|g}, ok}]
N.suppStatus=function(plan,supps){return (plan||[]).map(function(p){var g=supps[p.s],per=R.supps[p.s]&&R.supps[p.s].per,want=per==='g'?p.g:p.n,got=g?(per==='g'?g.g:g.n):0;
  return {s:p.s,label:p.label||(R.supps[p.s]&&R.supps[p.s].name)||p.s,unit:per==='g'?'g':'',want:want,got:got,ok:want!=null?got>=want:got>0,optional:!!p.optional,times:g?g.times:[]};});};
// per-day history (cheap): [{day,kcal,protein,fiber,cover}]
N.history=function(entries){var days={};(entries||[]).forEach(function(e){if(e&&e.day)days[e.day]=1});return Object.keys(days).sort().map(function(d){var x=N.day(entries,d);return {day:d,kcal:x.tot.kcal,protein:x.tot.protein,fiber:x.tot.fiber,cover:x.kcalCovered,partial:x.partial,x:x};});};
N.R=R;})();
