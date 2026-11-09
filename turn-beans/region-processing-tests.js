/* Region topology, conservation, quality gates and genuine engine replay. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const regions=require('./region-processing.js'),g=require('./level-generator.js'),schema=require('./level-document.js');
const {TurnBeansEngine,countColors}=require('./engine.js');
const COLORS=['#E57C92','#73A9D1','#F0CE97','#463D40'];
function board(rows,palette=COLORS){
  return rows.map(row=>[...row].map(key=>key==='.'?{active:false,baseColor:null,beanColor:null}:
    {active:true,baseColor:palette[Number(key)],beanColor:palette[Number(key)]}));
}
function reference(){
  const targetBoard=Array.from({length:32},(_,r)=>Array.from({length:32},(_,c)=>{
    const value=COLORS[(r>=16?2:0)+(c>=16?1:0)];return {active:true,baseColor:value,beanColor:value};
  }));
  return {width:32,height:32,palette:COLORS.slice(),targetBoard};
}
function connected(positions,width,height){
  const pool=new Set(positions),seen=new Set([positions[0]]),queue=[positions[0]];
  for(let head=0;head<queue.length;head++){
    const n=queue[head],r=Math.floor(n/width),c=n%width;
    for(const [dr,dc]of [[-1,0],[1,0],[0,-1],[0,1]]){
      const nr=r+dr,nc=c+dc,next=nr*width+nc;
      if(nr>=0&&nr<height&&nc>=0&&nc<width&&pool.has(next)&&!seen.has(next)){seen.add(next);queue.push(next);}
    }
  }
  return seen.size===pool.size;
}
function replay(target,level){
  const engine=new TurnBeansEngine(level.initialBoard);
  for(const point of level.testSolution){
    const action=engine.click(...point);assert.ok(action.ok&&action.count<=10);
    for(let n=0;n<60&&!engine.isWon();){const action=engine.autoFillMatchingEmpty();if(!action)break;assert.ok(action.count<=10);n+=action.count;}
    assert.ok(engine.trays.every(tray=>tray.length<=20));assert.deepEqual(countColors(engine.board,engine.trays),countColors(target.targetBoard,[[],[],[]]));
  }
  assert.ok(engine.isWon());assert.deepEqual(engine.board,target.targetBoard);assert.deepEqual(engine.trays,[[],[],[]]);
}
test('target segmentation uses four-neighbor equal-base connectivity and excludes inactive cells',()=>{
  const input=board(['0.0','.0.','110']),segmentation=regions.segment(input);
  assert.equal(segmentation.regions.length,5);
  assert.deepEqual(segmentation.regions.map(region=>region.size).sort((a,b)=>a-b),[1,1,1,1,2]);
  assert.equal(segmentation.labels[1],-1);
  for(const region of segmentation.regions)assert.ok(connected(region.positions,3,3));
});
test('a tiny region merges along its longest contact edge without repainting the target',()=>{
  const input=board(['000','020','111'],['#FF0000','#0000FF','#0000EE']),before=JSON.stringify(input);
  const segmentation=regions.segment(input),small=segmentation.regions.find(region=>region.baseColor==='#0000EE');
  const plan=regions.mergeSmall(segmentation,2),group=plan.groups.find(group=>group.members.includes(small.id));
  assert.ok(group.members.some(id=>segmentation.regions[id].baseColor==='#FF0000'));
  assert.equal(plan.mergedSmallRegions,1);assert.equal(JSON.stringify(input),before);
});
test('equal contact boundaries use perceptual color proximity as the tie breaker',()=>{
  const input=board(['001','021','011'],['#FF0000','#0000FF','#0000EE']);
  const segmentation=regions.segment(input),small=segmentation.regions.find(region=>region.baseColor==='#0000EE');
  const group=regions.mergeSmall(segmentation,2).groups.find(group=>group.members.includes(small.id));
  assert.ok(group.members.some(id=>segmentation.regions[id].baseColor==='#0000FF'));
});
test('cleanup cannot join regions across an inactive gap',()=>{
  const segmentation=regions.segment(board(['0.1']));
  const plan=regions.mergeSmall(segmentation,6);
  assert.equal(plan.groups.length,2);assert.equal(plan.mergedSmallRegions,0);
});
test('every assignment is a connected uniform region and remains independent of the ten-bead transfer cap',()=>{
  const target=reference(),before=JSON.stringify(target),source=regions.segment(target.targetBoard);
  for(const level of g.generateAll(target)){
    const used=new Set();assert.ok(level.generation.assignments.some(unit=>unit.size>10));
    for(const unit of level.generation.assignments){
      assert.ok(unit.size>=6&&connected(unit.positions,32,32));
      assert.equal(new Set(unit.positions).size,unit.positions.length);
      for(const index of unit.positions){
        assert.ok(!used.has(index));used.add(index);
        assert.ok(source.regions[unit.sourceRegion].positions.includes(index));
        const cell=level.initialBoard[Math.floor(index/32)][index%32];
        assert.equal(cell.baseColor,unit.baseColor);assert.equal(cell.beanColor,unit.beanColor);
      }
    }
    assert.equal(used.size,level.metrics.changedBeans);assert.ok(level.validation.maxTransfer<=10);replay(target,level);
  }
  assert.equal(JSON.stringify(target),before);
});
test('pair metrics split equal bean colors when the base colors differ',()=>{
  const initial=board(['000111']);initial[0].forEach(cell=>{cell.beanColor=COLORS[2];});
  const m=regions.metrics({width:6,height:1},initial);
  assert.equal(m.componentCount,2);assert.equal(m.meanComponentSize,3);assert.equal(m.largestComponent,3);
  assert.equal(m.pairComponentDistribution.length,2);assert.deepEqual(m.pairComponentDistribution.map(pair=>pair.sizes),[[3],[3]]);
});
test('singleton and doubleton percentages distinguish component-count and bean-count denominators',()=>{
  const initial=board(['001']);initial[0][0].beanColor=COLORS[1];initial[0][1].beanColor=COLORS[1];initial[0][2].beanColor=COLORS[0];
  const m=regions.metrics({width:3,height:1},initial);
  assert.equal(m.singletonComponentCount,1);assert.equal(m.doubletonComponentCount,1);
  assert.equal(m.singleDoubleBeanRatio,1);assert.equal(m.singleDoubleComponentRatio,1);
  assert.equal(m.wrongComponentSizeHistogram['1'],1);assert.equal(m.wrongComponentSizeHistogram['2'],1);
  assert.equal(regions.quality(m,g.TIERS[2]).passed,false);
});
test('fragment-only targets exhaust all retries and never become fake playable noise',()=>{
  const target=reference();
  target.palette=COLORS.slice(0,2);
  target.targetBoard.forEach((row,r)=>row.forEach((cell,c)=>{cell.baseColor=COLORS[(r+c)%2];cell.beanColor=cell.baseColor;}));
  for(const level of g.generateAll(target)){
    assert.equal(level.playable,false);assert.equal(level.quality.passed,false);
    assert.equal(level.generation.attempts,6);assert.equal(level.generation.rejectedAttempts.length,6);
    assert.equal(level.testSolution.length,0);assert.equal(level.validation.clicks,0);
  }
});
test('three playable tiers have strictly decreasing average pair blocks without singleton or doubleton noise',()=>{
  const target=reference(),levels=g.generateAll(target);
  assert.deepEqual(levels.map(level=>level.metrics.meanComponentSize),[192,64,32]);
  assert.deepEqual(levels.map(level=>level.metrics.componentCount),[4,14,32]);
  for(const level of levels){
    assert.ok(level.playable&&level.quality.passed);assert.equal(level.metrics.singleDoubleBeanRatio,0);replay(target,level);
  }
});
test('tiny source accents remain correct and target colors and mask stay unchanged',()=>{
  const target=reference();target.palette.push('#18DD99');
  target.targetBoard[3][3]={active:true,baseColor:'#18DD99',beanColor:'#18DD99'};
  const before=JSON.stringify(target);
  for(const level of g.generateAll(target)){
    assert.ok(level.playable);
    assert.deepEqual(level.initialBoard[3][3],target.targetBoard[3][3]);assert.equal(level.metrics.singleDoubleBeanRatio,0);replay(target,level);
  }
  assert.equal(JSON.stringify(target),before);
});
test('new JSON strictly checks pair distributions and histogram data while the existing library stays readable',()=>{
  const target=reference(),levels=g.generateAll(target);
  const doc=schema.create(target,levels,{id:'region-proof-test',createdAt:'2026-11-09T00:00:00.000Z'});
  assert.equal(doc.metadata.generatorVersion,'phase26.3');assert.deepEqual(schema.validate(JSON.parse(JSON.stringify(doc))),doc);
  for(const change of [
    value=>{value.variants.hard.statistics.singletonComponentCount++;},
    value=>{value.variants.hard.statistics.pairComponentDistribution[0].sizes[0]++;},
    value=>{value.variants.hard.statistics.wrongComponentSizeHistogram['1']++;}
  ]){const broken=structuredClone(doc);change(broken);assert.throws(()=>schema.validate(broken),/统计不符/);}
  const legacy=JSON.parse(fs.readFileSync(path.join(__dirname,'test-fixtures/phase26.2-level.json'),'utf8'));
  assert.equal(legacy.metadata.generatorVersion,'phase26.2');assert.doesNotThrow(()=>schema.validate(legacy));
  const noisy=structuredClone(legacy);noisy.metadata.generatorVersion='phase26.3';
  assert.throws(()=>schema.validate(noisy),/区域质量|字段缺失/);
});
test('region plans, retry outcomes and canonical JSON are deterministic and do not mutate caller data',()=>{
  const target=reference(),before=JSON.stringify(target),first=g.generateAll(target);
  assert.deepEqual(g.generateAll(target),first);assert.equal(JSON.stringify(target),before);
  const decoded=g.parseJSON(g.exportJSON(target,first));assert.deepEqual(decoded.targetBoard,target.targetBoard);
});
