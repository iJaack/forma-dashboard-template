// Forma — Liquid Glass toolkit for concepts A and B. Real data only (/api/data via CX.model, verified formulas).
(function(){'use strict';var CX=window.CX,F=CX.F,it=CX.it,NA=CX.NA;var LG={};window.LG=LG;
var RED=function(){return CX.reduced()};
LG.$=function(s,r){return (r||document).querySelector(s)};LG.$$=function(s,r){return [].slice.call((r||document).querySelectorAll(s))};
// ---------------- refraction (SVG displacement map as backdrop-filter, Chromium) ----------------
var hasBF=CSS.supports('backdrop-filter','blur(1px)')||CSS.supports('-webkit-backdrop-filter','blur(1px)');
LG.refract=hasBF&&!!window.chrome&&!/[?&]refract=0/.test(location.search);
if(!hasBF)document.documentElement.classList.add('no-bf');
var defs=null,maps={};
function ensureDefs(){if(defs)return defs;var s=document.createElementNS(CX.NS,'svg');s.setAttribute('width','0');s.setAttribute('height','0');s.setAttribute('aria-hidden','true');s.style.position='absolute';
  s.innerHTML='<defs></defs>';document.body.appendChild(s);defs=s.firstChild;return defs;}
function mapURL(W,H,r){var sc=.5,w=Math.max(8,Math.ceil(W*sc)),h=Math.max(8,Math.ceil(H*sc)),cv=document.createElement('canvas');cv.width=w;cv.height=h;var g=cv.getContext('2d'),im=g.createImageData(w,h),d=im.data;
  var b=Math.min(Math.max(22,r*1.5),64,Math.min(W,H)*.34);
  for(var y=0;y<h;y++)for(var x=0;x<w;x++){var px=(x+.5)/sc,py=(y+.5)/sc,qx=Math.abs(px-W/2)-(W/2-r),qy=Math.abs(py-H/2)-(H/2-r),sx=px<W/2?-1:1,sy=py<H/2?-1:1,nx=0,ny=0,dist;
    if(qx>0&&qy>0){var L=Math.hypot(qx,qy)||1;nx=sx*qx/L;ny=sy*qy/L;dist=r-L;}else if(qx>qy){nx=sx;dist=r-qx;}else{ny=sy;dist=r-qy;}
    var m=dist<b?Math.pow(1-Math.max(0,dist)/b,1.6):0,i=(y*w+x)*4;d[i]=128-nx*m*127;d[i+1]=128-ny*m*127;d[i+2]=128;d[i+3]=255;}
  g.putImageData(im,0,0);return {url:cv.toDataURL(),b:b};}
LG.glassify=function(el){if(!LG.refract||RED()&&false)return;var W=Math.round(el.offsetWidth),H=Math.round(el.offsetHeight);if(W<20||H<20)return;
  var r=parseFloat(getComputedStyle(el).borderTopLeftRadius)||20;r=Math.min(r,W/2,H/2);var key=W+'x'+H+'x'+Math.round(r),id='lgf'+key;
  if(!maps[key]){var m=mapURL(W,H,r),f=document.createElementNS(CX.NS,'filter');f.setAttribute('id',id);f.setAttribute('x','0');f.setAttribute('y','0');f.setAttribute('width',W);f.setAttribute('height',H);f.setAttribute('filterUnits','userSpaceOnUse');f.setAttribute('color-interpolation-filters','sRGB');
    f.innerHTML='<feImage href="'+m.url+'" x="0" y="0" width="'+W+'" height="'+H+'" preserveAspectRatio="none" result="m"/><feDisplacementMap in="SourceGraphic" in2="m" scale="'+(m.b*1.5).toFixed(1)+'" xChannelSelector="R" yChannelSelector="G"/>';
    ensureDefs().appendChild(f);maps[key]=id;}
  var bl=el.dataset.blur||'7';el.style.backdropFilter=el.style.webkitBackdropFilter='blur('+bl+'px) url(#'+maps[key]+') saturate(1.9)';};
var ro=window.ResizeObserver?new ResizeObserver(function(es){es.forEach(function(e){LG.glassify(e.target)})}):null;
LG.glass=function(root){LG.$$('.glass',root||document).forEach(function(el){if(el._lg)return;el._lg=1;LG.glassify(el);ro&&ro.observe(el);});};
// ---------------- light: specular follows pointer / device tilt ----------------
var P={x:innerWidth*.3,y:-200,pend:false};
function light(){P.pend=false;LG.$$('.glass').forEach(function(el){var r=el.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;var cx=r.left+r.width/2,cy=r.top+r.height/2;
  el.style.setProperty('--la',(Math.atan2(P.y-cy,P.x-cx)*180/Math.PI+90).toFixed(0)+'deg');el.style.setProperty('--mx',(P.x-r.left).toFixed(0)+'px');el.style.setProperty('--my',(P.y-r.top).toFixed(0)+'px');});}
LG.light=function(){if(!P.pend){P.pend=true;requestAnimationFrame(light)}};
addEventListener('pointermove',function(e){if(RED())return;P.x=e.clientX;P.y=e.clientY;LG.light();},{passive:true});
addEventListener('scroll',LG.light,{passive:true});
addEventListener('deviceorientation',function(e){if(RED()||e.gamma==null)return;P.x=innerWidth/2+e.gamma*12;P.y=innerHeight/2+(e.beta-45)*10;LG.light();});
// ---------------- spring physics ----------------
LG.spring=function(o){var x=o.from,v=o.v||0,to=o.to,k=o.k||170,c=o.c||18,last=null,dead=false;
  if(RED()){o.update(to,0);o.done&&o.done();return {to:function(t){to=t;o.update(t,0)},stop:function(){}}}
  var api={to:function(t){to=t;if(dead){dead=false;last=null;requestAnimationFrame(f)}},stop:function(){dead=true}};
  function f(ts){if(dead)return;var dt=last==null?1/60:Math.min(.034,(ts-last)/1000);last=ts;for(var n=Math.ceil(dt*240),i=0;i<n;i++){var h=dt/n,a=-k*(x-to)-c*v;v+=a*h;x+=v*h;}
    o.update(x,v);if(Math.abs(v)<.02&&Math.abs(x-to)<.02){x=to;v=0;o.update(to,0);dead=true;o.done&&o.done();return;}requestAnimationFrame(f);}
  requestAnimationFrame(f);return api;};
// numbers that count up (critically damped: no overshoot on numbers)
LG.count=function(el,to,fmt,delay){if(!el)return;if(to==null||isNaN(to)){el.textContent=NA;el.classList.add('na');return;}el.classList.remove('na');if(el.dataset&&el.dataset.dec&&+el.dataset.dec>0&&Math.abs(to)>20){el.textContent=fmt(to);return;}
  if(RED()){el.textContent=fmt(to);return;}var from=el._v!=null?el._v:0;el._v=to;el.textContent=fmt(from);
  setTimeout(function(){LG.spring({from:from,to:to,k:60,c:15.5,update:function(x){el.textContent=fmt(x)}});},delay||0);};
// ---------------- liquid segmented control ----------------
LG.seg=function(host,opts,cur,cb){host.classList.add('lg-seg','glass');host.setAttribute('role','group');
  host.innerHTML='<span class="pill glass" aria-hidden="true"></span>'+opts.map(function(o){return '<button type="button" data-v="'+o[0]+'" aria-pressed="'+(o[0]===cur)+'">'+o[1]+'</button>'}).join('');
  var pill=host.firstChild,st={x:0,w:0,v:0},sx=null,sw=null;
  function paint(){var s=Math.min(.32,Math.abs(st.v)/2600);pill.style.width=st.w+'px';pill.style.transform='translateX('+st.x.toFixed(1)+'px) scale('+(1+s).toFixed(3)+','+(1-s*.55).toFixed(3)+')';}
  function target(b){return {x:b.offsetLeft,w:b.offsetWidth}}
  function go(b,anim){var t=target(b);if(!anim||!st.w){st.x=t.x;st.w=t.w;st.v=0;paint();return;}
    if(sx)sx.stop();if(sw)sw.stop();var w0=st.w;sx=LG.spring({from:st.x,to:t.x,k:210,c:19,update:function(x,v){st.x=x;st.v=v;paint();}});sw=LG.spring({from:w0,to:t.w,k:240,c:22,update:function(w){st.w=w;paint();}});}
  host._go=go;host._set=function(v,anim){var b=host.querySelector('button[data-v="'+v+'"]');if(!b)return;LG.$$('button',host).forEach(function(x){x.setAttribute('aria-pressed',x===b)});go(b,anim);};
  // continuous position (for scroll-linked navs): f in [0, n-1]
  host._at=function(f){var bs=LG.$$('button',host),i=Math.max(0,Math.min(bs.length-1,Math.floor(f))),j=Math.min(bs.length-1,i+1),t=f-i,a=target(bs[i]),b=target(bs[j]);var nx=a.x+(b.x-a.x)*t;st.v=(nx-st.x)*60;st.x=nx;st.w=a.w+(b.w-a.w)*t;paint();
    var k=Math.round(f);bs.forEach(function(x,q){x.setAttribute('aria-pressed',q===k)});clearTimeout(host._rv);host._rv=setTimeout(function(){st.v=0;paint()},90);};
  host.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var was=b.getAttribute('aria-pressed')==='true';LG.$$('button',host).forEach(function(x){x.setAttribute('aria-pressed',x===b)});go(b,true);if(!was)cb(b.dataset.v);});
  host.addEventListener('keydown',function(e){if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;var bs=LG.$$('button',host),i=bs.findIndex(function(x){return x.getAttribute('aria-pressed')==='true'}),j=(i+(e.key==='ArrowRight'?1:-1)+bs.length)%bs.length;bs[j].focus();bs[j].click();});
  requestAnimationFrame(function(){var b=host.querySelector('button[aria-pressed=true]')||host.querySelector('button');go(b,false);});
  addEventListener('resize',function(){var b=host.querySelector('button[aria-pressed=true]');if(b)go(b,false)});return host;};
