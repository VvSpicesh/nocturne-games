'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const color=require('./color-processing.js'),image=require('./image-processing.js'),generator=require('./level-generator.js');
const schema=require('./level-document.js'),{drawBoard}=require('./preview-renderer.js');
const {TurnBeansEngine,countColors}=require('./engine.js');
const SWATCHES=['#FFD530','#FF891A','#F44A9F','#9851DE','#2774E8','#22CEE5','#111111','#494949','#AAAAAA','#F5F5F5','#E63344','#35BA68'];
function picture(){
  const width=128,height=128,data=new Uint8ClampedArray(width*height*4);
  for(let r=0;r<height;r++)for(let c=0;c<width;c++){
    let rgb=[255,255,255];
    if(r>=16&&r<112&&c>=16&&c<112){
      rgb=r===16||r===111||c===16||c===111?[17,17,17]:color.rgb(SWATCHES[Math.min(2,Math.floor((r-16)/32))*4+Math.min(3,Math.floor((c-16)/24))]);
    }
    data.set([...rgb,255],(r*width+c)*4);
  }
  return {width,height,data};
}
function target(options={}){return image.targetFromPixels(picture(),{width:32,height:32,maxColors:12,...options});}
test('color distance calculation separates equal, black and white colors correctly',()=>{
  assert.ok(Math.abs(color.lab([255,255,255])[0]-100)<.02);
  assert.ok(color.lab([0,0,0]).every(value=>Math.abs(value)<.001));
  assert.equal(color.deltaE([10,20,30],[10,20,30]),0);
  assert.ok(color.deltaE([0,0,0],[255,255,255])>99);
});
test('default original-color mode lightly enhances saturation and contrast; soft is opt-in',()=>{
  assert.deepEqual(color.settings(),{colorMode:'original',saturationBoost:8,contrastBoost:4});
  const sample=[145,87,201],original=color.hsl(color.enhance(sample)),balanced=color.hsl(color.enhance(sample,{colorMode:'balanced'})),soft=color.hsl(color.enhance(sample,{colorMode:'soft'}));
  assert.ok(original.s>=balanced.s&&balanced.s>soft.s);
  assert.ok(color.hsl(color.enhance([32,15,64])).l>=color.hsl([32,15,64]).l);
  for(const value of [0,17,73,170,245,255]){
    const enhanced=color.enhance([value,value,value]);assert.equal(enhanced[0],enhanced[1]);assert.equal(enhanced[1],enhanced[2]);
  }
});
test('palette anchors retain yellow/orange, pink/purple, blue/cyan and all four neutral bands',()=>{
  const result=target(),palette=result.palette.map(color.rgb);
  for(const source of SWATCHES.map(color.rgb)){
    const nearest=palette[color.nearest(source,palette)];
    assert.equal(color.family(nearest),color.family(source));
    assert.ok(color.deltaE(source,nearest)<10,color.hex(source)+' was not preserved');
  }
  assert.equal(new Set(result.palette).size,12);
});
test('foreground dominant-color differences and lightness are reported rather than assuming success',()=>{
  const result=target(),quality=result.colorQuality;
  assert.equal(quality.metric,'CIELAB-DeltaE76');assert.equal(quality.reference,'foreground-before-enhancement');
  assert.equal(quality.passed,true);assert.equal(quality.retainedFamilies,quality.majorFamilies);
  assert.ok(quality.meanDeltaE<6&&quality.p95DeltaE<12);
  assert.ok(quality.meanLightnessShift>=-2);
  assert.ok(quality.saturationRatio>=.98);
  assert.ok(quality.dominantColors.every(entry=>Number.isFinite(entry.deltaE)&&entry.retained));
  console.log('COLOR-MEASURE',JSON.stringify(quality));
});
test('insufficient color budget reports lost major colors without fabricating a preservation success',()=>{
  const result=target({maxColors:4});
  assert.equal(result.colorQuality.passed,false);
  assert.ok(result.colorQuality.retainedFamilies<result.colorQuality.majorFamilies);
  assert.ok(result.colorQuality.warnings.length>0);
});
test('representatives are observed source colors and do not invent gray/brown by averaging complementary hues',()=>{
  const red=[255,40,40],cyan=[20,220,240],samples=Array.from({length:400},(_,i)=>i%2?red:cyan);
  const model=color.quantize(samples,2,{saturationBoost:0,contrastBoost:0});
  assert.ok(model.rawPalette.every(value=>[color.hex(red),color.hex(cyan)].includes(value)));
  const input=picture();
  for(let r=17;r<111;r++)for(let c=17;c<111;c++)input.data.set([...(r+c)%2?red:cyan,255],(r*128+c)*4);
  const result=image.targetFromPixels(input,{width:32,height:32,maxColors:3,saturationBoost:0,contrastBoost:0});
  assert.ok(result.palette.every(value=>color.family(color.rgb(value))==='black'||[color.hex(red),color.hex(cyan)].includes(value)));
});
test('authentic source brown and gray survive while near duplicates can merge',()=>{
  const brown=[110,65,34],orange=[255,137,26],gray=[145,145,145];
  const samples=[...Array(150).fill(brown),...Array(150).fill(orange),...Array(150).fill(gray)];
  const model=color.quantize(samples,6);
  assert.ok(model.rawPalette.includes(color.hex(brown)));
  assert.ok(model.rawPalette.includes(color.hex(gray)));
  const close=color.quantize([...Array(100).fill([80,130,245]),...Array(100).fill([81,131,244])],8);
  assert.ok(new Set(close.corrected).size<2);
});
test('tiny distinct yellow and blue/cyan accents are protected from speck cleanup',()=>{
  const cells=Array(25).fill('#F5B551');cells[12]='#F5D251';
  assert.equal(image.cleanSpeckles(cells,5,5)[12],'#F5D251');
  cells.fill('#4699D0');cells[12]='#4C8ACD';
  assert.equal(image.cleanSpeckles(cells,5,5)[12],'#4C8ACD');
});
test('modes and enhancement alter only colors, preserving exact foreground masks and inputs',()=>{
  const input=picture(),before=input.data.slice(),versions=color.MODES.map(colorMode=>image.targetFromPixels(input,{width:32,height:32,maxColors:12,colorMode}));
  for(const version of versions)assert.deepEqual(version.subjectMask,versions[0].subjectMask);
  assert.notDeepEqual(versions[0].palette,versions[2].palette);
  assert.deepEqual(input.data,before);
  const stronger=target({saturationBoost:30,contrastBoost:15});
  assert.notDeepEqual(stronger.palette,versions[0].palette);
});
test('all three playable variants conserve the same corrected target and palette; only initialRows differ',()=>{
  const result=target(),before=JSON.stringify(result.targetBoard),palette=JSON.stringify(result.palette),versions=generator.generateAll(result);
  const expected=countColors(result.targetBoard,[[],[],[]]);
  for(const version of versions){
    assert.ok(version.playable,version.validation.reason);
    version.initialBoard.forEach((row,r)=>row.forEach((cell,c)=>{
      assert.equal(cell.baseColor,result.targetBoard[r][c].baseColor);assert.equal(cell.active,result.targetBoard[r][c].active);
    }));
    assert.deepEqual(countColors(version.initialBoard,[[],[],[]]),expected);
    const engine=new TurnBeansEngine(version.initialBoard);
    for(const [r,c]of version.testSolution){assert.ok(engine.click(r,c).ok);for(let n=0;n<60&&!engine.isWon();){const action=engine.autoFillMatchingEmpty();if(!action)break;n+=action.count;}}
    assert.ok(engine.isWon());assert.deepEqual(engine.trays,[[],[],[]]);assert.deepEqual(engine.board,result.targetBoard);
  }
  assert.equal(JSON.stringify(result.targetBoard),before);assert.equal(JSON.stringify(result.palette),palette);
  const doc=schema.create(result,versions,{id:'color-test',createdAt:'2026-11-06T00:00:00.000Z'});
  assert.equal(doc.metadata.source.colorMode,'original');assert.equal(doc.metadata.source.saturationBoost,8);
  assert.deepEqual(schema.validate(JSON.parse(JSON.stringify(doc))),doc);
  assert.equal(new Set(Object.values(doc.variants).map(variant=>JSON.stringify(variant.initialRows))).size,3);
  assert.ok(Object.values(doc.variants).every(variant=>!Object.hasOwn(variant,'target')));
  for(const key of schema.KEYS)assert.deepEqual(schema.toGameLevel(doc,key).targetBoard,result.targetBoard);
});
function canvasTrace(){
  const fills=[],strokes=[],ctx={globalAlpha:.4,filter:'grayscale(1)',shadowBlur:20,shadowColor:'black',
    fillRect(){fills.push({type:'tile',color:this.fillStyle});},beginPath(){},arc(){},fill(){fills.push({type:'relief',color:this.fillStyle});},stroke(){strokes.push(this.strokeStyle);}};
  return {canvas:{getContext:()=>ctx},ctx,fills,strokes};
}
test('preview fills use exact current bean colors with no target backing mix, dark edge or heavy shadow',()=>{
  const board=[[{active:true,baseColor:'#111111',beanColor:'#FFD530'},{active:false,baseColor:null,beanColor:null}]],before=JSON.stringify(board),trace=canvasTrace();
  drawBoard(trace.canvas,board);
  assert.deepEqual(trace.fills.filter(item=>item.type==='tile').map(item=>item.color),['#FFD530']);
  assert.ok(trace.fills.filter(item=>item.type==='relief').every(item=>item.color==='rgba(255,255,255,0.10)'));
  assert.ok(trace.strokes.every(value=>value==='rgba(255,255,255,0.12)'));
  assert.equal(trace.ctx.globalAlpha,1);assert.equal(trace.ctx.shadowBlur,0);assert.equal(trace.ctx.filter,'none');
  assert.equal(JSON.stringify(board),before);
  const flat=canvasTrace();drawBoard(flat.canvas,board,{beads:false});assert.equal(flat.strokes.length,0);assert.equal(flat.fills.length,1);
});
test('target and all difficulty previews draw identical color totals, without difficulty-specific filters',()=>{
  const result=target(),versions=generator.generateAll(result);
  function drawn(board){
    const trace=canvasTrace();drawBoard(trace.canvas,board);const totals={};
    for(const fill of trace.fills.filter(item=>item.type==='tile'))totals[fill.color]=(totals[fill.color]||0)+1;
    return Object.fromEntries(Object.entries(totals).sort());
  }
  const totals=drawn(result.targetBoard);
  for(const version of versions)assert.deepEqual(drawn(version.initialBoard),totals);
});
test('invalid color modes and slider values fail explicitly',()=>{
  for(const config of [{colorMode:'muddy'},{saturationBoost:-1},{saturationBoost:41},{contrastBoost:26},{contrastBoost:NaN}])assert.throws(()=>color.settings(config));
});
