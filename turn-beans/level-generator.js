/* Construct balanced color cycles, then solve and replay with the production engine. */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.TurnBeans,
    typeof module !== 'undefined' && module.exports ? require('./image-processing.js') : root.TurnBeansImage,
    typeof module !== 'undefined' && module.exports ? require('./region-processing.js') : root.TurnBeansRegions);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TurnBeansGenerator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rules, image, regions) {
  'use strict';
  const { TurnBeansEngine, countColors, MAX_TRANSFER, TRAY_COUNT, TRAY_CAPACITY } = rules;
  const clone = value => JSON.parse(JSON.stringify(value));
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const TIERS = [
    { id: 'easy', name: '简单', cycle: 2, minRegionSize: 6, blockMax: 128, areaDivisor: 8, regionDivisor: 1, fraction: .75, buffer: 10 },
    { id: 'normal', name: '普通', cycle: 3, minRegionSize: 6, blockMax: 64, areaDivisor: 16, regionDivisor: 2, fraction: .9, buffer: 20 },
    { id: 'hard', name: '困难', cycle: 4, minRegionSize: 6, blockMax: 32, areaDivisor: 32, regionDivisor: 4, fraction: 1, buffer: 40 }
  ];
  function validateTarget(target) {
    assert(target && image.supportedSize(target.width, target.height), '目标尺寸不受支持');
    const { width, height, targetBoard, palette } = target;
    assert(Array.isArray(palette) && palette.length > 0 && palette.length <= image.MAX_COLORS &&
      new Set(palette).size === palette.length && palette.every(c => /^#[0-9A-F]{6}$/i.test(c)), '无效调色板');
    assert(Array.isArray(targetBoard) && targetBoard.length === height &&
      targetBoard.every(row => Array.isArray(row) && row.length === width), '目标棋盘尺寸不符');
    let active = 0;
    for (const row of targetBoard) for (const cell of row) {
      assert(cell && typeof cell.active === 'boolean', '无效目标格');
      if (cell.active) {
        active++; assert(palette.includes(cell.baseColor) && cell.beanColor === cell.baseColor, '目标色不在调色板或目标未完成');
      } else assert(cell.baseColor === null && cell.beanColor === null, '无效格不能有豆子');
    }
    assert(active > 0, '没有有效豆子');
    if (target.subject) assert(target.subject.outputActiveCells === active, '主体有效豆数与目标不符');
    return active;
  }
  function validateInitial(target, board) {
    new TurnBeansEngine(board);
    assert(board.length === target.height && board.every(row => row.length === target.width), '初始棋盘尺寸不符');
    board.forEach((row, r) => row.forEach((cell, c) => {
      const expected = target.targetBoard[r][c];
      assert(cell.active === expected.active && cell.baseColor === expected.baseColor &&
        (cell.active ? target.palette.includes(cell.beanColor) : cell.beanColor === null), '初始棋盘布局或豆色不符');
    }));
    assert(JSON.stringify(countColors(board, [[], [], []])) ===
      JSON.stringify(countColors(target.targetBoard, [[], [], []])), '颜色数量不守恒');
  }
  function boardMetrics(target,board) { return regions.metrics(target,board); }
  function qualityFor(metrics,tierId) {
    const tier=TIERS.find(value=>value.id===tierId);
    assert(tier,'未知难度');return regions.quality(metrics,tier);
  }
  function tracker() {
    return { mode: 'TurnBeansEngine.click+autoFillMatchingEmpty', passed: false, clicks: 0,
      automaticOperations: 0, engineOperations: 0, maxTransfer: 0, peakTrayTotal: 0,
      peakPerTray: [0, 0, 0], finalTraysEmpty: false, finalBoardCorrect: false };
  }
  function observe(engine, action, stats) {
    assert(action && action.ok && action.count > 0 && action.count <= MAX_TRANSFER, '引擎点击失败或单次超过 10 颗');
    stats.engineOperations++; stats.maxTransfer = Math.max(stats.maxTransfer, action.count);
    stats.peakTrayTotal = Math.max(stats.peakTrayTotal, engine.trays.flat().length);
    engine.trays.forEach((tray, i) => {
      assert(tray.length <= TRAY_CAPACITY, '备用盘容量超限');
      stats.peakPerTray[i] = Math.max(stats.peakPerTray[i], tray.length);
    });
    assert(engine.trays.length === TRAY_COUNT && !engine.isLost(), '备用盘已满，验证失败');
  }
  function clickAndFill(engine, row, col, stats) {
    observe(engine, engine.click(row, col), stats); stats.clicks++;
    let filled = 0;
    while (!engine.isWon() && !engine.isLost() && filled < TRAY_COUNT * TRAY_CAPACITY) {
      const result = engine.autoFillMatchingEmpty();
      if (!result) break;
      observe(engine, result, stats); stats.automaticOperations++; filled += result.count;
    }
  }
  function finishVerification(engine, target, stats) {
    stats.finalTraysEmpty = engine.trays.every(tray => tray.length === 0);
    stats.finalBoardCorrect = engine.board.every((row, r) => row.every((cell, c) => {
      const expected = target.targetBoard[r][c];
      return cell.active === expected.active && cell.baseColor === expected.baseColor && cell.beanColor === expected.beanColor;
    }));
    assert(engine.isWon() && stats.finalTraysEmpty && stats.finalBoardCorrect, '回放结束后棋盘或备用盘不正确');
    engine.checkInvariants(); stats.passed = true;
    return stats;
  }
  function solve(target, board, tier) {
    const engine = new TurnBeansEngine(board), solution = [], stats = tracker();
    let loading = true;
    while (!engine.isWon()) {
      assert(solution.length < target.width * target.height * 2, '求解操作数超过上限');
      const available = new Set(engine.trays.flat());
      const total = engine.trays.flat().length;
      if (!total) loading = true;
      let pick = null;
      if (loading && total < tier.buffer) {
        for (let r = 0; r < engine.height && !pick; r++) for (let c = 0; c < engine.width; c++) {
          const cell = engine.board[r][c];
          if (cell.active && cell.beanColor && cell.beanColor !== cell.baseColor && !available.has(cell.baseColor)) {
            // Leave room below the engine's 60-bead loss threshold.
            if (total + engine.getConnectedCells(r, c).length < TRAY_COUNT * TRAY_CAPACITY) { pick = [r, c]; break; }
          }
        }
      }
      if (!pick) {
        loading = false;
        for (let r = 0; r < engine.height && !pick; r++) for (let c = 0; c < engine.width; c++) {
          const cell = engine.board[r][c];
          if (cell.active && cell.beanColor !== cell.baseColor && available.has(cell.baseColor)) { pick = [r, c]; break; }
        }
      }
      assert(pick, '无法找到合法下一步');
      clickAndFill(engine, ...pick, stats); solution.push(pick);
    }
    finishVerification(engine, target, stats);
    return solution;
  }
  function verifySolution(target, initialBoard, solution) {
    const stats = tracker();
    try {
      validateTarget(target); validateInitial(target, initialBoard);
      assert(Array.isArray(solution) && solution.length > 0 && solution.length <= target.width * target.height * 2, '缺少有效点击序列');
      const engine = new TurnBeansEngine(initialBoard);
      for (const position of solution) {
        assert(Array.isArray(position) && position.length === 2 && position.every(Number.isInteger) &&
          engine.inBounds(...position), '点击坐标无效');
        clickAndFill(engine, ...position, stats);
      }
      return finishVerification(engine, target, stats);
    } catch (error) { return { ...stats, passed: false, reason: error.message }; }
  }
  function difficultyScore(metrics, validation) {
    return validation.passed ? Number((validation.clicks / metrics.activeBeans * 100 +
      metrics.componentCount / Math.max(1, metrics.changedBeans) * 20 +
      metrics.recolorRate * 20 + validation.peakTrayTotal / 6).toFixed(2)) : null;
  }
  function generateLevel(target, tierId) {
    validateTarget(target);
    const tier = TIERS.find(t => t.id === tierId);
    assert(tier, '未知难度');
    let candidate,metrics,quality,testSolution=[],validation=tracker();
    const rejectedAttempts=[];
    for(let attempt=0;attempt<regions.MAX_ATTEMPTS;attempt++){
      candidate=regions.scramble(target,tier,attempt);
      metrics=boardMetrics(target,candidate.initialBoard);quality=regions.quality(metrics,tier);
      try{
        assert(quality.passed,quality.reasons.join('；'));
        validateInitial(target,candidate.initialBoard);
        testSolution=solve(target,candidate.initialBoard,tier);
        validation=verifySolution(target,candidate.initialBoard,testSolution);
        assert(validation.passed,validation.reason);break;
      }catch(error){
        testSolution=[];validation={...tracker(),passed:false,reason:error.message};
        rejectedAttempts.push({attempt:attempt+1,reason:error.message,qualityPassed:quality.passed});
      }
    }
    const {initialBoard,cycles}=candidate,warnings=[];
    if (metrics.colorCount < tier.cycle) warnings.push('图案仅 ' + metrics.colorCount + ' 色，已降为可用的较短循环');
    if (metrics.changedBeans < metrics.activeBeans) warnings.push('实际换色率 ' + (metrics.recolorRate * 100).toFixed(1) + '%，未实现全部换色');
    const score = difficultyScore(metrics, validation);
    return { id: 'generated-' + tier.id, difficulty: tier.id, name: tier.name,
      width: target.width, height: target.height, initialBoard, testSolution, playable: validation.passed,
      metrics: { ...metrics, difficultyScore: score }, validation, warnings,
      quality, generation: { preferredCycleLength: tier.cycle, chunkSize: candidate.plan.blockSize, cycles,
        algorithm:regions.ALGORITHM,regionPlan:candidate.plan,assignments:candidate.assignments,
        attempts:rejectedAttempts.length+(validation.passed?1:0),rejectedAttempts } };
  }
  function assessLevels(levels) {
    for (let i = 1; i < levels.length; i++) if (levels[i].playable && levels[i - 1].playable &&
      levels[i].metrics.difficultyScore <= levels[i - 1].metrics.difficultyScore) {
      levels[i].warnings.push('此图案的实际难度未高于上一档，请以操作数和连通块指标为准');
    }
    return levels;
  }
  function generateAll(target) {
    return assessLevels(TIERS.map(tier => generateLevel(target, tier.id)));
  }
  async function generateAllAsync(target, options = {}) {
    const levels = [];
    const yieldControl = options.yieldControl || (() => new Promise(resolve => setTimeout(resolve, 0)));
    for (const tier of TIERS) {
      if (options.isCancelled?.()) throw new Error('生成任务已取消');
      options.onProgress?.(tier.name);
      await yieldControl();
      if (options.isCancelled?.()) throw new Error('生成任务已取消');
      levels.push(generateLevel(target, tier.id));
    }
    if (options.isCancelled?.()) throw new Error('生成任务已取消');
    return assessLevels(levels);
  }
  function exportJSON(target, levels, metadata = {}) {
    validateTarget(target);
    assert(Array.isArray(levels) && levels.length === 3, '导出需要三个难度结果');
    const result = { format: 'turn-beans-generator', version: 1, width: target.width, height: target.height,
      palette: clone(target.palette), targetBoard: clone(target.targetBoard), metadata: clone(metadata),
      ...image.rowsForBoard(target.targetBoard, target.palette),
      ...(target.subject ? { subject: clone(target.subject) } : {}),
      rules: { maxTransfer: MAX_TRANSFER, trayCount: TRAY_COUNT, trayCapacity: TRAY_CAPACITY,
        replay: 'click+autoFillMatchingEmpty' }, levels: clone(levels) };
    result.levels.forEach((level, i) => {
      assert(level.difficulty === TIERS[i].id, '难度顺序无效');
      validateInitial(target, level.initialBoard);
      level.initialRows = image.rowsForBoard(level.initialBoard, target.palette).rows;
      if (level.playable) {
        const validation = verifySolution(target, level.initialBoard, level.testSolution);
        assert(validation.passed, '导出验证失败：' + validation.reason);
        level.validation = validation;
      } else level.validation.passed = false;
    });
    return JSON.stringify(result, null, 2);
  }
  function parseJSON(text) {
    const data = JSON.parse(text);
    assert(data.format === 'turn-beans-generator' && data.version === 1, '不支持的生成器格式');
    validateTarget(data);
    if (data.rows !== undefined || data.symbolPalette !== undefined) {
      const encoded = image.rowsForBoard(data.targetBoard, data.palette);
      assert(JSON.stringify(data.rows) === JSON.stringify(encoded.rows) &&
        Object.keys(encoded.symbolPalette).every(key => data.symbolPalette?.[key] === encoded.symbolPalette[key]), '目标 rows 或符号调色板不符');
    }
    assert(data.rules?.maxTransfer === MAX_TRANSFER && data.rules.trayCount === TRAY_COUNT &&
      data.rules.trayCapacity === TRAY_CAPACITY && data.rules.replay === 'click+autoFillMatchingEmpty', '游戏规则不符');
    assert(Array.isArray(data.levels) && data.levels.length === 3, '缺少三档难度');
    data.levels.forEach((level, i) => {
      assert(level.difficulty === TIERS[i].id && level.width === data.width && level.height === data.height &&
        typeof level.playable === 'boolean', '关卡信息不符');
      validateInitial(data, level.initialBoard);
      if (level.initialRows !== undefined) assert(JSON.stringify(level.initialRows) ===
        JSON.stringify(image.rowsForBoard(level.initialBoard, data.palette).rows), '初始 rows 不符');
      const actual = boardMetrics(data, level.initialBoard);
      for (const key of Object.keys(actual)) if(level.generation?.algorithm===regions.ALGORITHM||Object.hasOwn(level.metrics,key))
        assert(JSON.stringify(level.metrics[key])===JSON.stringify(actual[key]),'关卡指标不符');
      if(level.generation?.algorithm===regions.ALGORITHM){
        const actualQuality=qualityFor(actual,level.difficulty);
        assert(JSON.stringify(level.quality)===JSON.stringify(actualQuality),'区域质量指标不符');
        if(level.playable)assert(actualQuality.passed,'噪声化关卡禁止标记可玩');
      }
      if (level.playable) {
        const verified = verifySolution(data, level.initialBoard, level.testSolution);
        assert(verified.passed && Object.keys(verified).every(key =>
          JSON.stringify(verified[key]) === JSON.stringify(level.validation[key])), '关卡验证信息不符');
      } else assert(level.validation.passed === false, '失败版本不得标记为已验证');
      assert(level.metrics.difficultyScore === difficultyScore(actual, level.validation), '难度评分不符');
    });
    return data;
  }
  return { TIERS, validateTarget, boardMetrics, qualityFor, generateLevel, generateAll, generateAllAsync, verifySolution, exportJSON, parseJSON };
});
