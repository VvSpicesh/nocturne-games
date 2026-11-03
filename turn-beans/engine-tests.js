'use strict';
const assert = require('node:assert/strict');
const { TurnBeansEngine, countColors } = require('./engine.js');
const cell = (baseColor, beanColor = null) => ({ baseColor, beanColor });
const hole = () => ({ active: false, beanColor: null });
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
function snapshot(engine) { return JSON.stringify(engine.getState()); }
function totals(engine) { return countColors(engine.board, engine.trays); }

test('initial state: three empty trays, fixed bases, empty and inactive holes', () => {
  const e = new TurnBeansEngine([[cell('R', 'G'), cell('B'), hole()]]);
  assert.equal(e.getTray(0).length, 0);
  assert.equal(e.trays.length, 3);
  assert.equal(e.board[0][0].baseColor, 'R');
  assert.equal(e.board[0][1].beanColor, null);
  assert.equal(e.board[0][2].active, false);
  assert.equal(e.checkInvariants(), true);
});

test('BFS up-right-down-left order from center', () => {
  const e = new TurnBeansEngine(Array.from({length: 3}, () => Array.from({length: 3}, () => cell('R','G'))));
  assert.deepEqual(e.getConnectedCells(1,1,5), [
    {row:1,col:1},{row:0,col:1},{row:1,col:2},{row:2,col:1},{row:1,col:0}
  ]);
});

test('BFS requires both base and bean match, not diagonal', () => {
  const e = new TurnBeansEngine([
    [cell('R','G'),cell('B','G'),cell('R','G')],
    [cell('R','B'),cell('R','G'),cell('R',null)],
    [cell('R','G'),hole(),cell('R','G')]
  ]);
  assert.deepEqual(e.getConnectedCells(1,1), [{row:1,col:1}]);
});

test('take stops at ten, preserves colors, empties positions', () => {
  const e = new TurnBeansEngine([Array.from({length:12}, () => cell('R','G'))]);
  const before = totals(e), result = e.take(0,0);
  assert.equal(result.count, 10);
  assert.equal(e.trays[0].length,10);
  assert.equal(e.board[0].filter(c => c.beanColor === null).length,10);
  assert.deepEqual(totals(e),before);
  assert.equal(e.steps,1);
  assert.equal(e.history.length,1);
});

test('take uses only matching component and appends FIFO', () => {
  const e = new TurnBeansEngine([[cell('R','G'),cell('R','G'),cell('R','B'),cell('R','B')]]);
  assert.equal(e.take(0,0).count,2);
  assert.deepEqual(e.getTray(0),['G','G']);
  // Remaining two go to tray 2 because it has more free space.
  assert.equal(e.take(0,2).count,2);
  assert.deepEqual(e.getTray(1),['B','B']);
  assert.deepEqual(e.getTray(0),['G','G']);
});

test('cannot take already correct, empty, inactive or out-of-range cell', () => {
  const e = new TurnBeansEngine([[cell('R','R'),cell('R'),hole(),cell('R','B')]]);
  const before=snapshot(e);
  assert.equal(e.take(0,0).ok,false);
  assert.equal(e.take(0,1).ok,false);
  assert.equal(e.take(0,2).ok,false);
  assert.equal(e.take(3,1).ok,false);
  assert.equal(snapshot(e),before);
});

test('tray capacity twenty and partial take when only limited space', () => {
  const rows = [Array.from({length:64}, (_,i) => cell('R', i<60?'G':'B'))];
  const e = new TurnBeansEngine(rows);
  // Multiple takes distribute across trays; every queue remains <= 20.
  for (let i=0;i<6;i++) assert.equal(e.take(0,i*10).count,10);
  assert.deepEqual(e.trays.map(q=>q.length),[20,20,20]);
  const before=snapshot(e);
  assert.equal(e.take(0,60).reason,'trays_full');
  assert.equal(snapshot(e),before);
  assert.equal(e.checkInvariants(),true);
});

