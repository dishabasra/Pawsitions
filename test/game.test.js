/**
 * Tasks 5.1 and 5.2 — captured pieces with material count, and undo.
 *
 * Both were built alongside the hot-seat game in phase 2; these are the tests
 * their definitions of done actually ask for.
 *
 * game.js holds one game's state with no screen attached, which is what makes it
 * testable here without a browser at all.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Game, PIECE_VALUE } from '../public/game.js';
import {
  initialPosition, fromFEN, toFEN, uciToMove, squareToIndex, START_FEN, PIECES,
} from '../public/rules.js';

/** Play a sequence of UCI moves through a Game, failing loudly on an illegal one. */
function play(game, ...ucis) {
  for (const uci of ucis) {
    const move = uciToMove(game.position, uci);
    assert.notEqual(move, null, `${uci} should be legal in ${game.fen}`);
    game.play(move);
  }
  return game;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.1 — captured pieces and material count
// ─────────────────────────────────────────────────────────────────────────────

test('5.1 a new game has nothing captured and nobody ahead', () => {
  const captures = new Game().captures();
  assert.deepEqual(captures.w.pieces, []);
  assert.deepEqual(captures.b.pieces, []);
  assert.equal(captures.w.lead, 0);
  assert.equal(captures.b.lead, 0);
});

test('5.1 the piece values are the usual ones', () => {
  assert.equal(PIECE_VALUE.p, 1);
  assert.equal(PIECE_VALUE.n, 3);
  assert.equal(PIECE_VALUE.b, 3);
  assert.equal(PIECE_VALUE.r, 5);
  assert.equal(PIECE_VALUE.q, 9);
  assert.equal(PIECE_VALUE.k, 0, 'a king is never captured, so it is worth nothing here');
});

test('5.1 the tray holds exactly the pieces that were taken', () => {
  const game = play(new Game(), 'e2e4', 'd7d5', 'e4d5');
  const captures = game.captures();
  assert.equal(captures.w.pieces.length, 1);
  assert.equal(captures.w.pieces[0].type, 'p');
  assert.equal(captures.w.pieces[0].color, 'b', "White's tray holds Black's pieces");
  assert.equal(captures.b.pieces.length, 0);
});

test('5.1 the lead is the difference, and only the side ahead shows one', () => {
  // Explicit numbers rather than "whatever the difference turns out to be" —
  // a test that computes its own expectation can agree with a bug.

  // White takes a pawn and is one ahead.
  let captures = play(new Game(), 'e2e4', 'd7d5', 'e4d5').captures();
  assert.equal(captures.w.points, 1);
  assert.equal(captures.w.lead, 1);
  assert.equal(captures.b.points, 0);
  assert.equal(captures.b.lead, 0);

  // Black takes it straight back: level, so neither side shows a lead.
  captures = play(new Game(), 'e2e4', 'd7d5', 'e4d5', 'd8d5').captures();
  assert.equal(captures.w.points, 1);
  assert.equal(captures.b.points, 1);
  assert.equal(captures.w.lead, 0, 'level means no lead for either side');
  assert.equal(captures.b.lead, 0);

  // A rook takes a queen: nine ahead, and the tray holds a queen.
  const queenGrab = new Game(fromFEN('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1'));
  play(queenGrab, 'd1d5');
  captures = queenGrab.captures();
  assert.deepEqual(captures.w.pieces.map((p) => p.type), ['q']);
  assert.equal(captures.w.points, 9);
  assert.equal(captures.w.lead, 9);
  assert.equal(captures.b.lead, 0);
});

test('5.1 an en-passant capture counts as a capture', () => {
  const game = play(new Game(), 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
  const captures = game.captures();
  assert.equal(captures.w.pieces.length, 1);
  assert.equal(captures.w.pieces[0].type, 'p');
});

test('5.1 promotion does not confuse the count', () => {
  // This is why captures are counted from the move history rather than by
  // comparing the board against a full set: after promoting, a side can have two
  // queens and still be behind on material. Counting pieces on the board would
  // report the opposite.
  const game = new Game(fromFEN('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
  play(game, 'a7a8q');
  const captures = game.captures();
  assert.equal(captures.w.pieces.length, 0, 'promoting captured nothing');
  assert.equal(captures.w.lead, 0);
  assert.equal(game.position.board[squareToIndex('a8')].type, 'q');
});

test('5.1 Biscuit’s treat count is the number of pieces taken, not their value', () => {
  const game = play(new Game(), 'e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5d4');
  assert.equal(game.treats('w'), 1, 'one pawn taken is one treat');
  assert.equal(game.treats('b'), 1);
  // A queen is worth nine points but is still one treat.
  assert.equal(game.captures().w.pieces.length, game.treats('w'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.2 — undo
// ─────────────────────────────────────────────────────────────────────────────

test('5.2 undo is refused at the start of a game', () => {
  const game = new Game();
  assert.equal(game.canUndo(), false);
  assert.equal(game.undo(), false);
  assert.equal(game.fen, START_FEN);
});

test('5.2 undo restores the position exactly', () => {
  const game = new Game();
  const before = game.fen;
  play(game, 'e2e4');
  assert.notEqual(game.fen, before);
  assert.equal(game.undo(), true);
  assert.equal(game.fen, before, 'including the en-passant square and the clocks');
});

test('5.2 undo restores castling rights that a move gave up', () => {
  const game = new Game(fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'));
  assert.equal(game.position.castling.wK, true);
  play(game, 'e1e2');
  assert.equal(game.position.castling.wK, false, 'moving the king gave the right up');
  game.undo();
  assert.equal(game.position.castling.wK, true, 'and undo gave it back');
  assert.equal(game.position.castling.wQ, true);
});

test('5.2 undo restores the en-passant square', () => {
  const game = play(new Game(), 'e2e4');
  assert.equal(game.position.epTarget, squareToIndex('e3'));
  play(game, 'a7a6');
  assert.equal(game.position.epTarget, null);
  game.undo();
  assert.equal(game.position.epTarget, squareToIndex('e3'), 'the chance is back');
});

test('5.2 undo puts a captured piece back, in the tray and on the board', () => {
  const game = play(new Game(), 'e2e4', 'd7d5', 'e4d5');
  assert.equal(game.treats('w'), 1);
  assert.equal(game.position.board[squareToIndex('d5')], PIECES.wp);

  game.undo();
  assert.equal(game.treats('w'), 0, 'the treat is taken back too');
  assert.equal(game.captures().w.pieces.length, 0);
  assert.equal(game.position.board[squareToIndex('d5')], PIECES.bp, 'the black pawn is back');
  assert.equal(game.position.board[squareToIndex('e4')], PIECES.wp, 'and White’s pawn is back on e4');
});

test('5.2 undo puts back a pawn taken en passant', () => {
  const game = play(new Game(), 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
  assert.equal(game.position.board[squareToIndex('d5')], null);
  game.undo();
  assert.equal(game.position.board[squareToIndex('d5')], PIECES.bp, 'the pawn beside us is back');
  assert.equal(game.position.board[squareToIndex('e5')], PIECES.wp);
  assert.equal(game.position.epTarget, squareToIndex('d6'), 'and so is the chance to take it');
});

test('5.2 undo unwinds a castle, rook and all', () => {
  const game = new Game(fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'));
  play(game, 'e1g1');
  assert.equal(game.position.board[squareToIndex('f1')].type, 'r');
  game.undo();
  assert.equal(game.position.board[squareToIndex('h1')].type, 'r', 'the rook went back to the corner');
  assert.equal(game.position.board[squareToIndex('e1')].type, 'k');
  assert.equal(game.position.board[squareToIndex('f1')], null);
});

test('5.2 undo unwinds a promotion back into a pawn', () => {
  const game = new Game(fromFEN('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
  play(game, 'a7a8q');
  assert.equal(game.position.board[squareToIndex('a8')].type, 'q');
  game.undo();
  assert.equal(game.position.board[squareToIndex('a7')], PIECES.wp, 'a pawn again');
  assert.equal(game.position.board[squareToIndex('a8')], null);
});

test('5.2 undo can be pressed repeatedly all the way back to the start', () => {
  const game = play(new Game(),
    'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5c6', 'd7c6', 'e1g1');
  assert.equal(game.moveCount, 9);

  let steps = 0;
  while (game.undo()) steps++;
  assert.equal(steps, 9);
  assert.equal(game.fen, START_FEN, 'right back to the starting position');
  assert.equal(game.canUndo(), false);
  assert.equal(game.moveCount, 0);
  assert.equal(game.treats('w'), 0);
  assert.equal(game.treats('b'), 0);
});

test('5.2 undo clears a resignation', () => {
  const game = play(new Game(), 'e2e4');
  game.resign('b');
  assert.equal(game.status().over, true);
  game.undo();
  assert.equal(game.status().over, false, 'the game is on again');
});

// ─────────────────────────────────────────────────────────────────────────────
// Rebuilding a game from what the server sent
// ─────────────────────────────────────────────────────────────────────────────

test('a game rebuilt from a position and its moves has the full history', () => {
  const played = play(new Game(), 'e2e4', 'd7d5', 'e4d5', 'd8d5');
  const rebuilt = Game.fromRecord(played.fen, played.moveList);

  assert.equal(rebuilt.fen, played.fen);
  assert.equal(rebuilt.moveCount, 4);
  assert.equal(rebuilt.treats('w'), 1, 'the tray survives the round trip');
  assert.equal(rebuilt.treats('b'), 1);
  assert.equal(rebuilt.canUndo(), true);
});

test('a rebuilt game falls back on the saved position if the moves disagree', () => {
  // The position is the thing the server is sure about; the moves are only there
  // to reconstruct the tray. Nonsense moves must not produce a nonsense board.
  const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
  const rebuilt = Game.fromRecord(fen, ['e2e4', 'zzzz', 'd7d5']);
  assert.equal(rebuilt.fen, fen, 'the saved position wins');
});

test('status reports a resignation with the right winner', () => {
  const game = new Game();
  game.resign('w');
  const status = game.status();
  assert.equal(status.state, 'resigned');
  assert.equal(status.winner, 'b');
  assert.equal(status.over, true);
  assert.match(status.text, /White resigned/);
  assert.match(status.text, /Black wins/);
});
