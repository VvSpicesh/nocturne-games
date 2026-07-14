const ChessRenderer = (() => {
  "use strict";

  const PIECES = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }
  };

  function squareName(row, column) {
    return String.fromCharCode(97 + column) + (8 - row);
  }

  function createPieceSvg(app, piece) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.classList.add(
      "piece-svg",
      piece.color === "w" ? "white-piece" : "black-piece"
    );

    const away =
      (!app.flipped && piece.color === "b") ||
      (app.flipped && piece.color === "w");

    if (away) svg.classList.add("face-away");

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", "50");
    text.setAttribute("y", "51");
    text.textContent = PIECES[piece.color][piece.type];
    svg.appendChild(text);
    return svg;
  }

  function formatClock(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    if (h > 0) return `${h}:${mm}:${ss}`;
    return `${mm}:${ss}`;
  }

  function formatMoveNotation(record) {
    const {
      movingPiece,
      fromRow,
      fromColumn,
      move,
      captured,
      promotedTo,
      castle,
      gaveCheck,
      checkmate
    } = record;

    if (castle === "king") {
      return `O-O${checkmate ? "#" : gaveCheck ? "+" : ""}`;
    }
    if (castle === "queen") {
      return `O-O-O${checkmate ? "#" : gaveCheck ? "+" : ""}`;
    }

    const pieceGlyph = PIECES[movingPiece.color][movingPiece.type];
    const from = squareName(fromRow, fromColumn);
    const to = squareName(move.r, move.c);
    const captureMark = captured || move.enPassant ? "x" : "";
    const promo = promotedTo
      ? `=${PIECES[movingPiece.color][promotedTo]}`
      : "";
    const suffix = checkmate ? "#" : gaveCheck ? "+" : "";

    return `${pieceGlyph} ${from}${captureMark}${to}${promo}${suffix}`;
  }

  function setTheme(theme) {
    const shell = document.querySelector(".board-shell");
    if (shell) shell.setAttribute("data-theme", theme === "wood" ? "wood" : "blue");
  }

  function renderStatus(app) {
    const turnText = document.getElementById("turnText");
    const statusText = document.getElementById("statusText");

    if (app.gameStatus === "checkmate") {
      const winner = app.engineState.turn === "w" ? "黑方" : "白方";
      turnText.textContent = "将死";
      statusText.textContent = `${winner}胜利。对局结束。`;
      return;
    }

    if (app.gameStatus === "stalemate") {
      turnText.textContent = "和棋";
      statusText.textContent = "逼和。对局结束。";
      return;
    }

    turnText.textContent =
      app.engineState.turn === "w" ? "白方回合" : "黑方回合";

    if (app.aiBusy) {
      statusText.textContent = "电脑正在思考…";
      return;
    }

    if (app.gameStatus === "check") {
      statusText.textContent = "将军！请解除被将。";
      return;
    }

    statusText.textContent = "点击棋子开始走棋。";
  }

  function renderMoves(app) {
    const moveList = document.getElementById("moveList");
    if (!app.notation.length) {
      moveList.textContent = "暂无棋谱";
      return;
    }

    moveList.innerHTML = app.notation
      .map((entry, index) => `<div class="move-entry">${index + 1}. ${entry}</div>`)
      .join("");
    moveList.scrollTop = moveList.scrollHeight;
  }

  function renderCaptured(app) {
    const whiteBox = document.getElementById("capturedByWhite");
    const blackBox = document.getElementById("capturedByBlack");

    const renderLine = (pieces, color) => {
      if (!pieces.length) return "—";
      return pieces.map((type) => PIECES[color][type]).join(" ");
    };

    // White captured black pieces (show black glyphs)
    whiteBox.textContent = renderLine(app.capturedPieces.w, "b");
    // Black captured white pieces
    blackBox.textContent = renderLine(app.capturedPieces.b, "w");
  }

  function renderClock(app) {
    document.getElementById("clockText").textContent = formatClock(
      app.getElapsedSeconds()
    );
  }

  function renderSaveStatus(app) {
    const el = document.getElementById("saveStatus");
    el.textContent = app.saveLabel || "未保存";
  }

  function uniqueTargetMoves(moves) {
    const map = new Map();
    for (const move of moves) {
      const key = `${move.r},${move.c}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(move);
    }
    return map;
  }

  function render(app) {
    const boardElement = document.getElementById("chessBoard");
    boardElement.innerHTML = "";

    setTheme(app.theme);

    const rows = app.flipped
      ? [7, 6, 5, 4, 3, 2, 1, 0]
      : [0, 1, 2, 3, 4, 5, 6, 7];
    const columns = app.flipped
      ? [7, 6, 5, 4, 3, 2, 1, 0]
      : [0, 1, 2, 3, 4, 5, 6, 7];

    const targetMap = uniqueTargetMoves(app.legalMoves);
    const king = ChessEngine.findKing(app.engineState, app.engineState.turn);
    const inCheck = app.gameStatus === "check" || app.gameStatus === "checkmate";

    for (const row of rows) {
      for (const column of columns) {
        const square = document.createElement("div");
        square.className = `square ${(row + column) % 2 ? "dark" : "light"}`;

        if (app.selected?.row === row && app.selected?.column === column) {
          square.classList.add("selected");
        }

        if (
          app.lastMove &&
          (
            (app.lastMove.fromRow === row && app.lastMove.fromColumn === column) ||
            (app.lastMove.toRow === row && app.lastMove.toColumn === column)
          )
        ) {
          square.classList.add("last");
        }

        if (inCheck && king && king.row === row && king.column === column) {
          square.classList.add("check");
        }

        const options = targetMap.get(`${row},${column}`);
        if (options) {
          const occupied = Boolean(app.engineState.board[row][column]) ||
            options.some((move) => move.enPassant);
          square.classList.add(occupied ? "capture" : "move");
        }

        const piece = app.engineState.board[row][column];
        if (piece) square.appendChild(createPieceSvg(app, piece));

        square.addEventListener("click", () => app.handleSquare(row, column));
        boardElement.appendChild(square);
      }
    }

    renderStatus(app);
    renderMoves(app);
    renderCaptured(app);
    renderClock(app);
    renderSaveStatus(app);
  }

  function showToast(message) {
    const toast = document.getElementById("chessToast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast.hideTimer);
    toast.hideTimer = window.setTimeout(
      () => toast.classList.remove("show"),
      1800
    );
  }

  function showPromotion() {
    return new Promise((resolve) => {
      const modal = document.getElementById("promotionModal");
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");

      const cleanup = () => {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
        modal.onclick = null;
        for (const button of modal.querySelectorAll("[data-promo]")) {
          button.onclick = null;
        }
        document.getElementById("cancelPromotion").onclick = null;
      };

      for (const button of modal.querySelectorAll("[data-promo]")) {
        button.onclick = () => {
          const value = button.getAttribute("data-promo");
          cleanup();
          resolve(value);
        };
      }

      document.getElementById("cancelPromotion").onclick = () => {
        cleanup();
        resolve(null);
      };

      modal.onclick = (event) => {
        if (event.target === modal) {
          cleanup();
          resolve(null);
        }
      };
    });
  }

  function showBootError(message) {
    const status = document.getElementById("engineStatus");
    if (status) status.textContent = message;
    const board = document.getElementById("chessBoard");
    if (board) {
      board.innerHTML =
        `<div style="grid-column:1/-1;grid-row:1/-1;display:grid;place-items:center;padding:24px;text-align:center;color:#f8d7da">${message}</div>`;
    }
  }

  return {
    PIECES,
    render,
    renderStatus,
    renderClock,
    renderSaveStatus,
    showToast,
    showPromotion,
    showBootError,
    formatMoveNotation,
    formatClock,
    setTheme
  };
})();
