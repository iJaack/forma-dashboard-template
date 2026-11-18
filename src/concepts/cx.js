// Forma concepts — shared runtime. Real data only: everything comes from /api/data (behind authentication)
// and every number goes through the verified formulas exported by /app_real.js (__FORMA_TEST__ hook).
(function(){
'use strict';
var F=window.__FORMA_TEST__,RM=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
var CX={F:F};window.CX=CX;
CX.reduced=function(){return RM.matches||/[?&]motion=0/.test(location.search)};
CX.today=F.localDay();
CX.PERIODS=[['day','Giorno'],['week','7 giorni'],['month','30 giorni'],['year','12 mesi']];
CX.it=F.it;CX.esc=F.esc;
CX.hmin=function(m){return m==null?'—':Math.floor(Math.round(m)/60)+' h '+String(Math.round(m)%60).padStart(2,'0')+"'";};
CX.NA='nessun dato';
CX.HSRC=function(s){return s==='Apple'?'Apple Watch (SDNN)':''};CX.RSRC=function(s){return s==='Apple'?'Apple Watch':''};
// ---------- model (no new formulas: only F.* + plain means/sums/last values for display buckets) ----------
CX.model=function(D){
  F.configure(D);
  var today=CX.today=F.localDay(),from=F.addDays(today,-364),dd=F.byDay(D.days),E=F.eatenMap(D);
  var ls=F.loadSeries(D,F.addDays(today,-420),today),L={},SR={};ls.sessions.forEach(function(k){L[k.w.day]=(L[k.w.day]||0)+k.t});ls.series.forEach(function(r){SR[r.day]=r});
  var wm={};F.weightPts(D).forEach(function(p){wm[p[0]]=p[1]});var sd=F.hkMap(D,'heart_rate_variability_sdnn.avg'),ao=F.hkMap(D,'oxygen_saturation.avg'),ar=F.hkMap(D,'respiratory_rate.avg'),at=F.hkMap(D,'apple_sleeping_wrist_temperature.avg'),ahr=F.hkMap(D,'heart_rate.avg'),ahx=F.hkMap(D,'heart_rate.max');
  var WO={};D.workouts.forEach(function(w){(WO[w.day]=WO[w.day]||[]).push(w)});var ME={};((D.meals&&D.meals.entries)||[]).forEach(function(m){(ME[m.day]=ME[m.day]||[]).push(m)});
  var tl={};ls.sessions.forEach(function(k){tl[k.w.id||k.w.start]=k.t});
  var rows=F.dayRange(from,today).map(function(d){var x=dd[d]||{},full=d<today,r={day:d,full:full};
    Object.assign(r,F.expenditureFor(D,d,today));
    r.active=x.active_kcal!=null?x.active_kcal:null;r.resting=x.resting_kcal!=null?x.resting_kcal:null;r.complete=!!x.burn_complete;r.flag=x.active_inconsistent?'incompleto':x.active_kcal_dropped!=null?'scartato':null;
    r.eaten=E[d]!=null?E[d]:null;r.bal=full&&r.eaten!=null&&r.burned!=null?r.eaten-r.burned:null;
    // Sleep duration and stages come from the authenticated health API.
    var stg=(x.sleep_deep_min||0)+(x.sleep_rem_min||0)+(x.sleep_core_min||0);
    if(x.sleep_asleep_min&&(!x.sleep_src||x.sleep_src==='apple')){
      r.sleep=x.sleep_asleep_min;r.ssrc=stg>0?'Apple Watch':'Apple Salute';
      r.deep=x.sleep_deep_min||0;r.rem=x.sleep_rem_min||0;r.core=x.sleep_core_min||0;r.uns=stg>0?null:x.sleep_asleep_min;
    }else {r.sleep=null;r.sdrop=x.sleep_dropped?'dato scartato':null;}
    r.sdnn=sd[d]!=null?sd[d]:x.hrv_ms!=null?x.hrv_ms:null;
    r.hrv=r.sdnn;r.hsrc=r.hrv!=null?'Apple':null;
    r.rhr=x.resting_hr!=null?x.resting_hr:null;r.rsrc=r.rhr!=null?'Apple':null;
    var pick=function(k,a){r[k]=a!=null?a:null;r[k+'Src']=r[k]!=null?'Apple':null;};
    pick('spo2',ao[d]);pick('resp',ar[d]);pick('skin',at[d]);pick('hrAvg',ahr[d]);pick('hrMax',ahx[d]);
    r.load=L[d]||0;var q=SR[d];r.ctl=q?q.ctl:null;r.atl=q?q.atl:null;r.tsb=q?q.ctl-q.atl:null;
    r.weight=wm[d]!=null?wm[d]:null;r.steps=x.steps!=null?x.steps:null;r.wo=(WO[d]||[]).map(function(w){return {type:w.type,start:w.start,end:w.end,min:w.duration_s/60,kcal:w.kcal,hr:w.avg_hr,trimp:tl[w.id||w.start]||null,merged:w.merged}});
    r.meals=(ME[d]||[]).slice().sort(function(a,b){return (a.time||'').localeCompare(b.time||'')});r.target=F.targetFor(D,d,today);return r;});
  var M={D:D,rows:rows,by:{},today:today,hrmax:ls.hrmax,noHR:ls.noHR};rows.forEach(function(r){M.by[r.day]=r});return M;};
CX.has=function(M,k){return M.rows.some(function(r){return r[k]!=null&&r[k]!==0})};
function agg(rows,label,key){var m=function(k,f){return F.mean(rows.filter(f||function(){return true}).map(function(r){return r[k]}))},cmp=function(r){return r.burned!=null};
  var hs=rows.some(function(r){return r.hsrc==='Apple'})?'Apple':null;
  var last=rows.filter(function(r){return r.ctl!=null}).pop();
  return {key:key,label:label,from:rows[0].day,to:rows[rows.length-1].day,rows:rows,n:rows.length,
    burned:m('burned'),active:m('active',cmp),resting:m('resting',cmp),eaten:m('eaten',function(r){return r.full}),bal:m('bal'),
    sleep:m('sleep'),deep:m('deep'),rem:m('rem'),core:m('core'),hrv:m('hrv',function(r){return r.hsrc===hs}),hrvSrc:hs,hrvMixed:false,sdnn:m('sdnn'),rhr:m('rhr'),weight:m('weight'),
    steps:m('steps',function(r){return r.full}),load:rows.reduce(function(a,r){return a+r.load},0),ctl:last?last.ctl:null,atl:last?last.atl:null,tsb:last?last.tsb:null,
    partial:rows.some(function(r){return !r.full})};}
CX.buckets=function(M,period,end){end=end||M.today;var rows=M.rows.filter(function(r){return r.day<=end});
  if(period==='year'){var g={},o=[];rows.slice(-364).forEach(function(r){var w=F.monday(r.day);(g[w]=g[w]||[]).push(r)});Object.keys(g).sort().forEach(function(w){o.push(agg(g[w],F.dshort(w),w))});return o;}
  var n=period==='week'?7:period==='month'?30:1;return rows.slice(-n).map(function(r){return agg([r],period==='week'?F.dlabel(r.day):F.dshort(r.day),r.day)});};
CX.summary=function(M,period,end){end=end||M.today;var n={day:1,week:7,month:30,year:364}[period];return agg(M.rows.filter(function(r){return r.day<=end}).slice(-n),'',end);};
CX.periodLabel=function(p,end){return p==='day'?F.dlabel(end||CX.today,true):p==='week'?'ultimi 7 giorni':p==='month'?'ultimi 30 giorni':'ultime 52 settimane (medie settimanali)';};
// ---------- motion ----------
CX.ease=function(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};
CX.anim=function(dur,step,done){if(CX.reduced()||dur<=0){step(1);done&&done();return {stop:function(){}}}var t0=null,stop=false;
  function f(ts){if(stop)return;if(t0==null)t0=ts;var t=Math.min(1,(ts-t0)/dur);step(CX.ease(t));if(t<1)requestAnimationFrame(f);else done&&done();}requestAnimationFrame(f);return {stop:function(){stop=true}};};
CX.tween=function(el,to,fmt,dur){if(!el)return;var from=el._v!=null?el._v:0;if(el._a)el._a.stop();el._v=to;
  if(to==null||isNaN(to)){el.textContent=CX.NA;el.classList.add('na');return;}el.classList.remove('na');if(from==null||isNaN(from))from=to;
  el._a=CX.anim(dur||700,function(t){el.textContent=fmt(from+(to-from)*t)});};
CX.lerp=function(a,b,t){if(a==null)return b==null?null:(t<1?b*t:b);if(b==null)return t<.6?a*(1-t/.6):null;return a+(b-a)*t;};
CX.resample=function(arr,N){if(!arr.length)return new Array(N).fill(null);if(arr.length===N)return arr.slice();var o=[];for(var i=0;i<N;i++)o.push(arr[Math.round(i*(arr.length-1)/Math.max(1,N-1))]);return o;};
CX.view=function(fn){if(!document.startViewTransition||CX.reduced()){fn();return;}var o=CX._origin||[innerWidth/2,0];var vt=document.startViewTransition(fn);
  vt.ready.then(function(){var r=Math.hypot(Math.max(o[0],innerWidth-o[0]),Math.max(o[1],innerHeight-o[1]));
    document.documentElement.animate({clipPath:['circle(0px at '+o[0]+'px '+o[1]+'px)','circle('+r+'px at '+o[0]+'px '+o[1]+'px)']},{duration:760,easing:'cubic-bezier(.65,0,.2,1)',pseudoElement:'::view-transition-new(root)'});
    document.documentElement.animate({filter:['none','blur(6px) saturate(.6)'],opacity:[1,.6]},{duration:760,easing:'ease-in',pseudoElement:'::view-transition-old(root)'});}).catch(function(){});};
CX.reveal=function(root){var els=[].slice.call((root||document).querySelectorAll('[data-reveal]'));if(CX.reduced()||!window.IntersectionObserver){els.forEach(function(e){e.classList.add('in')});return;}
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){var i=+e.target.dataset.reveal||0;e.target.style.animationDelay=(i*70)+'ms';e.target.classList.add('in');io.unobserve(e.target);}})},{rootMargin:'0px 0px -5% 0px'});els.forEach(function(e){io.observe(e)});};
// ---------- layout ----------
CX.onResize=function(el,fn){var w=-1,raf=0;var ro=new ResizeObserver(function(){cancelAnimationFrame(raf);raf=requestAnimationFrame(function(){var nw=Math.round(el.clientWidth);if(nw!==w){w=nw;fn(nw);}})});ro.observe(el);};
// fill every row of a CSS grid: wide items keep data-span, the last row's items stretch to close the row (no holes)
CX.fill=function(grid){var cs=getComputedStyle(grid),c=cs.gridTemplateColumns.split(' ').filter(Boolean).length,items=[].slice.call(grid.children).filter(function(e){return e.offsetParent!==null||e.style.display!=='none'});
  var row=[],used=0;items.forEach(function(e){e.style.gridColumn='';});
  items.forEach(function(e){var s=Math.min(c,+(e.dataset.span||1));if(used+s>c){close(row,c-used);row=[];used=0;}row.push([e,s]);used+=s;});close(row,c-used);
  function close(r,free){if(!r.length)return;var k=0;r.forEach(function(x){x[2]=x[1]});while(free>0){r[k%r.length][2]++;free--;k++;}r.forEach(function(x){x[0].style.gridColumn='span '+x[2]})}};
