/* Foreground extraction and real-engine contracts; no browser or network. */
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const subject = require('./subject-extraction.js');
const image = require('./image-processing.js');
const generator = require('./level-generator.js');
const { TurnBeansEngine, countColors } = require('./engine.js');
const BG = [255, 239, 245, 255], RED = [220, 80, 110, 255], BLUE = [55, 140, 205, 255];
function fixture(width = 96, height = 96, paint = (r, c) => r >= 24 && r < 72 && c >= 20 && c < 68 ? RED : BG) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) data.set(paint(r, c), (r * width + c) * 4);
  return { width, height, data };
}
const active = result => result.mask.reduce((sum, value) => sum + value, 0);
const colored = result => Array.from({ length: result.width * result.height }, (_, i) => result.data[i * 4 + 3] ? result.data.slice(i * 4, i * 4 + 3).join(',') : null).filter(Boolean);
function subjectTarget(width = 32, height = 32) {
  return image.targetFromPixels(fixture(128, 128, (r, c) => {
    if (r < 28 || r >= 100 || c < 28 || c >= 100) return BG;
    return [...[[229, 124, 146], [115, 169, 209], [240, 206, 151], [70, 61, 64]][(r >= 64 ? 2 : 0) + (c >= 64 ? 1 : 0)], 255];
  }), { width, height });
}
test('background is estimated from corner and edge samples, including a mildly noisy backdrop', () => {
  const input = fixture(96, 96, (r, c) => r >= 20 && r < 75 && c >= 20 && c < 75 ? RED : [253 - (r + c) % 4, 238 + r % 4, 244 + c % 3, 255]);
  const model = subject.estimateBackground(input);
  assert.equal(model.kind, 'color'); assert.ok(model.support > .95);
  assert.ok(model.color[0] > 245 && model.color[1] > 230 && model.threshold >= 28);
  const result = subject.extractSubject(input, { width: 32, height: 32 });
  assert.ok(active(result) > 0 && active(result) < 1024);
  assert.deepEqual([...new Set(colored(result))], ['220,80,110']);
});
test('default keeps only largest subject and removes disconnected widgets and single-pixel noise', () => {
  const input = fixture(96, 96, (r, c) => {
    if (r >= 30 && r < 82 && c >= 12 && c < 58) return RED;
    if (r >= 5 && r < 15 && c >= 70 && c < 90) return BLUE;
    if (r === 88 && c === 88) return [0, 0, 0, 255];
    return BG;
  });
  const result = subject.extractSubject(input, { width: 32, height: 32 });
  assert.equal(result.info.mode, 'largest'); assert.equal(result.info.keptComponents, 1);
  assert.equal(result.info.removedComponents, 2);
  assert.deepEqual(result.info.boundingBox, { x: 12, y: 30, width: 46, height: 52 });
  assert.ok(colored(result).every(color => color === '220,80,110'));
});
test('auto keeps substantial nearby fragments, all keeps other substantial subjects, neither keeps small specks', () => {
  const input = fixture(128, 96, (r, c) => {
    if (r >= 20 && r < 70 && c >= 10 && c < 45) return RED;
    if (r >= 30 && r < 55 && c >= 50 && c < 65) return BLUE;
    if (r >= 10 && r < 30 && c >= 105 && c < 117) return [30, 180, 120, 255];
    if (r >= 85 && r < 87 && c >= 90 && c < 92) return [0, 0, 0, 255];
    return BG;
  });
  assert.equal(subject.extractSubject(input, { width: 32, height: 32 }).info.keptComponents, 1);
  assert.equal(subject.extractSubject(input, { width: 32, height: 32, mode: 'auto' }).info.keptComponents, 2);
  const all = subject.extractSubject(input, { width: 32, height: 32, mode: 'all' });
  assert.equal(all.info.keptComponents, 3);
  assert.ok(!colored(all).includes('0,0,0'));
  assert.ok(!colored(all).includes(BG.slice(0, 3).join(',')));
});
test('enclosed light eyes are kept even when their color equals the external background', () => {
  const input = fixture(96, 96, (r, c) => {
    if (r >= 20 && r < 76 && c >= 20 && c < 76) {
      if (r >= 35 && r < 45 && c >= 35 && c < 45) return BG;
      return [35, 30, 32, 255];
    }
    return BG;
  });
  const result = subject.extractSubject(input, { width: 32, height: 32 });
  assert.ok(colored(result).includes(BG.slice(0, 3).join(',')));
  assert.equal(result.mask[0], 0); assert.equal(result.data[3], 0);
});
test('transparent images use alpha without mistaking an opaque white subject for background', () => {
  const result = subject.extractSubject(fixture(96, 96, (r, c) => r >= 20 && r < 76 && c >= 25 && c < 70 ? [255, 255, 255, 255] : [0, 0, 0, 0]), { width: 32, height: 32 });
  assert.equal(result.info.background.kind, 'alpha');
  assert.deepEqual([...new Set(colored(result))], ['255,255,255']);
  assert.ok(active(result) > 0 && active(result) < 1024);
});
test('light closing repairs a tiny gap while preserving thin protrusions', () => {
  const mask = new Uint8Array(15 * 15);
  for (let r = 4; r <= 10; r++) for (let c = 4; c <= 10; c++) mask[r * 15 + c] = 1;
  mask[7 * 15 + 7] = 0; mask[3 * 15 + 7] = 1; mask[2 * 15 + 7] = 1;
  const closed = subject.closeMask(mask, 15, 15);
  assert.equal(closed[7 * 15 + 7], 1); assert.equal(closed[2 * 15 + 7], 1);
  assert.equal(mask[7 * 15 + 7], 0);
});
test('colors extended into a closed notch come from the foreground, not the deleted background', () => {
  const input = fixture(96, 96, (r, c) => {
    if (r >= 24 && r < 72 && c >= 24 && c < 72) return c === 48 && r < 28 ? BG : RED;
    return BG;
  });
  const result = subject.extractSubject(input, { width: 32, height: 32 });
  assert.ok(colored(result).every(color => color === '220,80,110'));
});
test('bounding box centering preserves aspect ratio with transparent margins in each supported size', () => {
  for (const [width, height] of image.SIZES) {
    const result = subject.extractSubject(fixture(96, 96, (r, c) => r >= 10 && r < 70 && c >= 5 && c < 35 ? RED : BG), { width, height });
    const positions = [...result.mask.keys()].filter(i => result.mask[i]), rows = positions.map(i => Math.floor(i / width)), cols = positions.map(i => i % width);
    const left = Math.min(...cols), right = Math.max(...cols), top = Math.min(...rows), bottom = Math.max(...rows);
    assert.ok(Math.abs((left + right) / 2 - (width - 1) / 2) <= .5);
    assert.ok(Math.abs((top + bottom) / 2 - (height - 1) / 2) <= .5);
    assert.ok(left > 0 && right < width - 1 && top > 0 && bottom < height - 1);
    assert.ok(Math.abs((right - left + 1) / (bottom - top + 1) - .5) < .08);
  }
});
test('plain background, tiny isolated noise and unreliable edge colors fail explicitly in every mode', () => {
  for (const mode of subject.MODES) {
    assert.throws(() => subject.extractSubject(fixture(96, 96, () => BG), { mode, width: 32, height: 32 }), /主体识别失败/);
    assert.throws(() => subject.extractSubject(fixture(96, 96, (r, c) => r === 40 && c === 40 ? RED : BG), { mode, width: 32, height: 32 }), /主体识别失败/);
    assert.throws(() => subject.extractSubject(fixture(96, 96, (r, c) => [r * 2, c * 2, (r * 7 + c * 13) % 256, 255]), { mode, width: 32, height: 32 }), /稳定背景主色/);
  }
});
test('malformed inputs and unsupported modes are rejected without altering source pixels', () => {
  const input = fixture(), before = input.data.slice();
  assert.throws(() => subject.extractSubject({ ...input, data: [] }));
  assert.throws(() => subject.extractSubject(input, { mode: 'off' }));
  assert.throws(() => subject.extractSubject(input, { width: 0 }));
  const a = subject.extractSubject(input, { width: 32, height: 32 });
  const b = subject.extractSubject(input, { width: 32, height: 32 });
  assert.deepEqual(a, b); assert.deepEqual(input.data, before);
});
test('only foreground pixels enter palette reduction; all outside cells are canonical inactive cells', () => {
  for (const [width, height] of image.SIZES) {
    const target = subjectTarget(width, height);
    assert.ok(!target.palette.includes('#FFEFF5'));
    let activeCells = 0;
    target.targetBoard.forEach((row, r) => row.forEach((cell, c) => {
      const i = r * width + c;
      if (target.subjectMask[i]) { activeCells++; assert.ok(cell.active); assert.ok(target.palette.includes(cell.beanColor)); }
      else assert.deepEqual(cell, { active: false, baseColor: null, beanColor: null });
    }));
    assert.equal(activeCells, target.subject.outputActiveCells);
    assert.ok(activeCells > 0 && activeCells < width * height);
  }
});
test('all difficulty counts, recolor ratios and engine replays use only active foreground cells', () => {
  const target = subjectTarget(), activeCount = target.targetBoard.flat().filter(cell => cell.active).length;
  assert.ok(activeCount < 1024);
  for (const level of generator.generateAll(target)) {
    assert.ok(level.playable, level.validation.reason);
    const actualChanged = level.initialBoard.flat().filter(cell => cell.active && cell.beanColor !== cell.baseColor).length;
    assert.equal(level.metrics.activeBeans, activeCount);
    assert.equal(level.metrics.recolorRate, actualChanged / activeCount);
    const engine = new TurnBeansEngine(level.initialBoard);
    const expectedCounts = countColors(target.targetBoard, [[], [], []]);
    for (const [r, c] of level.testSolution) {
      assert.ok(target.targetBoard[r][c].active);
      assert.ok(engine.click(r, c).ok);
      for (let n = 0; n < 60 && !engine.isWon();) { const action = engine.autoFillMatchingEmpty(); if (!action) break; n += action.count; }
      assert.deepEqual(countColors(engine.board, engine.trays), expectedCounts);
    }
    assert.ok(engine.isWon()); assert.deepEqual(engine.trays, [[], [], []]);
    level.initialBoard.forEach((row, r) => row.forEach((cell, c) => {
      if (!target.targetBoard[r][c].active) assert.deepEqual(cell, { active: false, baseColor: null, beanColor: null });
    }));
    assert.deepEqual(engine.board, target.targetBoard);
  }
});
test('JSON rows use dot outside target and every initial board, and rows survive a verified roundtrip', () => {
  const target = subjectTarget(), versions = generator.generateAll(target);
  const parsed = generator.parseJSON(generator.exportJSON(target, versions));
  const activeCount = target.subject.outputActiveCells;
  assert.equal(parsed.rows.join('').replace(/\./g, '').length, activeCount);
  assert.deepEqual(parsed.subject, target.subject);
  for (const level of parsed.levels) {
    assert.equal(level.initialRows.join('').replace(/\./g, '').length, activeCount);
    parsed.rows.forEach((row, r) => [...row].forEach((symbol, c) => {
      if (symbol === '.') assert.equal(level.initialRows[r][c], '.');
      else {
        assert.equal(parsed.symbolPalette[symbol], target.targetBoard[r][c].baseColor);
        assert.equal(parsed.symbolPalette[level.initialRows[r][c]], level.initialBoard[r][c].beanColor);
      }
    }));
  }
  const tampered = structuredClone(parsed); tampered.rows[0] = 'A' + tampered.rows[0].slice(1);
  assert.throws(() => generator.parseJSON(JSON.stringify(tampered)), /rows/);
  const tamperedInitial = structuredClone(parsed); tamperedInitial.levels[0].initialRows[0] = 'A' + tamperedInitial.levels[0].initialRows[0].slice(1);
  assert.throws(() => generator.parseJSON(JSON.stringify(tamperedInitial)), /rows/);
});

test('background tolerance removes near-background fringes without changing enclosed subject details', () => {
  const input=fixture(96,96,(r,c)=>{
    if(r>=28&&r<68&&c>=28&&c<68)return RED;
    if(r>=22&&r<74&&c>=22&&c<74)return [235,226,231,255];
    return BG;
  });
  const precise=subject.extractSubject(input,{width:32,height:32,backgroundTolerance:-20});
  const broad=subject.extractSubject(input,{width:32,height:32,backgroundTolerance:55});
  assert.ok(precise.info.boundingBox.width>broad.info.boundingBox.width);
  assert.ok(broad.info.background.threshold>precise.info.background.threshold);
  assert.deepEqual([...new Set(colored(broad))],['220,80,110']);
  assert.throws(()=>subject.extractSubject(input,{backgroundTolerance:81}),/容差/);
  assert.throws(()=>subject.extractSubject(input,{backgroundTolerance:NaN}),/容差/);
});
