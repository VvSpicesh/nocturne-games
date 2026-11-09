'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const schema=require('./level-document.js'),sample=JSON.parse(fs.readFileSync(path.join(__dirname,'level-library/levels/subject-demo.json'),'utf8'));
const commit='b'.repeat(40),sha256='f'.repeat(64);
function screen({authorized=false,configured=false,fail=false,matched=false,ready=true,inspect:inspectHook,createError}={}){
  const nodes=new Map(),state={ready,matched,publishes:0,inspections:0},get=id=>{
    if(!nodes.has(id))nodes.set(id,{disabled:['publish','checkOnline'].includes(id),hidden:id==='publisherLogin',textContent:'',checked:false,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});
    return nodes.get(id);
  };
  const client={inspect:async()=>{state.inspections++;return inspectHook?inspectHook(state.inspections):{configured,authorized,reason:authorized?'':'尚未配置授权'};},loginURL:'https://publisher.test/auth/login',
    publish:async()=>{state.publishes++;if(fail)throw new Error('offline');return {id:sample.id,version:sample.version,sha256,upload:{commit}};}};
  const context={document:{getElementById:get},URL,location:{href:'https://site.test/turn-beans/generator.html'},
    TurnBeansPublisher:{createClient:()=>{if(createError)throw createError;return client;}},TurnBeansPublishConfig:{},
    TurnBeansLibrary:{createReader:()=>({refresh:async()=>({catalog:{levels:state.matched?[{id:sample.id,version:1,sha256}]:[]}}),
      load:async()=>schema.validate(sample)})}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'publisher-ui.js'),'utf8'),context);
  const control=context.TurnBeansPublisherUI.mount({getDocument:()=>sample,isReady:()=>state.ready});
  return {get,state,control};
}
test('publish button remains disabled when backend is missing even if all levels are ready',async()=>{
  const ui=screen();await new Promise(setImmediate);
  assert.equal(ui.get('publish').disabled,true);assert.equal(ui.get('publisherLogin').hidden,true);
  await ui.get('publish').listeners.click();assert.equal(ui.state.publishes,0);
});
test('configured unauthenticated users see GitHub login but cannot publish',async()=>{
  const ui=screen({configured:true});await new Promise(setImmediate);
  assert.equal(ui.get('publish').disabled,true);assert.equal(ui.get('publisherLogin').hidden,false);
  assert.equal(ui.get('publisherLogin').href,'https://publisher.test/auth/login');
});
test('administrator privilege alone cannot publish unverified or invalidated generation results',async()=>{
  const ui=screen({configured:true,authorized:true,ready:false});await new Promise(setImmediate);
  assert.equal(ui.get('publish').disabled,true);ui.state.ready=true;ui.control.refreshReady();assert.equal(ui.get('publish').disabled,false);
  ui.state.ready=false;ui.control.refreshReady();await ui.get('publish').listeners.click();assert.equal(ui.state.publishes,0);
});
test('upload failure never claims deployment or online success',async()=>{
  const ui=screen({configured:true,authorized:true,fail:true});await new Promise(setImmediate);await ui.get('publish').listeners.click();
  assert.match(ui.get('publishUpload').textContent,/未确认成功/);assert.equal(ui.get('checkOnline').disabled,true);
  assert.equal(ui.get('publishDeploy').textContent,'部署：未确认');assert.equal(ui.get('publishOnline').textContent,'上线：未确认');
});
test('Git commit, deployment and public availability remain distinct until exact public content verifies',async()=>{
  const ui=screen({configured:true,authorized:true});await new Promise(setImmediate);await ui.get('publish').listeners.click();
  assert.match(ui.get('publishUpload').textContent,/已提交 GitHub/);assert.match(ui.get('publishDeploy').textContent,/待/);assert.match(ui.get('publishOnline').textContent,/待/);
  await ui.get('checkOnline').listeners.click();assert.match(ui.get('publishOnline').textContent,/尚未/);
  ui.state.matched=true;await ui.get('checkOnline').listeners.click();
  assert.match(ui.get('publishOnline').textContent,/读取验证通过/);assert.match(ui.get('publishDeploy').textContent,/未查询构建任务/);
});
test('clicking authorization check without a backend visibly records completion and each new check',async()=>{
  const ui=screen();await new Promise(setImmediate);
  const before=ui.get('publishReason').textContent;
  assert.match(before,/第 1 次检查完成.*尚未配置 GitHub/);
  await ui.get('refreshPublish').listeners.click();
  assert.notEqual(ui.get('publishReason').textContent,before);assert.match(ui.get('publishReason').textContent,/第 2 次检查完成.*可导出 JSON/);
  assert.equal(ui.state.inspections,2);assert.equal(ui.get('refreshPublish').disabled,false);
  assert.equal(ui.get('refreshPublish').textContent,'检查授权');assert.equal(ui.get('publish').disabled,true);
  assert.equal(ui.get('publisherLogin').hidden,true);
});
test('pending inspections show progress, disable publishing and share one pending request',async()=>{
  let finish;const ui=screen({configured:true,authorized:true,inspect:()=>new Promise(resolve=>{finish=resolve;})});
  await new Promise(setImmediate);
  assert.equal(ui.get('refreshPublish').disabled,true);assert.equal(ui.get('refreshPublish').textContent,'正在检查…');
  assert.match(ui.get('publishReason').textContent,/正在检查仓库管理员权限/);assert.equal(ui.get('publish').disabled,true);
  const duplicate=ui.get('refreshPublish').listeners.click();assert.equal(ui.state.inspections,1);
  finish({configured:true,authorized:true});await duplicate;
  assert.equal(ui.get('refreshPublish').disabled,false);assert.equal(ui.get('publish').disabled,false);
  assert.match(ui.get('publishReason').textContent,/第 1 次检查完成.*授权有效/);
});
test('inspection rejection clears previous authorization, shows failure and permits retry',async()=>{
  const ui=screen({inspect:async count=>{if(count===2)throw new Error('检查中断');return {configured:true,authorized:true};}});
  await new Promise(setImmediate);assert.equal(ui.get('publish').disabled,false);
  const failed=ui.get('refreshPublish').listeners.click();
  assert.equal(ui.get('publish').disabled,true);await failed;
  assert.match(ui.get('publishReason').textContent,/第 2 次授权检查失败.*检查中断/);
  assert.equal(ui.get('refreshPublish').disabled,false);assert.equal(ui.get('publish').disabled,true);
  assert.equal(ui.get('publisherLogin').hidden,true);
  await ui.get('refreshPublish').listeners.click();
  assert.match(ui.get('publishReason').textContent,/第 3 次检查完成/);assert.equal(ui.get('publish').disabled,false);
});
test('invalid endpoint setup still binds the check button and reports the configuration error',async()=>{
  const ui=screen({createError:new Error('发布接口必须使用 HTTPS')});await new Promise(setImmediate);
  assert.match(ui.get('publishReason').textContent,/发布服务配置无效.*HTTPS/);
  assert.equal(ui.get('publish').disabled,true);assert.equal(ui.get('publisherLogin').hidden,true);
  const before=ui.get('publishReason').textContent;
  await ui.get('refreshPublish').listeners.click();
  assert.notEqual(ui.get('publishReason').textContent,before);assert.equal(ui.get('refreshPublish').disabled,false);
});
