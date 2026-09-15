/**
 * game.js — the state of one game, with no screen attached.
 *
 * Everything here is about chess and bookkeeping: whose turn it is, what has
 * been captured, who is winning on material, and the history that makes undo
 * possible. It draws nothing, so it can be reasoned about — and tested — without
 * a browser.
 *
 * The three modes all use this. What differs between them is who supplies the
 * moves, not what a move means.
 */

import {
  initialPosition, makeMove, gameStatus, legalMoves, fromFEN, toFEN, uciToMove,
} from './rules.js';

/** What each piece is worth. The king has no value: it is never captured. */
export const PIECE_VALUE = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 });

const COLOUR_NAME = { w: 'White', b: 'Black' };

export class Game {
  constructor(position = initialPosition()) {
    this.reset(position);
  }

  reset(position = initialPosition()) {
    this.position = position;
    /** Every position we have been in, oldest first. Undo walks back through it. */
    this.history = [{ position, move: null }];
    /** Set when someone gives up, rather than being beaten on the board. */
    this.resignedBy = null;
    return this;
  }

  /** Rebuild a game from a saved position and its move list. */
  static fromRecord(fen, ucis = []) {
    const game = new Game(fromFEN(fen));
    // The position is authoritative; the moves are replayed only so that the
    // captured-piece tray is exact rather than guessed.
    if (ucis.length > 0) {
      game.reset(initialPosition());
      for (const uci of ucis) {
        const move = uciToMove(game.position, uci);
        if (move === null) {
          // The saved moves disagree with the rules. Trust the saved position.
          game.reset(fromFEN(fen));
          return game;
        }
        game.play(move);
      }
    }
    return game;
  }

  get turn() { return this.position.turn; }
  get fen() { return toFEN(this.position); }
  get lastMove() { return this.history[this.history.length - 1].move; }
  get moveCount() { return this.history.length - 1; }

  /** Every move played so far, in UCI. */
  get moveList() {
    return this.history.slice(1).map((entry) => entry.move.uci);
  }

  legalMoves() { return legalMoves(this.position); }

  /**
   * Play a move. The move must have come from legalMoves() — nothing else is
   * accepted, which is what keeps an illegal move impossible.
   */
  play(move) {
    const next = makeMove(this.position, move);
    this.position = next;
    this.history.push({
      position: next,
      move: { ...move, uci: moveUci(move) },
    });
    return next;
  }

  /** Take back the last half-move. Returns false at the start of the game. */
  undo() {
    if (this.history.length <= 1) return false;
    this.history.pop();
    this.position = this.history[this.history.length - 1].position;
    this.resignedBy = null;
    return true;
  }

  canUndo() { return this.history.length > 1; }

  /** Give up. The other side wins. */
  resign(color) {
    this.resignedBy = color;
  }

  /**
   * How the game stands, as one object the screen can render without thinking.
   *
   *   state    'playing' | 'check' | 'checkmate' | 'stalemate' | 'resigned'
   *   winner   'w' | 'b' | null
   *   over     boolean
   *   text     a sentence for the status line, in words
   */
  status() {
    if (this.resignedBy !== null) {
      const winner = this.resignedBy === 'w' ? 'b' : 'w';
      return {
        state: 'resigned',
        winner,
        over: true,
        text: `${COLOUR_NAME[this.resignedBy]} resigned — ${COLOUR_NAME[winner]} wins`,
      };
    }

    const state = gameStatus(this.position);
    const turn = this.position.turn;

    if (state === 'checkmate') {
      const winner = turn === 'w' ? 'b' : 'w';
      return {
        state, winner, over: true,
        text: `Checkmate — ${COLOUR_NAME[winner]} wins`,
      };
    }
    if (state === 'stalemate') {
      return { state, winner: null, over: true, text: "Stalemate — it's a draw" };
    }
    if (state === 'check') {
      return { state, winner: null, over: false, text: `${COLOUR_NAME[turn]} is in check` };
    }
    return { state, winner: null, over: false, text: `${COLOUR_NAME[turn]} to move` };
  }

  /**
   * Which pieces each side has taken, and who is ahead.
   *
   * Counted from the move history rather than by comparing the board against a
   * full set, because promotion makes that comparison lie — a side can have two
   * queens and still be down material.
   */
  captures() {
    const taken = { w: [], b: [] };
    for (const entry of this.history) {
      if (entry.move === null || entry.move.captured === null) continue;
      taken[entry.move.piece.color].push(entry.move.captured);
    }

    const points = (pieces) => pieces.reduce((sum, p) => sum + PIECE_VALUE[p.type], 0);
    const white = points(taken.w);
    const black = points(taken.b);

    return {
      w: { pieces: taken.w, points: white, lead: Math.max(0, white - black) },
      b: { pieces: taken.b, points: black, lead: Math.max(0, black - white) },
    };
  }

  /** How many pieces this side has captured — Biscuit's treat count. */
  treats(color) {
    return this.captures()[color].pieces.length;
  }
}

/** UCI for a move, without importing the whole of rules.js into every caller. */
function moveUci(move) {
  const FILES = 'abcdefgh';
  const name = (i) => FILES[i % 8] + String(8 - (i >> 3));
  return name(move.from) + name(move.to) + (move.promotion ?? '');
}