// ---------------- tilt + depth (spring) ----------------
LG.tilt=function(el,max){if(RED()||matchMedia('(hover:none)').matches)return;max=max||4;var s={rx:0,ry:0},a=null,b=null;
  function paint(){el.style.transform='perspective(900px) rotateX('+s.rx.toFixed(2)+'deg) rotateY('+s.ry.toFixed(2)+'deg) translateZ(0)';}
  function to(rx,ry){if(a)a.to(rx);else a=LG.spring({from:s.rx,to:rx,k:120,c:14,update:function(x){s.rx=x;paint()},done:function(){a=null}});if(b)b.to(ry);else b=LG.spring({from:s.ry,to:ry,k:120,c:14,update:function(x){s.ry=x;paint()},done:function(){b=null}});}
  el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect();to(-((e.clientY-r.top)/r.height-.5)*max,((e.clientX-r.left)/r.width-.5)*max);});
  el.addEventListener('pointerleave',function(){to(0,0)});};
// ---------------- detail sheet: the tapped glass morphs into a full panel (shared element) ----------------
LG.open=function(src,build){var sh=LG.$('#lg-sheet'),sc=LG.$('#lg-scrim');if(!sh){sh=document.createElement('section');sh.id='lg-sheet';sh.className='lg-sheet glass hi';sh.hidden=true;sh.tabIndex=-1;sh.setAttribute('role','dialog');sh.setAttribute('aria-modal','true');
    sc=document.createElement('div');sc.id='lg-scrim';sc.className='lg-scrim';document.body.appendChild(sc);document.body.appendChild(sh);sc.onclick=function(){LG.close()};addEventListener('keydown',function(e){if(e.key==='Escape'&&!sh.hidden)LG.close()});}
  LG._src=src;function show(){sh.innerHTML='<button class="x" type="button" aria-label="Chiudi">×</button><div class="body"></div>';sh.querySelector('.x').onclick=function(){LG.close()};
    build(sh.querySelector('.body'));sh.hidden=false;sc.classList.add('on');src.style.visibility='hidden';document.documentElement.style.overflow='hidden';sh._lg=0;LG.glass(sh.parentNode);sh.focus({preventScroll:true});LG.light();}
  if(document.startViewTransition&&!RED()){src.style.viewTransitionName='lgx';var vt=document.startViewTransition(function(){src.style.viewTransitionName='';sh.style.viewTransitionName='lgx';show();});vt.finished.finally(function(){sh.style.viewTransitionName=''});}
  else{show();if(!RED()){var a=src.getBoundingClientRect(),b=sh.getBoundingClientRect();sh.animate([{transform:'translate('+(a.left-b.left)+'px,'+(a.top-b.top)+'px) scale('+(a.width/b.width)+','+(a.height/b.height)+')',transformOrigin:'0 0',opacity:.6},{transform:'none',transformOrigin:'0 0',opacity:1}],{duration:560,easing:'cubic-bezier(.2,1.2,.3,1)'});}}};
LG.close=function(){var sh=LG.$('#lg-sheet'),sc=LG.$('#lg-scrim'),src=LG._src;if(!sh||sh.hidden)return;
  function hide(){sh.hidden=true;sc.classList.remove('on');if(src)src.style.visibility='';document.documentElement.style.overflow='';}
  if(document.startViewTransition&&!RED()&&src){sh.style.viewTransitionName='lgx';var vt=document.startViewTransition(function(){sh.style.viewTransitionName='';hide();src.style.viewTransitionName='lgx';});vt.finished.finally(function(){src.style.viewTransitionName='';src.focus&&src.focus({preventScroll:true})});}
  else hide();};
// ---------------- exact bento packing (no holes): backtracking over allowed spans ----------------
LG.pack=function(items,C,targetR){items.forEach(function(x,i){x.i=i;x.vv=x.v.filter(function(v){return v[0]<=C});if(!x.vv.length)x.vv=[[C,1]];});
  var minA=items.reduce(function(a,x){return a+Math.min.apply(null,x.vv.map(function(v){return v[0]*v[1]}))},0),maxA=items.reduce(function(a,x){return a+Math.max.apply(null,x.vv.map(function(v){return v[0]*v[1]}))},0);
  var Rs=[];for(var R=Math.ceil(minA/C);R*C<=maxA;R++)Rs.push(R);Rs.sort(function(a,b){return Math.abs(a-targetR)-Math.abs(b-targetR)||a-b});
  for(var q=0;q<Rs.length;q++){var R2=Rs[q],occ=new Int8Array(R2*C),res=[],steps=0;
    var ok=(function rec(rem,empty){if(!rem.length)return empty===0;if(++steps>60000)return false;var idx=0;while(idx<occ.length&&occ[idx])idx++;if(idx>=occ.length)return false;
      var mn=0,mx=0;rem.forEach(function(x){mn+=Math.min.apply(null,x.vv.map(function(v){return v[0]*v[1]}));mx+=Math.max.apply(null,x.vv.map(function(v){return v[0]*v[1]}))});if(mn>empty||mx<empty)return false;
      var r=Math.floor(idx/C),c=idx%C;for(var k=0;k<Math.min(rem.length,3);k++){var x=rem[k];for(var vi=0;vi<x.vv.length;vi++){var w=x.vv[vi][0],h=x.vv[vi][1];if(c+w>C||r+h>R2)continue;var fit=true;
          for(var yy=r;yy<r+h&&fit;yy++)for(var xx=c;xx<c+w;xx++)if(occ[yy*C+xx]){fit=false;break;}if(!fit)continue;
          for(yy=r;yy<r+h;yy++)for(xx=c;xx<c+w;xx++)occ[yy*C+xx]=1;res[x.i]=[r,c,w,h];if(rec(rem.slice(0,k).concat(rem.slice(k+1)),empty-w*h))return true;for(yy=r;yy<r+h;yy++)for(xx=c;xx<c+w;xx++)occ[yy*C+xx]=0;}}return false;})(items.slice(),R2*C);
    if(ok)return {R:R2,pos:res};}
  // fallback: one per row
  return {R:items.length,pos:items.map(function(x,i){return [i,0,C,1]})};};
