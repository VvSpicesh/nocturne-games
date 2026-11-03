/* Turn Beans Phase 1-3: board, FIFO exchanges, undo/restart, save/restore. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TurnBeans = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TRAY_COUNT = 3;
  const TRAY_CAPACITY = 20;
  const MAX_TRANSFER = 10;
  const SAVE_VERSION = 1;
  const DIRECTIONS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // up, right, down, left

  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const validColor = color => typeof color === 'string' && color.length > 0;

  function normalizeCell(cell) {
    assert(cell && typeof cell === 'object', 'Each cell must be an object');
    if (cell.active === false) {
      assert(cell.beanColor == null, 'Inactive cells cannot hold beans');
      return { active: false, baseColor: null, beanColor: null };
    }
    assert(validColor(cell.baseColor), 'Active cells require a baseColor');
    assert(cell.beanColor == null || validColor(cell.beanColor), 'Invalid beanColor');
    return { active: true, baseColor: cell.baseColor, beanColor: cell.beanColor ?? null };
  }

  function countColors(board, trays) {
    const result = Object.create(null);
    const add = color => {
      if (color != null) result[color] = (result[color] || 0) + 1;
    };
    for (const row of board) for (const cell of row) if (cell.active) add(cell.beanColor);
    for (const queue of trays) for (const color of queue) add(color);
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
  }

  class TurnBeansEngine {
    constructor(board) {
      assert(Array.isArray(board) && board.length > 0, 'Board must have rows');
      assert(Array.isArray(board[0]) && board[0].length > 0, 'Board must have columns');
      this.height = board.length;
      this.width = board[0].length;
      assert(board.every(row => Array.isArray(row) && row.length === this.width), 'Board must be rectangular');
      this.board = board.map(row => row.map(normalizeCell));
      this.initialBoard = clone(this.board);
      this.trays = Array.from({ length: TRAY_COUNT }, () => []);
      this.steps = 0;
      this.history = [];
      this.initialCounts = countColors(this.board, this.trays);
      this.checkInvariants();
    }

    inBounds(row, col) { return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < this.height && col >= 0 && col < this.width; }

    getConnectedCells(row, col, limit = MAX_TRANSFER) {
      if (!this.inBounds(row, col)) return [];
      const start = this.board[row][col];
      if (!start.active || start.beanColor === null) return [];
      assert(Number.isInteger(limit) && limit >= 0, 'Invalid limit');
      const seen = new Set([row * this.width + col]);
      const queue = [[row, col]];
      const result = [];
      for (let head = 0; head < queue.length && result.length < limit; head++) {
        const [r, c] = queue[head];
        result.push({ row: r, col: c });
        for (const [dr, dc] of DIRECTIONS) {
          const nr = r + dr, nc = c + dc, key = nr * this.width + nc;
          if (!this.inBounds(nr, nc) || seen.has(key)) continue;
          seen.add(key);
          const neighbor = this.board[nr][nc];
          if (neighbor.active && neighbor.baseColor === start.baseColor && neighbor.beanColor === start.beanColor) queue.push([nr, nc]);
        }
      }
      return result;
    }

    getTray(index) {
      assert(Number.isInteger(index) && index >= 0 && index < TRAY_COUNT, 'Invalid tray index');
      return this.trays[index].slice();
    }

    getState() {
      return { board: clone(this.board), trays: clone(this.trays), steps: this.steps };
    }

    checkInvariants() {
      assert(this.trays.length === TRAY_COUNT, 'Wrong tray count');
      for (const tray of this.trays) {
        assert(Array.isArray(tray) && tray.length <= TRAY_CAPACITY, 'Tray capacity exceeded');
        assert(tray.every(validColor), 'Invalid color in tray');
      }
      assert(this.board.length === this.height && this.board.every(row => row.length === this.width), 'Board shape changed');
      for (let r = 0; r < this.height; r++) for (let c = 0; c < this.width; c++) {
        const original = this.initialBoard[r][c], current = this.board[r][c];
        assert(original.active === current.active && original.baseColor === current.baseColor, 'Base colors or active cells changed');
      }
      assert(JSON.stringify(countColors(this.board, this.trays)) === JSON.stringify(this.initialCounts), 'Bean color totals changed');
      return true;
    }

    take(row, col) {
      if (!this.inBounds(row, col)) return { ok: false, reason: 'out_of_bounds' };
      const cell = this.board[row][col];
      if (!cell.active || cell.beanColor === null) return { ok: false, reason: 'empty_or_inactive' };
      if (cell.beanColor === cell.baseColor) return { ok: false, reason: 'already_correct' };
      let chosen = -1, maxSpace = 0;
      for (let i = 0; i < TRAY_COUNT; i++) {
        const free = TRAY_CAPACITY - this.trays[i].length;
        if (free > maxSpace) { maxSpace = free; chosen = i; }
      }
      if (chosen < 0) return { ok: false, reason: 'trays_full' };
      const locations = this.getConnectedCells(row, col, Math.min(MAX_TRANSFER, maxSpace));
      if (!locations.length) return { ok: false, reason: 'no_cells' };
      const previous = this.getState();
      try {
        for (const position of locations) {
          const slot = this.board[position.row][position.col];
          this.trays[chosen].push(slot.beanColor);
          slot.beanColor = null;
        }
        this.steps++;
        this.checkInvariants();
        this.history.push(previous);
      } catch (error) {
        this.board = previous.board;
        this.trays = previous.trays;
        this.steps = previous.steps;
        throw error;
      }
      return { ok: true, type: 'take', trayIndex: chosen, count: locations.length, positions: locations };
    }

    // A swap only touches the connected component of the clicked cell. Empty
    // cells form their own component (same base and both beanColor === null).
    getSwapCells(row, col, limit = MAX_TRANSFER) {
      if (!this.inBounds(row, col)) return [];
      const start = this.board[row][col];
      if (!start.active || start.beanColor === start.baseColor) return [];
      assert(Number.isInteger(limit) && limit >= 0, 'Invalid limit');
      const seen = new Set([row * this.width + col]);
      const queue = [[row, col]];
      const result = [];
      for (let head = 0; head < queue.length && result.length < limit; head++) {
        const [r, c] = queue[head];
        result.push({ row: r, col: c });
        for (const [dr, dc] of DIRECTIONS) {
          const nr = r + dr, nc = c + dc, key = nr * this.width + nc;
          if (!this.inBounds(nr, nc) || seen.has(key)) continue;
          seen.add(key);
          const next = this.board[nr][nc];
          if (next.active && next.baseColor === start.baseColor && next.beanColor === start.beanColor) queue.push([nr, nc]);
        }
      }
      return result;
    }

    // Read-only candidate calculation. Only the consecutive equal-color
    // prefix of each FIFO queue is usable. The removed beans free capacity
    // before displaced beans are appended to the same queue.
    getBestSwap(row, col) {
      if (!this.inBounds(row, col)) return null;
      const start = this.board[row][col];
      if (!start.active || start.beanColor === start.baseColor) return null;
      const positions = this.getSwapCells(row, col);
      if (!positions.length) return null;
      let best = null;
      for (let trayIndex = 0; trayIndex < TRAY_COUNT; trayIndex++) {
        const tray = this.trays[trayIndex];
        let run = 0;
        while (run < tray.length && run < MAX_TRANSFER && tray[run] === start.baseColor) run++;
        const count = Math.min(run, positions.length);
        if (!count) continue;
        // The same count of displaced beans is appended for occupied cells;
        // empty cells append none. Thus final size cannot exceed old size.
        const candidate = { trayIndex, count, positions: positions.slice(0, count) };
        if (!best || candidate.count > best.count) best = candidate;
      }
      return best;
    }

    exchange(row, col) {
      const best = this.getBestSwap(row, col);
      if (!best) return { ok: false, reason: 'no_matching_tray' };
      const previous = this.getState();
      try {
        const queue = this.trays[best.trayIndex];
        const outgoing = queue.splice(0, best.count);
        const displaced = [];
        for (let i = 0; i < best.count; i++) {
          const { row: r, col: c } = best.positions[i];
          const slot = this.board[r][c];
          if (slot.beanColor !== null) displaced.push(slot.beanColor);
          slot.beanColor = outgoing[i];
        }
        queue.push(...displaced);
        this.steps++;
        this.checkInvariants();
        this.history.push(previous);
        return { ok: true, type: 'exchange', trayIndex: best.trayIndex,
          count: best.count, positions: best.positions, displaced };
      } catch (error) {
        this.board = previous.board;
        this.trays = previous.trays;
        this.steps = previous.steps;
        throw error;
      }
    }

    // Reverse one complete successful action, including its FIFO queues.
    undo() {
      if (!this.history.length) return { ok: false, reason: 'no_history' };
      const previous = this.history[this.history.length - 1];
      // Validate before mutating the live state.
      this.validateSnapshot(previous);
      this.board = clone(previous.board);
      this.trays = clone(previous.trays);
      this.steps = previous.steps;
      this.history.pop();
      this.checkInvariants();
      return { ok: true, type: 'undo', steps: this.steps };
    }

    // Restart the exact same scrambled puzzle, not a fresh random shuffle.
    restart() {
      this.board = clone(this.initialBoard);
      this.trays = Array.from({ length: TRAY_COUNT }, () => []);
      this.steps = 0;
      this.history = [];
      this.checkInvariants();
      return { ok: true, type: 'restart' };
    }

    isWon() {
      return this.trays.every(queue => queue.length === 0) &&
        this.board.every(row => row.every(cell => !cell.active || cell.beanColor === cell.baseColor));
    }

    hasLegalMove() {
      for (let row = 0; row < this.height; row++) {
        for (let col = 0; col < this.width; col++) {
          if (this.getBestSwap(row, col)) return true;
          const cell = this.board[row][col];
          if (cell.active && cell.beanColor !== null && cell.beanColor !== cell.baseColor &&
              this.trays.some(tray => tray.length < TRAY_CAPACITY)) return true;
        }
      }
      return false;
    }

    isStuck() { return !this.isWon() && !this.hasLegalMove(); }

    validateSnapshot(snapshot) {
      assert(snapshot && typeof snapshot === 'object', 'Invalid snapshot');
      assert(Number.isSafeInteger(snapshot.steps) && snapshot.steps >= 0, 'Invalid step count');
      assert(Array.isArray(snapshot.board) && snapshot.board.length === this.height &&
        snapshot.board.every(row => Array.isArray(row) && row.length === this.width), 'Invalid board shape');
      for (let r = 0; r < this.height; r++) for (let c = 0; c < this.width; c++) {
        const expected = this.initialBoard[r][c];
        const cell = snapshot.board[r][c];
        assert(cell && typeof cell === 'object' && cell.active === expected.active &&
          cell.baseColor === expected.baseColor, 'Saved board layout changed');
        assert(cell.beanColor === null || (cell.active && validColor(cell.beanColor)), 'Invalid saved bean');
      }
      assert(Array.isArray(snapshot.trays) && snapshot.trays.length === TRAY_COUNT &&
        snapshot.trays.every(tray => Array.isArray(tray) && tray.length <= TRAY_CAPACITY &&
          tray.every(validColor)), 'Invalid saved trays');
      assert(JSON.stringify(countColors(snapshot.board, snapshot.trays)) ===
        JSON.stringify(this.initialCounts), 'Saved bean totals changed');
      return true;
    }

    // JSON-safe pure data. Persist it in localStorage in the UI layer.
    exportSave() {
      this.checkInvariants();
      return clone({ version: SAVE_VERSION, initialBoard: this.initialBoard,
        current: this.getState(), history: this.history });
    }

    static fromSave(data) {
      assert(data && typeof data === 'object' && data.version === SAVE_VERSION,
        'Unsupported save version');
      const engine = new TurnBeansEngine(data.initialBoard);
      assert(Array.isArray(data.history), 'Invalid saved history');
      engine.validateSnapshot(data.current);
      for (let i = 0; i < data.history.length; i++) {
        engine.validateSnapshot(data.history[i]);
        assert(data.history[i].steps === i, 'Invalid history step sequence');
      }
      assert(data.current.steps === data.history.length, 'History and steps mismatch');
      assert(data.history.length === 0 ||
        JSON.stringify(data.history[0]) === JSON.stringify(engine.getState()),
        'History does not begin at initial state');
      engine.board = clone(data.current.board);
      engine.trays = clone(data.current.trays);
      engine.steps = data.current.steps;
      engine.history = clone(data.history);
      engine.checkInvariants();
      return engine;
    }

    // A click either exchanges, takes, or makes no change: never both.
    click(row, col) {
      const best = this.getBestSwap(row, col);
      if (best) return this.exchange(row, col);
      return this.take(row, col);
    }

  }

  return { TurnBeansEngine, TRAY_COUNT, TRAY_CAPACITY, MAX_TRANSFER, SAVE_VERSION, countColors };
});
