'use strict';
const assert=require('node:assert/strict');
const {TurnBeansEngine}=require('./engine.js');
const {getLevel}=require('./levels.js');
function cell(base,bean){return {active:true,baseColor:base,beanColor:bean};}
{
  const e=new TurnBeansEngine([[cell('red','blue'),cell('blue','red')]]);
  assert.equal(e.autoFillMatchingEmpty(),null);
  assert.equal(e.click(0,0).type,'take');
  assert.equal(e.autoFillMatchingEmpty(),null,'no matching color for the empty red hole');
  assert.equal(e.take(0,1).type,'take');
  let move=e.autoFillMatchingEmpty();
  assert.equal(move.automatic,true);
  assert.equal(move.count,1);
  assert.equal(move.displaced.length,0,'empty slot must not displace a bean');
  assert.equal(move.before.board[0][0].beanColor,null);
  move=e.autoFillMatchingEmpty();
  assert.equal(move.automatic,true);
  assert.equal(e.autoFillMatchingEmpty(),null);
  assert.equal(e.isWon(),true);
  assert.equal(e.steps,2,'automatic placements must not count as user clicks');
  assert.equal(e.history.length,2);
  assert.equal(e.undo().ok,true);
  assert.equal(e.board[0][0].beanColor,null);
  assert.equal(e.board[0][1].beanColor,'red');
  e.checkInvariants();
  assert.equal(TurnBeansEngine.fromSave(JSON.parse(JSON.stringify(e.exportSave()))).steps,1);
}
{
  const e=new TurnBeansEngine([[cell('red','blue'),cell('blue','red'),cell('red','blue')]]);
  const r=e.click(0,0);
  assert.equal(r.ok,true);
  assert.equal(e.autoFillMatchingEmpty(),null,'do not swap an occupied wrong-color slot');
}
{
  const level=getLevel('06'),e=new TurnBeansEngine(level.initialBoard);
  assert.equal(level.width,33);
  for(let i=0;i<1;i++) {
    const [r,c]=level.testSolution[i];
    assert.equal(e.click(r,c).ok,true);
    for(let n=0;n<60;n++) if(!e.autoFillMatchingEmpty())break;
    e.checkInvariants();
    assert.equal(e.history.length,e.steps);
  }
  const s=e.exportSave();
  const restored=TurnBeansEngine.fromSave(s);
  assert.deepEqual(restored.board,e.board);
  assert.deepEqual(restored.trays,e.trays);
}
console.log('PASS auto fill: only matching empty holes, no wrong-color occupied swap, undo/save invariant');
