import {getSetting,setSetting} from "../../shared/settings.js";

(() => {
  "use strict";

  const app = {
    engineState: null,
    selected: null,
    legalMoves: [],
    flipped: false,
    moveHistory: [],
    notation: [],
    lastMove: null,
    capturedPieces: { w: [], b: [] },
    mode: "local",
    difficulty: "normal",
    theme: "blue",
    gameStatus: "playing",
    gameOver: false,
    endResult: null,
    endModalVisible: false,
    aiBusy: false,
    elapsedSeconds: 0,
    sessionStartedAt: Date.now(),
    hiddenAt: null,
    saveLabel: "未保存",
    pendingPromotion: null,
    preferredSide: "white",

    readSharedSettings() {
      const difficulty = getSetting("chess.defaultDifficulty");
      const side = getSetting("chess.defaultSide");
      this.difficulty = ["easy", "normal", "hard"].includes(difficulty)
        ? difficulty
        : "normal";
      this.preferredSide = ["white", "black", "random"].includes(side)
        ? side
        : "white";
    },

    getElapsedSeconds() {
      let extra = 0;
      if (!this.gameOver) {
        extra = Math.floor((Date.now() - this.sessionStartedAt) / 1000);
      }
      return this.elapsedSeconds + extra;
    },

    syncEvaluation(options = {}) {
      const evaluation = ChessEngine.evaluateGameState(this.engineState);
      const wasOver = this.gameOver;

      // Bake wall-clock time once when entering a terminal state so the
      // displayed total does not jump backward after gameOver becomes true.
      if (evaluation.gameOver && !this.gameOver) {
        this.elapsedSeconds =
          this.elapsedSeconds +
          Math.floor((Date.now() - this.sessionStartedAt) / 1000);
        this.sessionStartedAt = Date.now();
      }

      this.gameStatus = evaluation.status;
      this.gameOver = evaluation.gameOver;

      if (evaluation.gameOver) {
        this.aiBusy = false;
        this.selected = null;
        this.legalMoves = [];
        this.endResult = ChessEngine.buildEndResult(evaluation, options);
        if (!wasOver || options.forceModal) {
          this.endModalVisible = true;
        }
      } else if (!options.keepResignation) {
        this.endResult = null;
        this.endModalVisible = false;
      }
    },

    openEndModal() {
      if (!this.endResult?.ended) return;
      this.endModalVisible = true;
      this.render();
    },

    dismissEndModal() {
      if (!this.endResult?.ended) return;
      this.endModalVisible = false;
      this.render();
      this.persist("end-dismiss");
    },

    resign() {
      if (this.gameOver || this.aiBusy || this.pendingPromotion) return;

      let loser = this.engineState.turn;
      if (this.mode === "ai") {
        // 人机固定玩家执白
        loser = "w";
      }

      const label = loser === "w" ? "白方" : "黑方";
      if (!window.confirm(`确定要认输吗？（${label}）`)) return;

      this.elapsedSeconds =
        this.elapsedSeconds +
        Math.floor((Date.now() - this.sessionStartedAt) / 1000);
      this.sessionStartedAt = Date.now();

      this.aiBusy = false;
      this.selected = null;
      this.legalMoves = [];
      this.pendingPromotion = null;
      this.gameOver = true;
      this.gameStatus = "resignation";
      this.endResult = ChessEngine.buildEndResult(null, { resignation: loser });
      this.endModalVisible = true;
      this.render();
      this.persist("resign");
    },

    buildSnapshot() {
      return {
        version: ChessStorage.VERSION,
        board: this.engineState.board,
        turn: this.engineState.turn,
        castlingRights: this.engineState.castlingRights,
        enPassantTarget: this.engineState.enPassantTarget,
        moveHistory: this.moveHistory,
        notation: this.notation,
        capturedPieces: this.capturedPieces,
        lastMove: this.lastMove,
        gameStatus: this.gameStatus,
        gameOver: this.gameOver,
        endResult: this.endResult,
        endModalVisible: this.endModalVisible,
        mode: this.mode,
        difficulty: this.difficulty,
        theme: this.theme,
        flipped: this.flipped,
        elapsedSeconds: this.getElapsedSeconds(),
        savedAt: Date.now()
      };
    },

    persist(reason) {
      const result = ChessStorage.save(this.buildSnapshot());
      if (result.ok) {
        const time = new Date();
        const hh = String(time.getHours()).padStart(2, "0");
        const mm = String(time.getMinutes()).padStart(2, "0");
        const ss = String(time.getSeconds()).padStart(2, "0");
        this.saveLabel = `已保存 ${hh}:${mm}:${ss}`;
      } else {
        this.saveLabel = "保存失败";
      }
      ChessRenderer.renderSaveStatus(this);
      return result;
    },

    resetRuntimeClockBase() {
      this.sessionStartedAt = Date.now();
      this.hiddenAt = null;
    },

    applySnapshot(data) {
      this.engineState = {
        board: ChessEngine.clone(data.board),
        turn: data.turn,
        castlingRights: { ...data.castlingRights },
        enPassantTarget: data.enPassantTarget
          ? { ...data.enPassantTarget }
          : null
      };
      this.moveHistory = ChessEngine.clone(data.moveHistory);
      this.notation = [...data.notation];
      this.capturedPieces = {
        w: [...data.capturedPieces.w],
        b: [...data.capturedPieces.b]
      };
      this.lastMove = data.lastMove ? { ...data.lastMove } : null;
      this.gameStatus = data.gameStatus;
      this.gameOver = data.gameOver;
      this.endResult = data.endResult || null;
      this.endModalVisible = Boolean(data.gameOver && data.endModalVisible);
      this.mode = data.mode;
      this.difficulty = data.difficulty;
      this.theme = data.theme;
      this.flipped = data.flipped;
      this.elapsedSeconds = data.elapsedSeconds || 0;
      this.resetRuntimeClockBase();
      this.selected = null;
      this.legalMoves = [];
      this.aiBusy = false;
      this.pendingPromotion = null;

      if (this.gameStatus === "resignation" && this.endResult?.ended) {
        // 认输不重新走引擎判定，避免覆盖文案
        return;
      }
      this.syncEvaluation({ keepResignation: false });
      if (this.gameOver && this.endResult && data.endModalVisible === false) {
        this.endModalVisible = false;
      } else if (this.gameOver && this.endResult) {
        // 刷新恢复：默认只显示芯片，避免每次加载强弹；若此前未关闭则按存档
        this.endModalVisible = data.endModalVisible === true;
      }
    },

    startFreshBoard(keepPrefs) {
      this.engineState = ChessEngine.createInitialState();
      this.selected = null;
      this.legalMoves = [];
      this.moveHistory = [];
      this.notation = [];
      this.lastMove = null;
      this.capturedPieces = { w: [], b: [] };
      this.gameStatus = "playing";
      this.gameOver = false;
      this.endResult = null;
      this.endModalVisible = false;
      this.aiBusy = false;
      this.pendingPromotion = null;
      this.elapsedSeconds = 0;
      this.resetRuntimeClockBase();
      // rematch / 保留设置时保留翻转；全新默认不翻转
      if (!keepPrefs) {
        this.flipped = false;
        this.mode = "local";
        this.readSharedSettings();
        this.theme = "blue";
      }

      this.syncEvaluation();
    },

    bindUi() {
      const modeSelect = document.getElementById("modeSelect");
      const difficultySelect = document.getElementById("difficultySelect");

      modeSelect.value = this.mode;
      difficultySelect.value = this.difficulty;
      difficultySelect.disabled = this.mode !== "ai";

      const unlockAudio = () => {
        window.ChessAudio?.init();
        document.removeEventListener("pointerdown", unlockAudio);
      };
      document.addEventListener("pointerdown", unlockAudio, { once: true });

      modeSelect.addEventListener("change", () => {
        this.mode = modeSelect.value;
        difficultySelect.disabled = this.mode !== "ai";
        this.persist("mode");
        ChessRenderer.showToast(
          this.mode === "ai" ? "人机模式：你执白棋" : "已切换为本地双人"
        );
        this.maybeScheduleAi();
      });

      difficultySelect.addEventListener("change", () => {
        this.difficulty = difficultySelect.value;
        setSetting("chess.defaultDifficulty", this.difficulty);
        this.persist("difficulty");
      });

      document.getElementById("undoChess").addEventListener("click", () => this.undo());
      document.getElementById("flipChess").addEventListener("click", () => {
        this.flipped = !this.flipped;
        this.selected = null;
        this.legalMoves = [];
        this.render();
        this.persist("flip");
      });
      document.getElementById("themeChess").addEventListener("click", () => {
        this.theme = this.theme === "blue" ? "wood" : "blue";
        this.render();
        this.persist("theme");
        ChessRenderer.showToast(
          this.theme === "wood" ? "已切换木色棋盘" : "已切换蓝灰棋盘"
        );
      });
      document.getElementById("resetChess").addEventListener("click", () => this.confirmNewGame());
      document.getElementById("resignChess")?.addEventListener("click", () => this.resign());
      document.getElementById("endGameRematch")?.addEventListener("click", () => {
        this.startFreshBoard(true);
        this.render();
        this.persist("rematch");
        document.getElementById("engineStatus").textContent = "新对局已开始";
        ChessRenderer.showToast("再来一局");
      });
      document.getElementById("endGameReview")?.addEventListener("click", () => {
        this.dismissEndModal();
      });
      document.getElementById("endGameChip")?.addEventListener("click", () => {
        this.openEndModal();
        this.persist("end-reopen");
      });

      this.setupDebugPanel();

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.freezeClockForHide();
          this.persist("hidden");
        } else {
          this.resumeClockAfterShow();
          this.render();
        }
      });

      window.addEventListener("pagehide", () => {
        this.freezeClockForHide();
        this.persist("pagehide");
      });

      window.addEventListener("beforeunload", () => {
        this.freezeClockForHide();
        this.persist("beforeunload");
      });

      window.addEventListener("resize", () => {
        this.persist("resize");
        this.render();
      });

      window.addEventListener("orientationchange", () => {
        this.persist("orientation");
        this.render();
      });

      window.setInterval(() => {
        if (!this.gameOver) ChessRenderer.renderClock(this);
      }, 1000);
    },

    freezeClockForHide() {
      if (this.gameOver) return;
      this.elapsedSeconds = this.getElapsedSeconds();
      this.sessionStartedAt = Date.now();
      this.hiddenAt = Date.now();
    },

    resumeClockAfterShow() {
      // After freezeClockForHide, sessionStartedAt is the hide timestamp.
      // Date.now() - sessionStartedAt already includes real time spent hidden.
      this.hiddenAt = null;
    },

    confirmNewGame() {
      const ok = window.confirm("确定要开始新对局吗？当前棋局将被重置（模式/难度/主题保留）。");
      if (!ok) return;
      this.startFreshBoard(true);
      this.render();
      this.persist("new-game");
      document.getElementById("engineStatus").textContent = "新对局已开始";
    },

    render() {
      ChessRenderer.render(this);
    },

    handleSquare(row, column) {
      if (this.aiBusy || this.gameOver || this.pendingPromotion) return;

      if (this.mode === "ai" && this.engineState.turn === "b") {
        ChessRenderer.showToast("现在轮到电脑走棋");
        return;
      }

      const piece = this.engineState.board[row][column];

      if (this.selected) {
        const options = this.legalMoves.filter(
          (move) => move.r === row && move.c === column
        );

        if (options.length) {
          this.chooseAndPlay(options);
          return;
        }

        if (piece?.color === this.engineState.turn) {
          this.selected = { row, column };
          this.legalMoves = ChessEngine.getLegalMoves(
            this.engineState,
            row,
            column
          );
          this.render();
          return;
        }

        this.selected = null;
        this.legalMoves = [];
        this.render();
        return;
      }

      if (piece?.color === this.engineState.turn) {
        this.selected = { row, column };
        this.legalMoves = ChessEngine.getLegalMoves(
          this.engineState,
          row,
          column
        );
        this.render();
      }
    },

    async chooseAndPlay(options) {
      let move = options[0];

      if (options.some((item) => item.promotion)) {
        this.pendingPromotion = true;
        this.render();
        const promotion = await ChessRenderer.showPromotion();
        this.pendingPromotion = null;

        if (!promotion) {
          this.render();
          return;
        }

        move = options.find((item) => item.promotion === promotion) || null;
        if (!move) {
          ChessRenderer.showToast("升变选择无效");
          this.render();
          return;
        }
      }

      this.playMove(move);
    },

    playMove(move) {
      const historyEntry = {
        engineState: ChessEngine.cloneState(this.engineState),
        notation: [...this.notation],
        capturedPieces: ChessEngine.clone(this.capturedPieces),
        lastMove: this.lastMove ? { ...this.lastMove } : null,
        gameStatus: this.gameStatus,
        gameOver: this.gameOver,
        endResult: this.endResult ? { ...this.endResult } : null,
        endModalVisible: this.endModalVisible,
        elapsedSeconds: this.getElapsedSeconds()
      };

      const result = ChessEngine.applyMove(this.engineState, move);
      if (!result.ok) {
        ChessRenderer.showToast("非法走棋");
        return;
      }

      this.moveHistory.push(historyEntry);
      this.engineState = result.state;

      if (result.captured) {
        const bag = result.movingPiece.color;
        this.capturedPieces[bag].push(result.captured.type);
      }

      this.lastMove = {
        fromRow: move.fromRow,
        fromColumn: move.fromColumn,
        toRow: move.r,
        toColumn: move.c
      };

      this.syncEvaluation();

      const notation = ChessRenderer.formatMoveNotation({
        movingPiece: result.movingPiece,
        fromRow: move.fromRow,
        fromColumn: move.fromColumn,
        move,
        captured: result.captured,
        promotedTo: result.promotedTo,
        castle: move.castle || null,
        gaveCheck: this.gameStatus === "check" || this.gameStatus === "checkmate",
        checkmate: this.gameStatus === "checkmate"
      });

      this.notation.push(notation);
      this.selected = null;
      this.legalMoves = [];

      if (window.ChessAudio) {
        ChessAudio.init();
        ChessAudio.playMove(Boolean(result.captured) || Boolean(move.enPassant));
        if (this.gameStatus === "checkmate") {
          setTimeout(() => ChessAudio.playCheckmate(), 90);
        } else if (this.gameStatus === "check") {
          setTimeout(() => ChessAudio.playCheck(), 90);
        }
      }

      this.render();
      this.persist("move");
      this.maybeScheduleAi();
    },

    undo() {
      if (this.aiBusy) {
        ChessRenderer.showToast("电脑思考中，无法悔棋");
        return;
      }

      if (!this.moveHistory.length) {
        ChessRenderer.showToast("没有可以悔的棋");
        return;
      }

      const restore = (entry) => {
        this.engineState = ChessEngine.cloneState(entry.engineState);
        this.notation = [...entry.notation];
        this.capturedPieces = ChessEngine.clone(entry.capturedPieces);
        this.lastMove = entry.lastMove ? { ...entry.lastMove } : null;
        this.gameStatus = entry.gameStatus;
        this.gameOver = entry.gameOver;
        this.endResult = entry.endResult ? { ...entry.endResult } : null;
        this.endModalVisible = Boolean(entry.endModalVisible);
        // Keep total elapsed; do not roll back timer.
      };

      restore(this.moveHistory.pop());

      if (
        this.mode === "ai" &&
        this.engineState.turn === "b" &&
        this.moveHistory.length
      ) {
        restore(this.moveHistory.pop());
      }

      this.selected = null;
      this.legalMoves = [];
      if (this.gameStatus === "resignation" && this.endResult?.ended) {
        this.render();
        this.persist("undo");
        return;
      }
      this.syncEvaluation();
      if (!this.gameOver) {
        this.endResult = null;
        this.endModalVisible = false;
      }
      this.render();
      this.persist("undo");
    },

    maybeScheduleAi() {
      if (this.gameOver || this.mode !== "ai") return;
      if (this.engineState.turn !== "b") return;
      if (this.aiBusy) return;
      this.scheduleAi();
    },

    scheduleAi() {
      this.aiBusy = true;
      this.render();

      window.setTimeout(() => {
        try {
          // Abort if the board changed while thinking (new game / mode / end).
          if (
            this.mode !== "ai" ||
            this.engineState.turn !== "b" ||
            this.gameOver
          ) {
            this.aiBusy = false;
            this.render();
            return;
          }

          const move = ChessAI.chooseMove(
            this.engineState,
            this.difficulty,
            { timeBudgetMs: this.difficulty === "hard" ? 480 : 120 }
          );

          this.aiBusy = false;

          if (!move) {
            this.syncEvaluation({ forceModal: true });
            this.render();
            this.persist("ai-null");
            return;
          }

          if (
            this.mode !== "ai" ||
            this.engineState.turn !== "b" ||
            this.gameOver
          ) {
            this.render();
            return;
          }

          this.playMove(move);
        } catch (error) {
          console.error(error);
          this.aiBusy = false;
          ChessRenderer.showToast("电脑出错：" + error.message);
          this.render();
        }
      }, 360);
    },

    emptyBoard() {
      return Array.from({ length: 8 }, () => Array(8).fill(null));
    },

    loadDebugPosition(name) {
      const board = this.emptyBoard();
      let turn = "w";
      let note = "";

      if (name === "mate-white") {
        // Ka8 Qa7 Kb6 — 黑方被将死
        board[0][0] = { color: "b", type: "k" };
        board[1][0] = { color: "w", type: "q" };
        board[2][1] = { color: "w", type: "k" };
        turn = "b";
        note = "将死（白方获胜）";
      } else if (name === "mate-black") {
        board[7][7] = { color: "w", type: "k" };
        board[6][7] = { color: "b", type: "q" };
        board[5][6] = { color: "b", type: "k" };
        turn = "w";
        note = "将死（黑方获胜）";
      } else if (name === "stalemate") {
        // Ka8, Pa7, Kb6 — 黑无合法着且未被将军
        board[0][0] = { color: "b", type: "k" };
        board[1][0] = { color: "w", type: "p" };
        board[2][1] = { color: "w", type: "k" };
        turn = "b";
        note = "逼和";
      } else if (name === "insufficient") {
        board[0][4] = { color: "b", type: "k" };
        board[7][4] = { color: "w", type: "k" };
        board[4][2] = { color: "w", type: "n" };
        turn = "w";
        note = "子力不足";
      } else {
        ChessRenderer.showToast("未知调试场景");
        return;
      }

      this.engineState = {
        board,
        turn,
        castlingRights: { wK: false, wQ: false, bK: false, bQ: false },
        enPassantTarget: null
      };
      this.moveHistory = [];
      this.notation = [];
      this.lastMove = null;
      this.capturedPieces = { w: [], b: [] };
      this.selected = null;
      this.legalMoves = [];
      this.aiBusy = false;
      this.pendingPromotion = null;
      this.endResult = null;
      this.endModalVisible = false;
      this.gameOver = false;
      this.syncEvaluation({ forceModal: true });
      this.render();
      this.persist("debug");
      ChessRenderer.showToast(note);
      document.getElementById("engineStatus").textContent = `调试：${note}`;
    },

    setupDebugPanel() {
      const host = location.hostname;
      if (host !== "localhost" && host !== "127.0.0.1") return;
      if (document.getElementById("chessDebugPanel")) return;

      const panel = document.createElement("section");
      panel.id = "chessDebugPanel";
      panel.className = "panel side-card chess-debug";
      panel.innerHTML = `
        <h2>Debug Mode</h2>
        <p class="muted">仅 localhost 可见</p>
        <div class="button-grid debug-grid">
          <button type="button" data-debug="mate-white">将死·白胜</button>
          <button type="button" data-debug="mate-black">将死·黑胜</button>
          <button type="button" data-debug="stalemate">逼和</button>
          <button type="button" data-debug="insufficient">子力不足</button>
          <button type="button" data-debug="resign">认输弹框</button>
        </div>
      `;
      document.querySelector(".side-stack")?.appendChild(panel);
      panel.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-debug]");
        if (!btn) return;
        const key = btn.getAttribute("data-debug");
        if (key === "resign") {
          if (this.gameOver) this.startFreshBoard(true);
          this.resign();
          return;
        }
        this.loadDebugPosition(key);
      });
    },

    init() {
      if (typeof ChessEngine === "undefined") {
        throw new Error("ChessEngine 未加载");
      }
      if (typeof ChessStorage === "undefined") {
        throw new Error("ChessStorage 未加载");
      }
      if (typeof ChessRenderer === "undefined") {
        throw new Error("ChessRenderer 未加载");
      }
      if (typeof ChessAI === "undefined") {
        throw new Error("ChessAI 未加载");
      }

      const loaded = ChessStorage.load();
      this.readSharedSettings();

      if (loaded.ok && loaded.data) {
        this.applySnapshot(loaded.data);
        this.saveLabel = "已恢复存档";
      } else {
        this.startFreshBoard(false);
        if (loaded.corrupt) {
          ChessRenderer.showToast(loaded.message || "存档无效，已开新局");
        }
      }

      this.bindUi();
      document.getElementById("modeSelect").value = this.mode;
      document.getElementById("difficultySelect").value = this.difficulty;
      document.getElementById("difficultySelect").disabled = this.mode !== "ai";
      document.getElementById("engineStatus").textContent =
        "Stable v1.0 已就绪";

      this.render();
      this.persist("boot");
      this.maybeScheduleAi();
    }
  };

  window.addEventListener("DOMContentLoaded", () => {
    try {
      app.init();
    } catch (error) {
      console.error(error);
      const message = "棋盘启动失败：" + error.message;
      if (typeof ChessRenderer !== "undefined" && ChessRenderer.showBootError) {
        ChessRenderer.showBootError(message);
      } else {
        const status = document.getElementById("engineStatus");
        const board = document.getElementById("chessBoard");
        if (status) status.textContent = message;
        if (board) {
          board.textContent = message;
        }
      }
    }
  });
})();
