/**
 * rules.js — the chess rules for Pawsitions.
 *
 * This is the only file in the project that knows how chess works. Every mode
 * imports it, and so does the Worker that referees online games. It has no
 * dependencies, imports nothing, touches no DOM, and contains no code from any
 * chess library.
 *
 * Board layout
 * ------------
 * The board is one flat array of 64 entries. Index 0 is a8 (top-left as White
 * sees it) and index 63 is h1 (bottom-right).
 *
 *        a   b   c   d   e   f   g   h
 *      ┌───┬───┬───┬───┬───┬───┬───┬───┐
 *    8 │ 0 │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │
 *    7 │ 8 │ 9 │10 │11 │12 │13 │14 │15 │
 *    6 │16 │17 │18 │19 │20 │21 │22 │23 │
 *    5 │24 │25 │26 │27 │28 │29 │30 │31 │
 *    4 │32 │33 │34 │35 │36 │37 │38 │39 │
 *    3 │40 │41 │42 │43 │44 │45 │46 │47 │
 *    2 │48 │49 │50 │51 │52 │53 │54 │55 │
 *    1 │56 │57 │58 │59 │60 │61 │62 │63 │
 *      └───┴───┴───┴───┴───┴───┴───┴───┘
 *
 * A flat array was chosen over a grid of rows because every later part of the
 * project — move generation, the computer's search, the network format — reads
 * and writes single squares far more often than whole rows.
 *
 * Positions are treated as immutable. Nothing edits a position in place;
 * functions that change the board return a brand-new one. That is what makes
 * undo and the computer's look-ahead search safe without any bookkeeping.
 *
 * Built in task 1.1 of FEATUREROADMAP_workplan.md: squares, pieces, positions,
 * FEN and move notation. Move generation arrives in 1.2.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Colours and piece types
// ─────────────────────────────────────────────────────────────────────────────

export const WHITE = 'w';
export const BLACK = 'b';

/** The six piece types, as single letters. */
export const PAWN = 'p';
export const KNIGHT = 'n';
export const BISHOP = 'b';
export const ROOK = 'r';
export const QUEEN = 'q';
export const KING = 'k';

export const PIECE_TYPES = Object.freeze([PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING]);

