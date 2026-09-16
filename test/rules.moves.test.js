/**
 * Tasks 1.2 – 1.7: move generation, check, castling, en passant, promotion, and
 * game status.
 *
 * Perft (test/perft.test.js) already proves the rules are correct as a whole. This
 * file exists for a different reason: when perft fails, it tells you a number is
 * wrong but not which rule. These tests name the rule. They are written straight
 * from the definitions of done in FEATUREROADMAP_workplan.md.
 *
 * Some positions here have no kings on them. That is fine and deliberate — it is
 * the cleanest way to ask "how does a lone knight move?" without a king's
 * presence changing the answer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WHITE, BLACK, PIECES, QUEEN, ROOK, BISHOP, KNIGHT,
  fromFEN, toFEN, initialPosition, squareToIndex, indexToSquare,
  legalMoves, movesFrom, makeMove, isInCheck, isSquareAttacked,
  gameStatus, isGameOver, uciToMove, moveToUci, START_FEN,
} from '../public/rules.js';

/** The destinations of the legal moves from a square, as square names, sorted. */
function destinationsFrom(fen, square) {
  const pos = fromFEN(fen);
  return movesFrom(pos, squareToIndex(square))
    .map((m) => indexToSquare(m.to))
    .sort();
}

/** Every legal move in a position, in UCI, sorted. */
function allMoves(fen) {
  return legalMoves(fromFEN(fen)).map(moveToUci).sort();
}

