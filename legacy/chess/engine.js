const ChessEngine = (() => {
  const BACK_RANK = ["r","n","b","q","k","b","n","r"];

  function inside(row, column) {
    return row >= 0 && row < 8 && column >= 0 && column < 8;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function initialBoard() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));

    for (let column = 0; column < 8; column++) {
      board[0][column] = { color: "b", type: BACK_RANK[column] };
      board[1][column] = { color: "b", type: "p" };
      board[6][column] = { color: "w", type: "p" };
      board[7][column] = { color: "w", type: BACK_RANK[column] };
    }

    return board;
  }

  function pseudoMoves(board, row, column) {
    const piece = board[row][column];
    const moves = [];

    if (!piece) return moves;

    function add(targetRow, targetColumn) {
      if (!inside(targetRow, targetColumn)) return;

      const target = board[targetRow][targetColumn];

      if (!target || target.color !== piece.color) {
        moves.push({ r: targetRow, c: targetColumn });
      }
    }

    if (piece.type === "p") {
      const direction = piece.color === "w" ? -1 : 1;
      const startingRow = piece.color === "w" ? 6 : 1;

      if (inside(row + direction, column) && !board[row + direction][column]) {
        moves.push({ r: row + direction, c: column });

        if (
          row === startingRow &&
          !board[row + direction * 2][column]
        ) {
          moves.push({ r: row + direction * 2, c: column });
        }
      }

      for (const columnOffset of [-1, 1]) {
        const targetRow = row + direction;
        const targetColumn = column + columnOffset;

        if (
          inside(targetRow, targetColumn) &&
          board[targetRow][targetColumn] &&
          board[targetRow][targetColumn].color !== piece.color
        ) {
          moves.push({ r: targetRow, c: targetColumn });
        }
      }
    }

    if (piece.type === "n") {
      const offsets = [
        [-2,-1],[-2,1],[-1,-2],[-1,2],
        [1,-2],[1,2],[2,-1],[2,1]
      ];

      for (const [rowOffset, columnOffset] of offsets) {
        add(row + rowOffset, column + columnOffset);
      }
    }

    if (["b","r","q"].includes(piece.type)) {
      const directions =
        piece.type === "b"
          ? [[1,1],[1,-1],[-1,1],[-1,-1]]
          : piece.type === "r"
            ? [[1,0],[-1,0],[0,1],[0,-1]]
            : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];

      for (const [rowOffset, columnOffset] of directions) {
        let targetRow = row + rowOffset;
        let targetColumn = column + columnOffset;

        while (inside(targetRow, targetColumn)) {
          const target = board[targetRow][targetColumn];

          if (!target) {
            moves.push({ r: targetRow, c: targetColumn });
          } else {
            if (target.color !== piece.color) {
              moves.push({ r: targetRow, c: targetColumn });
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
    }

    return moves;
  }

  function allMoves(board, color) {
    const result = [];

    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        if (board[row][column]?.color === color) {
          for (const move of pseudoMoves(board, row, column)) {
            result.push({
              fromRow: row,
              fromColumn: column,
              ...move
            });
          }
        }
      }
    }

    return result;
  }

  function applyMove(board, move) {
    const next = clone(board);
    const piece = next[move.fromRow][move.fromColumn];

    next[move.r][move.c] = piece;
    next[move.fromRow][move.fromColumn] = null;

    if (piece.type === "p" && (move.r === 0 || move.r === 7)) {
      piece.type = "q";
    }

    return next;
  }

  function pieceValue(type) {
    return {
      p: 100,
      n: 320,
      b: 330,
      r: 500,
      q: 900,
      k: 20000
    }[type] || 0;
  }

  return {
    initialBoard,
    clone,
    pseudoMoves,
    allMoves,
    applyMove,
    pieceValue
  };
})();