test('initialization rejects malformed data', () => {
  assert.throws(() => new TurnBeansEngine([]));
  assert.throws(() => new TurnBeansEngine([[cell('R','G')],[]]));
  assert.throws(() => new TurnBeansEngine([[{baseColor:null,beanColor:'G'}]]));
  assert.throws(() => new TurnBeansEngine([[{active:false,beanColor:'G'}]]));
});


// Phase 2: FIFO exchange tests. Seed a reachable state via take() when
// possible; direct transfers are used only to assemble specific queue edges.
function transferToTray(engine, row, col, trayIndex) {
  const value = engine.board[row][col].beanColor;
  assert.notEqual(value, null);
  assert.ok(engine.trays[trayIndex].length < 20);
  engine.board[row][col].beanColor = null;
  engine.trays[trayIndex].push(value);
  engine.checkInvariants();
}

test('exchange replaces wrong bean, appends displaced color to FIFO tail', () => {
  const e = new TurnBeansEngine([[cell('R','G'),cell('G','B')]]);
  assert.equal(e.take(0,0).ok,true);
  assert.deepEqual(e.getTray(0), ['G']);
  const before = totals(e);
  const r=e.exchange(0,1);
  assert.deepEqual([r.ok,r.count,r.trayIndex], [true,1,0]);
  assert.equal(e.board[0][1].beanColor,'G');
  assert.deepEqual(e.getTray(0),['B']);
  assert.deepEqual(totals(e),before);
  assert.equal(e.steps,2);
});

test('exchange fills empty matching base and consumes tray bean', () => {
  const e = new TurnBeansEngine([[cell('R','G'),cell('G',null)]]);
  e.take(0,0);
  const before=totals(e);
  const r=e.click(0,1);
  assert.equal(r.type,'exchange');
  assert.equal(r.count,1);
  assert.equal(e.board[0][1].beanColor,'G');
  assert.deepEqual(e.getTray(0),[]);
  assert.deepEqual(totals(e),before);
});

test('exchange uses only same base and original bean component; not diagonals', () => {
  const e = new TurnBeansEngine([
    [cell('R','G'),cell('G','B'),cell('G','B'),cell('B','B')],
    [cell('R','G'),cell('G','R'),cell('G','B'),cell('G','B')]
  ]);
  e.take(0,0);
  assert.deepEqual(e.getTray(0),['G','G']);
  const r=e.exchange(0,1);
  assert.equal(r.count,2);
  assert.deepEqual(r.positions,[{row:0,col:1},{row:0,col:2}]);
  assert.equal(e.board[1][2].beanColor,'B');
  assert.equal(e.board[1][3].beanColor,'B');
  assert.equal(e.board[1][1].beanColor,'R');
  assert.deepEqual(e.getTray(0),['B','B']);
});

test('FIFO forbids skipping a different-color queue head', () => {
  const e=new TurnBeansEngine([[cell('R','B'),cell('R','G'),cell('G','R')]]);
  transferToTray(e,0,0,0);
  transferToTray(e,0,1,0);
  const before=snapshot(e);
  assert.equal(e.exchange(0,2).ok,false);
  assert.equal(snapshot(e),before);
});

test('FIFO prefix limits exchange even if a matching color appears later', () => {
  const e=new TurnBeansEngine([[cell('R','G'),cell('R','B'),cell('R','G'),cell('G','R'),cell('G','R'),cell('G','R')]]);
  transferToTray(e,0,0,0);
  transferToTray(e,0,1,0);
  transferToTray(e,0,2,0);
  const result=e.exchange(0,3);
  assert.equal(result.count,1);
  assert.deepEqual(e.getTray(0),['B','G','R']);
  assert.equal(e.board[0][4].beanColor,'R');
});

