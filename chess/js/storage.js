const ChessStorage = (() => {
  "use strict";

  const KEY = "nocturne-chess-stable-v1";
  const CORRUPT_KEY = "nocturne-chess-stable-v1-corrupt";
  const VERSION = 1;

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validate(data) {
    if (!data || typeof data !== "object") {
      return { ok: false, reason: "not-object" };
    }

    if (data.version !== VERSION) {
      return { ok: false, reason: "bad-version" };
    }

    if (!Array.isArray(data.board) || data.board.length !== 8) {
      return { ok: false, reason: "bad-board" };
    }

    for (let row = 0; row < 8; row++) {
      if (!Array.isArray(data.board[row]) || data.board[row].length !== 8) {
        return { ok: false, reason: "bad-board-row" };
      }
    }

    if (data.turn !== "w" && data.turn !== "b") {
      return { ok: false, reason: "bad-turn" };
    }

    if (!data.castlingRights || typeof data.castlingRights !== "object") {
      return { ok: false, reason: "bad-castling" };
    }

    for (const key of ["wK", "wQ", "bK", "bQ"]) {
      if (typeof data.castlingRights[key] !== "boolean") {
        return { ok: false, reason: "bad-castling-flag" };
      }
    }

    if (
      data.enPassantTarget !== null &&
      (
        typeof data.enPassantTarget !== "object" ||
        typeof data.enPassantTarget.row !== "number" ||
        typeof data.enPassantTarget.column !== "number"
      )
    ) {
      return { ok: false, reason: "bad-en-passant" };
    }

    if (!Array.isArray(data.moveHistory) || !Array.isArray(data.notation)) {
      return { ok: false, reason: "bad-history" };
    }

    if (!data.capturedPieces || typeof data.capturedPieces !== "object") {
      return { ok: false, reason: "bad-captured" };
    }

    if (!Array.isArray(data.capturedPieces.w) || !Array.isArray(data.capturedPieces.b)) {
      return { ok: false, reason: "bad-captured-arrays" };
    }

    if (typeof data.gameOver !== "boolean") {
      return { ok: false, reason: "bad-game-over" };
    }

    const allowedStatus = [
      "playing",
      "check",
      "checkmate",
      "stalemate",
      "insufficientMaterial",
      "resignation"
    ];
    if (!allowedStatus.includes(data.gameStatus)) {
      return { ok: false, reason: "bad-status" };
    }

    if (data.endResult != null) {
      if (typeof data.endResult !== "object" || data.endResult.ended !== true) {
        return { ok: false, reason: "bad-end-result" };
      }
    }

    if (data.endModalVisible != null && typeof data.endModalVisible !== "boolean") {
      return { ok: false, reason: "bad-end-modal" };
    }

    if (data.mode !== "local" && data.mode !== "ai") {
      return { ok: false, reason: "bad-mode" };
    }

    if (!["easy", "normal", "hard"].includes(data.difficulty)) {
      return { ok: false, reason: "bad-difficulty" };
    }

    if (data.theme !== "blue" && data.theme !== "wood") {
      return { ok: false, reason: "bad-theme" };
    }

    if (typeof data.flipped !== "boolean") {
      return { ok: false, reason: "bad-flipped" };
    }

    if (typeof data.elapsedSeconds !== "number" || data.elapsedSeconds < 0) {
      return { ok: false, reason: "bad-elapsed" };
    }

    return { ok: true };
  }

  function migrate(data) {
    if (!data || typeof data !== "object") return null;

    if (data.version === VERSION) {
      return deepClone(data);
    }

    // Future migrations go here. Unknown versions fail closed.
    return null;
  }

  function save(snapshot) {
    try {
      const payload = deepClone(snapshot);
      payload.version = VERSION;
      payload.savedAt = Date.now();

      const check = validate(payload);
      if (!check.ok) {
        console.warn("ChessStorage.save rejected:", check.reason);
        return { ok: false, reason: check.reason };
      }

      localStorage.setItem(KEY, JSON.stringify(payload));
      return { ok: true };
    } catch (error) {
      console.warn("ChessStorage.save failed:", error);
      return { ok: false, reason: "write-error", error };
    }
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        return { ok: true, data: null, empty: true };
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        localStorage.setItem(CORRUPT_KEY, raw);
        localStorage.removeItem(KEY);
        return {
          ok: false,
          corrupt: true,
          reason: "json",
          message: "存档损坏，已开始新对局。"
        };
      }

      const migrated = migrate(parsed);
      if (!migrated) {
        localStorage.setItem(CORRUPT_KEY, raw);
        localStorage.removeItem(KEY);
        return {
          ok: false,
          corrupt: true,
          reason: "migrate",
          message: "存档版本不兼容，已开始新对局。"
        };
      }

      const check = validate(migrated);
      if (!check.ok) {
        localStorage.setItem(CORRUPT_KEY, raw);
        localStorage.removeItem(KEY);
        return {
          ok: false,
          corrupt: true,
          reason: check.reason,
          message: "存档数据无效，已开始新对局。"
        };
      }

      return { ok: true, data: migrated };
    } catch (error) {
      console.warn("ChessStorage.load failed:", error);
      try {
        localStorage.removeItem(KEY);
      } catch (_) {
        /* ignore */
      }
      return {
        ok: false,
        corrupt: true,
        reason: "exception",
        message: "读取存档失败，已开始新对局。"
      };
    }
  }

  return {
    VERSION,
    KEY,
    save,
    load,
    clear,
    validate,
    migrate
  };
})();
