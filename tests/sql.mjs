// Exercise every worker query family against the actual empty migration, locally.
// No external packages; Node 22.13+ provides node:sqlite for this check.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { DatabaseSync } = await import('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const source = fs.readFileSync(new URL('../src/pages_worker.js', import.meta.url), 'utf8')
  .replace('__STATIC__','{}').replace('__SEC__','{}') + '\nexport { signSession };';
const W = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const queries=new Set();
const DB={prepare(sql){
  const st={args:[],bind(...args){st.args=args;return st;},query(){
    queries.add(sql);
    const args=/\?\d/.test(sql)?[...sql.matchAll(/\?(\d+)/g)].map(m=>st.args[Number(m[1])-1]):st.args;
    return [sqlite.prepare(sql.replace(/\?\d+/g,'?')),args];
  },async all(){const [q,args]=st.query();return {results:q.all(...args)};},
  async first(){const [q,args]=st.query();return q.get(...args)||null;},
  async run(){const [q,args]=st.query();return {meta:{changes:Number(q.run(...args).changes)}};}};
  return st;
},async batch(statements){const results=[];for(const st of statements)results.push(await st.run());return results;}};
const env={D1_BINDING:'TEST_DB',TEST_DB:DB,INGEST_SECRET:'synthetic-ingest-test',SITE_PASSWORD:'synthetic-password-test',SESSION_KEY:'synthetic-session-test',DAY_TYPES:'rest,cycling',DEFAULT_TZ:'UTC'};
const day=new Date().toISOString().slice(0,10);
const request=async (route,method='GET',body,headers={})=>{
  const res=await W.default.fetch(new Request('https://example.com'+route,{method,headers:{authorization:'Bearer '+env.INGEST_SECRET,...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),env);
  assert.ok(res.status<500,`${method} ${route}: ${await res.clone().text()}`);return res;
};
const ok=async res=>{assert.equal(res.status,200);const body=await res.json();assert.equal(body.ok,true,JSON.stringify(body));return body;};
try {
  sqlite.exec(fs.readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
  const tables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name);
  assert.deepEqual(tables,['body_comp','hk_events','hk_quantity','kv','login_fail','meal_days','meals','samples','workouts']);
  for(const table of tables)assert.equal(sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
  const meal={id:'synthetic-meal-a',day,meal:'pranzo',time:'12:00',title:'Synthetic meal A',kcal:500,protein:20,carbs:80,fat:10,items:[{f:'banana',g:100}],nutrients:{fiber:10}};
  await ok(await request('/api/ingest/meals','POST',{source:'test',entries:[meal],days:[{day,day_type:'cycling',kcal:2000,protein:100}],targets:{cycling:2000,protein:[100,140]},supp_plan:[]}));
  let read=await (await request('/api/ingest/meals?day='+day)).json();assert.equal(read.entries.length,1);assert.equal(read.summary.day_type,'cycling');assert.equal(read.entries[0].source,'test');
  await ok(await request('/api/ingest/meals','POST',{source:'test',entries:[{...meal,items:undefined,nutrients:undefined,kcal:600}]}));
  read=await (await request('/api/ingest/meals?day='+day)).json();assert.equal(read.entries.length,1);assert.equal(read.entries[0].items[0].g,100);assert.equal(read.entries[0].nutrients.fiber,10);
  const health={source:'test',format:'forma-sync/2',quantities:[{type:'step_count',agg:'sum',date:day,value:10000,unit:'count'},{type:'heart_rate',agg:'sample',start:day+'T10:00:00Z',end:day+'T10:01:00Z',day,value:100,unit:'bpm'}],events:[{id:'synthetic-sleep',type:'sleep_analysis',value:'asleep_core',start:day+'T00:00:00Z',end:day+'T06:00:00Z',day,extra:{source:'com.apple.health.synthetic'}}],workouts:[{id:'synthetic-workout',type:'walking',day,start:day+'T10:00:00Z',end:day+'T11:00:00Z',duration_min:60,kcal:100,distance_km:5,avg_hr:100,max_hr:160,elevation_m:100,effort:5,extra:{source_bundle:'com.apple.health.synthetic'}}]};
  await ok(await request('/api/ingest/health','POST',health));
  await ok(await request('/api/ingest/health','POST',{...health,source:undefined})); // Synthetic display rows, confined to this in-memory DB.
  await ok(await request('/api/ingest/health','POST',{source:'test',format:'forma-sync/1',daily:[{date:day,metrics:{active_kcal:500,resting_kcal:1500}}],workouts:[{id:'synthetic-v1',start:day+'T12:00:00Z',day,duration_min:30}]}));
  await ok(await request('/api/ingest/health','POST',{source:'test',date:day,metrics:{steps:10000},workouts:[]}));
  sqlite.prepare('INSERT INTO body_comp(day,source,key,value,unit) VALUES(?,?,?,?,?)').run(day,'test','weight_kg',70,'kg');
  const cookie='__Host-forma='+await W.signSession(env,Date.now()+3600000);
  let res=await request('/api/data','GET',undefined,{cookie});assert.equal(res.status,200);assert.equal(res.headers.get('x-forma-cache'),'miss');
  let data=await res.json();assert.equal(data.config.tz,'UTC');assert.ok(data.days.some(d=>d.day===day));assert.equal(data.body[0].value,70);
  assert.equal((await request('/api/data','GET',undefined,{cookie})).headers.get('x-forma-cache'),'hit');
  assert.equal((await request('/api/day?date='+day,'GET',undefined,{cookie})).status,200);
  assert.equal((await request('/api/day?date=bad','GET',undefined,{cookie})).status,400);
  await ok(await request('/api/ingest/meals','POST',{source:'test',entries:[{...meal,kcal:700}]}));
  assert.equal((await request('/api/data','GET',undefined,{cookie})).headers.get('x-forma-cache'),'miss','same-second updates invalidate the cache');
  await ok(await request('/api/ingest/health','POST',{source:'test',format:'forma-sync/2',deleted_workouts:['synthetic-v1'],deleted_events:['synthetic-sleep']}));
  for(const body of [null,[],42])for(const route of ['health','meals'])assert.equal((await request('/api/ingest/'+route,'POST',body)).status,400);
  assert.equal((await request('/login','POST','password=wrong',{'content-type':'application/x-www-form-urlencoded'})).status,401);
  assert.equal((await request('/login','POST','password='+env.SITE_PASSWORD,{'content-type':'application/x-www-form-urlencoded'})).status,303);
  await ok(await request('/api/ingest/meals?id=synthetic-meal-a','DELETE'));
  await ok(await request('/api/ingest/meals','POST',{source:'test',entries:[meal]}));
  await ok(await request('/api/ingest/meals?day='+day,'DELETE'));
  await ok(await request('/api/ingest/meals','POST',{source:'test',entries:[meal],days:[{day,day_type:'rest'}]}));
  await ok(await request('/api/ingest/meals?source=test','DELETE'));
  await ok(await request('/api/ingest/health?source=test','DELETE'));
  for(const table of ['samples','workouts','hk_quantity','hk_events','meals','meal_days'])assert.equal(sqlite.prepare(`SELECT count(*) n FROM ${table} WHERE source='test'`).get().n,0,table);
  for(const table of tables)assert.ok([...queries].some(sql=>new RegExp('\\b'+table+'\\b').test(sql)),`${table} queried`);
  console.log(`sql: empty migration and ${queries.size} distinct worker queries passed`);
} finally {sqlite.close();}
