/* Static regression for mouse pan and hall navigation; real gestures verified on phone. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p), 'utf8');
const game = read('turn-beans/game.js');
const css = read('turn-beans/style.css');
const hall = read('index.html');
const home = read('turn-beans/index.html');
const sw = read('service-worker.js');
const verify = read('scripts/verify.py');
const tests = [
 ['hall links to Turn Beans',()=> assert.match(hall,/href="\.\/turn-beans\/index\.html"/)],
 ['level home has explicit return link',()=> assert.match(home,/class="hall-home-link" href="\.\.\/index\.html"/)],
 ['existing game topbar hall link remains',()=> assert.match(home,/class="back" href="\.\.\/index\.html"/)],
 ['mouse pointer drag handlers exist',()=>{assert.match(game,/event\.pointerType !== 'mouse'/);assert.match(game,/window\.addEventListener\('pointermove'/);assert.match(game,/window\.addEventListener\('pointerup'/)}],
 ['mouse drag only when board can pan',()=>assert.match(game,/!canPan\(\)/)],
 ['mouse drag updates scroller',()=>{assert.match(game,/dom\.viewport\.scrollLeft -= dx/);assert.match(game,/dom\.viewport\.scrollTop -= dy/)}],
 ['drag prevents accidental clicks',()=>{assert.match(game,/suppressTap = true/);assert.match(game,/event\.stopPropagation\(\)/);assert.match(game,/Math\.hypot\(/)}],
 ['touch pinch and wheel remain',()=>{assert.match(game,/pointerMidpoint\(/);assert.match(game,/addEventListener\('wheel'/)}],
 ['grab cursors follow drag state',()=>{assert.match(css,/\.board-viewport\.can-drag/);assert.match(css,/\.board-viewport\.is-dragging/)}],
 ['SW precache includes runtime files',()=>{for(const f of ['index.html','style.css','game.js','engine.js','levels.js'])assert.ok(sw.includes('"./turn-beans/'+f+'"'))}],
 ['smoke checks game assets',()=>assert.match(verify,/"turn-beans\/game.js"/)],
];
for(const [name, run] of tests){run(); console.log('PASS', name)}
console.log(`${tests.length} integration static tests passed`);
