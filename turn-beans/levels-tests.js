'use strict';
const assert = require('node:assert/strict');
const { TurnBeansEngine, countColors } = require('./engine.js');
const { getLevel, listLevels } = require('./levels.js');
let passed=0;
function test(name, run){ run(); passed++; console.log('PASS',name); }

test('six named demo levels load with correct sizes, colors, and initial empty trays',()=>{
  const levels=listLevels();
  assert.equal(levels.length,6);
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


test('yellow cat level is larger and preserves complex art while remaining solvable',()=>{
 const data=getLevel('05');
 assert.equal(data.width,56);
 assert.equal(data.height,40);
 assert.equal(data.targetBoard[28][4].active,true);
 assert.equal(data.targetBoard[0][0].active,false);
 assert.notDeepEqual(data.initialBoard,data.targetBoard);
 assert.equal(data.testSolution.length,102,'grouped color swaps must have a verified solution');
 const misplaced=data.targetBoard.flat().filter((target,i)=>target.active && target.beanColor !== data.initialBoard.flat()[i].beanColor).length;
 assert.equal(misplaced,680, 'most selected regions should be scrambled in uniform color groups');
 assert.ok(new Set(data.testSolution.map(([r,c]) => data.targetBoard[r][c].baseColor)).size >= 2,'multiple target colors are involved');
 assert.ok(misplaced > 500 && misplaced < 1000, 'a moderately difficult rather than all-wrong puzzle');
 assert.ok(new Set(data.targetBoard.flat().filter(c => c.active).map(c => c.baseColor)).size >= 8);
});


test('black cat level is medium-sized and preserves the screenshot silhouette while remaining solvable',()=>{
 const data=getLevel('06');
 assert.equal(data.width,33);
 assert.equal(data.height,40);
 assert.equal(data.targetBoard[0][0].active,false);
 assert.equal(data.targetBoard[24][3].active,true);
 assert.notDeepEqual(data.initialBoard,data.targetBoard);
 assert.equal(data.testSolution.length,24);
 const misplaced=data.targetBoard.flat().filter((target,i)=>target.active && target.beanColor !== data.initialBoard.flat()[i].beanColor).length;
 assert.equal(misplaced,160);
 assert.ok(new Set(data.targetBoard.flat().filter(c => c.active).map(c => c.baseColor)).size >= 8);
});