CX.fillAll=function(){[].forEach.call(document.querySelectorAll('[data-fill]'),CX.fill)};
window.addEventListener('resize',function(){clearTimeout(CX._ft);CX._ft=setTimeout(CX.fillAll,80)});
// ---------- svg helpers ----------
CX.NS='http://www.w3.org/2000/svg';
CX.lin=function(d0,d1,r0,r1){var k=d1===d0?0:(r1-r0)/(d1-d0);return function(v){return r0+(v-d0)*k}};
CX.nice=function(max){if(!(max>0))return 1;var p=Math.pow(10,Math.floor(Math.log10(max))),f=max/p;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p;};
CX.line=function(pts){var s='',pen=false;pts.forEach(function(p){if(p==null||p[1]==null||isNaN(p[1])){pen=false;return;}s+=(pen?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1);pen=true;});return s;};
CX.area=function(xs,top,bot){var s='',seg=[];function flush(){if(seg.length){s+='M'+seg.map(function(i){return xs[i].toFixed(1)+','+top[i].toFixed(1)}).join('L')+'L'+seg.slice().reverse().map(function(i){return xs[i].toFixed(1)+','+bot[i].toFixed(1)}).join('L')+'Z';seg=[];}}
  xs.forEach(function(x,i){if(top[i]==null||bot[i]==null||isNaN(top[i]))flush();else seg.push(i)});flush();return s;};
