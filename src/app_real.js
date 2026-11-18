(function(){
'use strict';
var $=function(s){return document.querySelector(s)};
function it(n,d){if(n==null||isNaN(n))return '—';d=d||0;var s=Math.abs(n).toFixed(d).split('.');s[0]=s[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.');return (n<0?'−':'')+s.join(',');}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
var fallbackTz='UTC';
function deviceTz(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||null}catch(e){return null}}
function userTz(){return deviceTz()||fallbackTz}
function localDay(tz,d){return new Intl.DateTimeFormat('en-CA',{timeZone:tz||userTz()}).format(d||new Date())}
function dataUrl(path,day){var tz=deviceTz();return (path||'/api/data')+'?'+(tz?'tz='+encodeURIComponent(tz)+'&':'')+'date='+encodeURIComponent(day||localDay())}
function siteLabel(){var el=typeof document.querySelector==='function'&&document.querySelector('meta[name="forma-site-label"]');return el?el.content:(typeof location!=='undefined'&&location.host||'Forma')}
function localTime(iso){return new Intl.DateTimeFormat('it-IT',{timeZone:userTz(),hour:'2-digit',minute:'2-digit'}).format(new Date(iso))}
var GG=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'],MM=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
function dlabel(day,long){var d=new Date(day+'T12:00:00Z');return GG[d.getUTCDay()]+' '+d.getUTCDate()+(long?' '+MM[d.getUTCMonth()]:'');}
function hm(ms){if(ms==null)return '—';var m=Math.round(ms/60000);return Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+"'";}
function head(eb,t,right){return '<div class="head"><div><div class="eyebrow">'+eb+'</div><h1 class="title">'+t+'</h1></div>'+(right||'')+'</div>';}
var REAL='<span class="badge ok">● dati reali</span>';
function tile(k,v,u,d,cls){return '<div class="tile"><div class="k">'+k+'</div><div class="v '+(cls||'')+'">'+v+(u?'<small>'+u+'</small>':'')+'</div>'+(d?'<div class="d">'+d+'</div>':'')+'</div>';}
function path(p){return 'M'+p.map(function(x){return x[0].toFixed(1)+','+x[1].toFixed(1)}).join(' L');}
function set(id,html){var s=document.getElementById(id);if(s){s.innerHTML=html;s.classList.add('real');}}
function byDay(arr){var o={};(arr||[]).forEach(function(r){o[r.day]=r});return o;}
// ---- shared helpers (real data only; nothing is invented) ----
var MS=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
function mean(a){a=(a||[]).filter(function(v){return v!=null&&!isNaN(v)});return a.length?a.reduce(function(x,y){return x+y},0)/a.length:null;}
function sum(a){return (a||[]).reduce(function(x,y){return x+(y||0)},0);}
function addDays(day,n){var d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function dayRange(from,to){var o=[];for(var d=from;d<=to;d=addDays(d,1))o.push(d);return o;}
function dshort(day){return (+day.slice(8))+'/'+(+day.slice(5,7));}
function monday(day){var d=new Date(day+'T12:00:00Z'),w=(d.getUTCDay()+6)%7;return addDays(day,-w);}
function hkS(D,k){return (D.hk&&D.hk[k])||[];}
function hkMap(D,k){var o={};hkS(D,k).forEach(function(p){o[p[0]]=p[1]});return o;}
function ptsFrom(arr,key){return (arr||[]).filter(function(r){return r[key]!=null}).map(function(r){return [r.day,r[key]]});}
function since(pts,from){return pts.filter(function(p){return p[0]>=from});}
function ma(pts,n){var out=[],q=[];pts.forEach(function(p){q.push(p);var lim=addDays(p[0],-(n-1));while(q.length&&q[0][0]<lim)q.shift();out.push([p[0],mean(q.map(function(z){return z[1]}))]);});return out;}
function weekly(pts){var g={};pts.forEach(function(p){var w=monday(p[0]);(g[w]=g[w]||[]).push(p[1]);});return Object.keys(g).sort().map(function(w){return [addDays(w,3),mean(g[w])]});}
function legend(items){return '<div class="legend">'+items.map(function(x){return '<span><i'+(x[2]?' class="sq"':'')+' style="background:'+x[1]+'"></i>'+x[0]+'</span>'}).join('')+'</div>';}
function emptyCard(msg){return '<div class="card"><div class="sub">'+msg+'</div></div>';}
// Every chart is drawn twice: a 354-unit version for narrow cards and a 720-unit one that a container query shows
// when the card is wide, so text stays ~9–12 px whatever the tile span.
function tchart(series,o){return tchart1(series,o,354,'n')+tchart1(series,o,720,'w');}
function tchart1(series,o,W,cls){o=o||{};var H=o.H||120,pl=30,pr=6,pt=8,pb=18,all=[];
  series.forEach(function(s){s.pts.forEach(function(p){if(p[1]!=null)all.push(p[1])})});(o.bars||[]).forEach(function(p){all.push(p[1])});
  if(!all.length)return '';
  var lo=o.zero?0:Math.min.apply(null,all),hi=Math.max.apply(null,all);if(hi===lo){hi+=1;if(!o.zero)lo-=1;}
  var pad=(hi-lo)*0.08;if(!o.zero)lo-=pad;hi+=pad;
  var t0=Date.parse(o.from+'T12:00:00Z'),t1=Date.parse(o.to+'T12:00:00Z'),span=Math.max(t1-t0,864e5);
  var x=function(d){return pl+(Date.parse(d+'T12:00:00Z')-t0)/span*(W-pl-pr)},y=function(v){return pt+(1-(v-lo)/(hi-lo))*(H-pt-pb)};
  var s='<svg viewBox="0 0 '+W+' '+H+'" class="ch '+cls+'">';
  [lo+(o.zero?0:pad),(lo+hi)/2,hi-pad].forEach(function(v){s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'" stroke="var(--border)"/><text x="0" y="'+(y(v)+3).toFixed(1)+'">'+it(v,o.dec||0)+'</text>';});
  if(span>90*864e5){var d=new Date(t0);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);var i=0;while(d.getTime()<=t1){var ds=d.toISOString().slice(0,10);
      s+='<line x1="'+x(ds).toFixed(1)+'" x2="'+x(ds).toFixed(1)+'" y1="'+pt+'" y2="'+(H-pb)+'" stroke="var(--border)" stroke-dasharray="1 3"/>';
      if(i%2===0)s+='<text x="'+(x(ds)-8).toFixed(1)+'" y="'+(H-4)+'">'+MS[d.getUTCMonth()]+'</text>';d.setUTCMonth(d.getUTCMonth()+1);i++;}}
  else [0,1/3,2/3,1].forEach(function(f){var ds=new Date(t0+f*span).toISOString().slice(0,10);s+='<text x="'+Math.min(x(ds)-10,W-28).toFixed(1)+'" y="'+(H-4)+'">'+dshort(ds)+'</text>';});
  var bw=Math.max(1,(W-pl-pr)/(span/864e5)*(o.barDays||1)*0.7),base=y(o.zero?0:lo);
  (o.bars||[]).forEach(function(p){if(p[1]>0&&p[0]>=o.from&&p[0]<=o.to)s+='<rect x="'+(x(p[0])-bw/2).toFixed(1)+'" y="'+y(p[1]).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(0,base-y(p[1])).toFixed(1)+'" fill="'+(o.barColor||'var(--border-2)')+'"/>';});
  series.forEach(function(sr){var raw=sr.pts.filter(function(p){return p[1]!=null&&p[0]>=o.from&&p[0]<=o.to}),pts=raw.map(function(p){return [x(p[0]),y(p[1])]});
    if(sr.dots)pts.forEach(function(p){s+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+(sr.r||1.6)+'" fill="'+sr.color+'" opacity="'+(sr.op||.45)+'"/>'});
    else if(pts.length>1){/* missing days break the line instead of being bridged: a gap longer than 2.5x the usual spacing (min 3 days) */
      var dt=[];for(var k=1;k<raw.length;k++)dt.push((Date.parse(raw[k][0])-Date.parse(raw[k-1][0]))/864e5);var md=dt.slice().sort(function(a,b){return a-b})[Math.floor(dt.length/2)]||1,lim=Math.max(3,md*2.5),seg=[pts[0]];
      for(var k2=1;k2<pts.length;k2++){if(dt[k2-1]>lim){if(seg.length>1)s+='<path d="'+path(seg)+'" fill="none" stroke="'+sr.color+'" stroke-width="'+(sr.w||1.8)+'"/>';else s+='<circle cx="'+seg[0][0].toFixed(1)+'" cy="'+seg[0][1].toFixed(1)+'" r="2.2" fill="'+sr.color+'"/>';seg=[];}seg.push(pts[k2]);}
      if(seg.length>1)s+='<path d="'+path(seg)+'" fill="none" stroke="'+sr.color+'" stroke-width="'+(sr.w||1.8)+'"/>';else if(seg.length)s+='<circle cx="'+seg[0][0].toFixed(1)+'" cy="'+seg[0][1].toFixed(1)+'" r="2.2" fill="'+sr.color+'"/>';}
    else if(pts.length)s+='<circle cx="'+pts[0][0].toFixed(1)+'" cy="'+pts[0][1].toFixed(1)+'" r="3" fill="'+sr.color+'"/>';});
  return s+'</svg>';}
// smoothed trend: raw dots + 7-day moving average line
function smooth(pts,color,label){return [{pts:pts,color:color,dots:true},{pts:ma(pts,7),color:color,w:1.8,label:label}];}
function trendCard(title,unit,dec,lines,from,to,note){
  var main=lines.filter(function(l){return l.pts.length})[0];if(!main)return '';
  var last=main.pts[main.pts.length-1],r30=mean(main.pts.filter(function(p){return p[0]>=addDays(to,-29)}).map(function(p){return p[1]})),
      r90=mean(main.pts.filter(function(p){return p[0]<addDays(to,-60)&&p[0]>=addDays(to,-120)}).map(function(p){return p[1]}));
  var ser=[];lines.forEach(function(l){if(l.pts.length)ser=ser.concat(l.raw?[{pts:l.pts,color:l.color,w:1.8}]:smooth(l.pts,l.color))});
  return '<div class="card"><h3>'+title+' <span class="muted" style="font-size:13px;font-weight:400">'+it(last[1],dec)+(unit?' '+unit:'')+' · '+dshort(last[0])+'</span></h3><div class="sub">'+
    (r30!=null?'media 30 gg '+it(r30,dec)+(unit?' '+unit:''):'')+(r90!=null?' · 2–4 mesi fa '+it(r90,dec):'')+(note?' · '+note:'')+'</div><div style="margin-top:10px">'+tchart(ser,{from:from,to:to,dec:dec,H:110})+'</div>'+
    (lines.filter(function(l){return l.pts.length}).length>1?legend(lines.filter(function(l){return l.pts.length}).map(function(l){return [l.label,l.color]})):'')+'</div>';}
// ---- derived daily series ----
function eatenMap(D){var o={};(D.meals&&D.meals.days||[]).forEach(function(d){if(d.kcal!=null)o[d.day]=d.kcal});
  var e={};(D.meals&&D.meals.entries||[]).forEach(function(m){if(m.kcal!=null)e[m.day]=(e[m.day]||0)+m.kcal});
  Object.keys(e).forEach(function(d){if(o[d]==null)o[d]=e[d]});return o;} // Forma diary only (Health 'dietary energy' is not a complete log)
// burned = active + resting, only when the day is complete (both values, resting >= threshold set server-side)
function burnedOf(d){return d&&d.burn_complete?d.active_kcal+d.resting_kcal:null;}
function burnedPartial(d){return d&&(d.active_kcal!=null||d.resting_kcal!=null)?(d.active_kcal||0)+(d.resting_kcal||0):null;}
function weightPts(D){var m=hkMap(D,'body_mass.last');D.days.forEach(function(d){if(d.weight_kg!=null&&m[d.day]==null)m[d.day]=d.weight_kg});return Object.keys(m).sort().map(function(k){return [k,m[k]]});}
// Neutral formula defaults. Calorie estimates must be configured by the owner.
// meal_targets supplies estimates and protein bounds; constants below are fallbacks and formula settings.
// Round range midpoints to integer kcal before calculation; final kcal to integers and grams to 1 decimal.
// Carbs use capped, unrounded protein and unrounded fat extremes (low carbs pairs with high fat).
var MACRO_TARGETS={
  estimates:{},
  protein:{base:100,threshold:2200,slope:0.1,cap:140},
  fat:{lo:0.25,hi:0.30},fiber:30,
  kcalPerGram:{protein:4,fat:9,carbs:4},decimals:{kcal:0,grams:1}
};
function configure(D){
  var c=D&&D.config;if(!c)return;
  if(c.tz)fallbackTz=c.tz;
  if(c.targets){MACRO_TARGETS.estimates=c.targets.estimates;MACRO_TARGETS.protein=c.targets.protein;MACRO_TARGETS.fat=c.targets.fat;MACRO_TARGETS.fiber=c.targets.fiber;}
  var stored=D.meals&&D.meals.targets;if(stored&&Number.isFinite(stored.fiber)&&stored.fiber>=0&&stored.fiber<=200)MACRO_TARGETS.fiber=stored.fiber;
}
function macroConfig(D){
  var c=D.config&&D.config.targets||MACRO_TARGETS;
  return {estimates:c.estimates||{},protein:c.protein||MACRO_TARGETS.protein,fat:c.fat||MACRO_TARGETS.fat,fiber:c.fiber==null?MACRO_TARGETS.fiber:c.fiber,kcalPerGram:MACRO_TARGETS.kcalPerGram,decimals:MACRO_TARGETS.decimals};
}
// Complete Apple expenditure is real. Targets for today and incomplete days use the day-type estimate.
function dayEstimate(D,day){
  var cfg=macroConfig(D),md=byDay(D.meals&&D.meals.days)[day],type=md&&md.day_type||null,
    targets=D.meals&&D.meals.targets||{},stored=Object.prototype.hasOwnProperty.call(targets,type)?targets[type]:(targets.estimates&&Object.prototype.hasOwnProperty.call(targets.estimates,type)?targets.estimates[type]:null),
    lo=Array.isArray(stored)?stored[0]:stored,hi=Array.isArray(stored)&&stored.length>1?stored[1]:lo,
    estimate=Number.isFinite(lo)&&lo>0&&Number.isFinite(hi)&&hi>0?
      (lo===hi?lo:+(lo/2+hi/2).toFixed(cfg.decimals.kcal)):
      (Object.prototype.hasOwnProperty.call(cfg.estimates,type)?cfg.estimates[type]:null);
  return {type:type,targets:targets,estimate:estimate};
}
function expenditureFor(D,day,today){
  today=today||localDay();var x=byDay(D.days)[day]||{},full=day<today,
    floor=(D.quality&&D.quality.resting_min_complete)||1200,
    r={burned:full?burnedOf(x):null,partial:full?null:burnedPartial(x),inc:full&&burnedOf(x)==null?burnedPartial(x):null,
      dropped:x.active_kcal_dropped!=null};
  r.incWhy=x.active_kcal_dropped!=null?'kcal attive scartate (valore impossibile)':x.active_inconsistent?'kcal attive incoerenti con gli allenamenti':(x.resting_kcal==null||x.resting_kcal<floor)&&(x.active_kcal!=null||x.resting_kcal!=null)?'basale incompleto (Watch non indossato tutto il giorno)':null;
  r.bsrc=r.burned!=null?'apple':null;r.psrc=r.partial!=null?'apple':null;
  r.estimated=r.burned==null;r.estimate=r.estimated?dayEstimate(D,day).estimate:null;
  if(full&&r.estimated)r.bwhy=(r.inc!=null?'Apple incompleto':r.dropped?'Apple: dato scartato':'Apple: nessun dato')+(r.estimate!=null?' · stima per tipo di giornata':'');
  return r;
}
function targetFor(D,day,today){
  var cfg=macroConfig(D),est=dayEstimate(D,day),type=est.type,targets=est.targets,
    energy=expenditureFor(D,day,today),estimated=energy.burned==null,kcal=estimated?est.estimate:energy.burned;
  if(kcal==null)return null; // Fibre remains independent of the calorie/day-type data gap.
  // Stored protein bounds are the formula's base/cap, never a static display range.
  var protein=targets.protein,base=Array.isArray(protein)?protein[0]:protein&&typeof protein==='object'?(protein.base==null&&Number.isFinite(protein.cap)?cfg.protein.base:protein.base):protein,
    cap=Array.isArray(protein)&&protein.length>1?protein[1]:protein&&typeof protein==='object'&&Number.isFinite(protein.cap)?protein.cap:cfg.protein.cap;
  if(!Number.isFinite(base)||base<0||!Number.isFinite(cap)||cap<base){base=cfg.protein.base;cap=cfg.protein.cap;}
  var slope=protein&&Number.isFinite(protein.slope)&&protein.slope>=0?protein.slope:cfg.protein.slope,
    threshold=protein&&Number.isFinite(protein.threshold)&&protein.threshold>=0?protein.threshold:cfg.protein.threshold,
    fatLo=targets.fat&&Number.isFinite(targets.fat.lo)&&targets.fat.lo>=0&&targets.fat.lo<=1?targets.fat.lo:cfg.fat.lo,
    fatHi=targets.fat&&Number.isFinite(targets.fat.hi)&&targets.fat.hi>=0&&targets.fat.hi<=1?targets.fat.hi:cfg.fat.hi,
    fat=fatHi>=fatLo?{lo:fatLo,hi:fatHi}:cfg.fat,
    fiber=Number.isFinite(targets.fiber)&&targets.fiber>=0&&targets.fiber<=200?targets.fiber:cfg.fiber,
    p=Math.min(cap,base+slope*Math.max(0,kcal-threshold)),
    flo=kcal*fat.lo/cfg.kcalPerGram.fat,fhi=kcal*fat.hi/cfg.kcalPerGram.fat,
    clo=(kcal-cfg.kcalPerGram.protein*p-cfg.kcalPerGram.fat*fhi)/cfg.kcalPerGram.carbs,
    chi=(kcal-cfg.kcalPerGram.protein*p-cfg.kcalPerGram.fat*flo)/cfg.kcalPerGram.carbs,
    round=function(n,d){return +n.toFixed(d)},value=round(kcal,cfg.decimals.kcal),source=estimated?'estimate':energy.bsrc;
  return {type:type,lo:value,hi:value,estimated:estimated,source:source,
    protein:{value:round(p,cfg.decimals.grams)},fat:{lo:round(flo,cfg.decimals.grams),hi:round(fhi,cfg.decimals.grams)},
    carbs:{lo:round(clo,cfg.decimals.grams),hi:round(chi,cfg.decimals.grams)},fiber:{value:fiber},
    kcal:{value:value,estimated:estimated,source:source}};
}

// Display-only progress models. Targets still come exclusively from targetFor.
function progressNumber(n){return it(n,n%1?1:0);}
function macroProgress(o){
  var t=o.target,range=!!(t&&t.value==null),max=t?(range?t.hi:t.value):null,min=t?(range?t.lo:t.value):null,
    known=Number.isFinite(o.consumed),v=known?Math.max(0,o.consumed):null,hasTarget=Number.isFinite(max)&&max>0,
    fmt=progressNumber,goal=hasTarget?(range?'range '+fmt(min)+'–'+fmt(max):'obiettivo '+fmt(max))+' g':'obiettivo —',
    over=known&&hasTarget&&v>max,delta=known&&hasTarget?+(v<min?min-v:over?v-max:0).toFixed(1):null,
    fullStatus=!known?'nessun dato':!hasTarget?'obiettivo non disponibile':over?'oltre di '+fmt(delta)+' g':
      v<min?(range?'sotto il range · mancano ':'mancano ')+fmt(delta)+' g':range?'nel range':'obiettivo raggiunto',
    status=fullStatus.replace(/^sotto il range · /,'').replace(/^obiettivo raggiunto$/,'raggiunto'),
    targetWords=hasTarget?(range?(o.estimated?'obiettivo stimato, ':'')+'range '+fmt(min)+'–'+fmt(max):'obiettivo '+(o.estimated?'stimato ':'')+fmt(max))+' grammi':'obiettivo non disponibile',
    words=!known?o.label+': nessun dato, '+targetWords:o.label+' '+(o.partial?'almeno ':'')+fmt(v)+' grammi, '+targetWords+', '+fullStatus.replace(' · ', ', ').replace(/ g$/, ' grammi');
  return {role:known&&hasTarget?'meter':'img',min:0,max:hasTarget?max:null,now:known&&hasTarget?Math.min(v,max):null,
    value:known?(o.partial?'≥ ':'')+fmt(v)+' g':'—',status:status,targetLine:goal,ariaText:words+'.',
    fill:known&&hasTarget?Math.min(1,v/max):0,halo:over,dotted:!known,
    band:hasTarget&&range?{start:min/max,length:(max-min)/max}:null};
}
function kcalBarModel(o){
  var target=Number.isFinite(o.target)&&o.target>0?o.target:null,known=Number.isFinite(o.consumed),v=known?Math.max(0,o.consumed):null,
    scale=target?Math.max(target*1.2,v||0):v||1,over=known&&target&&v>target,delta=known&&target?Math.abs(v-target):null,
    status=!known?'nessun dato':!target?'obiettivo non disponibile':v===target?'obiettivo raggiunto':(over?'oltre di ':'mancano ')+it(delta)+' kcal',
    words='Calorie: '+(known?it(v)+' chilocalorie':'nessun dato')+', '+(target?'obiettivo '+(o.estimated?'stimato ':'')+it(target)+' chilocalorie':'obiettivo non disponibile')+', '+status;
  return {role:known&&target?'meter':'img',min:0,max:target,now:known&&target?Math.min(v,target):null,scale:scale,
    tick:target?target/scale:null,fill:known&&target?Math.min(v,target)/scale:0,
    striped:over?{start:target/scale,length:(v-target)/scale}:null,dashed:!!o.estimated,
    value:known?it(v):'—',targetText:(o.estimated&&target?'~':'')+(target?it(target):'—')+' kcal',status:status,
    estimateLabel:o.estimated?'stima'+(o.dayLabel?' · giorno '+o.dayLabel:''):'',ariaText:words+'.'};
}

function renderBilancio(D,today){
  var dd=byDay(D.days),E=eatenMap(D),day=today;
  if(burnedPartial(dd[today])==null&&E[today]==null){for(var i=1;i<=3;i++){var c=addDays(today,-i);if(burnedPartial(dd[c])!=null||E[c]!=null){day=c;break;}}}
  var T=dd[day]||{},partial=day===today||!T.burn_complete,burned=day===today?burnedPartial(T):burnedOf(T),eaten=E[day];if(burned==null&&eaten==null)return;
  var at=D.meta.health_last_ingest&&day===today?localTime(D.meta.health_last_ingest.at):'',tg=targetFor(D,day,today);
  var h=head((day===today?'Oggi · ':'')+dlabel(day,true)+(at?' · aggiornato '+at:''),'Bilancio calorico',partial?'<span class="badge">parziale</span>':REAL)+'<div class="card hero-card">';
  if(eaten!=null&&burned!=null){var bal=eaten-burned,cls=bal>0?'fail':'ok';
    h+='<div class="eyebrow">'+(bal>0?'Surplus':'Deficit')+(day===today?' finora':'')+'</div><div class="big '+cls+'" style="margin-top:8px">'+(bal>0?'+':'')+it(bal)+'<small>kcal</small></div>';}
  else if(burned!=null)h+='<div class="eyebrow">Bruciate'+(day===today?' finora':'')+'</div><div class="big acc" style="margin-top:8px">'+it(burned)+'<small>kcal</small></div><div class="sub" style="margin-top:8px">Nessun pasto registrato per questo giorno.</div>';
  else h+='<div class="eyebrow">Mangiate</div><div class="big" style="margin-top:8px">'+it(eaten)+'<small>kcal</small></div><div class="sub" style="margin-top:8px">Nessun dato di dispendio da Apple Watch per questo giorno.</div>';
  var mx=Math.max(burned||0,eaten||0,tg?tg.hi:0,1);
  h+='<div style="margin-top:16px">';
  if(eaten!=null)h+='<div class="kv first"><span>Mangiate'+(tg?' · obiettivo '+(tg.estimated?'stima ':'')+(tg.type?esc(tg.type)+' ':'')+it(tg.lo)+(tg.hi!==tg.lo?'–'+it(tg.hi):''):'')+'</span><b>'+it(eaten)+' kcal</b></div><div class="bar"><i style="width:'+(eaten/mx*100).toFixed(1)+'%;background:var(--text)"></i></div>';
  if(burned!=null)h+='<div class="kv" style="border:0;margin-top:6px"><span>Bruciate · attive '+it(T.active_kcal)+' + riposo '+it(T.resting_kcal)+'</span><b>'+it(burned)+' kcal</b></div><div class="bar"><i style="width:'+((T.resting_kcal||0)/mx*100).toFixed(1)+'%;opacity:.45"></i><i style="left:'+((T.resting_kcal||0)/mx*100).toFixed(1)+'%;width:'+((T.active_kcal||0)/mx*100).toFixed(1)+'%"></i></div>';
  h+='</div>'+(day===today&&burned!=null?'<div class="sub" style="margin-top:10px">Giornata parziale: il dispendio cresce fino a fine giornata; esclusa da medie e previsione.</div>':day!==today&&!T.burn_complete&&burnedPartial(T)!=null?'<div class="sub" style="margin-top:10px">Dispendio incompleto (Apple Watch non indossato tutto il giorno): bilancio non calcolato.</div>':'')+'</div>';
  var both=dayRange(addDays(today,-14),addDays(today,-1)).filter(function(d){return E[d]!=null&&burnedOf(dd[d])!=null});
  if(both.length){var cum=both.reduce(function(a,d){return a+E[d]-burnedOf(dd[d])},0),avg=cum/both.length,w4=avg*28;
    h+='<div class="card"><h3>Previsione peso <span class="esempio">stima</span></h3><div class="sub">Stima, non una misura: '+both.length+' giorni completi (oggi escluso) con pasti nel diario e dispendio Apple Watch completo; ipotesi 7.700 kcal ≈ 1 kg di tessuto. Acqua e glicogeno spostano la bilancia di ±1 kg.</div><div class="grid3" style="margin:14px 0 4px">'+
     tile(both.length+' giorni',(cum>0?'+':'')+it(cum/7700,2),'kg',(cum>0?'+':'')+it(cum)+' kcal',cum>0?'fail':'ok')+
     tile('4 sett.','≈ '+(w4>0?'+':'')+it(w4/7700,1),'kg','da '+it(w4/7000,1)+' a '+it(w4/8000,1),w4>0?'fail':'ok')+tile('Media/giorno',(avg>0?'+':'')+it(avg),'kcal','')+'</div></div>';}
  else h+='<div class="card"><h3>Previsione peso</h3><div class="sub">Nessun dato: servono giorni completi con pasti registrati e dispendio Apple Watch.</div></div>';
  var last7=dayRange(addDays(today,-6),today),rows='';
  last7.forEach(function(d,i){var bp=burnedPartial(dd[d]),b=d===today?null:burnedOf(dd[d]),e=E[d];rows+='<div class="row'+(i?'':' first')+'"><div class="main"><b>'+dlabel(d,true)+(d===today?' · parziale':'')+'</b><span>'+(e!=null?'mangiate '+it(e):'pasti: nessun dato')+' · '+(b!=null?'bruciate '+it(b):bp!=null?'bruciate '+it(bp)+(d===today?' finora':' (incompleto)'):'dispendio: nessun dato')+'</span></div><div class="end"><b class="'+(e!=null&&b!=null?(e-b>0?'fail':'ok'):'')+'">'+(e!=null&&b!=null?(e-b>0?'+':'')+it(e-b):'—')+'</b><span>kcal</span></div></div>';});
  h+='<div class="card" style="padding:6px 16px">'+rows+'</div>';
  set('bilancio',h);return true;
}
// Training load. TRIMP (Banister 1991, male coefficients): minutes × ΔHR × 0.64·e^(1.92·ΔHR), ΔHR=(HRavg−HRrest)/(HRmax−HRrest).
// HRmax uses measured Apple workouts. HRrest is that day’s Apple resting HR, else the median Apple resting HR.
// Sessions without average HR get no TRIMP. CTL/ATL use 42/7-day exponentially weighted averages.
// Workouts arrive as de-duplicated Apple sessions.
var TRIMP_K=0.64,TRIMP_B=1.92;
function trimp(min,avg,rest,max){if(!(min>0)||avg==null||rest==null||max==null||max<=rest)return null;var x=Math.max(0,Math.min(1,(avg-rest)/(max-rest)));return min*x*TRIMP_K*Math.exp(TRIMP_B*x);}
function median(a){a=a.filter(function(v){return v!=null}).sort(function(x,y){return x-y});return a.length?a[Math.floor(a.length/2)]:null;}
function ewma(L,days){var ctl=0,atl=0;return days.map(function(d){var l=L[d]||0;ctl+=(l-ctl)/42;atl+=(l-atl)/7;return {day:d,load:l,ctl:ctl,atl:atl};});}
function hrmaxOf(D){var m=D.quality&&D.quality.hrmax_measured;return m&&Number.isFinite(m.value)&&m.value>120&&m.value<230?{value:m.value,label:'misurata'}:null;}
function loadSeries(D,from,to){
  var dd=byDay(D.days),hm_=hrmaxOf(D),hrmax=hm_&&hm_.value,rmed=median(D.days.map(function(d){return d.resting_hr}));
  var noHR=0,kept=D.workouts.filter(function(w){return w.start&&w.duration_s}).map(function(w){
    var rest=(dd[w.day]&&dd[w.day].resting_hr)||rmed,t=trimp(w.duration_s/60,w.avg_hr,rest,hrmax);if(t==null)noHR++;
    return {w:w,t:t||0};});
  var L={};kept.forEach(function(k){L[k.w.day]=(L[k.w.day]||0)+k.t});
  return {series:ewma(L,dayRange(from,to)),sessions:kept,hrmax:hrmax,hrmaxLabel:hm_&&hm_.label,noHR:noHR};}
function renderCarico(D,today){
  if(!D.workouts.length)return;if(!hrmaxOf(D)){set('carico',head('12 mesi','Carico e forma','<span class="badge">da configurare</span>')+emptyCard('Serve la FC massima per calcolare il carico (TRIMP): nessuna FC max registrata.'));return true;}var from=addDays(today,-364),ls=loadSeries(D,addDays(today,-420),today),S=ls.series.filter(function(r){return r.day>=from});
  var last=S[S.length-1],tsb=last.ctl-last.atl,n12=ls.sessions.filter(function(k){return k.w.day>=from}).length;
  var C=S.map(function(r){return [r.day,r.ctl]}),A=S.map(function(r){return [r.day,r.atl]}),B=S.map(function(r){return [r.day,r.load]});
  var h=head('12 mesi · '+n12+' allenamenti','Carico e forma',REAL)+'<div class="grid3" style="margin-top:14px">'+tile('Forma (CTL)','<span style="color:var(--info)">'+it(last.ctl)+'</span>','','media 42 gg')+tile('Fatica (ATL)',it(last.atl),'','media 7 gg','acc')+tile('Freschezza',(tsb>=0?'+':'')+it(tsb),'','CTL − ATL',tsb>=0?'ok':'fail')+'</div>';
  h+='<div class="card"><h3>12 mesi</h3><div class="sub">Carico giornaliero = TRIMP di Banister dalla FC media (sessioni Apple Watch duplicate contate una volta). FC max '+ls.hrmax+' bpm ('+ls.hrmaxLabel+'), coefficienti uomo. Forma = media esponenziale 42 gg, fatica = 7 gg.'+(ls.noHR?' '+ls.noHR+' sessioni senza FC media escluse.':'')+'</div><div style="margin-top:12px">'+tchart([{pts:C,color:'var(--info)',w:2},{pts:A,color:'var(--accent)',w:1.2}],{from:from,to:today,bars:B,zero:true,H:170})+'</div>'+legend([['Forma','var(--info)'],['Fatica','var(--accent)'],['Carico','var(--border-2)',1]])+'</div>';
  var f6=addDays(today,-41);h+='<div class="card"><h3>Ultime 6 settimane</h3><div style="margin-top:12px">'+tchart([{pts:C,color:'var(--info)',w:2.2},{pts:A,color:'var(--accent)',w:1.6}],{from:f6,to:today,bars:B,zero:true,H:150})+'</div></div>';
  set('carico',h);return true;}
function renderPasti(D,today){
  var M=D.meals||{},E=M.entries||[];
  var byd={};E.forEach(function(m){(byd[m.day]=byd[m.day]||[]).push(m)});
  var day=today,list=byd[day]||[],md=byDay(M.days)[day]||{},tg=targetFor(D,day,today),N=typeof window!=='undefined'&&window.NUT,
    nx=N&&N.day(E,day),tot=nx?nx.tot:{},partial=nx?nx.macPartial:{};
  var kcal=md.kcal!=null?md.kcal:(list.length?sum(list.map(function(m){return m.kcal})):null),prot=tot.protein!=null?tot.protein:list.some(function(m){return m.protein!=null})?sum(list.map(function(m){return m.protein})):md.protein;
  var macro=function(k,label,v){var t=tg&&tg[k],goal=t?(t.value!=null?it(t.value,1):it(t.lo,1)+'–'+it(t.hi,1)):'—';
    return tile(label,(v!=null&&partial[k]?'≥ ':'')+it(v,1),'g',(k==='protein'&&md.protein_min!=null?'stima '+it(md.protein_min)+'–'+it(md.protein_max)+' · ':'')+'obiettivo '+goal+(t?' g':''));};
  var h=head('Oggi · '+dlabel(day,true),'Pasti',REAL)+'<div class="grid3" style="margin-top:14px">'+
    tile('Mangiate',it(kcal),'kcal',md.kcal_min!=null?'stima '+it(md.kcal_min)+'–'+it(md.kcal_max):'')+
    tile('Obiettivo',tg?it(tg.lo):'—',tg?'kcal':'',tg?(tg.estimated?'stima · ':'')+(tg.type?'giorno '+esc(tg.type):'dispendio completo'):'tipo di giorno non indicato')+
    macro('protein','Proteine',prot)+macro('fat','Grassi',tot.fat)+macro('carbs','Carboidrati',tot.carbs)+
    tile('Fibre',it(tot.fiber,1),'g','obiettivo '+it(MACRO_TARGETS.fiber)+' g'+(tot.fiber==null?' · nessun dato':''))+'</div>';
  if(list.length){var order=['colazione','spuntino','pranzo','merenda','cena','altro','giornata'],g={};list.forEach(function(m){(g[m.meal]=g[m.meal]||[]).push(m)});
    h+='<div class="card meal">';order.forEach(function(k){if(!g[k])return;var tk=sum(g[k].map(function(m){return m.kcal}));
      h+='<h4>'+k+(g[k][0].time?' · '+g[k][0].time:'')+' · '+it(tk)+' kcal</h4>';g[k].forEach(function(m,i){h+='<div class="kv'+(i?'':' first')+'"><span>'+esc(m.title||k)+(m.notes?' <span class="muted">· '+esc(m.notes)+'</span>':'')+'</span><b>'+it(m.kcal)+' kcal'+(m.protein!=null?' · '+it(m.protein,m.protein%1?1:0)+' g':'')+'</b></div>';});});
    h+='</div>';}else h+=emptyCard('Nessun pasto registrato per questo giorno.');
  var dd=byDay(D.days),EM=eatenMap(D),rows='',ds=Object.keys(EM).sort().slice(-14).reverse();
  ds.forEach(function(d,i){var b=d===today?null:burnedOf(dd[d]);rows+='<div class="row'+(i?'':' first')+'"><div class="main"><b>'+dlabel(d,true)+'</b><span>mangiate '+it(EM[d])+' · '+(b!=null?'bruciate '+it(b):'dispendio: nessun dato')+'</span></div><div class="end"><b>'+(b!=null?(EM[d]-b>0?'+':'')+it(EM[d]-b):'—')+'</b><span>kcal</span></div></div>';});
  if(rows)h+='<div class="card" style="padding:6px 16px">'+rows+'</div>';
  set('pasti',h);return true;}
function renderSonnoApple(D){
  var dd=byDay(D.days),days=D.days.filter(function(d){return d.sleep_asleep_min}).slice(-7);if(!days.length)return;
  var top=Math.max(10,Math.ceil(Math.max.apply(null,days.map(function(d){return ((d.sleep_asleep_min||0)+(d.sleep_awake_min||0))/60}))));
  var W=354,H=180,n=days.length,x=function(i){return 30+i*(W-40)/Math.max(n-1,1)},y=function(h){return H-22-(Math.min(h,top)/top)*(H-36)};
  var sv='<svg viewBox="0 0 '+W+' '+H+'" class="ch">';[0,Math.round(top/2),top].forEach(function(h){sv+='<line x1="26" x2="'+(W-4)+'" y1="'+y(h).toFixed(1)+'" y2="'+y(h).toFixed(1)+'" stroke="var(--border)"/><text x="0" y="'+(y(h)+3).toFixed(1)+'">'+h+' h</text>'});
  days.forEach(function(s,i){var b=0,parts=s.sleep_deep_min||s.sleep_rem_min||s.sleep_core_min?[[s.sleep_deep_min,'var(--deep)'],[s.sleep_rem_min,'var(--rem)'],[s.sleep_core_min,'var(--light)'],[s.sleep_awake_min,'var(--awake)']]:[[s.sleep_asleep_min,'var(--light)'],[s.sleep_awake_min,'var(--awake)']];
    parts.forEach(function(p){var v=(p[0]||0)/60;sv+='<rect x="'+(x(i)-13).toFixed(1)+'" y="'+y(b+v).toFixed(1)+'" width="26" height="'+(y(b)-y(b+v)).toFixed(1)+'" fill="'+p[1]+'"/>';b+=v;});sv+='<text x="'+(x(i)-13).toFixed(1)+'" y="'+(H-6)+'">'+dlabel(s.day)+'</text>';});
  sv+='</svg>';var avg=mean(days.map(function(d){return d.sleep_asleep_min}));
  set('sonno',head('Ultime '+n+' notti · Salute (Apple Watch)','Recupero e sonno',REAL)+'<div class="grid3" style="margin-top:14px">'+tile('Sonno medio',hm(avg*60000))+tile('FC a riposo',it(mean(days.map(function(d){return dd[d.day].resting_hr}))),'bpm')+tile('HRV (SDNN)',it(mean(days.map(function(d){return dd[d.day].hrv_ms}))),'ms')+'</div><div class="card"><h3>Fasi del sonno</h3><div style="margin-top:12px">'+sv+'</div>'+legend([['Profondo','var(--deep)',1],['REM','var(--rem)',1],['Core','var(--light)',1],['Sveglio','var(--awake)',1]])+'</div>');return true;}

function renderAttivita(D,today,T){
  if(!T.active_kcal&&!T.steps) return;
  var w=D.workouts.filter(function(x){return x.day===today});
  var last7=dayRange(addDays(today,-6),today);
  var dd=byDay(D.days);
  var strip=last7.map(function(d){var a=dd[d]&&dd[d].active_kcal,on=d===today;return '<div class="daycell'+(on?' on':'')+'"><div class="dl">'+dlabel(d).split(' ')[0]+'</div><div class="dn">'+d.slice(8)+'</div><div class="dk">'+(a?it(a):'—')+'</div></div>';}).join('');
  var h=head(dlabel(today,true),'Attività','<span class="badge">Apple Watch</span>')+'<div class="daystrip">'+strip+'</div><div class="hint">kcal attive per giorno</div>';
  w.forEach(function(x){var pace=x.distance_km&&x.duration_s?x.duration_s/60/x.distance_km:null;
    h+='<div class="card" style="margin-top:12px"><div class="row first"><span class="ico">▶</span><div class="main"><b>'+esc(x.type||'Allenamento')+'</b><span>'+(x.start?localTime(x.start)+' · ':'')+'Apple Salute'+(x.merged?' · '+x.merged+' copie unite':'')+'</span></div></div><div class="grid3" style="margin:8px 0 0">'+
      tile('Durata',x.duration_s?mmss(x.duration_s):'—')+tile('Distanza',x.distance_km?it(x.distance_km,2):'—',x.distance_km?'km':'')+tile('Passo',pace?mmss(pace*60):'—',pace?'/km':'')+
      tile('Kcal',it(x.kcal))+tile('FC media',it(x.avg_hr),'bpm')+tile('FC max',it(x.max_hr),'bpm')+'</div></div>';});
  h+='<div class="eyebrow" style="margin:18px 0 10px">Totali della giornata</div><div class="grid2">'+
    tile('Movimento',it(T.active_kcal),'kcal attive'+(T.active_kcal_dropped!=null?' (dato anomalo scartato)':T.active_inconsistent?' (incompleto)':''),'+'+it(T.resting_kcal)+' a riposo','acc')+tile('Esercizio',it(T.exercise_min),'min')+tile('Passi',it(T.steps))+tile('Distanza',it(T.distance_km,1),'km')+tile('In piedi',it(T.stand_h),'h')+tile('Energia totale',it(burnedPartial(T)),'kcal','finora · giornata parziale')+'</div>';
  set('attivita',h);
}
function mmss(sec){sec=Math.round(sec);return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');}
function renderCorpo(D,today){
  var B=D.body||[],scans={};B.forEach(function(r){var k=r.day;(scans[k]=scans[k]||{})[r.source+'.'+r.key]=r.value;});
  var sd=Object.keys(scans).sort(),from=addDays(today,-364),W=weightPts(D),F=hkS(D,'body_fat_percentage.last'),LM=hkS(D,'lean_body_mass.last');
  if(!sd.length&&!W.length&&!F.length)return;
  var h=head(sd.length?'Ultima misura '+dlabel(sd[sd.length-1],true):'Salute','Composizione corporea',REAL);
  if(sd.length){var s=scans[sd[sd.length-1]],g=function(k){return s['bodygram.'+k]};
    if(g('weight_kg')!=null){h+='<div class="grid3" style="margin-top:14px">'+tile('Peso',it(g('weight_kg'),1),'kg','BMI '+it(g('bmi'),1))+tile('Massa grassa',it(g('fm_pct'),1),'%',it(g('fm_kg'),1)+' kg','acc')+tile('Massa magra',it(g('ffm_kg'),1),'kg','FFM')+
      tile('Angolo di fase',it(g('phase_angle_deg'),1),'°','')+tile('Metabolismo basale',it(g('bmr_kcal')),'kcal','')+tile('Massa cellulare',it(g('bcm_kg'),1),'kg','BCM')+'</div>';
      h+='<div class="card"><h3>Bodygram · '+dlabel(sd[sd.length-1],true)+'</h3>'+[['Acqua totale (TBW)',g('tbw_l'),'l',1],['Acqua extracellulare',g('ecw_l'),'l',1,g('ecw_pct')],['Acqua intracellulare',g('icw_l'),'l',1,g('icw_pct')],['Idratazione (TBW/FFM)',g('hydration_pct'),'%',1],['Massa muscolare totale',g('mm_kg'),'kg',1,g('mm_pct')],['Muscolo-scheletrica (SMM)',g('smm_kg'),'kg',1],['Muscolare appendicolare (ASMM)',g('asmm_kg'),'kg',1]].filter(function(r){return r[1]!=null}).map(function(r,i){return '<div class="kv'+(i?'':' first')+'"><span>'+r[0]+'</span><b>'+it(r[1],r[3])+' '+r[2]+(r[4]!=null?' <span class="muted" style="font-weight:400">'+it(r[4],1)+'%</span>':'')+'</b></div>'}).join('')+'</div>';}
    var nu=Object.keys(s).filter(function(k){return /^nutrium\..*_cm$/.test(k)});
    if(nu.length){var lab={waist_cm:'Vita',abdomen_cm:'Addome',hips_cm:'Fianchi',chest_cm:'Torace',arm_cm:'Braccio',forearm_cm:'Avambraccio',wrist_cm:'Polso',thigh_root_cm:'Radice coscia',calf_max_cm:'Polpaccio',ankle_cm:'Caviglia'};
      h+='<div class="card"><h3>Circonferenze</h3><div class="grid3" style="margin-top:10px">'+nu.map(function(k){var kk=k.split('.')[1];return tile(lab[kk]||kk,it(s[k],1),'cm')}).join('')+'</div>'+(s['nutrium.waist_hip_ratio']!=null?'<div class="sub" style="margin-top:8px">Rapporto vita-fianchi '+it(s['nutrium.waist_hip_ratio'],2)+'</div>':'')+'</div>';}}
  var bg=sd.filter(function(d){return scans[d]['bodygram.weight_kg']!=null}).map(function(d){return [d,scans[d]['bodygram.weight_kg']]});
  var wl=[{pts:since(W,from),color:'var(--text)',label:'Salute'}];
  if(W.length||bg.length){var ser=[];wl.forEach(function(l){if(l.pts.length)ser=ser.concat(smooth(l.pts,l.color))});ser.push({pts:bg,color:'var(--accent)',dots:true,r:4,op:1});
    h+='<div class="card"><h3>Peso · 12 mesi</h3><div style="margin-top:10px">'+tchart(ser,{from:from,to:today,dec:1,H:130})+'</div>'+legend([['Salute','var(--text)'],['Bodygram','var(--accent)']])+'</div>';}
  var bf=sd.filter(function(d){return scans[d]['bodygram.fm_pct']!=null}).map(function(d){return [d,scans[d]['bodygram.fm_pct']]});
  if(F.length||bf.length){var s2=F.length?smooth(since(F,from),'var(--text)'):[];s2.push({pts:bf,color:'var(--accent)',dots:true,r:4,op:1});
    h+='<div class="card"><h3>Massa grassa % · 12 mesi</h3><div style="margin-top:10px">'+tchart(s2,{from:from,to:today,dec:1,H:110})+'</div>'+legend([['Salute (bilancia)','var(--text)'],['Bodygram','var(--accent)']])+'</div>';}
  if(LM.length)h+=trendCard('Massa magra (Salute)','kg',1,[{pts:since(LM,from),color:'var(--ok)',label:'Salute'}],from,today);
  set('corpo',h);return true;}
function renderTendenze(D,today){
  var from=addDays(today,-364),cards=[];
  function card(t,u,dec,lines,note){var c=trendCard(t,u,dec,lines.map(function(l){l.pts=since(l.pts,from);return l}),from,today,note);if(c)cards.push(c);}
  var rhr=hkS(D,'resting_heart_rate.avg');if(!rhr.length)rhr=ptsFrom(D.days,'resting_hr');
  var hrv=hkS(D,'heart_rate_variability_sdnn.avg');if(!hrv.length)hrv=ptsFrom(D.days,'hrv_ms');
  card('VO₂max','ml/kg/min',1,[{pts:hkS(D,'vo2_max.avg'),color:'var(--accent)',label:'Apple Watch'}]);
  card('FC a riposo','bpm',0,[{pts:rhr,color:'var(--text)',label:'Apple Watch'}]);
  card('HRV Apple Watch (SDNN)','ms',0,[{pts:hrv,color:'var(--text)',label:'Apple (SDNN)'}],'SDNN, non confrontabile con RMSSD');
  card('Frequenza respiratoria','/min',1,[{pts:hkS(D,'respiratory_rate.avg'),color:'var(--text)',label:'Apple Watch'}]);
  card('SpO₂','%',1,[{pts:hkS(D,'oxygen_saturation.avg'),color:'var(--text)',label:'Apple Watch'}]);
  card('Temperatura polso nel sonno','°C',2,[{pts:hkS(D,'apple_sleeping_wrist_temperature.avg'),color:'var(--text)',label:'Apple Watch'}]);
  card('FC media camminando','bpm',0,[{pts:hkS(D,'walking_heart_rate_average.avg'),color:'var(--text)',label:'Apple Watch'}]);
  card('Recupero cardiaco a 1 min','bpm',0,[{pts:hkS(D,'heart_rate_recovery_one_minute.avg'),color:'var(--ok)',label:'Apple Watch'}]);
  var dist=hkS(D,'distance_walking_running.sum');if(!dist.length)dist=ptsFrom(D.days,'distance_km');
  var steps=hkS(D,'step_count.sum');if(!steps.length)steps=ptsFrom(D.days,'steps');
  [['Distanza a piedi e di corsa','km',1,dist],['Passi','',0,steps],['Piani saliti','',0,hkS(D,'flights_climbed.sum')],['Luce del giorno','min',0,hkS(D,'time_in_daylight.sum')]].forEach(function(x){
    var wk=weekly(since(x[3],from).filter(function(p){return p[0]<today}));if(!wk.length)return;var last=wk[wk.length-1];
    cards.push('<div class="card"><h3>'+x[0]+' <span class="muted" style="font-size:13px;font-weight:400">'+it(last[1],x[2])+(x[1]?' '+x[1]:'')+'/giorno</span></h3><div class="sub">Media giornaliera per settimana (oggi escluso) · 12 mesi '+it(mean(wk.map(function(p){return p[1]})),x[2])+(x[1]?' '+x[1]:'')+'</div><div style="margin-top:10px">'+tchart([],{from:from,to:today,bars:wk,barDays:7,zero:true,barColor:'var(--accent)',dec:x[2],H:110})+'</div></div>');});
  var sl=D.days.filter(function(d){return d.sleep_asleep_min&&d.day>=addDays(today,-29)});
  if(sl.length){var svA='';[[354,'n'],[720,'w']].forEach(function(V){var W=V[0],H=130,n=sl.length,bw=Math.max(3,(W-40)/n*0.75),x=function(i){return 30+i*(W-40)/Math.max(n-1,1)};
    var top=Math.max(10,Math.ceil(Math.max.apply(null,sl.map(function(d){return ((d.sleep_asleep_min||0)+(d.sleep_awake_min||0))/60})))),y=function(h){return H-18-(Math.min(h,top)/top)*(H-28)};
    var sv='<svg viewBox="0 0 '+W+' '+H+'" class="ch '+V[1]+'">';[0,Math.round(top/2),top].forEach(function(h){sv+='<line x1="26" x2="'+(W-4)+'" y1="'+y(h).toFixed(1)+'" y2="'+y(h).toFixed(1)+'" stroke="var(--border)"/><text x="0" y="'+(y(h)+3).toFixed(1)+'">'+h+' h</text>'});
    sl.forEach(function(s,i){var b=0;[[s.sleep_deep_min,'var(--deep)'],[s.sleep_rem_min,'var(--rem)'],[s.sleep_core_min||(!s.sleep_deep_min&&!s.sleep_rem_min?s.sleep_asleep_min:0),'var(--light)'],[s.sleep_awake_min,'var(--awake)']].forEach(function(p){var v=(p[0]||0)/60;if(v>0)sv+='<rect x="'+(x(i)-bw/2).toFixed(1)+'" y="'+y(b+v).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+(y(b)-y(b+v)).toFixed(1)+'" fill="'+p[1]+'"/>';b+=v;});});
    (W>500?[0,Math.floor(n/4),Math.floor(n/2),Math.floor(3*n/4),n-1]:[0,Math.floor(n/2),n-1]).forEach(function(i){sv+='<text x="'+(x(i)-10).toFixed(1)+'" y="'+(H-3)+'">'+dshort(sl[i].day)+'</text>'});sv+='</svg>';svA+=sv;});var sv=svA,n=sl.length;
    cards.push('<div class="card" data-span="2"><h3>Fasi del sonno · Salute <span class="muted" style="font-size:13px;font-weight:400">media '+hm(mean(sl.map(function(d){return d.sleep_asleep_min}))*60000)+'</span></h3><div class="sub">Ultime '+n+' notti</div><div style="margin-top:10px">'+sv+'</div>'+legend([['Profondo','var(--deep)',1],['REM','var(--rem)',1],['Core','var(--light)',1],['Sveglio','var(--awake)',1]])+'</div>');}
  if(!cards.length)return;
  set('tendenze',head('12 mesi','Tendenze',REAL)+'<div class="tgrid">'+cards.join('')+'</div>');return true;}
function periodStats(D,days,E,load,today){
  var dd=byDay(D.days),sd=hkMap(D,'heart_rate_variability_sdnn.avg'),W=weightPts(D),wm={};W.forEach(function(p){wm[p[0]]=p[1]});
  var b=[],e=[],bal=[],sl=[],hv=[],rh=[],wt=[],st=[],ld=0,nw=0;
  days.forEach(function(d){var x=dd[d],full=d<today,bb=full?burnedOf(x):null;if(bb!=null)b.push(bb);if(full&&E[d]!=null){e.push(E[d]);if(bb!=null)bal.push(E[d]-bb);}
    if(x&&x.sleep_asleep_min&&(!x.sleep_src||x.sleep_src==='apple'))sl.push(x.sleep_asleep_min);
    if(sd[d]!=null)hv.push(sd[d]);else if(x&&x.hrv_ms!=null)hv.push(x.hrv_ms);if(x&&x.resting_hr!=null)rh.push(x.resting_hr);if(wm[d]!=null)wt.push(wm[d]);if(full&&x&&x.steps)st.push(x.steps);
    if(load[d]){ld+=load[d].l;nw+=load[d].n;}});
  return {b:mean(b),e:mean(e),bal:mean(bal),sl:mean(sl),hrv:mean(hv),rhr:mean(rh),w:mean(wt),steps:mean(st),load:ld,n:nw,nd:days.length};}
function renderRiepilogo(D,today){
  if(!D.days.length&&!D.workouts.length)return;
  var E=eatenMap(D),ls=hrmaxOf(D)?loadSeries(D,addDays(today,-420),today):{sessions:[]},load={};ls.sessions.forEach(function(k){var d=k.w.day;load[d]=load[d]||{l:0,n:0};load[d].l+=k.t;load[d].n++;});
  function rowsFor(periods){return periods.map(function(p){var s=periodStats(D,p.days,E,load,today);
    return '<tr><td>'+p.label+'</td><td>'+it(s.b)+'</td><td>'+it(s.e)+'</td><td class="'+(s.bal==null?'':s.bal>0?'fail':'ok')+'">'+(s.bal==null?'—':(s.bal>0?'+':'')+it(s.bal))+'</td><td>'+s.n+'</td><td>'+it(s.load)+'</td><td>'+(s.sl!=null?hm(s.sl*6e4):'—')+'</td><td>'+it(s.hrv)+'</td><td>'+it(s.rhr)+'</td><td>'+it(s.w,1)+'</td><td>'+it(s.steps)+'</td></tr>';}).join('');}
  var th='<tr><th>Periodo</th><th>Bruciate/g</th><th>Mangiate/g</th><th>Bilancio/g</th><th>Allen.</th><th>Carico tot.</th><th>Sonno</th><th>HRV SDNN</th><th>FC rip.</th><th>Peso</th><th>Passi/g</th></tr>';
  var weeks=[],m0=monday(today);for(var i=0;i<8;i++){var a=addDays(m0,-7*i),z=addDays(a,6);weeks.push({label:dshort(a)+'–'+dshort(z>today?today:z)+(i===0?' ·in corso':''),days:dayRange(a,z>today?today:z)});}
  var months=[],t=new Date(today+'T12:00:00Z');for(var j=0;j<12;j++){var y=t.getUTCFullYear(),mo=t.getUTCMonth()-j;var d0=new Date(Date.UTC(y,mo,1,12)),d1=new Date(Date.UTC(y,mo+1,0,12));var a2=d0.toISOString().slice(0,10),z2=d1.toISOString().slice(0,10);if(z2>today)z2=today;
    months.push({label:MS[d0.getUTCMonth()]+' '+String(d0.getUTCFullYear()).slice(2)+(j===0?' ·in corso':''),days:dayRange(a2,z2)});}
  var h=head('Settimane e mesi','Riepilogo',REAL)+'<div class="sub" style="margin-top:8px">Medie giornaliere sui soli giorni con dati (oggi escluso da dispendio, pasti, bilancio e passi); “—” = nessun dato. Allenamenti e carico sono totali del periodo. Bilancio solo su giorni con pasti nel diario e dispendio Apple Watch completo. Sonno: Apple Watch; HRV: Apple Watch (SDNN); FC a riposo: Apple Watch.</div>'+
    '<div class="rgrid"><div class="card"><h3>Ultime 8 settimane</h3><div class="tblwrap"><table class="tbl">'+th+rowsFor(weeks)+'</table></div></div>'+
    '<div class="card"><h3>Ultimi 12 mesi</h3><div class="tblwrap"><table class="tbl">'+th+rowsFor(months)+'</table></div></div></div>';
  set('riepilogo',h);return true;}
function renderFonti(D){
  var hi=D&&D.meta&&D.meta.health_last_ingest,T=function(x){return new Date(x).toLocaleString('it-IT',{timeZone:userTz()})};
  var body=D&&D.body&&D.body.length?D.body[D.body.length-1].day:null,ml=D&&D.meals&&D.meals.entries.length?D.meals.entries[D.meals.entries.length-1].day:null;
  var h=head('Collegamenti','Fonti dati','')+'<div class="card" style="padding:6px 16px">'+
   '<div class="row first"><span class="ico o">♥</span><div class="main"><b>Apple Health</b><span>'+(hi?'Ultimo invio '+T(hi.at)+(hi.source==='fsync'?' · app Forma Sync':hi.source==='hae'?' · Health Auto Export':' · Comando rapido')+(hi.first_day?' · giorni '+dshort(hi.first_day)+'–'+dshort(hi.last_day):''):'Nessun dato ricevuto')+'</span></div></div>'+
   '<div class="row"><span class="ico o">◎</span><div class="main"><b>Composizione corporea</b><span>'+(body?'Ultima misura '+dlabel(body,true)+' (Bodygram, circonferenze)':'Nessuna misura')+'</span></div></div>'+
   '<div class="row"><span class="ico o">✎</span><div class="main"><b>Diario pasti</b><span>'+(ml?'Ultimo pasto registrato '+dlabel(ml,true):'Nessun pasto registrato')+'</span></div></div></div>'+
   '<p class="note">Tutte le sezioni mostrano solo dati reali; se una fonte non ha dati compare “nessun dato”.</p>';
  var s=document.getElementById('fonti');if(s){s.innerHTML=h;s.classList.add('real');}
}
var EMPTY={bilancio:['Oggi','Bilancio calorico','Nessun dato: né dispendio Apple Watch né pasti registrati negli ultimi giorni.'],attivita:['Oggi','Attività','Nessun dato di attività per oggi.'],carico:['12 mesi','Carico e forma','Nessun allenamento registrato.'],
  pasti:['Diario','Pasti','Nessun pasto registrato. Il diario viene scritto da Forma.'],sonno:['Ultime notti','Recupero e sonno','Nessun dato sul sonno.'],
  corpo:['Misure','Composizione corporea','Nessuna misura corporea.'],tendenze:['12 mesi','Tendenze','Nessun dato storico.'],riepilogo:['Settimane e mesi','Riepilogo','Nessun dato.']};
function markEmpty(id,msg){var e=EMPTY[id],s=document.getElementById(id);if(!s||s.classList.contains('real'))return;s.innerHTML=head(e[0],e[1],'<span class="badge">nessun dato</span>')+emptyCard(msg||e[2]);s.classList.add('empty');}

// ---------------- layout: gap-free packing at every width ----------------
// 1) Tile grids (KPI tiles, Tendenze cards, Riepilogo tables): rows are filled greedily (a later tile that fits is
//    pulled forward, like grid-auto-flow:dense), and the tiles of an incomplete row stretch to fill it. Grid rows
//    stretch, so tiles in a row have equal heights.
// 2) Sections between the full-width ones (Bilancio / Tendenze / Riepilogo / Fonti) are packed as a masonry on a
//    1-px row grid: column count and 1–2 column spans are searched to minimise empty area; the last section of
//    each column (or one above a hole) is extended so no gap is ever visible.
function gridCols(el){var t=getComputedStyle(el).gridTemplateColumns;return t&&t!=='none'?t.split(' ').filter(Boolean).length:1;}
function packRows(el){
  var kids=[].slice.call(el.children).filter(function(k){return k.offsetParent!==null||k.style.display!=='none'});if(!kids.length)return;
  kids.forEach(function(k){k.style.gridColumn='';k.style.order='';});
  var c=gridCols(el);if(c<2)return;
  var items=kids.map(function(k,i){return {el:k,s:Math.min(c,+(k.getAttribute('data-span')||1)),i:i}}),rows=[];
  var wide=items.filter(function(x){return x.s>1}),narrow=items.filter(function(x){return x.s===1}),N=narrow.length;
  // pick spans for the wide tiles (1..c) so the total fills whole rows; prefer spans close to the requested one
  var best=null,combos=1;wide.forEach(function(){combos*=c});
  for(var m=0;m<combos&&wide.length;m++){var sp=[],t=m,cost=0;wide.forEach(function(w){var v=t%c+1;t=Math.floor(t/c);sp.push(v);cost+=Math.abs(v-w.s)*(v<w.s?3:1);});
    var cells=N+sp.reduce(function(a,v){return a+v},0),rem=cells%c;cost+=rem?100+(c-rem):0;if(!best||cost<best.cost)best={cost:cost,sp:sp};}
  if(best)wide.forEach(function(w,k){w.s=best.sp[k]});
  // rows: narrow tiles in order, wide tiles (largest first) fill the remaining space of rows, then rows of their own
  var queue=narrow.concat(wide.slice().sort(function(a,b){return b.s-a.s}));
  while(queue.length){var r=[],free=c;for(var q=0;q<queue.length&&free>0;){if(queue[q].s<=free){free-=queue[q].s;r.push(queue.splice(q,1)[0]);}else q++;}
    if(!r.length){r.push(queue.shift());r[0].s=c;free=0;}
    if(free>0&&!queue.length){var wd=r.filter(function(x){return x.el.hasAttribute('data-span')}),tg=wd.length?wd:r,k2=0;while(free>0){tg[k2%tg.length].s++;free--;k2++;}}
    else if(free>0){var k3=0;while(free>0){r[k3%r.length].s++;free--;k3++;}}
    rows.push(r);}
  var o=0;rows.forEach(function(r){r.forEach(function(it){it.el.style.gridColumn='span '+it.s;it.el.style.order=o++;});});
}
var BAND=['attivita','carico','pasti','sonno','corpo'],GAP=0;
function ensureBand(){var b=document.getElementById('band');if(b)return b;var first=document.getElementById(BAND[0]);if(!first)return null;
  b=document.createElement('div');b.id='band';b.className='band';first.parentNode.insertBefore(b,first);BAND.forEach(function(id){var e=document.getElementById(id);if(e)b.appendChild(e)});return b;}
function skyline(hs,spans,order,c){ // hs[i][s-1]: height of item i at span s
  var H=[],last=[],pl=[],waste=0;for(var k=0;k<c;k++){H.push(0);last.push(-1);}
  for(var q=0;q<order.length;q++){var i=order[q],s=spans[i],best=-1,by=1e9;
    for(var j=0;j+s<=c;j++){var y=0;for(var t=j;t<j+s;t++)y=Math.max(y,H[t]);if(y<by-0.5){by=y;best=j;}}
    if(best<0)return null;
    for(var t2=best;t2<best+s;t2++){if(H[t2]<by){var a=last[t2];if(a<0)return null;var p=pl[a];for(var u=p.j;u<p.j+p.s;u++)if(last[u]!==a)return null;
        var d=by-GAP-(p.y+p.h);if(d>0){waste+=d*p.s;p.h+=d;for(var u2=p.j;u2<p.j+p.s;u2++)H[u2]=by;}}}
    var h=hs[i][s-1];pl[i]={j:best,s:s,y:by,h:h};for(var t3=best;t3<best+s;t3++){H[t3]=by+h+GAP;last[t3]=i;}}
  var top=Math.max.apply(null,H);
  for(var k3=0;k3<c;k3++){var a2=last[k3];if(a2<0){return null;}var p2=pl[a2];for(var u3=p2.j;u3<p2.j+p2.s;u3++)if(last[u3]!==a2)return null;
    var d2=top-GAP-(p2.y+p2.h);if(d2>0){waste+=d2*p2.s;p2.h+=d2;for(var u4=p2.j;u4<p2.j+p2.s;u4++)H[u4]=top;}}
  return {pl:pl,top:top,waste:waste};}
function perms(n){var out=[[]];for(var i=0;i<n;i++){var nx=[];out.forEach(function(p){for(var k=0;k<=p.length;k++){var q=p.slice();q.splice(k,0,i);nx.push(q);}});out=nx;}return out;}
function inversions(o){var n=0;for(var a=0;a<o.length;a++)for(var b=a+1;b<o.length;b++)if(o[a]>o[b])n++;return n;}
var lastW=0;
function layoutBand(){
  var b=ensureBand();if(!b)return;var secs=[].slice.call(b.children);
  secs.forEach(function(e){e.style.gridColumn='';e.style.gridRow='';e.style.width='';});b.style.gridTemplateColumns='';b.classList.remove('packed');
  var W=b.clientWidth;GAP=parseFloat(getComputedStyle(b).columnGap)||24;
  if(W<700){return;}
  var cands=[];for(var c=2;c<=secs.length;c++){var cw=(W-(c-1)*GAP)/c;if(cw>=380&&cw<=820)cands.push(c);} // >=380 keeps charts >=300 px (text >= 8.5 px)
  {}if(!cands.length)return;
  // measure natural heights at span 1 and 2 for every candidate column width
  b.classList.add('measure');var meas={};
  cands.forEach(function(c){var cw=(W-(c-1)*GAP)/c;meas[c]=secs.map(function(e){var r=[];for(var s=1;s<=2;s++){e.style.width=(s*cw+(s-1)*GAP)+'px';r.push(Math.ceil(e.getBoundingClientRect().height));}return r;});});
  secs.forEach(function(e){e.style.width='';});b.classList.remove('measure');
  var n=secs.length,P=perms(n),best=null;
  cands.forEach(function(c){var hs=meas[c],cw=(W-(c-1)*GAP)/c;
    for(var m=0;m<(1<<n);m++){var spans=[],ok=true;for(var i=0;i<n;i++){spans.push(m&(1<<i)?2:1);}if(c<3&&m)continue;
      for(var pi=0;pi<P.length;pi++){var r=skyline(hs,spans,P[pi],c);if(!r)continue;
        var area=r.top*W,score=r.top+r.waste/W*1.5+inversions(P[pi])*12; // shorter page, little blank space, near original order
        if(!best||score<best.score)best={score:score,c:c,r:r,spans:spans};}}});
  if(!best)return;
  b.classList.add('packed');b.style.gridTemplateColumns='repeat('+best.c+',minmax(0,1fr))';
  secs.forEach(function(e,i){var p=best.r.pl[i];e.style.gridColumn=(p.j+1)+' / span '+p.s;e.style.gridRow=(Math.round(p.y)+1)+' / span '+Math.max(1,Math.round(p.h));});
  b.dataset.cols=best.c;b.dataset.waste=Math.round(best.r.waste);
}
function layoutAll(){
  [].slice.call(document.querySelectorAll('.grid2,.grid3,.tgrid,.rgrid')).forEach(packRows);
  layoutBand();
  [].slice.call(document.querySelectorAll('.grid2,.grid3,.tgrid,.rgrid')).forEach(packRows);
}
var lt=null,lastH=0;function relayout(){clearTimeout(lt);lt=setTimeout(function(){var w=window.innerWidth,h=window.innerHeight;if(w===lastW&&Math.abs(h-lastH)<120)return;lastW=w;lastH=h;layoutAll();},100);}
if(typeof window!=='undefined'){window.addEventListener('resize',relayout);window.addEventListener('orientationchange',relayout);if(window.visualViewport)window.visualViewport.addEventListener('resize',relayout);}
function main(){
  fetch(dataUrl(),{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null}).then(function(D){
    renderFonti(D);
    if(!D){Object.keys(EMPTY).forEach(function(k){markEmpty(k,'Dati non disponibili (errore di caricamento). Riprova tra poco.')});lastW=window.innerWidth;lastH=window.innerHeight;try{layoutAll()}catch(e){};return;}
    configure(D);
    var today=localDay(),T=byDay(D.days)[today]||{};
    [function(){renderBilancio(D,today)},function(){renderAttivita(D,today,T)},function(){renderCarico(D,today)},function(){renderPasti(D,today)},
     function(){renderSonnoApple(D)},function(){renderCorpo(D,today)},function(){renderTendenze(D,today)},function(){renderRiepilogo(D,today)}].forEach(function(f){try{f()}catch(e){console.warn(e)}});
    Object.keys(EMPTY).forEach(function(k){markEmpty(k)});
    lastW=window.innerWidth;lastH=window.innerHeight;layoutAll();
  });
}
if(typeof __FORMA_TEST__==='object'){Object.assign(__FORMA_TEST__,{configure:configure,siteLabel:siteLabel,macroProgress:macroProgress,kcalBarModel:kcalBarModel,it:it,esc:esc,userTz:userTz,localDay:localDay,dataUrl:dataUrl,localTime:localTime,dlabel:dlabel,hm:hm,byDay:byDay,mean:mean,sum:sum,dshort:dshort,monday:monday,hkMap:hkMap,weightPts:weightPts,median:median,addDays:addDays,dayRange:dayRange,weekly:weekly,ma:ma,eatenMap:eatenMap,burnedOf:burnedOf,burnedPartial:burnedPartial,trimp:trimp,ewma:ewma,loadSeries:loadSeries,hrmaxOf:hrmaxOf,periodStats:periodStats,mmss:mmss,tchart:tchart,targetFor:targetFor,expenditureFor:expenditureFor,MACRO_TARGETS:MACRO_TARGETS,renderPasti:renderPasti,skyline:function(h,s,o,c,g){GAP=g;return skyline(h,s,o,c);}});}
else if(location.protocol!=='file:')main();
})();
