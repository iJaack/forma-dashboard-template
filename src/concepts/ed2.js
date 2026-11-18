// Concept "rivista" / "indice" — the container must be earned: data stand open on the calm gradient (hairlines, big numbers, full-width charts);
// glass only for navigation, detail sheets, tooltips, "Stato di forma" and the 30-day projection. Scroll moves the background and the
// decorative numerals, never the data. Charts draw once on enter (600 ms ease-out). No new formulas: CX.model / LG.derive / LG.project.
(function(){'use strict';var CX=window.CX,LG=window.LG,F=CX.F,it=CX.it,NA=CX.NA,esc=F.esc,A=window.CA,B=window.CB;
var E2=window.E2={};
// ---------------- pure helpers (unit-tested) ----------------
// chapter columns: 1 below 1920, 2 from 1920, 3 from 2560
E2.cols=function(w){return w>=2560?3:w>=1920?2:1;};
// motion budget: parallax / sticky only from 768 px and without reduced motion
E2.motion=function(w,reduced){return {parallax:!reduced&&w>=768,sticky:w>=768};};
// meals: today's entries if any, else the most recent earlier day; sorted by time; null when the diary is empty
E2.meals=function(entries,today){var E=(entries||[]).filter(function(m){return m&&m.day&&m.day<=today});if(!E.length)return null;
  var day=E.some(function(m){return m.day===today})?today:E.map(function(m){return m.day}).sort().pop(),rows=E.filter(function(m){return m.day===day}).slice().sort(function(a,b){return (a.time||'99').localeCompare(b.time||'99')});
  var sum=function(k){var v=rows.filter(function(m){return m[k]!=null});return v.length?v.reduce(function(a,m){return a+m[k]},0):null};
  return {day:day,isToday:day===today,rows:rows,kcal:sum('kcal'),protein:sum('protein')};};
// meals of exactly one day (past days never fall back to another day)
// % of reference, compact: ≥1000% → '2,7k%' / '12k%' so the column never clips
E2.pc=function(p){if(p==null||!isFinite(p))return '';var r=Math.round(p);if(r<1000)return r+'%';var k=r/1000;return (k<10?(Math.floor(k*10)/10).toFixed(1).replace('.',','):String(Math.floor(k)))+'k%'};
// short landscape (<500 px tall): the day bar goes below the energy chart so hero + bars fit the first screen
E2.navLow=function(h){return h<500};
E2.mealsOn=function(entries,day,today){var rows=(entries||[]).filter(function(m){return m&&m.day===day}).sort(function(a,b){return (a.time||'99').localeCompare(b.time||'99')});if(!rows.length)return null;
  var sum=function(k){var v=rows.filter(function(m){return m[k]!=null});return v.length?v.reduce(function(a,m){return a+m[k]},0):null};return {day:day,isToday:day===today,rows:rows,kcal:sum('kcal'),protein:sum('protein')};};
// ?date=YYYY-MM-DD -> a real calendar day within [min, max]; anything else -> max (today)
E2.dayParam=function(search,min,max){var m=/[?&]date=(\d{4}-\d\d-\d\d)(?:&|$)/.exec(search||'');if(!m)return max;var t=Date.parse(m[1]+'T12:00:00Z');if(!t||new Date(t).toISOString().slice(0,10)!==m[1])return max;return m[1]<min?min:m[1]>max?max:m[1];};
// recent-days strip: 7 days ending at min(today, day+3)
E2.strip=function(day,today,addDays){var end=addDays(day,3);if(end>today)end=today;var o=[];for(var i=6;i>=0;i--)o.push(addDays(end,-i));return o;};
// alerts from real data states only (never invented): missing meals, low-confidence projection, dropped energy days, old sync
E2.alerts=function(o){var a=[];
  if(!o.mealsToday)a.push(['info','Diario','nessun pasto registrato oggi: le kcal che restano non si possono calcolare']);
  if(o.pjLow)a.push(['warn','Proiezione','molto indicativa: '+o.pjN+(o.pjN===1?' pesata':' pesate')+' in 90 giorni']);
  if(o.dropped>0)a.push(['info','Energia',o.dropped+(o.dropped===1?' giorno scartato':' giorni scartati')+' perché incoerenti']);
  if(o.ingestAt&&o.now&&(o.now-Date.parse(o.ingestAt))>36*36e5)a.push(['warn','Apple Salute','ultima sincronizzazione il '+new Date(o.ingestAt).toLocaleDateString('it-IT',{timeZone:F.userTz(),day:'numeric',month:'numeric'})]);
  return a;};
// energy balance = eaten − burned (same definition as CX.model rows.bal); |x| < 50 kcal = "In pari"
E2.balWord=function(x,thr){thr=thr==null?50:thr;if(x==null||!isFinite(x))return null;var a=Math.abs(x);return a<thr?{k:'pari',label:'In pari',v:Math.round(a)}:x<0?{k:'deficit',label:'Deficit',v:Math.round(a)}:{k:'surplus',label:'Surplus',v:Math.round(a)};};
// mean balance over complete days only (rows.bal is null when burned is incomplete/discarded or the diary is missing)
E2.avgBal=function(rows){var v=(rows||[]).filter(function(r){return r&&r.full&&r.bal!=null&&isFinite(r.bal)}).map(function(r){return r.bal});return {mean:v.length?v.reduce(function(a,b){return a+b},0)/v.length:null,n:v.length,of:(rows||[]).length};};
if(!document.getElementById('app'))return; // test context
// ---------------- page ----------------
var $=LG.$,$$=LG.$$,app=document.getElementById('app'),VAR=document.body.dataset.v==='indice'?'indice':'rivista',M,d,PJ,wPer='90',PW=90,VD=null;
var SK=[['deep','Profondo','#5e5ce6'],['core','Core','#64d2ff'],['rem','REM','#bf5af2']];
LG.DRAW_MS=600;LG.DRAW_EASE='ease-out';CX.ENTER_MS=600;
var V=function(v,u,dec,fmt){return A.V(v,u,dec,fmt)};
function when(day){return day===M.today?'oggi':day===F.addDays(M.today,-1)?'ieri':F.dlabel(day,true);}
function sg(v,dec){return LG.sgn(v,dec==null?1:dec).replace('-','−');}
function prange(r){return F.dshort(r.from)+(r.to!==r.from?'–'+F.dshort(r.to):'');}
function tap(k,label){return ' data-k="'+k+'" tabindex="0" role="button" aria-label="'+esc(label)+': apri dettaglio"';}
function head(i,id,name,q,lede){var n='0'+(i+1);return '<header class="ct"><span class="deco" aria-hidden="true">'+n+'</span><div class="eb"><b class="num">'+n+'</b> '+name+(i===0?' · '+F.dlabel(VD||M.today,true):'')+'</div><h2 class="qq" id="t-'+id+'">'+q+'</h2>'+(lede?'<p class="lede">'+esc(lede)+'</p>':'')+'</header>';}
function hero(k,label,num,cmp,side){var h='<div class="hm"'+tap(k,label)+'><div class="lab">'+label+'</div><div class="big">'+num+'</div><p class="cmp">'+cmp+'</p></div>';return side?'<div class="hero h2"><div class="hc">'+h+side+'</div></div>':'<div class="hero">'+h+'</div>';}
function sec(k,label,num,cmp,viz){return '<div class="cell"'+(k?tap(k,label):'')+'><div class="lab">'+label+'</div><div class="mid">'+num+'</div><p class="cmp">'+cmp+'</p>'+(viz?'<div class="viz" data-v="'+viz+'"></div>':'')+'</div>';}
function fig(k,label,cap,c,cls){return '<figure class="fig'+(cls?' '+cls:'')+'"'+tap(k,label)+'><figcaption>'+cap+'</figcaption><div class="cbox" data-c="'+c+'"></div></figure>';}
function grp(title,inner,cls){return '<div class="grp fx'+(cls?' '+cls:'')+'"><h3 class="lab">'+title+'</h3>'+inner+'</div>';}
// ---- projection data (same as the main page) ----
function projData(){var D=M.D,hk=function(k){return (D.hk&&D.hk[k])||[]};
  var W=LG.dailyMean([hk('body_mass.last'),D.days.filter(function(x){return x.weight_kg!=null}).map(function(x){return [x.day,x.weight_kg]})]),wm={};W.forEach(function(p){wm[p[0]]=p[1]});
  var FAT=LG.dailyMean([hk('body_fat_mass.last'),hk('body_fat_percentage.last').map(function(p){return wm[p[0]]!=null&&p[1]!=null?[p[0],wm[p[0]]*(p[1]>1?p[1]/100:p[1])]:null}).filter(Boolean)]);
  var LEAN=LG.dailyMean([hk('lean_body_mass.last')]);
  var lastOf=function(a){a=a.filter(function(p){return p&&p[1]!=null&&p[0]<=M.today});return a.length?a[a.length-1]:null};
  return {w:LG.project(W,M.today,{window:PW}),f:LG.project(FAT,M.today,{window:PW}),l:LG.project(LEAN,M.today,{window:PW}),lastF:lastOf(FAT),lastL:lastOf(LEAN)};}
// ---------------- nutrients (diary + reference tables; nut.js) ----------------
var MIC=[['Vitamine',[['vitA','Vitamina A'],['vitD','Vitamina D'],['vitE','Vitamina E'],['vitK','Vitamina K'],['vitC','Vitamina C'],['vitB1','B1 tiamina'],['vitB2','B2 riboflavina'],['vitB3','B3 niacina'],['vitB5','B5 ac. pantotenico'],['vitB6','Vitamina B6'],['folate','Folati'],['vitB12','Vitamina B12']]],
  ['Minerali e altro',[['potassium','Potassio'],['calcium','Calcio'],['magnesium','Magnesio'],['iron','Ferro'],['zinc','Zinco'],['selenium','Selenio'],['sodium','Sodio (limite)'],['epa_dha','Omega 3 EPA+DHA']]]];
function nf(v,u){if(v==null)return NA;var a=Math.abs(v),d=u==='g'?(a<1?2:a<10?1:0):a<1?2:a<10?1:0;return (Math.round(v*Math.pow(10,d))/Math.pow(10,d)).toLocaleString('it-IT');}
function nutri(ml){var N=window.NUT;if(!N||!N.R)return '';var E=M.D.meals&&M.D.meals.entries||[],R=N.R;
  if(!ml)ml={day:VD||M.today,isToday:!VD||VD===M.today};
  var x=N.day(E,ml.day),yd=F.addDays(ml.day,-1),y=E.some(function(e){return e.day===yd})?N.day(E,yd):null,tg=F.targetFor(M.D,ml.day,M.today),U=R.units;
  var attrs=function(m){return ' role="'+m.role+'"'+(m.role==='meter'?' aria-label="'+esc(m.ariaText.split(/[ :]/)[0])+'" aria-valuemin="0" aria-valuemax="'+m.max+'" aria-valuenow="'+m.now+'" aria-valuetext="'+esc(m.ariaText)+'"':' aria-label="'+esc(m.ariaText)+'"');};
  var km=F.kcalBarModel({consumed:x.tot.kcal,target:tg&&tg.kcal.value,estimated:tg&&tg.estimated,dayLabel:tg&&tg.type?(LG.TYPES[tg.type]||tg.type).toLocaleLowerCase('it-IT'):''});
  var kcal='<div class="kcal-progress"'+attrs(km)+'><div class="kcal-heading"><span class="kcal-value">'+km.value+'</span> <span class="kcal-target">/ '+km.targetText+'</span></div>'+
    '<div class="kcal-track" aria-hidden="true"><div class="kcal-clip"><i class="kcal-fill" style="--fill:'+km.fill+'"></i>'+(km.striped?'<i class="kcal-over" style="left:'+km.striped.start*100+'%;width:'+km.striped.length*100+'%;--fill:1"></i>':'')+'</div>'+
    (km.tick!=null?'<i class="kcal-tick'+(km.dashed?' estimated':'')+'" style="left:'+km.tick*100+'%"></i>':'')+'</div>'+
    '<p class="progress-status">'+km.status+'</p>'+(km.estimateLabel?'<p class="progress-target">'+esc(km.estimateLabel)+'</p>':'')+'</div>';
  var cell=function(k,lab,sub){var t=k==='fiber'?{value:F.MACRO_TARGETS.fiber}:tg&&tg[k],m=F.macroProgress({label:lab,consumed:x.tot[k],target:t,partial:x.macPartial[k],estimated:k!=='fiber'&&tg&&tg.estimated}),off=100*(1-m.fill);
    var circle=function(cls,extra){return '<circle class="'+cls+'" cx="28" cy="28" r="25" pathLength="100"'+(extra||'')+'/>';};
    var ring='<svg class="macro-ring" aria-hidden="true" focusable="false">'+circle('macro-track'+(m.dotted?' dotted':''),m.dotted?' stroke-dasharray="1 5"':'')+
      (m.band?circle('macro-band',' stroke-dasharray="'+m.band.length*100+' '+(100-m.band.length*100)+'" stroke-dashoffset="'+(-m.band.start*100)+'"'):'')+
      (m.fill>0?circle('macro-fill',' stroke-dasharray="100" style="--offset:'+off+';stroke-dashoffset:'+off+'"'):'')+(m.halo?circle('macro-halo'):'')+'</svg>';
    return '<li data-macro="'+k+'"'+attrs(m)+'>'+ring+'<div class="macro-copy"><div class="macro-heading"><span class="nl">'+lab+'</span><span class="nv num">'+(m.dotted?'<span class="na">—</span>':m.value)+'</span></div>'+
      '<span class="progress-status">'+m.status.replace(/(\d[\d.,]* g)/g, '<span class="progress-number">$1</span>')+'</span><span class="progress-target">'+m.targetLine.replace(/^(range |obiettivo )(.+)$/, '$1<span class="progress-number">$2</span>')+'</span>'+(sub?'<span class="progress-target">'+sub+'</span>':'')+'</div></li>';};
  var mac='<div class="target-progress">'+kcal+'<ul class="nmac">'+cell('protein','Proteine')+
    cell('fat','Grassi',x.tot.satfat!=null?'di cui saturi ~'+nf(x.tot.satfat,'g')+' g':'')+
    cell('carbs','Carboidrati',x.tot.sugars!=null?'di cui zuccheri ~'+nf(x.tot.sugars,'g')+' g':'')+cell('fiber','Fibre')+'</ul></div>'+
    (x.macPartial.protein||x.macPartial.carbs||x.macPartial.fat?'<p class="note sm">Valori minimi (≥): nutrienti non registrati per alcune voci.</p>':'');
  // supplements vs plan (plan from D1, never from the repo)
  var plan=M.D.meals&&M.D.meals.supp_plan,ss=N.suppStatus(plan,x.supps),extra=Object.keys(x.supps).filter(function(k){return !(plan||[]).some(function(p){return p.s===k})});
  var sup=plan?'<p class="sup"><span class="lab">Integratori '+(ml.isToday?'di oggi':F.dshort(ml.day))+'</span> '+ss.map(function(q){var u=q.unit==='g'?' g':'';return '<span class="si'+(q.ok?' ok':q.optional?' opt':'')+'" title="'+esc(q.label+(q.times.length?' · registrato alle '+q.times.join(', '):' · non registrato')+(q.optional?' · al bisogno':''))+'">'+esc(q.label)+' <b class="num">'+nf(q.got)+'/'+(q.want!=null?nf(q.want):'—')+u+'</b>'+(q.ok?' ✓':'')+'</span>'}).join('')+
      extra.map(function(k){var a=x.supps[k],s=R.supps[k];return '<span class="si ok">'+esc(s.name)+' <b class="num">'+(s.per==='g'?nf(a.g)+' g':nf(a.n))+'</b></span>'}).join('')+'</p>':
    '<p class="sup"><span class="lab">Integratori</span> '+(Object.keys(x.supps).length?Object.keys(x.supps).map(function(k){var a=x.supps[k],s=R.supps[k];return '<span class="si ok">'+esc(s.name)+' <b class="num">'+(s.per==='g'?nf(a.g)+' g':nf(a.n))+'</b></span>'}).join(''):'<span class="si">nessuno registrato</span>')+'</p>';
  // micronutrient table
  var row=function(k,lab){var v=x.tot[k],u=k==='epa_dha'?'g':U[k],p=N.pct(k,v),r=N.ref(k),sp=x.supp[k]||0,part=x.miss[k]||x.partial,yp=y?N.pct(k,y.tot[k]):null,lim=k==='sodium';
    var top=(k==='epa_dha'?(x.top.epa||[]).concat(x.top.dha||[]):(x.top[k]||[])).slice(0,4).map(function(c){return c.name+' '+nf(c.v,u)+' '+u+' ('+c.src+')'}).join('; ');
    var tip=lab+(r?' · riferimento '+(r.v*(k==='epa_dha'?1000:1)).toLocaleString('it-IT')+(k==='epa_dha'?' mg':' '+u)+' ('+r.src+')':'')+(sp?' · da integratori '+nf(sp,u)+' '+u:'')+(top?' · principali fonti: '+top:'')+(x.miss[k]?' · alcuni alimenti non hanno questo valore in tabella':'')+(x.nNone?' · '+x.nNone+(x.nNone===1?' voce':' voci')+' senza stima':'');
    var w=p!=null?Math.min(100,p):0,sw=p!=null&&v?Math.min(w,w*sp/v):0;
    return '<li title="'+esc(tip)+'"><span class="nl">'+lab+(sp?'<i class="sd" aria-label="con integratori"></i>':'')+'</span><span class="nv num">'+(v!=null?(part?'≥ ':v-sp>1e-9?'~':'')+nf(v,u)+' <span class="u">'+u+'</span>':NA)+'</span>'+
      '<span class="nb'+(lim?' lim':'')+'" aria-hidden="true"><i style="width:'+w.toFixed(1)+'%"></i>'+(sw?'<i class="s" style="width:'+sw.toFixed(1)+'%"></i>':'')+'</span><span class="np num"'+(p!=null&&p>=1000?' title="'+it(p)+'%"':'')+'>'+(p!=null?E2.pc(p):'')+'</span><span class="ny num">'+(yp!=null?((y.miss[k]||y.partial)?'≥\u2009':'')+E2.pc(yp):'')+'</span></li>'};
  var head='<li class="hd"><span class="nl"></span><span class="nv">'+(ml.isToday?'oggi':F.dshort(ml.day))+'</span><span class="nb"></span><span class="np">% rif.</span><span class="ny">'+(y?(yd===F.addDays(M.today,-1)?'ieri':F.dshort(yd)):'')+'</span></li>';
  var mic='<div class="mic">'+MIC.map(function(g){return '<ol class="hr nmic"><li class="gh"><span>'+g[0]+'</span></li>'+head+g[1].map(function(r){return row(r[0],r[1])}).join('')+'</ol>'}).join('')+'</div>';
  // quality / sources
  var cov=x.kcalCovered,miss=x.unmatched.filter(function(u){return !u.partial}).map(function(u){return u.item}),part=x.unmatched.filter(function(u){return u.partial}).map(function(u){return u.item});
  var q='<p class="note sm nq"><i class="sd"></i> con integratori (valori di etichetta) · ~ stima da tabelle · ≥ valore minimo (voci o valori mancanti) · % rif. = NRV Reg. UE 1169/2011 (adulti); sodio = limite OMS 2 g; EPA+DHA = EFSA 250 mg.<br>'+
    'Stima su <b>'+(cov!=null?it(cov*100)+'%':NA)+'</b> delle kcal registrate'+(miss.length?' · <b>stima mancante</b>: '+esc(miss.join('; ')):'')+(part.length?' · non stimati: '+esc(part.join('; ')):'')+
    ' · <span title="'+esc('Alimenti: '+R.sources.CREA+' (prima scelta) e '+R.sources.USDA+' per i valori mancanti; integratori: etichette dei produttori; riferimenti: '+R.sources.NRV+', EFSA, OMS.')+'">fonti: CREA, USDA FDC, etichette</span></p>';
  // per-day history (cheap)
  var hist=N.history(E).filter(function(h){return h.day<=ml.day}).slice(-7),hs=hist.length>1?'<ol class="hr nh">'+hist.slice().reverse().map(function(h){return '<li data-day="'+h.day+'"'+(h.day===ml.day?' aria-current="date"':'')+' role="link" tabindex="0" title="Apri il '+esc(F.dlabel(h.day,true))+'"><span class="t">'+(h.day===M.today?'oggi':h.day===F.addDays(M.today,-1)?'ieri':F.dshort(h.day))+'</span><span class="num">'+(h.kcal!=null?it(h.kcal)+' kcal':NA)+'</span><span class="num">'+(h.protein!=null?it(h.protein)+' g prot.':NA)+'</span><span class="num">'+(h.fiber!=null?(h.partial?'≥ ':'~')+nf(h.fiber,'g')+' g fibre':NA)+'</span><span class="num p">stima '+(h.cover!=null?it(h.cover*100)+'%':NA)+'</span></li>'}).join('')+'</ol>':'';
  return grp('Nutrienti '+(ml.isToday?'di oggi':'· '+F.dlabel(ml.day,true)),mac+sup+mic+q+(hs?'<h4 class="lab nhh">Per giorno</h4>'+hs:''),'nut');}
// ---------------- day navigation (?date=YYYY-MM-DD) ----------------
function hasMeals(day){return (M.D.meals&&M.D.meals.entries||[]).some(function(m){return m.day===day});}
function dnav(){var t=M.today,min=M.rows[0].day,days=E2.strip(VD,t,F.addDays),wk=['dom','lun','mar','mer','gio','ven','sab'];
  return '<nav class="dnav glass" aria-label="Scegli il giorno"><button class="dn" type="button" data-go="-1" aria-label="Giorno precedente"'+(VD<=min?' disabled':'')+'>‹</button>'+
    '<label class="dpick"><span class="dl">'+(VD===t?'Oggi · ':'')+esc(F.dlabel(VD,true))+'</span><input type="date" min="'+min+'" max="'+t+'" value="'+VD+'" aria-label="Scegli una data"></label>'+
    '<button class="dn" type="button" data-go="1" aria-label="Giorno successivo"'+(VD>=t?' disabled':'')+'>›</button>'+
    '<ol class="dstrip">'+days.map(function(x){var w=new Date(x+'T12:00:00Z').getUTCDay();return '<li><button type="button" data-day="'+x+'"'+(x===VD?' aria-current="date"':'')+' aria-label="'+esc(F.dlabel(x,true))+'"><b>'+(x===t?'oggi':wk[w])+'</b><span class="num">'+(+x.slice(8))+'</span><i class="'+(hasMeals(x)?'dot':'dot no')+'" aria-hidden="true"></i></button></li>'}).join('')+'</ol>'+
    (VD!==t?'<button class="dtoday" type="button" data-day="'+t+'">Torna a oggi</button>':'')+'</nav>';}
function mealsList(ml,tg,emptyNote){return ml?'<ol class="hr meals">'+ml.rows.map(function(m){return '<li><span class="t num">'+esc(m.time||'—')+'</span><span class="m">'+esc(m.meal||'')+'</span><span class="ti">'+esc(m.title||'')+'</span><span class="num r">'+(m.kcal!=null?it(m.kcal)+' kcal':NA)+'</span><span class="num r p">'+(m.protein!=null?it(m.protein)+' g prot.':'')+'</span></li>'}).join('')+
    '<li class="tot"><span class="t"></span><span class="m">totale</span><span class="ti">'+ml.rows.length+(ml.rows.length===1?' voce':' voci')+(tg?' · obiettivo '+LG.rng(tg):'')+'</span><span class="num r">'+(ml.kcal!=null?it(ml.kcal)+' kcal':NA)+'</span><span class="num r p">'+(ml.protein!=null?it(ml.protein)+' g prot.':'')+'</span></li></ol>':'<p class="note">'+NA+' · '+emptyNote+'</p>';}
function c1past(){var r=M.by[VD]||{day:VD,wo:[]},tg=r.target,ml=E2.mealsOn(M.D.meals&&M.D.meals.entries,VD,M.today),lab=F.dlabel(VD,true),c=B.chap1();
  var bw=E2.balWord(r.bal),src=r.bsrc==='apple'?'Apple':null;
  var burned=r.burned!=null?'<b>'+it(r.burned)+'</b> ('+src+')':r.estimate!=null?'<b>'+it(r.estimate)+'</b> (stima)':'<b>'+NA+'</b>';
  var estimated=r.burned==null&&r.estimate!=null;
  var big=bw?'<span class="bwd '+bw.k+'"><i class="bm" aria-hidden="true"></i>'+bw.label+(bw.k==='pari'?'':' '+it(bw.v)+'<span class="u">kcal</span>')+'</span>':
    r.eaten==null?'<span class="v na">'+NA+'</span>':estimated?'<span class="estimated-balance">~'+it(r.eaten-r.estimate)+' <span class="u">kcal</span></span>':'<span class="v na">bilancio non disponibile</span>';
  var reason=r.inc!=null?'Apple incompleto':r.dropped?'Apple: dato scartato':'Apple: nessun dato';
  var why=estimated?reason+' · bruciate stimate per tipo di giornata':r.bwhy||'';
  var cmp=(why?'<span class="why">'+esc(why)+'</span><br>':'')+'mangiate <b>'+(r.eaten!=null?it(r.eaten):NA)+'</b> · bruciate '+burned+
    (tg?' · obiettivo <b>'+LG.rng(estimated?Object.assign({},tg,{estimated:false}):tg)+'</b>':'')+(r.eaten==null?' · nessun pasto nel diario':'');
  var side='<div class="bal comp"><div class="lab">Il giorno in breve</div><p class="cmp">passi <b>'+(r.steps!=null?it(r.steps):NA)+'</b> · sonno <b>'+(r.sleep!=null?CX.hmin(r.sleep):NA)+'</b>'+(r.ssrc?' ('+esc(r.ssrc)+')':'')+'<br>HRV <b>'+(r.hrv!=null?it(r.hrv)+' ms':NA)+'</b>'+(r.hsrc?' ('+CX.HSRC(r.hsrc).replace(' (',', ').replace(')','')+')':'')+' · FC riposo <b>'+(r.rhr!=null?it(r.rhr)+' bpm':NA)+'</b>'+(r.rhr!=null&&r.rsrc?' ('+CX.RSRC(r.rsrc)+')':'')+'</p></div>';
  var train='<ol class="hr wo">'+(r.wo&&r.wo.length?r.wo.map(function(w){return '<li><span class="t">'+esc((w.start||'').slice(11,16)||'—')+'</span><span class="ti"><b>'+esc(w.type)+'</b></span><span class="num r">'+it(w.min)+' min</span><span class="num r p">'+(w.kcal?it(w.kcal)+' kcal':'')+'</span></li>'}).join(''):'<li><span class="ti">'+NA+' · nessun allenamento</span></li>')+'</ol>';
  var lede=(r.eaten!=null?'Mangiate '+it(r.eaten)+' kcal':'Nessun pasto registrato')+(r.burned!=null?', bruciate '+it(r.burned):r.estimate!=null?', dispendio '+it(r.estimate)+' kcal (stima)':', kcal bruciate: nessun dato')+(bw?': '+bw.label.toLowerCase()+(bw.k==='pari'?'':' di '+it(bw.v)+' kcal'):'')+'.';
  var dn=dnav(),lo=E2.navLow(innerHeight),H1=(lo?'':dn)+hero('energia','Bilancio · '+lab,big,cmp,side),FG=fig('energia','Energia',energyCap(),'energy','wide'),
      G=(lo?dn:'')+grp('Pasti · '+lab,mealsList(ml,tg,'nessun pasto nel diario per questo giorno'))+nutri(ml)+'<div class="duo"><div class="dc">'+grp('Allenamento',train)+'</div><div class="dc"></div></div>';
  return section(0,'oggi','Giorno','Com’è andata?',lede,H1,FG,G,'');}
// ---------------- chapter 1: Oggi ----------------
function c1(){if(VD&&VD!==M.today)return c1past();var T=d.T,Y=d.Y,tg=T.target,c=B.chap1(),ml=E2.mealsOn(M.D.meals&&M.D.meals.entries,M.today,M.today),pl=LG.plan(M),lw=d.lastWo;
  var rem=tg&&T.eaten!=null?tg.hi-T.eaten:null;
  var cmp=(tg?'obiettivo <b>'+LG.rng(tg)+'</b>'+(tg.type?' · giornata '+esc(tg.type):''):'obiettivo non impostato')+(T.eaten!=null?' · mangiate <b>'+it(T.eaten)+'</b>':'')+' · bruciate finora <b>'+(T.partial!=null?it(T.partial):NA)+'</b>';
  var meals=ml?mealsList(ml,tg,''):'<p class="note">'+NA+' · nessun pasto nel diario</p>';
  var wo=[];for(var i=M.rows.length-1;i>=0&&wo.length<5;i--)M.rows[i].wo.forEach(function(w){if(wo.length<5)wo.push([M.rows[i].day,w])});
  var plan=!T.wo.length&&pl.state==='todo'?'<li class="plan"><span class="t">oggi</span><span class="ti"><b>'+esc(pl.label)+'</b> · da fare'+(pl.time?' alle '+pl.time:'')+'</span><span class="num r">dal diario</span><span class="num r p">'+(tg?'obiettivo '+LG.rng(tg):'')+'</span></li>':'';
  var train='<ol class="hr wo"'+tap('allen','Allenamenti')+'>'+plan+(wo.length?wo.map(function(x){return '<li><span class="t">'+(x[0]===M.today?'oggi':x[0]===F.addDays(M.today,-1)?'ieri':F.dshort(x[0]))+'</span><span class="ti"><b>'+esc(x[1].type)+'</b></span><span class="num r">'+it(x[1].min)+' min</span><span class="num r p">'+(x[1].kcal?it(x[1].kcal)+' kcal':'')+'</span></li>'}).join(''):'<li><span class="ti">'+NA+'</span></li>')+'</ol>';
  var al=E2.alerts({today:M.today,mealsToday:!!(ml&&ml.isToday),pjLow:PJ.w.ok&&PJ.w.low,pjN:PJ.w.n,dropped:M.D.quality&&M.D.quality.energy_days_dropped||0,ingestAt:M.D.meta&&M.D.meta.health_last_ingest&&M.D.meta.health_last_ingest.at,now:Date.now()});
  var alerts='<ol class="hr al">'+(al.length?al.map(function(a){return '<li class="'+a[0]+'"><span class="t">'+(a[0]==='warn'?'attenzione':'nota')+'</span><span class="ti"><b>'+esc(a[1])+'</b> · '+esc(a[2])+'</span></li>'}).join(''):'<li><span class="ti">Nessun avviso: i dati sono aggiornati.</span></li>')+'</ol>';
  var steps=sec('passi','Passi oggi',V(T.steps,''),'finora · media 30 gg <b>'+(d.stepsBase!=null?it(d.stepsBase):NA)+'</b> '+LG.diff(T.steps,d.stepsBase,''),'steps');
  var ieri=sec('ieri','Ieri, a consuntivo',V(Y&&Y.bal!=null?Y.bal:null,'kcal'),Y&&Y.bal!=null?(Y.bal<0?'deficit':'surplus')+' · mangiate <b>'+(Y.eaten!=null?it(Y.eaten):NA)+'</b> · bruciate <b>'+(Y.burned!=null?it(Y.burned):NA)+'</b>':'servono pasti e un giorno completo');
  var bx=T.eaten!=null&&T.partial!=null?T.eaten-T.partial:null,bw=E2.balWord(bx),a7=E2.avgBal(M.rows.slice(-8,-1)),yw=Y&&E2.balWord(Y.bal);
  var balTip='Bilancio = kcal mangiate − kcal bruciate. Oggi è parziale (finora). Dispendio reale da Apple completo. Se manca o è incompleto, obiettivi e grafico usano la stima per tipo di giornata. Oggi l’obiettivo resta una stima, mentre il grafico mostra Apple finora. La media a 7 giorni usa solo i giorni completi: esclusi i giorni con kcal bruciate incomplete o scartate e quelli senza diario.';
  var bal='<div class="bal"'+tap('energia','Bilancio di oggi')+' title="'+esc(balTip)+'"><div class="lab">Bilancio di oggi · finora</div><div class="mid'+(bw?' '+bw.k:'')+'">'+(bw?'<i class="bm" aria-hidden="true"></i>'+bw.label+(bw.k==='pari'?'':' <span class="bv">'+it(bw.v)+'<span class="u">kcal</span></span>'):'<span class="v na">'+(T.eaten==null?'nessun pasto oggi':NA)+'</span>')+'</div>'+
    '<p class="cmp">ieri <b>'+(Y&&Y.bal!=null?sg(Y.bal,0)+' kcal':NA)+'</b>'+(yw?' ('+yw.label.toLowerCase()+')':'')+' · media 7 gg <b>'+(a7.mean!=null?sg(Math.round(a7.mean),0)+' kcal':NA)+'</b> su '+a7.n+(a7.n===1?' giorno completo':' giorni completi')+'</p></div>';
  var dn=dnav(),lo=E2.navLow(innerHeight),H1=(lo?'':dn)+hero('energia',c.megaK.charAt(0).toUpperCase()+c.megaK.slice(1),c.mega,cmp,bal),FG=fig('energia','Energia',energyCap(),'energy','wide'),
      G=(lo?dn:'')+grp('Pasti '+(ml&&!ml.isToday?'· '+F.dshort(ml.day):'di oggi'),meals)+nutri(ml)+'<div class="duo"><div class="dc">'+grp('Allenamento',train)+'</div><div class="dc">'+grp('Movimento e ieri','<div class="g2">'+steps+ieri+'</div>')+'</div></div>'+grp('Avvisi',alerts,'alerts');
  return section(0,'oggi','Oggi','Come sto oggi?',c.lede,H1,FG,G,'');}
// ---------------- chapter 2: Recupero ----------------
function c2(){var T=d.T,h=d.hrv,s=LG.say.recovery(d),tot=(T.deep||0)+(T.core||0)+(T.rem||0),f=d.form,fw=d.fw;
  var lede=(s.h.indexOf('Hai dormito')===0?s.s.charAt(0).toUpperCase()+s.s.slice(1):s.h+'. '+s.s)+'.';
  var H1=hero('sonno','Sonno stanotte',V(T.sleep,'','','h'),(T.ssrc?esc(T.ssrc)+' · ':'')+'media 30 notti <b>'+(d.sleepBase!=null?CX.hmin(d.sleepBase):NA)+'</b> '+LG.diff(T.sleep,d.sleepBase,'h'));
  var strip=tot?'<div class="strip" aria-label="Fasi del sonno di stanotte">'+SK.map(function(k){return '<i style="flex:'+(T[k[0]]||0)+';background:'+k[2]+'"></i>'}).join('')+'</div><div class="sleg">'+SK.map(function(k){return '<span><i style="background:'+k[2]+'"></i>'+k[1]+' <b>'+CX.hmin(T[k[0]]||0)+'</b> <em>'+Math.round((T[k[0]]||0)/tot*100)+'%</em></span>'}).join('')+'</div>':'<p class="note">fasi del sonno: '+NA+'</p>';
  var g3='<div class="g3">'+[
    sec('hrv','HRV',V(h?h.hrv:null,'ms'),h?CX.HSRC(h.hsrc)+' · '+when(h.day)+' · media <b>'+(d.hrvBase!=null?it(d.hrvBase)+' ms':NA)+'</b> '+LG.diff(h.hrv,d.hrvBase,'ms'):NA,'hrv'),
    sec('rhr','FC a riposo',V(T.rhr,'bpm'),(T.rsrc?CX.RSRC(T.rsrc)+' · ':'')+'media <b>'+(d.rhrBase!=null?it(d.rhrBase)+' bpm':NA)+'</b> '+LG.diff(T.rhr,d.rhrBase,'bpm',0,true),'rhr'),
    sec('sonno','Sonno profondo',V(T.ssrc==='Apple Watch'?T.deep:null,'','','h'),T.ssrc==='Apple Watch'&&T.deep!=null?'Apple Watch · media 30 notti <b>'+(d.deepBase!=null?CX.hmin(d.deepBase):NA)+'</b> '+LG.diff(T.deep,d.deepBase,'h'):NA,'deep')].join('')+'</div>';
  var tsb=f?Math.max(-35,Math.min(15,f.tsb)):null,pos=function(v){return ((v+35)/50*100).toFixed(1)+'%'};
  var scale='<div class="tsb" aria-hidden="true"><i class="z af" style="left:0;width:'+pos(-25)+'"></i><i class="z ca" style="left:'+pos(-25)+';width:30%"></i><i class="z eq" style="left:'+pos(-10)+';width:30%"></i><i class="z fr" style="left:'+pos(5)+';right:0"></i>'+(tsb!=null?'<b style="left:'+pos(tsb)+'"></b>':'')+'</div><div class="tsl"><span>affaticato</span><span>in carico</span><span>in equilibrio</span><span>fresco</span></div>';
  var forma='<aside class="side glass"'+tap('forma','Stato di forma')+'><div class="lab">Stato di forma</div><div class="mid word" style="color:'+(fw?fw[1]:'inherit')+'">'+(fw?fw[0]:NA)+'</div><p class="cmp">'+(f?'TSB <b>'+LG.sgn(f.tsb,1)+'</b> · fitness <b>'+it(f.ctl)+'</b> · fatica <b>'+it(f.atl)+'</b>':'servono allenamenti registrati')+'</p>'+(f?scale:'')+'<p class="note">Carico 7 giorni <b>'+it(d.load7)+'</b> · media settimanale 4 sett. <b>'+it(d.load28)+'</b></p></aside>';
  var FG=fig('sonno','Sonno, 30 notti',nightsCap(),'nights','wide');
  return section(1,'rec','Recupero','Ho recuperato?',lede,H1+'<div class="fx sl">'+strip+'</div>',FG,grp('Corpo stanotte',g3),forma,'top');}
// ---------------- chapter 3: Direzione ----------------
function c3(){var W=d.weeks,w=W[W.length-1],t=LG.say.trend(d),r7=M.rows.slice(-8,-1),A7=E2.avgBal(r7),bal=A7.mean,nb=A7.n,wl=d.wl,w30=d.w30,dl=wl&&w30?wl[1]-w30[1]:null;
  var lede=t.h.split(' · ')[0]+'. '+t.s.charAt(0).toUpperCase()+t.s.slice(1)+'.';
  var lf=PJ.lastF,ll=PJ.lastL,comp=lf||ll?'<div class="bal comp"><div class="lab">Composizione · ultima misura</div><div class="cps">'+(lf?'<div><div class="mid">'+it(lf[1],1)+'<span class="u">kg</span></div><p class="cmp">massa grassa · '+when(lf[0])+'</p></div>':'')+(ll?'<div><div class="mid">'+it(ll[1],1)+'<span class="u">kg</span></div><p class="cmp">massa magra · '+when(ll[0])+'</p></div>':'')+'</div></div>':'';
  var H1=hero('peso','Peso',V(wl?wl[1]:null,'kg',1),(wl?'ultima pesata '+when(wl[0]):'nessuna pesata')+(dl!=null?' · <b>'+sg(dl,1)+' kg</b> rispetto a 30 giorni prima ('+it(w30[1],1)+' kg)':''),comp)+'<div class="wseg"></div>';
  var FG=fig('peso','Peso','Pesate reali · nessuna stima tra una pesata e l’altra'+(PJ.w.ok?' · tratteggio: proiezione a 30 giorni'+(PJ.w.low?' (molto indicativa)':''):''),'weight','wide');
  var hab='<div class="g2">'+sec('bilancio','Bilancio medio · 7 giorni',V(bal==null?null:Math.round(bal),'kcal/g'),nb?nb+(nb===1?' giorno':' giorni')+' con diario · '+(bal<0?'deficit':'surplus')+(d.Y&&d.Y.bal!=null?' · ieri <b>'+sg(d.Y.bal,0)+'</b>':''):'servono pasti registrati','bal')+
    sec('costanza','Costanza',V(w.days,w.days===1?'giorno':'giorni'),'di allenamento questa settimana · media 8 sett. <b>'+it(F.mean(W.slice(-9,-1).map(function(x){return x.days})),1)+'</b>','weeks')+'</div>';
  return section(2,'trend','Direzione','Dove sto andando?',lede,H1,FG,grp('Abitudini',hab),proj(),'split');}
function pval(k,label,r){var ok=r&&r.ok;return '<div class="pv"><div class="lab">'+label+(ok&&r.low?' <span class="pl">molto indicativa</span>':'')+'</div><div class="pn">'+(ok?(Math.abs(r.d30)<.1?'≈ 0':sg(r.d30,1))+'<span class="u">kg in 30 gg</span>':'<span class="v na">nessun dato sufficiente</span>')+'</div><p class="note">'+(ok?sg(r.slope,3)+' kg/giorno · '+r.n+' misure · '+prange(r):(r&&r.n?r.n+' misure in '+PW+' gg · '+r.why:'nessuna misura in '+PW+' gg'))+'</p>'+(ok?'<div class="viz" data-v="p'+k+'"></div>':'')+'</div>';}
function proj(){var P=PJ,items=[{art:'il tuo peso',name:'il peso',r:P.w},{art:'la massa grassa',name:'la massa grassa',r:P.f},{art:'la massa magra',name:'la massa magra',r:P.l}],low=items.filter(function(x){return x.r.ok&&x.r.low});
  var sent=LG.projSentence(items,function(v){return it(Math.abs(v),1)})||'Per ora non c’è abbastanza per una proiezione: servono almeno 2 pesate negli ultimi 30 giorni. Più spesso ti pesi, più la stima sarà affidabile.';
  var nn=low.length?Math.max.apply(null,low.map(function(x){return x.r.n})):0;
  return '<aside class="side glass proj'+(low.length?' lo':'')+'" aria-labelledby="pj-t"><div class="lab" id="pj-t">Proiezione a 30 giorni</div><p class="pj">'+esc(sent)+'</p>'+
    (low.length?'<p class="pwarn"><span class="pl">Stima molto indicativa</span> Basata su '+nn+(nn===1?' pesata':' pesate')+' in '+PW+' giorni: con poche misure la tendenza è rumorosa. Pesandoti più spesso diventa più affidabile.</p>':'')+
    pval('w','Peso',P.w)+pval('f','Massa grassa',P.f)+pval('l','Massa magra',P.l)+
    '<p class="note sm">Media mobile a 7 giorni sulle misure degli ultimi '+PW+' giorni, regressione lineare, pendenza × 30. Compare con almeno 2 misure in 30 giorni; solida con 8+ misure su 14+ giorni e 3 nella stessa settimana. Apple Salute dall’iPhone; escluse le scansioni Bodygram. Stima statistica, non una previsione medica.</p></aside>';}
// chapter frame: rivista = title row + open body; the one glass block sits beside the hero ('top') or beside hero+chart+groups ('split') so no column runs empty; indice = sticky [title + hero + chart] beside the scrolling groups
function section(i,id,name,q,lede,H1,FG,G,side,lay){var hd=head(i,id,name,q,lede);
  if(VAR==='rivista'){var body=!side?H1+FG+G:lay==='top'?'<div class="split top has"><div class="main">'+H1+'</div><div class="aside">'+side+'</div></div>'+FG+G:'<div class="split has"><div class="main">'+H1+FG+G+'</div><div class="aside">'+side+'</div></div>';
    return '<section class="ch" id="c-'+id+'" aria-labelledby="t-'+id+'">'+hd+'<div class="cb">'+body+'</div></section>';}
  return '<section class="ch" id="c-'+id+'" aria-labelledby="t-'+id+'"><div class="stk">'+hd+H1+FG+'</div><div class="flow">'+(side?'<div class="grp fx">'+side+'</div>':'')+G+'</div></section>';}
// ---------------- index tiles (indice) ----------------
function index(){var T=d.T,tg=T.target,c=B.chap1(),wl=d.wl,w30=d.w30,dl=wl&&w30?wl[1]-w30[1]:null;
  var tile=function(n,id,name,lab,num,cmp){return '<a class="ix glass" href="#c-'+id+'"><span class="tn num">0'+n+'</span><span class="tt">'+name+'</span><span class="lab">'+lab+'</span><span class="tv">'+num+'</span><span class="cmp">'+cmp+'</span></a>';};
  return '<nav class="idx" aria-label="Indice dei capitoli">'+
    tile(1,'oggi','Oggi',c.megaK,c.mega,tg?'obiettivo '+LG.rng(tg):'bruciate finora')+
    tile(2,'rec','Recupero','Sonno stanotte',V(T.sleep,'','','h'),'media 30 notti '+(d.sleepBase!=null?CX.hmin(d.sleepBase):NA))+
    tile(3,'trend','Direzione','Peso',V(wl?wl[1]:null,'kg',1),dl!=null?sg(dl,1)+' kg in 30 giorni':'ultima pesata '+(wl?when(wl[0]):NA))+'</nav>';}
// ---------------- charts ----------------
function inStk(box){return VAR==='indice'&&box.closest('.stk')&&E2.cols(innerWidth)===1&&innerWidth>=768;}
function H(box,k){var w=box.clientWidth;if(k==='spark')return Math.round(Math.max(96,Math.min(112,w*.4)));
  var short=innerHeight<520,floor=short?112:160,cap=short?200:300,vh=innerHeight*(short?.34:.27);
  if(inStk(box)){var st=box.closest('.stk'),other=st.offsetHeight-box.offsetHeight;return Math.round(Math.max(180,Math.min(innerHeight-96-32-other,w*.5,420)));}
  var h=Math.round(Math.max(floor,Math.min(vh,w*.24,cap)))+(box._fill||0);
  if(innerHeight<500&&box.dataset&&box.dataset.c==='energy')h=Math.min(h,104);
  return h;}
var CH={
 energy:function(box){var r=M.rows.slice(innerWidth<700?-14:-30),er=LG.energyRows(r);
   var hi=-1;r.forEach(function(x,i){if(x.day===VD)hi=i});box._days=r.map(function(x){return x.day});LG.bars(box,{hl:VD!==M.today&&hi>=0?hi:undefined,vals:er.vals,marks:er.marks,labels:r.map(function(x){return x.day===M.today?'oggi':F.dshort(x.day)}),dots:r.map(function(x){return x.eaten}),unit:'kcal',id:'eo',c1:'#ff9f0a',c2:'#ffd60a',ghost:er.ghost,H:H(box),right:true,maxBw:40,fill:.58,tp:30,gapLabel:'nessun dato'});
   LG.scrub(box,function(i){var x=r[i];if(!x)return null;var m=er.marks(i),g=er.ghost(i);return '<span class="d">'+(x.day===M.today?'oggi':F.dlabel(x.day,true))+'</span><br>'+(m?'bruciate: dato scartato':'bruciate'+(x.full?'':' finora')+' <b>'+(er.vals[i]!=null?it(er.vals[i]):NA)+'</b>'+(er.est(i)?' · <b>stima</b>':er.vals[i]!=null?' · Apple'+(g&&x.full?' (incompleto)':''):''))+(x.bwhy?'<br><span class="why">'+esc(x.bwhy)+'</span>':'')+'<br>mangiate <b>'+(x.eaten!=null?it(x.eaten):NA)+'</b>'+(function(){var v=x.full?x.bal:(x.eaten!=null&&x.partial!=null?x.eaten-x.partial:null),w=E2.balWord(v);return w?'<br>bilancio'+(x.full?'':' finora')+' <b>'+(w.k==='pari'?'in pari':sg(v,0))+'</b>'+(er.est(i)?' (stima)':''):(x.full?(x.eaten==null?'<br>bilancio: nessun diario pasti':'<br>bilancio: giorno incompleto'):'');})();});},
 nights:function(box){var r=M.rows.slice(innerWidth<700?-14:-30);LG.stack(box,{rows:r,keys:SK.map(function(k){return [k[0],k[2]]}).concat([['uns','#8e8e93']]),labels:r.map(function(x){return x.day===M.today?'stanotte':F.dshort(x.day)}),H:Math.round(H(box)*.8),maxBw:30});
   LG.scrub(box,function(i){var x=r[i];if(!x)return null;var t=(x.deep||0)+(x.core||0)+(x.rem||0);return '<span class="d">notte del '+F.dlabel(x.day,true)+'</span><br>'+(t?'<b>'+CX.hmin(x.sleep!=null?x.sleep:t)+'</b> · profondo '+CX.hmin(x.deep||0)+' · REM '+CX.hmin(x.rem||0)+'<br>'+F.esc(x.ssrc||''):x.uns?'<b>'+CX.hmin(x.uns)+'</b> · fasi non disponibili<br>'+F.esc(x.ssrc||''):NA+(x.sdrop?' ('+x.sdrop+')':''));});},
 weight:function(box){var q=A.wpts(+wPer),P=PJ&&PJ.w,ext=null;if(P&&P.ok){var last=P.roll[P.roll.length-1][0];ext=q.vals.map(function(){return null});F.dayRange(F.addDays(M.today,-(+wPer)+1),M.today).forEach(function(dd,i){if(dd>=last)ext[i]=P.fit(dd)});
     for(var k=1;k<=30;k++){var dd=F.addDays(M.today,k);q.vals.push(null);q.labels.push(F.dshort(dd));ext.push(P.fit(dd));}}
   LG.line(box,{ext:ext,extOp:P&&P.low?.5:.85,vals:q.vals,labels:q.labels,color:'#30d158',id:'ew',dec:1,connect:true,bridge:21,bridgeDash:true,gapMin:22,gapUntil:+wPer-1,gapLabel:'nessuna pesata',points:wPer!=='365',unit:'kg',H:H(box),minPad:.5,sw:3.5,gap:80});
   LG.scrub(box,function(i){var v=q.vals[i];return v==null?null:'<span class="d">'+q.labels[i]+'</span><br><b>'+it(v,1)+' kg</b>';});},
 steps:function(vz){var r=M.rows.slice(-7);LG.bars(vz,{vals:r.map(function(x){return x.steps}),labels:r.map(function(x){return x.day===M.today?'oggi':F.dlabel(x.day)}),id:'es',c1:'#64d2ff',c2:'#0a84ff',ghost:function(i){return i===6},H:H(vz,'spark'),gap:50,maxBw:26});
   LG.scrub(vz,function(i){return r[i]&&r[i].steps!=null?'<span class="d">'+when(r[i].day)+'</span> <b>'+it(r[i].steps)+'</b> passi':null});},
 hrv:function(vz){var rr=M.rows.slice(-45);LG.line(vz,{vals:rr.map(function(x){return x.hrv}),labels:rr.map(function(x){return F.dshort(x.day)}),color:'#bf5af2',id:'eh',H:H(vz,'spark'),connect:true,bridge:1,gapMin:2,unit:'ms',gap:70});
   LG.scrub(vz,function(i){return '<span class="d">'+F.dshort(rr[i].day)+'</span> '+(rr[i].hrv!=null?'<b>'+it(rr[i].hrv)+' ms</b> · '+CX.HSRC(rr[i].hsrc):'nessun dato Apple')});},
 rhr:function(vz){var rr=M.rows.slice(-30);LG.line(vz,{vals:rr.map(function(x){return x.rhr}),labels:rr.map(function(x){return F.dshort(x.day)}),color:'#ff375f',id:'er',H:H(vz,'spark'),unit:'bpm',gap:70,gapMin:2,gapUntil:rr.length-2,src:rr.map(function(x){return x.rsrc}),alt:'Apple'});
   LG.scrub(vz,function(i){return rr[i].rhr!=null?'<span class="d">'+F.dshort(rr[i].day)+'</span> <b>'+it(rr[i].rhr)+' bpm</b> · '+CX.RSRC(rr[i].rsrc):null});},
 deep:function(vz){var rr=M.rows.slice(-30),vals=rr.map(function(x){return x.ssrc==='Apple Watch'?x.deep:null});LG.line(vz,{vals:vals,labels:rr.map(function(x){return F.dshort(x.day)}),color:'#5e5ce6',id:'ed',H:H(vz,'spark'),unit:'min',gap:70,gapMin:2});
   LG.scrub(vz,function(i){return vals[i]!=null?'<span class="d">'+F.dshort(rr[i].day)+'</span> <b>'+CX.hmin(vals[i])+'</b> · Apple Watch':null});},
 bal:function(vz){var r=M.rows.slice(-8,-1);LG.bars(vz,{vals:r.map(function(x){return x.bal}),labels:r.map(function(x){return F.dlabel(x.day)}),signed:true,color:function(v){return v<0?'#0a84ff':'#ff9f0a'},valLabel:true,balance:true,H:H(vz,'spark'),gap:56,maxBw:26});},
 weeks:function(vz){var q=d.weeks.slice(-8);LG.bars(vz,{vals:q.map(function(x){return x.days}),labels:q.map(function(x){return x.label}),id:'ec',c1:'#ffd60a',c2:'#ff9f0a',valLabel:true,ghost:function(i){return i===q.length-1},H:H(vz,'spark'),min:4,gap:50,maxBw:26});},
 pw:function(vz){spark(vz,'w','#30d158')},pf:function(vz){spark(vz,'f','#ff9f0a')},pl:function(vz){spark(vz,'l','#0a84ff')}};
function spark(vz,k,col){var P=PJ[k],days=F.dayRange(F.addDays(M.today,-PW+1),F.addDays(M.today,30)),rm={};P.roll.forEach(function(p){rm[p[0]]=p[1]});var last=P.roll[P.roll.length-1][0];
  LG.line(vz,{vals:days.map(function(dd){return rm[dd]!=null?rm[dd]:null}),ext:days.map(function(dd){return dd>=last?P.fit(dd):null}),extOp:P.low?.5:.85,labels:days.map(function(dd){return dd===M.today?'oggi':F.dshort(dd)}),color:col,id:'ep'+k,dec:1,connect:true,unit:'kg',H:H(vz,'spark'),minPad:.2,gap:90,area:false});}
function draw(el){var k=el.dataset.c||el.dataset.v;if(CH[k])CH[k](el);}
// reserve chart height before drawing so nothing shifts when a chart appears
function reserve(){var all=$$('[data-c],.viz[data-v]'),set=function(b){var k=b.dataset.c||'spark';b.style.minHeight=(k==='nights'?Math.round(H(b)*.8):H(b,b.dataset.c?null:'spark'))+'px';};all.forEach(function(b){b._fill=0;set(b);});
  // rivista: when a chapter's main column ends above its row (ultrawide columns, or beside a taller glass sidebar), its main chart grows into that space (once, before drawing) instead of leaving a void
  if(VAR!=='rivista')return;$$('.ch').forEach(function(ch){var sp=ch.querySelector('.split.has:not(.top)'),col=sp&&getComputedStyle(sp).display==='grid'?sp.querySelector('.main'):ch.querySelector('.cb'),box=col&&col.querySelector('.fig [data-c]');if(!box)return;
    var gap=Math.floor(ch.getBoundingClientRect().bottom-col.getBoundingClientRect().bottom),base=H(box);if(gap>24){var nf=box.dataset.c==='nights'?.8:1;box._fill=Math.round(Math.min(gap-8,base*nf*2,Math.min(560,box.clientWidth*.6)-base*nf)/nf);if(box._fill<0)box._fill=0;set(box);}});}
// ---------------- render ----------------
var DT={energia:'oggi',ieri:'oggi'};
function bindK(root){$$('[data-k]',root).forEach(function(el){var k=DT[el.dataset.k]||el.dataset.k,w=A.WID[k];if(!w||!w.dt)return;var go=function(e){if(e&&e.target.closest('.lg-seg,a,.dnav,.cap-more'))return;LG.open(el,function(b){b.dataset.k=k;w.dt(b)})};el.addEventListener('click',go);el.addEventListener('keydown',function(e){if(e.target.closest('.cap-more,.dnav'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});}
function bindDay(root){var nav=$('.dnav',root);if(nav){$$('[data-go]',nav).forEach(function(b){b.addEventListener('click',function(){goDay(F.addDays(VD,+b.dataset.go))})});
    $$('[data-day]',nav).forEach(function(b){b.addEventListener('click',function(){goDay(b.dataset.day)})});
    var inp=$('input[type=date]',nav);if(inp)inp.addEventListener('change',function(){if(inp.value)goDay(inp.value)});if(LG.glass)LG.glass(root);}
  $$('.nh li[data-day]',root).forEach(function(li){var f=function(){goDay(li.dataset.day)};li.addEventListener('click',f);li.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();f();}});});}
function updateProgress(old,nu){
  if(CX.reduced())return;
  $$('.macro-fill',nu).forEach(function(el){var key=el.closest('[data-macro]').dataset.macro,prev=old.querySelector('[data-macro="'+key+'"] .macro-fill');
    el.style.animation='none';el.animate([{strokeDashoffset:prev?prev.style.strokeDashoffset:'100'},{strokeDashoffset:el.style.strokeDashoffset}],{duration:200,easing:getComputedStyle(el).getPropertyValue('--jk-ease-out').trim()});});
  ['.kcal-fill','.kcal-over'].forEach(function(selector){var el=nu.querySelector(selector),prev=old.querySelector(selector);if(!el)return;el.style.animation='none';
    var frames=selector==='.kcal-over'&&prev?[{width:prev.style.width},{width:el.style.width}]:[{transform:'scaleX('+(prev?prev.style.getPropertyValue('--fill'):0)+')'},{transform:'scaleX('+el.style.getPropertyValue('--fill')+')'}];
    el.animate(frames,{duration:200,easing:getComputedStyle(el).getPropertyValue('--jk-ease-out').trim()});});
}
function goDay(day){var t=M.today,min=M.rows[0].day;if(!day)return;day=day<min?min:day>t?t:day;if(day===VD)return;VD=day;
  try{history.replaceState(null,'',location.pathname+(day===t?'':'?date='+day)+location.hash);}catch(e){}
  var old=$('#c-oggi');if(!old)return;var swap=function(){var tmp=document.createElement('div');tmp.innerHTML=c1();var nu=tmp.firstChild;old.parentNode.replaceChild(nu,old);
    updateProgress(old,nu);bindK(nu);bindDay(nu);$$('.fx,.hero,.fig',nu).forEach(function(e){e.classList.add('in')});reserve();$$('[data-c],.viz[data-v]',nu).forEach(draw);
    if(!CX.reduced()){nu.classList.add('din');requestAnimationFrame(function(){requestAnimationFrame(function(){nu.classList.remove('din')})});}
    if(fk){var f=$(fk,nu)||$('.dnav [aria-current]',nu);if(f&&!f.disabled)f.focus({preventScroll:true});}};
  var ae=document.activeElement,fk=ae&&old.contains(ae)&&ae.closest('.dnav')?(ae.dataset.go?'.dnav [data-go="'+ae.dataset.go+'"]':ae.type==='date'?'.dnav input[type=date]':'.dnav [aria-current]'):null;
  if(CX.reduced())swap();else{old.classList.add('dout');setTimeout(swap,140);}}
addEventListener('keydown',function(e){if(!M||e.altKey||e.ctrlKey||e.metaKey)return;var tg=e.target;if(tg&&(/INPUT|TEXTAREA|SELECT/.test(tg.tagName)||tg.isContentEditable))return;if(document.querySelector('.lg-sheet.open,[aria-modal="true"]'))return;
  if(e.key==='ArrowLeft'&&e.shiftKey){e.preventDefault();goDay(F.addDays(VD,-1));}else if(e.key==='ArrowRight'&&e.shiftKey){e.preventDefault();goDay(F.addDays(VD,1));}});
function render(m,dd){M=m;d=dd;A.set(m,dd);B.set(m,dd);PJ=projData();document.body.classList.add('e2');VD=E2.dayParam(location.search,M.rows[0].day,M.today);
  app.innerHTML='<header class="lg-top glass"><a class="wordmark" href="/">'+F.esc(F.siteLabel())+'</a><span class="tag">Dashboard privata</span><span class="sws"><details class="altro"><summary aria-controls="altro-menu">Altro</summary><div class="altro-pop" id="altro-menu"><a class="jk-focus-inset out" href="/logout">Esci</a></div></details><a class="sw out" href="/logout">Esci</a></span></header>'+
   '<main class="e2m v-'+VAR+'">'+(VAR==='indice'?index():'')+'<div class="chs">'+c1()+c2()+c3()+'</div><footer class="end"><p>Dati reali da Apple Salute e diario Forma · aggiornati al '+F.dlabel(M.today,true)+' · pagina privata protetta da password</p></footer></main>'+
   (VAR==='rivista'?'<nav class="chnav show" aria-label="Capitoli"><div id="chseg"></div></nav>':'');
  LG.seg($('.wseg'),[['30','30 giorni'],['90','90 giorni'],['365','12 mesi']],wPer,function(v){wPer=v;CH.weight($('[data-c="weight"]'));});
  bindK(document);bindDay(document);
  reserve();
  // charts draw once when 30% visible; groups fade in (opacity only: data never moves)
  var charts=$$('[data-c],.viz[data-v]'),fx=$$('.fx,.hero,.fig,.ix');
  if(CX.reduced()||!window.IntersectionObserver){charts.forEach(draw);fx.forEach(function(e){e.classList.add('in')});}
  else{var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){draw(e.target);io.unobserve(e.target);}})},{threshold:.3});charts.forEach(function(c){io.observe(c)});
    var io2=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io2.unobserve(e.target);}})},{threshold:.15});fx.forEach(function(e){io2.observe(e)});}
  // layer 0: background drifts at 0.2x scroll (transform only), capped; off under 768 px / reduced motion
  var bg=$('.lg-bg'),lastY=scrollY,downAcc=0;
  function revealNav(n){if(n)n.classList.add('show');}
  function placeNav(y){var n=document.querySelector('.chnav');if(!n)return;
    if(innerHeight>=500){downAcc=0;lastY=y;return;}
    var dy=y-lastY,maxY=Math.max(0,document.documentElement.scrollHeight-innerHeight),atBottom=y>=maxY-4;
    if(atBottom||dy<0){downAcc=0;revealNav(n);}
    else if(dy>0){downAcc+=dy;if(downAcc>=24)n.classList.remove('show');}
    lastY=y;}
  function onScroll(){var y=scrollY;if(bg){var mo=E2.motion(innerWidth,CX.reduced());bg.style.transform=mo.parallax?'translate3d(0,'+(-Math.min(y*.2,innerHeight*.25)).toFixed(1)+'px,0)':'';}
    placeNav(y);
    if(seg){var ids=['oggi','rec','trend'],at=0;ids.forEach(function(id,i){var s=$('#c-'+id);if(s&&s.getBoundingClientRect().top<innerHeight*.45)at=i;});if(y>=document.documentElement.scrollHeight-innerHeight-4)at=2;seg._at(at);}}
  function barCut(){var b=document.querySelector('.lg-top'),n=document.querySelector('.chnav');return Math.max(b?b.getBoundingClientRect().bottom:72,n&&matchMedia('(max-width:430px) and (min-height:500px)').matches?n.getBoundingClientRect().bottom:0)+parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--jk-top-clearance'));}
  var seg=null;if($('#chseg'))seg=LG.seg($('#chseg'),[['oggi','Oggi'],['rec','Recupero'],['trend','Direzione']],'oggi',function(v){var s=$('#c-'+v);var cut=barCut();scrollTo({top:Math.max(0,s.getBoundingClientRect().top+scrollY-(v==='oggi'?Math.max(200,cut):cut)),behavior:CX.reduced()?'auto':'smooth'});});
  addEventListener('scroll',function(){requestAnimationFrame(onScroll)},{passive:true});onScroll();
  function fitChrome(){var top=document.querySelector('.lg-top');if(top)document.documentElement.style.setProperty('--jk-top-bottom',top.getBoundingClientRect().bottom+'px');var n=document.querySelector('.chnav');if(n){var shown=getComputedStyle(n).display!=='none';document.documentElement.style.setProperty('--nav-h',(shown?n.offsetHeight:0)+'px');if(innerHeight<500&&scrollY<24)revealNav(n);}syncCaps();}
  fitChrome();
  if(window.ResizeObserver){var chromeSize=new ResizeObserver(fitChrome);chromeSize.observe(document.querySelector('.lg-top'));}
  LG.watchSize(function(){reserve();syncCaps();charts.forEach(function(c){if(c.querySelector('svg'))draw(c)});fitChrome();onScroll();});
  var det=document.querySelector('.lg-top .altro');
  if(det){
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&det.open){det.open=false;var s=det.querySelector('summary');if(s)s.focus();}});
    document.addEventListener('click',function(e){if(det.open&&!det.contains(e.target))det.open=false;});
  }}
function daysShown(){return innerWidth<700?14:30;}
function energyCap(){var n=daysShown();return '<span class="cap-n">Energia, ultimi '+n+' giorni</span> · barre = bruciate · punti = mangiate<details class="cap-more"><summary>Legenda</summary><p>Barre piene = kcal bruciate dei giorni completi. Tratteggiate = incomplete o oggi. Nei giorni passati incompleti si usa la stima per tipo di giornata, indicata nel dettaglio. × = dato scartato.</p></details>';}
function nightsCap(){return 'Ultime '+daysShown()+' notti per fase · viola = profondo · azzurro = core · lilla = REM';}
function syncCaps(){var n=daysShown(),cn=document.querySelector('.cap-n');if(cn)cn.textContent='Energia, ultimi '+n+' giorni';var nn=document.querySelector('[data-c="nights"]'),fc=nn&&nn.closest('figure')&&nn.closest('figure').querySelector('figcaption');if(fc)fc.textContent=nightsCap();}
LG.boot(render);
})();
