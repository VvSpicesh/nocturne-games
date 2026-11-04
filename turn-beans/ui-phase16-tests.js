'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const game = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
const {TurnBeansEngine, countColors} = require('./engine.js');
const cell=(b,c)=>({baseColor:b,beanColor:c});
assert.match(game, /dom\.board\.addEventListener\('click'/);
assert.match(game, /dom\.board\.contains\(event\.target\)/);
assert.match(game, /document\.createElement\('canvas'\)/);
assert.match(game, /requestAnimationFrame\(frame\)/);
assert.match(game, /result\.transfers/);
const board = [
 [cell('R','G'),cell('G','R'),cell('G','G'),cell('B','R')],
 [cell('B','G'),cell('R','G'),cell('G','G'),cell('R','B')]
];
const e = new TurnBeansEngine(board);
const before=countColors(e.board,e.trays);
assert.deepEqual(e.getConnectedCells(0,0), [{row:0,col:0}]);
const taken=e.take(0,1);
assert.equal(taken.count,1);
assert.deepEqual(taken.transfers.map(t=>t.trayIndex),[0]);
assert.deepEqual(countColors(e.board,e.trays),before);
assert.equal(e.undo().ok,true);
console.log('PASS Phase 16: delegated hit targets, canvas flights, exact color-pair regions, color conservation and undo');
