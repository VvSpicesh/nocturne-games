/* Compact on-disk snapshots. Existing full v1 saves remain readable. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TurnBeansSaveCodec = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SYMBOLS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
  const COMPACT_VERSION = 1;
  function getPalette(initialBoard) {
    const colors = [...new Set(initialBoard.flat().filter(cell => cell.active).map(cell => cell.beanColor))].sort();
    if (colors.length >= SYMBOLS.length) throw new Error('Too many bean colors');
    return colors;
  }
  function encodeSave(save) {
    const original = save.initialBoard;
    const palette = getPalette(original);
    const encodeColor = color => {
      if (color === null) return SYMBOLS[0];
      const i = palette.indexOf(color);
      if (i < 0) throw new Error('Unknown bean color in save');
      return SYMBOLS[i + 1];
    };
    const encodeSnapshot = state => ({
      steps: state.steps,
      beans: state.board.flat().map((cell, i) => original[Math.floor(i / original[0].length)][i % original[0].length].active ? encodeColor(cell.beanColor) : '').join(''),
      trays: state.trays.map(tray => tray.map(encodeColor).join(''))
    });
    return { compactVersion: COMPACT_VERSION, palette,
      current: encodeSnapshot(save.current),
      history: save.history.map(encodeSnapshot) };
  }
  function decodeSave(compact, initialBoard) {
    if (!compact || compact.compactVersion !== COMPACT_VERSION) throw new Error('Unsupported compact save');
    const palette = getPalette(initialBoard);
    if (JSON.stringify(palette) !== JSON.stringify(compact.palette)) throw new Error('Save palette mismatch');
    const decodeColor = symbol => {
      const idx = SYMBOLS.indexOf(symbol);
      if (idx < 0 || idx > palette.length) throw new Error('Unknown bean symbol');
      return idx === 0 ? null : palette[idx - 1];
    };
    const activeCount = initialBoard.flat().filter(cell => cell.active).length;
    const decodeSnapshot = state => {
      if (!state || typeof state.beans !== 'string' || state.beans.length !== activeCount || !Array.isArray(state.trays) || state.trays.length !== 3 || !Number.isSafeInteger(state.steps)) throw new Error('Invalid compact snapshot');
      let i = 0;
      const board = initialBoard.map(row => row.map(cell => cell.active ? { ...cell, beanColor: decodeColor(state.beans[i++]) } : { ...cell }));
      const trays = state.trays.map(q => {
        if (typeof q !== 'string') throw new Error('Invalid compact tray');
        return [...q].map(decodeColor);
      });
      return { board, trays, steps: state.steps };
    };
    if (!Array.isArray(compact.history)) throw new Error('Invalid compact history');
    return { version: 1, initialBoard,
      current: decodeSnapshot(compact.current),
      history: compact.history.map(decodeSnapshot) };
  }
  return { encodeSave, decodeSave };
});
