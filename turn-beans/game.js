/* Turn Beans Phase 24: atomic board colors during transfer; no intermediate gray board states. */
(function () {
  'use strict';
  const { TurnBeansEngine } = window.TurnBeans;
  const { getLevel, listLevels } = window.TurnBeansLevels;
  const { encodeSave, decodeSave } = window.TurnBeansSaveCodec;
  const STORAGE_KEY = 'nocturne-turn-beans-progress-v1'; // reuse Phase 4 saves
  const $ = id => document.getElementById(id);
  const dom = {
    home: $('levelHome'), play: $('playScreen'), cards: $('levelCards'), homeBtn: $('homeBtn'), homeHearts: $('homeHearts'),
    board: $('board'), viewport: $('viewport'), trays: $('trays'), traysSection: $('traysSection'),
    levelNo: $('levelNo'), levelName: $('levelName'), steps: $('steps'), elapsed: $('elapsed'), bestTime: $('bestTime'), hearts: $('heartCount'), failure: $('failurePanel'),
    status: $('boardStatus'), message: $('message'), preview: $('previewCover'),
    zoomLabel: $('zoomLabel'), replay: $('replayBtn'), soundToggle: $('soundToggle'),
    undo: $('undoBtn'), restart: $('restartBtn'), actions: $('actions'),
    complete: $('completePanel'), completeText: $('completeText'), winBanner: $('winBanner'),
    completeHome: $('completeHome'), next: $('nextBtn')
  };
  const levels = listLevels();
  const cloudLevels = new Map();
  let progress = { currentLevel: '01', completed: [], saves: {}, bestTimes:{}, elapsed:{}, hearts:0 };
  let elapsedBefore = 0, timerEpoch = null, timerInterval = null;
  let level = null, engine = null, previewing = false, animating = false;
  let previewTimer = null, animationToken = 0, zoom = 30;
  let soundEnabled = true, audioContext = null;
  let previewStage = null, previewGoTimer = null, winBurstPlayed = false;
  // Use the original intro voice; movement effects are short, locally synthesized bounces.
  const readyGoSound = new Audio('./sounds/ready-go.wav');
  readyGoSound.preload = 'auto';
  const MIN_ZOOM = 5, MAX_ZOOM = 60;
  const pointers = new Map();
  let pinchDistance = null, lastPan = null, suppressTap = false;
  let mouseDrag = null, suppressTapTimer = null;
  let saveTimer = null;
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
  function ensureAudioContext() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    if (!audioContext) audioContext = new Context();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  }
  function playTone({ at = 0, freq = 660, type = 'triangle', duration = .12, volume = .04, glideTo = null }) {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + duration);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + duration + .015);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  // Rounded, short bounce; no sampled background noise or harsh high-frequency chirps.
  function soundBounce(count, isExchange) {
    if (!soundEnabled) return;
    try {
      const taps = Math.min(3, Math.max(1, Math.ceil(count / 4)));
      for (let i = 0; i < taps; i++) {
        const at = i * .07;
        const freq = (isExchange ? 510 : 390) + (i % 2) * 35;
        playTone({at, freq, type:'triangle', duration:.095, volume:.023, glideTo:freq*.84});
        playTone({at:at+.007, freq:freq*1.5, type:'sine', duration:.045, volume:.006, glideTo:freq*1.12});
      }
    } catch (error) { console.warn('Turn Beans: sound unavailable', error); }
  }
  function soundReadyGo(stage) {
    if (!soundEnabled || stage !== 'ready') return;
    // A recorded sound file is reliably audible on browsers that cannot use speech synthesis.
    // This is started by the player's level-selection click, not by an autoplay timer.
    try {
      readyGoSound.pause();
      readyGoSound.currentTime = 0;
      readyGoSound.volume = .6;
      readyGoSound.play().catch(() => {});
    } catch (error) { console.warn('Turn Beans: ready-go sound unavailable', error); }
  }
  function soundWin() {
    if (!soundEnabled || prefersReducedMotion.matches) return;
    try {
      [523, 659, 784, 988].forEach((freq, index) => {
        playTone({ at: index * .095, freq, type: 'sine', duration: .22, volume: .023 });
      });
    } catch (error) { console.warn('Turn Beans: success sound unavailable', error); }
  }
  function shiftColor(hex, amount) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex || '#d9c8bd';
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    if (h.length !== 6) return hex;
    const clamp = value => Math.max(0, Math.min(255, value));
    const r = clamp(parseInt(h.slice(0, 2), 16) + amount);
    const g = clamp(parseInt(h.slice(2, 4), 16) + amount);
    const b = clamp(parseInt(h.slice(4, 6), 16) + amount);
    return `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}`;
  }


  function formatted(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(sec / 60)).padStart(2,'0')}:${String(sec % 60).padStart(2,'0')}`;
  }
  function elapsedMs() { return elapsedBefore + (timerEpoch === null ? 0 : performance.now() - timerEpoch); }
  function updateTimer() {
    if (!level) return;
    dom.elapsed.textContent = formatted(elapsedMs());
    dom.bestTime.textContent = progress.bestTimes[level.id] == null ? '--:--' : formatted(progress.bestTimes[level.id]);
    dom.hearts.textContent = String(progress.hearts || 0);
  }
  function pauseTimer() {
    if (timerEpoch !== null) { elapsedBefore += performance.now() - timerEpoch; timerEpoch = null; }
    if (level) progress.elapsed[level.id] = Math.round(elapsedBefore);
    clearInterval(timerInterval); timerInterval = null;
    updateTimer();
  }
  function startTimer() {
    if (!level || !engine || previewing || engine.isWon() || engine.isLost() || timerEpoch !== null) return;
    timerEpoch = performance.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 250);
    updateTimer();
  }
  function recordWin() {
    if (winBurstPlayed) return;
    pauseTimer();
    const time = Math.round(elapsedMs());
    if (progress.bestTimes[level.id] == null || time < progress.bestTimes[level.id]) progress.bestTimes[level.id] = time;
    progress.hearts = (progress.hearts || 0) + 1;
    progress.completed = [...new Set([...progress.completed, level.id])];
    winBurstPlayed = true;
    soundWin(); updateTimer();
  }
  function readProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Array.isArray(saved.completed) && saved.saves && typeof saved.saves === 'object') {
        progress = { currentLevel: String(saved.currentLevel || '01'), completed: saved.completed, saves: saved.saves, bestTimes: saved.bestTimes || {}, elapsed: saved.elapsed || {}, hearts: saved.hearts || 0 };
      }
    } catch (error) { console.warn('Turn Beans: invalid save', error); }
  }
  function persist() {
    try {
      if (level) progress.elapsed[level.id] = Math.round(elapsedMs());
      if (level && engine) {
        progress.saves[level.id] = encodeSave({
          initialBoard: engine.initialBoard,
          current: {board: engine.board, trays: engine.trays, steps: engine.steps},
          history: engine.history
        });
        progress.currentLevel = level.id;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (error) { showMessage('本地存储空间不足，进度无法保存'); console.warn(error); }
  }
  function schedulePersist() {
    // Avoid serializing the full undo history in the same frame as bead rendering.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 2500);
  }
  function flushPersist() {
    if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; persist(); }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushPersist(); });
  window.addEventListener('pagehide', flushPersist);
  function validSavedEngine(data, levelData) {
    if (!data) return null;
    try {
      const canonical = new TurnBeansEngine(levelData.initialBoard).initialBoard;
      const save = data.compactVersion ? decodeSave(data, canonical) : data;
      if (JSON.stringify(save.initialBoard) !== JSON.stringify(canonical)) return null;
      return TurnBeansEngine.fromSave(save);
    } catch (error) { console.warn('Turn Beans: ignored incompatible save', error); return null; }
  }
  function showMessage(text) { dom.message.textContent = text; }
  function clearVisualEffects() {
    animationToken++;
    document.querySelectorAll('.bean-flight-layer').forEach(layer => layer.remove());
    animating = false;
  }
  function cancelPreview() { clearTimeout(previewTimer); clearTimeout(previewGoTimer); previewTimer = null; previewGoTimer = null; previewStage = null; previewing = false;
    try { readyGoSound.pause(); readyGoSound.currentTime = 0; } catch (_) {}
  }
  function makeCell(row, col, cell, disabled) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cell' + (cell.beanColor === null ? ' empty' : '') + (cell.active === false ? ' inactive' : '');
    const base = cell.baseColor || '#ece2d2';
    button.style.setProperty('--base', base);
    button.style.setProperty('--base-highlight', base);
    button.style.setProperty('--base-border', shiftColor(base, -16));
    button.dataset.row = String(row);
    button.dataset.col = String(col);
    if (cell.beanColor !== null) {
      const bean = document.createElement('span');
      bean.className = 'bean';
      bean.style.setProperty('--bean', cell.beanColor);
      bean.style.setProperty('--bean-dark', shiftColor(cell.beanColor, -14));
      bean.style.setProperty('--bean-highlight', shiftColor(cell.beanColor, 12));
      button.appendChild(bean);
    }
    button.disabled = disabled || cell.active === false;
    button.setAttribute('aria-label', `第${row+1}行第${col+1}列，${cell.beanColor === null ? '空孔' : cell.beanColor === cell.baseColor ? '颜色正确' : '颜色待调整'}`);
    // One delegated board handler below handles all cells and small gaps.
    return button;
  }
  // High-contrast play-mode rendering, tuned for small screens: no glossy
  // double rings. Target colors remain visible as solid square underlays.
  const contrastStyle = document.createElement('style');
  contrastStyle.textContent = `
    .board { gap:0 !important; }
    .board .cell:not(.inactive) {
      background:var(--base) !important;
      border:1px solid var(--base-border) !important;
      border-radius:1px !important;
      box-shadow:none !important;
    }
    .board .cell:not(.inactive)::before { content:none !important; }
    .board .cell .bean {
      width:80% !important;height:80% !important;
      background:var(--bean) !important;
      border:1px solid var(--bean-dark) !important;
      box-shadow:inset 0 1px 0 #ffffff22,inset 0 -1px 1px #00000026,0 1px 1px #00000018 !important;
    }
    .board .cell.empty::after {
      content:'' !important;
      width:74% !important;height:74% !important;
      border:none !important;border-radius:50% !important;
      /* The socket is tinted by its OWN target base, never a neutral gray overlay. */
      background:radial-gradient(circle at 45% 38%,var(--base) 65%,var(--base-border) 100%) !important;
      box-shadow:inset 0 1px 2px #00000014,inset 0 -1px 0 #ffffff22 !important;
      opacity:1 !important;
    }
    .board.interaction-locked .cell.empty::after {
      background:var(--base) !important;
      box-shadow:none !important;
    }
    .board.showing-target .cell:not(.inactive) {background:transparent !important;border:0 !important;box-shadow:none !important;}
    .board.showing-target .cell .bean {width:94% !important;height:94% !important;}
    .board.showing-target .cell.empty::after {content:none !important;}
  `;
  document.head.appendChild(contrastStyle);
  // One listener for the entire board: improves large-grid responsiveness.
  // A tap in the tiny gap between neighboring cells resolves to a grid cell too.
  dom.board.addEventListener('click', event => {
    if (!level || !engine || previewing || animating || engine.isWon() || engine.isLost()) return;
    if (suppressTap) return;
    const tile = event.target.closest('.cell');
    if (tile && tile.disabled) return;
    let row, col;
    if (tile) {
      row = Number(tile.dataset.row);
      col = Number(tile.dataset.col);
    } else {
      const rect = dom.board.getBoundingClientRect();
      col = Math.floor((event.clientX - rect.left) / zoom);
      row = Math.floor((event.clientY - rect.top) / zoom);
    }
    if (Number.isInteger(row) && Number.isInteger(col) && engine.inBounds(row, col)) onCellClick(row, col);
  });
  function renderBoard(board, disabled, changedPositions = null) {
    dom.board.style.setProperty('--columns', String(level.width));
    // A 56x40 board contains 2240 cells. Patch only touched cells during play.
    if (changedPositions && dom.board.children.length === level.width * level.height) {
      for (const {row, col} of changedPositions) {
        const index = row * level.width + col;
        dom.board.children[index].replaceWith(makeCell(row, col, board[row][col], disabled));
      }
      return;
    }
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
      const circle = document.createElement('div');
      circle.className = 'tray-circle';
      circle.setAttribute('aria-label', `备用盘 ${i+1}，已使用 ${tray.length} / 20`);
      for (let j = 0; j < 20; j++) {
        const slot = document.createElement('span');
        slot.className = 'tray-bean' + (j < tray.length ? ' filled' : '');
        slot.dataset.slot = String(j);
        const angle = (j * 18 - 90) * Math.PI / 180;
        slot.style.left = `${50 + 43 * Math.cos(angle)}%`;
        slot.style.top = `${50 + 43 * Math.sin(angle)}%`;
        if (j < tray.length) slot.style.setProperty('--bean', tray[j]);
        slot.title = j < tray.length ? `第 ${j+1} 颗` : '空位';
        circle.appendChild(slot);
      }
      const mid = document.createElement('div');
      mid.className = 'tray-center';
      const amount = document.createElement('strong'); amount.textContent = `${tray.length}/20`;
      mid.append(amount);
      circle.appendChild(mid);
      item.append(circle);
      fragment.appendChild(item);
    }
    dom.trays.replaceChildren(fragment);
  }
  function render(changedPositions = null) {
    if (!level || !engine) return;
    const won = engine.isWon() && !previewing;
    const lost = engine.isLost() && !previewing;
    dom.levelNo.textContent = level.cloud ? `云端关卡 · ${level.difficulty}` : `第 ${level.id} 关 · ${level.difficulty}`;
    dom.levelName.textContent = level.name;
    dom.steps.textContent = String(engine.steps);
    dom.status.textContent = previewing ? '开始' : won ? '已完成' : lost ? '挑战失败' : '点击取豆 / 交换';
    if (previewing && previewStage) {
      dom.preview.innerHTML = `<span class="preview-word">${previewStage === 'ready' ? 'Ready~~' : 'Go!'}</span>`;
      dom.preview.className = `preview-cover ${previewStage}`;
    } else {
      dom.preview.className = 'preview-cover hidden';
      dom.preview.textContent = '';
    }
    // Always show the unambiguous correct final picture when finished.
    const showingTarget = previewing || won;
    dom.board.classList.toggle('target-art', showingTarget);
    dom.board.classList.toggle('showing-target', showingTarget);
    renderBoard(showingTarget ? level.targetBoard : engine.board, showingTarget || animating, showingTarget ? null : changedPositions);
    renderTrays();
    dom.complete.hidden = !won;
    dom.failure.hidden = !lost;
    dom.winBanner.hidden = !won;
    dom.traysSection.hidden = won;
    dom.actions.hidden = won;
    if (won) {
      dom.completeText.textContent = `${level.name} · ${engine.steps} 步 · ${formatted(elapsedMs())} · ❤ +1`;
      const index = levels.findIndex(item => item.id === level.id);
      dom.next.textContent = index >= 0 && index < levels.length - 1 ? '下一关' : '返回主页';
    }
    dom.undo.disabled = previewing || animating || engine.history.length === 0;
    dom.restart.disabled = previewing || animating;
    updateTimer();
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
    dom.homeHearts.textContent = `❤ ${progress.hearts || 0}`;
    const frag = document.createDocumentFragment();
    for (const item of levels) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'level-card';
      card.appendChild(makeThumbnail(item));
      const name = document.createElement('strong'); name.textContent = `${item.id}. ${item.name}`;
      const desc = document.createElement('small');
      desc.textContent = `${item.difficulty} · ${progress.completed.includes(item.id) ? '✓ 已完成 · 点击重玩' : progress.saves[item.id] ? '继续挑战' : '未完成'} · 最快 ${progress.bestTimes[item.id] == null ? '--:--' : formatted(progress.bestTimes[item.id])}`;
      card.append(name, desc);
      // Completed cards start a fresh replay; the completion badge remains in history.
      card.addEventListener('click', () => startLevel(item.id, { fresh: progress.completed.includes(item.id) }));
      frag.appendChild(card);
    }
    dom.cards.replaceChildren(frag);
  }
  function showHome() {
    pauseTimer();
    cancelPreview(); clearVisualEffects();
    flushPersist();
    if (level && engine) persist();
    dom.play.hidden = true;
    dom.home.hidden = false;
    dom.homeBtn.hidden = true;
    renderHome();
  }
  function startLevel(id, options = {}) {
    pauseTimer();
    cancelPreview(); clearVisualEffects();
    level = cloudLevels.get(id) || getLevel(id) || getLevel('01');
    const restored = !options.fresh && validSavedEngine(progress.saves[level.id], level);
    engine = restored || new TurnBeansEngine(level.initialBoard);
    previewing = !restored || options.fresh;
    winBurstPlayed = false;
    elapsedBefore = restored ? Math.max(0, Number(progress.elapsed[level.id]) || 0) : 0;
    timerEpoch = null;
    zoom = 30;
    pointers.clear(); pinchDistance = null; lastPan = null; mouseDrag = null;
    suppressTap = false; clearTimeout(suppressTapTimer);
    dom.viewport.classList.remove('is-dragging');
    dom.home.hidden = true;
    dom.play.hidden = false;
    dom.homeBtn.hidden = false;
    showMessage(previewing ? '开始' : '已恢复上次进度');
    persist();
    if (!previewing) startTimer();
    if (previewing) {
      previewStage = 'ready';
      soundReadyGo('ready');
      previewGoTimer = setTimeout(() => {
        previewStage = 'go';
        soundReadyGo('go');
        render();
      }, 1760);
    }
    render();
    requestAnimationFrame(fitBoardToViewport);
    if (previewing) {
      previewTimer = setTimeout(() => {
        previewing = false;
        previewStage = null;
        render();
        showMessage('开始游戏：点击放错的豆子');
        startTimer();
      }, 2640);
    }
  }
  function centerOf(rect) { return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }
  function cellPoint(row, col) {
    const cell = dom.board.children[row * level.width + col];
    return cell ? centerOf(cell.getBoundingClientRect()) : null;
  }
  function trayPoint(index, slot) {
    const node = dom.trays.querySelector(`.tray[data-tray="${index}"] .tray-bean[data-slot="${Math.min(19, Math.max(0, slot))}"]`);
    return node ? centerOf(node.getBoundingClientRect()) : null;
  }
  // Flights are derived from the verified engine transaction; animation never changes game state.
  function makeFlights(result, before) {
    const flights = [];
    if (result.type === 'take') {
      // Beads depart in a short stream; each lands in its own visible tray slot.
      result.transfers.forEach((t, i) => {
        flights.push({ from: cellPoint(t.row,t.col),
          to: trayPoint(t.trayIndex,t.destSlot), color:t.color,
          trayIndex:t.trayIndex, destSlot:t.destSlot, kind:'tray', delay:i*14 });
      });
    } else {
      result.transfers.forEach((t,i) => {
        flights.push({ from: trayPoint(t.trayIndex,t.sourceIndex),
          to: cellPoint(t.position.row,t.position.col),
          color:before.trays[t.trayIndex][t.sourceIndex],kind:'board',
          row:t.position.row,col:t.position.col,delay:i*14 });
        if (t.displacedColor !== null) {
          flights.push({ from:cellPoint(t.position.row,t.position.col),
            to:trayPoint(t.trayIndex,t.destSlot),color:t.displacedColor,
            kind:'tray',trayIndex:t.trayIndex,destSlot:t.destSlot,delay:55+i*14 });
        }
      });
    }
    return flights.filter(f=>f.from&&f.to);
  }
  // Animate and reveal each bead at its destination as it lands. Previously all
  // particles finished together and the board/tray snapped to the final state.
  function animateFlights(flights, result) {
    if (!flights.length) return Promise.resolve();
    const token=++animationToken;
    const margin=32;
    const xs=flights.flatMap(f=>[f.from.x,f.to.x]);
    const ys=flights.flatMap(f=>[f.from.y,f.to.y]);
    const left=Math.max(0,Math.floor(Math.min(...xs)-margin));
    const top=Math.max(0,Math.floor(Math.min(...ys)-margin-42));
    const right=Math.min(window.innerWidth,Math.ceil(Math.max(...xs)+margin));
    const bottom=Math.min(window.innerHeight,Math.ceil(Math.max(...ys)+margin+12));
    const w=Math.max(1,right-left),h=Math.max(1,bottom-top);
    const canvas=document.createElement('canvas');
    canvas.className='bean-flight-layer';canvas.setAttribute('aria-hidden','true');
    const ratio=Math.min(1.25,window.devicePixelRatio||1);
    canvas.width=Math.ceil(w*ratio);canvas.height=Math.ceil(h*ratio);
    Object.assign(canvas.style,{left:`${left}px`,top:`${top}px`,width:`${w}px`,height:`${h}px`,right:'auto',bottom:'auto'});
    document.body.appendChild(canvas);
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx){canvas.remove();return Promise.resolve();}
    ctx.scale(ratio,ratio);
    const diameter=Math.max(9,Math.min(17,zoom*.80));
    const duration=prefersReducedMotion.matches?60:175;
    // Phase 24: commit the complete board appearance synchronously before
    // starting the flight. Never leave a 0.3-1s gray/empty placeholder while
    // individual particles arrive. makeFlights has already captured the
    // original coordinates above, so this cannot change their paths.
    const touched = new Set();
    for (const {row, col} of result.positions) {
      const key = row * level.width + col;
      if (touched.has(key)) continue;
      touched.add(key);
      const current = dom.board.children[key];
      if (current) current.replaceWith(makeCell(row, col, engine.board[row][col], true));
    }
    if (result.type === 'exchange') for (const t of result.transfers) {
      const origin=dom.trays.querySelector(`.tray[data-tray="${t.trayIndex}"] .tray-bean[data-slot="${t.sourceIndex}"]`);
      if(origin) origin.style.visibility='hidden';
    }
    const particles=flights.map((f,i)=>({ ...f,landed:false,
      x0:f.from.x-left,y0:f.from.y-top,x1:f.to.x-left,y1:f.to.y-top,
      bend:((i%2)?-1:1)*(25+(i%5)*10),
      border:shiftColor(f.color,-35),delay:f.delay||0 }));
    function land(f){
      if(f.kind==='board'){
        // Board already displays the final colored bead at transaction start.
        return;
      }else if(f.kind==='tray'){
        const slot=dom.trays.querySelector(`.tray[data-tray="${f.trayIndex}"] .tray-bean[data-slot="${f.destSlot}"]`);
        if(slot){slot.classList.add('filled');slot.style.setProperty('--bean',f.color);slot.style.visibility='visible';}
      }
    }
    return new Promise(resolve=>{
      let start=null,done=false;
      const finish=()=>{if(done)return;done=true;canvas.remove();resolve();};
      function frame(ts){
        if(start===null)start=ts;
        if(token!==animationToken){finish();return;}
        ctx.clearRect(0,0,w,h);
        let running=false;
        for(const f of particles){
          const t=(ts-start-f.delay)/duration;
          if(t<0){running=true;continue;}
          if(t>=1){if(!f.landed){f.landed=true;land(f);}continue;}
          running=true;
          const p=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; // faster initial motion
          const x=f.x0+(f.x1-f.x0)*p+f.bend*Math.sin(Math.PI*p);
          const y=f.y0+(f.y1-f.y0)*p-Math.sin(Math.PI*p)*(12+(f.delay%5)*3);
          const r=diameter/2;
          ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
          ctx.fillStyle=f.color;ctx.fill();
          ctx.lineWidth=1.2;ctx.strokeStyle=f.border;ctx.stroke();
          ctx.beginPath();ctx.arc(x-r*.22,y-r*.26,r*.23,0,Math.PI*2);
          ctx.fillStyle='#ffffff9c';ctx.fill();
        }
        if(running)requestAnimationFrame(frame);else finish();
      }
      // Render the departure bead synchronously so first response is visible immediately.
      const first=particles[0];
      if(first){ctx.beginPath();ctx.arc(first.x0,first.y0,diameter/2,0,Math.PI*2);ctx.fillStyle=first.color;ctx.fill();}
      requestAnimationFrame(frame);
    });
  }

  async function onCellClick(row, col) {
    if (previewing || animating || engine.isWon() || engine.isLost()) return;
    const result = engine.click(row, col);
    if (!result.ok) {
      const messages = {already_correct:'这颗豆子已经正确',empty_or_inactive:'此处没有可取的豆子',trays_full:'备用盘已满，可尝试交换或撤销',out_of_bounds:'无法点击此处'};
      showMessage(messages[result.reason] || '当前位置暂无匹配颜色');
      return;
    }
    animating = true;
    dom.board.classList.add('interaction-locked');
    dom.undo.disabled = true; dom.restart.disabled = true; dom.homeBtn.disabled = true;
    try {
      let move = result;
      let before = engine.history[engine.history.length - 1];
      let automaticCount = 0;
      while (move) {
        const flights = makeFlights(move, before);
        showMessage(move.automatic ? `自动补入 ${move.count} 颗` : move.type === 'take' ? `取出 ${move.count} 颗` : `交换 ${move.count} 颗`);
        const motion = animateFlights(flights, move);
        if (soundEnabled && !move.automatic) window.setTimeout(() => soundBounce(move.count, move.type === 'exchange'), 120);
        await motion;
        render(move.positions);
        // There are at most 60 stored beans and each placement removes one or
        // more empty holes, so this cannot run indefinitely.
        if (engine.isLost() || engine.isWon() || automaticCount >= 60) break;
        move = engine.autoFillMatchingEmpty();
        if (move) {
          automaticCount += move.count;
          before = move.before;
        }
      }
    } finally {
      document.querySelectorAll('.bean-flight-layer').forEach(layer => layer.remove());
      dom.board.classList.remove('interaction-locked');
      animating = false;
      dom.homeBtn.disabled = false;
      if (engine.isWon()) recordWin();
      else if (engine.isLost()) pauseTimer();
      render();
      schedulePersist();
      if (engine.isWon()) showMessage('');
      else if (engine.isLost()) showMessage('三盘已满，挑战失败。可以撤销或重新开始');
      else if (engine.isStuck()) showMessage('当前无法继续，可以撤销或重新开始');
    }
  }
  dom.undo.addEventListener('click', () => {
    if (previewing || animating) return;
    if (engine.undo().ok) { startTimer(); persist(); render(); showMessage('已撤销上一步'); }
  });
  dom.restart.addEventListener('click', () => {
    if (previewing || animating) return;
    pauseTimer(); engine.restart(); elapsedBefore = 0; progress.elapsed[level.id] = 0; startTimer(); persist(); render(); showMessage('已恢复本关初始乱序');
  });
  function fitBoardToViewport() {
    if (!level || dom.play.hidden) return;
    const width = Math.max(1, dom.viewport.clientWidth - 14);
    const height = Math.max(1, dom.viewport.clientHeight - 14);
    const fitted = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
      Math.floor(Math.min(width / level.width, height / level.height))));
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
    const oldWidth = level.width * zoom;
    const oldHeight = level.height * zoom;
    const fractionX = (dom.viewport.scrollLeft + x - 16 - Math.max(0,(rect.width - 32 - oldWidth)/2)) / Math.max(1,oldWidth);
    const fractionY = (dom.viewport.scrollTop + y - 16 - Math.max(0,(rect.height - 32 - oldHeight)/2)) / Math.max(1,oldHeight);
    zoom = Math.round(next * 10) / 10;
    dom.board.style.setProperty('--cell', `${zoom}px`);
    dom.zoomLabel.textContent = `${Math.round(zoom / 30 * 100)}%`;
    const newWidth = level.width * zoom;
    const newHeight = level.height * zoom;
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
    if (suppressTap && dom.board.contains(event.target)) {
      event.preventDefault(); event.stopPropagation();
      clearTimeout(suppressTapTimer);
      suppressTapTimer = window.setTimeout(() => { suppressTap = false; }, 0);
    }
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseTimer(); else if (level && !dom.play.hidden) startTimer(); });
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
  if (window.TurnBeansLibraryUI) window.TurnBeansLibraryUI.mount({
    openLevel(data) { cloudLevels.set(data.id, data); startLevel(data.id, {fresh: progress.completed.includes(data.id)}); }
  });
})();
