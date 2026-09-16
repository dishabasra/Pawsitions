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

// ─────────────────────────────────────────────────────────────────────────────
// Directions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Moves are described as a step in files and ranks — `[1, 2]` means "one file
 * right, two ranks up" — rather than as a number to add to the index.
 *
 * Adding a number is faster but wraps around the edges: stepping "one file
 * right" from h4 lands on a5, which looks like a perfectly ordinary square. That
 * bug is the classic way a chess engine ends up with a knight teleporting across
 * the board, and it is invisible until a perft count comes out wrong. Working in
 * files and ranks makes it impossible.
 */

const KNIGHT_STEPS = Object.freeze([
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
]);

const DIAGONAL_STEPS = Object.freeze([[1, 1], [1, -1], [-1, -1], [-1, 1]]);
const STRAIGHT_STEPS = Object.freeze([[0, 1], [1, 0], [0, -1], [-1, 0]]);
const ALL_STEPS = Object.freeze([...STRAIGHT_STEPS, ...DIAGONAL_STEPS]);

/**
 * The square reached by stepping from `index`, or -1 if that walks off the board.
 */
function step(index, deltaFile, deltaRank) {
  const file = (index % 8) + deltaFile;
  const rank = (7 - (index >> 3)) + deltaRank;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return (7 - rank) * 8 + file;
}

/** Which direction this colour's pawns travel: White up the board, Black down. */
function pawnDirection(color) {
  return color === WHITE ? 1 : -1;
}

/** The rank a colour's pawns start on, as 0–7 from White's side. */
function pawnHomeRank(color) {
  return color === WHITE ? 1 : 6;
}

