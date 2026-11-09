'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const image = require('./image-processing.js');
function pixels(width = 32, height = 32, paint = (r, c) => r >= 2 && c >= 2 && r < height - 2 && c < width - 2 ? [255, 100, 80, 255] : [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) data.set(paint(r, c), (r * width + c) * 4);
  return { width, height, data };
}
test('accepts JPG, PNG and WebP and rejects unsupported, empty and oversized files', () => {
  for (const type of image.MIME_TYPES) assert.equal(image.validateFile({ type, size: 100 }), true);
  for (const file of [{ type: 'image/gif', size: 10 }, { type: 'image/svg+xml', size: 100 },
    { type: 'image/png', size: 0 }, { type: 'image/webp', size: 26 * 1024 * 1024 }]) assert.throws(() => image.validateFile(file));
});
test('crop covers chosen aspect, scales and pans without reading outside the image', () => {
  assert.deepEqual(image.cropRect(800, 400, 32, 32), { x: 200, y: 0, width: 400, height: 400 });
  assert.deepEqual(image.cropRect(800, 400, 32, 32, { x: 1, y: -1, zoom: 2 }),
    { x: 600, y: 0, width: 200, height: 200 });
  for (const [w, h] of image.SIZES) for (const zoom of [1, 1.5, 4]) for (const x of [-1, 0, 1]) {
    const crop = image.cropRect(600, 900, w, h, { zoom, x, y: -x });
    assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 600.0001 && crop.y + crop.height <= 900.0001);
    assert.ok(Math.abs(crop.width / crop.height - w / h) < 1e-10);
  }
  assert.throws(() => image.cropRect(0, 400, 32, 32));
  assert.throws(() => image.cropRect(600, 400, 32, 32, { zoom: NaN }));
  assert.throws(() => image.cropRect(600, 400, 32, 32, { x: 2 }));
});
test('all three sizes preserve foreground colors, remove background and produce canonical engine cells', () => {
  for (const [w, h] of image.SIZES) {
    const result = image.targetFromPixels(pixels(w, h), { saturationBoost: 0, contrastBoost: 0 });
    assert.deepEqual(result.palette, ['#FF6450']);
    assert.equal(result.targetBoard.length, h); assert.equal(result.targetBoard[0].length, w);
    assert.deepEqual(result.targetBoard[10][10], { active: true, baseColor: '#FF6450', beanColor: '#FF6450' });
    assert.deepEqual(result.targetBoard[0][0], { active: false, baseColor: null, beanColor: null });
  }
});
test('palette reduction is deterministic, bounded and keeps visibly distinct subject colors', () => {
  const input = pixels(40, 40, (r, c) => r >= 4 && c >= 4 && r < 36 && c < 36 ? [r * 6, c * 6, (r + c) * 3, 255] : [255, 255, 255, 255]);
  const result = image.targetFromPixels(input, { maxColors: 6 });
  assert.ok(result.palette.length > 2 && result.palette.length <= 6);
  assert.deepEqual(image.targetFromPixels(input, { maxColors: 6 }), result);
  for (const cell of result.targetBoard.flat()) if (cell.active) assert.ok(result.palette.includes(cell.baseColor));
});
test('transparent background is inactive, opaque white is retained, transparent image fails clearly', () => {
  const result = image.targetFromPixels(pixels(32, 32, (r, c) => r > 5 && c > 5 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
  assert.deepEqual(result.targetBoard[0][0], { active: false, baseColor: null, beanColor: null });
  assert.equal(result.targetBoard[10][10].baseColor, '#FFFFFF');
  assert.throws(() => image.targetFromPixels(pixels(32, 32, () => [0, 0, 0, 0])), /主体识别失败/);
});
test('cleanup removes an isolated near-color speck without erasing high contrast facial details', () => {
  const colors = Array(25).fill('#F0F0F0'); colors[12] = '#E0E0E0';
  assert.equal(image.cleanSpeckles(colors, 5, 5)[12], '#F0F0F0');
  assert.equal(colors[12], '#E0E0E0', 'input must not be mutated');
  colors[12] = '#111111';
  assert.equal(image.cleanSpeckles(colors, 5, 5)[12], '#111111');
  colors[0] = null; assert.equal(image.cleanSpeckles(colors, 5, 5)[0], null);
});
test('cleanup switch exposes raw reduced colors and input data is never changed', () => {
  const input = pixels(32, 32, (r, c) => r < 2 || c < 2 || r >= 30 || c >= 30 ? [255, 255, 255, 255] : r === 15 && c === 15 ? [224, 100, 100, 255] : [240, 100, 100, 255]);
  const before = input.data.slice();
  const raw = image.targetFromPixels(input, { cleanup: false }), clean = image.targetFromPixels(input);
  assert.equal(raw.palette.length, 2); assert.equal(clean.palette.length, 1); assert.deepEqual(input.data, before);
});
test('malformed dimensions, sample lengths and palette options are rejected', () => {
  assert.throws(() => image.targetFromPixels(pixels(16, 16)));
  assert.throws(() => image.targetFromPixels({ width: 32, height: 32, data: [] }));
  for (const maxColors of [0, 1, 17, NaN, 2.5]) assert.throws(() => image.targetFromPixels(pixels(), { maxColors }));
});

test('padding with inactive cells cannot change the foreground-only speck rarity calculation', () => {
  function colors(width, height, offset) {
    const values = Array(width * height).fill(null);
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) values[(r + offset) * width + c + offset] = '#F0F0F0';
    for (const [r, c] of [[2, 2], [5, 5], [7, 7]]) values[(r + offset) * width + c + offset] = '#E0E0E0';
    return image.cleanSpeckles(values, width, height);
  }
  const small = colors(10, 10, 0), padded = colors(100, 100, 30);
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) assert.equal(padded[(r + 30) * 100 + c + 30], small[r * 10 + c]);
  assert.equal(padded[32 * 100 + 32], '#E0E0E0');
  assert.equal(padded[0], null);
});
