/**
 * Nocturne Chess engine — sole source of truth for rules.
 * All mutations go through clone + applyMove; simulations never touch the live state.
 */
const ChessEngine = (() => {
  "use strict";

  const BACK_RANK = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  function inside(row, column) {
    return row >= 0 && row < 8 && column >= 0 && column < 8;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emptyBoard() {
    return Array.from({ length: 8 }, () => Array(8).fill(null));
  }

  function createInitialState() {
    const board = emptyBoard();

    for (let column = 0; column < 8; column++) {
      board[0][column] = { color: "b", type: BACK_RANK[column] };
      board[1][column] = { color: "b", type: "p" };
      board[6][column] = { color: "w", type: "p" };
      board[7][column] = { color: "w", type: BACK_RANK[column] };
    }

    return {
      board,
      turn: "w",
      castlingRights: { wK: true, wQ: true, bK: true, bQ: true },
      enPassantTarget: null
    };
  }

  function cloneState(state) {
    return clone(state);
  }

  function findKing(state, color) {
    const board = state.board;

    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        const piece = board[row][column];
        if (piece && piece.color === color && piece.type === "k") {
          return { row, column };
        }
      }
    }

    return null;
  }

  function isSquareAttacked(state, row, column, byColor) {
    const board = state.board;
    const enemyPawnDir = byColor === "w" ? 1 : -1;

    for (const columnOffset of [-1, 1]) {
      const r = row + enemyPawnDir;
      const c = column + columnOffset;
      if (!inside(r, c)) continue;
      const piece = board[r][c];
      if (piece && piece.color === byColor && piece.type === "p") return true;
    }

    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];

    for (const [rowOffset, columnOffset] of knightOffsets) {
      const r = row + rowOffset;
      const c = column + columnOffset;
      if (!inside(r, c)) continue;
      const piece = board[r][c];
      if (piece && piece.color === byColor && piece.type === "n") return true;
    }

    for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset++) {
        if (!rowOffset && !columnOffset) continue;
        const r = row + rowOffset;
        const c = column + columnOffset;
        if (!inside(r, c)) continue;
        const piece = board[r][c];
        if (piece && piece.color === byColor && piece.type === "k") return true;
      }
    }

    const diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [rowOffset, columnOffset] of diagonal) {
      let r = row + rowOffset;
      let c = column + columnOffset;
      while (inside(r, c)) {
        const piece = board[r][c];
        if (piece) {
          if (
            piece.color === byColor &&
            (piece.type === "b" || piece.type === "q")
          ) {
            return true;
          }
          break;
        }
        r += rowOffset;
        c += columnOffset;
      }
    }

    const orthogonal = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [rowOffset, columnOffset] of orthogonal) {
      let r = row + rowOffset;
      let c = column + columnOffset;
      while (inside(r, c)) {
        const piece = board[r][c];
        if (piece) {
          if (
            piece.color === byColor &&
            (piece.type === "r" || piece.type === "q")
          ) {
            return true;
          }
          break;
        }
        r += rowOffset;
        c += columnOffset;
      }
    }

    return false;
  }

  function isInCheck(state, color) {
    const king = findKing(state, color);
    if (!king) return false;
    const attacker = color === "w" ? "b" : "w";
    return isSquareAttacked(state, king.row, king.column, attacker);
  }

  function pushMove(moves, fromRow, fromColumn, toRow, toColumn, extra) {
    moves.push({
      fromRow,
      fromColumn,
      r: toRow,
      c: toColumn,
      ...(extra || {})
    });
  }

  function getPseudoMoves(state, row, column) {
    const board = state.board;
    const piece = board[row][column];
    const moves = [];

    if (!piece) return moves;

    function add(targetRow, targetColumn) {
      if (!inside(targetRow, targetColumn)) return;
      const target = board[targetRow][targetColumn];
      if (!target || target.color !== piece.color) {
        pushMove(moves, row, column, targetRow, targetColumn);
      }
    }

    if (piece.type === "p") {
      const direction = piece.color === "w" ? -1 : 1;
      const startingRow = piece.color === "w" ? 6 : 1;
      const promotionRow = piece.color === "w" ? 0 : 7;

      const oneRow = row + direction;
      if (inside(oneRow, column) && !board[oneRow][column]) {
        if (oneRow === promotionRow) {
          for (const promotion of ["q", "r", "b", "n"]) {
            pushMove(moves, row, column, oneRow, column, { promotion });
          }
        } else {
          pushMove(moves, row, column, oneRow, column);
          const twoRow = row + direction * 2;
          if (
            row === startingRow &&
            inside(twoRow, column) &&
            !board[twoRow][column]
          ) {
            pushMove(moves, row, column, twoRow, column, { doublePush: true });
          }
        }
      }

      for (const columnOffset of [-1, 1]) {
        const targetRow = row + direction;
        const targetColumn = column + columnOffset;
        if (!inside(targetRow, targetColumn)) continue;

        const target = board[targetRow][targetColumn];
        if (target && target.color !== piece.color) {
          if (targetRow === promotionRow) {
            for (const promotion of ["q", "r", "b", "n"]) {
              pushMove(moves, row, column, targetRow, targetColumn, {
                promotion
              });
            }
          } else {
            pushMove(moves, row, column, targetRow, targetColumn);
          }
        }

        const ep = state.enPassantTarget;
        if (
          ep &&
          ep.row === targetRow &&
          ep.column === targetColumn
        ) {
          pushMove(moves, row, column, targetRow, targetColumn, {
            enPassant: true
          });
        }
      }
    }

    if (piece.type === "n") {
      const offsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      for (const [rowOffset, columnOffset] of offsets) {
        add(row + rowOffset, column + columnOffset);
      }
    }

    if (["b", "r", "q"].includes(piece.type)) {
      const directions =
        piece.type === "b"
          ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
          : piece.type === "r"
            ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
            : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];

      for (const [rowOffset, columnOffset] of directions) {
        let targetRow = row + rowOffset;
        let targetColumn = column + columnOffset;

        while (inside(targetRow, targetColumn)) {
          const target = board[targetRow][targetColumn];
          if (!target) {
            pushMove(moves, row, column, targetRow, targetColumn);
          } else {
            if (target.color !== piece.color) {
              pushMove(moves, row, column, targetRow, targetColumn);
            }
            break;
          }
          targetRow += rowOffset;
          targetColumn += columnOffset;
        }
      }
    }

    if (piece.type === "k") {
      for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset++) {
          if (rowOffset || columnOffset) {
            add(row + rowOffset, column + columnOffset);
          }
        }
      }

      const rights = state.castlingRights;
      const homeRow = piece.color === "w" ? 7 : 0;
      const opponent = piece.color === "w" ? "b" : "w";

      if (row === homeRow && column === 4 && !isInCheck(state, piece.color)) {
        if (
          (piece.color === "w" ? rights.wK : rights.bK) &&
          !board[homeRow][5] &&
          !board[homeRow][6] &&
          board[homeRow][7]?.type === "r" &&
          board[homeRow][7]?.color === piece.color &&
          !isSquareAttacked(state, homeRow, 5, opponent) &&
          !isSquareAttacked(state, homeRow, 6, opponent)
        ) {
          pushMove(moves, row, column, homeRow, 6, { castle: "king" });
        }

        if (
          (piece.color === "w" ? rights.wQ : rights.bQ) &&
          !board[homeRow][1] &&
          !board[homeRow][2] &&
          !board[homeRow][3] &&
          board[homeRow][0]?.type === "r" &&
          board[homeRow][0]?.color === piece.color &&
          !isSquareAttacked(state, homeRow, 3, opponent) &&
          !isSquareAttacked(state, homeRow, 2, opponent)
        ) {
          pushMove(moves, row, column, homeRow, 2, { castle: "queen" });
        }
      }
    }

    return moves;
  }

  function leavesKingInCheck(state, move, color) {
    const next = applyMoveRaw(state, move, false);
    if (!next.ok) return true;
    return isInCheck(next.state, color);
  }

  function getLegalMoves(state, row, column) {
    const piece = state.board[row][column];
    if (!piece || piece.color !== state.turn) return [];

    return getPseudoMoves(state, row, column).filter(
      (move) => !leavesKingInCheck(state, move, piece.color)
    );
  }

  function getAllLegalMoves(state, color) {
    const result = [];
    const board = state.board;

    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        if (board[row][column]?.color === color) {
          const probe = { ...state, turn: color };
          for (const move of getLegalMoves(probe, row, column)) {
            result.push(move);
          }
        }
      }
    }

    return result;
  }

  function clearCastleOnRookCapture(rights, capturedOnRow, capturedOnColumn) {
    if (capturedOnRow === 7 && capturedOnColumn === 0) rights.wQ = false;
    if (capturedOnRow === 7 && capturedOnColumn === 7) rights.wK = false;
    if (capturedOnRow === 0 && capturedOnColumn === 0) rights.bQ = false;
    if (capturedOnRow === 0 && capturedOnColumn === 7) rights.bK = false;
  }

  /**
   * Internal apply. When validate is true, rejects illegal moves.
   * Never mutates the input state.
   */
  function applyMoveRaw(state, move, validate) {
    if (validate) {
      const legal = getAllLegalMoves(state, state.turn).some(
        (candidate) =>
          candidate.fromRow === move.fromRow &&
          candidate.fromColumn === move.fromColumn &&
          candidate.r === move.r &&
          candidate.c === move.c &&
          (candidate.promotion || null) === (move.promotion || null) &&
          (candidate.castle || null) === (move.castle || null) &&
          Boolean(candidate.enPassant) === Boolean(move.enPassant)
      );

      if (!legal) {
        return { ok: false, error: "illegal-move" };
      }
    }

    const next = cloneState(state);
    const board = next.board;
    const moving = board[move.fromRow][move.fromColumn];

    if (!moving) {
      return { ok: false, error: "empty-from" };
    }

    let captured = board[move.r][move.c] ? clone(board[move.r][move.c]) : null;
    let capturedAt = captured ? { row: move.r, column: move.c } : null;

    if (move.enPassant) {
      const captureRow = move.fromRow;
      captured = board[captureRow][move.c] ? clone(board[captureRow][move.c]) : null;
      capturedAt = { row: captureRow, column: move.c };
      board[captureRow][move.c] = null;
    }

    if (move.castle === "king") {
      board[move.r][5] = board[move.r][7];
      board[move.r][7] = null;
    }

    if (move.castle === "queen") {
      board[move.r][3] = board[move.r][0];
      board[move.r][0] = null;
    }

    board[move.r][move.c] = moving;
    board[move.fromRow][move.fromColumn] = null;

    const movedTypeBeforePromotion = moving.type;

    if (moving.type === "p" && (move.r === 0 || move.r === 7)) {
      moving.type = move.promotion || "q";
    }

    if (movedTypeBeforePromotion === "k") {
      if (moving.color === "w") {
        next.castlingRights.wK = false;
        next.castlingRights.wQ = false;
      } else {
        next.castlingRights.bK = false;
        next.castlingRights.bQ = false;
      }
    }

    if (movedTypeBeforePromotion === "r") {
      if (moving.color === "w" && move.fromRow === 7 && move.fromColumn === 0) {
        next.castlingRights.wQ = false;
      }
      if (moving.color === "w" && move.fromRow === 7 && move.fromColumn === 7) {
        next.castlingRights.wK = false;
      }
      if (moving.color === "b" && move.fromRow === 0 && move.fromColumn === 0) {
        next.castlingRights.bQ = false;
      }
      if (moving.color === "b" && move.fromRow === 0 && move.fromColumn === 7) {
        next.castlingRights.bK = false;
      }
    }

    if (captured) {
      clearCastleOnRookCapture(
        next.castlingRights,
        capturedAt.row,
        capturedAt.column
      );
    }

    if (move.doublePush) {
      const direction = moving.color === "w" ? -1 : 1;
      next.enPassantTarget = {
        row: move.fromRow + direction,
        column: move.fromColumn
      };
    } else {
      next.enPassantTarget = null;
    }

    next.turn = state.turn === "w" ? "b" : "w";

    return {
      ok: true,
      state: next,
      movingPiece: {
        color: moving.color,
        type: movedTypeBeforePromotion
      },
      promotedTo: movedTypeBeforePromotion === "p" && (move.r === 0 || move.r === 7)
        ? moving.type
        : null,
      captured,
      move: clone(move)
    };
  }

  function applyMove(state, move) {
    if (evaluateGameState(state).gameOver) {
      return { ok: false, error: "game-over" };
    }

    return applyMoveRaw(state, move, true);
  }

  function evaluateGameState(state) {
    const side = state.turn;
    const inCheck = isInCheck(state, side);
    const moves = getAllLegalMoves(state, side);

    if (!moves.length) {
      if (inCheck) {
        return { status: "checkmate", gameOver: true, inCheck: true, side };
      }
      return { status: "stalemate", gameOver: true, inCheck: false, side };
    }

    if (inCheck) {
      return { status: "check", gameOver: false, inCheck: true, side };
    }

    return { status: "playing", gameOver: false, inCheck: false, side };
  }

  function pieceValue(type) {
    return PIECE_VALUE[type] || 0;
  }

  function materialScore(state, perspective) {
    let score = 0;
    const board = state.board;

    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        const piece = board[row][column];
        if (!piece) continue;
        const value = pieceValue(piece.type);
        score += piece.color === perspective ? value : -value;
      }
    }

    return score;
  }

  function centerBonus(move) {
    const centerDistance =
      Math.abs(3.5 - move.r) + Math.abs(3.5 - move.c);
    return Math.max(0, 7 - centerDistance) * 3;
  }

  /** Compatibility aliases used by older call sites during transition. */
  function initialBoard() {
    return createInitialState().board;
  }

  function pseudoMoves(board, row, column) {
    return getPseudoMoves(
      {
        board,
        turn: board[row][column]?.color || "w",
        castlingRights: { wK: false, wQ: false, bK: false, bQ: false },
        enPassantTarget: null
      },
      row,
      column
    );
  }

  function allMoves(board, color) {
    return getAllLegalMoves(
      {
        board,
        turn: color,
        castlingRights: { wK: false, wQ: false, bK: false, bQ: false },
        enPassantTarget: null
      },
      color
    );
  }

  return {
    createInitialState,
    cloneState,
    findKing,
    isSquareAttacked,
    isInCheck,
    getPseudoMoves,
    getLegalMoves,
    getAllLegalMoves,
    applyMove,
    evaluateGameState,
    pieceValue,
    materialScore,
    centerBonus,
    // compatibility
    initialBoard,
    clone,
    pseudoMoves,
    allMoves
  };
})();