LG.variants=function(pw,ph,C,minH,maxH,minW){var o=[];for(var w=minW||1;w<=C;w++)for(var h=minH;h<=maxH;h++)o.push([w,h]);o.sort(function(a,b){return (Math.abs(a[0]-pw)+Math.abs(a[1]-ph)*1.6)-(Math.abs(b[0]-pw)+Math.abs(b[1]-ph)*1.6)});return o;};
// ---------------- charts (pixel-true SVG: text always 12px+, draw-on + morph) ----------------
function setSvg(svg,w,H,s){svg.setAttribute('viewBox','0 0 '+w+' '+H);svg.setAttribute('width',w);svg.setAttribute('height',H);svg.innerHTML=s;}
function svgIn(box){var s=box.querySelector('svg');if(!s){box.innerHTML='<svg role="img"></svg>';s=box.querySelector('svg');}return s;}
LG.svgIn=svgIn;
// Reserve the zero label first; keep other labels at least 16px apart without dropping gridlines.
function grid(l,r,y,w,ticks,fmt,unit,right,into){var s='<g class="grid">',kept=[],zy=ticks.indexOf(0)<0?null:y(0);ticks.forEach(function(v){var yy=y(v);s+='<line x1="'+l+'" x2="'+(w-r)+'" y1="'+yy.toFixed(1)+'" y2="'+yy.toFixed(1)+'"/>';if(v===0||(zy===null||Math.abs(zy-yy)>=16)&&!kept.some(function(p){return Math.abs(p.yy-yy)<16}))kept.push({v:v,yy:yy});});
  var uk=kept.length-1;if(uk>0&&kept[uk].v===0&&ticks[ticks.length-1]!==0)uk--;
  kept.forEach(function(p,k){var lab=fmt(p.v)+(k===uk&&unit?' '+unit:''),ax=right?w-r+6:l-8,tw=lab.length*7.2;if(into)into.push({x:right?ax+tw/2:ax-tw/2,y:p.yy+4,w:tw,kind:'axis'});s+='<text x="'+ax+'" y="'+(p.yy+4).toFixed(1)+'" text-anchor="'+(right?'start':'end')+'">'+lab+'</text>';});return s+'</g>';}
