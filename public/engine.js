/**
 * engine.js — the computer opponent.
 *
 * Runs entirely in the player's browser. The server never thinks about chess
 * strategy; in online games it is only a referee.
 *
 * The method is **minimax with alpha-beta pruning** at a fixed **depth of 2**.
 *
 *   Minimax: try each of my moves; for each, assume my opponent then plays their
 *   best reply; pick the move whose worst outcome is least bad. It assumes the
 *   opponent plays well, which is why it does not fall for one-move traps.
 *
 *   Alpha-beta pruning: while searching, keep track of the best either side has
 *   been able to guarantee so far. The moment a branch is shown to be worse than
 *   something already found, stop looking at the rest of it — nothing further
 *   down it can change the final choice. It is not an approximation; it reaches
 *   exactly the same answer as plain minimax, just faster.
 *
 *   Depth 2: my move, then your best reply. Enough to stop it giving pieces away
 *   or missing a free capture, not enough to plan. That is the right level for a
 *   game whose point is a growing puppy.
 *
 * It can only ever return a legal move, because the only moves it ever sees come
 * from legalMoves().
 */

import { legalMoves, makeMove, isInCheck, opposite } from './rules.js';

// ─────────────────────────────────────────────────────────────────────────────
// What a position is worth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Piece values in centipawns — hundredths of a pawn. Whole numbers are used
 * rather than decimals so that scores add up exactly, with no rounding drift.
 *
 * A bishop is worth slightly more than a knight, which is the usual convention:
 * bishops get stronger as the board empties.
 */
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/**
 * Piece-square tables: a small bonus or penalty for standing on a given square,
 * written from White's point of view with rank 8 on the top row.
 *
 * This is what separates an engine that shuffles aimlessly from one that plays
 * recognisable chess. Material alone cannot tell a knight in the centre from a
 * knight in the corner; these tables can, at the cost of one array lookup.
 */
const PAWN_TABLE = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];

const KNIGHT_TABLE = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50,
];

const BISHOP_TABLE = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5, 10, 10,  5,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -20,-10,-10,-10,-10,-10,-10,-20,
];

const ROOK_TABLE = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];

const QUEEN_TABLE = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
   0,  0,  5,  5,  5,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20,
];

// The king wants a corner behind its own pawns while the board is full.
const KING_TABLE = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20,
];

const TABLES = {
  p: PAWN_TABLE, n: KNIGHT_TABLE, b: BISHOP_TABLE,
  r: ROOK_TABLE, q: QUEEN_TABLE, k: KING_TABLE,
};

/**
 * The tables are written from White's point of view. Black's equivalent square
 * is the same file on the mirrored rank — a8 for a1, and so on.
 */
function tableValue(piece, square) {
  const index = piece.color === 'w' ? square : (7 - (square >> 3)) * 8 + (square % 8);
  return TABLES[piece.type][index];
}

/** Large enough that no amount of material can outweigh a mate. */
export const MATE_SCORE = 100000;

/**
 * Score a position from White's point of view: positive is good for White.
 *
 * Deliberately simple. A cleverer evaluation would matter at depth 6; at depth 2
 * it would mostly cost time.
 */
export function evaluate(position) {
  let score = 0;
  for (let square = 0; square < 64; square++) {
    const piece = position.board[square];
    if (piece === null) continue;
    const worth = VALUE[piece.type] + tableValue(piece, square);
    score += piece.color === 'w' ? worth : -worth;
  }
  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// Searching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look at captures first, biggest first.
 *
 * Alpha-beta prunes far more when good moves come first, because a strong move
 * found early raises the bar that every later branch has to clear. Sorting by
 * "what did I take, and what did I risk to take it" is the cheapest way to get
 * roughly the right order.
 */
function orderMoves(moves) {
  return [...moves].sort((a, b) => score(b) - score(a));

  function score(move) {
    if (move.captured === null) return move.promotion ? VALUE[move.promotion] : 0;
    // Taking a queen with a pawn is more promising than the other way round.
    return VALUE[move.captured.type] * 10 - VALUE[move.piece.type];
  }
}

/**
 * The search itself, from the point of view of the side to move.
 *
 * `alpha` is the best this side can already guarantee; `beta` is the best the
 * opponent can already guarantee. When they cross, the rest of this branch can
 * never be chosen, so we stop.
 */
function search(position, depth, alpha, beta) {
  const moves = legalMoves(position);

  if (moves.length === 0) {
    // No legal move means the game has ended right here.
    if (isInCheck(position, position.turn)) {
      // Being mated is terrible. Subtracting the depth makes a mate that arrives
      // sooner score better than one further away, so it does not dawdle.
      return -MATE_SCORE + (10 - depth);
    }
    return 0; // stalemate — a draw, worth nothing to either side
  }

  if (depth === 0) {
    const white = evaluate(position);
    return position.turn === 'w' ? white : -white;
  }

  let best = -Infinity;
  for (const move of orderMoves(moves)) {
    // The opponent's best score is the negative of ours, so one function can
    // play both sides. The window flips with it.
    const value = -search(makeMove(position, move), depth - 1, -beta, -alpha);
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // the opponent would never let us get here
  }
  return best;
}

/**
 * Choose a move.
 *
 * @param {object} position
 * @param {object} options
 *   depth   how far ahead to look; 2 by default, as the brief specifies
 *   random  a source of randomness, so tests can make it repeatable
 * @returns the chosen move, or null if the game is already over
 */
export function chooseMove(position, { depth = 2, random = Math.random } = {}) {
  const moves = legalMoves(position);
  if (moves.length === 0) return null;

  let best = -Infinity;
  let bestMoves = [];

  for (const move of orderMoves(moves)) {
    const value = -search(makeMove(position, move), depth - 1, -Infinity, Infinity);
    if (value > best) {
      best = value;
      bestMoves = [move];
    } else if (value === best) {
      // Collect the ties rather than always taking the first, so it does not
      // play the identical game every time.
      bestMoves.push(move);
    }
  }

  return bestMoves[Math.floor(random() * bestMoves.length)];
}

/** What the engine thinks of a position, for the Sniff power-up and for tests. */
export function evaluateForSideToMove(position) {
  const white = evaluate(position);
  return position.turn === 'w' ? white : -white;
}
