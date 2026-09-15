/**
 * powerups.js — Treat Mode.
 *
 * Three one-use-per-game power-ups, behind a switch that is OFF unless somebody
 * turns it on. A default game of Pawsitions is plain, legal chess.
 *
 *   Shield  protect one of your pieces from being captured on the opponent's
 *           very next move
 *   Fetch   take back the last two half-moves — yours and the reply
 *   Sniff   have the engine show you its best move for five seconds
 *
 * ── Why this is a separate file ──────────────────────────────────────────────
 *
 * Shield changes which moves are legal, and rules.js is the one file whose
 * correctness the whole project rests on — it is proved by perft, and every mode
 * and the server import it. Editing it to understand shields would mean the
 * thing perft tests is no longer quite the thing the game runs.
 *
 * So rules.js is not touched. Instead this module wraps it:
 *
 *     legalMoves(position) → applyShields(moves, treats) → what anyone may play
 *
 * With Treat Mode off, applyShields returns the array it was given, untouched
 * and unexamined. The plain game therefore runs through byte-for-byte the same
 * code it did before this file existed, and the perft proof still describes it.
 *
 * ── Why Shield works the way it does ────────────────────────────────────────
 *
 * "The next attempt to capture it fails" cannot be built as a filter: a move
 * that is filtered out is never offered, so it can never be attempted, so the
 * shield would never be spent — which would make it permanent immunity rather
 * than one save. Making the attempt happen and then bounce would mean teaching
 * makeMove about shields, which is exactly what must not happen.
 *
 * So a shield protects a piece for the opponent's next move, and then it is
 * gone. One move of safety, no way to abuse it, and it needs nothing from
 * rules.js but the list of moves it already returns.
 */

export const TREAT_KINDS = Object.freeze(['shield', 'fetch', 'sniff']);

export const TREAT_LABELS = Object.freeze({
  shield: 'Shield',
  fetch: 'Fetch',
  sniff: 'Sniff',
});

export const TREAT_BLURBS = Object.freeze({
  shield: 'Protect one of your pieces for your opponent’s next move.',
  fetch: 'Take back your last move, and the reply to it.',
  sniff: 'Biscuit sniffs out your best move and points at it.',
});

/** A fresh Treat Mode state. Off unless asked for. */
export function emptyTreatState(enabled = false) {
  return {
    enabled,
    used: { w: { shield: false, fetch: false, sniff: false },
            b: { shield: false, fetch: false, sniff: false } },
    shield: { w: null, b: null },   // square index of a protected piece, or null
  };
}

/** Which square a move actually takes a piece from — not always where it lands. */
function capturedSquareOf(move) {
  if (move.flag !== 'ep') return move.to;
  // En passant takes the pawn beside you, not the one you land on.
  const forward = move.piece.color === 'w' ? 1 : -1;
  const file = move.to % 8;
  const rank = (7 - (move.to >> 3)) - forward;
  return (7 - rank) * 8 + file;
}

/**
 * The wrapper. Removes captures of a shielded piece.
 *
 * When Treat Mode is off this returns exactly what it was given, so the plain
 * game is not merely equivalent to the unwrapped version — it is the same array.
 */
export function applyShields(moves, treats) {
  if (!treats || !treats.enabled) return moves;

  const guarded = [];
  if (treats.shield.w !== null) guarded.push(treats.shield.w);
  if (treats.shield.b !== null) guarded.push(treats.shield.b);
  if (guarded.length === 0) return moves;

  return moves.filter(
    (move) => move.captured === null || !guarded.includes(capturedSquareOf(move)),
  );
}

/** Has this side spent this power-up yet? */
export function hasUsed(treats, color, kind) {
  return Boolean(treats?.used?.[color]?.[kind]);
}

/** May this side use this power-up right now? */
export function canUse(treats, color, kind, { isMyTurn = true, gameOver = false } = {}) {
  if (!treats?.enabled) return false;
  if (gameOver) return false;
  if (hasUsed(treats, color, kind)) return false;
  if (!isMyTurn) return false;
  return TREAT_KINDS.includes(kind);
}

/** Spend one. */
export function markUsed(treats, color, kind) {
  treats.used[color][kind] = true;
}

/**
 * Put a shield on one of your pieces.
 *
 * The square must hold a piece of your own. Returns true if it took.
 */
export function raiseShield(treats, color, square, position) {
  const piece = position.board[square];
  if (piece === null || piece.color !== color) return false;
  treats.shield[color] = square;
  markUsed(treats, color, 'shield');
  return true;
}

/**
 * Called once a side's own turn comes round again: their shield has done its
 * job and lapses. This is the whole of the shield's lifetime — there is nothing
 * else to expire and no timer anywhere.
 */
export function lapseShield(treats, color) {
  treats.shield[color] = null;
}

/**
 * A shielded piece that moves takes its shield with it, so shielding a piece and
 * then moving it does not silently throw the shield away.
 */
export function followMove(treats, move) {
  const color = move.piece.color;
  if (treats.shield[color] === move.from) treats.shield[color] = move.to;
}

/** Plain-language state for the screen. */
export function describeShield(treats, color) {
  if (!treats.enabled) return '';
  if (treats.shield[color] === null) return '';
  const FILES = 'abcdefgh';
  const square = treats.shield[color];
  return `${FILES[square % 8]}${8 - (square >> 3)} is shielded`;
}
