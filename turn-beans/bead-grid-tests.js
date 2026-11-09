'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const grid=require('./bead-grid.js'),image=require('./image-processing.js'),generator=require('./level-generator.js');
const schema=require('./level-document.js'),{TurnBeansEngine,countColors}=require('./engine.js'),color=require('./color-processing.js');
const {COLORS,scene}=require('./bead-grid-fixtures.js');
const reference=scene({holes:[[3,3],[3,4],[4,3],[4,4]]});
test('regular bead lattice detects the true pitch, columns and rows without half/double-pitch aliases',()=>{
  const detected=grid.detect(reference.source);
  assert.equal(detected.reliable,true,detected.reason);
  assert.ok(Math.abs(detected.px-18)<.2&&Math.abs(detected.py-18)<.2);
  const target=grid.restore(reference.source,{detection:detected});
  assert.equal(target.beadGrid.columns,8);assert.equal(target.beadGrid.rows,8);
  assert.equal(target.width,8);assert.equal(target.height,8);
  assert.equal(target.subject.outputActiveCells,60);
  console.log('GRID-MEASURE',JSON.stringify({columns:target.beadGrid.columns,rows:target.beadGrid.rows,pitchX:detected.px,pitchY:detected.py,
    confidence:detected.confidence,expected:60,active:target.subject.outputActiveCells}));
});
test('center sampling rejects highlights, dark rims, and a tiny plastic center hole',()=>{
  const bead=reference.expected[0],sample=grid.centerSample(reference.source,bead.x,bead.y,18,18);
  assert.deepEqual(sample.rgb,bead.rgb);assert.ok(sample.spread<1);
  const target=grid.restore(reference.source);
  assert.deepEqual(new Set(target.palette),new Set(COLORS.map(color.hex)));
  assert.ok(!target.palette.includes('#FFFFFF')&&!target.palette.includes('#372D32')&&!target.palette.includes('#141414'));
});
test('grid mask excludes background and decorations, fills inter-bead gaps logically and preserves real holes',()=>{
  const target=grid.restore(reference.source),expected=new Set(reference.expected.map(item=>item.r+','+item.c));
  target.targetBoard.forEach((row,r)=>row.forEach((cell,c)=>{
    assert.equal(cell.active,expected.has(r+','+c));
    if(!cell.active)assert.deepEqual(cell,{active:false,baseColor:null,beanColor:null});
  }));
  assert.equal(target.targetBoard[3][3].active,false);
  assert.equal(target.targetBoard[0][0].active,true,'small center hole must not remove a real bead');
  assert.ok(!target.palette.includes('#0FE664'));
});
test('auto recognizes a bead scene; explicit lock bypasses saturation/contrast and does not mutate source',()=>{
  const before=reference.source.data.slice();
  const target=image.targetFromPixels(reference.source,{imageMode:'auto',width:32,height:32,saturationBoost:40,contrastBoost:25});
  assert.equal(target.locked,true);assert.equal(target.imageRecognition.type,'beads');
  assert.deepEqual(target.colorOptions,{colorMode:'original',saturationBoost:0,contrastBoost:0});
  assert.deepEqual(target.sourcePalette,target.palette);
  assert.ok(target.colorQuality.meanDeltaE<.01);
  assert.deepEqual(reference.source.data,before);
});
test('unreliable lattice fails explicitly in forced lock mode and ordinary mode remains available',()=>{
  const width=128,height=128,data=new Uint8ClampedArray(width*height*4);
  for(let r=0;r<height;r++)for(let c=0;c<width;c++)data.set(r<20||c<20||r>107||c>107?[255,255,255,255]:[220,80,100,255],(r*width+c)*4);
  const source={width,height,data};
  assert.equal(grid.detect(source).reliable,false);
  assert.throws(()=>image.targetFromPixels(source,{imageMode:'bead-lock'}),/拼豆识别失败/);
  const ordinary=image.targetFromPixels(source,{imageMode:'ordinary',width:32,height:32});
  assert.equal(ordinary.imageRecognition.mode,'ordinary');assert.equal(ordinary.width,32);
});
test('flat checkerboard illustration is not labeled a reliably detected plastic bead grid',()=>{
  const width=176,height=176,data=new Uint8ClampedArray(width*height*4);
  for(let r=0;r<height;r++)for(let c=0;c<width;c++)data.set(r<16||c<16||r>=160||c>=160?[253,245,249,255]:
    ((Math.floor((r-16)/18)+Math.floor((c-16)/18))%2?[225,40,70,255]:[45,155,220,255]),(r*width+c)*4);
  assert.equal(grid.detect({width,height,data}).reliable,false);
  assert.notEqual(grid.classify({width,height,data}).type,'beads');
});
test('center clustering merges near duplicates but keeps original vivid hue families separate',()=>{
  const palette=grid.cluster([...COLORS,[254,205,35],[241,65,135]],6);
  assert.equal(palette.length,4);
  assert.ok(palette.every(value=>COLORS.map(color.hex).includes(value)));
  assert.throws(()=>grid.cluster(COLORS,0),/容差/);
});
test('manual palette and individual-bead corrections are immutable and preserve the mask',()=>{
  const original=grid.restore(reference.source),before=JSON.stringify(original),old=original.palette[0];
  const cell=original.targetBoard.flatMap((row,r)=>row.map((item,c)=>({item,r,c}))).find(value=>value.item.active&&value.item.beanColor!==old);
  const edited=grid.edit(original,{paletteChanges:{[old]:'#FFC900'},cellChanges:[{row:cell.r,col:cell.c,color:'#22BBEE'}]});
  assert.equal(JSON.stringify(original),before);assert.deepEqual(edited.subjectMask,original.subjectMask);
  assert.equal(edited.targetBoard[cell.r][cell.c].baseColor,'#22BBEE');
  assert.ok(edited.palette.includes('#FFC900'));assert.equal(edited.manualCorrectionCount,2);
  assert.deepEqual(edited.sourcePalette,original.sourcePalette);
  assert.throws(()=>grid.edit(original,{cellChanges:[{row:3,col:3,color:'#FF0000'}]}),/有效豆子/);
});
test('all three variants share the exact locked target, dimensions, mask and palette and replay through the real engine',()=>{
  const target=grid.restore(reference.source),before=JSON.stringify(target),levels=generator.generateAll(target);
  const totals=countColors(target.targetBoard,[[],[],[]]);
  for(const level of levels){
    assert.equal(level.width,target.width);assert.equal(level.height,target.height);assert.ok(level.playable,level.validation.reason);
    assert.deepEqual(countColors(level.initialBoard,[[],[],[]]),totals);
    const engine=new TurnBeansEngine(level.initialBoard);
    for(const [r,c]of level.testSolution){
      assert.ok(target.targetBoard[r][c].active);assert.ok(engine.click(r,c).ok);
      for(let n=0;n<60&&!engine.isWon();){const action=engine.autoFillMatchingEmpty();if(!action)break;n+=action.count;}
    }
    assert.ok(engine.isWon());assert.deepEqual(engine.trays,[[],[],[]]);assert.deepEqual(engine.board,target.targetBoard);
  }
  assert.equal(JSON.stringify(target),before);
  const doc=schema.create(target,levels,{id:'locked-test',createdAt:'2026-11-06T00:00:00.000Z'});
  assert.deepEqual(schema.validate(JSON.parse(JSON.stringify(doc))),doc);
  assert.equal(doc.metadata.source.imageMode,'bead-lock');
  assert.equal(doc.metadata.source.saturationBoost,0);
  assert.equal(doc.target.rows[3][3],'.');
  for(const key of schema.KEYS)assert.deepEqual(schema.toGameLevel(doc,key).targetBoard,target.targetBoard);
});
test('a too-small requested canvas cannot silently merge original bead positions',()=>{
  const fixture=scene({columns:10,rows:8});
  assert.throws(()=>grid.restore(fixture.source,{width:8,height:8}),/放不下/);
});