test('choose tray with the largest valid exchange; tie goes to lower index', () => {
  const e=new TurnBeansEngine([[cell('R','G'),cell('R','G'),cell('R','G'),cell('R','G'),cell('G','B'),cell('G','B'),cell('G','B'),cell('G','B')]]);
  transferToTray(e,0,0,0); transferToTray(e,0,1,0);
  transferToTray(e,0,2,1); transferToTray(e,0,3,1);
  assert.equal(e.getBestSwap(0,4).trayIndex,0); // equal (2 and 2)
  // Move one color from a fresh matching source to tray 1.
  const f=new TurnBeansEngine([[cell('R','G'),cell('R','G'),cell('R','G'),cell('G','B'),cell('G','B'),cell('G','B')]]);
  transferToTray(f,0,0,0);
  transferToTray(f,0,1,1);transferToTray(f,0,2,1);
  assert.equal(f.getBestSwap(0,3).trayIndex,1);
  assert.equal(f.click(0,3).count,2);
  assert.deepEqual(f.getTray(1),['B','B']);
});

test('full 20-bean tray exchanges by removing before appending', () => {
  const e=new TurnBeansEngine([[...Array.from({length:20},()=>cell('R','G')),cell('G','B'),cell('G','B')]]);
  for(let i=0;i<20;i++) transferToTray(e,0,i,0);
  assert.equal(e.getTray(0).length,20);
  const before=totals(e);
  const r=e.exchange(0,20);
  assert.equal(r.ok,true);
  assert.equal(r.count,2);
  assert.equal(e.getTray(0).length,20);
  assert.deepEqual(e.getTray(0).slice(-2),['B','B']);
  assert.deepEqual(totals(e),before);
});

test('exchange maximum is 10 even for larger connected area and FIFO prefix', () => {
  const e=new TurnBeansEngine([[...Array.from({length:12},()=>cell('R','G')),...Array.from({length:12},()=>cell('G','B'))]]);
  for(let i=0;i<12;i++) transferToTray(e,0,i,0);
  const r=e.exchange(0,12);
  assert.equal(r.count,10);
  assert.equal(e.board[0][22].beanColor,'B');
  assert.equal(e.getTray(0).length,12);
});

test('click prefers exchange, falls back to take, rejects correct and invalid cells', () => {
  const e=new TurnBeansEngine([[cell('R','G'),cell('G','B'),cell('B','B'),hole()]]);
  assert.equal(e.click(0,1).type,'take');
  assert.equal(e.click(0,0).type,'take');
  const before=snapshot(e);
  assert.equal(e.click(0,2).ok,false);
  assert.equal(e.click(0,3).ok,false);
  assert.equal(e.click(1,0).ok,false);
  assert.equal(snapshot(e),before);
  assert.equal(e.click(0,1).type,'exchange'); // B now at tray head 0
});

test('invalid exchange has no effect on steps or history', () => {
  const e=new TurnBeansEngine([[cell('G','R'),cell('B','G')]]);
  const before=snapshot(e);
  assert.equal(e.exchange(0,0).ok,false);
  assert.equal(e.exchange(-1,2).ok,false);
  assert.equal(snapshot(e),before);
  assert.equal(e.history.length,0);
});


test('click prioritizes swap over taking the same wrong-color component', () => {
  const e=new TurnBeansEngine([[cell('R','G'),cell('G','B')]]);
  e.take(0,0);
  // Clicking G-base/B-bean has both a take path and a matching FIFO G.
  const result=e.click(0,1);
  assert.equal(result.type,'exchange');
  assert.equal(e.board[0][1].beanColor,'G');
  assert.deepEqual(e.getTray(0),['B']);
});

test('empty connected region is limited to matching-base empty cells', () => {
  const e=new TurnBeansEngine([[cell('R','G'),cell('G'),cell('G'),cell('R'),cell('G')]]);
  e.take(0,0);
  const result=e.exchange(0,1);
  assert.equal(result.count,1); // one bean in FIFO, not unlimited empty fill
  assert.equal(e.board[0][1].beanColor,'G');
  assert.equal(e.board[0][2].beanColor,null);
});