/** The opposite colour. */
export function opposite(color) {
  return color === WHITE ? BLACK : WHITE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────────

// A piece is a plain frozen object, and there are only twelve of them in
// existence. Every white pawn on every board is the *same* object. Pieces never
// change, so sharing them is safe, and it means copying a board copies 64
// references rather than allocating 64 new objects — which matters a great deal
// once the computer starts searching thousands of positions per move.

function definePiece(type, color) {
  return Object.freeze({ type, color });
}

export const PIECES = Object.freeze({
  wp: definePiece(PAWN, WHITE),
  wn: definePiece(KNIGHT, WHITE),
  wb: definePiece(BISHOP, WHITE),
  wr: definePiece(ROOK, WHITE),
  wq: definePiece(QUEEN, WHITE),
  wk: definePiece(KING, WHITE),
  bp: definePiece(PAWN, BLACK),
  bn: definePiece(KNIGHT, BLACK),
  bb: definePiece(BISHOP, BLACK),
  br: definePiece(ROOK, BLACK),
  bq: definePiece(QUEEN, BLACK),
  bk: definePiece(KING, BLACK),
});

/** The shared piece object for a type and colour. */
export function piece(type, color) {
  const found = PIECES[color + type];
  if (!found) throw new Error(`No such piece: ${color}${type}`);
  return found;
}

// In FEN, White's pieces are uppercase and Black's are lowercase.
const PIECE_BY_FEN_CHAR = Object.freeze({
  P: PIECES.wp, N: PIECES.wn, B: PIECES.wb, R: PIECES.wr, Q: PIECES.wq, K: PIECES.wk,
  p: PIECES.bp, n: PIECES.bn, b: PIECES.bb, r: PIECES.br, q: PIECES.bq, k: PIECES.bk,
});

/** The FEN letter for a piece: white pawn → "P", black knight → "n". */
export function pieceToFenChar(p) {
  return p.color === WHITE ? p.type.toUpperCase() : p.type;
}

/** The piece a FEN letter stands for, or null if the letter is not a piece. */
export function fenCharToPiece(char) {
  return PIECE_BY_FEN_CHAR[char] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Squares
// ─────────────────────────────────────────────────────────────────────────────

export const FILE_LETTERS = 'abcdefgh';

/** Index → name. 0 → "a8", 36 → "e4", 63 → "h1". */
export function indexToSquare(index) {
  if (!Number.isInteger(index) || index < 0 || index > 63) {
    throw new Error(`Square index out of range: ${index}`);
  }
  return FILE_LETTERS[index % 8] + String(8 - (index >> 3));
}

/** Name → index. "a8" → 0, "e4" → 36, "h1" → 63. */
export function squareToIndex(name) {
  if (typeof name !== 'string' || name.length !== 2) {
    throw new Error(`Not a square name: ${name}`);
  }
  const file = FILE_LETTERS.indexOf(name[0]);
  const rank = Number(name[1]);
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > 8) {
    throw new Error(`Not a square name: ${name}`);
  }
  return (8 - rank) * 8 + file;
}

/** File as 0–7, where 0 is the a-file. */
export function fileOf(index) {
  return index % 8;
}

/** Rank as 0–7, where 0 is rank 1 — White's home rank. */
export function rankOf(index) {
  return 7 - (index >> 3);
}

/**
 * Is this index a real square?
 *
 * Move generation (task 1.2) will also need to know whether a step off one edge
 * has wrapped around to the other — landing on a real index but the wrong square
 * entirely. That check belongs with the move generator, not here.
 */
export function isSquare(index) {
  return Number.isInteger(index) && index >= 0 && index <= 63;
}

// ─────────────────────────────────────────────────────────────────────────────
// Positions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A position is everything you need to know to carry on playing:
 *
 *   board     64 entries, each null or a piece
 *   turn      'w' or 'b'
 *   castling  which of the four castling rights survive
 *   epTarget  the square an en-passant capture may land ON, or null
 *   halfmove  moves since the last capture or pawn move
 *   fullmove  the move number, counting up after each of Black's turns
 *
 * `halfmove` is kept so that FEN text survives a round trip unchanged. No draw
 * rule reads it — the fifty-move rule is out of scope.
 */

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const BACK_RANK = Object.freeze([ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK]);

/** A board with nothing on it and nobody able to castle. */
export function emptyPosition() {
  return {
    board: new Array(64).fill(null),
    turn: WHITE,
    castling: { wK: false, wQ: false, bK: false, bQ: false },
    epTarget: null,
    halfmove: 0,
    fullmove: 1,
  };
}

/**
 * The standard starting position.
 *
 * Built square by square rather than by parsing START_FEN, so that comparing
 * `toFEN(initialPosition())` against START_FEN is a real test of both the
 * layout and the FEN writer instead of a circular one.
 */
export function initialPosition() {
  const board = new Array(64).fill(null);
  for (let file = 0; file < 8; file++) {
    board[file] = piece(BACK_RANK[file], BLACK);       // rank 8
    board[8 + file] = piece(PAWN, BLACK);              // rank 7
    board[48 + file] = piece(PAWN, WHITE);             // rank 2
    board[56 + file] = piece(BACK_RANK[file], WHITE);  // rank 1
  }
  return {
    board,
    turn: WHITE,
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    epTarget: null,
    halfmove: 0,
    fullmove: 1,
  };
}

/**
 * A copy that can be edited without disturbing the original.
 *
 * The board array is copied but the pieces inside it are not, because pieces are
 * frozen and shared on purpose. `castling` is copied because it is the one part
 * of a position that is a mutable object.
 */
export function clonePosition(pos) {
  return {
    board: pos.board.slice(),
    turn: pos.turn,
    castling: { ...pos.castling },
    epTarget: pos.epTarget,
    halfmove: pos.halfmove,
    fullmove: pos.fullmove,
  };
}

/** The square the given side's king stands on, or -1 if it is not on the board. */
export function findKing(pos, color) {
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (p !== null && p.type === KING && p.color === color) return i;
  }
  return -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// FEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FEN — Forsyth–Edwards Notation — writes a whole position as one line of text.
 * We use it to save online games into the room's database, to send positions
 * over the network, and to write test positions by hand.
 *
 * Its six fields, using the starting position as the example:
 *
 *   rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
 *   └──────────── the pieces ────────────┘ │ │    │ │ │
 *                          side to move ───┘ │    │ │ │
 *                      castling rights ──────┘    │ │ │
 *                 en-passant target square ───────┘ │ │
 *                          halfmove clock ──────────┘ │
 *                             move number ────────────┘
 *
 * The pieces are listed from rank 8 down to rank 1, each rank separated by "/",
 * with a digit standing for that many empty squares in a row.
 */

/** Position → FEN text. */
export function toFEN(pos) {
  let placement = '';
  for (let row = 0; row < 8; row++) {
    let emptyRun = 0;
    for (let file = 0; file < 8; file++) {
      const p = pos.board[row * 8 + file];
      if (p === null) {
        emptyRun++;
      } else {
        if (emptyRun > 0) {
          placement += emptyRun;
          emptyRun = 0;
        }
        placement += pieceToFenChar(p);
      }
    }
    if (emptyRun > 0) placement += emptyRun;
    if (row < 7) placement += '/';
  }

  const rights =
    (pos.castling.wK ? 'K' : '') +
    (pos.castling.wQ ? 'Q' : '') +
    (pos.castling.bK ? 'k' : '') +
    (pos.castling.bQ ? 'q' : '');

  const ep = pos.epTarget === null ? '-' : indexToSquare(pos.epTarget);

  return [
    placement,
    pos.turn,
    rights === '' ? '-' : rights,
    ep,
    pos.halfmove,
    pos.fullmove,
  ].join(' ');
}

/**
 * FEN text → position.
 *
 * Strict on purpose. This parser reads text that will arrive from a database and
 * across a network, so anything it cannot make sense of throws rather than
 * quietly producing a board that is subtly wrong.
 */
export function fromFEN(text) {
  if (typeof text !== 'string') throw new Error('FEN must be a string');

  const fields = text.trim().split(/\s+/);
  if (fields.length < 4) {
    throw new Error(`FEN needs at least 4 fields, got ${fields.length}: "${text}"`);
  }
  const [placement, turn, rights, ep] = fields;
  // The last two fields are optional in the wild; default them the usual way.
  const halfmove = fields.length > 4 ? Number(fields[4]) : 0;
  const fullmove = fields.length > 5 ? Number(fields[5]) : 1;

  const rows = placement.split('/');
  if (rows.length !== 8) {
    throw new Error(`FEN needs 8 ranks, got ${rows.length}: "${placement}"`);
  }

  const board = new Array(64).fill(null);
  for (let row = 0; row < 8; row++) {
    let file = 0;
    for (const char of rows[row]) {
      if (char >= '1' && char <= '8') {
        file += Number(char);
      } else {
        const p = fenCharToPiece(char);
        if (p === null) throw new Error(`Unknown piece letter in FEN: "${char}"`);
        if (file > 7) throw new Error(`Rank ${8 - row} has too many squares: "${rows[row]}"`);
        board[row * 8 + file] = p;
        file++;
      }
    }
    if (file !== 8) {
      throw new Error(`Rank ${8 - row} describes ${file} squares, not 8: "${rows[row]}"`);
    }
  }

  if (turn !== WHITE && turn !== BLACK) {
    throw new Error(`Side to move must be "w" or "b", got "${turn}"`);
  }

  if (!/^(-|K?Q?k?q?)$/.test(rights) || rights === '') {
    throw new Error(`Castling rights malformed: "${rights}"`);
  }

  if (ep !== '-' && !/^[a-h][36]$/.test(ep)) {
    // Only rank 3 and rank 6 can ever be en-passant targets: the square a pawn
    // skipped over on its two-square first move.
    throw new Error(`En-passant square malformed: "${ep}"`);
  }

  if (!Number.isInteger(halfmove) || halfmove < 0) {
    throw new Error(`Halfmove clock must be a whole number, got "${fields[4]}"`);
  }
  if (!Number.isInteger(fullmove) || fullmove < 1) {
    throw new Error(`Move number must be 1 or more, got "${fields[5]}"`);
  }

  return {
    board,
    turn,
    castling: {
      wK: rights.includes('K'),
      wQ: rights.includes('Q'),
      bK: rights.includes('k'),
      bQ: rights.includes('q'),
    },
    epTarget: ep === '-' ? null : squareToIndex(ep),
    halfmove,
    fullmove,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Moves
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A move object, as produced by move generation in task 1.2:
 *
 *   { from, to, piece, captured, promotion, flag }
 *
 *   from, to    square indices
 *   piece       the piece being moved
 *   captured    the piece taken, or null
 *   promotion   'q' | 'r' | 'b' | 'n' when a pawn promotes, otherwise null
 *   flag        null | 'double' | 'ep' | 'castleK' | 'castleQ'
 */

/** Build a move object, filling in the parts that are usually absent. */
export function createMove({ from, to, piece: moved, captured = null, promotion = null, flag = null }) {
  return { from, to, piece: moved, captured, promotion, flag };
}

/** Promotion is only ever to one of these four. Never a king, never a pawn. */
export const PROMOTION_TYPES = Object.freeze([QUEEN, ROOK, BISHOP, KNIGHT]);

/**
 * UCI notation is the wire format: the square a piece starts on, then the square
 * it lands on, then a letter if it promotes. "e2e4", "e1g1" for castling
 * kingside, "e7e8q" for a pawn promoting to a queen.
 *
 * It is used because it is short, unambiguous and needs no knowledge of the
 * position to write — unlike the "Nf3" style, which does.
 */
export function moveToUci(move) {
  return indexToSquare(move.from) + indexToSquare(move.to) + (move.promotion ?? '');
}

/**
 * Split UCI text into its parts, without checking whether the move is legal or
 * even possible — this only understands the notation.
 *
 * Returns null for anything malformed rather than throwing, because this is fed
 * directly by network messages and a bad one is an ordinary event, not a crash.
 *
 * The function that turns UCI into a real move is `uciToMove`, which arrives in
 * task 1.3 once there are legal moves to match against. It will resolve the text
 * against the actual position, which is what stops a dishonest client inventing
 * moves.
 */
export function parseUci(text) {
  if (typeof text !== 'string') return null;
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(text)) return null;
  return {
    from: squareToIndex(text.slice(0, 2)),
    to: squareToIndex(text.slice(2, 4)),
    promotion: text.length === 5 ? text[4] : null,
  };
}