test('fractional bead spacing remains one source bead per target cell',()=>{
  const fixture=scene({columns:10,rows:8,pitch:16.5,holes:[[2,2]]}),detected=grid.detect(fixture.source);
  assert.equal(detected.reliable,true,detected.reason);
  assert.ok(Math.abs(detected.px-16.5)<.3&&Math.abs(detected.py-16.5)<.3);
  const target=grid.restore(fixture.source,{detection:detected});
  assert.equal(target.beadGrid.columns,10);assert.equal(target.beadGrid.rows,8);
  assert.equal(target.subject.outputActiveCells,79);assert.equal(target.targetBoard[2][2].active,false);
});
test('color counts above the recommendation preserve the target and support source-family merging',()=>{
  const hue=h=>{const x=Math.round(255*(1-Math.abs(h/60%2-1)));return h<60?[255,x,0]:h<120?[x,255,0]:h<180?[0,255,x]:h<240?[0,x,255]:h<300?[x,0,255]:[255,0,x];};
  const fixture=scene({columns:24,rows:24,pitch:10,blockSize:4,palette:Array.from({length:32},(_,i)=>hue(i*360/32))}),target=grid.restore(fixture.source);
  assert.ok(target.palette.length>24);assert.equal(target.recognitionReady,true);
  assert.equal(target.paletteStatus.requiresConfirmation,true);
  const before=JSON.stringify(target),levels=generator.generateAll(target);
  assert.ok(levels.every(level=>level.playable));assert.equal(JSON.stringify(target),before);
  const merged=grid.merge(target);
  assert.equal(merged.recognitionReady,true);assert.ok(merged.palette.length<=16);
  assert.deepEqual(merged.subjectMask,target.subjectMask);assert.deepEqual(merged.sourcePalette,target.sourcePalette);
  assert.equal(merged.colorStrategy,'family-16');
  assert.ok(generator.generateAll(merged).every(level=>level.playable));
});

test('photo/illustration guesses are separate from reliable bead recognition',()=>{
  const width=96,height=96,photo=new Uint8ClampedArray(width*height*4),illustration=new Uint8ClampedArray(width*height*4);
  for(let r=0;r<height;r++)for(let c=0;c<width;c++){
    photo.set([r*2,c*2,(r*7+c*13)%256,255],(r*width+c)*4);
    illustration.set(r>20&&r<75&&c>20&&c<75?[220,80,110,255]:[255,255,255,255],(r*width+c)*4);
  }
  const a=grid.classify({width,height,data:photo}),b=grid.classify({width,height,data:illustration});
  assert.equal(a.type,'photo');assert.equal(b.type,'illustration');assert.equal(a.grid,null);assert.equal(b.grid,null);
  assert.ok(a.confidence<.8&&b.confidence<.8);
});
