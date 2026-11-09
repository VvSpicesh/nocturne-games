/* Authorization client contract only; every fetch is an in-memory fake. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createClient}=require('./publisher-client.js');
const csrf='c'.repeat(32),authorized={configured:true,authorized:true,csrfToken:csrf,revision:1};
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
test('an empty endpoint reports missing configuration and never sends a request',async()=>{
  let calls=0;const client=createClient({fetch:()=>{calls++;assert.fail('unexpected request');}});
  for(let n=0;n<2;n++){const result=await client.inspect();assert.equal(result.configured,false);assert.equal(result.authorized,false);}
  assert.equal(calls,0);assert.equal(client.loginURL,null);await assert.rejects(client.publish({}),/尚未获得/);
});
test('a valid admin response uses session cookies and bypasses caches',async()=>{
  let request;
  const client=createClient({endpoint:'https://publisher.test',fetch:async(url,options)=>{request={url,options};return response(authorized);}});
  assert.equal((await client.inspect()).authorized,true);assert.equal(request.url,'https://publisher.test/capabilities');
  assert.equal(request.options.credentials,'include');assert.equal(request.options.cache,'no-store');
  assert.equal(client.loginURL,'https://publisher.test/auth/login');
});
test('null, malformed and nonboolean capability responses cannot grant authorization',async()=>{
  for(const data of [null,[],{},'ok',{configured:true,authorized:'true'},{...authorized,csrfToken:'short'},{...authorized,configured:false},{...authorized,revision:1.5},{...authorized,revision:-1}]){
    const client=createClient({endpoint:'https://publisher.test',fetch:async()=>response(data)});
    const result=await client.inspect();assert.equal(result.authorized,false);assert.match(result.reason,/响应无效/);
    await assert.rejects(client.publish({}),/尚未获得/);
  }
});
test('HTTP authorization failures retain a visible reason and status code',async()=>{
  const client=createClient({endpoint:'https://publisher.test',fetch:async()=>response({error:'请先登录管理员账户'},401)});
  const result=await client.inspect();assert.equal(result.authorized,false);assert.match(result.reason,/请先登录.*HTTP 401/);
});
test('invalid JSON is reported as a format error instead of an unhandled rejection',async()=>{
  const client=createClient({endpoint:'https://publisher.test',fetch:async()=>({ok:true,json:async()=>{throw new SyntaxError('html');}})});
  const result=await client.inspect();assert.equal(result.authorized,false);assert.match(result.reason,/不是有效 JSON/);
});
test('fetch rejection reports a retryable network failure',async()=>{
  const client=createClient({endpoint:'https://publisher.test',fetch:async()=>{throw new Error('offline');}});
  const result=await client.inspect();assert.equal(result.authorized,false);assert.match(result.reason,/网络异常.*重试/);
});
test('a hung request times out, aborts and never enables publication',async()=>{
  let signal;const client=createClient({endpoint:'https://publisher.test',inspectTimeoutMs:5,
    fetch:(_url,options)=>{signal=options.signal;return new Promise(()=>{});}});
  const result=await client.inspect();assert.match(result.reason,/超时/);assert.equal(result.authorized,false);
  assert.equal(signal.aborted,true);await assert.rejects(client.publish({}),/尚未获得/);
});
test('the deadline also bounds a response body that never finishes parsing',async()=>{
  const client=createClient({endpoint:'https://publisher.test',inspectTimeoutMs:5,
    fetch:async()=>({ok:true,json:()=>new Promise(()=>{})})});
  const result=await client.inspect();assert.equal(result.authorized,false);assert.match(result.reason,/超时/);
});
test('an older successful inspection cannot restore permission after a newer denial',async()=>{
  const pending=[],client=createClient({endpoint:'https://publisher.test',fetch:()=>new Promise(resolve=>pending.push(resolve))});
  const first=client.inspect(),second=client.inspect();assert.equal(pending.length,2);
  pending[1](response({configured:true,authorized:false,reason:'会话已失效'}));assert.equal((await second).authorized,false);
  pending[0](response(authorized));assert.equal((await first).authorized,false);
  await assert.rejects(client.publish({}),/尚未获得/);
});
test('unsafe endpoint configurations and invalid timeout settings fail explicitly',()=>{
  for(const endpoint of ['http://publisher.test','https://user:pass@publisher.test','https://publisher.test?token=x','https://publisher.test#key'])
    assert.throws(()=>createClient({endpoint}),/HTTPS/);
  for(const inspectTimeoutMs of [0,-1,Infinity,60001,1.5])assert.throws(()=>createClient({inspectTimeoutMs}),/超时/);
});
