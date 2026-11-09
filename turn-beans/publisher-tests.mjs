import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {handle} from './publisher/worker.mjs';
import {createGitHubRepository,PublishError,DESTINATION} from './publisher/github-repository.mjs';
const require=createRequire(import.meta.url),schema=require('./level-document.js'),{createClient}=require('./publisher-client.js');
const sample=JSON.parse(fs.readFileSync(new URL('./level-library/levels/subject-demo.json',import.meta.url),'utf8'));
const baseIndex=JSON.parse(fs.readFileSync(new URL('./level-library/index.json',import.meta.url),'utf8'));
const copy=value=>structuredClone(value),csrf='c'.repeat(48),head='a'.repeat(40),nextHead='b'.repeat(40),origin='https://site.test';
const answer=(value,status=200)=>new Response(JSON.stringify(value),{status});
function environment(options={}){
  return {ENABLED:'true',PUBLIC_ORIGIN:origin,GITHUB:{fetch:()=>assert.fail('real GitHub must never be used')},
    AUTH:{fetch:async()=>options.loggedOut?answer({},401):answer({login:'admin',csrfToken:csrf,expiresAt:'2099-01-01T00:00:00.000Z'})}};
}
function repository({existing=false,admin=true,orphan=false,conflict=false}={}){
  const calls=[];
  return {calls,isAdmin:async login=>login==='admin'&&admin,
    snapshot:async()=>({head,index:{...copy(baseIndex),levels:existing?copy(baseIndex.levels):[]}}),
    readLevel:async()=>existing||orphan?JSON.stringify(sample):null,
    commit:async(expected,files,message)=>{if(conflict)throw new PublishError(409,'concurrent update');
      calls.push({expected,files,message});return nextHead;}
  };
}
function request(input,headers={}){
  return new Request('https://publisher.test/publish',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf,...headers},
    body:JSON.stringify({document:copy(sample),expectedRevision:1,confirmOverwrite:false,...input})});
}
test('unconfigured Worker is explicitly disabled and never pretends an upload succeeded',async()=>{
  const caps=await handle(new Request('https://publisher.test/capabilities'),{});
  assert.equal((await caps.json()).configured,false);
  assert.equal((await handle(request(),{PUBLIC_ORIGIN:origin})).status,503);
});
test('administrator, valid session, fixed Origin and CSRF are all required before writing',async()=>{
  for(const [env,repo,headers,status]of [
    [environment({loggedOut:true}),repository(),{},401],
    [environment(),repository({admin:false}),{},403],
    [environment(),repository(),{Origin:'https://evil.test'},403],
    [environment(),repository(),{'X-CSRF-Token':'bad'},403]
  ]){
    assert.equal((await handle(request({},headers),env,{repository:repo})).status,status);assert.equal(repo.calls.length,0);
  }
});
test('capability response requires actual server-side administrator authorization',async()=>{
  const repo=repository(),response=await handle(new Request('https://publisher.test/capabilities',{headers:{Origin:origin}}),environment(),{repository:repo});
  const data=await response.json();assert.equal(data.authorized,true);assert.equal(data.revision,1);assert.equal(data.csrfToken,csrf);
});
test('forged verified flags and altered solutions fail real server replay without a commit',async()=>{
  const bad=copy(sample);bad.variants.hard.solution.pop();bad.variants.hard.verified=true;
  const repo=repository(),response=await handle(request({document:bad}),environment(),{repository:repo});
  assert.equal(response.status,422);assert.equal(repo.calls.length,0);
});
test('malformed JSON, excessive bodies and unsupported content types are rejected',async()=>{
  const repo=repository(),env=environment();
  assert.equal((await handle(request({}, {'Content-Type':'text/html'}),env,{repository:repo})).status,415);
  assert.equal((await handle(request({}, {'Content-Length':'600001'}),env,{repository:repo})).status,413);
  assert.equal((await handle(new Request('https://publisher.test/publish',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf},body:'{broken'}),env,{repository:repo})).status,400);
  assert.equal(repo.calls.length,0);
});
test('successful publication writes level plus index atomically and only claims a Git commit',async()=>{
  const repo=repository(),response=await handle(request(),environment(),{repository:repo}),data=await response.json();
  assert.equal(response.status,200);assert.equal(data.upload.status,'committed');assert.equal(data.deployment.status,'pending');assert.equal(data.online.status,'unconfirmed');
  assert.equal(repo.calls.length,1);const commit=repo.calls[0];assert.equal(commit.expected,head);assert.equal(commit.files.length,2);
  assert.deepEqual(commit.files.map(f=>f.path).sort(),['turn-beans/level-library/index.json','turn-beans/level-library/levels/subject-demo.json']);
  const level=commit.files.find(f=>f.path.endsWith('subject-demo.json')),index=JSON.parse(commit.files.find(f=>f.path.endsWith('index.json')).content);
  schema.validate(JSON.parse(level.content));schema.validateIndex(index);
  assert.equal(index.revision,2);assert.equal(index.levels[0].sha256,await schema.digest(level.content));
});
test('existing or orphan IDs cannot be overwritten without explicit matching version confirmation',async()=>{
  for(const repo of [repository({existing:true}),repository({orphan:true})]){
    assert.equal((await handle(request(),environment(),{repository:repo})).status,409);assert.equal(repo.calls.length,0);
  }
  const repo=repository({existing:true}),doc=copy(sample);doc.version=2;doc.metadata.updatedAt=new Date(Date.parse(sample.metadata.updatedAt)+3600000).toISOString();
  assert.equal((await handle(request({document:doc,confirmOverwrite:true,expectedVersion:99}),environment(),{repository:repo})).status,409);
  const response=await handle(request({document:doc,confirmOverwrite:true,expectedVersion:1}),environment(),{repository:repo});
  assert.equal(response.status,200);
  const updated=JSON.parse(repo.calls[0].files.find(f=>f.path.endsWith('subject-demo.json')).content);
  assert.equal(updated.version,2);assert.equal(updated.metadata.createdAt,sample.metadata.createdAt);
});
test('catalog revision conflicts, branch conflicts and client-selected destination fields cannot write',async()=>{
  const repo=repository();
  assert.equal((await handle(request({expectedRevision:0}),environment(),{repository:repo})).status,409);
  assert.equal((await handle(request({branch:'other'}),environment(),{repository:repo})).status,400);
  assert.equal((await handle(request(),environment(),{repository:repository({conflict:true})})).status,409);
  assert.equal(repo.calls.length,0);
});
test('concurrent publishers cannot silently discard each other on the same snapshot',async()=>{
  let snapshots=0,release;const gate=new Promise(resolve=>{release=resolve;});let current=head;
  const repo=repository(),records=[];
  repo.snapshot=async()=>{const snapshot={head,index:{...copy(baseIndex),levels:[]}};if(++snapshots===2)release();await gate;return snapshot;};
  repo.commit=async(expected,files)=>{if(expected!==current)throw new PublishError(409,'changed');current=nextHead;records.push(files);return nextHead;};
  const second=copy(sample);second.id='another-subject';
  const responses=await Promise.all([handle(request(),environment(),{repository:repo}),handle(request({document:second}),environment(),{repository:repo})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(records.length,1);
});
test('Git Data adapter pins destination, combines files in one tree and never force-updates refs',async()=>{
  const calls=[];const binding={fetch:async request=>{
    const url=new URL(request.url),body=request.method==='GET'?undefined:await request.json();calls.push({url,method:request.method,body});
    if(url.pathname.endsWith('/git/commits/'+head))return answer({tree:{sha:'c'.repeat(40)}});
    if(url.pathname.endsWith('/git/blobs'))return answer({sha:'d'.repeat(40)});
    if(url.pathname.endsWith('/git/trees'))return answer({sha:'e'.repeat(40)});
    if(url.pathname.endsWith('/git/commits'))return answer({sha:nextHead});
    if(url.pathname.endsWith('/git/refs/heads/main'))return answer({object:{sha:nextHead}});
    return answer({},500);
  }};
  const repo=createGitHubRepository(binding),files=[{path:DESTINATION.prefix+'index.json',content:'{}'},{path:DESTINATION.prefix+'levels/subject-demo.json',content:'{}'}];
  assert.equal(await repo.commit(head,files,'publish'),nextHead);
  assert.ok(calls.every(c=>c.url.pathname.startsWith('/repos/VvSpicesh/nocturne-games/')));
  assert.equal(calls.find(c=>c.method==='PATCH').body.force,false);
  assert.deepEqual(calls.find(c=>c.url.pathname.endsWith('/git/commits')&&c.method==='POST').body.parents,[head]);
  assert.equal(calls.find(c=>c.url.pathname.endsWith('/git/trees')).body.tree.length,2);
  await assert.rejects(repo.commit(head,[{path:'index.html',content:'oops'}],'bad'),e=>e.status===403);
  await assert.rejects(repo.readLevel('../hall',head),e=>e.status===403);
});
test('Git Data non-fast-forward failure becomes conflict without any force retry',async()=>{
  let patches=0;
  const repo=createGitHubRepository({fetch:async request=>{
    const url=new URL(request.url);
    if(request.method==='PATCH'){patches++;return answer({},422);}
    if(url.pathname.endsWith('/git/commits/'+head))return answer({tree:{sha:'c'.repeat(40)}});
    return answer({sha:nextHead});
  }});
  await assert.rejects(repo.commit(head,[{path:DESTINATION.prefix+'index.json',content:'{}'},{path:DESTINATION.prefix+'levels/subject-demo.json',content:'{}'}],'publish'),e=>e.status===409);
  assert.equal(patches,1);
});
test('frontend remains disabled without configuration and keeps authorization out of persistent storage',async()=>{
  let calls=0;const disabled=createClient({fetch:()=>{calls++;assert.fail('must not fetch');}});
  assert.equal((await disabled.inspect()).authorized,false);await assert.rejects(disabled.publish(sample));assert.equal(calls,0);
  const requests=[],client=createClient({endpoint:'https://publisher.test',fetch:async(url,options)=>{
    requests.push({url,options});return url.endsWith('/capabilities')?answer({configured:true,authorized:true,csrfToken:csrf,revision:1}):
      answer({id:sample.id,version:1,revision:2,sha256:'f'.repeat(64),upload:{status:'committed',commit:nextHead},deployment:{status:'pending'},online:{status:'unconfirmed'}});
  }});
  await client.inspect();await client.publish(sample);assert.equal(requests[1].options.credentials,'include');
  assert.equal(requests[1].options.headers['X-CSRF-Token'],csrf);assert.equal(JSON.parse(requests[1].options.body).expectedRevision,1);
  const malformed=createClient({endpoint:'https://publisher.test',fetch:async(url)=>url.endsWith('/capabilities')?
    answer({configured:true,authorized:true,csrfToken:csrf,revision:1}):answer({success:true})});
  await malformed.inspect();await assert.rejects(malformed.publish(sample),/不能确认成功/);
});

test('GitHub permission adapter permits admin only, never maintain or write',async()=>{
  const binding={fetch:async request=>{
    const login=new URL(request.url).pathname.split('/').at(-2);
    return answer({permission:login==='owner'?'admin':login==='maintainer'?'maintain':'write'});
  }};
  const repo=createGitHubRepository(binding);
  assert.equal(await repo.isAdmin('owner'),true);
  assert.equal(await repo.isAdmin('maintainer'),false);
  assert.equal(await repo.isAdmin('writer'),false);
  assert.equal(await repo.isAdmin('../owner'),false);
});
