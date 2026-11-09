/* Deterministic, browser-local foreground extraction before palette reduction. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TurnBeansSubject = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MODES = ['auto', 'largest', 'all'];
  const assert = (ok, message) => { if (!ok) throw new Error('主体识别失败：' + message); };
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const colorAt = (data, i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  function adjacent(i, w, h, diagonal = false) {
    const r = Math.floor(i / w), c = i % w, result = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if ((!dr && !dc) || (!diagonal && dr && dc)) continue;
      if (r + dr >= 0 && r + dr < h && c + dc >= 0 && c + dc < w) result.push((r + dr) * w + c + dc);
    }
    return result;
  }
  function bounds(positions, width) {
    let left = width, right = -1, top = Infinity, bottom = -1;
    for (const i of positions) {
      const r = Math.floor(i / width), c = i % width;
      left = Math.min(left, c); right = Math.max(right, c); top = Math.min(top, r); bottom = Math.max(bottom, r);
    }
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }
  function components(mask, width, height) {
    const seen = new Uint8Array(mask.length), result = [];
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || seen[start]) continue;
      const positions = [start]; seen[start] = 1;
      for (let head = 0; head < positions.length; head++) for (const next of adjacent(positions[head], width, height, true)) {
        if (mask[next] && !seen[next]) { seen[next] = 1; positions.push(next); }
      }
      result.push({ positions, area: positions.length, box: bounds(positions, width) });
    }
    return result.sort((a, b) => b.area - a.area);
  }
  function estimateBackground({ width, height, data }) {
    const indices = new Set(), depth = Math.max(1, Math.round(Math.min(width, height) * .025));
    // Edge bands plus all four corner patches; no center pixels enter the model.
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
      if (r < depth || c < depth || r >= height - depth || c >= width - depth) indices.add(r * width + c);
    }
    const samples = [...indices], opaque = samples.filter(i => data[i * 4 + 3] >= 64);
    if (opaque.length < samples.length * .5) return { kind: 'alpha', color: null, threshold: 0, support: 1 - opaque.length / samples.length };
    const histogram = new Map();
    for (const i of opaque) {
      const color = colorAt(data, i), key = color.map(n => Math.round(n / 24)).join(',');
      const r = Math.floor(i / width), c = i % width;
      const corner = (r < depth * 2 || r >= height - depth * 2) && (c < depth * 2 || c >= width - depth * 2);
      const entry = histogram.get(key) || { weight: 0, sum: [0, 0, 0] };
      const weight = corner ? 2 : 1;
      entry.weight += weight; color.forEach((n, k) => { entry.sum[k] += n * weight; }); histogram.set(key, entry);
    }
    const dominant = [...histogram.values()].sort((a, b) => b.weight - a.weight)[0];
    const seed = dominant.sum.map(n => n / dominant.weight);
    const nearby = opaque.filter(i => distance(colorAt(data, i), seed) <= 48);
    assert(nearby.length / opaque.length >= .55, '四角与边缘没有稳定背景主色，请调整裁剪保留背景边缘，或使用透明 PNG');
    const color = [0, 1, 2].map(k => Math.round(nearby.reduce((sum, i) => sum + data[i * 4 + k], 0) / nearby.length));
    const deviations = nearby.map(i => distance(colorAt(data, i), color)).sort((a, b) => a - b);
    const threshold = Math.max(28, Math.min(72, deviations[Math.floor(deviations.length * .9)] * 1.8 + 12));
    return { kind: 'color', color, threshold, support: nearby.length / opaque.length };
  }
  function backgroundMask(source, model) {
    const { width, height, data } = source, removed = new Uint8Array(width * height), queue = [];
    const matches = i => data[i * 4 + 3] < 64 ||
      (model.kind === 'color' && distance(colorAt(data, i), model.color) <= model.threshold);
    // Only boundary-connected matching pixels are background: enclosed white
    // eyes and other light foreground details are not deleted by color alone.
    for (let i = 0; i < removed.length; i++) {
      const r = Math.floor(i / width), c = i % width;
      if ((r === 0 || c === 0 || r === height - 1 || c === width - 1) && matches(i)) { removed[i] = 1; queue.push(i); }
    }
    for (let head = 0; head < queue.length; head++) for (const next of adjacent(queue[head], width, height)) {
      if (!removed[next] && matches(next)) { removed[next] = 1; queue.push(next); }
    }
    return Uint8Array.from(removed, (value, i) => !value && data[i * 4 + 3] >= 64 ? 1 : 0);
  }
  function closeMask(mask, width, height) {
    const dilated = mask.slice(), closed = mask.slice();
    for (let i = 0; i < mask.length; i++) if (mask[i]) for (const next of adjacent(i, width, height, true)) dilated[next] = 1;
    for (let i = 0; i < mask.length; i++) {
      const r = Math.floor(i / width), c = i % width;
      if (r && c && r < height - 1 && c < width - 1 &&
        dilated[i] && adjacent(i, width, height, true).every(next => dilated[next])) closed[i] = 1;
    }
    // Union with the original retains narrow ears and limbs; the closing only
    // repairs tiny holes/notches at the higher analysis resolution.
    return closed;
  }
  function selectSubject(source, mode, tolerance) {
    const model = estimateBackground(source);
    if (model.kind === 'color') model.threshold = Math.max(5, Math.min(150, model.threshold + tolerance));
    const raw = backgroundMask(source, model);
    const groups = components(raw, source.width, source.height);
    const minArea = Math.max(3, Math.ceil(raw.length * .0004));
    assert(groups.length && groups[0].area >= minArea, '没有找到足够大的主体；纯背景或低对比度图片无法生成，请重新取景');
    assert(raw.reduce((sum, v) => sum + v, 0) < raw.length * .985, '无法分离背景，请保留背景边缘后重试');
    const noiseLimit = Math.max(minArea, Math.ceil(groups[0].area * .003));
    const candidates = groups.filter(group => group.area >= noiseLimit), main = candidates[0];
    let selected;
    if (mode === 'largest') selected = [main];
    else if (mode === 'all') selected = candidates;
    else selected = candidates.filter(group => {
      if (group === main) return true;
      const gapX = Math.max(0, main.box.x - group.box.x - group.box.width, group.box.x - main.box.x - main.box.width);
      const gapY = Math.max(0, main.box.y - group.box.y - group.box.height, group.box.y - main.box.y - main.box.height);
      return group.area >= main.area * .12 && Math.hypot(gapX, gapY) <= Math.sqrt(main.area) * .5;
    });
    const selectedMask = new Uint8Array(raw.length);
    for (const group of selected) for (const i of group.positions) selectedMask[i] = 1;
    const mask = closeMask(selectedMask, source.width, source.height);
    // Closing may add a few pixels. Extend nearest foreground colors into them,
    // rather than reintroducing the original background into quantization.
    const nearest = new Int32Array(mask.length).fill(-1), queue = [];
    for (let i = 0; i < mask.length; i++) if (selectedMask[i]) { nearest[i] = i; queue.push(i); }
    for (let head = 0; head < queue.length; head++) for (const next of adjacent(queue[head], source.width, source.height, true)) {
      if (mask[next] && nearest[next] === -1) { nearest[next] = nearest[queue[head]]; queue.push(next); }
    }
    const positions = queue.filter(i => mask[i]);
    return { mask, nearest, box: bounds(positions, source.width), info: {
      mode, background: model, sourceWidth: source.width, sourceHeight: source.height,
      candidateComponents: groups.length, keptComponents: selected.length,
      removedComponents: groups.length - selected.length, sourceActivePixels: positions.length
    } };
  }
  function representativeColor(samples) {
    const groups = new Map();
    for (const color of samples) {
      const key = color.map(value => value >> 4).join(',');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(color);
    }
    const group = [...groups.values()].sort((a, b) => b.length - a.length)[0];
    group.sort((a, b) => (.2126 * a[0] + .7152 * a[1] + .0722 * a[2]) - (.2126 * b[0] + .7152 * b[1] + .0722 * b[2]));
    return group[Math.floor((group.length - 1) * .6)];
  }
  function extractSubject(source, options = {}) {
    const { width, height, data } = source || {}, mode = options.mode ?? 'largest';
    assert(Number.isInteger(width) && Number.isInteger(height) && width >= 3 && height >= 3 &&
      width * height <= 512 * 512 && data?.length === width * height * 4, '无效分析像素数据');
    assert(MODES.includes(mode), '未知主体模式');
    const outputWidth = options.width ?? width, outputHeight = options.height ?? height;
    assert(Number.isInteger(outputWidth) && Number.isInteger(outputHeight) && outputWidth >= 8 && outputHeight >= 8 &&
      outputWidth * outputHeight <= 512 * 512, '无效输出尺寸');
    const tolerance = options.backgroundTolerance ?? 0;
    assert(Number.isFinite(tolerance) && tolerance >= -40 && tolerance <= 80, '背景容差超出范围');
    const subject = selectSubject(source, mode, tolerance), { box, nearest } = subject;
    const margin = Math.max(1, Math.round(Math.min(outputWidth, outputHeight) * .05));
    const scale = Math.min((outputWidth - margin * 2) / box.width, (outputHeight - margin * 2) / box.height);
    const renderedWidth = box.width * scale, renderedHeight = box.height * scale;
    const left = (outputWidth - renderedWidth) / 2, top = (outputHeight - renderedHeight) / 2;
    const result = new Uint8ClampedArray(outputWidth * outputHeight * 4), mask = new Uint8Array(outputWidth * outputHeight);
    for (let r = 0; r < outputHeight; r++) for (let c = 0; c < outputWidth; c++) {
      let hits = 0; const sum = [0, 0, 0], observed = [];
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const x = (c + (sx + .5) / 4 - left) / scale, y = (r + (sy + .5) / 4 - top) / scale;
        if (x < 0 || y < 0 || x >= box.width || y >= box.height) continue;
        const index = (box.y + Math.floor(y)) * width + box.x + Math.floor(x);
        if (!subject.mask[index] || nearest[index] < 0) continue;
        const color = colorAt(data, nearest[index]);
        color.forEach((n, k) => { sum[k] += n; }); observed.push(color); hits++;
      }
      if (hits < 4) continue;
      const index = r * outputWidth + c; mask[index] = 1;
      const sampled = options.sampleMode === 'dominant' ? representativeColor(observed) : sum.map(n => Math.round(n / hits));
      result.set([...sampled, 255], index * 4);
    }
    assert(mask.some(Boolean), '主体在当前豆阵尺寸下过小，请重新取景');
    const sourceSamples = [];
    if (options.includeSourceSamples) for (let i = 0; i < subject.mask.length; i++) {
      if (subject.mask[i] && nearest[i] >= 0) sourceSamples.push(colorAt(data, nearest[i]));
    }
    return { width: outputWidth, height: outputHeight, data: result, mask,
      ...(options.includeSourceSamples ? { sourceSamples } : {}),
      info: { ...subject.info, boundingBox: box, outputActiveCells: mask.reduce((sum, v) => sum + v, 0) } };
  }
  return { MODES, estimateBackground, backgroundMask, components, closeMask, extractSubject };
});
