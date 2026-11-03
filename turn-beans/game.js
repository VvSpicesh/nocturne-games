/* Turn Beans Phase 5: level home, circular FIFO trays, animated transfers and inline finish. */
(function () {
  'use strict';
  const { TurnBeansEngine } = window.TurnBeans;
  const { getLevel, listLevels } = window.TurnBeansLevels;
  const STORAGE_KEY = 'nocturne-turn-beans-progress-v1'; // reuse Phase 4 saves
  const $ = id => document.getElementById(id);
  const dom = {
    home: $('levelHome'), play: $('playScreen'), cards: $('levelCards'), homeBtn: $('homeBtn'),
    board: $('board'), viewport: $('viewport'), trays: $('trays'), traysSection: $('traysSection'),
    levelNo: $('levelNo'), levelName: $('levelName'), steps: $('steps'),
    status: $('boardStatus'), message: $('message'), preview: $('previewCover'),
    zoomLabel: $('zoomLabel'), replay: $('replayBtn'), soundToggle: $('soundToggle'),
    undo: $('undoBtn'), restart: $('restartBtn'), actions: $('actions'),
    complete: $('completePanel'), completeText: $('completeText'),
    completeHome: $('completeHome'), next: $('nextBtn')
  };
  const levels = listLevels();
  let progress = { currentLevel: '01', completed: [], saves: {} };
  let level = null, engine = null, previewing = false, animating = false;
  let previewTimer = null, animationToken = 0, zoom = 30;
  let soundEnabled = true, audioContext = null;
  const MIN_ZOOM = 10, MAX_ZOOM = 60;
  const pointers = new Map();
  let pinchDistance = null, lastPan = null, suppressTap = false;
  let mouseDrag = null, suppressTapTimer = null;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  try { soundEnabled = localStorage.getItem('turn-beans-sound') !== 'off'; } catch (_) {}
  function updateSoundToggle() {
    dom.soundToggle.textContent = soundEnabled ? '音效：开' : '音效：关';
    dom.soundToggle.setAttribute('aria-pressed', String(soundEnabled));
  }
  dom.soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    try { localStorage.setItem('turn-beans-sound', soundEnabled ? 'on' : 'off'); } catch (_) {}
    updateSoundToggle();
  });
  updateSoundToggle();
  function soundBounce(count, isExchange) {
    if (!soundEnabled || prefersReducedMotion.matches) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      if (!audioContext) audioContext = new Context();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const total = Math.min(6, count);
      for (let i = 0; i < total; i++) {
        const t = audioContext.currentTime + i * .047;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        const freq = (isExchange ? 570 : 440) + (i % 4) * 55;
        osc.frequency.setValueAtTime(freq * 1.14, t);
        osc.frequency.exponentialRampToValueAtTime(freq, t + .055);
        gain.gain.setValueAtTime(.0001, t);
        gain.gain.exponentialRampToValueAtTime(.035, t + .009);
        gain.gain.exponentialRampToValueAtTime(.0001, t + .105);
        osc.connect(gain); gain.connect(audioContext.destination);
        osc.start(t); osc.stop(t + .11);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      }
    } catch (error) { console.warn('Turn Beans: sound unavailable', error); }
  }

  function readProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Array.isArray(saved.completed) && saved.saves && typeof saved.saves === 'object') {
        progress = { currentLevel: String(saved.currentLevel || '01'), completed: saved.completed, saves: saved.saves };
      }
    } catch (error) { console.warn('Turn Beans: invalid save', error); }
  }
  function persist() {
    try {
      if (level && engine) {
        progress.saves[level.id] = engine.exportSave();
        progress.currentLevel = level.id;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (error) { showMessage('本地存储空间不足，进度无法保存'); console.warn(error); }
  }
  function validSavedEngine(data, levelData) {
    if (!data) return null;
    try {
      if (JSON.stringify(data.initialBoard) !== JSON.stringify(new TurnBeansEngine(levelData.initialBoard).initialBoard)) return null;
      return TurnBeansEngine.fromSave(data);
    } catch (error) { console.warn('Turn Beans: ignored incompatible save', error); return null; }
  }
  function showMessage(text) { dom.message.textContent = text; }
  function clearVisualEffects() {
    animationToken++;
    document.querySelectorAll('.bean-flight-layer').forEach(layer => layer.remove());
    animating = false;
  }
  function cancelPreview() { clearTimeout(previewTimer); previewTimer = null; previewing = false; }
  function makeCell(row, col, cell, disabled) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cell' + (cell.beanColor === null ? ' empty' : '') + (cell.active === false ? ' inactive' : '');
    button.style.setProperty('--base', cell.baseColor || '#ece2d2');
    button.dataset.row = String(row);
    button.dataset.col = String(col);
    if (cell.beanColor !== null) {
      const bean = document.createElement('span');
      bean.className = 'bean';
      bean.style.setProperty('--bean', cell.beanColor);
      button.appendChild(bean);
    }
    button.disabled = disabled || cell.active === false;
    button.setAttribute('aria-label', `第${row+1}行第${col+1}列，${cell.beanColor === null ? '空孔' : cell.beanColor === cell.baseColor ? '颜色正确' : '颜色待调整'}`);
    if (!disabled && cell.active !== false) button.addEventListener('click', () => onCellClick(row, col));
    return button;
  }
  function renderBoard(board, disabled) {
    dom.board.style.setProperty('--columns', String(level.width));
    const fragment = document.createDocumentFragment();
    board.forEach((row, r) => row.forEach((cell, c) => fragment.appendChild(makeCell(r, c, cell, disabled))));
    dom.board.replaceChildren(fragment);
  }
  function renderTrays() {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 3; i++) {
      const tray = engine.getTray(i);
      const item = document.createElement('div');
      item.className = 'tray';
      item.dataset.tray = String(i);
      const name = document.createElement('strong');
      name.className = 'tray-label';
      name.textContent = `备用盘 ${i+1}`;
      const circle = document.createElement('div');
      circle.className = 'tray-circle';
      circle.setAttribute('aria-label', `备用盘 ${i+1}，${tray.length}颗，按顺时针方向从队首到队尾`);
      for (let j = 0; j < 20; j++) {
        const slot = document.createElement('span');
        slot.className = 'tray-bean' + (j < tray.length ? ' filled' : '');
        slot.dataset.slot = String(j);
        const angle = (j * 18 - 90) * Math.PI / 180;
        slot.style.left = `${50 + 43 * Math.cos(angle)}%`;
        slot.style.top = `${50 + 43 * Math.sin(angle)}%`;
        if (j < tray.length) slot.style.setProperty('--bean', tray[j]);
        slot.title = j < tray.length ? `队列第 ${j+1} 颗` : '空位';
        circle.appendChild(slot);
      }
      const mid = document.createElement('div');
      mid.className = 'tray-center';
      const amount = document.createElement('strong'); amount.textContent = `${tray.length}/20`;
      const first = document.createElement('small'); first.textContent = tray.length ? '↑ 队首' : '空盘';
      mid.append(amount, first);
      circle.appendChild(mid);
      item.append(name, circle);
      fragment.appendChild(item);
    }
    dom.trays.replaceChildren(fragment);
  }
  function render() {
    if (!level || !engine) return;
    const won = engine.isWon() && !previewing;
    dom.levelNo.textContent = `第 ${level.id} 关 · ${level.difficulty}`;
    dom.levelName.textContent = level.name;
    dom.steps.textContent = String(engine.steps);
    dom.status.textContent = previewing ? '开始' : won ? '已完成' : '点击取豆 / 交换';
    // The target pattern must remain fully visible during the one-second preview.
    dom.preview.classList.add('hidden');
    // Always show the unambiguous correct final picture when finished.
    renderBoard(previewing || won ? level.targetBoard : engine.board, previewing || won || animating);
    renderTrays();
    dom.complete.hidden = !won;
    dom.traysSection.hidden = won;
    dom.actions.hidden = won;
    if (won) {
      dom.completeText.textContent = `${level.name} · 共操作 ${engine.steps} 步`;
      const index = levels.findIndex(item => item.id === level.id);
      dom.next.textContent = index < levels.length - 1 ? '下一关' : '返回主页';
    }
    dom.undo.disabled = previewing || animating || engine.history.length === 0;
    dom.restart.disabled = previewing || animating;
    dom.zoomLabel.textContent = `${Math.round(zoom / 30 * 100)}%`;
    dom.board.style.setProperty('--cell', `${zoom}px`);
    
  }
  function makeThumbnail(item) {
    const info = getLevel(item.id);
    const thumb = document.createElement('div');
    thumb.className = 'level-thumb';
    thumb.style.setProperty('--thumb-cols', String(info.width));
    for (const row of info.targetBoard) for (const cell of row) {
      const dot = document.createElement('span');
      dot.className = 'thumbnail-dot';
      dot.style.setProperty('--dot', cell.active === false ? 'transparent' : (cell.beanColor || 'transparent'));
      if (cell.active === false) dot.classList.add('inactive');
      thumb.appendChild(dot);
    }
    return thumb;
  }
  function renderHome() {
    const frag = document.createDocumentFragment();
    for (const item of levels) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'level-card';
      card.appendChild(makeThumbnail(item));
      const name = document.createElement('strong'); name.textContent = `${item.id}. ${item.name}`;
      const desc = document.createElement('small');
      desc.textContent = `${item.difficulty} · ${progress.completed.includes(item.id) ? '✓ 已完成 · 点击重玩' : progress.saves[item.id]?.current?.steps > 0 ? '继续挑战' : '未完成'}`;
      card.append(name, desc);
      // Completed cards start a fresh replay; the completion badge remains in history.
      card.addEventListener('click', () => startLevel(item.id, { fresh: progress.completed.includes(item.id) }));
      frag.appendChild(card);
    }
    dom.cards.replaceChildren(frag);
  }
  function showHome() {
    cancelPreview(); clearVisualEffects();
    if (level && engine) persist();
    dom.play.hidden = true;
    dom.home.hidden = false;
    dom.homeBtn.hidden = true;
    renderHome();
  }
  function startLevel(id, options = {}) {
    cancelPreview(); clearVisualEffects();
    level = getLevel(id) || getLevel('01');
    const restored = !options.fresh && validSavedEngine(progress.saves[level.id], level);
    engine = restored || new TurnBeansEngine(level.initialBoard);
    previewing = !restored || options.fresh;
    zoom = 30;
    pointers.clear(); pinchDistance = null; lastPan = null; mouseDrag = null;
    suppressTap = false; clearTimeout(suppressTapTimer);
    dom.viewport.classList.remove('is-dragging');
    dom.home.hidden = true;
    dom.play.hidden = false;
    dom.homeBtn.hidden = false;
    showMessage(previewing ? '开始' : '已恢复上次进度');
    persist(); render();
    requestAnimationFrame(fitBoardToViewport);
    if (previewing) {
      previewTimer = setTimeout(() => {
        previewing = false;
        render();
        showMessage('开始游戏：点击放错的豆子');
      }, 1000);
    }
  }
  function centerOf(rect) { return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }
  function cellPoint(row, col) {
    const cell = dom.board.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
    return cell ? centerOf(cell.getBoundingClientRect()) : null;
  }
  function trayPoint(index, slot) {
    const node = dom.trays.querySelector(`.tray[data-tray="${index}"] .tray-bean[data-slot="${Math.min(19, Math.max(0, slot))}"]`);
    return node ? centerOf(node.getBoundingClientRect()) : null;
  }
  // Flights are derived from the verified engine transaction; animation never changes game state.
  function makeFlights(result, before) {
    const trayIndex = result.trayIndex;
    const previousTray = before.trays[trayIndex];
    const flights = [];
    if (result.type === 'take') {
      result.positions.forEach((p, i) => {
        flights.push({ from: cellPoint(p.row,p.col), to: trayPoint(trayIndex, previousTray.length+i),
          color: before.board[p.row][p.col].beanColor });
      });
    } else {
      result.positions.forEach((p, i) => {
        flights.push({ from: trayPoint(trayIndex,i), to: cellPoint(p.row,p.col), color: previousTray[i] });
      });
      const remain = previousTray.length - result.count;
      let added = 0;
      result.positions.forEach(p => {
        const color = before.board[p.row][p.col].beanColor;
        if (color !== null) {
          flights.push({ from: cellPoint(p.row,p.col), to: trayPoint(trayIndex,remain+added), color, delay: 65 });
          added++;
        }
      });
    }
    return flights.filter(f => f.from && f.to);
  }
  function animateFlights(flights) {
    if (!flights.length || prefersReducedMotion.matches) return Promise.resolve();
    const token = ++animationToken;
    const layer = document.createElement('div');
    layer.className = 'bean-flight-layer';
    layer.setAttribute('aria-hidden','true');
    document.body.appendChild(layer);
    const duration = 380;
    const promises = flights.map((flight, i) => {
      const bead = document.createElement('span');
      bead.className = 'flying-bean';
      bead.style.setProperty('--bean', flight.color);
      bead.style.left = `${flight.from.x}px`;
      bead.style.top = `${flight.from.y}px`;
      layer.appendChild(bead);
      const delay = (flight.delay || 0) + Math.min(i, 9) * 17;
      const dx = flight.to.x-flight.from.x, dy = flight.to.y-flight.from.y;
      const animation = bead.animate([
        { transform:'translate(-50%,-50%) scale(1)', opacity:1 },
        { transform:`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.82)`, opacity:1 }
      ], { duration, delay, easing:'cubic-bezier(.22,.61,.3,1)', fill:'forwards' });
      return animation.finished.catch(() => {});
    });
    return Promise.all(promises).then(() => { layer.remove(); if (token !== animationToken) return; });
  }
  async function onCellClick(row, col) {
    if (previewing || animating || engine.isWon()) return;
    const before = engine.getState();
    const result = engine.click(row,col);
    if (!result.ok) {
      const messages = {already_correct:'这颗豆子已经正确',empty_or_inactive:'此处没有可取的豆子',trays_full:'备用盘已满，可尝试交换或撤销',out_of_bounds:'无法点击此处'};
      showMessage(messages[result.reason] || '当前没有可执行的操作');
      return;
    }
    // Audio is generated only in response to a real click and does not change engine state.
    soundBounce(result.count, result.type === 'exchange');
    // Retain the pre-operation DOM during flights so bead origins remain visible.
    animating = true;
    const flights = makeFlights(result, before);
    showMessage(result.type === 'take' ? `取出 ${result.count} 颗 → 备用盘 ${result.trayIndex+1}` : `交换 ${result.count} 颗 ← 备用盘 ${result.trayIndex+1}`);
    dom.board.classList.add('interaction-locked');
    dom.undo.disabled = true; dom.restart.disabled = true; dom.homeBtn.disabled = true;
    try { await animateFlights(flights); }
    finally {
      document.querySelectorAll('.bean-flight-layer').forEach(layer => layer.remove());
      dom.board.classList.remove('interaction-locked');
      animating = false;
      dom.homeBtn.disabled = false;
      persist();
      if (engine.isWon() && !progress.completed.includes(level.id)) {
        progress.completed.push(level.id);
        persist();
      }
      render();
      if (engine.isWon()) showMessage('');
      else if (engine.isStuck()) showMessage('当前无法继续，可以撤销或重新开始');
    }
  }
  dom.undo.addEventListener('click', () => {
    if (previewing || animating) return;
    if (engine.undo().ok) { persist(); render(); showMessage('已撤销上一步'); }
  });
  dom.restart.addEventListener('click', () => {
    if (previewing || animating) return;
    engine.restart(); persist(); render(); showMessage('已恢复本关初始乱序');
  });
  function fitBoardToViewport() {
    if (!level || dom.play.hidden) return;
    const width = Math.max(1, dom.viewport.clientWidth - 34);
    const height = Math.max(1, dom.viewport.clientHeight - 34);
    const fitted = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
      Math.floor(Math.min(width / level.width - 2, height / level.height - 2))));
    setZoom(fitted);
    dom.viewport.scrollLeft = 0;
    dom.viewport.scrollTop = 0;
    updateDragCursor();
  }
  function setZoom(value, anchor = null) {
    if (!level || !engine || animating) return;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    if (Math.abs(next - zoom) < .15) return;
    const rect = dom.viewport.getBoundingClientRect();
    const x = anchor ? anchor.x - rect.left : rect.width / 2;
    const y = anchor ? anchor.y - rect.top : rect.height / 2;
    // Keep the point under the gesture fixed while resizing the scrollable board.
    const oldWidth = level.width * (zoom + 2) - 2;
    const oldHeight = level.height * (zoom + 2) - 2;
    const fractionX = (dom.viewport.scrollLeft + x - 16 - Math.max(0,(rect.width - 32 - oldWidth)/2)) / Math.max(1,oldWidth);
    const fractionY = (dom.viewport.scrollTop + y - 16 - Math.max(0,(rect.height - 32 - oldHeight)/2)) / Math.max(1,oldHeight);
    zoom = Math.round(next * 10) / 10;
    dom.board.style.setProperty('--cell', `${zoom}px`);
    dom.zoomLabel.textContent = `${Math.round(zoom / 30 * 100)}%`;
    const newWidth = level.width * (zoom + 2) - 2;
    const newHeight = level.height * (zoom + 2) - 2;
    dom.viewport.scrollLeft = 16 + Math.max(0,(rect.width - 32 - newWidth)/2) + fractionX * newWidth - x;
    dom.viewport.scrollTop = 16 + Math.max(0,(rect.height - 32 - newHeight)/2) + fractionY * newHeight - y;
    updateDragCursor();
  }
  function canPan() {
    // Measured scroll extents reflect actual board overflow, not just zoom percentage.
    return dom.viewport.scrollWidth > dom.viewport.clientWidth + 1 ||
      dom.viewport.scrollHeight > dom.viewport.clientHeight + 1;
  }
  function updateDragCursor() {
    dom.viewport.classList.toggle('can-drag', !!level && canPan());
  }
  // Browser pointer events for mouse; no capture on pointerdown so a normal click
  // still reaches the cell. Global move/up permit dragging outside the viewport.
  dom.viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !level ||
        previewing || animating || !canPan()) return;
    mouseDrag = { id:event.pointerId, startX:event.clientX, startY:event.clientY,
      lastX:event.clientX, lastY:event.clientY, moved:false };
  });
  window.addEventListener('pointermove', event => {
    if (!mouseDrag || event.pointerId !== mouseDrag.id) return;
    if (!(event.buttons & 1)) { mouseDrag = null; dom.viewport.classList.remove('is-dragging'); return; }
    const dx = event.clientX - mouseDrag.lastX;
    const dy = event.clientY - mouseDrag.lastY;
    if (!mouseDrag.moved && Math.hypot(event.clientX - mouseDrag.startX,
      event.clientY - mouseDrag.startY) > 6) {
      mouseDrag.moved = true;
      suppressTap = true;
      clearTimeout(suppressTapTimer);
      dom.viewport.classList.add('is-dragging');
    }
    if (mouseDrag.moved) {
      dom.viewport.scrollLeft -= dx;
      dom.viewport.scrollTop -= dy;
      event.preventDefault();
    }
    mouseDrag.lastX = event.clientX;
    mouseDrag.lastY = event.clientY;
  }, {passive:false});
  function endMouseDrag(event) {
    if (!mouseDrag || event.pointerId !== mouseDrag.id) return;
    const moved = mouseDrag.moved;
    mouseDrag = null;
    dom.viewport.classList.remove('is-dragging');
    if (moved) {
      clearTimeout(suppressTapTimer);
      suppressTapTimer = window.setTimeout(() => { suppressTap = false; }, 400);
    }
  }
  window.addEventListener('pointerup', endMouseDrag);
  window.addEventListener('pointercancel', endMouseDrag);
  dom.viewport.addEventListener('dragstart', event => event.preventDefault());
  dom.viewport.addEventListener('wheel', event => {
    if (!level || animating) return;
    event.preventDefault();
    setZoom(zoom * Math.exp(-event.deltaY * .0015), { x: event.clientX, y: event.clientY });
  }, { passive: false });
  function pointerDistance() {
    const [a,b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function pointerMidpoint() {
    const [a,b] = [...pointers.values()];
    return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  }
  dom.viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || !level || animating) return;
    pointers.set(event.pointerId, {x:event.clientX,y:event.clientY});
    if (pointers.size === 2) {
      pinchDistance = pointerDistance(); lastPan = null; suppressTap = true;
    } else if (pointers.size === 1) {
      lastPan = {x:event.clientX,y:event.clientY};
    }
  });
  dom.viewport.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, {x:event.clientX,y:event.clientY});
    if (pointers.size >= 2) {
      const distance = pointerDistance();
      if (pinchDistance && pinchDistance > 0) setZoom(zoom * distance / pinchDistance, pointerMidpoint());
      pinchDistance = distance;
    } else if (lastPan) {
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) {
        if (Math.abs(event.clientX-lastPan.x)+Math.abs(event.clientY-lastPan.y) > 7) suppressTap = true;
        dom.viewport.scrollLeft -= dx;
        dom.viewport.scrollTop -= dy;
      }
    }
  });
  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    pinchDistance = pointers.size === 2 ? pointerDistance() : null;
    lastPan = null;
    if (pointers.size === 0 && suppressTap) {
      // Touch click may be dispatched after pointerup; clear suppression after that click.
      window.setTimeout(() => { suppressTap = false; }, 350);
    }
  }
  dom.viewport.addEventListener('pointerup', endPointer);
  dom.viewport.addEventListener('pointercancel', endPointer);
  dom.viewport.addEventListener('click', event => {
    if (suppressTap && event.target.closest('.cell')) {
      event.preventDefault(); event.stopPropagation();
      clearTimeout(suppressTapTimer);
      suppressTapTimer = window.setTimeout(() => { suppressTap = false; }, 0);
    }
  }, true);
  window.addEventListener('resize', () => { if (level && !dom.play.hidden) fitBoardToViewport(); });
  dom.replay.addEventListener('click', () => { if (level) startLevel(level.id, {fresh:true}); });
  dom.homeBtn.addEventListener('click', showHome);
  dom.completeHome.addEventListener('click', showHome);
  dom.next.addEventListener('click', () => {
    const index = levels.findIndex(item => item.id === level.id);
    if (index >= 0 && index < levels.length - 1) startLevel(levels[index+1].id);
    else showHome();
  });
  readProgress();
  showHome();
})();
