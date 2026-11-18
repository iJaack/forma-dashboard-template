// Local-only Wrangler integration. No login, remote migration, deployment or network install.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'forma-e2e-'));
const logs=path.join(temp,'e2e.log');
const children=new Set();
// An allowlist avoids inheriting account credentials or any config in the caller's home.
const env=Object.fromEntries(['PATH','TMPDIR','TEMP','TMP','LANG','LC_ALL','SystemRoot'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{XDG_CONFIG_HOME:path.join(temp,'config-home'),FORMA_TEST_CONFIG_HOME:path.join(temp,'config-home'),WRANGLER_SEND_METRICS:'false',WRANGLER_SEND_ERROR_REPORTS:'false',DO_NOT_TRACK:'1',CI:'true',NO_UPDATE_NOTIFIER:'1',WRANGLER_LOG_PATH:path.join(temp,'wrangler.log'),WRANGLER_REGISTRY_PATH:path.join(temp,'registry'),npm_config_cache:path.join(temp,'npm-cache'),NO_COLOR:'1',NODE_OPTIONS:`--require ${JSON.stringify(path.join(root,'tests/wrangler-isolation.cjs'))}`});
delete env.CLOUDFLARE_API_TOKEN;delete env.CLOUDFLARE_ACCOUNT_ID;
const command=process.env.WRANGLER||'npx';
const prefix=process.env.WRANGLER?[]:['--no-install','--prefix',root,'wrangler'];
const config=path.join(temp,'wrangler.toml'),persist=path.join(temp,'state');
const append=data=>fs.appendFile(logs,data).catch(()=>{});
function start(binary,args,cwd=temp){
  const child=spawn(binary,args,{cwd,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
  children.add(child);child.once('exit',()=>children.delete(child));
  child.stdout.on('data',append);child.stderr.on('data',append);
  return child;
}
async function run(binary,args,cwd){
  const child=start(binary,args,cwd);let output='';
  child.stdout.on('data',d=>{output+=d});child.stderr.on('data',d=>{output+=d});
  const timer=setTimeout(()=>stop(child),90000);
  try {const [code]=await once(child,'exit');assert.equal(code,0,`${args.join(' ')} failed; local log: ${logs}\n${output.slice(-1800)}`);return output;}
  finally{clearTimeout(timer);}
}
const wr=args=>run(command,[...prefix,...args,'--config',config]);
async function stop(child){
  if(child.exitCode!==null)return;
  const exited=once(child,'exit').catch(()=>{});
  try{if(process.platform==='win32')child.kill('SIGTERM');else process.kill(-child.pid,'SIGTERM');}catch{}
  await Promise.race([exited,new Promise(r=>setTimeout(r,2000))]);
  // Only signal the process group created by this test, including Wrangler's workerd child.
  try{if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else if(child.exitCode===null)child.kill('SIGKILL');}catch{}
}
async function freePort(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(r=>server.close(r));return port;}
const password='synthetic-local-password',secret='synthetic-local-ingest';
let server,site;
async function serve(ingestSecret){
  await fs.writeFile(path.join(temp,'.dev.vars'),`SITE_PASSWORD=${password}\nSESSION_KEY=synthetic-local-session-key-for-tests-only\n${ingestSecret?`INGEST_SECRET=${ingestSecret}\n`:''}`,{mode:0o600});
  const port=await freePort();site='http://127.0.0.1:'+port;
  const inspector=await freePort();
  server=start(command,[...prefix,'dev','--local','--ip','127.0.0.1','--port',String(port),'--inspector-port',String(inspector),'--persist-to',persist,'--config',config]);
  const deadline=Date.now()+60000;
  while(Date.now()<deadline){
    if(server.exitCode!==null)throw Error(`Wrangler exited before readiness; local log: ${logs}`);
    try{const response=await fetch(site+'/login',{signal:AbortSignal.timeout(1000)});if(response.status===200)return;}catch{}
    await new Promise(r=>setTimeout(r,200));
  }
  throw Error(`Wrangler did not start; local log: ${logs}`);
}
const get=(route,options={})=>fetch(site+route,{redirect:'manual',signal:AbortSignal.timeout(15000),...options});
const post=(route,body,headers={})=>get(route,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+secret,...headers},body:JSON.stringify(body)});
const ok=async response=>{assert.equal(response.status,200,await response.clone().text());const data=await response.json();assert.equal(data.ok,true,JSON.stringify(data));return data;};
let success=false;
try{
  await run(process.execPath,['scripts/build.mjs'],root);
  await fs.cp(path.join(root,'build'),path.join(temp,'build'),{recursive:true});
  await fs.cp(path.join(root,'migrations'),path.join(temp,'migrations'),{recursive:true});
  let toml=await fs.readFile(path.join(root,'wrangler.example.toml'),'utf8');
  toml=toml.replace('REPLACE_WITH_YOUR_DATABASE_ID','00000000-0000-0000-0000-000000000000').replace('DEFAULT_TZ = "UTC"','DEFAULT_TZ = "Asia/Tokyo"\nSITE_LABEL = "Synthetic local dashboard"');
  await fs.writeFile(config,toml);
  await fs.mkdir(env.XDG_CONFIG_HOME,{recursive:true});
  await wr(['d1','migrations','apply','DB','--local','--persist-to',persist]);
  const tableResult=await wr(['d1','execute','DB','--local','--persist-to',persist,'--command',"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",'--json']);
  const tables=JSON.parse(tableResult).flatMap(r=>r.results).map(r=>r.name);
  for(const table of ['samples','workouts','hk_quantity','hk_events','kv','meals','meal_days','body_comp','login_fail'])assert.ok(tables.includes(table),table);
  await serve(secret);
  assert.equal((await get('/')).status,302);assert.equal((await get('/')).headers.get('location'),'/login');
  assert.match(await (await get('/login')).text(),/Synthetic local dashboard/);
  const day=new Date().toISOString().slice(0,10),cf={'CF-Access-Client-Id':'unused','CF-Access-Client-Secret':'unused','CF-Access-Jwt-Assertion':'ignored-in-bearer-mode'};
  const meal={id:'synthetic-meal-a',day,meal:'pranzo',time:'12:00',title:'Synthetic meal A',kcal:500,protein:20,carbs:80,fat:10};
  await ok(await post('/api/ingest/meals',{source:'test',entries:[meal],days:[{day,day_type:'riposo'}]},cf));
  let data=await (await get('/api/ingest/meals?day='+day,{headers:{authorization:'Bearer '+secret}})).json();assert.equal(data.entries.length,1);assert.equal(data.entries[0].title,meal.title);
  assert.equal(data.summary.day_type,'riposo');
  for(const [type,expected] of [['allenamento','allenamento'],['test_unconfigured',null]]){
    await ok(await post('/api/ingest/meals',{source:'test',days:[{day,day_type:type}]},cf));
    data=await (await get('/api/ingest/meals?day='+day,{headers:{authorization:'Bearer '+secret}})).json();
    assert.equal(data.summary.day_type,expected);
  }
  const health={format:'forma-sync/2',source:'test',quantities:[{type:'step_count',agg:'sum',date:day,value:10000,unit:'count'}]};
  await ok(await post('/api/ingest/health',health,cf));
  // A second synthetic row exercises the production display filter; the temporary DB is discarded.
  await ok(await post('/api/ingest/health',{...health,source:undefined},cf));
  for(const route of ['health','meals']){
    assert.equal((await post('/api/ingest/'+route,{}, {authorization:'Bearer wrong'})).status,401);
    assert.equal((await get('/api/ingest/'+route,{method:'POST',body:'{}'})).status,401);
  }
  const login=await get('/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password})});assert.equal(login.status,303);
  const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
  const page=await get('/',{headers:{cookie}});assert.equal(page.status,200);assert.match(await page.text(),/Synthetic local dashboard/);
  const reference=await get('/concept/nut_ref.js',{headers:{cookie}});
  assert.equal(reference.status,200);
  assert.equal(await reference.text(),await fs.readFile(path.join(root,'build/concept/nut_ref.js'),'utf8'));
  const response=await get('/api/data',{headers:{cookie}});assert.equal(response.status,200);data=await response.json();assert.equal(data.config.tz,'Asia/Tokyo');assert.deepEqual(data.config.dayTypes,['riposo','allenamento']);assert.ok(data.days.some(d=>d.day===day&&d.steps===10000));
  await ok(await get('/api/ingest/meals?source=test',{method:'DELETE',headers:{authorization:'Bearer '+secret}}));
  data=await (await get('/api/ingest/meals?day='+day,{headers:{authorization:'Bearer '+secret}})).json();assert.equal(data.entries.length,0);assert.equal(data.summary,null);
  await ok(await get('/api/ingest/health?source=test',{method:'DELETE',headers:{authorization:'Bearer '+secret}}));
  await stop(server);
  const counts=await wr(['d1','execute','DB','--local','--persist-to',persist,'--command',"SELECT (SELECT count(*) FROM samples WHERE source='test')+(SELECT count(*) FROM hk_quantity WHERE source='test')+(SELECT count(*) FROM hk_events WHERE source='test')+(SELECT count(*) FROM workouts WHERE source='test')+(SELECT count(*) FROM meals WHERE source='test')+(SELECT count(*) FROM meal_days WHERE source='test') n",'--json']);
  assert.equal(JSON.parse(counts)[0].results[0].n,0);
  await serve(null);
  for(const route of ['health','meals']){const r=await post('/api/ingest/'+route,{});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'ingest_not_configured'});}
  console.log('e2e: local migrations, bearer ingest, optional headers, login, dashboard config, cleanup and missing-secret checks passed');
  success=true;
}finally{
  await Promise.all([...children].map(stop));
  if(success)await fs.rm(temp,{recursive:true,force:true});
  else console.error(`Local-only test failed; isolated synthetic state and logs retained at ${temp}`);
}
