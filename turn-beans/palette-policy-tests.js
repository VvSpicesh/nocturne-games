/* Pure local modules and production-engine replay; no browser/network. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const color=require('./color-processing.js'),grid=require('./bead-grid.js'),image=require('./image-processing.js');
const generator=require('./level-generator.js'),schema=require('./level-document.js');
const {scene}=require('./bead-grid-fixtures.js'),{TurnBeansEngine,countColors}=require('./engine.js');
function hue(h){
  const x=Math.round(255*(1-Math.abs(h/60%2-1)));
  return h<60?[255,x,0]:h<120?[x,255,0]:h<180?[0,255,x]:h<240?[0,x,255]:h<300?[x,0,255]:[255,0,x];
}
function target(colors=19){
  return grid.restore(scene({columns:24,rows:24,pitch:10,blockSize:4,palette:Array.from({length:colors},(_,i)=>hue(i*360/colors)),holes:[[3,3],[3,4]]}).source,{centerTolerance:1});
}
function assertReplay(shared,level){
  const engine=new TurnBeansEngine(level.initialBoard);
  assert.deepEqual(countColors(level.initialBoard,[[],[],[]]),countColors(shared.targetBoard,[[],[],[]]));
  for(const [r,c]of level.testSolution){
    assert.ok(shared.targetBoard[r][c].active);assert.ok(engine.click(r,c).ok);
    for(let n=0;n<60&&!engine.isWon();){const action=engine.autoFillMatchingEmpty();if(!action)break;n+=action.count;}
  }
  assert.ok(engine.isWon());assert.deepEqual(engine.trays,[[],[],[]]);assert.deepEqual(engine.board,shared.targetBoard);
  assert.ok(level.validation.maxTransfer<=10);assert.ok(level.validation.peakPerTray.every(n=>n<=20));
}
test('16 is recommended, 17–24 auto continue, and higher counts require an explicit UI choice',()=>{
  for(const n of [1,4,16])assert.equal(color.paletteStatus(n).overRecommended,false);
  for(const n of [17,19,24]){
    const policy=color.paletteStatus(n);assert.equal(policy.overRecommended,true);assert.equal(policy.canGenerate,true);assert.equal(policy.requiresConfirmation,false);
  }
  for(const n of [25,31,63]){
    assert.equal(color.paletteStatus(n).requiresConfirmation,true);
    assert.equal(color.paletteStatus(n,{confirmed:true}).canGenerate,true);
  }
  for(const n of [0,64,65,NaN,19.5])assert.throws(()=>color.paletteStatus(n));
});
test('subject selection precedes palette statistics and ignores off-subject decorations and real holes',()=>{
  const fixture=scene({columns:24,rows:24,pitch:10,blockSize:4,palette:Array.from({length:19},(_,i)=>hue(i*360/19)),holes:[[3,3],[3,4]],noise:true});
  const result=grid.restore(fixture.source,{centerTolerance:1});
  assert.equal(result.palette.length,19);assert.equal(result.subject.outputActiveCells,574);
  assert.equal(result.beadSourceColors.length,574);assert.equal(result.subjectMask.reduce((s,n)=>s+n,0),574);
  assert.equal(result.targetBoard[3][3].active,false);assert.equal(result.targetBoard[3][4].active,false);
  assert.ok(!result.palette.includes('#0FE664'),'isolated green confetti must not enter the palette');
  assert.equal(result.sourcePalette.length,19);
});
test('17, 19 and 24 source colors all generate playable tiers sharing an unchanged target',()=>{
  for(const n of [17,19,24]){
    const shared=target(n),before=JSON.stringify(shared),levels=generator.generateAll(shared);
    assert.equal(shared.palette.length,n);
    for(const level of levels){assert.ok(level.playable,level.validation.reason);assertReplay(shared,level);assert.equal(level.metrics.activeBeans,574);}
    assert.equal(JSON.stringify(shared),before);
    assert.equal(new Set(levels.map(level=>JSON.stringify(level.initialBoard))).size,3);
  }
});
test('family merging preserves hue anchors and selects source colors instead of inventing gray averages',()=>{
  const palette=[
    '#111111','#363636','#535353','#999999','#DDDDDD','#FFFFFF',
    '#FF278C','#EC5699','#D47A9D','#AA3377','#FC8DB8',
    '#FFD530','#EEC530','#E3BE59','#FFAC18','#FF831A','#C75B20',
    '#9851DE','#A277D0','#7733B5','#2774E8','#5A96EB','#15479C',
    '#22CEE5','#7ADBE5','#1797AA','#35BA68','#70C78F','#218B48',
    '#EE3344','#CF5260','#A92233'
  ],counts=Object.fromEntries(palette.map(value=>[value,10]));
  const merged=color.mergeFamilies(palette,counts);
  assert.equal(merged.palette.length,16);assert.equal(merged.fromColors,palette.length);
  assert.ok(merged.palette.every(value=>palette.includes(value)));
  assert.equal(merged.mapping['#111111'],'#111111');
  const bucket=value=>['black','dark-gray'].includes(color.family(color.rgb(value)))?'dark':
    ['white','light-gray'].includes(color.family(color.rgb(value)))?'light':color.family(color.rgb(value));
  for(const original of palette)assert.equal(bucket(original),bucket(merged.mapping[original]));
  for(const original of ['#FF278C','#9851DE','#FFD530','#FF831A','#2774E8','#22CEE5']){
    const replacement=color.rgb(merged.mapping[original]);
    assert.equal(color.family(replacement),color.family(color.rgb(original)));assert.ok(color.hsl(replacement).s>.4);
  }
  assert.throws(()=>color.mergeFamilies(palette,{'#111111':-1}));
});
test('merge once before difficulty generation; mask, original palette and enhancement settings remain intact',()=>{
  const original=target(24),before=JSON.stringify(original),merged=grid.merge(original);
  assert.equal(merged.palette.length,16);assert.equal(merged.colorStrategy,'family-16');
  assert.deepEqual(merged.subjectMask,original.subjectMask);assert.deepEqual(merged.sourcePalette,original.sourcePalette);
  assert.deepEqual(merged.colorOptions,{colorMode:'original',saturationBoost:0,contrastBoost:0});
  assert.equal(JSON.stringify(original),before);
  for(const level of generator.generateAll(merged))assertReplay(merged,level);
});
test('19-color JSON exports and roundtrips with one target and real replay verification',()=>{
  const shared=target(),levels=generator.generateAll(shared),before=JSON.stringify(shared);
  const doc=schema.create(shared,levels,{id:'nineteen-color-test',createdAt:'2026-11-09T00:00:00.000Z'});
  assert.equal(Object.keys(doc.palette).length,19);assert.equal(doc.metadata.source.colorStrategy,'preserve');
  assert.equal(doc.target.rows[3][3],'.');assert.ok(doc.target.rows.join('').includes('Q'));
  const parsed=JSON.parse(JSON.stringify(doc));assert.deepEqual(schema.validate(parsed),doc);
  for(const key of schema.KEYS){
    assert.equal(doc.variants[key].verified,true);assert.ok(!Object.hasOwn(doc.variants[key],'target'));
    assert.deepEqual(schema.toGameLevel(doc,key).targetBoard,shared.targetBoard);
  }
  const unverified=structuredClone(doc);unverified.variants.hard.verified=false;
  assert.throws(()=>schema.validate(unverified),/未验证/);
  const badSymbol=structuredClone(doc);badSymbol.target.rows[0]='!'+badSymbol.target.rows[0].slice(1);
  assert.throws(()=>schema.validate(badSymbol),/颜色符号/);
  const shortRow=structuredClone(doc);shortRow.target.rows[0]=shortRow.target.rows[0].slice(1);
  assert.throws(()=>schema.validate(shortRow),/行长/);
  assert.equal(JSON.stringify(shared),before);
});
test('explicit high-color preserve also replays and exports without relying on the verified flag',()=>{
  const shared=target(32),levels=generator.generateAll(shared);
  assert.ok(shared.palette.length>24);for(const level of levels)assertReplay(shared,level);
  const doc=schema.create(shared,levels,{id:'high-color-test',createdAt:'2026-11-09T00:00:00.000Z'});
  assert.equal(Object.keys(doc.palette).length,shared.palette.length);
  assert.deepEqual(schema.validate(JSON.parse(JSON.stringify(doc))),doc);
});
test('expanded row symbols preserve ASCII widths, the original A–P mapping, and dot-only inactive cells',()=>{
  const palette=Array.from({length:63},(_,i)=>'#'+(i*195071).toString(16).padStart(6,'0').toUpperCase());
  const board=Array.from({length:8},(_,r)=>Array.from({length:8},(_,c)=>r*8+c<63?{active:true,baseColor:palette[r*8+c],beanColor:palette[r*8+c]}:{active:false,baseColor:null,beanColor:null}));
  const encoded=image.rowsForBoard(board,palette);
  assert.equal(image.COLOR_SYMBOLS.slice(0,16),'ABCDEFGHIJKLMNOP');assert.equal(new Set(image.COLOR_SYMBOLS).size,63);
  assert.equal(Object.keys(encoded.symbolPalette).length,63);assert.ok(encoded.rows.every(row=>row.length===8));
  assert.equal(encoded.rows.join(''),image.COLOR_SYMBOLS+'.');assert.ok(!image.COLOR_SYMBOLS.includes('.'));
  const shared={width:8,height:8,palette,targetBoard:board};
  assert.equal(generator.validateTarget(shared),63);
});
test('manual subject rectangles constrain crop coordinates before any image processing',()=>{
  const selection={x:.1,y:.25,width:.8,height:.5};
  const crop=image.cropRect(1000,2000,800,1000,{subjectRect:selection});
  assert.deepEqual(crop,{x:100,y:500,width:800,height:1000});
  const zoomed=image.cropRect(1000,2000,32,32,{subjectRect:selection,zoom:2,x:1,y:-1});
  assert.ok(zoomed.x>=100&&zoomed.y>=500&&zoomed.x+zoomed.width<=900&&zoomed.y+zoomed.height<=1500);
  for(const bad of [{x:-.1,y:0,width:1,height:1},{x:0,y:0,width:0,height:1},{x:.9,y:0,width:.2,height:1}])
    assert.throws(()=>image.cropRect(1000,2000,32,32,{subjectRect:bad}),/框选范围/);
});

test('the technical color ceiling remains compatible with existing game save snapshots',()=>{
  const codec=require('./save-codec.js'),palette=Array.from({length:63},(_,i)=>'#'+(i*195071).toString(16).padStart(6,'0').toUpperCase());
  const initialBoard=Array.from({length:8},(_,r)=>Array.from({length:8},(_,c)=>r*8+c<63?
    {active:true,baseColor:palette[r*8+c],beanColor:palette[r*8+c]}:{active:false,baseColor:null,beanColor:null}));
  const snapshot={board:initialBoard,trays:[[],[],[]],steps:0};
  const save={version:1,initialBoard,current:snapshot,history:[]};
  assert.deepEqual(codec.decodeSave(codec.encodeSave(save),initialBoard),save);
  assert.equal(image.MAX_COLORS,63);
});
