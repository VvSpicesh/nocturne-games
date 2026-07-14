(() => {
  "use strict";

  const PIECES = {
    w: { k:"♔", q:"♕", r:"♖", b:"♗", n:"♘", p:"♙" },
    b: { k:"♚", q:"♛", r:"♜", b:"♝", n:"♞", p:"♟" }
  };

  const app = {
    board: ChessEngine.initialBoard(),
    turn: "w",
    selected: null,
    legalMoves: [],
    flipped: false,
    moveHistory: [],
    notation: [],
    lastMove: null,
    mode: "local",
    difficulty: "normal",
    aiBusy: false,

    init() {
      this.mode = localStorage.getItem("ng-chess-mode-v023") || "local";
      this.difficulty = localStorage.getItem("ng-chess-difficulty-v023") || "normal";

      const modeSelect = document.getElementById("modeSelect");
      const difficultySelect = document.getElementById("difficultySelect");

      modeSelect.value = this.mode;
      difficultySelect.value = this.difficulty;
      difficultySelect.disabled = this.mode !== "ai";

      modeSelect.addEventListener("change", () => {
        this.mode = modeSelect.value;
        difficultySelect.disabled = this.mode !== "ai";
        localStorage.setItem("ng-chess-mode-v023", this.mode);

        this.showToast(
          this.mode === "ai"
            ? "人机模式：你执白棋"
            : "已切换为本地双人"
        );

        if (this.mode === "ai" && this.turn === "b") {
          this.scheduleAi();
        }
      });

      difficultySelect.addEventListener("change", () => {
        this.difficulty = difficultySelect.value;
        localStorage.setItem("ng-chess-difficulty-v023", this.difficulty);
      });

      document.getElementById("resetChess").addEventListener("click", () => this.reset());
      document.getElementById("undoChess").addEventListener("click", () => this.undo());
      document.getElementById("flipChess").addEventListener("click", () => {
        this.flipped = !this.flipped;
        this.selected = null;
        this.legalMoves = [];
        this.render();
      });

      document.getElementById("engineStatus").textContent = "棋盘引擎已加载，可以走棋";
      this.render();
    },

    reset() {
      this.board = ChessEngine.initialBoard();
      this.turn = "w";
      this.selected = null;
      this.legalMoves = [];
      this.moveHistory = [];
      this.notation = [];
      this.lastMove = null;
      this.aiBusy = false;
      this.render();
    },

    handleSquare(row, column) {
      if (this.aiBusy) return;

      if (this.mode === "ai" && this.turn === "b") {
        this.showToast("现在轮到电脑走棋");
        return;
      }

      const piece = this.board[row][column];

      if (this.selected) {
        const selectedMove = this.legalMoves.find(
          (move) => move.r === row && move.c === column
        );

        if (selectedMove) {
          this.makeMove(
            this.selected.row,
            this.selected.column,
            selectedMove
          );
          return;
        }

        if (piece?.color === this.turn) {
          this.selected = { row, column };
          this.legalMoves = ChessEngine.pseudoMoves(this.board, row, column);
          this.render();
          return;
        }

        this.selected = null;
        this.legalMoves = [];
        this.render();
        return;
      }

      if (piece?.color === this.turn) {
        this.selected = { row, column };
        this.legalMoves = ChessEngine.pseudoMoves(this.board, row, column);
        this.render();
      }
    },

    makeMove(fromRow, fromColumn, move) {
      const movingPiece = this.board[fromRow][fromColumn];
      const capturedPiece = this.board[move.r][move.c];

      this.moveHistory.push({
        board: ChessEngine.clone(this.board),
        turn: this.turn,
        lastMove: this.lastMove ? { ...this.lastMove } : null,
        notation: [...this.notation]
      });

      this.board[move.r][move.c] = movingPiece;
      this.board[fromRow][fromColumn] = null;

      if (
        movingPiece.type === "p" &&
        (move.r === 0 || move.r === 7)
      ) {
        movingPiece.type = "q";
      }

      const from = String.fromCharCode(97 + fromColumn) + (8 - fromRow);
      const to = String.fromCharCode(97 + move.c) + (8 - move.r);

      this.notation.push(
        `${PIECES[movingPiece.color][movingPiece.type]} ${from} → ${to}${capturedPiece ? " ×" : ""}`
      );

      this.lastMove = {
        fromRow,
        fromColumn,
        toRow: move.r,
        toColumn: move.c
      };

      this.turn = this.turn === "w" ? "b" : "w";
      this.selected = null;
      this.legalMoves = [];
      this.render();

      if (this.mode === "ai" && this.turn === "b") {
        this.scheduleAi();
      }
    },

    undo() {
      if (!this.moveHistory.length || this.aiBusy) {
        this.showToast("没有可以悔的棋");
        return;
      }

      let previous = this.moveHistory.pop();

      this.board = previous.board;
      this.turn = previous.turn;
      this.lastMove = previous.lastMove;
      this.notation = previous.notation;

      if (
        this.mode === "ai" &&
        this.turn === "b" &&
        this.moveHistory.length
      ) {
        previous = this.moveHistory.pop();
        this.board = previous.board;
        this.turn = previous.turn;
        this.lastMove = previous.lastMove;
        this.notation = previous.notation;
      }

      this.selected = null;
      this.legalMoves = [];
      this.render();
    },

    scheduleAi() {
      if (this.aiBusy) return;

      this.aiBusy = true;
      this.renderStatus();

      window.setTimeout(() => {
        try {
          this.performAiMove();
        } finally {
          this.aiBusy = false;
          this.renderStatus();
        }
      }, 420);
    },

    performAiMove() {
      const moves = ChessEngine.allMoves(this.board, "b");

      if (!moves.length) {
        this.showToast("电脑没有可走的棋");
        return;
      }

      let chosenMove;

      if (this.difficulty === "easy") {
        chosenMove = moves[Math.floor(Math.random() * moves.length)];
      } else {
        const ranked = moves
          .map((move) => {
            const target = this.board[move.r][move.c];
            const moving = this.board[move.fromRow][move.fromColumn];

            let score = target
              ? ChessEngine.pieceValue(target.type) * 10 -
                ChessEngine.pieceValue(moving.type)
              : 0;

            const centerDistance =
              Math.abs(3.5 - move.r) +
              Math.abs(3.5 - move.c);

            score += Math.max(0, 7 - centerDistance) * 3;
            score += Math.random() * 20;

            return { move, score };
          })
          .sort((a, b) => b.score - a.score);

        if (this.difficulty === "hard") {
          chosenMove = ranked[0].move;
        } else {
          const candidateCount = Math.min(4, ranked.length);
          chosenMove = ranked[
            Math.floor(Math.random() * candidateCount)
          ].move;
        }
      }

      this.makeMove(
        chosenMove.fromRow,
        chosenMove.fromColumn,
        chosenMove
      );
    },

    createPieceSvg(piece) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.classList.add(
        "piece-svg",
        piece.color === "w" ? "white-piece" : "black-piece"
      );

      if (
        (!this.flipped && piece.color === "b") ||
        (this.flipped && piece.color === "w")
      ) {
        svg.classList.add("face-black");
      }

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", "50");
      text.setAttribute("y", "51");
      text.textContent = PIECES[piece.color][piece.type];

      svg.appendChild(text);
      return svg;
    },

    render() {
      const boardElement = document.getElementById("chessBoard");
      boardElement.innerHTML = "";

      const rows = this.flipped
        ? [7,6,5,4,3,2,1,0]
        : [0,1,2,3,4,5,6,7];

      const columns = this.flipped
        ? [7,6,5,4,3,2,1,0]
        : [0,1,2,3,4,5,6,7];

      for (const row of rows) {
        for (const column of columns) {
          const square = document.createElement("div");
          square.className =
            `square ${(row + column) % 2 ? "dark" : "light"}`;

          if (
            this.selected?.row === row &&
            this.selected?.column === column
          ) {
            square.classList.add("selected");
          }

          if (
            this.lastMove &&
            (
              (
                this.lastMove.fromRow === row &&
                this.lastMove.fromColumn === column
              ) ||
              (
                this.lastMove.toRow === row &&
                this.lastMove.toColumn === column
              )
            )
          ) {
            square.classList.add("last");
          }

          const legalMove = this.legalMoves.find(
            (move) => move.r === row && move.c === column
          );

          if (legalMove) {
            square.classList.add(
              this.board[row][column] ? "capture" : "move"
            );
          }

          const piece = this.board[row][column];

          if (piece) {
            square.appendChild(this.createPieceSvg(piece));
          }

          square.addEventListener(
            "click",
            () => this.handleSquare(row, column)
          );

          boardElement.appendChild(square);
        }
      }

      this.renderStatus();
      this.renderMoves();
    },

    renderStatus() {
      document.getElementById("turnText").textContent =
        this.turn === "w" ? "白方回合" : "黑方回合";

      document.getElementById("statusText").textContent =
        this.aiBusy
          ? "电脑正在思考…"
          : "点击棋子开始走棋。";
    },

    renderMoves() {
      const moveList = document.getElementById("moveList");

      if (!this.notation.length) {
        moveList.textContent = "暂无棋谱";
        return;
      }

      moveList.innerHTML = this.notation
        .map(
          (move, index) =>
            `<div class="move-entry">${index + 1}. ${move}</div>`
        )
        .join("");

      moveList.scrollTop = moveList.scrollHeight;
    },

    showToast(message) {
      const toast = document.getElementById("chessToast");
      toast.textContent = message;
      toast.classList.add("show");

      clearTimeout(toast.hideTimer);

      toast.hideTimer = window.setTimeout(
        () => toast.classList.remove("show"),
        1600
      );
    }
  };

  window.addEventListener("DOMContentLoaded", () => {
    try {
      app.init();
    } catch (error) {
      console.error(error);
      document.getElementById("engineStatus").textContent =
        "棋盘启动失败：" + error.message;
    }
  });
})();