CX.tip=function(){var t=document.getElementById('cx-tip');if(!t){t=document.createElement('div');t.id='cx-tip';t.setAttribute('role','status');document.body.appendChild(t);}return t;};
CX.showTip=function(html,x,y){var t=CX.tip();t.innerHTML=html;t.classList.add('on');var w=t.offsetWidth,h=t.offsetHeight,vw=innerWidth;var l=Math.min(vw-w-8,Math.max(8,x+14)),tp=y-h-14<8?y+18:y-h-14;t.style.transform='translate('+l+'px,'+(tp+scrollY)+'px)';};
CX.hideTip=function(){var t=CX.tip();t.classList.remove('on')};
// ---------- chrome ----------
CX.seg=function(el,cur,cb){el.innerHTML='<span class="thumb" aria-hidden="true"></span>'+CX.PERIODS.map(function(p){return '<button type="button" data-p="'+p[0]+'" aria-pressed="'+(p[0]===cur)+'">'+p[1]+'</button>'}).join('');
  var th=el.querySelector('.thumb');function place(b,anim){if(!b){th.style.width='0';return;}var x=b.offsetLeft,w=b.offsetWidth,ox=th.offsetLeft+(parseFloat(th.dataset.x)||0),ow=th.offsetWidth;th.dataset.x=0;th.style.left=x+'px';th.style.width=w+'px';
    if(anim&&ow&&!CX.reduced()){var l=Math.min(ox,x),r=Math.max(ox+ow,x+w);th.animate([{left:ox+'px',width:ow+'px'},{left:l+'px',width:(r-l)+'px',offset:.45,transform:'scaleY(.86)'},{left:x+'px',width:w+'px'}],{duration:520,easing:'cubic-bezier(.3,1.35,.4,1)'});}}
  el._place=function(){place(el.querySelector('button[aria-pressed=true]'),false)};requestAnimationFrame(el._place);window.addEventListener('resize',el._place);
  el.addEventListener('click',function(e){var b=e.target.closest('button');if(!b||b.getAttribute('aria-pressed')==='true')return;CX._origin=[e.clientX||innerWidth/2,e.clientY||0];[].forEach.call(el.querySelectorAll('button'),function(x){x.setAttribute('aria-pressed',x===b)});place(b,true);cb(b.dataset.p);});
  el.addEventListener('keydown',function(e){if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;var bs=[].slice.call(el.querySelectorAll('button')),i=bs.findIndex(function(x){return x.getAttribute('aria-pressed')==='true'});var j=(i+(e.key==='ArrowRight'?1:-1)+bs.length)%bs.length;bs[j].focus();bs[j].click();});};
