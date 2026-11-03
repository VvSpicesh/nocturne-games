// Offline contract tests for Phase 6 UI behavior. Real gestures require testing on a phone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const js=read('game.js'), html=read('index.html'), css=read('style.css');
const checks = [
  ['completed levels restart from fresh while preserving completion badge', () => {
    assert.match(js, /startLevel\(item\.id, \{ fresh: progress\.completed\.includes\(item\.id\) \}\)/);
    assert.match(js, /✓ 已完成 · 点击重玩/);
  }],
  ['completion panel has replay home and next', () => {
    for (const id of ['replayBtn','completeHome','nextBtn']) assert.match(html,new RegExp(`id="${id}"`));
    assert.match(js, /dom\.replay\.addEventListener\('click'/);
  }],
  ['mouse wheel controls zoom without +/- buttons', () => {
    assert.match(js, /addEventListener\('wheel'/);
    assert.match(js, /event\.preventDefault\(\)/);
    assert.doesNotMatch(html, /id="zoomOut"|id="zoomIn"/);
  }],
  ['two pointer pinch zoom with midpoint anchor', () => {
    assert.match(js, /pointerDistance\(/);
    assert.match(js, /pointerMidpoint\(/);
    assert.match(js, /pointers\.size >= 2/);
    assert.match(css, /touch-action:none/);
  }],
  ['desktop flex play screen and constrained board', () => {
    assert.match(css, /@media\(min-width:700px\) and \(min-height:620px\)/);
    assert.match(css, /#playScreen:not\(\[hidden\]\)/);
    assert.match(css, /\.board-viewport \{flex:1;max-height:none;min-height:0/);
  }],
  ['board auto fit and existing save key retained', () => {
    assert.match(js, /requestAnimationFrame\(fitBoardToViewport\)/);
    assert.match(js, /nocturne-turn-beans-progress-v1/);
  }],
];
for(const [name, check] of checks){check();console.log('PASS',name)}
console.log(`${checks.length} UI gesture static tests passed`);
