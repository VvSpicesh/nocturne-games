'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TurnBeansEngine, countColors } = require('./engine.js');
const { getLevel } = require('./levels.js');
const image = require('./image-processing.js');
const g = require('./level-generator.js');
const PALETTE = ['#E57C92', '#73A9D1', '#F0CE97', '#463D40'];
function target(width = 32, height = 32, pattern = (r, c) => (r >= height / 2 ? 2 : 0) + (c >= width / 2 ? 1 : 0)) {
  const targetBoard = Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => {
    const index = pattern(r, c);
    return { active: index !== null, baseColor: index === null ? null : PALETTE[index], beanColor: index === null ? null : PALETTE[index] };
  }));
  return { width, height, targetBoard, palette: [...new Set(targetBoard.flat().filter(c => c.active).map(c => c.baseColor))] };
}
// This reference replay deliberately does not use the generator's verifier.
function independentReplay(t, level) {
  const engine = new TurnBeansEngine(level.initialBoard), expected = countColors(t.targetBoard, [[], [], []]);
  for (const position of level.testSolution) {
    let result = engine.click(...position);
    assert.ok(result.ok); assert.ok(result.count <= 10);
    assert.ok(engine.trays.every(tray => tray.length <= 20));
    assert.deepEqual(countColors(engine.board, engine.trays), expected);
    assert.ok(!engine.isLost());
    for (let filled = 0; filled < 60 && !engine.isWon();) {
      result = engine.autoFillMatchingEmpty();
      if (!result) break;
      filled += result.count; assert.ok(result.ok && result.count <= 10);
      assert.ok(engine.trays.every(tray => tray.length <= 20));
      assert.deepEqual(countColors(engine.board, engine.trays), expected);
    }
  }
  assert.equal(engine.isWon(), true);
  assert.deepEqual(engine.board, t.targetBoard); assert.deepEqual(engine.trays, [[], [], []]);
}
const reference = target(), referenceBefore = JSON.stringify(reference), versions = g.generateAll(reference);
test('three tiers have measurable operation, component, recolor and capacity differences', () => {
  assert.deepEqual(versions.map(l => l.difficulty), ['easy', 'normal', 'hard']);
  assert.ok(versions.every(l => l.playable && l.validation.passed));
  for (let i = 1; i < 3; i++) {
    assert.ok(versions[i].metrics.changedBeans > versions[i - 1].metrics.changedBeans);
    assert.ok(versions[i].metrics.meanComponentSize < versions[i - 1].metrics.meanComponentSize);
    assert.ok(versions[i].metrics.componentCount > versions[i - 1].metrics.componentCount);
    assert.notEqual(versions[i].validation.clicks, versions[i - 1].validation.clicks);
    assert.ok(versions[i].validation.peakTrayTotal > versions[i - 1].validation.peakTrayTotal);
    assert.ok(versions[i].metrics.difficultyScore > versions[i - 1].metrics.difficultyScore);
  }
  assert.equal(versions[2].metrics.recolorRate, 1);
  versions.forEach((level, i) => {
    assert.ok(level.generation.cycles.some(cycle => cycle.colors.length === i + 2));
    independentReplay(reference, level);
  });
  assert.equal(JSON.stringify(reference), referenceBefore);
});
for (const [width, height] of image.SIZES) test(width + 'x' + height + ': all tiers conserve colors and replay through a separate real engine', () => {
  const t = target(width, height);
  for (const level of g.generateAll(t)) {
    assert.ok(level.playable, level.validation.reason); independentReplay(t, level);
    assert.ok(level.validation.maxTransfer <= 10 && level.validation.peakTrayTotal < 60);
    assert.ok(level.validation.peakPerTray.every(n => n <= 20));
  }
});
test('unequal and dominant color counts show actual rate instead of claiming 100%', () => {
  const t = target(32, 32, (r, c) => r * 32 + c < 900 ? 0 : 1);
  const hard = g.generateLevel(t, 'hard');
  assert.ok(hard.playable); assert.ok(hard.metrics.changedBeans>0&&hard.metrics.changedBeans<=248);
  assert.equal(hard.metrics.recolorRate,hard.metrics.changedBeans / 1024);
  assert.ok(hard.warnings.some(w => w.includes('未实现全部换色')));
  assert.ok(hard.warnings.some(w => w.includes('较短循环')));
  independentReplay(t, hard);
});
test('existing complex 56x40 cat artwork produces three verified levels without mutating released data', () => {
  const published = getLevel('05'), before = JSON.stringify(published);
  const t = { width: published.width, height: published.height, targetBoard: published.targetBoard,
    palette: [...new Set(published.targetBoard.flat().filter(c => c.active).map(c => c.baseColor))] };
  for (const level of g.generateAll(t)) { assert.ok(level.playable); independentReplay(t, level); }
  assert.equal(JSON.stringify(published), before);
});
test('fragment-only silhouettes fail quality after bounded retries instead of becoming noisy playable levels', () => {
  let seed = 19;
  for (let round = 0; round < 12; round++) {
    const t = target(32, 32, (r, c) => {
      if ((r + c) % 3 === 0 || r >= 8) return null;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 16) % 4;
    });
    for (const level of g.generateAll(t)) {
      if(level.playable){assert.ok(level.quality.passed);independentReplay(t,level);}
      else {assert.equal(level.generation.attempts,6);assert.equal(level.testSolution.length,0);assert.match(level.validation.reason,/错色区域|碎块|噪声/);}
    }
  }
});
test('same input generates identical output and caller data never changes', () => {
  assert.deepEqual(g.generateAll(reference), versions);
  assert.equal(JSON.stringify(reference), referenceBefore);
});
test('single color cannot become an already-solved fake playable level', () => {
  const t = target(32, 32, () => 0), levels = g.generateAll(t);
  for (const level of levels) {
    assert.equal(level.playable, false); assert.equal(level.validation.passed, false);
    assert.equal(level.metrics.recolorRate, 0); assert.match(level.validation.reason, /无法生成/);
  }
  const json = g.exportJSON(t, levels);
  assert.deepEqual(g.parseJSON(json), JSON.parse(json));
});
test('wrong clicks, truncated proofs and nonconserving initial colors cannot pass replay', () => {
  const level = versions[0];
  assert.equal(g.verifySolution(reference, level.initialBoard, [[-1, 0]]).passed, false);
  assert.equal(g.verifySolution(reference, level.initialBoard, level.testSolution.slice(0, -1)).passed, false);
  const wrong = structuredClone(level.initialBoard); wrong[0][0].beanColor = '#000000';
  assert.equal(g.verifySolution(reference, wrong, level.testSolution).passed, false);
  const falsePlayable = structuredClone(versions); falsePlayable[0].testSolution = [];
  assert.throws(() => g.exportJSON(reference, falsePlayable), /导出验证失败/);
});
test('JSON roundtrip preserves target, initial beans, palette, rules, solution and verification exactly', () => {
  const json = g.exportJSON(reference, versions, { crop: { zoom: 2, x: .1, y: -.2 }, sourceName: 'local.png' });
  const parsed = g.parseJSON(json);
  assert.deepEqual(parsed, JSON.parse(json));
  assert.deepEqual(parsed.targetBoard, reference.targetBoard);
  assert.deepEqual(parsed.palette, reference.palette);
  const reordered = JSON.parse(json, (key, value) => key === 'validation'
    ? Object.fromEntries(Object.entries(value).reverse()) : value);
  assert.doesNotThrow(() => g.parseJSON(JSON.stringify(reordered)));
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(parsed.levels[i].initialBoard, versions[i].initialBoard);
    assert.deepEqual(parsed.levels[i].testSolution, versions[i].testSolution);
    independentReplay(parsed, parsed.levels[i]);
  }
});
test('parser rejects tampered proofs, validation flags, layouts, metrics and unsupported schemas', () => {
  const good = g.exportJSON(reference, versions);
  for (const corrupt of [
    data => { data.levels[0].testSolution.pop(); },
    data => { data.levels[0].validation.passed = false; },
    data => { data.levels[0].validation.peakPerTray[0] = 99; },
    data => { data.levels[0].metrics.recolorRate = 1; },
    data => { data.levels[0].metrics.difficultyScore = 999; },
    data => { data.levels[0].initialBoard[0][0].baseColor = '#000000'; },
    data => { data.rules.maxTransfer = 11; },
    data => { data.version = 2; }
  ]) { const data = JSON.parse(good); corrupt(data); assert.throws(() => g.parseJSON(JSON.stringify(data))); }
});
test('invalid targets fail before generation and unknown tiers are rejected', () => {
  assert.throws(() => g.generateAll({}));
  const broken = structuredClone(reference); broken.targetBoard[0][0].beanColor = '#000000';
  assert.throws(() => g.generateAll(broken));
  assert.throws(() => g.generateLevel(reference, 'unknown'));
});
for (const level of versions) console.log('MEASURE', level.difficulty, JSON.stringify({ ...level.metrics,
  clicks: level.validation.clicks, peakTrayTotal: level.validation.peakTrayTotal, passed: level.validation.passed }));

test('cooperative local generation matches synchronous verified levels exactly', async () => {
  const progress = [];
  const actual = await g.generateAllAsync(reference, { yieldControl: () => Promise.resolve(), onProgress: name => progress.push(name) });
  assert.deepEqual(actual, versions);
  assert.deepEqual(progress, ['简单', '普通', '困难']);
});
test('cooperative generation checks cancellation before processing the next tier', async () => {
  let yields = 0;
  await assert.rejects(g.generateAllAsync(reference, {
    yieldControl: async () => { yields++; },
    isCancelled: () => yields >= 2
  }), /已取消/);
  assert.equal(yields, 2);
});
