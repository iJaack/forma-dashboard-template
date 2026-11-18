// Entirely offline: certificate requests are intercepted; all credentials are synthetic.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../src/pages_worker.js', import.meta.url), 'utf8')
  .replace('__STATIC__', JSON.stringify({'/index.html':['<p>__SITE_LABEL__</p>','text/html']}))
  .replace('__SEC__', '{}') + '\nexport { config, parseTargets, db, ingestAuth, signSession };';
const W = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const defaults = {estimates:{},protein:{base:100,threshold:2200,slope:0.1,cap:140},fat:{lo:.25,hi:.30},fiber:30};
assert.deepEqual(W.config(), {tz:'UTC',targets:defaults,dayTypes:['riposo','allenamento']});
for (const value of [undefined,'','{','null','[]','false','123',null,42,[]]) assert.deepEqual(W.parseTargets(value), defaults);
const custom = W.config({DEFAULT_TZ:'Asia/Tokyo',TARGETS:'{"estimates":{"cycling":2400},"protein":{"base":120},"fiber":40}',DAY_TYPES:' cycling,rest,cycling, <bad>'});
assert.equal(custom.tz,'Asia/Tokyo'); assert.deepEqual(custom.dayTypes,['cycling','rest']);
assert.deepEqual(custom.targets,{...defaults,estimates:{cycling:2400},protein:{...defaults.protein,base:120},fiber:40});
for (const value of ['Mars/Unknown','../UTC','UTC\n',{},42]) assert.equal(W.config({DEFAULT_TZ:value}).tz,'UTC');
for (const value of ['',',,,','<bad>',{},42]) assert.deepEqual(W.config({DAY_TYPES:value}).dayTypes,W.config().dayTypes);
assert.deepEqual(W.parseTargets({estimates:{cycling:-1,bad:Infinity,'<x>':2000},protein:{base:500,cap:100},fat:{lo:.8,hi:.1},fiber:-1}),defaults);
assert.deepEqual(W.parseTargets('{"estimates":{"__proto__":2000,"constructor":3000},"__proto__":{"polluted":true}}').estimates,{constructor:3000});
assert.equal({}.polluted,undefined);
const DB = {}, CUSTOM = {}; assert.equal(W.db({DB}),DB); assert.equal(W.db({DB,CUSTOM,D1_BINDING:'CUSTOM'}),CUSTOM);
for (const value of ['../DB','',null,42]) assert.equal(W.db({DB,D1_BINDING:value}),DB);

const F={}; vm.runInNewContext(fs.readFileSync(new URL('../src/app_real.js',import.meta.url),'utf8'),{
  __FORMA_TEST__:F,document:{},location:{protocol:'file:'},Intl:{DateTimeFormat:function(locale,opts){if(!locale)throw Error('no device zone');return new Intl.DateTimeFormat(locale,opts);}},Date,Math
});
assert.equal(new URL(F.dataUrl(),'https://example.com').searchParams.has('tz'),false);
const D={days:[],config:custom,meals:{days:[{day:'2040-01-01',day_type:'cycling'}],targets:{}}};
F.configure(D); assert.equal(F.userTz(),'Asia/Tokyo'); assert.equal(F.targetFor(D,'2040-01-01','2040-01-01').lo,2400);
D.meals.targets={cycling:3000,protein:{base:100,cap:200,threshold:2000,slope:.1},fat:{lo:.2,hi:.3},fiber:50};
let target=F.targetFor(D,'2040-01-01','2040-01-01'); assert.equal(target.lo,3000);assert.equal(target.protein.value,200);assert.equal(target.fiber.value,50);
F.configure(D);assert.equal(F.MACRO_TARGETS.fiber,50);
D.meals.targets={cycling:3000,protein:{cap:200},fat:{lo:.2}};
target=F.targetFor(D,'2040-01-01','2040-01-01');assert.equal(target.protein.value,200);assert.equal(target.fat.lo,66.7);assert.equal(target.fat.hi,100);
D.meals.targets={estimates:{cycling:2800}};assert.equal(F.targetFor(D,'2040-01-01','2040-01-01').lo,2800);
D.config={tz:'UTC',targets:defaults};D.meals.targets={};assert.equal(F.targetFor(D,'2040-01-01','2040-01-01'),null);

