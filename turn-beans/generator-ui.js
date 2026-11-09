/* Independent editor; never reads or writes the released game's progress. */
(() => {
  'use strict';
  const { validateFile, cropRect, targetFromPixels, paletteStatus } = window.TurnBeansImage;
  const $ = id => document.getElementById(id);
  const ids = ['easy', 'normal', 'hard'];
  let loadedImage = null, imageURL = null, sourceName = '', target = null, levels = null;
  let publisherUI = null, createdAt = null, analysisData = null, analysisKey = '', selectedCell = null;
  let manualSubject = null, selectingSubject = false, keepHighColors = false;
  let worker = null, revision = 0, uploadRevision = 0, timer = null, dragging = null;
  const sample = document.createElement('canvas');
  function status(message, error = false) {
    $('status').textContent = message; $('status').classList.toggle('error', error);
  }
  function variantStatus(message) {
    for (const id of ids) $(id + 'Info').textContent = message;
  }
  function generationFailed(message) {
    cancelGeneration();
    $('structureStatus').textContent = '三档目标一致性：未验证（生成失败）。';
    variantStatus('生成失败 · 未验证，不可玩。' + message);
    status(message, true);
  }
  function options() {
    return { zoom: Number($('zoom').value), x: Number($('positionX').value), y: Number($('positionY').value), ...(manualSubject ? {subjectRect:manualSubject} : {}) };
  }
  function dimensions() { return $('size').value === 'native' ? [32, 32] : $('size').value.split('x').map(Number); }
  function cropDimensions() { const value=$('cropAspect').value; if(value==='square')return [1,1]; if(value==='landscape')return [4,3]; if(value==='portrait')return [3,4]; return $('size').value === 'native' && loadedImage ? [loadedImage.naturalWidth*(manualSubject?.width??1), loadedImage.naturalHeight*(manualSubject?.height??1)] : dimensions(); }
  function cancelGeneration() {
    revision++; clearTimeout(timer); timer = null;
    if (worker) worker.terminate();
    worker = null; levels = null; $('export').disabled = true; publisherUI?.refreshReady();
    $('structureStatus').textContent = '三档目标一致性：尚未验证。';
    for (const id of ids) {
      const canvas = $(id); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      $(id + 'Info').textContent = loadedImage ? '尚未生成 · 未验证' : '上传后生成';
    }
  }
  function renderBoard(canvas, board) {
    window.TurnBeansPreview.drawBoard(canvas, board, {beads: $('beads').checked});
  }

  function drawCropPreview(selection = null) {
    const [cw,ch]=cropDimensions(),crop=cropRect(loadedImage.naturalWidth,loadedImage.naturalHeight,cw,ch,options());
    const canvas=$('crop');canvas.width=560;canvas.height=Math.round(560*ch/cw);
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(loadedImage,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
    if(selection){
      ctx.strokeStyle='#48759B';ctx.lineWidth=3;
      ctx.strokeRect(selection.x*canvas.width,selection.y*canvas.height,selection.width*canvas.width,selection.height*canvas.height);
    }
    return crop;
  }
  function subjectSelectionMode(enabled) {
    selectingSubject=enabled;dragging=null;$('selectSubject').textContent=enabled?'取消框选':'手动框选主体';
    $('crop').classList.toggle('selecting-subject',enabled);
  }
  function beginSubjectSelection() {
    if(!loadedImage)return;
    if(selectingSubject){subjectSelectionMode(false);update();return;}
    cancelGeneration();subjectSelectionMode(true);$('paletteActions').hidden=true;$('manualEditor').hidden=true;
    $('targetStatus').textContent='目标图：正在框选主体，原预览仅供参考。';
    variantStatus('正在编辑主体 · 请在裁剪窗口拖框，完成后重新验证');
    status('请在裁剪窗口拖出主体矩形，避开横幅、彩纸及奖励图标。松开后自动提取框内最大主体。');
    $('crop').scrollIntoView?.({block:'center'});
  }
  function normalizedPoint(event,rect){
    return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
  }
  function selectedRect(start,end){
    return {x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(start.x-end.x),height:Math.abs(start.y-end.y)};
  }
  function finishSubjectSelection(event) {
    const state=dragging,area=selectedRect(state.start,normalizedPoint(event,state.rect)),crop=state.crop;
    if(area.width*crop.width<16||area.height*crop.height<16){
      dragging=null;drawCropPreview();status('主体框选过小，请拖出至少 16×16 原图像素的矩形。',true);return;
    }
    manualSubject={x:(crop.x+area.x*crop.width)/loadedImage.naturalWidth,y:(crop.y+area.y*crop.height)/loadedImage.naturalHeight,
      width:area.width*crop.width/loadedImage.naturalWidth,height:area.height*crop.height/loadedImage.naturalHeight};
    subjectSelectionMode(false);analysisData=null;analysisKey='';
    $('zoom').value=1;$('positionX').value=0;$('positionY').value=0;
    $('clearSelection').disabled=false;
    $('subjectSelectionInfo').textContent='已框选主体：'+Math.round(manualSubject.width*loadedImage.naturalWidth)+' × '+
      Math.round(manualSubject.height*loadedImage.naturalHeight)+' 原图像素；仅统计框内提取后的主体颜色。';
    update();
  }
  function renderPaletteStrategy() {
    const policy=paletteStatus(target.palette.length,{confirmed:keepHighColors});
    const strategies={preserve:'保留原色与层次','family-16':'按色系合并到 16 色',manual:'人工修正'};
    const detected=target.sourcePalette?.length??target.palette.length;
    $('targetStatus').textContent='目标图：生成成功 · 主体外 inactive。';
    $('paletteStrategy').textContent='检测色数：'+detected+' · 当前色数：'+target.palette.length+' · 推荐色数：'+policy.recommendedColors+
      ' · 当前生成策略：'+(strategies[target.colorStrategy]||'普通图片量化')+
      (policy.overRecommended?' · 超过推荐色数，允许保留原色继续验证。':'')+
      (policy.requiresConfirmation?' 超过 24 色，建议简化或合并；也可明确选择保留后尝试引擎验证。':'');
    $('paletteActions').hidden=!target.locked||!policy.overRecommended;
    return policy;
  }

  function clearSubject() {
    for (const id of ['subjectMask', 'subjectExtract']) {
      const canvas = $(id); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
    $('targetStatus').textContent='目标图：尚未生成。';$('paletteActions').hidden=true;
    $('paletteStrategy').textContent='检测色数：等待主体提取 · 推荐色数：16。';
    $('subjectInfo').textContent = '没有有效主体；请调整取景或主体模式。';
    $('colorStatus').textContent = '保色指标：没有有效目标图。'; $('colorComparison').replaceChildren();
    $('recognitionInfo').textContent = '尚未完成可靠豆阵识别。'; $('gridInfo').textContent = '尚未检测豆阵。';
    $('reviewInfo').textContent = '待检查位置：暂无。'; $('manualEditor').hidden = true; $('lockedComparison').hidden = true;
    selectedCell = null; $('applyCell').disabled = true;
  }
  function renderSubject() {
    const maskCanvas = $('subjectMask'), extractCanvas = $('subjectExtract'), cell = 8;
    for (const canvas of [maskCanvas, extractCanvas]) { canvas.width = target.width * cell; canvas.height = target.height * cell; }
    const maskContext = maskCanvas.getContext('2d'), extractContext = extractCanvas.getContext('2d');
    for (let i = 0; i < target.subjectMask.length; i++) {
      if (!target.subjectMask[i]) continue;
      const x = i % target.width * cell, y = Math.floor(i / target.width) * cell;
      maskContext.fillStyle = '#70566A'; maskContext.fillRect(x, y, cell, cell);
      const rgb = target.subjectPixels.slice(i * 4, i * 4 + 3);
      extractContext.fillStyle = 'rgb(' + rgb.join(',') + ')'; extractContext.fillRect(x, y, cell, cell);
    }
    const subject = target.subject;
    $('subjectInfo').textContent = '已去背景并居中 · 保留 ' + subject.keptComponents + ' 个主体块 · 去除 ' +
      subject.removedComponents + ' 个碎块 · ' + subject.outputActiveCells + ' 颗有效豆。';
  }
  function syncColorControls(locked) {
    for (const id of ['colorMode','saturationBoost','contrastBoost','colors','cleanup','subjectMode','backgroundTolerance']) $(id).disabled = locked;
    $('lockNotice').hidden = !locked;
    $('centerTolerance').disabled = !locked && $('imageMode').value !== 'bead-lock';
  }
  function renderRecognition() {
    const locked = !!target.locked, info = target.imageRecognition;
    syncColorControls(locked);$('manualEditor').hidden = !locked;$('lockedComparison').hidden = !locked;
    const names = {beads:'规则拼豆图',photo:'普通照片（启发式）',illustration:'插画（启发式）',uncertain:'图片类型未确认',ordinary:'普通图片'};
    $('recognitionInfo').textContent = (names[info?.type] || '普通图片') + ' · ' +
      (locked ? '主体中心色采样完成；保留原色层次，仍请检查轮廓与遮挡。' : '使用普通图片处理；可以手动切换。') +
      (Number.isFinite(info?.confidence) ? ' 检测分数 ' + (info.confidence * 100).toFixed(1) + '%（不是实测准确率）' : '');
    $('colorComparisonLabel').textContent = locked ? '原图豆子中心色 → target（ΔE76 越小越接近）' : '原图主体主色 → target 主色（ΔE76 越小越接近）';
    if (!locked) {
      $('gridInfo').textContent = info?.requestedMode === 'auto' ? '原豆阵未可靠确认：' + info.reason : '普通模式不宣称恢复原豆阵。';
      $('reviewInfo').textContent = '可通过原图对照检查，必要时手动切换图片模式。'; return;
    }
    const grid = target.beadGrid;
    $('gridInfo').textContent = '检测豆阵 ' + grid.columns + ' 列 × ' + grid.rows + ' 行 · 间距 ' +
      grid.pitchX.toFixed(2) + ' × ' + grid.pitchY.toFixed(2) + ' 分析像素 · 有效豆 ' + target.subject.outputActiveCells + ' · 候选颜色 ' + target.palette.length;
    const review = grid.reviewCells.map(cell => '(' + (cell.row + 1) + ',' + (cell.col + 1) + ')');
    $('reviewInfo').textContent = '需要人工检查 ' + review.length + ' 处：' + (review.slice(0,30).join('、') || '未发现明显低置信位置，仍建议检查轮廓和空洞。') +
      (review.length > 30 ? ' …' : '') + (target.manualCorrectionCount ? ' · 已人工修正 ' + target.manualCorrectionCount + ' 项' : '');
    renderBoard($('restored'), target.targetBoard);
    const overlay = $('gridOverlay'); overlay.width = sample.width; overlay.height = sample.height;
    const ctx = overlay.getContext('2d'); ctx.drawImage(sample,0,0);
    target.targetBoard.forEach((row,r) => row.forEach((cell,c) => {
      if (!cell.active) return;
      const x = grid.offsetX + (c - grid.paddingX + grid.startCol) * grid.pitchX;
      const y = grid.offsetY + (r - grid.paddingY + grid.startRow) * grid.pitchY;
      ctx.beginPath(); ctx.arc(x,y,Math.max(1,grid.pitchX*.1),0,Math.PI*2);
      ctx.strokeStyle = grid.reviewCells.some(item => item.row===r && item.col===c) ? '#F08B24' : '#25A36ACC'; ctx.lineWidth=1;ctx.stroke();
    }));
    const original = document.createDocumentFragment(), editable = document.createDocumentFragment();
    for (const value of target.sourcePalette) { const swatch=document.createElement('span');swatch.className='swatch';swatch.style.backgroundColor=value;swatch.title=value;original.append(swatch); }
    for (const value of target.palette) {
      const picker=document.createElement('input');picker.type='color';picker.value=value;picker.title='修正 '+value;picker.setAttribute('aria-label','修正调色板 '+value);
      picker.addEventListener('change',()=>applyManual({paletteChanges:{[value]:picker.value}}));editable.append(picker);
    }
    $('sourcePalette').replaceChildren(original);$('editablePalette').replaceChildren(editable);
  }
  function presentTarget() {
    renderSubject();renderTarget();renderRecognition();
    status(target.locked ? '已按原豆阵中心色还原，正在准备三档真实引擎验证…' : '主体已提取，准备只对有效豆子验证三档难度…');
    const policy=renderPaletteStrategy();
    if (policy.requiresConfirmation) {
      $('structureStatus').textContent='三档目标一致性：未开始验证（等待选择颜色处理策略）。';
      variantStatus('目标图已生成 · 当前 '+target.palette.length+' 色，超过推荐色数；请选择保留、合并或重新框选。尚未验证，不可玩。');
      status('目标图生成成功：当前 '+target.palette.length+' 色，超过推荐色数。请使用下方按钮保留当前色数继续生成、按色系合并到16色，或返回框选主体。当前不可玩、不可导出。');
      return;
    }
    variantStatus('准备生成 · 尚未验证');
    const id=revision;timer=setTimeout(()=>{if(id===revision)startWorker(id);},450);
  }
  function applyManual(changes) {
    if (!target?.locked) return;
    try { const next=window.TurnBeansGrid.edit(target,changes);cancelGeneration();keepHighColors=false;target=next;presentTarget(); }
    catch(error) {status('修正失败，原 target 保留：'+error.message,true);}
  }
  function renderTarget() {
    renderBoard($('target'), target.targetBoard);
    renderColorQuality();
    const fragment = document.createDocumentFragment();
    for (const color of target.palette) {
      const swatch = document.createElement('span'); swatch.className = 'swatch';
      swatch.style.backgroundColor = color; swatch.title = color; swatch.setAttribute('aria-label', color); fragment.append(swatch);
    }
    $('palette').replaceChildren(fragment);
    const active = target.targetBoard.flat().filter(cell => cell.active).length;
    $('targetInfo').textContent = target.width + ' × ' + target.height + ' · ' + active + ' 颗有效豆 · ' + target.palette.length + ' 色';
  }
  function renderColorQuality() {
    const quality = target.colorQuality, labels = {black:'黑', 'dark-gray':'深灰', 'light-gray':'浅灰', white:'白', red:'红', orange:'橙', yellow:'黄', green:'绿', cyan:'青', blue:'蓝', purple:'紫', pink:'粉'};
    $('colorStatus').textContent = '保色指标：' + (quality.passed ? '达标' : '需调整') +
      ' · 平均 ΔE76 ' + quality.meanDeltaE + ' · 主色 ' + quality.retainedFamilies + '/' + quality.majorFamilies +
      ' · 饱和度 ' + Math.round(quality.saturationRatio * 100) + '%（相对' + (target.locked ? '原图豆子中心色' : '主体原色') + '）' +
      (quality.passed ? '' : target.locked ? ' · 建议检查标记位置、修正调色板或调整中心聚类容差' : ' · 建议增加色数/尺寸或降低增强');
    $('colorStatus').classList.toggle('quality-warning', !quality.passed);
    const fragment = document.createDocumentFragment();
    for (const entry of quality.dominantColors) {
      const row = document.createElement('div'), label = document.createElement('span');
      label.textContent = labels[entry.family] + ' · ΔE ' + entry.deltaE; row.append(label);
      for (const color of [entry.sourceColor, entry.targetColor]) {
        const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.backgroundColor = color;
        swatch.title = color; swatch.setAttribute('aria-label', color); row.append(swatch);
      }
      fragment.append(row);
    }
    $('colorComparison').replaceChildren(fragment);
  }
  function renderLevels() {
    if (!levels) return;
    for (const level of levels) {
      const canvas=$(level.difficulty);
      if(level.playable&&level.quality?.passed!==false)renderBoard(canvas,level.initialBoard);
      else canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
      const container = $(level.difficulty + 'Info'), badge = document.createElement('span');
      badge.className = 'badge' + (level.playable ? '' : ' fail');
      badge.textContent = level.playable ? '回放通过 · 可玩' : '生成失败 · 不可玩';
      const { metrics: m, validation: v } = level, dl = document.createElement('dl');
      const cycleCounts = level.generation.cycles.reduce((counts, cycle) => {
        counts[cycle.colors.length] = (counts[cycle.colors.length] || 0) + 1; return counts;
      }, {});
      const metrics = [
        ['实际循环', Object.entries(cycleCounts).map(([size, count]) => size + '色×' + count).join(' · ') || '—'],
        ['换色比例', (m.recolorRate * 100).toFixed(1) + '% (' + m.changedBeans + '/' + m.activeBeans + ')'],
        ['有效豆 / 颜色', m.activeBeans + ' / ' + m.colorCount],
        ['点击数 / 总操作', v.clicks + ' / ' + v.engineOperations],
        ['错色区域数 / 平均块大小', m.componentCount + ' / ' + m.meanComponentSize.toFixed(1)],
        ['最大错色连通块', m.largestComponent],
        ['备用盘总峰值', v.peakTrayTotal + ' / 60'],
        ['各盘峰值', v.peakPerTray.join(' · ') + ' / 各20'],
        ['单点 / 双点碎块', (m.singletonComponentCount??0)+' / '+(m.doubletonComponentCount??0)],
        ['碎块占比（块数 / 错色豆数）', ((m.singleDoubleComponentRatio??0)*100).toFixed(2)+'% / '+((m.singleDoubleBeanRatio??0)*100).toFixed(2)+'%'],
        ['错色块大小分布', Object.entries(m.wrongComponentSizeHistogram||{}).map(([size,count])=>size+'格×'+count).join(' · ')||'—'],
        ['区域质量 / 尝试次数', (level.quality?.passed?'通过':'未通过')+' / '+(level.generation.attempts??1)],
        ['实际难度分', m.difficultyScore ?? '—']
      ];
      for (const [key, value] of metrics) {
        const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = key; dd.textContent = String(value); row.append(dt, dd); dl.append(row);
      }
      container.replaceChildren(badge, dl);
      if(level.playable&&m.pairComponentDistribution){
        const details=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('div');
        summary.textContent='查看 (底色, 豆色) 连通块分布';details.append(summary,list);
        for(const pair of m.pairComponentDistribution){
          const row=document.createElement('p');row.textContent=pair.baseColor+' → '+pair.beanColor+'：'+pair.sizes.join(' / ')+' 格'+(pair.wrong?'（错色）':'（正确）');list.append(row);
        }
        container.append(details);
      }
      const notes = [...level.warnings];
      if (!level.playable) notes.unshift(v.reason || '未完成真实引擎验证');
      for (const message of notes) { const p = document.createElement('p'); p.className = 'warning'; p.textContent = message; container.append(p); }
    }
  }
  function startWorker(id, forceLocal = false) {
    const local = forceLocal || window.location?.protocol === 'file:' || typeof Worker !== 'function';
    variantStatus('正在生成并进行真实引擎回放 · 完成前不可玩');
    try {
      const runner = local ? window.TurnBeansGeneratorClient.createLocalRunner() : new Worker('./generator-worker.js');
      worker = runner;
      runner.onmessage = event => {
        if (worker !== runner || event.data.id !== revision || id !== revision) return;
        const result = event.data;
        if (result.type === 'progress') status(result.message);
        if (result.type === 'generated') {
          if(!Array.isArray(result.levels)||result.levels.length!==3){generationFailed('生成结果不完整，未验证不可玩。');return;}
          levels=result.levels.map(level=>level.playable&&!level.quality?.passed?{...level,playable:false,
            validation:{...level.validation,passed:false,reason:'区域质量检查未通过，禁止展示噪声化结果'}}:level);
          renderLevels(); $('export').disabled = !levels.every(level => level.playable); publisherUI?.refreshReady();
          const count = levels.filter(level => level.playable).length;
          const sameTarget = levels.length === 3 && levels.every(item => item.validation.passed &&
            item.initialBoard.length === target.height && item.initialBoard.every((row, r) => row.length === target.width &&
              row.every((cell, c) => cell.active === target.targetBoard[r][c].active && cell.baseColor === target.targetBoard[r][c].baseColor &&
                (!cell.active || target.palette.includes(cell.beanColor)))));
          $('structureStatus').textContent = sameTarget ? '三档目标一致：已验证；只改变初始豆色与玩法结构。' : '三档目标一致性：尚未通过验证。';
          status('已完成：' + count + '/3 档真实引擎回放通过。' + (count < 3 ? '失败版本禁止导出或发布，请调整图片。' : '区域质量与回放均通过，可导出 JSON；不会加入正式关卡。'), count < 3);
        }
        if (result.type === 'exported') {
          const blobURL = URL.createObjectURL(new Blob([result.json], { type: 'application/json' }));
          const link = document.createElement('a'); link.href = blobURL;
          link.download = 'turn-beans-' + target.width + 'x' + target.height + '.json';
          document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
          $('export').disabled = false; status('JSON 已导出，并已重新解析及回放校验。');
        }
        if (result.type === 'error') {
          // Terminate this task as well as invalidating all previous results.
          generationFailed('生成或导出失败：' + result.message);
        }
      };
      runner.onerror = () => {
        if (worker !== runner || id !== revision) return;
        runner.terminate();
        if (!local) { startWorker(id, true); return; }
        generationFailed('本地生成模块无法运行，请重新打开页面后重试。');
      };
      if (local) status('正在本机生成并验证三档难度，大图案可能需要稍等…');
      runner.postMessage({ id, type: 'generate', target });
    } catch (error) {
      if (!local) { if (worker) worker.terminate(); startWorker(id, true); return; }
      generationFailed('无法启动本地生成器：' + error.message);
    }
  }
  function update() {
    syncColorControls($('imageMode').value === 'bead-lock');
    $('centerToleranceValue').value = $('centerTolerance').value;
    $('saturationValue').value = '+' + $('saturationBoost').value + '%';
    $('contrastValue').value = '+' + $('contrastBoost').value + '%';
    $('toleranceValue').value = Number($('backgroundTolerance').value) === 0 ? '自动' : $('backgroundTolerance').value;
    $('zoomValue').value = Number($('zoom').value).toFixed(2) + '×';
    $('xValue').value = Math.round(Number($('positionX').value) * 100) + '%';
    $('yValue').value = Math.round(Number($('positionY').value) * 100) + '%';
    cancelGeneration();keepHighColors=false;
    if (!loadedImage) return;
    try {
      const [width,height]=dimensions(),crop=drawCropPreview();
      const imageMode=$('imageMode').value, scale=imageMode==='ordinary' ? Math.min(1,width*4/crop.width,height*4/crop.height) : Math.min(1,1200/crop.width,1200/crop.height);
      const key=JSON.stringify([crop,imageMode,$('size').value]);
      if (!analysisData || key!==analysisKey) {
        sample.width=Math.max(16,Math.round(crop.width*scale));sample.height=Math.max(16,Math.round(crop.height*scale));
        const pixels=sample.getContext('2d',{willReadFrequently:true});
        pixels.imageSmoothingEnabled=true;pixels.imageSmoothingQuality='high';
        pixels.drawImage(loadedImage,crop.x,crop.y,crop.width,crop.height,0,0,sample.width,sample.height);
        analysisData=pixels.getImageData(0,0,sample.width,sample.height);analysisKey=key;
      }
      selectedCell=null;$('applyCell').disabled=true;
      target=targetFromPixels(analysisData,{width,height,imageMode,nativeGrid:$('size').value==='native',cacheRecognition:true,
        centerTolerance:Number($('centerTolerance').value),colorMode:$('colorMode').value,
        saturationBoost:Number($('saturationBoost').value),contrastBoost:Number($('contrastBoost').value),
        subjectMode:$('subjectMode').value,backgroundTolerance:Number($('backgroundTolerance').value),
        maxColors:Number($('colors').value),cleanup:$('cleanup').checked});
      presentTarget();
    } catch (error) {
      target = null; $('target').getContext('2d').clearRect(0, 0, $('target').width, $('target').height);
      clearSubject(); $('targetStatus').textContent='目标图：生成失败。'; $('palette').replaceChildren(); $('targetInfo').textContent = '没有有效目标图案';
      generationFailed('图案生成失败：' + error.message);
    }
  }
  $('file').addEventListener('change', async () => {
    const file = $('file').files[0];
    if (!file) return;
    const currentUpload = ++uploadRevision;
    cancelGeneration(); clearSubject(); analysisData=null;analysisKey='';loadedImage = null; target = null; $('reset').disabled = true;
    manualSubject=null;keepHighColors=false;subjectSelectionMode(false);$('selectSubject').disabled=true;$('clearSelection').disabled=true;
    $('subjectSelectionInfo').textContent='可在裁剪窗口拖框，仅处理框内主体。';
    $('original').hidden = true; $('original').removeAttribute('src');
    if (imageURL) URL.revokeObjectURL(imageURL);
    imageURL = null;
    for (const id of ['crop', 'target', ...ids]) { const canvas = $(id); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); }
    $('palette').replaceChildren(); $('targetInfo').textContent = '等待图片解码'; $('empty').hidden = false;
    let nextURL = null;
    try {
      validateFile(file); status('正在本机读取图片…');
      const nextImage = new Image(); nextURL = URL.createObjectURL(file); nextImage.src = nextURL;
      await nextImage.decode();
      if (currentUpload !== uploadRevision) { URL.revokeObjectURL(nextURL); return; }
      if (!nextImage.naturalWidth || nextImage.naturalWidth * nextImage.naturalHeight > 40000000) throw new Error('图片过大，请先缩小至 4000 万像素以内');
      loadedImage = nextImage; imageURL = nextURL; sourceName = file.name;
      createdAt = new Date().toISOString();
      $('levelId').value = 'image-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      $('levelNameInput').value = file.name.replace(/\.[^.]+$/, '').slice(0,80);
      $('levelVersion').value = 1;
      $('original').src = imageURL; $('original').hidden = false; $('empty').hidden = true; $('reset').disabled = false;$('selectSubject').disabled=false;
      $('zoom').value = 1; $('positionX').value = 0; $('positionY').value = 0; update();
    } catch (error) {
      if (nextURL) URL.revokeObjectURL(nextURL);
      if (currentUpload === uploadRevision) generationFailed('图片读取失败：' + error.message);
    }
  });
  for (const id of ['size', 'imageMode', 'cropAspect', 'centerTolerance', 'colors', 'colorMode', 'saturationBoost', 'contrastBoost', 'subjectMode', 'backgroundTolerance', 'zoom', 'positionX', 'positionY', 'cleanup']) $(id).addEventListener('input', update);
  $('target').addEventListener('click',event=>{
    if(!target?.locked)return;
    const rect=$('target').getBoundingClientRect(),col=Math.floor((event.clientX-rect.left)/rect.width*target.width),row=Math.floor((event.clientY-rect.top)/rect.height*target.height);
    if(!target.targetBoard[row]?.[col]?.active){$('selectedCell').textContent='此处不是有效豆子；真实空洞保持 inactive。';$('applyCell').disabled=true;selectedCell=null;return;}
    selectedCell={row,col};$('cellColor').value=target.targetBoard[row][col].beanColor;
    $('selectedCell').textContent='第 '+(row+1)+' 行，第 '+(col+1)+' 列';$('applyCell').disabled=false;
  });
  $('applyCell').addEventListener('click',()=>{if(selectedCell)applyManual({cellChanges:[{...selectedCell,color:$('cellColor').value}]});});
  $('reset').addEventListener('click', () => { $('zoom').value = 1; $('positionX').value = 0; $('positionY').value = 0; update(); });
  $('beads').addEventListener('change', () => { if (target) {renderTarget();renderRecognition();} renderLevels(); });
  function documentOptions() {
    return { id: $('levelId').value, name: $('levelNameInput').value, version: Number($('levelVersion').value),
      createdAt, updatedAt: new Date().toISOString(), sourceName, subjectMode: $('subjectMode').value,
      backgroundTolerance: Number($('backgroundTolerance').value), colorMode: $('colorMode').value,
      saturationBoost: Number($('saturationBoost').value), contrastBoost: Number($('contrastBoost').value), crop: options(),
      maxColors: Number($('colors').value), cleanup: $('cleanup').checked, ...(manualSubject?{subjectRect:manualSubject}:{}) };
  }
  $('export').addEventListener('click', () => {
    if (!worker || !target || !levels) return;
    $('export').disabled = true; status('正在重新验证导出数据与 JSON 回读…');
    worker.postMessage({ id: revision, type: 'export', target, levels, metadata: documentOptions() });
  });
  $('crop').addEventListener('pointerdown', event => {
    if (!loadedImage || (event.pointerType === 'mouse' && event.button !== 0) || dragging) return;
    const [width, height] = cropDimensions(), rect = $('crop').getBoundingClientRect();
    if(selectingSubject){
      dragging={kind:'subject',pointer:event.pointerId,rect,crop:cropRect(loadedImage.naturalWidth,loadedImage.naturalHeight,width,height,options()),start:normalizedPoint(event,rect)};
      $('crop').setPointerCapture(event.pointerId);return;
    }
    dragging = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      ...options(), crop: cropRect(loadedImage.naturalWidth, loadedImage.naturalHeight, width, height, options()), rect };
    $('crop').setPointerCapture(event.pointerId);
  });
  $('crop').addEventListener('pointermove', event => {
    if (!loadedImage || !dragging || dragging.pointer !== event.pointerId) return;
    if(dragging.kind==='subject'){drawCropPreview(selectedRect(dragging.start,normalizedPoint(event,dragging.rect)));return;}
    const { crop, rect } = dragging;
    const overflowX = loadedImage.naturalWidth*(manualSubject?.width??1) - crop.width, overflowY = loadedImage.naturalHeight*(manualSubject?.height??1) - crop.height;
    const x = overflowX > .01 ? dragging.x - 2 * (event.clientX - dragging.clientX) / rect.width * crop.width / overflowX : 0;
    const y = overflowY > .01 ? dragging.y - 2 * (event.clientY - dragging.clientY) / rect.height * crop.height / overflowY : 0;
    $('positionX').value = Math.max(-1, Math.min(1, x)); $('positionY').value = Math.max(-1, Math.min(1, y)); update();
  });
  $('crop').addEventListener('pointerup',event=>{
    if(dragging?.pointer!==event.pointerId)return;
    if(dragging.kind==='subject')finishSubjectSelection(event);else dragging=null;
  });
  for(const name of ['pointercancel','lostpointercapture'])$('crop').addEventListener(name,event=>{
    if(dragging?.pointer===event.pointerId){dragging=null;if(selectingSubject)drawCropPreview();}
  });
  $('selectSubject').addEventListener('click',beginSubjectSelection);
  $('clearSelection').addEventListener('click',()=>{
    if(!loadedImage)return;manualSubject=null;subjectSelectionMode(false);analysisData=null;analysisKey='';
    $('clearSelection').disabled=true;$('subjectSelectionInfo').textContent='已清除主体框选，重新提取最大主体。';update();
  });
  $('returnCrop').addEventListener('click',()=>{if(!selectingSubject)beginSubjectSelection();});
  $('keepColors').addEventListener('click',()=>{
    if(!target?.locked||selectingSubject)return;cancelGeneration();keepHighColors=true;presentTarget();
  });
  $('mergeColors').addEventListener('click',()=>{
    if(!target?.locked||selectingSubject)return;
    try{const next=window.TurnBeansGrid.merge(target);cancelGeneration();keepHighColors=false;target=next;presentTarget();}
    catch(error){status('色系合并未完成，请保留原色或重新编辑主体：'+error.message,true);}
  });
  window.addEventListener('pagehide', event => {
    clearTimeout(timer); if (worker) worker.terminate();
    if (!event.persisted && imageURL) URL.revokeObjectURL(imageURL);
  });
  window.addEventListener('pageshow', event => { if (event.persisted && loadedImage) update(); });
  if (window.TurnBeansPublisherUI) publisherUI = window.TurnBeansPublisherUI.mount({
    isReady: () => !!levels && levels.every(level => level.playable),
    getDocument: () => window.TurnBeansDocument.create(target, levels, documentOptions())
  });
})();
