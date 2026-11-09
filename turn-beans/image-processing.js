/* Browser-local sampling and palette reduction; no DOM or network dependency. */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./subject-extraction.js') : root.TurnBeansSubject,
    typeof module !== 'undefined' && module.exports ? require('./color-processing.js') : root.TurnBeansColor,
    typeof module !== 'undefined' && module.exports ? require('./bead-grid.js') : root.TurnBeansGrid);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TurnBeansImage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (subject, colorTools, beadGrid) {
  'use strict';
  const recognitionCache = new WeakMap();
  const SIZES = [[32, 32], [40, 40], [56, 40]];
  const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  function validateFile(file) {
    assert(file && MIME_TYPES.includes(file.type), '请选择 JPG、PNG 或 WebP 图片');
    assert(file.size > 0 && file.size <= 25 * 1024 * 1024, '图片须大于 0 且不超过 25 MB');
    return true;
  }
  function cropRect(imageWidth, imageHeight, width, height, options = {}) {
    assert([imageWidth, imageHeight, width, height].every(n => Number.isFinite(n) && n > 0), '无效图片尺寸');
    const zoom = options.zoom ?? 1, x = options.x ?? 0, y = options.y ?? 0;
    assert(Number.isFinite(zoom) && zoom >= 1 && zoom <= 4 &&
      [x, y].every(n => Number.isFinite(n) && n >= -1 && n <= 1), '无效裁剪参数');
    const region = options.subjectRect ?? { x: 0, y: 0, width: 1, height: 1 };
    assert(region && ['x','y','width','height'].every(key=>Number.isFinite(region[key])) &&
      region.x>=0 && region.y>=0 && region.width>0 && region.height>0 &&
      region.x+region.width<=1.000001 && region.y+region.height<=1.000001, '无效主体框选范围');
    const rw=imageWidth*region.width,rh=imageHeight*region.height;
    const scale = Math.max(width / rw, height / rh) * zoom;
    const sw = width / scale, sh = height / scale;
    return { x: imageWidth*region.x+(rw-sw)*(x+1)/2, y: imageHeight*region.y+(rh-sh)*(y+1)/2, width: sw, height: sh };
  }
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const hex = color => '#' + color.map(n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const distance = (a, b) => a.reduce((sum, n, i) => sum + (n - b[i]) ** 2, 0);
  function neighbors(index, width, height) {
    const row = Math.floor(index / width), col = index % width, result = [];
    if (row) result.push(index - width);
    if (col + 1 < width) result.push(index + 1);
    if (row + 1 < height) result.push(index + width);
    if (col) result.push(index - 1);
    return result;
  }
  function cleanSpeckles(colors, width, height) {
    const output = colors.slice(), seen = new Set(), totals = new Map();
    for (const color of colors) if (color) totals.set(color, (totals.get(color) || 0) + 1);
    const activeCount = [...totals.values()].reduce((sum, count) => sum + count, 0);
    for (let start = 0; start < colors.length; start++) {
      const color = colors[start];
      if (!color || seen.has(start)) continue;
      const group = [start], boundary = new Map(); seen.add(start);
      for (let head = 0; head < group.length; head++) for (const next of neighbors(group[head], width, height)) {
        if (colors[next] === color && !seen.has(next)) { seen.add(next); group.push(next); }
        else if (colors[next] && colors[next] !== color) boundary.set(colors[next], (boundary.get(colors[next]) || 0) + 1);
      }
      // Keep high contrast eyes, outlines, thin details and transparent boundaries.
      if (group.length > 2 || totals.get(color) > Math.max(2, activeCount * .005)) continue;
      const ranked = [...boundary].sort((a, b) => b[1] - a[1]);
      if (!ranked.length || ranked[0][1] < 3 || ranked[0][1] < [...boundary.values()].reduce((a, b) => a + b, 0) * .75) continue;
      if (colorTools.family(rgb(color)) !== colorTools.family(rgb(ranked[0][0])) ||
          colorTools.deltaE(rgb(color), rgb(ranked[0][0])) > 8) continue;
      for (const index of group) output[index] = ranked[0][0];
    }
    return output;
  }
  function supportedSize(width, height) {
    return Number.isInteger(width) && Number.isInteger(height) && width >= 8 && height >= 8 && width <= 80 && height <= 80 && width * height <= 4096;
  }
  function resizeAnalysis(source, width, height) {
    const scale = Math.min(1, width * 4 / source.width, height * 4 / source.height);
    if (scale === 1) return source;
    const w = Math.max(3, Math.round(source.width * scale)), h = Math.max(3, Math.round(source.height * scale));
    const data = new Uint8ClampedArray(w * h * 4);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const x = Math.min(source.width - 1, Math.floor((c + .5) * source.width / w));
      const y = Math.min(source.height - 1, Math.floor((r + .5) * source.height / h));
      data.set(source.data.slice((y * source.width + x) * 4, (y * source.width + x) * 4 + 4), (r * w + c) * 4);
    }
    return { width: w, height: h, data };
  }
  function targetFromPixels(source, options = {}) {
    const requestedMode = options.imageMode ?? 'ordinary';
    assert(['auto', 'bead-lock', 'ordinary'].includes(requestedMode), '未知图片模式');
    let recognition = {type:'ordinary',mode:'ordinary',confidence:null,reason:'手动选择普通图片'};
    if (requestedMode !== 'ordinary') {
      let detected = options.cacheRecognition ? recognitionCache.get(source) : null;
      if (!detected) { detected = beadGrid.classify(source); if (options.cacheRecognition) recognitionCache.set(source, detected); }
      if (requestedMode === 'bead-lock' || detected.type === 'beads') {
        const result = beadGrid.restore(source, {detection:detected.grid || {reliable:false,reason:detected.reason},
          ...(options.nativeGrid === false ? {width:options.width,height:options.height} : {}),
          centerTolerance:options.centerTolerance});
        result.imageRecognition.requestedMode = requestedMode;
        return result;
      }
      recognition = {...detected,grid:undefined,mode:'ordinary',requestedMode};
    }
    const width = options.width ?? source?.width, height = options.height ?? source?.height;
    assert(SIZES.some(([w, h]) => w === width && h === height), '不支持的豆阵尺寸');
    source = resizeAnalysis(source, width, height);
    const extracted = subject.extractSubject(source, { width, height, mode: options.subjectMode ?? 'largest', backgroundTolerance: options.backgroundTolerance, sampleMode: 'dominant', includeSourceSamples: true });
    const data = extracted.data;
    const maxColors = options.maxColors ?? 8;
    assert(Number.isInteger(maxColors) && maxColors >= 2 && maxColors <= 16, '调色板须为 2–16 色');
    const samples = [], offsets = [];
    for (let i = 0; i < width * height; i++) {
      if (data[i * 4 + 3] < 64) continue;
      samples.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]); offsets.push(i);
    }
    assert(samples.length > 0, '裁剪区域中没有可用像素，请调整图片位置');
    const model = colorTools.quantize(extracted.sourceSamples, maxColors, options);
    const alternatives = model.candidates.map(candidate => {
      const rawRGB = candidate.rawPalette.map(rgb);
      let colors = Array(width * height).fill(null);
      samples.forEach((sample, i) => { colors[offsets[i]] = candidate.corrected[colorTools.nearest(sample, rawRGB)]; });
      if (options.cleanup !== false) colors = cleanSpeckles(colors, width, height);
      const used = [...new Set(candidate.corrected)].filter(color => colors.includes(color));
      const quality = colorTools.report(extracted.sourceSamples, samples, offsets.map(i => colors[i]), used, options);
      const vivid = model.config.colorMode !== 'original' || quality.saturationRatio >= .98;
      const score = (quality.passed ? 1000000 : 0) + quality.retainedFamilies * 10000 +
        (vivid ? 1000 : 0) - quality.meanDeltaE - quality.p95DeltaE * .1 - Math.abs(quality.meanLightnessShift) * .2;
      return { colors, used, quality, score };
    }).sort((a, b) => b.score - a.score);
    const { colors, used, quality } = alternatives[0];
    const targetBoard = Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => {
      const color = colors[r * width + c];
      return { active: color !== null, baseColor: color, beanColor: color };
    }));
    return { width, height, palette: used, targetBoard, subject: extracted.info, imageRecognition: recognition,
      colorOptions: model.config, colorQuality: quality,
      subjectMask: Array.from(extracted.mask), subjectPixels: Array.from(extracted.data) };
  }
  function rowsForBoard(board, palette) {
    const symbols = colorTools.COLOR_SYMBOLS;
    assert(Array.isArray(palette) && palette.length <= symbols.length, '调色板过大');
    return { symbolPalette: Object.fromEntries(palette.map((color, i) => [symbols[i], color])),
      rows: board.map(row => row.map(cell => {
        if (!cell.active) return '.';
        const index = palette.indexOf(cell.beanColor);
        assert(index >= 0, '豆色不在调色板');
        return symbols[index];
      }).join('')) };
  }
  return { COLOR_SYMBOLS: colorTools.COLOR_SYMBOLS, MAX_COLORS: colorTools.MAX_COLORS, paletteStatus: colorTools.paletteStatus, SIZES, MIME_TYPES, validateFile, cropRect, cleanSpeckles, targetFromPixels, neighbors, rowsForBoard, supportedSize, colorSettings: colorTools.settings };
});