const originalFetch=globalThis.fetch;let certFetches=0;
globalThis.fetch=async url=>{certFetches++;assert.equal(String(url),'https://synthetic-team.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[]});};
const request = headers=>new Request('https://example.com/api/ingest/health',{headers});
const secret='synthetic-ingest-only';
const cfHeaders={'CF-Access-Client-Id':'unused','CF-Access-Client-Secret':'unused','cf-access-jwt-assertion':'malformed'};
try {
  let response=await W.ingestAuth(request(cfHeaders),{});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'ingest_not_configured'});
  for(const authorization of [undefined,'','Bearer wrong','Basic test','Bearer undefined'])assert.equal((await W.ingestAuth(request({...cfHeaders,...(authorization?{authorization}:{})}),{INGEST_SECRET:secret})).status,401);
  const headers={...cfHeaders,authorization:'Bearer '+secret};
  assert.equal(await W.ingestAuth(request(headers),{INGEST_SECRET:secret}),null);
  for(const extra of [{ACCESS_TEAM:'synthetic-team.cloudflareaccess.com'},{ACCESS_TEAM:'synthetic-team.cloudflareaccess.com',ACCESS_AUD_INGEST:'test-audience'},{INGEST_CLIENT_ID:'test-id',ACCESS_AUD_INGEST:'test-audience'}])assert.equal(await W.ingestAuth(request(headers),{INGEST_SECRET:secret,...extra}),null);
  for(const extra of [{},{ACCESS_TEAM:'synthetic-team.cloudflareaccess.com',ACCESS_AUD_MAIN:'test-audience'}])assert.equal((await W.default.fetch(new Request('https://example.com/',{headers:cfHeaders}),extra)).status,302);
  assert.equal(certFetches,0,'incomplete Access configuration must never fetch certificates');
  const accessEnv={INGEST_SECRET:secret,ACCESS_TEAM:'synthetic-team.cloudflareaccess.com',ACCESS_AUD_INGEST:'test-audience',INGEST_CLIENT_ID:'test-id'};
  assert.equal((await W.ingestAuth(request(headers),accessEnv)).status,403);
  assert.equal(certFetches,0,'malformed JWT must not fetch certificates');
  // A real signed, synthetic JWT tests the full optional Access path.
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='synthetic-key';
  globalThis.fetch=async()=>{certFetches++;return Response.json({keys:[jwk]});};
  const jwt=async claims=>{
    const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
    const text=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:'https://synthetic-team.cloudflareaccess.com',aud:['test-audience'],exp:Date.now()/1000+600,...claims});
    return text+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(text))).toString('base64url');
  };
  const token=await jwt({common_name:'test-id',email:'owner@example.com'});
  assert.equal(await W.ingestAuth(request({authorization:'Bearer '+secret,'cf-access-jwt-assertion':token}),accessEnv),null);
  for(const claims of [{common_name:'wrong'},{common_name:'test-id',aud:'wrong'},{common_name:'test-id',exp:0},{common_name:'test-id',iss:'https://example.com'}])assert.equal((await W.ingestAuth(request({authorization:'Bearer '+secret,'cf-access-jwt-assertion':await jwt(claims)}),accessEnv)).status,403);
  const mainEnv={ACCESS_TEAM:accessEnv.ACCESS_TEAM,ACCESS_AUD_MAIN:'test-audience',ALLOWED_EMAIL:'OWNER@example.com',SITE_LABEL:'Synthetic <dashboard> & "label"'};
  const main=await W.default.fetch(new Request('https://example.com/',{headers:{'cf-access-jwt-assertion':token}}),mainEnv);
  assert.equal(main.status,200);assert.equal(await main.text(),'<p>Synthetic &lt;dashboard&gt; &amp; &quot;label&quot;</p>');
  assert.equal((await W.default.fetch(new Request('https://example.com/',{headers:{'cf-access-jwt-assertion':await jwt({email:'other@example.com'})}}),mainEnv)).status,302);
  const login=await W.default.fetch(new Request('https://example.com/login'),{});assert.equal(login.status,503);assert.match(await login.text(),/example.com/);
  const configuredLogin=await W.default.fetch(new Request('https://example.com/login'),{SITE_PASSWORD:'synthetic-password',SESSION_KEY:'test-key',SITE_LABEL:'<Synthetic>'});assert.equal(configuredLogin.status,200);assert.match(await configuredLogin.text(),/&lt;Synthetic&gt;/);
} finally {globalThis.fetch=originalFetch;}
console.log('config: parsing, precedence, binding, timezone, escaping and optional Access passed');
