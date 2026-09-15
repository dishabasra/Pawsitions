/**
 * Task 6.1 — the Treat Mode wrapper.
 *
 * The definition of done is unusual and is the whole point of the design: with
 * the switch off, the wrapper must be the identity function, so that the plain
 * game runs through the same code the perft proof tests. These tests check that
 * literally, not approximately.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyTreatState, applyShields, canUse, hasUsed, markUsed,
  raiseShield, lapseShield, followMove, TREAT_KINDS,
} from '../public/powerups.js';
import {
  initialPosition, fromFEN, legalMoves, moveToUci, squareToIndex, uciToMove, makeMove,
} from '../public/rules.js';

test('6.1 with Treat Mode off the wrapper returns the very same array', () => {
  const position = initialPosition();
  const moves = legalMoves(position);
  const off = emptyTreatState(false);

  // Not "an equal array" — the same object. Nothing was inspected, copied or
  // filtered, so the plain game cannot possibly behave differently.
  assert.equal(applyShields(moves, off), moves);
  assert.equal(applyShields(moves, null), moves);
  assert.equal(applyShields(moves, undefined), moves);
});

test('6.1 with Treat Mode on but no shield raised, still the same array', () => {
  const moves = legalMoves(initialPosition());
  assert.equal(applyShields(moves, emptyTreatState(true)), moves);
});

test('6.1 a full game with Treat Mode off matches the unwrapped rules exactly', () => {
  const off = emptyTreatState(false);
  let position = initialPosition();
  for (const uci of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5c6', 'd7c6', 'e1g1']) {
    const plain = legalMoves(position).map(moveToUci).sort();
    const wrapped = applyShields(legalMoves(position), off).map(moveToUci).sort();
    assert.deepEqual(wrapped, plain, `after ${uci}`);
    position = makeMove(position, uciToMove(position, uci));
  }
});

test('6.1 a shield removes exactly the captures of that piece, and nothing else', () => {
  // White rook on d1, black queen on d5 that White could take.
  const position = fromFEN('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
  const before = legalMoves(position);
  assert.equal(before.map(moveToUci).includes('d1d5'), true);

  const treats = emptyTreatState(true);
  treats.shield.b = squareToIndex('d5');

  const after = applyShields(before, treats);
  assert.equal(after.map(moveToUci).includes('d1d5'), false, 'the capture is gone');
  assert.equal(after.length, before.length - 1, 'and only that one move is gone');

  // Every other move survives untouched.
  const removed = before.filter((m) => !after.includes(m));
  assert.equal(removed.length, 1);
  assert.equal(moveToUci(removed[0]), 'd1d5');
});

test('6.1 a shield protects against en passant, where the pawn is not on the landing square', () => {
  // White pawn e5, black pawn just played d7-d5; White could take en passant.
  const position = fromFEN('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const before = legalMoves(position);
  assert.equal(before.map(moveToUci).includes('e5d6'), true, 'the capture exists to begin with');

  const treats = emptyTreatState(true);
  treats.shield.b = squareToIndex('d5');   // the pawn itself, not the square landed on

  const after = applyShields(before, treats);
  assert.equal(after.map(moveToUci).includes('e5d6'), false,
    'shielding the pawn must stop the en-passant capture of it');
});

test('6.1 a shield does not protect against being attacked, only captured', () => {
  // The shielded piece still gives and blocks check; it is only immune to being
  // taken. Anything else would mean teaching rules.js about shields.
  const position = fromFEN('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
  const treats = emptyTreatState(true);
  treats.shield.b = squareToIndex('d5');
  const moves = applyShields(legalMoves(position), treats);
  // The rook may still move up the d-file as far as the queen.
  assert.equal(moves.map(moveToUci).includes('d1d4'), true);
  assert.equal(moves.map(moveToUci).includes('d1d6'), false, 'still blocked by the queen');
});

test('6.1 each power-up may be used once per side per game', () => {
  const treats = emptyTreatState(true);
  for (const kind of TREAT_KINDS) {
    assert.equal(canUse(treats, 'w', kind), true, `${kind} available`);
    markUsed(treats, 'w', kind);
    assert.equal(canUse(treats, 'w', kind), false, `${kind} spent`);
    assert.equal(hasUsed(treats, 'w', kind), true);
    assert.equal(canUse(treats, 'b', kind), true, `${kind} still available to the other side`);
  }
});

test('6.1 nothing is available while Treat Mode is off, or once the game is over', () => {
  assert.equal(canUse(emptyTreatState(false), 'w', 'shield'), false);
  assert.equal(canUse(emptyTreatState(true), 'w', 'shield', { gameOver: true }), false);
  assert.equal(canUse(emptyTreatState(true), 'w', 'shield', { isMyTurn: false }), false);
  assert.equal(canUse(emptyTreatState(true), 'w', 'nonsense'), false);
});

test('6.1 a shield may only be placed on your own piece', () => {
  const position = initialPosition();
  const treats = emptyTreatState(true);
  assert.equal(raiseShield(treats, 'w', squareToIndex('e7'), position), false, "not Black's pawn");
  assert.equal(raiseShield(treats, 'w', squareToIndex('e5'), position), false, 'not an empty square');
  assert.equal(raiseShield(treats, 'w', squareToIndex('e2'), position), true);
  assert.equal(treats.shield.w, squareToIndex('e2'));
  assert.equal(hasUsed(treats, 'w', 'shield'), true);
});

test('6.1 a shield lasts exactly one opponent move, then lapses', () => {
  const treats = emptyTreatState(true);
  treats.shield.w = squareToIndex('e2');
  lapseShield(treats, 'w');
  assert.equal(treats.shield.w, null, 'gone when your own turn comes round again');
});

test('6.1 a shielded piece that moves takes its shield with it', () => {
  const position = initialPosition();
  const treats = emptyTreatState(true);
  raiseShield(treats, 'w', squareToIndex('e2'), position);

  const move = uciToMove(position, 'e2e4');
  followMove(treats, move);
  assert.equal(treats.shield.w, squareToIndex('e4'), 'the shield followed the pawn');
});

test('6.1 a move by an unshielded piece leaves the shield where it is', () => {
  const position = initialPosition();
  const treats = emptyTreatState(true);
  raiseShield(treats, 'w', squareToIndex('e2'), position);
  followMove(treats, uciToMove(position, 'd2d4'));
  assert.equal(treats.shield.w, squareToIndex('e2'));
});