// theme: handled by /theme.js (saved choice -> ?theme= -> Auto by local clock, rechecked every minute)
})();
// generic morph: animates every numeric array/scalar of a state from the previous one (resampled) to the next
(function(){var CX=window.CX;
CX.morph=function(el,next,draw,dur){var prev=el._cur;if(el._ma)el._ma.stop();
  if(CX.reduced()){el._cur=next;draw(next,1);return;}
  if(!prev){prev={n:next.n,v:{},s:next.s};Object.keys(next.v).forEach(function(k){prev.v[k]=next.v[k].map(function(x){return x==null?null:0})});dur=CX.ENTER_MS||1100;}
  var P={n:next.n,v:{},s:{}};Object.keys(next.v).forEach(function(k){P.v[k]=CX.resample(prev.v[k]||[],next.n)});Object.keys(next.s).forEach(function(k){P.s[k]=prev.s[k]!=null?prev.s[k]:next.s[k]});
  el._ma=CX.anim(dur||650,function(t){var c={n:next.n,v:{},s:{},lab:next.lab,meta:next.meta};
    Object.keys(next.v).forEach(function(k){c.v[k]=next.v[k].map(function(b,i){return CX.lerp(P.v[k][i],b,t)})});Object.keys(next.s).forEach(function(k){c.s[k]=P.s[k]+(next.s[k]-P.s[k])*t});
    el._cur=c;draw(c,t);});};
})();