test('deterministic mixed-color click sequence keeps every color total and bounds', () => {
  const colors=['R','G','B','Y'];
  let seed=123456789;
  const random=() => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const board=Array.from({length:10},(_,r)=>Array.from({length:10},(_,c)=>cell(colors[(r+c)%4],colors[Math.floor(random()*4)])));
  const e=new TurnBeansEngine(board), initial=totals(e);
  for(let i=0;i<500;i++) {
    const row=Math.floor(random()*10),col=Math.floor(random()*10);
    const previous=snapshot(e), history=e.history.length;
    const result=e.click(row,col);
    assert.deepEqual(totals(e),initial);
    assert.equal(e.checkInvariants(),true);
    if(!result.ok) {
      assert.equal(snapshot(e),previous);
      assert.equal(e.history.length,history);
    }
  }
});


// Phase 3: full-state undo, exact restart, win/deadlock, portable save.
test('undo reverses taking and restores all cells and trays', () => {
  const e = new TurnBeansEngine([[cell('R','G'),cell('R','G'),cell('G','R')]]);
  const start = snapshot(e);
  assert.equal(e.take(0,0).count,2);
  assert.equal(e.history.length,1);
  assert.equal(e.undo().ok,true);
  assert.equal(snapshot(e),start);
  assert.equal(e.steps,0);
  assert.equal(e.history.length,0);
  assert.equal(e.undo().reason,'no_history');
});

test('undo reverses exchange including displaced FIFO order', () => {
  const e = new TurnBeansEngine([[cell('R','G'),cell('G','B'),cell('G','B')]]);
  e.take(0,0);
  const beforeExchange = snapshot(e);
  assert.equal(e.exchange(0,1).ok,true);
  assert.deepEqual(e.getTray(0),['B','B'].slice(0,1));
  assert.equal(e.undo().ok,true);
  assert.equal(snapshot(e), beforeExchange);
  assert.deepEqual(e.getTray(0),['G']);
});

test('multiple undo returns to initial and new action replaces undone timeline', () => {
  const e = new TurnBeansEngine([[cell('R','G'),cell('G','B'),cell('B','R')]]);
  const initial = snapshot(e);
  e.click(0,0); e.click(0,1); e.click(0,2);
  assert.equal(e.steps,3);
  assert.equal(e.undo().ok,true);
  assert.equal(e.undo().ok,true);
  assert.equal(e.steps,1);
  assert.equal(e.click(0,2).ok,true);
  assert.equal(e.history.length,2);
  assert.equal(e.undo().ok,true);
  assert.equal(e.undo().ok,true);
  assert.equal(snapshot(e),initial);
});

test('restart recovers identical initial puzzle and clears complete history', () => {
  const e = new TurnBeansEngine([[cell('R','G'),cell('G','B'),cell('B','R')]]);
  const initial = snapshot(e);
  e.click(0,0); e.click(0,1); e.click(0,2);
  assert.equal(e.restart().ok,true);
  assert.equal(snapshot(e),initial);
  assert.deepEqual(e.trays,[[],[],[]]);
  assert.equal(e.history.length,0);
  assert.equal(e.undo().ok,false);
  e.click(0,0);
  e.restart();
  assert.equal(snapshot(e),initial);
});

test('win needs correct beans in every active cell AND all trays empty', () => {
  const solved = new TurnBeansEngine([[cell('R','R'),hole(),cell('B','B')]]);
  assert.equal(solved.isWon(),true);
  assert.equal(solved.isStuck(),false);
  const e = new TurnBeansEngine([[cell('R','G'),cell('G','R')]]);
  assert.equal(e.isWon(),false);
  e.take(0,0);e.exchange(0,1);e.exchange(0,0);
  assert.equal(e.isWon(),true);
  assert.deepEqual(e.trays,[[],[],[]]);
  assert.equal(e.undo().ok,true);
  assert.equal(e.isWon(),false);
});

test('win rejects empty active slots and nonempty trays even if occupied cells correct', () => {
  const e = new TurnBeansEngine([[cell('R','G'),cell('G','G')]]);
  e.take(0,0);
  assert.equal(e.isWon(),false);
  const noBeans = new TurnBeansEngine([[cell('R',null)]]);
  assert.equal(noBeans.isWon(),false);
  assert.equal(noBeans.hasLegalMove(),false);
  assert.equal(noBeans.isStuck(),true);
});

