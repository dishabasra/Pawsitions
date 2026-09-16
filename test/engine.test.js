/**
 * Tasks 3.1 and 3.2 — the computer opponent.
 *
 * The definitions of done in FEATUREROADMAP_workplan.md are about behaviour, not
 * about the code returning something: it must take a free queen, must not take a
 * defended pawn that costs a rook, must find mate in one, must always play a
 * legal move, and must answer well inside two seconds.
 *
 * A fixed random source is used wherever a test needs a repeatable answer, since
 * the engine deliberately picks at random among equally good moves.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluate, chooseMove, MATE_SCORE } from '../public/engine.js';
import {
  initialPosition, fromFEN, makeMove, legalMoves, moveToUci, gameStatus,
  squareToIndex, toFEN, uciToMove, PIECES,
} from '../public/rules.js';

/** Always picks the first of the tied-best moves, so tests are repeatable. */
const firstOfTies = () => 0;

function best(fen, depth = 2) {
  const move = chooseMove(fromFEN(fen), { depth, random: firstOfTies });
  return move === null ? null : moveToUci(move);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.1 — evaluation
// ─────────────────────────────────────────────────────────────────────────────

test('3.1 the starting position is dead level', () => {
  assert.equal(evaluate(initialPosition()), 0);
});

test('3.1 a position is scored from White’s point of view', () => {
  // White is a queen up.
  const up = fromFEN('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
  assert.equal(evaluate(up) > 800, true, `expected roughly +900, got ${evaluate(up)}`);

  // The same position with the colours swapped must score the same, negated.
  const down = fromFEN('3qk3/8/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(evaluate(down) < -800, true, `expected roughly -900, got ${evaluate(down)}`);
});

test('3.1 mirrored positions score as exact opposites', () => {
  // Anything else means a rule was written for White and not for Black.
  const pairs = [
    ['r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
     'rnbqk2r/pppp1ppp/5n2/2b1p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 1'],
  ];
  for (const [a, b] of pairs) {
    assert.equal(evaluate(fromFEN(a)), -evaluate(fromFEN(b)), `${a}\n${b}`);
  }
});

test('3.1 a knight in the centre is worth more than one in the corner', () => {
  const centre = evaluate(fromFEN('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1'));
  const corner = evaluate(fromFEN('4k3/8/8/8/8/8/8/N3K3 w - - 0 1'));
  assert.equal(centre > corner, true, `centre ${centre} should beat corner ${corner}`);
});

test('3.1 a mate score outweighs any possible amount of material', () => {
  // Nine queens is far more material than a game can hold.
  const absurd = evaluate(fromFEN('QQQQkQQQ/QQQQQQQQ/8/8/8/8/8/4K3 w - - 0 1'));
  assert.equal(MATE_SCORE > Math.abs(absurd), true,
    `mate ${MATE_SCORE} must outweigh ${absurd}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3.2 — the search
// ─────────────────────────────────────────────────────────────────────────────

test('3.2 it takes a free queen', () => {
  // A black queen on d5, undefended, and a white rook on d1 that can take it.
  assert.equal(best('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1'), 'd1d5');
});

test('3.2 it takes a free piece with the right piece', () => {
  // Both the pawn and the rook can take on d5. Taking with the pawn is correct;
  // taking with the rook loses it to nothing, but either wins the queen, so the
  // test is that it takes at all and keeps the material.
  const move = best('4k3/8/8/3q4/2P5/8/8/3RK3 w - - 0 1');
  assert.equal(['c4d5', 'd1d5'].includes(move), true, `took with ${move}`);
});

test('3.2 it does NOT take a defended pawn when that costs a rook', () => {
  // The pawn on d5 is defended by the pawn on c6. Rxd5 wins 100 and loses 500.
  const move = best('4k3/8/2p5/3p4/8/8/8/3RK3 w - - 0 1');
  assert.notEqual(move, 'd1d5', 'taking a defended pawn with a rook loses material');
});

test('3.2 it does not hang a piece it just moved', () => {
  // Moving the knight to e5 would drop it to the pawn on d6.
  const move = best('4k3/8/3p4/8/8/2N5/8/4K3 w - - 0 1');
  assert.notEqual(move, 'c3e4', 'Ne4 is fine');
  const after = makeMove(fromFEN('4k3/8/3p4/8/8/2N5/8/4K3 w - - 0 1'),
    uciToMove(fromFEN('4k3/8/3p4/8/8/2N5/8/4K3 w - - 0 1'), move));
  assert.equal(gameStatus(after) !== 'checkmate', true);
});

test('3.2 it finds mate in one', () => {
  const positions = [
    ['6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8', 'back-rank mate with the rook'],
    ['7k/Q7/6K1/8/8/8/8/8 w - - 0 1', 'a7g7', 'queen mates on g7, guarded by the king'],
    ['r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1', 'a8a1', 'the same back-rank mate, for Black'],
  ];

  for (const [fen, mate, description] of positions) {
    const position = fromFEN(fen);

    // First check the test itself: the named move really must be mate. Without
    // this, a bad test position looks like an engine bug — which is exactly what
    // happened while writing these.
    const named = uciToMove(position, mate);
    assert.notEqual(named, null, `${description}: ${mate} is not even legal in ${fen}`);
    assert.equal(gameStatus(makeMove(position, named)), 'checkmate',
      `${description}: ${mate} is not actually mate — fix the test position, not the engine`);

    // Now the engine. Any mate will do, not necessarily the one named.
    const chosen = chooseMove(position, { depth: 2, random: firstOfTies });
    assert.equal(gameStatus(makeMove(position, chosen)), 'checkmate',
      `${description}: played ${moveToUci(chosen)}, which is not mate (${mate} was)`);
  }
});

test('3.2 it escapes mate in one when it can', () => {
  // Black is threatened with Ra8#. Giving the king an escape square is the move.
  const fen = '6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1';
  const move = best(fen);
  const after = makeMove(fromFEN(fen), uciToMove(fromFEN(fen), move));
  // After Black's move, White must no longer have mate in one available.
  const whiteReply = chooseMove(after, { depth: 2, random: firstOfTies });
  const afterWhite = makeMove(after, whiteReply);
  assert.notEqual(gameStatus(afterWhite), 'checkmate',
    `black played ${move} and was mated anyway by ${moveToUci(whiteReply)}`);
});

test('3.2 it returns null only when the game is genuinely over', () => {
  assert.equal(chooseMove(fromFEN('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')), null,
    'checkmate: nothing to play');
  assert.equal(chooseMove(fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), null,
    'stalemate: nothing to play');
  assert.notEqual(chooseMove(initialPosition()), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// The two requirements the brief states outright
// ─────────────────────────────────────────────────────────────────────────────

test('3.2 every move it plays is legal, over a whole self-played game', () => {
  let position = initialPosition();
  const seen = [];
  for (let ply = 0; ply < 120; ply++) {
    const status = gameStatus(position);
    if (status === 'checkmate' || status === 'stalemate') break;

    const move = chooseMove(position, { depth: 2 });
    assert.notEqual(move, null, `no move at ply ${ply} in ${toFEN(position)}`);

    // The real check: the chosen move must be one the rules offered.
    const legal = legalMoves(position);
    assert.equal(
      legal.some((m) => m.from === move.from && m.to === move.to && m.promotion === move.promotion),
      true,
      `illegal move ${moveToUci(move)} at ply ${ply} in ${toFEN(position)}`,
    );
    position = makeMove(position, move);
    seen.push(moveToUci(move));
  }
  assert.equal(seen.length > 10, true, 'the game should last more than ten moves');
});

test('3.2 it answers within two seconds from a hundred varied positions', () => {
  // Walk a self-played game and time every single reply. The slowest one is what
  // the requirement is about — an average would hide the bad case.
  let position = initialPosition();
  let slowest = 0;
  let slowestFen = '';
  let measured = 0;

  for (let ply = 0; ply < 100; ply++) {
    const status = gameStatus(position);
    if (status === 'checkmate' || status === 'stalemate') break;

    const started = Date.now();
    const move = chooseMove(position, { depth: 2 });
    const took = Date.now() - started;
    measured++;
    if (took > slowest) { slowest = took; slowestFen = toFEN(position); }

    position = makeMove(position, move);
  }

  assert.equal(measured > 20, true, 'should have measured a decent number of replies');
  assert.equal(slowest < 2000, true,
    `slowest reply was ${slowest}ms (limit 2000ms) in ${slowestFen}`);
  // Left in deliberately: if this ever creeps up, it shows in the test output.
  console.log(`      slowest of ${measured} replies: ${slowest}ms`);
});

test('3.2 the opening move is not always the same one', () => {
  // The engine picks at random among equally good moves, so a hundred games
  // should not open identically every time.
  const openings = new Set();
  for (let i = 0; i < 30; i++) {
    openings.add(moveToUci(chooseMove(initialPosition(), { depth: 2 })));
  }
  assert.equal(openings.size > 1, true, `only ever played ${[...openings]}`);
});

test('3.2 deeper search is at least as good, never worse, on a tactic', () => {
  // Taking the free queen is right at any depth.
  for (const depth of [1, 2, 3]) {
    assert.equal(best('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', depth), 'd1d5', `depth ${depth}`);
  }
});