/** The rank a colour's pawns promote on. */
function promotionRank(color) {
  return color === WHITE ? 7 : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Attacks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Is `square` attacked by any piece of colour `byColor`?
 *
 * Rather than generating every move that side could make and seeing whether any
 * lands here — which would be circular, since move generation needs this
 * function — we stand on the square and look outwards. If we look along a
 * diagonal and the first piece we meet is an enemy bishop or queen, the square is
 * attacked. And so on for each way a piece can move.
 *
 * "Attacked" is about capture, not legality: a pinned enemy knight still attacks
 * the squares it covers, because it could still take a king standing there.
 */
export function isSquareAttacked(pos, square, byColor) {
  const board = pos.board;

  // Knights.
  for (const [df, dr] of KNIGHT_STEPS) {
    const at = step(square, df, dr);
    if (at === -1) continue;
    const p = board[at];
    if (p !== null && p.color === byColor && p.type === KNIGHT) return true;
  }

  // The enemy king, one square in any direction.
  for (const [df, dr] of ALL_STEPS) {
    const at = step(square, df, dr);
    if (at === -1) continue;
    const p = board[at];
    if (p !== null && p.color === byColor && p.type === KING) return true;
  }

  // Sliding pieces: walk outwards until we hit something.
  for (const [df, dr] of STRAIGHT_STEPS) {
    for (let at = step(square, df, dr); at !== -1; at = step(at, df, dr)) {
      const p = board[at];
      if (p === null) continue;
      if (p.color === byColor && (p.type === ROOK || p.type === QUEEN)) return true;
      break; // any other piece blocks the line
    }
  }
  for (const [df, dr] of DIAGONAL_STEPS) {
    for (let at = step(square, df, dr); at !== -1; at = step(at, df, dr)) {
      const p = board[at];
      if (p === null) continue;
      if (p.color === byColor && (p.type === BISHOP || p.type === QUEEN)) return true;
      break;
    }
  }

  // Pawns. A white pawn attacks diagonally upwards, so a white pawn attacking
  // this square must be sitting one rank *below* it.
  const back = -pawnDirection(byColor);
  for (const df of [-1, 1]) {
    const at = step(square, df, back);
    if (at === -1) continue;
    const p = board[at];
    if (p !== null && p.color === byColor && p.type === PAWN) return true;
  }

  return false;
}

/** Is this side's king currently attacked? */
export function isInCheck(pos, color) {
  const king = findKing(pos, color);
  if (king === -1) return false; // test positions may have no king
  return isSquareAttacked(pos, king, opposite(color));
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate moves
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every move the piece on `from` could make if we ignored, for a moment, whether
 * it leaves its own king in check.
 *
 * These are usually called "pseudo-legal" moves. They are never handed to the
 * rest of the project — `legalMoves` filters them first. Nothing outside this
 * file should call this function.
 */
function candidateMovesFrom(pos, from, { includeCastling = true } = {}) {
  const moving = pos.board[from];
  if (moving === null) return [];

  const moves = [];
  const us = moving.color;
  const them = opposite(us);
  const board = pos.board;

  /** Add a move to an empty square or an enemy piece; refuse our own pieces. */
  const tryStep = (to) => {
    if (to === -1) return false;
    const target = board[to];
    if (target === null) {
      moves.push(createMove({ from, to, piece: moving }));
      return true; // the line may continue
    }
    if (target.color === them) {
      moves.push(createMove({ from, to, piece: moving, captured: target }));
    }
    return false; // occupied either way, so a sliding line stops here
  };

  const slide = (steps) => {
    for (const [df, dr] of steps) {
      for (let to = step(from, df, dr); to !== -1; to = step(to, df, dr)) {
        if (!tryStep(to)) break;
      }
    }
  };

  switch (moving.type) {
    case PAWN: {
      const dir = pawnDirection(us);
      const promotes = rankOf(from) + dir === promotionRank(us);

      /** A pawn move either promotes — four ways — or it does not. */
      const addPawnMove = (to, captured, flag = null) => {
        if (promotes) {
          for (const promotion of PROMOTION_TYPES) {
            moves.push(createMove({ from, to, piece: moving, captured, promotion, flag }));
          }
        } else {
          moves.push(createMove({ from, to, piece: moving, captured, flag }));
        }
      };

      // Straight ahead, one square, only onto an empty square.
      const ahead = step(from, 0, dir);
      if (ahead !== -1 && board[ahead] === null) {
        addPawnMove(ahead, null);

        // And two squares, from the home rank, if both are empty.
        if (rankOf(from) === pawnHomeRank(us)) {
          const twoAhead = step(from, 0, dir * 2);
          if (twoAhead !== -1 && board[twoAhead] === null) {
            moves.push(createMove({ from, to: twoAhead, piece: moving, flag: 'double' }));
          }
        }
      }

      // Diagonal captures, including en passant.
      for (const df of [-1, 1]) {
        const to = step(from, df, dir);
        if (to === -1) continue;
        const target = board[to];
        if (target !== null) {
          if (target.color === them) addPawnMove(to, target);
        } else if (to === pos.epTarget) {
          // En passant: the pawn we take is not on the square we land on. It is
          // alongside us, on the square the enemy pawn skipped through.
          const capturedSquare = step(to, 0, -dir);
          const capturedPawn = capturedSquare === -1 ? null : board[capturedSquare];
          if (capturedPawn !== null && capturedPawn.color === them && capturedPawn.type === PAWN) {
            moves.push(createMove({ from, to, piece: moving, captured: capturedPawn, flag: 'ep' }));
          }
        }
      }
      break;
    }

    case KNIGHT:
      for (const [df, dr] of KNIGHT_STEPS) tryStep(step(from, df, dr));
      break;

    case BISHOP:
      slide(DIAGONAL_STEPS);
      break;

    case ROOK:
      slide(STRAIGHT_STEPS);
      break;

    case QUEEN:
      slide(ALL_STEPS);
      break;

    case KING:
      for (const [df, dr] of ALL_STEPS) tryStep(step(from, df, dr));
      if (includeCastling) addCastlingMoves(pos, from, moving, moves);
      break;

    default:
      throw new Error(`Unknown piece type: ${moving.type}`);
  }

  return moves;
}

/**
 * Castling — the only move where two pieces move at once.
 *
 * It is legal only when all of this holds:
 *   · the right has not been lost (king moved, that rook moved, or that rook was
 *     captured on its home square),
 *   · every square between king and rook is empty,
 *   · the king is not currently in check,
 *   · the king does not pass through an attacked square,
 *   · the king does not land on an attacked square.
 *
 * Note what is *not* required: the rook may pass through an attacked square, and
 * on the queenside the b-file square may be attacked. Only the king's journey
 * matters.
 */
function addCastlingMoves(pos, from, king, moves) {
  const us = king.color;
  const them = opposite(us);
  const board = pos.board;

  // Both sides are described the same way, so the two colours share one table.
  const options = us === WHITE
    ? [
        { right: 'wK', flag: 'castleK', kingHome: 60, kingTo: 62, rookHome: 63, empty: [61, 62], safe: [60, 61, 62] },
        { right: 'wQ', flag: 'castleQ', kingHome: 60, kingTo: 58, rookHome: 56, empty: [57, 58, 59], safe: [60, 59, 58] },
      ]
    : [
        { right: 'bK', flag: 'castleK', kingHome: 4, kingTo: 6, rookHome: 7, empty: [5, 6], safe: [4, 5, 6] },
        { right: 'bQ', flag: 'castleQ', kingHome: 4, kingTo: 2, rookHome: 0, empty: [1, 2, 3], safe: [4, 3, 2] },
      ];

  for (const option of options) {
    if (!pos.castling[option.right]) continue;

    // A hand-written position may claim a right whose pieces are not actually
    // there, so never trust the right alone.
    if (from !== option.kingHome) continue;
    const rook = board[option.rookHome];
    if (rook === null || rook.type !== ROOK || rook.color !== us) continue;

    if (option.empty.some((sq) => board[sq] !== null)) continue;
    if (option.safe.some((sq) => isSquareAttacked(pos, sq, them))) continue;

    moves.push(createMove({ from, to: option.kingTo, piece: king, flag: option.flag }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Playing a move
// ─────────────────────────────────────────────────────────────────────────────

// Which castling right each corner square carries. Used both when a rook moves
// off one of these squares and when a rook is captured on one — the second case
// being the clause most implementations forget, and one that perft catches
// immediately.
const CASTLING_SQUARES = Object.freeze({
  63: 'wK', // h1
  56: 'wQ', // a1
  60: ['wK', 'wQ'], // e1 — the king itself
  7: 'bK',  // h8
  0: 'bQ',  // a8
  4: ['bK', 'bQ'], // e8
});

/**
 * Play a move and return the resulting position. The position passed in is not
 * touched.
 */
export function makeMove(pos, move) {
  const next = clonePosition(pos);
  const moving = move.piece;
  const us = moving.color;

  next.board[move.from] = null;
  next.board[move.to] = move.promotion === null
    ? moving
    : piece(move.promotion, us);

  // En passant takes a pawn that is not on the landing square.
  if (move.flag === 'ep') {
    const capturedSquare = step(move.to, 0, -pawnDirection(us));
    next.board[capturedSquare] = null;
  }

  // Castling moves the rook as well.
  if (move.flag === 'castleK' || move.flag === 'castleQ') {
    const rank = us === WHITE ? 56 : 0;
    const [rookFrom, rookTo] = move.flag === 'castleK'
      ? [rank + 7, rank + 5]   // h-file to f-file
      : [rank + 0, rank + 3];  // a-file to d-file
    next.board[rookTo] = next.board[rookFrom];
    next.board[rookFrom] = null;
  }

  // Castling rights are lost by the king moving, by a rook leaving its corner,
  // and by a rook being captured in its corner.
  for (const square of [move.from, move.to]) {
    const affected = CASTLING_SQUARES[square];
    if (affected === undefined) continue;
    for (const right of Array.isArray(affected) ? affected : [affected]) {
      next.castling[right] = false;
    }
  }

  // A two-square pawn move leaves an en-passant target behind it, for one move
  // only. Every other move clears it.
  next.epTarget = move.flag === 'double'
    ? step(move.from, 0, pawnDirection(us))
    : null;

  // The halfmove clock counts moves since the last capture or pawn move. Kept so
  // FEN survives a round trip; no draw rule reads it.
  next.halfmove = (moving.type === PAWN || move.captured !== null)
    ? 0
    : pos.halfmove + 1;

  if (us === BLACK) next.fullmove = pos.fullmove + 1;
  next.turn = opposite(us);

  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legal moves — the single source of truth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every legal move for the side to move.
 *
 * This is the function the entire project is built on. The board draws its move
 * dots from it, the computer searches only what it returns, and the online
 * server refuses anything absent from it. Because it is the only thing that
 * decides what is allowed, there is no second opinion anywhere that could drift
 * out of step — and an illegal move has nowhere to come from.
 *
 * The filter at the end is what makes these *legal* rather than merely possible:
 * play each candidate out and throw away any that leaves your own king attacked.
 * That single rule covers pins, blocking a check, moving out of check, and the
 * rarest case of all — an en-passant capture that removes two pawns from a rank
 * at once and exposes your king to a rook sitting at the end of it.
 */
export function legalMoves(pos) {
  const moves = [];
  for (let from = 0; from < 64; from++) {
    const p = pos.board[from];
    if (p === null || p.color !== pos.turn) continue;
    for (const move of candidateMovesFrom(pos, from)) {
      if (!isInCheck(makeMove(pos, move), pos.turn)) moves.push(move);
    }
  }
  return moves;
}

/**
 * The legal moves starting on one square — what the board draws dots from when a
 * player picks a piece up.
 */
export function movesFrom(pos, square) {
  const p = pos.board[square];
  if (p === null || p.color !== pos.turn) return [];
  return candidateMovesFrom(pos, square)
    .filter((move) => !isInCheck(makeMove(pos, move), pos.turn));
}

/**
 * Where the game stands.
 *
 *   playing     ordinary position
 *   check       the side to move is in check but has a way out
 *   checkmate   in check with no legal move — the game is over
 *   stalemate   not in check, but no legal move — a draw
 *
 * Draw by repetition and the fifty-move rule are out of scope, as agreed.
 */
export function gameStatus(pos) {
  const hasMove = legalMoves(pos).length > 0;
  const inCheck = isInCheck(pos, pos.turn);
  if (hasMove) return inCheck ? 'check' : 'playing';
  return inCheck ? 'checkmate' : 'stalemate';
}

/** Is the game over? */
export function isGameOver(pos) {
  const status = gameStatus(pos);
  return status === 'checkmate' || status === 'stalemate';
}

/**
 * Turn UCI text into a real move — or null.
 *
 * This deliberately resolves the text *against the current position* rather than
 * trusting it. A client that sends a move for the wrong side, a move that does
 * not exist, or a promotion to a king finds no match in the legal-move list and
 * is refused. It is the only way move text enters the game from outside, which
 * is what makes the online server a referee rather than a relay.
 */
export function uciToMove(pos, text) {
  const parsed = parseUci(text);
  if (parsed === null) return null;
  for (const move of legalMoves(pos)) {
    if (
      move.from === parsed.from &&
      move.to === parsed.to &&
      (move.promotion ?? null) === parsed.promotion
    ) {
      return move;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Perft — the proof
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count every distinct sequence of legal moves of the given length.
 *
 * This is how a chess rules engine is proved correct. The numbers for well-known
 * positions have been published and independently confirmed for decades, so if
 * ours match, every rule above is right — and if a single rule is wrong anywhere,
 * some count comes out wrong. It is far more searching than any hand-written test
 * could be: depth 3 from the starting position checks 8,902 sequences.
 */
export function perft(pos, depth) {
  if (depth <= 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;

  let total = 0;
  for (const move of moves) {
    total += perft(makeMove(pos, move), depth - 1);
  }
  return total;
}

/**
 * Perft split by first move — "divide" in chess-engine jargon.
 *
 * When a perft count is wrong, this is how you find out where: run it against a
 * known-good engine and the move whose subtotal differs is the one whose rules
 * are broken. Kept because it is the debugging tool for every future rules bug.
 */
export function perftDivide(pos, depth) {
  const result = {};
  for (const move of legalMoves(pos)) {
    result[moveToUci(move)] = perft(makeMove(pos, move), depth - 1);
  }
  return result;
}