test('full trays are not automatically stuck when a FIFO swap is possible', () => {
  const e=new TurnBeansEngine([[...Array.from({length:20},()=>cell('R','G')),cell('G','B')]]);
  for(let i=0;i<20;i++) transferToTray(e,0,i,0);
  assert.equal(e.getTray(0).length,20);
  assert.equal(e.hasLegalMove(),true);
  assert.equal(e.isStuck(),false);
});

test('save round-trip restores state, history and permits undo and restart', () => {
  const e = new TurnBeansEngine([[cell('R','G'),cell('G','B'),cell('B','R')]]);
  const initial=snapshot(e);
  e.click(0,0);e.click(0,1);e.click(0,2);
  const saved=JSON.parse(JSON.stringify(e.exportSave()));
  const loaded=TurnBeansEngine.fromSave(saved);
  assert.equal(snapshot(loaded),snapshot(e));
  assert.equal(loaded.history.length,e.history.length);
  assert.equal(loaded.undo().ok,true);
  assert.equal(loaded.steps,2);
  loaded.restart();
  assert.equal(snapshot(loaded),initial);
  assert.equal(snapshot(e),JSON.stringify(saved.current));
});

test('exported save is a detached copy and does not expose mutable engine state', () => {
  const e = new TurnBeansEngine([[cell('R','G'),cell('G','R')]]);
  const snap=snapshot(e), save=e.exportSave();
  save.initialBoard[0][0].baseColor='X';
  save.current.board[0][0].beanColor='Y';
  save.current.trays[0].push('K');
  assert.equal(snapshot(e),snap);
  assert.equal(e.checkInvariants(),true);
});

test('corrupt and incompatible saves are rejected without affecting original', () => {
  const e=new TurnBeansEngine([[cell('R','G'),cell('G','R')]]);
  e.take(0,0);
  const before=snapshot(e);
  const mutate = fn => {
    const s=e.exportSave();fn(s);
    assert.throws(()=>TurnBeansEngine.fromSave(s));
    assert.equal(snapshot(e),before);
  };
  mutate(s=>{s.version=99;});
  mutate(s=>{s.current.board[0][0].baseColor='B';});
  mutate(s=>{s.current.trays[0][0]='X';});
  mutate(s=>{s.current.trays[0]=Array(21).fill('G');});
  mutate(s=>{s.current.steps=10;});
  mutate(s=>{s.history[0].steps=3;});
  mutate(s=>{s.history[0].board[0][0].beanColor='R';});
  mutate(s=>{s.history=[];});
});

test('invalid click, undo without history and read-only queries do not change state', () => {
  const e=new TurnBeansEngine([[cell('R','G'),cell('G','R')]]);
  const before=snapshot(e);
  assert.equal(e.undo().ok,false);
  assert.equal(e.click(-1,-1).ok,false);
  e.hasLegalMove();e.isStuck();e.isWon();e.exportSave();
  assert.equal(snapshot(e),before);
});

test('long click sequence round-trips save and undoes back to exact start', () => {
  let seed=23456789;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const colors=['R','G','B'];
  const board=Array.from({length:8},(_,r)=>Array.from({length:8},(_,c)=>cell(colors[(r+c)%3],colors[Math.floor(rnd()*3)])));
  const e=new TurnBeansEngine(board);
  const beginning=snapshot(e);
  for(let i=0;i<250;i++) {
    e.click(Math.floor(rnd()*8),Math.floor(rnd()*8));
    e.checkInvariants();
  }
  const restored=TurnBeansEngine.fromSave(JSON.parse(JSON.stringify(e.exportSave())));
  assert.equal(snapshot(restored),snapshot(e));
  while(restored.undo().ok) restored.checkInvariants();
  assert.equal(snapshot(restored),beginning);
  assert.equal(restored.history.length,0);
});

console.log(`\n${passed} tests passed`);