function xlabels(n,x,labels,H,w,l,r,minGap,only){var s='',every=Math.max(1,Math.ceil(n/Math.max(2,Math.floor((w-l-r)/(minGap||62)))));for(var j=0;j<n;j++)if((only?only.indexOf(j)>=0:(n-1-j)%every===0)&&labels[j])s+='<text x="'+x(j).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle">'+F.esc(labels[j])+'</text>';return s;}
// Balance dates: every label when they clear each other, otherwise every other one so the stride stays regular and both ends remain.
function balDateIdx(n,x,labels,w){function wid(j){return String(labels[j]||'').length*7.2}function fits(idx){for(var a=0;a<idx.length;a++){var cx=x(idx[a]),hw=wid(idx[a])/2;if(cx-hw<1||cx+hw>w-1)return false;if(a){var px=x(idx[a-1]),pw=wid(idx[a-1])/2;if(cx-hw<px+pw+2)return false}}return idx.length>0}var all=[];for(var j=0;j<n;j++)if(labels[j])all.push(j);if(fits(all))return all;var alt=[];for(var j=0;j<n;j+=2)alt.push(j);if(n>1&&alt[alt.length-1]!==n-1){var end=[];for(var k=n-1;k>=0;k-=2)end.push(k);end.reverse();if(end[0]===0)return end}return alt;}
// Missing days: runs of consecutive empty days (at least minRun, up to index `until`) are drawn as a faint band with
// "nessun dato" when wide enough, so a gap reads as a gap and never as a value or an interpolated line.
LG.gapRuns=function(isNull,n,minRun,until){var out=[],i=0,end=until==null?n-1:Math.min(n-1,until);minRun=minRun||1;while(i<=end){if(!isNull(i)){i++;continue;}var j=i;while(j+1<=end&&isNull(j+1))j++;if(j-i+1>=minRun)out.push([i,j]);i=j+1;}return out;};
// connect:true joins points across empty days only up to `bridge` days apart; longer gaps break the line.
LG.bridgeSegs=function(vals,bridge,src){var idx=[],solid=[],long=[],cur=[];vals.forEach(function(v,i){if(v!=null)idx.push(i)});var lim=bridge==null?Infinity:bridge;
  idx.forEach(function(i,k){if(k&&src&&src[i]!==src[idx[k-1]]){if(cur.length)solid.push(cur);cur=[];}else if(k&&i-idx[k-1]>lim){if(cur.length)solid.push(cur);long.push([idx[k-1],i]);cur=[];}cur.push(i);});if(cur.length)solid.push(cur);return {solid:solid,long:long};};
function gapBands(runs,xAt,half,lo,hi,tp,yb,label){var s='';runs.forEach(function(g){var x0=Math.max(lo,xAt(g[0])-half),x1=Math.min(hi,xAt(g[1])+half),wd=x1-x0;if(wd<=1)return;
  s+='<rect class="gapb" x="'+x0.toFixed(1)+'" y="'+tp.toFixed(1)+'" width="'+wd.toFixed(1)+'" height="'+Math.max(0,yb-tp).toFixed(1)+'" rx="6" fill="var(--ink-2)" fill-opacity=".05"/>';
  if(wd>=70)s+='<text class="lbl gapl" x="'+((x0+x1)/2).toFixed(1)+'" y="'+((tp+yb)/2+4).toFixed(1)+'" text-anchor="middle" style="fill:var(--ink-2);opacity:.85">'+F.esc(label||NA)+'</text>';});return s;}
LG.bars=function(box,o){var svg=svgIn(box),w=box.clientWidth,H=o.H||Math.round(Math.max(150,Math.min(300,w*.42))),vals=o.vals,n=vals.length;
  var fin=vals.filter(Number.isFinite),lo=o.signed?Math.min(0,Math.min.apply(null,[0].concat(fin))):0,hi=Math.max.apply(null,[o.min||1].concat(fin));if(o.ref!=null)hi=Math.max(hi,o.ref);
  var top=CX.nice(hi),bot=o.signed&&lo<0?-CX.nice(-lo):0,lw=Math.max((o.fmt||function(v){return it(v)})(top).length+(o.unit?o.unit.length+1:0),(o.fmt||function(v){return it(v)})(bot).length)*7+14,l=o.right?10:(o.l||Math.max(36,lw)),r=o.right?Math.max(48,lw):12,tp=o.tp||14,bt=26+(o.valLabel&&o.signed?22:0);
  // A positive extreme is drawn above its bar. 22px of headroom keeps that label inside a 96px chart even when the bar is the scale ceiling (baseline 8px above the bar, 13px of text above the baseline, 1px from the edge).
  if(o.balance&&o.valLabel&&fin.some(function(v){return v>0;}))tp=Math.max(tp,22);
  svg._sx={l:l,r:r,n:n,band:1};
  CX.morph(svg,{n:n,v:{a:vals},s:{t:top,b:bot}},function(c){var y=CX.lin(c.s.b,c.s.t,H-bt,tp),step=(w-l-r)/n,bw=Math.max(3,Math.min(o.maxBw||56,step*(o.fill||.62))),x=function(i){return l+step*(i+.5)};
    var s='<defs><linearGradient id="'+(o.id||'bg')+'" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:'+(o.c1||'var(--accent)')+'"/><stop offset="1" style="stop-color:'+(o.c2||o.c1||'var(--accent)')+';stop-opacity:.7"/></linearGradient>'+(o.est?'<pattern id="'+(o.id||'bg')+'-est" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="7" height="7" style="fill:'+(o.c1||'var(--accent)')+';fill-opacity:.22"/><rect width="3" height="7" style="fill:'+(o.c1||'var(--accent)')+';fill-opacity:.8"/></pattern>':'')+'</defs>';
    var axisBoxes=[];s+=grid(l,r,y,w,c.s.b<0?[c.s.b,0,c.s.t]:[0,c.s.t/2,c.s.t],o.fmt||function(v){return it(v)},o.unit,o.right,o.balance?axisBoxes:null);
    if(o.ref!=null){var yr=y(o.ref);s+='<line x1="'+l+'" x2="'+(w-r)+'" y1="'+yr.toFixed(1)+'" y2="'+yr.toFixed(1)+'" stroke="var(--ink)" stroke-dasharray="5 5" stroke-opacity=".55"/><text class="lbl" x="'+(l+4)+'" y="'+(yr-6).toFixed(1)+'">'+F.esc(o.refLabel||'')+'</text>';}
    if(o.gapMin!==0)s+=gapBands(LG.gapRuns(function(i){return vals[i]==null&&!(o.marks&&o.marks(i))},n,o.gapMin||2,o.gapUntil),x,step/2,l,w-r,tp,H-bt,o.gapLabel);
    var fmt=o.fmt||function(q){return it(q)},must={};
    if(o.balance){var finite=vals.filter(function(v){return v!=null&&isFinite(v)});if(finite.length){var vmax=Math.max.apply(null,finite),vmin=Math.min.apply(null,finite),maxI=-1,minI=-1;for(var bi=0;bi<n;bi++){if(vals[bi]==null||!isFinite(vals[bi]))continue;if(maxI<0&&vals[bi]===vmax)maxI=bi;if(minI<0&&vals[bi]===vmin)minI=bi}if(maxI>=0)must[maxI]=1;if(minI>=0)must[minI]=1;if(vals[n-1]!=null&&(vals[n-1]===vmax||vals[n-1]===vmin))must[n-1]=1}}
    var placed=o.balance?axisBoxes:[],labs=[],bars=[],drawn=[];
    for(var i=0;i<n;i++){var v=c.v.a[i];if(v==null){s+='<circle cx="'+x(i).toFixed(1)+'" cy="'+(y(0)-3).toFixed(1)+'" r="2" fill="var(--ink-2)" opacity=".5"/>';continue;}var y0=y(Math.max(0,Math.min(v,0))),y1=y(Math.max(v,0)),hh=Math.max(1.5,Math.abs(y(v)-y(0)));
      var est=o.est&&o.est(i),col=est&&!o.color?'url(#'+(o.id||'bg')+'-est)':o.color?o.color(vals[i],i):'url(#'+(o.id||'bg')+')';
      var extra=(o.hl===i?' stroke="var(--ink)" stroke-width="2"':'')+(est&&o.color?' class="est" fill-opacity=".4" stroke="'+col+'" stroke-width="1.5"':est?' class="est" stroke="'+(o.c1||'var(--accent)')+'" stroke-opacity=".8" stroke-width="1.2"'+(o.ghost&&o.ghost(i)?' stroke-dasharray="4 3"':''):o.ghost&&o.ghost(i)?' fill-opacity=".28" stroke="var(--ink-2)" stroke-dasharray="4 3"':'');
      if(o.balance){if(extra.indexOf('class="')>=0)extra=extra.replace('class="','class="balbar jk-focus-inset ');else extra=' class="balbar jk-focus-inset"'+extra;extra+=' tabindex="0" role="button" data-i="'+i+'" aria-label="'+F.esc((o.labels&&o.labels[i]?o.labels[i]+' ':'')+fmt(vals[i]))+'"'}
      var bx=x(i)-bw/2,by=v<0?y(0):y(v);s+='<rect x="'+bx.toFixed(1)+'" y="'+by.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+hh.toFixed(1)+'" rx="'+Math.min(8,bw/2.6).toFixed(1)+'" fill="'+col+'"'+extra+'/>';
      bars.push({x0:bx,x1:bx+bw,y0:by,y1:by+hh});
      if(o.valLabel&&(o.valLabel===true||o.valLabel(i))&&vals[i]!=null)labs.push({i:i,v:v,lab:fmt(vals[i]),lx:x(i),base:o.balance?(v<0?by+hh+16.2:by-8):(v<0?y(v)+14:y(v)-8),force:!!must[i]});}
    // The axis is reserved first. Extremes claim a spot before optional labels and only move further from their own bar. An optional label is removed when that is what keeps an extreme on the chart.
    function shiftsOf(p){return p.force?(p.v<0?[0,20,40]:[0,-20,-40]):[0];}
    // Use drawn ends, a 14px ascent and 2px bar clearance (+.2px for rounding); only date padding may shrink.
    function hardOk(p,q){var lw2=p.lab.length*7.2,x0=p.lx-lw2/2,x1=p.lx+lw2/2,t0=q-13,t1=q+5;if(!(x0>=2&&x1<=w-2&&t0>=1&&t1<=H-1))return false;if(o.balance&&t1-2.2>(H-6)-16)return false;if(o.balance)return !bars.some(function(b){return Math.min(x1+2,b.x1)-Math.max(x0-2,b.x0)>0&&Math.min(t1+2,b.y1)-Math.max(t0-3,b.y0)>0;});return true;}
    function hitOf(p,q,u){return Math.abs(u.x-p.lx)<(u.w+p.lab.length*7.2)/2+2&&Math.abs(u.y-q)<18;}
    function blockers(p,q){return placed.filter(function(u){return hitOf(p,q,u);});}
    function occupy(p,q,kind){var rec={x:p.lx,y:q,w:p.lab.length*7.2,kind:kind,i:p.i,ref:p};placed.push(rec);drawn.push(rec);return rec;}
    function dropRec(rec){placed=placed.filter(function(u){return u!==rec;});drawn=drawn.filter(function(u){return u!==rec;});}
    function freeShift(p){var qs=shiftsOf(p);for(var si=0;si<qs.length;si++){var q=p.base+qs[si];if(hardOk(p,q)&&!blockers(p,q).length)return q;}return null;}
    function placeForced(p){var q=freeShift(p);if(q!=null){occupy(p,q,'force');return true;}var qs=shiftsOf(p);for(var si=0;si<qs.length;si++){q=p.base+qs[si];if(!hardOk(p,q))continue;var blk=blockers(p,q);if(blk.some(function(u){return u.kind==='axis';}))continue;var forces=blk.filter(function(u){return u.kind==='force';}),opts=blk.filter(function(u){return u.kind==='opt';});if(forces.length>1)continue;if(forces.length===1){var u=forces[0],alt=null,aq=shiftsOf(u.ref),old=u.y;for(var aj=0;aj<aq.length;aj++){var qq=u.ref.base+aq[aj];if(Math.abs(qq-old)<0.05)continue;if(!hardOk(u.ref,qq))continue;if(placed.some(function(o2){return o2!==u&&hitOf(u.ref,qq,o2);}))continue;if(hitOf(u.ref,qq,{x:p.lx,y:q,w:p.lab.length*7.2}))continue;alt=qq;break;}if(alt==null)continue;dropRec(u);occupy(u.ref,alt,'force');}opts.forEach(dropRec);occupy(p,q,'force');return true;}return false;}
    if(o.balance)labs.forEach(function(p){var hw=p.lab.length*7.2/2;if(p.lx-hw<2)p.lx=2+hw;if(p.lx+hw>w-2)p.lx=w-2-hw;});
    var forced=labs.filter(function(p){return p.force;}),optional=labs.filter(function(p){return !p.force;});
    forced.forEach(function(p){var n=0,qs=shiftsOf(p);for(var si=0;si<qs.length;si++)if(hardOk(p,p.base+qs[si]))n++;p._n=n;});
    forced.sort(function(a,b){return a._n-b._n||b.base-a.base||a.i-b.i;});
    forced.forEach(placeForced);
    optional.forEach(function(p){var q=freeShift(p);if(q!=null)occupy(p,q,'opt');});
    forced.forEach(function(p){if(!placed.some(function(u){return u.kind==='force'&&u.i===p.i;}))placeForced(p);});
    drawn.forEach(function(r){s+='<text class="lbl" x="'+r.x.toFixed(1)+'" y="'+r.y.toFixed(1)+'" text-anchor="middle">'+r.ref.lab+'</text>';});
    if(o.marks)for(var mi=0;mi<n;mi++){var mk=o.marks(mi);if(mk)s+='<text class="lbl" x="'+x(mi).toFixed(1)+'" y="'+(y(0)-6).toFixed(1)+'" text-anchor="middle" style="fill:var(--fail)">'+mk+'</text>';}
    if(o.dots)o.dots.forEach(function(d,i){if(d==null)return;var yy=y(d);s+='<circle cx="'+x(i).toFixed(1)+'" cy="'+yy.toFixed(1)+'" r="5.5" fill="var(--ink)" stroke="var(--bg)" stroke-width="2"/>';});
    s+=xlabels(n,x,o.labels||[],H,w,l,r,o.gap,o.balance?balDateIdx(n,x,o.labels||[],w):null);if(!fin.length)s+='<text class="lbl" x="'+(w/2)+'" y="'+(H/2)+'" text-anchor="middle">'+NA+'</text>';setSvg(svg,w,H,s);
    if(o.balance){var parts=[];for(var ai=0;ai<n;ai++)if(o.labels&&o.labels[ai])parts.push(o.labels[ai]+' '+fmt(vals[ai]));svg.setAttribute('aria-label',parts.join(', '));
      var tip=box.querySelector('.lg-tip');if(!tip){box.classList.add('lg-scrub');tip=document.createElement('div');tip.className='lg-tip glass hi';tip.setAttribute('role','status');box.appendChild(tip)}
      function show(el){var i=+el.getAttribute('data-i');tip.innerHTML='<b>'+F.esc(fmt(vals[i]))+'</b> <span class="d">'+F.esc((o.labels&&o.labels[i])||'')+'</span>';tip.classList.add('on');var rct=el.getBoundingClientRect(),br=box.getBoundingClientRect(),tw=tip.offsetWidth,lx=Math.max(0,Math.min(box.clientWidth-tw,(rct.left+rct.width/2-br.left)-tw/2));tip.style.transform='translate('+lx.toFixed(1)+'px,4px)'}
      function hide(el){if(el&&document.activeElement===el)return;tip.classList.remove('on')}
      box.querySelectorAll('rect.balbar').forEach(function(el){el.addEventListener('focus',function(){show(el)});el.addEventListener('blur',function(){hide()});el.addEventListener('pointerenter',function(){show(el)});el.addEventListener('pointermove',function(){show(el)});el.addEventListener('pointerleave',function(){hide(el)});el.addEventListener('pointerdown',function(e){show(el);e.stopPropagation()});el.addEventListener('click',function(e){show(el);e.stopPropagation()});el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();show(el)}});});}
  });};
