'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const schema=require('./level-document.js'),{createReader}=require('./level-library.js'),{listLevels,getLevel}=require('./levels.js'),{TurnBeansEngine}=require('./engine.js');
const sample=JSON.parse(fs.readFileSync(path.join(__dirname,'level-library/levels/subject-demo.json'),'utf8'));
const diskIndex=JSON.parse(fs.readFileSync(path.join(__dirname,'level-library/index.json'),'utf8'));
const copy=value=>structuredClone(value),json=value=>new Response(typeof value==='string'?value:JSON.stringify(value));
async function indexed(doc=sample){
  const text=JSON.stringify(doc),entry={id:doc.id,name:doc.name,width:doc.width,height:doc.height,version:doc.version,path:'levels/'+doc.id+'.json',sha256:await schema.digest(text)};
  return {doc,text,index:{schemaVersion:1,revision:doc.version,updatedAt:doc.metadata.updatedAt,levels:[entry]}};
}
function transport(state,requests=[]){
  return async(url,options)=>{requests.push({url,options});return json(new URL(url).pathname.endsWith('/index.json')?state.index:state.text);};
}
test('canonical document shares one target, roundtrips exactly and every difficulty solves with the original engine',()=>{
  schema.validate(sample);const before=JSON.stringify(sample);
  for(const key of schema.KEYS){
    const level=schema.toGameLevel(sample,key),engine=new TurnBeansEngine(level.initialBoard);
    for(const [r,c]of level.testSolution){assert.ok(level.targetBoard[r][c].active);assert.ok(engine.click(r,c).ok);
      for(let n=0;n<60&&!engine.isWon();){const action=engine.autoFillMatchingEmpty();if(!action)break;n+=action.count;}}
    assert.ok(engine.isWon());assert.deepEqual(engine.trays,[[],[],[]]);assert.deepEqual(engine.board,level.targetBoard);
    assert.equal(sample.variants[key].statistics.activeBeans,636);
  }
  assert.equal(JSON.stringify(schema.validate(JSON.parse(before))),before);
});
test('strict schema rejects wrong rows, masks, palette, variant names and forged verified claims',()=>{
  const corruptions=[
    d=>d.target.rows.pop(),d=>{d.target.rows[0]=d.target.rows[0].slice(1);},
    d=>{d.target.rows[0]='Z'+d.target.rows[0].slice(1);},
    d=>{d.variants.easy.initialRows[0]='A'+d.variants.easy.initialRows[0].slice(1);},
    d=>{d.variants.medium.solution.pop();},d=>{d.variants.easy.verified=false;},
    d=>{d.variants.hard.statistics.recolorRate=.5;},d=>{d.variants.normal=d.variants.medium;},
    d=>{d.id='../hall';},d=>{d.id=123;},d=>{d.width='32';},d=>{d.version=0;},
    d=>{d.palette.B=d.palette.A;},d=>{d.palette.A=d.palette.A.toLowerCase();},d=>{d.metadata.source.token='forbidden';},
    d=>{d.schemaVersion=2;},d=>{d.variants.hard.target={rows:d.target.rows};}
  ];
  for(const corrupt of corruptions){const doc=copy(sample);corrupt(doc);assert.throws(()=>schema.validate(doc));}
});
test('actual checked-in catalog hash and dimensions match the verified local sample',async()=>{
  schema.validateIndex(diskIndex);
  const text=fs.readFileSync(path.join(__dirname,'level-library/levels/subject-demo.json'),'utf8');
  assert.equal(await schema.digest(text),diskIndex.levels[0].sha256);
});
test('catalog validator rejects duplicate IDs, traversal, unsupported dimensions and missing revision',()=>{
  for(const mutate of [i=>i.levels.push(i.levels[0]),i=>{i.levels[0].path='../index.html';},i=>{i.levels[0].width=9000;},
    i=>{delete i.revision;},i=>{i.levels[0].sha256='fake';}]){
    const index=copy(diskIndex);mutate(index);assert.throws(()=>schema.validateIndex(index));
  }
});
test('anonymous catalog read is lazy, omits credentials and shares identical published data across readers',async()=>{
  const state=await indexed(),requests=[];
  const a=createReader({baseURL:'https://site.test/turn-beans/level-library/',fetch:transport(state,requests)});
  const b=createReader({baseURL:'https://site.test/turn-beans/level-library/',fetch:transport(state)});
  assert.equal((await a.refresh()).status,'ready');assert.equal(requests.length,1);
  await b.refresh();assert.deepEqual(await a.load(sample.id),await b.load(sample.id));assert.equal(requests.length,2);
  assert.ok(requests.every(r=>r.options.credentials==='omit'&&r.options.cache==='no-store'));
  assert.ok(requests[1].url.includes('v=1')&&requests[1].url.includes('sha='));
  const detached=await a.load(sample.id);detached.name='edited';assert.equal((await a.load(sample.id)).name,sample.name);
  assert.equal(requests.length,2);
});
test('network failure, HTTP error, invalid JSON and a genuine empty directory stay distinct',async()=>{
  const empty={schemaVersion:1,revision:0,updatedAt:sample.metadata.createdAt,levels:[]};
  assert.equal((await createReader({fetch:async()=>json(empty)}).refresh()).status,'empty');
  for(const [fetch,code]of [[async()=>{throw new Error('offline');},'network'],[async()=>new Response('',{status:404}),'http'],
    [async()=>json('invalid JSON'),'invalid']]){
    await assert.rejects(createReader({fetch}).refresh(),e=>e.code===code);
  }
});
test('version/digest update invalidates cached levels and gives independent saved-game IDs',async()=>{
  const state=await indexed(),requests=[],reader=createReader({fetch:transport(state,requests)});
  await reader.refresh();const old=await reader.load(sample.id);
  const next=copy(sample);next.version=2;next.name='更新示例';Object.assign(state,await indexed(next));
  await reader.refresh();const current=await reader.load(sample.id);
  assert.equal(current.version,2);assert.equal(requests.length,4);
  assert.notEqual(schema.toGameLevel(old,'easy').id,schema.toGameLevel(current,'easy').id);
});
test('failed refresh cannot silently serve stale catalog or previously cached levels',async()=>{
  const state=await indexed();let offline=false;
  const reader=createReader({fetch:async(...args)=>{if(offline)throw new Error('offline');return transport(state)(...args);}});
  await reader.refresh();await reader.load(sample.id);offline=true;
  await assert.rejects(reader.refresh(),e=>e.code==='network');await assert.rejects(reader.load(sample.id),e=>e.code==='catalog');
});
test('content digest mismatch and invalid level documents never become playable cache entries',async()=>{
  const state=await indexed(),reader=createReader({fetch:transport(state)});
  await reader.refresh();state.text=state.text+' ';await assert.rejects(reader.load(sample.id),e=>e.code==='invalid');
  const bad=copy(sample);bad.variants.hard.solution=[];Object.assign(state,await indexed(bad));
  await reader.refresh();await assert.rejects(reader.load(sample.id),e=>e.code==='invalid');
});
test('in-flight old level response is rejected after the catalog changes',async()=>{
  const state=await indexed();let release;
  const reader=createReader({fetch:async url=>new URL(url).pathname.endsWith('index.json')?json(state.index):new Promise(resolve=>{release=()=>resolve(json(state.text));})});
  await reader.refresh();const loading=reader.load(sample.id);
  const newDoc=copy(sample);newDoc.version=2;const next=await indexed(newDoc);
  const oldText=state.text;state.index=next.index;await reader.refresh();
  state.text=oldText;release();await assert.rejects(loading,e=>e.code==='invalid');
});
test('all original six boards, IDs and direct click solutions remain available',()=>{
  assert.equal(listLevels().length,6);
  for(const item of listLevels()){const level=getLevel(item.id),engine=new TurnBeansEngine(level.initialBoard);
    for(const pos of level.testSolution)assert.ok(engine.click(...pos).ok);assert.ok(engine.isWon());}
});
function dom(){
  class Element{
    constructor(){this.children=[];this.listeners={};this.textContent='';this.disabled=false;this.hidden=false;}
    append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
    setAttribute(){}addEventListener(name,fn){this.listeners[name]=fn;}
  }
  const home=new Element(),builtin=new Element();builtin.children=Array(6).fill('built-in');home.append(builtin);
  return {home,builtin,document:{createElement:()=>new Element(),getElementById:()=>home,addEventListener(){}}};
}
test('cloud UI appends beside built-ins, loads only on selection and opens a verified chosen tier',async()=>{
  const state=await indexed(),view=dom(),requests=[],opened=[];
  const context={...view,URL,location:{href:'https://site.test/turn-beans/',protocol:'https:'},
    TurnBeansLibrary:{createReader:options=>createReader({...options,fetch:transport(state,requests)})},TurnBeansDocument:schema};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'level-library-ui.js'),'utf8'),context);
  context.TurnBeansLibraryUI.mount({openLevel:level=>opened.push(level)});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(view.builtin.children.length,6);assert.equal(requests.length,1);
  const section=view.home.children[1],cards=section.children[3],button=cards.children[0].children[1].children[1];
  await button.listeners.click();assert.equal(opened.length,1);assert.equal(opened[0].difficulty,'普通');
  assert.equal(requests.length,2);assert.equal(view.builtin.children.length,6);
});
test('cloud UI displays network errors as errors rather than an empty catalog',async()=>{
  const view=dom(),context={...view,URL,location:{href:'https://site.test/turn-beans/',protocol:'https:'},
    TurnBeansLibrary:{createReader:()=>createReader({fetch:async()=>{throw new Error('offline');}})},TurnBeansDocument:schema};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'level-library-ui.js'),'utf8'),context);
  context.TurnBeansLibraryUI.mount({openLevel:()=>assert.fail('must not open')});
  await new Promise(resolve=>setTimeout(resolve,10));assert.match(view.home.children[1].children[2].textContent,/网络异常/);
});
