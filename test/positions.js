/**
 * Standard perft test positions.
 *
 * These are the positions the chess programming community has used for decades to
 * check a rules engine. Their move counts have been independently confirmed by
 * many separate implementations, so they are treated here as ground truth: if our
 * count disagrees, our rules are wrong.
 *
 * Each one is chosen to exercise something the starting position does not.
 */

export const PERFT_POSITIONS = Object.freeze([
  {
    name: 'starting position',
    why: 'the counts the brief requires',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    counts: [20, 400, 8902, 197281],
    deep: 4865609, // depth 5 — slow, so it runs only when asked for
  },
  {
    name: 'Kiwipete',
    why: 'castling both sides, pins, and a great many captures',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862, 4085603],
  },
  {
    name: 'position 3',
    why: 'en passant and promotion edge cases on a sparse board',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    counts: [14, 191, 2812, 43238],
  },
  {
    name: 'position 4',
    why: 'promotion while under check',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    counts: [6, 264, 9467, 422333],
  },
  {
    name: 'position 4 mirrored',
    why: 'the same position with the colours swapped — catches any rule that was written for White and not for Black',
    fen: 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1',
    counts: [6, 264, 9467, 422333],
  },
  {
    name: 'position 5',
    why: 'castling rights lost by a rook being captured on its home square',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    counts: [44, 1486, 62379, 2103487],
  },
  {
    name: 'position 6',
    why: 'a dense, ordinary middlegame',
    fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    counts: [46, 2079, 89890, 3894594],
  },
]);
