'use strict';
const assert = require('node:assert/strict');
const { TurnBeansEngine, countColors } = require('./engine.js');
const { getLevel, listLevels } = require('./levels.js');
let passed=0;
function test(name, run){ run(); passed++; console.log('PASS',name); }

test('four named demo levels load with correct sizes, colors, and initial empty trays',()=>{
  const levels=listLevels();
  assert.equal(levels.length,4);
  assert.equal(getLevel('missing'),null);
  for(const level of levels){
    const data=getLevel(level.id);
    assert.equal(data.targetBoard.length,data.height);
    assert.equal(data.targetBoard[0].length,data.width);
    assert.deepEqual(countColors(data.targetBoard,[[],[],[]]),countColors(data.initialBoard,[[],[],[]]));
    assert.ok(data.targetBoard.every(row=>row.every(c=>!c.active || c.baseColor===c.beanColor)));
    assert.ok(new TurnBeansEngine(data.initialBoard).checkInvariants());
  }
});
for(const ref of listLevels()) {
  test('level '+ref.id+' has a real valid click-by-click solution',()=>{
    const level = getLevel(ref.id), e=new TurnBeansEngine(level.initialBoard);
    assert.equal(e.isWon(),false);
    for(const [r,c] of level.testSolution){
      const result=e.click(r,c);
      assert.equal(result.ok,true,JSON.stringify({level:level.id,r,c,result}));
      e.checkInvariants();
    }
    assert.equal(e.isWon(),true);
    assert.deepEqual(e.trays,[[],[],[]]);
    assert.deepEqual(e.board,level.targetBoard);
    const save=JSON.parse(JSON.stringify(e.exportSave()));
    const restored=TurnBeansEngine.fromSave(save);
    assert.equal(restored.isWon(),true);
    assert.equal(restored.undo().ok,true);
    assert.equal(restored.isWon(),false);
    restored.restart();
    assert.deepEqual(restored.board,new TurnBeansEngine(level.initialBoard).board);
  });
}
console.log(`\n${passed} levels tests passed`);

test('cat level has genuinely inactive silhouette around the face',()=>{
 const data=getLevel('04');
 assert.equal(data.width,16);
 assert.equal(data.height,16);
 assert.equal(data.targetBoard[0][0].active,false);
 assert.equal(data.targetBoard[8][8].active,true);
});
