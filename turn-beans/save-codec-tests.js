'use strict';
const assert=require('node:assert/strict');
const {TurnBeansEngine}=require('./engine.js');
const {getLevel}=require('./levels.js');
const {encodeSave,decodeSave}=require('./save-codec.js');
let count=0;
function test(name,fn){fn();console.log('PASS',name);count++;}
test('compact saves preserve all FIFO history on the 56x40 cat',()=>{
 const level=getLevel('05'),e=new TurnBeansEngine(level.initialBoard);
 for(const [r,c] of level.testSolution) assert.ok(e.click(r,c).ok);
 const save=e.exportSave(),compact=encodeSave(save);
 assert.ok(JSON.stringify(compact).length<JSON.stringify(save).length*.1);
 const decoded=decodeSave(compact,level.initialBoard);
 const restored=TurnBeansEngine.fromSave(decoded);
 assert.equal(restored.isWon(),true);
 for(let i=0;i<level.testSolution.length;i++) assert.ok(restored.undo().ok);
 assert.deepEqual(restored.board,new TurnBeansEngine(level.initialBoard).board);
});
test('compact round-trip handles empty and partially moved trays',()=>{
 const l=getLevel('01'),e=new TurnBeansEngine(l.initialBoard);
 assert.ok(e.click(...l.testSolution[0]).ok);
 const restored=TurnBeansEngine.fromSave(decodeSave(encodeSave(e.exportSave()),l.initialBoard));
 assert.deepEqual(restored.getState(),e.getState());
});
test('compact save validation rejects malformed colors and board length',()=>{
 const l=getLevel('01'),c=encodeSave(new TurnBeansEngine(l.initialBoard).exportSave());
 assert.throws(()=>decodeSave({...c,current:{...c.current,beans:'!'+c.current.beans.slice(1)}},l.initialBoard));
 assert.throws(()=>decodeSave({...c,current:{...c.current,beans:'0'}},l.initialBoard));
});
console.log(`${count} compact save tests passed`);
