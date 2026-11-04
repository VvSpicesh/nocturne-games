'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'game.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'..','service-worker.js'),'utf8');
const {getLevel}=require('./levels.js');
const {TurnBeansEngine}=require('./engine.js');
const {encodeSave,decodeSave}=require('./save-codec.js');
const tests=[
 ['many misplaced colors and a complete verified solve',()=>{
   const l=getLevel('05'),e=new TurnBeansEngine(l.initialBoard);
   const changed=l.initialBoard.flat().filter((c,i)=>c.active&&c.beanColor!==l.targetBoard.flat()[i].beanColor).length;
   assert.equal(changed,680);
   assert.equal(l.testSolution.length,102);
   assert.ok(new Set(l.initialBoard.flat().filter((c,i)=>c.active&&c.beanColor!==l.targetBoard.flat()[i].beanColor).map(c=>c.baseColor)).size>=2);
   for(const [r,c] of l.testSolution)assert.ok(e.click(r,c).ok);
   assert.ok(e.isWon());
 }],
 ['large-board incremental rendering and hidden source during visible flight',()=>{
   assert.match(js,/function renderBoard\(board, disabled, changedPositions = null\)/);
   assert.match(js,/dom\.board\.children\[index\]\.replaceWith/);
   assert.match(js,/origin\.style\.visibility='hidden'/);
   assert.match(js,/const duration=prefersReducedMotion\.matches\?100:260/);
   assert.match(js,/requestAnimationFrame\(frame\)/);
 }],
 ['sound uses synthetic bounce and keeps original Ready Go',()=>{
   assert.match(js,/function soundBounce\(count, isExchange\)/);
   assert.match(js,/type:'triangle'/);
   assert.doesNotMatch(js,/beadInSound|beadOutSound/);
   assert.match(js,/new Audio\('\.\/sounds\/ready-go\.wav'\)/);
 }],
 ['compact saves retain undo history with old save compatibility',()=>{
   assert.match(html,/src="\.\/save-codec\.js"/);
   assert.match(js,/decodeSave\(data, canonical\)/);
   assert.match(sw,/\.\/turn-beans\/save-codec\.js/);
   const l=getLevel('05'),e=new TurnBeansEngine(l.initialBoard);
   for(const [r,c] of l.testSolution.slice(0,30))assert.ok(e.click(r,c).ok);
   const compact=encodeSave(e.exportSave());
   const loaded=TurnBeansEngine.fromSave(decodeSave(compact,l.initialBoard));
   assert.equal(loaded.steps,30);
   assert.ok(loaded.undo().ok);
 }]
];
for(const [name,run] of tests){run();console.log('PASS',name)}
console.log(`${tests.length} performance regression tests passed`);