/** Play a sequence of UCI moves, failing loudly if any is not legal. */
function play(fen, ...ucis) {
  let pos = typeof fen === 'string' ? fromFEN(fen) : fen;
  for (const uci of ucis) {
    const move = uciToMove(pos, uci);
    assert.notEqual(move, null, `${uci} should be legal in ${toFEN(pos)}`);
    pos = makeMove(pos, move);
  }
  return pos;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.2 — how the six pieces move
// ─────────────────────────────────────────────────────────────────────────────

test('1.2 the starting position has exactly 20 moves', () => {
  assert.equal(legalMoves(initialPosition()).length, 20);
});

test('1.2 those 20 are sixteen pawn moves and four knight moves', () => {
  const moves = legalMoves(initialPosition());
  assert.equal(moves.filter((m) => m.piece.type === 'p').length, 16);
  assert.equal(moves.filter((m) => m.piece.type === 'n').length, 4);
  assert.deepEqual(
    moves.filter((m) => m.piece.type === 'n').map(moveToUci).sort(),
    ['b1a3', 'b1c3', 'g1f3', 'g1h3'],
  );
});

test('1.2 a knight in the middle has 8 moves, in the corner 2', () => {
  assert.equal(destinationsFrom('8/8/8/8/3N4/8/8/8 w - - 0 1', 'd4').length, 8);
  assert.deepEqual(
    destinationsFrom('8/8/8/8/3N4/8/8/8 w - - 0 1', 'd4'),
    ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'],
  );
  assert.deepEqual(destinationsFrom('8/8/8/8/8/8/8/N7 w - - 0 1', 'a1'), ['b3', 'c2']);
  assert.deepEqual(destinationsFrom('N7/8/8/8/8/8/8/8 w - - 0 1', 'a8'), ['b6', 'c7']);
});

test('1.2 a knight never wraps around the edge of the board', () => {
  // A naive implementation that adds numbers to an index lets a knight on h4
  // "step one file right" onto the a-file. Every destination here must stay on
  // the g and h files.
  const dests = destinationsFrom('8/8/8/8/7N/8/8/8 w - - 0 1', 'h4');
  assert.deepEqual(dests, ['f3', 'f5', 'g2', 'g6']);
});

test('1.2 a queen in the middle of an empty board has 27 moves', () => {
  assert.equal(destinationsFrom('8/8/8/8/3Q4/8/8/8 w - - 0 1', 'd4').length, 27);
});

test('1.2 a rook has 14 moves anywhere on an empty board', () => {
  for (const square of ['a1', 'd4', 'h8', 'e2']) {
    const fen = (() => {
      const pos = fromFEN('8/8/8/8/8/8/8/8 w - - 0 1');
      pos.board[squareToIndex(square)] = PIECES.wr;
      return toFEN(pos);
    })();
    assert.equal(destinationsFrom(fen, square).length, 14, square);
  }
});

test('1.2 a bishop on a corner has 7 moves, in the middle 13', () => {
  assert.equal(destinationsFrom('8/8/8/8/8/8/8/B7 w - - 0 1', 'a1').length, 7);
  assert.equal(destinationsFrom('8/8/8/8/3B4/8/8/8 w - - 0 1', 'd4').length, 13);
});

test('1.2 a king in the middle has 8 moves, in the corner 3', () => {
  assert.equal(destinationsFrom('8/8/8/8/3K4/8/8/8 w - - 0 1', 'd4').length, 8);
  assert.equal(destinationsFrom('8/8/8/8/8/8/8/K7 w - - 0 1', 'a1').length, 3);
});

test('1.2 a sliding piece stops at the first occupied square', () => {
  // A black pawn on d5 may be captured; the rook cannot pass through it.
  const dests = destinationsFrom('8/8/8/3p4/3R4/8/8/8 w - - 0 1', 'd4');
  assert.equal(dests.includes('d5'), true, 'may capture the blocker');
  assert.equal(dests.includes('d6'), false, 'may not pass through it');
  assert.equal(dests.includes('d7'), false);
});

test('1.2 a sliding piece may not capture its own side', () => {
  const dests = destinationsFrom('8/8/8/3P4/3R4/8/8/8 w - - 0 1', 'd4');
  assert.equal(dests.includes('d5'), false, 'may not take its own pawn');
  assert.equal(dests.includes('d6'), false, 'nor pass through it');
});

test('1.2 pawns step one square, or two from home, and only onto empty squares', () => {
  assert.deepEqual(destinationsFrom('8/8/8/8/8/8/4P3/8 w - - 0 1', 'e2'), ['e3', 'e4']);
  assert.deepEqual(destinationsFrom('8/8/8/8/8/4P3/8/8 w - - 0 1', 'e3'), ['e4']);
  // Blocked directly in front: no move at all, not even the two-square one.
  assert.deepEqual(destinationsFrom('8/8/8/8/8/4n3/4P3/8 w - - 0 1', 'e2'), []);
  // Blocked two squares ahead: the single step still works.
  assert.deepEqual(destinationsFrom('8/8/8/8/4n3/8/4P3/8 w - - 0 1', 'e2'), ['e3']);
});

test('1.2 pawns capture diagonally forwards only, and never straight ahead', () => {
  const dests = destinationsFrom('8/8/8/8/3ppp2/4P3/8/8 w - - 0 1', 'e3');
  assert.deepEqual(dests, ['d4', 'f4']);
  assert.equal(dests.includes('e4'), false, 'may not capture straight ahead');
});

test('1.2 black pawns travel down the board', () => {
  assert.deepEqual(destinationsFrom('8/4p3/8/8/8/8/8/8 b - - 0 1', 'e7'), ['e5', 'e6']);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.3 — check, pins, and getting out of check
// ─────────────────────────────────────────────────────────────────────────────

test('1.3 a pinned piece cannot move off the pinning line', () => {
  // Black knight e5 stands between its king on e8 and a white rook on e1.
  const fen = '4k3/8/8/4n3/8/8/8/4R1K1 b - - 0 1';
  assert.deepEqual(movesFrom(fromFEN(fen), squareToIndex('e5')), [],
    'a knight can never stay on the pin line, so it has no legal move at all');
});

test('1.3 a pinned piece may still move along the pinning line', () => {
  // Black rook e5, same pin. It may slide up and down the e-file, and capture
  // the pinning rook — but it may not leave the file.
  const dests = destinationsFrom('4k3/8/8/4r3/8/8/8/4R1K1 b - - 0 1', 'e5');
  assert.deepEqual(dests, ['e1', 'e2', 'e3', 'e4', 'e6', 'e7']);
});

test('1.3 a king may not move to an attacked square', () => {
  // Black rook on e8 checks the white king on e1. e2 is still on the e-file.
  const dests = destinationsFrom('4r3/8/8/8/8/8/8/4K3 w - - 0 1', 'e1');
  assert.deepEqual(dests, ['d1', 'd2', 'f1', 'f2']);
  assert.equal(dests.includes('e2'), false,
    'a king may not step backwards along the line that is checking it');
});

test('1.3 a king may not capture a defended piece', () => {
  // The white king is checked by the queen on d2, which the rook on d8 defends.
  const moves = allMoves('3r4/8/8/8/8/8/3q4/4K3 w - - 0 1');
  assert.equal(moves.includes('e1d2'), false, 'the queen is defended');
  assert.deepEqual(moves, ['e1f1'], 'the only escape is f1');
});

test('1.3 when in check, only moves that deal with the check are legal', () => {
  // White king e1, black rook e8 giving check. White also has a rook on a2 that
  // could interpose on e2, and a knight on b1 that could not help at all.
  const moves = allMoves('4r3/8/8/8/8/8/R7/1N2K3 w - - 0 1');
  assert.equal(moves.includes('a2e2'), true, 'blocking the check is legal');
  assert.equal(moves.includes('a2a3'), false, 'an unrelated rook move is not');
  assert.equal(moves.includes('b1c3'), false, 'nor an unrelated knight move');
  for (const uci of moves) {
    const after = makeMove(fromFEN('4r3/8/8/8/8/8/R7/1N2K3 w - - 0 1'), uciToMove(fromFEN('4r3/8/8/8/8/8/R7/1N2K3 w - - 0 1'), uci));
    assert.equal(isInCheck(after, WHITE), false, `${uci} must leave the king safe`);
  }
});

test('1.3 capturing the checking piece is a legal way out', () => {
  const moves = allMoves('8/8/8/8/8/8/4r3/4K3 w - - 0 1');
  assert.equal(moves.includes('e1e2'), true, 'the rook on e2 is undefended, so the king may take it');
});

test('1.3 isInCheck and isSquareAttacked agree about the king', () => {
  const pos = fromFEN('4r3/8/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(isInCheck(pos, WHITE), true);
  assert.equal(isInCheck(pos, BLACK), false);
  assert.equal(isSquareAttacked(pos, squareToIndex('e1'), BLACK), true);
  assert.equal(isSquareAttacked(pos, squareToIndex('d1'), BLACK), false);
});

test('1.3 a pinned piece still attacks, so it still restrains the enemy king', () => {
  // The white bishop on d3 is pinned by the rook on d8 — it cannot legally move.
  // It nonetheless covers f5, so the black king may not go there.
  const fen = '3r4/8/8/5k2/8/3B4/8/3K4 b - - 0 1';
  const dests = destinationsFrom(fen, 'f5');
  assert.equal(dests.includes('e4'), false, 'still covered by the pinned bishop');
  assert.equal(dests.includes('g4'), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.4 — castling
// ─────────────────────────────────────────────────────────────────────────────

const CASTLE_BOARD = 'r3k2r/8/8/8/8/8/8/R3K2R';

test('1.4 both castles are offered when everything is in order', () => {
  const moves = allMoves(`${CASTLE_BOARD} w KQkq - 0 1`);
  assert.equal(moves.includes('e1g1'), true, 'kingside');
  assert.equal(moves.includes('e1c1'), true, 'queenside');

  const black = allMoves(`${CASTLE_BOARD} b KQkq - 0 1`);
  assert.equal(black.includes('e8g8'), true);
  assert.equal(black.includes('e8c8'), true);
});

test('1.4 castling is refused when a square between king and rook is occupied', () => {
  const moves = allMoves('r3k2r/8/8/8/8/8/8/Rn2K1nR w KQkq - 0 1');
  assert.equal(moves.includes('e1g1'), false, 'g1 is occupied');
  assert.equal(moves.includes('e1c1'), false, 'b1 is occupied');
});

test('1.4 castling is refused while the king is in check', () => {
  const moves = allMoves('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.equal(moves.includes('e1g1'), false);
  assert.equal(moves.includes('e1c1'), false);
});

test('1.4 castling is refused when the king would pass through an attacked square', () => {
  const moves = allMoves('5r2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.equal(moves.includes('e1g1'), false, 'f1 is attacked');
  assert.equal(moves.includes('e1c1'), true, 'the queenside is unaffected');
});

test('1.4 castling is refused when the king would land on an attacked square', () => {
  const moves = allMoves('6r1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.equal(moves.includes('e1g1'), false, 'g1 is attacked');
  assert.equal(moves.includes('e1c1'), true);
});

test('1.4 queenside castling is allowed even when the b-file square is attacked', () => {
  // The rook passes over b1, but only the king's journey has to be safe. This is
  // the rule most often got wrong, in both directions.
  const moves = allMoves('1r6/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.equal(moves.includes('e1c1'), true, 'b1 being attacked does not matter');
});

test('1.4 castling puts the rook on the correct square, all four ways', () => {
  const cases = [
    ['w', 'e1g1', 'g1', 'f1', 'h1'],
    ['w', 'e1c1', 'c1', 'd1', 'a1'],
    ['b', 'e8g8', 'g8', 'f8', 'h8'],
    ['b', 'e8c8', 'c8', 'd8', 'a8'],
  ];
  for (const [turn, uci, kingTo, rookTo, rookFrom] of cases) {
    const after = play(`${CASTLE_BOARD} ${turn} KQkq - 0 1`, uci);
    assert.equal(after.board[squareToIndex(kingTo)].type, 'k', `${uci}: king on ${kingTo}`);
    assert.equal(after.board[squareToIndex(rookTo)].type, 'r', `${uci}: rook on ${rookTo}`);
    assert.equal(after.board[squareToIndex(rookFrom)], null, `${uci}: ${rookFrom} vacated`);
    assert.equal(after.board[squareToIndex('e' + (turn === 'w' ? '1' : '8'))], null);
  }
});

test('1.4 moving the king loses both castling rights', () => {
  const after = play(`${CASTLE_BOARD} w KQkq - 0 1`, 'e1e2');
  assert.equal(after.castling.wK, false);
  assert.equal(after.castling.wQ, false);
  assert.equal(after.castling.bK, true, "black's rights are untouched");
  assert.equal(after.castling.bQ, true);
});

test('1.4 moving a rook loses only that rook’s right', () => {
  const kingside = play(`${CASTLE_BOARD} w KQkq - 0 1`, 'h1h2');
  assert.equal(kingside.castling.wK, false);
  assert.equal(kingside.castling.wQ, true);

  const queenside = play(`${CASTLE_BOARD} w KQkq - 0 1`, 'a1a2');
  assert.equal(queenside.castling.wQ, false);
  assert.equal(queenside.castling.wK, true);
});

test('1.4 a rook CAPTURED on its home square loses the right too', () => {
  // The clause most implementations forget. White's rook on a1 takes the black
  // rook on a8, which must end Black's queenside right.
  const after = play(`${CASTLE_BOARD} w KQkq - 0 1`, 'a1a8');
  assert.equal(after.castling.bQ, false, 'the captured rook cannot castle');
  assert.equal(after.castling.bK, true, "black's other rook is unaffected");
  assert.equal(after.castling.wQ, false, 'and the capturing rook left a1');
});

test('1.4 a castling right is ignored when the pieces are not actually there', () => {
  // Hand-written and network-supplied FEN can claim a right that the board does
  // not support. The rights alone are never trusted.
  const noRook = allMoves('r3k2r/8/8/8/8/8/8/4K3 w KQkq - 0 1');
  assert.equal(noRook.includes('e1g1'), false);
  assert.equal(noRook.includes('e1c1'), false);

  const kingElsewhere = allMoves('r3k2r/8/8/8/8/8/8/R2K3R w KQkq - 0 1');
  assert.equal(kingElsewhere.some((m) => m.startsWith('d1')) , true, 'the king still moves normally');
  assert.equal(kingElsewhere.includes('e1g1'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.5 — en passant
// ─────────────────────────────────────────────────────────────────────────────

test('1.5 a two-square pawn move leaves an en-passant target behind it', () => {
  const after = play(START_FEN, 'e2e4');
  assert.equal(after.epTarget, squareToIndex('e3'));
  assert.equal(toFEN(after).split(' ')[3], 'e3');
});

test('1.5 any other move clears the en-passant target', () => {
  const after = play(START_FEN, 'e2e4', 'e7e5', 'g1f3');
  assert.equal(after.epTarget, null);
  assert.equal(toFEN(after).split(' ')[3], '-');
});

test('1.5 a single-square pawn move sets no target', () => {
  assert.equal(play(START_FEN, 'e2e3').epTarget, null);
});

test('1.5 the capture is offered for exactly one move, then gone', () => {
  // Black pawn on d7 runs past the white pawn on e5.
  const start = '4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1';
  const afterDouble = play(start, 'd7d5');
  assert.equal(afterDouble.epTarget, squareToIndex('d6'));
  assert.equal(legalMoves(afterDouble).map(moveToUci).includes('e5d6'), true,
    'available immediately');

  // Let a quiet move go by, and the chance is gone for good.
  const later = play(afterDouble, 'e1e2', 'e8e7');
  assert.equal(legalMoves(later).map(moveToUci).includes('e5d6'), false,
    'not available a move later');
});

test('1.5 en passant removes the pawn beside you, not the one you land on', () => {
  const after = play('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1', 'd7d5', 'e5d6');
  assert.equal(after.board[squareToIndex('d6')], PIECES.wp, 'the capturing pawn lands on d6');
  assert.equal(after.board[squareToIndex('d5')], null, 'the captured pawn was on d5');
  assert.equal(after.board[squareToIndex('e5')], null, 'and e5 is vacated');
});

test('1.5 black may capture en passant too', () => {
  const after = play('4k3/8/8/8/3p4/8/2P5/4K3 w - - 0 1', 'c2c4', 'd4c3');
  assert.equal(after.board[squareToIndex('c3')], PIECES.bp);
  assert.equal(after.board[squareToIndex('c4')], null);
});

test('1.5 en passant is refused when it would expose your own king', () => {
  // The rarest case in chess. White king a5, white pawn b5, black pawn c5, black
  // rook h5 — all on the fifth rank. Taking en passant removes BOTH pawns from
  // the rank at once, leaving the king staring at the rook. No other rule in
  // chess removes two pieces from a line in one move.
  const pos = fromFEN('8/8/8/KPp4r/8/8/8/7k w - c6 0 1');
  const moves = legalMoves(pos).map(moveToUci);
  assert.equal(moves.includes('b5c6'), false, 'en passant here is illegal');
  assert.equal(moves.includes('b5b6'), true, 'but the pawn may still step forward');
});

test('1.5 an en-passant target with no pawn beside it is ignored', () => {
  // FEN from outside can claim a target that makes no sense. It must not produce
  // a move that captures nothing.
  const pos = fromFEN('4k3/8/8/4P3/8/8/8/4K3 w - d6 0 1');
  assert.equal(legalMoves(pos).map(moveToUci).includes('e5d6'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.6 — promotion
// ─────────────────────────────────────────────────────────────────────────────

test('1.6 a promoting pawn generates four moves, not one', () => {
  const moves = legalMoves(fromFEN('8/4P3/8/8/8/8/8/K6k w - - 0 1'))
    .filter((m) => m.from === squareToIndex('e7'));
  assert.equal(moves.length, 4);
  assert.deepEqual(moves.map(moveToUci).sort(), ['e7e8b', 'e7e8n', 'e7e8q', 'e7e8r']);
});

test('1.6 promoting by capture also offers all four', () => {
  const moves = legalMoves(fromFEN('3r1r2/4P3/8/8/8/8/8/K6k w - - 0 1'))
    .filter((m) => m.from === squareToIndex('e7'));
  assert.equal(moves.length, 12, 'three destinations × four pieces');
  assert.deepEqual(
    [...new Set(moves.map((m) => indexToSquare(m.to)))].sort(),
    ['d8', 'e8', 'f8'],
  );
});

test('1.6 the chosen piece actually appears on the board', () => {
  for (const [uci, type] of [['e7e8q', QUEEN], ['e7e8r', ROOK], ['e7e8b', BISHOP], ['e7e8n', KNIGHT]]) {
    const after = play('8/4P3/8/8/8/8/8/K6k w - - 0 1', uci);
    const promoted = after.board[squareToIndex('e8')];
    assert.equal(promoted.type, type, uci);
    assert.equal(promoted.color, WHITE, uci);
    assert.equal(after.board[squareToIndex('e7')], null, uci);
  }
});

test('1.6 black promotes on rank 1', () => {
  const after = play('K6k/8/8/8/8/8/4p3/8 b - - 0 1', 'e2e1n');
  assert.equal(after.board[squareToIndex('e1')].type, KNIGHT);
  assert.equal(after.board[squareToIndex('e1')].color, BLACK);
});

test('1.6 promotion to a king or a pawn is impossible', () => {
  const pos = fromFEN('8/4P3/8/8/8/8/8/K6k w - - 0 1');
  assert.equal(uciToMove(pos, 'e7e8k'), null, 'no promoting to a king');
  assert.equal(uciToMove(pos, 'e7e8p'), null, 'no promoting to a pawn');
  assert.notEqual(uciToMove(pos, 'e7e8q'), null, 'a queen is fine');
});

test('1.6 a pawn that is not promoting carries no promotion piece', () => {
  const move = uciToMove(fromFEN(START_FEN), 'e2e4');
  assert.equal(move.promotion, null);
  assert.equal(moveToUci(move), 'e2e4');
});

test('1.6 the four promotions behave as four genuinely different pieces', () => {
  // White pawn e7, black king g7. Promoting to a knight gives check, because a
  // knight on e8 covers g7. Promoting to a queen does not, because e8 and g7 do
  // not share a line. If all four promotions were generated and then treated as
  // one move, this distinction would be impossible.
  const pos = fromFEN('8/4P1k1/8/8/8/8/8/K7 w - - 0 1');
  const moves = legalMoves(pos).map(moveToUci);
  for (const uci of ['e7e8q', 'e7e8r', 'e7e8b', 'e7e8n']) {
    assert.equal(moves.includes(uci), true, `${uci} should be offered`);
  }
  assert.equal(isInCheck(play(pos, 'e7e8n'), BLACK), true, 'a knight on e8 checks g7');
  assert.equal(isInCheck(play(pos, 'e7e8q'), BLACK), false, 'a queen on e8 does not');
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.7 — checkmate and stalemate
// ─────────────────────────────────────────────────────────────────────────────

test("1.7 fool's mate is checkmate", () => {
  const pos = fromFEN('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  assert.equal(gameStatus(pos), 'checkmate');
  assert.equal(isGameOver(pos), true);
  assert.equal(legalMoves(pos).length, 0);
  assert.equal(isInCheck(pos, WHITE), true);
});

test("1.7 fool's mate reached by playing the moves, not just loaded from FEN", () => {
  const pos = play(START_FEN, 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.equal(gameStatus(pos), 'checkmate');
});

test('1.7 back-rank mate is checkmate', () => {
  const pos = fromFEN('6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1');
  assert.equal(gameStatus(pos), 'playing');
  const mated = play(pos, 'g8h8', 'a1a8');
  assert.equal(gameStatus(mated), 'checkmate');
});

test('1.7 the classic king-and-queen stalemate is stalemate, not checkmate', () => {
  const pos = fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(gameStatus(pos), 'stalemate');
  assert.equal(isGameOver(pos), true);
  assert.equal(legalMoves(pos).length, 0);
  assert.equal(isInCheck(pos, BLACK), false, 'stalemate means NOT in check');
});

test('1.7 a blocked-in pawn position is stalemate', () => {
  const pos = fromFEN('8/8/8/8/8/4k3/4p3/4K3 w - - 0 1');
  assert.equal(gameStatus(pos), 'stalemate');
});

test('1.7 being in check with a way out is "check", not "checkmate"', () => {
  const pos = fromFEN('4k3/8/8/8/8/8/8/4R2K b - - 0 1');
  assert.equal(gameStatus(pos), 'check');
  assert.equal(isGameOver(pos), false);
  assert.equal(legalMoves(pos).length > 0, true);
});

test('1.7 an ordinary position is "playing"', () => {
  assert.equal(gameStatus(initialPosition()), 'playing');
  assert.equal(isGameOver(initialPosition()), false);
});

test('1.7 a position with no legal moves is never reported as playing', () => {
  for (const fen of [
    'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', // checkmate
    '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',                                 // stalemate
    '8/8/8/8/8/4k3/4p3/4K3 w - - 0 1',                                // stalemate
  ]) {
    const pos = fromFEN(fen);
    assert.equal(legalMoves(pos).length, 0, fen);
    assert.notEqual(gameStatus(pos), 'playing', fen);
    assert.notEqual(gameStatus(pos), 'check', fen);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// uciToMove — the gate that outside move text has to pass
// ─────────────────────────────────────────────────────────────────────────────

test('uciToMove accepts a legal move and returns the full move object', () => {
  const pos = initialPosition();
  const move = uciToMove(pos, 'e2e4');
  assert.equal(move.from, squareToIndex('e2'));
  assert.equal(move.to, squareToIndex('e4'));
  assert.equal(move.piece, PIECES.wp);
  assert.equal(move.flag, 'double', 'the flag the caller could not have supplied');
});

test('uciToMove refuses everything that is not legal right now', () => {
  const pos = initialPosition();
  const refusals = [
    ['e7e5', 'a move for the other side'],
    ['e2e5', 'a move the piece cannot make'],
    ['e4e5', 'a move from an empty square'],
    ['e1g1', 'castling that is not available'],
    ['e2e9', 'a square that does not exist'],
    ['', 'nothing at all'],
    ['resign', 'not notation'],
  ];
  for (const [uci, why] of refusals) {
    assert.equal(uciToMove(pos, uci), null, `should refuse ${why}: "${uci}"`);
  }
});

test('uciToMove is the only door, so a made-up move object cannot get in', () => {
  // Even a well-formed UCI string for a move that exists in another position is
  // refused here, because resolution happens against *this* position.
  const pos = fromFEN('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.notEqual(uciToMove(pos, 'e1g1'), null, 'castling is available here');

  // Walk the king off e1 and back, letting Black shuffle in between. The board
  // ends up identical, but the right is gone for good — so the same UCI string
  // that was accepted above is refused now.
  const back = play(pos, 'e1f1', 'e8e7', 'f1e1', 'e7e8');
  assert.equal(toFEN(back).split(' ')[0], toFEN(pos).split(' ')[0], 'same board');
  assert.equal(back.turn, WHITE, 'and White to move again');
  assert.equal(uciToMove(back, 'e1g1'), null, 'but the right was lost by moving the king');
});

// ─────────────────────────────────────────────────────────────────────────────
// Positions are never modified in place
// ─────────────────────────────────────────────────────────────────────────────

test('makeMove leaves the position it was given untouched', () => {
  const before = initialPosition();
  const snapshot = toFEN(before);
  makeMove(before, uciToMove(before, 'e2e4'));
  assert.equal(toFEN(before), snapshot, 'the original is unchanged');
  assert.equal(snapshot, START_FEN);
});

test('legalMoves does not disturb the position it inspects', () => {
  const pos = fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const before = toFEN(pos);
  legalMoves(pos);
  legalMoves(pos);
  assert.equal(toFEN(pos), before);
});

test('the move counters advance correctly', () => {
  let pos = initialPosition();
  assert.equal(pos.fullmove, 1);

  pos = play(pos, 'g1f3');
  assert.equal(pos.fullmove, 1, "still move 1 until black has replied");
  assert.equal(pos.halfmove, 1, 'a knight move is not a pawn move or a capture');

  pos = play(pos, 'g8f6');
  assert.equal(pos.fullmove, 2);
  assert.equal(pos.halfmove, 2);

  pos = play(pos, 'e2e4');
  assert.equal(pos.halfmove, 0, 'a pawn move resets the clock');
});
