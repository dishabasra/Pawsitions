/**
 * Task 1.1 — board representation, FEN and move notation.
 *
 * Definition of done, from FEATUREROADMAP_workplan.md:
 *   toFEN(initialPosition()) returns the standard starting FEN, and
 *   fromFEN(toFEN(p)) round-trips a dozen hand-written positions without losing
 *   castling rights or the en-passant square.
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WHITE, BLACK,
  PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  PIECES, piece, opposite,
  pieceToFenChar, fenCharToPiece,
  indexToSquare, squareToIndex, fileOf, rankOf, isSquare,
  START_FEN, emptyPosition, initialPosition, clonePosition, findKing,
  toFEN, fromFEN,
  createMove, moveToUci, parseUci, PROMOTION_TYPES,
} from '../public/rules.js';

// ─────────────────────────────────────────────────────────────────────────────
// Squares
// ─────────────────────────────────────────────────────────────────────────────

test('square names and indices agree at the corners and the middle', () => {
  assert.equal(squareToIndex('a8'), 0);
  assert.equal(squareToIndex('h8'), 7);
  assert.equal(squareToIndex('a1'), 56);
  assert.equal(squareToIndex('h1'), 63);
  assert.equal(squareToIndex('e4'), 36);
  assert.equal(squareToIndex('e2'), 52);
  assert.equal(squareToIndex('d5'), 27);

  assert.equal(indexToSquare(0), 'a8');
  assert.equal(indexToSquare(7), 'h8');
  assert.equal(indexToSquare(56), 'a1');
  assert.equal(indexToSquare(63), 'h1');
  assert.equal(indexToSquare(36), 'e4');
});

test('every square survives a name → index → name round trip', () => {
  for (let i = 0; i < 64; i++) {
    assert.equal(squareToIndex(indexToSquare(i)), i, `index ${i}`);
  }
});

test('file and rank read off an index correctly', () => {
  assert.equal(fileOf(squareToIndex('a1')), 0);
  assert.equal(fileOf(squareToIndex('h8')), 7);
  assert.equal(fileOf(squareToIndex('e4')), 4);

  assert.equal(rankOf(squareToIndex('a1')), 0);   // rank 1
  assert.equal(rankOf(squareToIndex('a8')), 7);   // rank 8
  assert.equal(rankOf(squareToIndex('e4')), 3);   // rank 4
  assert.equal(rankOf(squareToIndex('e2')), 1);   // rank 2
});

test('isSquare accepts the 64 real squares and nothing else', () => {
  assert.equal(isSquare(0), true);
  assert.equal(isSquare(63), true);
  assert.equal(isSquare(-1), false);
  assert.equal(isSquare(64), false);
  assert.equal(isSquare(1.5), false);
  assert.equal(isSquare('a1'), false);
});

test('malformed square names are refused', () => {
  for (const bad of ['', 'a', 'a9', 'i4', 'a0', '44', 'e44', null, 12]) {
    assert.throws(() => squareToIndex(bad), `should refuse ${JSON.stringify(bad)}`);
  }
  for (const bad of [-1, 64, 1.5]) {
    assert.throws(() => indexToSquare(bad), `should refuse ${bad}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────────

test('there are exactly twelve shared piece objects', () => {
  assert.equal(Object.keys(PIECES).length, 12);
  // Same piece asked for twice is the identical object, not a copy.
  assert.equal(piece(PAWN, WHITE), piece(PAWN, WHITE));
  assert.equal(piece(PAWN, WHITE), PIECES.wp);
  assert.notEqual(piece(PAWN, WHITE), piece(PAWN, BLACK));
});

test('pieces are frozen, so a shared piece cannot be edited by accident', () => {
  assert.equal(Object.isFrozen(PIECES.wq), true);
  assert.throws(() => { 'use strict'; PIECES.wq.type = KING; });
});

test('FEN letters map both ways for all twelve pieces', () => {
  for (const type of [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING]) {
    for (const color of [WHITE, BLACK]) {
      const p = piece(type, color);
      const char = pieceToFenChar(p);
      assert.equal(char, color === WHITE ? type.toUpperCase() : type);
      assert.equal(fenCharToPiece(char), p);
    }
  }
  assert.equal(fenCharToPiece('x'), null);
  assert.equal(fenCharToPiece('1'), null);
});

test('opposite flips the colour', () => {
  assert.equal(opposite(WHITE), BLACK);
  assert.equal(opposite(BLACK), WHITE);
});

// ─────────────────────────────────────────────────────────────────────────────
// The starting position
// ─────────────────────────────────────────────────────────────────────────────

test('the starting position writes the standard FEN', () => {
  assert.equal(toFEN(initialPosition()), START_FEN);
  assert.equal(
    toFEN(initialPosition()),
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  );
});

test('the starting position has the right pieces on the right squares', () => {
  const pos = initialPosition();

  assert.equal(pos.board[squareToIndex('e1')], PIECES.wk);
  assert.equal(pos.board[squareToIndex('d1')], PIECES.wq);
  assert.equal(pos.board[squareToIndex('a1')], PIECES.wr);
  assert.equal(pos.board[squareToIndex('h1')], PIECES.wr);
  assert.equal(pos.board[squareToIndex('b1')], PIECES.wn);
  assert.equal(pos.board[squareToIndex('c1')], PIECES.wb);
  assert.equal(pos.board[squareToIndex('e2')], PIECES.wp);

  assert.equal(pos.board[squareToIndex('e8')], PIECES.bk);
  assert.equal(pos.board[squareToIndex('d8')], PIECES.bq);
  assert.equal(pos.board[squareToIndex('e7')], PIECES.bp);

  // The four middle ranks are empty.
  for (const rank of ['3', '4', '5', '6']) {
    for (const file of 'abcdefgh') {
      assert.equal(pos.board[squareToIndex(file + rank)], null, `${file}${rank}`);
    }
  }

  // 32 pieces, 16 a side.
  const occupied = pos.board.filter((sq) => sq !== null);
  assert.equal(occupied.length, 32);
  assert.equal(occupied.filter((p) => p.color === WHITE).length, 16);
  assert.equal(occupied.filter((p) => p.color === BLACK).length, 16);

  assert.equal(pos.turn, WHITE);
  assert.deepEqual(pos.castling, { wK: true, wQ: true, bK: true, bQ: true });
  assert.equal(pos.epTarget, null);
  assert.equal(pos.halfmove, 0);
  assert.equal(pos.fullmove, 1);
});

test('an empty position is empty and has no castling rights', () => {
  const pos = emptyPosition();
  assert.equal(pos.board.length, 64);
  assert.equal(pos.board.every((sq) => sq === null), true);
  assert.deepEqual(pos.castling, { wK: false, wQ: false, bK: false, bQ: false });
  assert.equal(toFEN(pos), '8/8/8/8/8/8/8/8 w - - 0 1');
});

test('findKing locates each king, and reports -1 when there is none', () => {
  const pos = initialPosition();
  assert.equal(findKing(pos, WHITE), squareToIndex('e1'));
  assert.equal(findKing(pos, BLACK), squareToIndex('e8'));
  assert.equal(findKing(emptyPosition(), WHITE), -1);
});

// ─────────────────────────────────────────────────────────────────────────────
// FEN round trips — the definition of done
// ─────────────────────────────────────────────────────────────────────────────

// Hand-written positions, chosen so that between them they exercise every field
// of the FEN format: all four castling rights, both en-passant ranks, an empty
// board, a crowded one, and move counters well above their defaults.
const HAND_WRITTEN = [
  ['the starting position',
    START_FEN],
  ['Kiwipete — castling both sides, many captures',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'],
  ['perft position 3 — en passant and promotion edges',
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'],
  ['perft position 4 — promotion under check',
    'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'],
  ['perft position 5 — castling rights lost by rook capture',
    'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8'],
  ['an en-passant target on rank 6, Black having just played c5',
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2'],
  ['an en-passant target on rank 3, White having just played e4',
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'],
  ['two bare kings, no rights',
    '8/8/8/4k3/8/8/4K3/8 w - - 0 1'],
  ['only White may castle kingside, counters well past their defaults',
    'r3k2r/8/8/8/8/8/8/R3K2R w K - 12 34'],
  ['only Black may castle queenside, Black to move',
    'r3k2r/8/8/8/8/8/8/R3K2R b q - 3 99'],
  ['a nearly empty board at move 250',
    '8/8/8/8/8/8/8/K6k w - - 99 250'],
  ['pawns one square from promoting, both colours',
    '8/P6k/8/8/8/8/6Kp/8 w - - 0 1'],
  ['an ordinary opening middlegame',
    'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'],
  ['a crowded board with no empty-square runs at all',
    'rnbqkbnr/pppppppp/pppppppp/pppppppp/PPPPPPPP/PPPPPPPP/PPPPPPPP/RNBQKBNR w - - 0 1'],
];

test('every hand-written position survives text → position → text unchanged', () => {
  for (const [label, fen] of HAND_WRITTEN) {
    assert.equal(toFEN(fromFEN(fen)), fen, label);
  }
});

test('every hand-written position survives position → text → position unchanged', () => {
  for (const [label, fen] of HAND_WRITTEN) {
    const once = fromFEN(fen);
    const twice = fromFEN(toFEN(once));
    assert.deepEqual(twice, once, label);
  }
});

test('all sixteen combinations of castling rights round-trip', () => {
  // The rook-and-king skeleton below is the only layout where all four rights
  // can legitimately be set, so it is the right board to test them on.
  const rows = 'r3k2r/8/8/8/8/8/8/R3K2R';
  for (let bits = 0; bits < 16; bits++) {
    const rights =
      (bits & 1 ? 'K' : '') +
      (bits & 2 ? 'Q' : '') +
      (bits & 4 ? 'k' : '') +
      (bits & 8 ? 'q' : '');
    const fen = `${rows} w ${rights === '' ? '-' : rights} - 0 1`;

    const pos = fromFEN(fen);
    assert.equal(pos.castling.wK, Boolean(bits & 1), fen);
    assert.equal(pos.castling.wQ, Boolean(bits & 2), fen);
    assert.equal(pos.castling.bK, Boolean(bits & 4), fen);
    assert.equal(pos.castling.bQ, Boolean(bits & 8), fen);
    assert.equal(toFEN(pos), fen, fen);
  }
});

test('all sixteen possible en-passant squares round-trip', () => {
  for (const file of 'abcdefgh') {
    for (const [rank, turn] of [['3', 'b'], ['6', 'w']]) {
      const square = file + rank;
      const fen = `8/8/8/8/8/8/8/K6k ${turn} - ${square} 0 1`;
      const pos = fromFEN(fen);
      assert.equal(pos.epTarget, squareToIndex(square), fen);
      assert.equal(toFEN(pos), fen, fen);
    }
  }
});

test('the side to move round-trips both ways', () => {
  assert.equal(fromFEN('8/8/8/8/8/8/8/K6k w - - 0 1').turn, WHITE);
  assert.equal(fromFEN('8/8/8/8/8/8/8/K6k b - - 0 1').turn, BLACK);
});

test('the two move counters are optional and default sensibly', () => {
  const pos = fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  assert.equal(pos.halfmove, 0);
  assert.equal(pos.fullmove, 1);
  assert.equal(toFEN(pos), START_FEN);
});

test('surrounding whitespace is tolerated', () => {
  assert.equal(toFEN(fromFEN(`   ${START_FEN}   `)), START_FEN);
  assert.equal(toFEN(fromFEN(START_FEN.replace(/ /g, '  '))), START_FEN);
});

// ─────────────────────────────────────────────────────────────────────────────
// FEN is strict — it will read text from a database and from the network
// ─────────────────────────────────────────────────────────────────────────────

test('malformed FEN throws rather than producing a wrong board', () => {
  const bad = [
    ['not a string', 42],
    ['empty', ''],
    ['too few fields', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'],
    ['seven ranks', 'rnbqkbnr/pppppppp/8/8/8/8/RNBQKBNR w KQkq - 0 1'],
    ['nine ranks', 'rnbqkbnr/pppppppp/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['a rank that is too short', 'rnbqkbn/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['a rank that is too long', 'rnbqkbnrr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['an unknown piece letter', 'xnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['a side to move that is neither w nor b', `${'8/8/8/8/8/8/8/K6k'} x - - 0 1`],
    ['castling rights in the wrong order', '8/8/8/8/8/8/8/K6k w qKQk - 0 1'],
    ['castling rights with a bogus letter', '8/8/8/8/8/8/8/K6k w KQX - 0 1'],
    ['an en-passant square on an impossible rank', '8/8/8/8/8/8/8/K6k w - e4 0 1'],
    ['an en-passant square that is not a square', '8/8/8/8/8/8/8/K6k w - zz 0 1'],
    ['a halfmove clock that is not a number', '8/8/8/8/8/8/8/K6k w - - x 1'],
    ['a negative halfmove clock', '8/8/8/8/8/8/8/K6k w - - -1 1'],
    ['a move number of zero', '8/8/8/8/8/8/8/K6k w - - 0 0'],
  ];
  for (const [label, fen] of bad) {
    assert.throws(() => fromFEN(fen), `should refuse: ${label}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Positions are copied, never shared
// ─────────────────────────────────────────────────────────────────────────────

test('clonePosition makes a copy that can be edited safely', () => {
  const original = initialPosition();
  const copy = clonePosition(original);

  assert.deepEqual(copy, original);
  assert.notEqual(copy.board, original.board);
  assert.notEqual(copy.castling, original.castling);

  copy.board[squareToIndex('e2')] = null;
  copy.castling.wK = false;
  copy.turn = BLACK;
  copy.epTarget = squareToIndex('e3');

  assert.equal(original.board[squareToIndex('e2')], PIECES.wp);
  assert.equal(original.castling.wK, true);
  assert.equal(original.turn, WHITE);
  assert.equal(original.epTarget, null);
  assert.equal(toFEN(original), START_FEN);
});

// ─────────────────────────────────────────────────────────────────────────────
// Move notation
// ─────────────────────────────────────────────────────────────────────────────

test('moves are written in UCI notation', () => {
  const quiet = createMove({
    from: squareToIndex('e2'), to: squareToIndex('e4'), piece: PIECES.wp, flag: 'double',
  });
  assert.equal(moveToUci(quiet), 'e2e4');

  const castle = createMove({
    from: squareToIndex('e1'), to: squareToIndex('g1'), piece: PIECES.wk, flag: 'castleK',
  });
  assert.equal(moveToUci(castle), 'e1g1');

  for (const type of PROMOTION_TYPES) {
    const promo = createMove({
      from: squareToIndex('e7'), to: squareToIndex('e8'), piece: PIECES.wp, promotion: type,
    });
    assert.equal(moveToUci(promo), `e7e8${type}`);
  }
});

test('createMove fills in the parts that are usually absent', () => {
  const m = createMove({ from: 0, to: 1, piece: PIECES.wr });
  assert.deepEqual(m, { from: 0, to: 1, piece: PIECES.wr, captured: null, promotion: null, flag: null });
});

test('promotion is only ever to a queen, rook, bishop or knight', () => {
  assert.deepEqual([...PROMOTION_TYPES], [QUEEN, ROOK, BISHOP, KNIGHT]);
  assert.equal(PROMOTION_TYPES.includes(KING), false);
  assert.equal(PROMOTION_TYPES.includes(PAWN), false);
});

test('UCI text is parsed into squares', () => {
  assert.deepEqual(parseUci('e2e4'), {
    from: squareToIndex('e2'), to: squareToIndex('e4'), promotion: null,
  });
  assert.deepEqual(parseUci('e7e8q'), {
    from: squareToIndex('e7'), to: squareToIndex('e8'), promotion: QUEEN,
  });
  assert.deepEqual(parseUci('a1h8'), {
    from: squareToIndex('a1'), to: squareToIndex('h8'), promotion: null,
  });
});

test('malformed UCI returns null instead of throwing, because it arrives over a network', () => {
  for (const bad of ['', 'e2', 'e2e', 'e2e9', 'i2e4', 'e2e4x', 'e7e8k', 'e7e8p', 'E2E4', 'e2 e4', null, 42, {}]) {
    assert.equal(parseUci(bad), null, `should refuse ${JSON.stringify(bad)}`);
  }
});
