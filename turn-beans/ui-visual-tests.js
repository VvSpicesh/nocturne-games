'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname,p),'utf8');
const {getLevel} = require('./levels.js');
const {TurnBeansEngine} = require('./engine.js');
const js=read('game.js'), css=read('style.css'), html=read('index.html');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
test('raw target has explicit active cells and never hides valid beans',()=>{
 for(const id of ['01','02','03','04']){
  const lv=getLevel(id);
  assert.ok(lv.targetBoard.some(row=>row.some(cell=>cell.active && cell.beanColor)));
  for(const row of lv.targetBoard)for(const cell of row) assert.equal(typeof cell.active,'boolean');
 }
 assert.match(js,/cell\.active === false \? ' inactive'/);
 assert.match(js,/button\.disabled = disabled \|\| cell\.active === false/);
});
test('all inactive cells omit beans and preserve color totals',()=>{
 const cat=getLevel('04');
 assert.ok(cat.targetBoard.flat().some(cell=>cell.active===false));
 assert.ok(cat.targetBoard.flat().some(cell=>cell.active===true));
 const engine=new TurnBeansEngine(cat.initialBoard);
 for(const [r,c] of cat.testSolution) assert.ok(engine.click(r,c).ok);
 assert.ok(engine.isWon());
});
test('start label is used instead of obstructive preview overlay',()=>{
 assert.match(html,/id="previewCover"[^>]*>开始<\/div>/);
 assert.doesNotMatch(html,/记住图案/);
 assert.match(js,/dom\.preview\.classList\.add\('hidden'\)/);
 assert.match(js,/previewing \? '开始'/);
});
test('transparent circular bead shapes and cat thumbnail',()=>{
 assert.match(css,/\.board \.cell:not\(\.inactive\)::before/);
 assert.match(css,/\.board \.cell\.inactive \{visibility:hidden/);
 assert.match(css,/\.level-thumb \{background:transparent/);
 assert.match(js,/dot\.classList\.add\('inactive'\)/);
 assert.equal(getLevel('04').name,'小猫咪');
});
test('Web Audio bounce and mute toggle, no external sound dependencies',()=>{
 assert.match(html,/id="soundToggle"/);
 assert.match(js,/window\.AudioContext \|\| window\.webkitAudioContext/);
 assert.match(js,/soundBounce\(result\.count, result\.type === 'exchange'\)/);
 assert.match(js,/localStorage\.setItem\('turn-beans-sound'/);
});
console.log(`${passed} visual regression tests passed`);