(function(){var CX=window.CX,F=CX.F,it=CX.it;
// specular highlight follows the pointer over glass (rAF-throttled)
var pend=null;document.addEventListener('pointermove',function(e){if(CX.reduced())return;pend=e;if(CX._sp)return;CX._sp=requestAnimationFrame(function(){CX._sp=0;var t=pend.target.closest&&pend.target.closest('.card,.cx-kpis>.tile');if(!t)return;var r=t.getBoundingClientRect();t.style.setProperty('--mx',(pend.clientX-r.left)+'px');t.style.setProperty('--my',(pend.clientY-r.top)+'px');});},{passive:true});
// Background colours follow sleep and balance for the period.
CX.mood=function(S){var R=document.documentElement.style;R.setProperty('--m1','var(--accent)');
  R.setProperty('--m2',S.sleep==null?'var(--deep)':S.sleep>=420?'var(--deep)':'var(--awake)');R.setProperty('--m3',S.bal==null?'var(--info)':S.bal>0?'var(--fail)':'var(--ok)');};
// one readable sentence with the period's key numbers (real values only; missing ones say "nessun dato")
CX.say=function(el,S,p,row){function b(v,f){return v==null||isNaN(v)?'<b class="na">nessun dato</b>':'<b data-v="'+v+'" data-f="'+f+'">'+fmt(v,f)+'</b>'}
  function fmt(v,f){return f==='h'?CX.hmin(v):f==='s'?(v>0?'+':'')+it(v):f==='1'?it(v,1):it(v)}
  var h;if(p==='day'){var burn=row.full?row.burned:row.partial;
    h=F.dlabel(row.day,true)+': hai dormito '+b(row.sleep,'h')+', '+(row.full?'bruciato ':'bruciato finora ')+b(burn,'0')+' kcal e mangiato '+b(row.eaten,'0')+' kcal'+(row.bal!=null?' (bilancio '+b(row.bal,'s')+')':'')+'. Carico '+b(row.load,'0')+' TRIMP.';}
  else{var span={week:'Negli ultimi 7 giorni',month:'Negli ultimi 30 giorni',year:'Negli ultimi 12 mesi'}[p];
    h=span+' hai dormito in media '+b(S.sleep,'h')+' a notte, con '+b(S.load,'0')+' di carico TRIMP. Bruciate '+b(S.burned,'0')+' kcal/giorno'+(S.bal!=null?', bilancio '+b(S.bal,'s')+' kcal':'')+' sui giorni completi.';}
  el.innerHTML=h+'<div class="cx-mood">Lo sfondo cambia colore con sonno e bilancio del periodo.</div>';
  if(!CX.reduced())[].forEach.call(el.querySelectorAll('b[data-v]'),function(x,i){var v=+x.dataset.v,f=x.dataset.f;x._v=0;CX.tween(x,v,function(q){return fmt(q,f)},900+i*120);
    x.animate([{opacity:0,transform:'translateY(.4em)',filter:'blur(4px)'},{opacity:1,transform:'none',filter:'none'}],{duration:600,delay:i*90,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});});};
})();
