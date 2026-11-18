// Forma theme: saved choice (Chiaro/Scuro) -> ?theme= -> Auto (local clock: light 07:00-18:59, dark otherwise).
// Loaded as a blocking external script in <head> (CSP: no inline), so the theme is set before first paint.
(function(root){'use strict';var KEY='forma.theme',T={};
T.auto=function(d){var h=d.getHours();return h>=7&&h<19?'light':'dark';};
T.pick=function(saved,param,d){if(saved==='light'||saved==='dark')return saved;if(param==='light'||param==='dark')return param;return T.auto(d);};
root.FormaTheme=T;if(typeof document==='undefined'||!document.documentElement)return;
var html=document.documentElement,mq=function(q){try{return matchMedia(q).matches}catch(e){return false}};
function saved(){try{return localStorage.getItem(KEY)}catch(e){return null}}
function param(){try{return new URLSearchParams(location.search).get('theme')}catch(e){return null}}
T.mode=function(){var s=saved();return s==='light'||s==='dark'?s:'auto';};
T.apply=function(fade){var t=T.pick(saved(),param(),new Date());if(html.dataset.theme===t){html.dataset.themeMode=T.mode();return;}
  if(fade&&html.dataset.theme&&!mq('(prefers-reduced-motion: reduce)')){html.classList.add('th-fade');clearTimeout(T._f);T._f=setTimeout(function(){html.classList.remove('th-fade')},450);}
  html.dataset.theme=t;html.dataset.themeMode=T.mode();try{dispatchEvent(new CustomEvent('formatheme',{detail:t}))}catch(e){}};
T.set=function(m){try{if(m==='light'||m==='dark')localStorage.setItem(KEY,m);else localStorage.removeItem(KEY);}catch(e){}T.apply(true);T.sync();};
// small Auto / Chiaro / Scuro switch for the top bar
var OPTS=[['auto','Auto','◐','Automatico: chiaro dalle 7 alle 19'],['light','Chiaro','☀','Tema chiaro'],['dark','Scuro','☾','Tema scuro']];
T.mount=function(host){if(!host||host.querySelector('.thsw'))return;var g=document.createElement('div');g.className='thsw';g.setAttribute('role','group');g.setAttribute('aria-label','Tema');
  g.innerHTML=OPTS.map(function(o){return '<button type="button" class="jk-focus-inset" data-m="'+o[0]+'" title="'+o[3]+'" aria-label="'+o[3]+'"><span class="i" aria-hidden="true">'+o[2]+'</span><span class="l">'+o[1]+'</span></button>'}).join('');
  g.addEventListener('click',function(e){var b=e.target.closest('button');if(b)T.set(b.dataset.m);});host.appendChild(g);T.sync();};
T.sync=function(){var m=T.mode();[].forEach.call(document.querySelectorAll('.thsw button'),function(b){b.setAttribute('aria-pressed',b.dataset.m===m?'true':'false')});};
T.apply(false);
setInterval(function(){T.apply(true)},60000);
addEventListener('focus',function(){T.apply(true)});document.addEventListener('visibilitychange',function(){if(!document.hidden)T.apply(true)});
addEventListener('storage',function(e){if(e.key===KEY){T.apply(true);T.sync();}});
})(typeof window!=='undefined'?window:this);
