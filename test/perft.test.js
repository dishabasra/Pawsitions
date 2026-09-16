/**
 * Task 1.8 — the perft proof. THE GATE.
 *
 * No feature in any later phase may be built while this file fails. Every mode
 * and the online server import the same rules module, so a bug here is a bug in
 * four places at once.
 *
 * Perft counts every distinct sequence of legal moves of a given length. It is a
 * far more searching test than any hand-written example, because a single wrong
 * rule anywhere changes a count somewhere. Depth 3 from the starting position
 * checks 8,902 sequences; depth 4 checks 197,281.
 *
 *   npm test                  the counts below, a few seconds
 *   PERFT_DEEP=1 npm test     also depth 5 from the start — 4,865,609 sequences
 *
 * If a count ever disagrees, use perftDivide() to find which first move is
 * wrong, then recurse into it. That narrows a wrong rule down to a single move
 * in a few minutes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { fromFEN, perft, perftDivide, legalMoves, initialPosition } from '../public/rules.js';
import { PERFT_POSITIONS } from './positions.js';

// The three numbers the brief names, stated on their own so that a failure says
// exactly which requirement broke.
test('the brief: starting position gives 20, 400 and 8,902', () => {
  const start = initialPosition();
  assert.equal(perft(start, 1), 20, 'depth 1 must be 20');
  assert.equal(perft(start, 2), 400, 'depth 2 must be 400');
  assert.equal(perft(start, 3), 8902, 'depth 3 must be 8,902');
});

for (const position of PERFT_POSITIONS) {
  test(`perft — ${position.name} (${position.why})`, () => {
    const pos = fromFEN(position.fen);
    position.counts.forEach((expected, i) => {
      const depth = i + 1;
      assert.equal(
        perft(pos, depth),
        expected,
        `${position.name} at depth ${depth}\n  FEN: ${position.fen}\n` +
        `  If this fails, run perftDivide(fromFEN(fen), ${depth}) and compare ` +
        'against a known-good engine to find the offending first move.',
      );
    });
  });
}

test('perft depth 5 from the start', { skip: process.env.PERFT_DEEP ? false : 'set PERFT_DEEP=1 to run (takes ~30s)' }, () => {
  assert.equal(perft(initialPosition(), 5), 4865609);
});

test('perft at depth 0 counts the position itself', () => {
  assert.equal(perft(initialPosition(), 0), 1);
});

test('perftDivide splits depth 1 into every legal first move', () => {
  const divided = perftDivide(initialPosition(), 1);
  assert.equal(Object.keys(divided).length, 20);
  assert.equal(Object.values(divided).every((n) => n === 1), true);
  assert.equal(divided.e2e4, 1);
  assert.equal(divided.g1f3, 1);
});

test('perftDivide subtotals add up to the whole perft count', () => {
  const pos = fromFEN(PERFT_POSITIONS[1].fen); // Kiwipete
  const divided = perftDivide(pos, 3);
  const sum = Object.values(divided).reduce((a, b) => a + b, 0);
  assert.equal(sum, perft(pos, 3));
  assert.equal(Object.keys(divided).length, legalMoves(pos).length);
});