LG.line=function(box,o){var svg=svgIn(box),w=box.clientWidth,H=o.H||Math.round(Math.max(150,Math.min(300,w*.42))),vals=o.vals,n=vals.length,fin=vals.filter(Number.isFinite).concat((o.ext||[]).filter(Number.isFinite));
  var lo=fin.length?Math.min.apply(null,fin):0,hi=fin.length?Math.max.apply(null,fin):1,pad=Math.max((hi-lo)*.18,o.minPad||1);lo-=pad;hi+=pad;if(o.zero)lo=0;
  var l=o.l||Math.max(36,(it(hi,o.dec||0).length+(o.unit?o.unit.length+1:0))*7+14),r=o.r||14,tp=o.tp||16,bt=26,first=!svg._cur;
  svg._sx={l:l,r:r,n:n,band:0};
  var st={n:n,v:{a:vals},s:{lo:lo,hi:hi}},draw=function(c,t){var y=CX.lin(c.s.lo,c.s.hi,H-bt,tp),x=function(i){return l+(w-l-r)*(n<2?.5:i/(n-1))};
    var dec=o.dec||0,ticks=[c.s.lo+(c.s.hi-c.s.lo)*.12,(c.s.lo+c.s.hi)/2,c.s.hi-(c.s.hi-c.s.lo)*.12];
    var s='<defs><linearGradient id="'+(o.id||'lg')+'" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:'+(o.color||'var(--accent)')+';stop-opacity:.5"/><stop offset="1" style="stop-color:'+(o.color||'var(--accent)')+';stop-opacity:0"/></linearGradient></defs>';
    s+=grid(l,r,y,w,ticks,function(v){return it(v,dec)},o.unit);
    var pts=c.v.a.map(function(v,i){return v==null?null:[x(i),y(v)]}),xs=[],tp2=[],bt2=[];pts.forEach(function(p,i){xs.push(x(i));tp2.push(p?p[1]:null);bt2.push(p?H-bt:null)});
    if(o.gapMin)s+=gapBands(LG.gapRuns(function(i){return vals[i]==null},n,o.gapMin,o.gapUntil),x,n<2?0:(w-l-r)/(n-1)/2,l,w-r,tp,H-bt,o.gapLabel);
    if(o.area!==false)s+='<path d="'+CX.area(xs,tp2,bt2)+'" fill="url(#'+(o.id||'lg')+')"/>';
    if(o.src){var sg2=LG.bridgeSegs(c.v.a,o.connect?o.bridge:1,o.src),col0=o.color||'var(--accent)';
      sg2.solid.forEach(function(seg,si){var alt=o.src[seg[0]]===o.alt,q=seg.map(function(i){return pts[i]});s+='<path class="ln'+(alt?' alt':'')+'" d="'+CX.line(q)+'" fill="none" stroke="'+col0+'" stroke-width="'+(alt?2:(o.sw||3))+'"'+(alt?' stroke-dasharray="5 5" opacity=".8"':'')+' stroke-linejoin="round" stroke-linecap="round"/>';});
      pts.forEach(function(p,i){if(!p)return;if(o.src[i]===o.alt)s+='<circle class="altp" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.4" fill="var(--bg)" stroke="'+col0+'" stroke-width="1.8"/>';else if(sg2.solid.some(function(g){return g.length===1&&g[0]===i}))s+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.2" fill="'+col0+'"/>';});}
    else if(o.connect){var sg=LG.bridgeSegs(c.v.a,o.bridge),cp=sg.solid.map(function(seg){return seg.map(function(i){return pts[i]})});
      s+='<path class="ln" d="'+cp.map(function(q){return CX.line(q)}).join('')+'" fill="none" stroke="'+(o.color||'var(--accent)')+'" stroke-width="'+(o.sw||3)+'" stroke-linejoin="round" stroke-linecap="round"/>';
      if(o.bridgeDash)sg.long.forEach(function(b){var p0=pts[b[0]],p1=pts[b[1]];s+='<path class="gapln" d="M'+p0[0].toFixed(1)+','+p0[1].toFixed(1)+'L'+p1[0].toFixed(1)+','+p1[1].toFixed(1)+'" fill="none" stroke="'+(o.color||'var(--accent)')+'" stroke-width="1.5" stroke-dasharray="2 6" stroke-linecap="round" opacity=".55"/>';});}
    else s+='<path class="ln" d="'+CX.line(pts)+'" fill="none" stroke="'+(o.color||'var(--accent)')+'" stroke-width="'+(o.sw||3)+'" stroke-linejoin="round" stroke-linecap="round"/>';
    if(o.ext){var ep=o.ext.map(function(v,i){return v==null?null:[x(i),y(v)]}).filter(Boolean);if(ep.length>1)s+='<path class="ext" d="'+CX.line(ep)+'" fill="none" stroke="'+(o.color||'var(--accent)')+'" stroke-width="'+(o.sw||3)+'" stroke-dasharray="7 7" stroke-linecap="round" opacity="'+(o.extOp||.85)+'"/>';}
    // a lone day between gaps has no line to sit on: draw it as a dot so it is not lost
    if(!o.points&&!o.src)pts.forEach(function(p,i){if(!p)return;var lone=o.connect?LG.bridgeSegs(c.v.a,o.bridge).solid.some(function(g){return g.length===1&&g[0]===i}):!pts[i-1]&&!pts[i+1];if(lone)s+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.2" fill="'+(o.color||'var(--accent)')+'"/>';});
    if(o.points)pts.forEach(function(p){if(p)s+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.2" fill="'+(o.color||'var(--accent)')+'"/>'});
    var li=-1;for(var i=n-1;i>=0;i--)if(vals[i]!=null){li=i;break;}
    if(li>=0&&pts[li]){var p=pts[li],la=o.src&&o.src[li]===o.alt;s+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+(la?6:7)+'" fill="'+(la?'var(--bg)':(o.color||'var(--accent)'))+'" stroke="'+(la?(o.color||'var(--accent)'):'var(--bg)')+'" stroke-width="3"/><text class="lbl" x="'+Math.min(p[0],w-r-4).toFixed(1)+'" y="'+(p[1]-14).toFixed(1)+'" text-anchor="end">'+it(vals[li],dec)+(o.unit?' '+o.unit:'')+'</text>';}
    s+=xlabels(n,x,o.labels||[],H,w,l,r,o.gap);if(!fin.length)s+='<text class="lbl" x="'+(w/2)+'" y="'+(H/2)+'" text-anchor="middle">'+NA+'</text>';setSvg(svg,w,H,s);};
  if(first){svg._cur=st;draw(st,1);}else CX.morph(svg,st,draw);
  if(first&&!RED()){var ln=svg.querySelector('.ln');if(ln&&ln.getTotalLength){var L=ln.getTotalLength();ln.style.strokeDasharray=L;ln.animate([{strokeDashoffset:L},{strokeDashoffset:0}],{duration:LG.DRAW_MS||1400,easing:LG.DRAW_EASE||'cubic-bezier(.3,.7,.1,1)'}).onfinish=function(){ln.style.strokeDasharray=''};}}};
LG.stack=function(box,o){var svg=svgIn(box),w=box.clientWidth,H=o.H||Math.round(Math.max(150,Math.min(300,w*.42))),n=o.rows.length,keys=o.keys;
  var v={};keys.forEach(function(k){v[k[0]]=o.rows.map(function(r){return r[k[0]]==null?null:r[k[0]]})});var tot=o.rows.map(function(r){return keys.reduce(function(a,k){return a+(r[k[0]]||0)},0)});
  var top=o.top||Math.max(60,Math.ceil(Math.max.apply(null,[1].concat(tot))/60)*60),l=46,r=12,tp=14,bt=26;
  svg._sx={l:l,r:r,n:n,band:1};
  CX.morph(svg,{n:n,v:v,s:{t:top}},function(c){var y=CX.lin(0,c.s.t,H-bt,tp),step=(w-l-r)/n,bw=Math.max(3,Math.min(o.maxBw||48,step*.64)),x=function(i){return l+step*(i+.5)};
    var s=grid(l,r,y,w,[0,c.s.t/2,c.s.t],o.fmt||function(q){return Math.round(q/60)+' h'},'');
    if(o.gapMin!==0)s+=gapBands(LG.gapRuns(function(i){return !(tot[i]>0)},n,o.gapMin||2,o.gapUntil),x,step/2,l,w-r,tp,H-bt,o.gapLabel);
    for(var i=0;i<n;i++){var base=H-bt,any=false;keys.forEach(function(k,ki){var q=c.v[k[0]][i];if(q==null||q<=0)return;any=true;var hh=q*(H-bt-tp)/c.s.t;s+='<rect x="'+(x(i)-bw/2).toFixed(1)+'" y="'+(base-hh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(0,hh-1).toFixed(1)+'" rx="'+Math.min(5,bw/3).toFixed(1)+'" fill="'+k[1]+'"/>';base-=hh;});
      if(!any)s+='<circle cx="'+x(i).toFixed(1)+'" cy="'+(H-bt-3)+'" r="2" fill="var(--ink-2)" opacity=".5"/>';}
    if(o.line){var lp=o.line.vals.map(function(q,i){return q==null?null:[x(i),CX.lin(o.line.lo,o.line.hi,H-bt,tp)(q)]});s+='<path d="'+CX.line(lp)+'" fill="none" stroke="'+o.line.color+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';lp.forEach(function(p){if(p)s+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.5" fill="'+o.line.color+'"/>'});}
    s+=xlabels(n,x,o.labels||[],H,w,l,r,o.gap);setSvg(svg,w,H,s);});};
LG.ring=function(host,frac,color,size,sw,label){size=size||96;sw=sw||12;var R=(size-sw)/2,C=2*Math.PI*R;host.innerHTML='<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" aria-hidden="true"><circle cx="'+size/2+'" cy="'+size/2+'" r="'+R+'" fill="none" stroke="var(--ink-2)" stroke-opacity=".16" stroke-width="'+sw+'"/><circle class="rg" cx="'+size/2+'" cy="'+size/2+'" r="'+R+'" fill="none" stroke="'+color+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-dasharray="0 '+C+'" transform="rotate(-90 '+size/2+' '+size/2+')"/></svg>';
  var rg=host.querySelector('.rg');if(frac==null){rg.remove();return;}LG.spring({from:0,to:Math.max(0,Math.min(1,frac)),k:90,c:11,update:function(f){rg.setAttribute('stroke-dasharray',(C*Math.max(0,f)).toFixed(1)+' '+C.toFixed(1))}});};
// ---------------- chart scrubber: glass tooltip + hairline following the pointer (fn(i) -> html or null) ----------------
LG.scrub=function(box,fn){if(box._scrub)return;box._scrub=1;box.classList.add('lg-scrub');var tip=document.createElement('div'),bar=document.createElement('i');tip.className='lg-tip glass hi';tip.setAttribute('role','status');bar.className='lg-hair';box.appendChild(bar);box.appendChild(tip);
  function idx(e){var svg=box.querySelector('svg'),s=svg&&svg._sx;if(!s||!s.n)return null;var r=svg.getBoundingClientRect(),x=e.clientX-r.left,w=r.width-s.l-s.r,i=s.band?Math.floor((x-s.l)/(w/s.n)):Math.round((x-s.l)/w*(s.n-1));if(i<0||i>=s.n)return null;
    return {i:i,x:(s.band?s.l+w/s.n*(i+.5):s.l+w*(s.n<2?.5:i/(s.n-1)))+(r.left-box.getBoundingClientRect().left),bw:box.clientWidth};}
  function hide(){tip.classList.remove('on');bar.classList.remove('on');}
  box.addEventListener('pointermove',function(e){if(e.pointerType==='touch')return;var q=idx(e),h=q&&fn(q.i);if(!h){hide();return;}tip.innerHTML=h;tip.classList.add('on');bar.classList.add('on');bar.style.transform='translateX('+q.x.toFixed(1)+'px)';
    var tw=tip.offsetWidth,lx=Math.max(0,Math.min(q.bw-tw,q.x-tw/2));tip.style.transform='translateX('+lx.toFixed(1)+'px)';});
  box.addEventListener('pointerleave',hide);};
// ---------------- rolling-window projection (pure): 7-day trailing mean on raw daily points -> OLS -> slope x 30 ----------------
function dnum(day){return Date.UTC(+day.slice(0,4),+day.slice(5,7)-1,+day.slice(8,10))/864e5;}
LG.dailyMean=function(lists){var m={};lists.forEach(function(L){(L||[]).forEach(function(p){if(p&&p[1]!=null&&isFinite(p[1])){(m[p[0]]=m[p[0]]||[]).push(+p[1]);}});});
  return Object.keys(m).sort().map(function(k){var a=m[k];return [k,a.reduce(function(x,y){return x+y},0)/a.length];});};
LG.roll=function(pts,win,minN){win=win||7;minN=minN||3;var o=[];pts.forEach(function(p,i){var t=dnum(p[0]),w=pts.filter(function(q){var u=dnum(q[0]);return u<=t&&u>t-win;});if(w.length>=minN)o.push([p[0],w.reduce(function(a,q){return a+q[1]},0)/w.length,w.length]);});return o;};
LG.ols=function(xs,ys){var n=xs.length;if(n<2)return null;var mx=xs.reduce(function(a,b){return a+b},0)/n,my=ys.reduce(function(a,b){return a+b},0)/n,sxx=0,sxy=0;for(var i=0;i<n;i++){sxx+=(xs[i]-mx)*(xs[i]-mx);sxy+=(xs[i]-mx)*(ys[i]-my);}if(!sxx)return null;var b=sxy/sxx;return {slope:b,icpt:my-b*mx};};
LG.project=function(pts,today,o){o=o||{};var win=o.window||90,T=dnum(today),from=T-win+1,rec=o.recent||30,rw=o.roll||7,raw=pts.filter(function(p){var t=dnum(p[0]);return t>=from&&t<=T});
  var res={n:raw.length,n30:raw.filter(function(p){return dnum(p[0])>T-rec}).length,from:raw.length?raw[0][0]:null,to:raw.length?raw[raw.length-1][0]:null,span:raw.length?dnum(raw[raw.length-1][0])-dnum(raw[0][0]):0,ok:false,low:false};
  // shown only with >= 2 measurements in the last 30 days
  if(res.n30<(o.minRecent||2)){res.why=res.n30?'solo 1 misura negli ultimi '+rec+' giorni':'nessuna misura negli ultimi '+rec+' giorni';return res;}
  // strict-quality rule (old threshold): >= 8 points, >= 14 days span, >= 3 rolling points with >= 3 measures in the 7-day window
  var mp=o.minPts||8,ms=o.minSpan||14,mr=o.minRoll||3,strict=raw.length>=mp&&res.span>=ms&&LG.roll(raw,rw,mr).length>=(o.minRollPts||3);
  if(!strict)res.lowWhy=raw.length<mp?'meno di '+mp+' misure':res.span<ms?'meno di '+ms+' giorni di misure':'meno di '+mr+' misure in '+rw+' giorni';
  var r=LG.roll(raw,rw,1);res.nRoll=r.length;
  var x0=dnum(r[0][0]),f=LG.ols(r.map(function(p){return dnum(p[0])-x0}),r.map(function(p){return p[1]}));if(!f){res.why='serie piatta';return res;}
  res.ok=true;res.low=!strict;res.roll=r;res.slope=f.slope;res.d30=f.slope*30;res.fit=function(day){return f.icpt+f.slope*(dnum(day)-x0)};return res;};
LG.verb=function(d,thr){thr=thr==null?.1:thr;return d==null?null:Math.abs(d)<thr?'resterà stabile':d<0?'diminuirà di':'aumenterà di';};
LG.projSentence=function(items,fmt){var ok=items.filter(function(x){return x.r&&x.r.ok}),no=items.filter(function(x){return !(x.r&&x.r.ok)});fmt=fmt||function(v){return Math.abs(v).toFixed(1)};
  if(!ok.length)return null;var parts=ok.map(function(x){var v=LG.verb(x.r.d30);return x.art+' '+v+(v==='resterà stabile'?'':' '+fmt(x.r.d30)+' kg');});
  var s='Se continui così, entro i prossimi 30 giorni '+(parts.length>1?parts.slice(0,-1).join(', ')+', '+parts[parts.length-1]:parts[0])+'.';
  if(no.length)s+=' Per '+no.map(function(x){return x.name}).join(' e ')+' non ci sono dati sufficienti.';return s;};
// ---------------- derived answers (no new formulas: CX.model values, plain means/differences/counts) ----------------
LG.formWord=function(tsb){if(tsb==null)return null;return tsb>5?['fresco','var(--ok)']:tsb>=-10?['in equilibrio','var(--info)']:tsb>=-25?['in carico','var(--accent)']:['affaticato','var(--fail)'];};
LG.derive=function(M){var R=M.rows,T=M.by[M.today],Y=M.by[F.addDays(M.today,-1)],full=R.filter(function(r){return r.full}),last30=full.slice(-30),mean=function(a,k){return F.mean(a.map(function(r){return r[k]}))};
  var lastOf=function(k){for(var i=R.length-1;i>=0;i--)if(R[i][k]!=null)return R[i];return null};
  var hrvRow=lastOf('hrv');var basePrior=function(row,k){if(!row)return null;var i=R.indexOf(row);return F.mean(R.slice(Math.max(0,i-30),i).filter(function(r){return k!=='hrv'||r.hsrc===row.hsrc}).map(function(r){return r[k]}));};
  var W=F.weightPts(M.D),wl=W.length?W[W.length-1]:null,w30=null;if(wl){var lim=F.addDays(wl[0],-30);for(var j=W.length-1;j>=0;j--)if(W[j][0]<=lim){w30=W[j];break;}}
  var weeks=CX.buckets(M,'year').slice(-12).map(function(b){return {from:b.from,to:b.to,label:F.dshort(b.from),sessions:b.rows.reduce(function(a,r){return a+r.wo.length},0),days:b.rows.filter(function(r){return r.wo.length}).length,load:b.load,partial:b.partial}});
  var fr=lastOf('tsb'),lastWo=null;for(var q=R.length-1;q>=0&&!lastWo;q--)if(R[q].wo.length)lastWo={day:R[q].day,w:R[q].wo.slice().sort(function(a,b){return (b.trimp||0)-(a.trimp||0)})[0],n:R[q].wo.length,load:R[q].load};
  var load7=R.slice(-7).reduce(function(a,r){return a+r.load},0),load28=R.slice(-28).reduce(function(a,r){return a+r.load},0)/4;
  return {T:T,Y:Y,sleepBase:mean(last30.filter(function(r){return r.day<M.today}),'sleep'),deepBase:mean(full.filter(function(r){return r.day<M.today&&r.ssrc==='Apple Watch'&&r.deep!=null}).slice(-30),'deep'),rhrBase:mean(last30,'rhr'),stepsBase:mean(last30,'steps'),
    hrv:hrvRow,hrvBase:basePrior(hrvRow,'hrv'),W:W,wl:wl,w30:w30,weeks:weeks,form:fr,fw:fr?LG.formWord(fr.tsb):null,lastWo:lastWo,load7:load7,load28:load28};};
LG.rng=function(t){return t?(t.lo===t.hi?it(t.hi):it(t.lo)+'–'+it(t.hi))+' kcal'+(t.estimated?' (stima)':''):null;};
LG.TYPES=Object.assign(Object.create(null),{riposo:'Riposo',allenamento:'Allenamento'});
LG.plan=function(M){var D=M.D,md=((D.meals&&D.meals.days)||[]).filter(function(x){return x.day===M.today})[0],T=M.by[M.today];
  if(T.wo.length)return {state:'done',label:T.wo[0].type+(T.wo.length>1?' + '+(T.wo.length-1):'')};
  if(!md||!md.day_type)return {state:'none'};var ty=md.day_type,lab=LG.TYPES[ty]||ty,tm=(md.notes||'').match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if(ty==='riposo')return {state:'rest',label:'Riposo'};return {state:'todo',label:lab,time:tm?(+tm[1])+':'+tm[2]:null,type:ty};};
LG.energyRows=function(rows){return {est:function(i){var x=rows[i];return !!x&&x.full&&x.burned==null&&x.estimate!=null},vals:rows.map(function(x){return x.full?(x.burned!=null?x.burned:x.estimate):x.partial}),ghost:function(i){var x=rows[i];return !x.full||x.burned==null},marks:function(i){var x=rows[i];return x.full&&x.burned==null&&x.estimate==null&&x.dropped?'×':''}};};
LG.diff=function(v,b,unit,dec,inv){if(v==null||b==null)return '';var d=v-b,a=Math.abs(d);if(a<(dec?Math.pow(10,-dec):1))return '<span class="chip">come la tua media</span>';
  var good=inv?d<0:d>0;return '<span class="chip '+(good?'ok':'fail')+'">'+(d>0?'▲ ':'▼ ')+(unit==='h'?CX.hmin(a):it(a,dec)+(unit?' '+unit:''))+'<span class="vs"> vs media 30 gg</span></span>';};
// signed number without "−0,0"
LG.sgn=function(v,dec){var r=+(+v).toFixed(dec||0)||0;return (r>0?'+':'')+it(r,dec||0);};
// headlines in plain Italian
LG.say={
  today:function(d){var T=d.T,b=T.partial,e=T.eaten,t=T.target;
    if(e!=null&&t)return {h:(t.hi-e>0?'Ti restano '+it(t.hi-e)+' kcal':'Obiettivo superato di '+it(e-t.hi)+' kcal'),s:'Hai mangiato '+it(e)+' kcal su '+LG.rng(t)+' (obiettivo'+(t.type?' '+t.type:'')+') · bruciate finora '+it(b)+' kcal'};
    if(e!=null)return {h:'Hai mangiato '+it(e)+' kcal',s:'Bruciate finora '+it(b)+' kcal'+' · obiettivo del giorno non impostato'};
    return {h:b!=null?'Hai bruciato '+it(b)+' kcal finora':'Oggi ancora nessun dato',s:'Nessun pasto registrato oggi nel diario Forma'+(t?' · obiettivo '+LG.rng(t):'')};},
  recovery:function(d){var T=d.T,s=T.sleep,b=d.sleepBase;
    if(s!=null)return {h:'Hai dormito '+CX.hmin(s),s:b!=null?(Math.abs(s-b)<1?'In linea con la tua media di 30 notti':(s>b?CX.hmin(s-b)+' più':CX.hmin(b-s)+' meno')+' della tua media di 30 notti'):'Apple Salute'};
    return {h:'Sonno di stanotte: nessun dato',s:''};},
  trend:function(d){var wl=d.wl,w30=d.w30,wk=d.weeks[d.weeks.length-1],avg=F.mean(d.weeks.slice(-9,-1).map(function(x){return x.days})),h;
    if(wl&&w30){var dl=wl[1]-w30[1];h=Math.abs(dl)<.3?'Peso stabile':dl<0?'Peso in calo':'Peso in aumento';h+=' · '+it(wl[1],1)+' kg';}else h=wl?'Peso '+it(wl[1],1)+' kg':'Peso: nessun dato';
    return {h:h,s:(wl&&w30?(wl[1]-w30[1]>0?'+':'')+it(wl[1]-w30[1],1)+' kg in 30 giorni · ':'')+wk.days+(wk.days===1?' giorno':' giorni')+' di allenamento questa settimana'+(avg!=null?' (media '+it(avg,1)+')':'')+(d.fw?' · forma: '+d.fw[0]:'')};}};
// Re-layout when the window changes size, including a live fold (width and height both move).
// URL-bar show/hide is a small height change and does not redraw every chart.
LG.watchSize=function(fn){var lw=innerWidth,lh=innerHeight,t=0;function kick(){clearTimeout(t);t=setTimeout(function(){var w=innerWidth,h=innerHeight;if(w===lw&&Math.abs(h-lh)<120)return;lw=w;lh=h;fn();},100);}
  addEventListener('resize',kick);addEventListener('orientationchange',kick);if(window.visualViewport)visualViewport.addEventListener('resize',kick);
  if(window.ResizeObserver){try{new ResizeObserver(kick).observe(document.documentElement);}catch(e){}}};
// ---------------- boot ----------------
LG.boot=function(render){if(RED())document.documentElement.classList.add('rm');fetch(F.dataUrl(),{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null}).then(function(D){
  if(!D||!D.days){document.getElementById('app').insertAdjacentHTML('beforeend','<div class="card" style="margin:110px auto;max-width:520px;padding:24px"><b>Nessun dato</b><p class="hint">Dati non disponibili (errore di caricamento o accesso). Riprova tra poco.</p></div>');return;}
  var M=CX.model(D);render(M,LG.derive(M));if(window.FormaTheme)FormaTheme.mount(document.querySelector('.lg-top'));LG.glass();LG.light();document.documentElement.classList.add('ready');});};
})();
