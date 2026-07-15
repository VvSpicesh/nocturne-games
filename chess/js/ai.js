/**
 * Chess AI — pure decision module. No DOM access.
 * Returns a legal move object or null.
 */
const ChessAI = (() => {
  "use strict";

  function chooseMove(state, difficulty, options) {
    const settings = options || {};
    const timeBudgetMs = settings.timeBudgetMs || 450;
    const color = state.turn;
    const moves = ChessEngine.getAllLegalMoves(state, color);

    if (!moves.length) return null;

    if (difficulty === "easy") {
      return chooseEasy(state, moves);
    }

    if (difficulty === "normal") {
      return chooseNormal(state, moves, color);
    }

    return chooseHard(state, moves, color, timeBudgetMs);
  }

  function chooseEasy(state, moves) {
    const ranked = moves.map((move) => {
      const target = state.board[move.r][move.c];
      let score = Math.random() * 10;
      if (target) score += ChessEngine.pieceValue(target.type) * 0.15;
      if (move.enPassant) score += 12;
      return { move, score };
    });

    ranked.sort((a, b) => b.score - a.score);
    const top = Math.min(5, ranked.length);
    return ranked[Math.floor(Math.random() * top)].move;
  }

  function staticEvaluate(state, perspective) {
    let score = ChessEngine.materialScore(state, perspective);

    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        const piece = state.board[row][column];
        if (!piece || piece.color !== perspective) continue;
        const center =
          Math.max(0, 3.5 - Math.abs(3.5 - row)) +
          Math.max(0, 3.5 - Math.abs(3.5 - column));
        score += center * 2;
      }
    }

    if (ChessEngine.isInCheck(state, perspective === "w" ? "b" : "w")) {
      score += 35;
    }

    if (ChessEngine.isInCheck(state, perspective)) {
      score -= 45;
    }

    return score;
  }

  function chooseNormal(state, moves, color) {
    let bestScore = -Infinity;
    let bestMoves = [];

    for (const move of moves) {
      const result = ChessEngine.applyMove(state, move);
      if (!result.ok) continue;

      let score = staticEvaluate(result.state, color);

      if (result.captured) {
        score += ChessEngine.pieceValue(result.captured.type) * 0.2;
      }

      score += ChessEngine.centerBonus(move);

      // Avoid hanging a high-value piece on the destination if opponent can capture it next (shallow).
      const replies = ChessEngine.getAllLegalMoves(result.state, result.state.turn);
      for (const reply of replies) {
        if (reply.r === move.r && reply.c === move.c) {
          score -= ChessEngine.pieceValue(result.state.board[move.r][move.c]?.type || move.promotion || "p") * 0.85;
          break;
        }
      }

      if (score > bestScore + 1) {
        bestScore = score;
        bestMoves = [move];
      } else if (Math.abs(score - bestScore) <= 1) {
        bestMoves.push(move);
      }
    }

    if (!bestMoves.length) return moves[0];
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function chooseHard(state, moves, color, timeBudgetMs) {
    const started = Date.now();
    let bestMove = moves[0];
    let bestScore = -Infinity;
    const depth = 2;

    function minimax(node, remaining, alpha, beta, maximizing) {
      if (Date.now() - started > timeBudgetMs) {
        return { score: staticEvaluate(node, color), timedOut: true };
      }

      const evalState = ChessEngine.evaluateGameState(node);
      if (evalState.status === "checkmate") {
        return {
          score: maximizing ? -100000 + remaining : 100000 - remaining,
          timedOut: false
        };
      }
      if (evalState.status === "stalemate" || evalState.status === "insufficientMaterial") {
        return { score: 0, timedOut: false };
      }

      if (remaining === 0) {
        return { score: staticEvaluate(node, color), timedOut: false };
      }

      const side = node.turn;
      const legal = ChessEngine.getAllLegalMoves(node, side);

      if (!legal.length) {
        return { score: staticEvaluate(node, color), timedOut: false };
      }

      if (maximizing) {
        let value = -Infinity;
        for (const move of legal) {
          const next = ChessEngine.applyMove(node, move);
          if (!next.ok) continue;
          const child = minimax(next.state, remaining - 1, alpha, beta, false);
          if (child.timedOut) return child;
          value = Math.max(value, child.score);
          alpha = Math.max(alpha, value);
          if (beta <= alpha) break;
        }
        return { score: value, timedOut: false };
      }

      let value = Infinity;
      for (const move of legal) {
        const next = ChessEngine.applyMove(node, move);
        if (!next.ok) continue;
        const child = minimax(next.state, remaining - 1, alpha, beta, true);
        if (child.timedOut) return child;
        value = Math.min(value, child.score);
        beta = Math.min(beta, value);
        if (beta <= alpha) break;
      }
      return { score: value, timedOut: false };
    }

    // Lightweight move ordering: captures first
    const ordered = moves.slice().sort((a, b) => {
      const captA = state.board[a.r][a.c]
        ? ChessEngine.pieceValue(state.board[a.r][a.c].type)
        : 0;
      const captB = state.board[b.r][b.c]
        ? ChessEngine.pieceValue(state.board[b.r][b.c].type)
        : 0;
      return captB - captA;
    });

    for (const move of ordered) {
      if (Date.now() - started > timeBudgetMs) break;

      const result = ChessEngine.applyMove(state, move);
      if (!result.ok) continue;

      const child = minimax(result.state, depth - 1, -Infinity, Infinity, false);
      const score = child.score;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove || null;
  }

  return { chooseMove };
})();
