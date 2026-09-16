# Pawsitions — Product Specification

Author: **Disha Basra**
Status: agreed, pre-build
Companion documents: [README.md](README.md) · [FEATUREROADMAP_workplan.md](FEATUREROADMAP_workplan.md)

This document says what Pawsitions *is*. The roadmap says in what order it gets built.
Where the two disagree, this document wins.

Terms are defined in the [README glossary](README.md#glossary) and are not redefined here.

---

## 1. The idea in one paragraph

Chess is intimidating. Pawsitions makes the board feel like a picture book without making
the chess any easier or any less correct. You play real chess — every rule, no training
wheels — but a puppy called Biscuit sits beside the board, eats a treat every time you
capture a piece, and visibly grows up over the course of the game. That single idea is
what separates this from every other chess site, and it costs the chess nothing.

---

## 2. Who it is for

A person who knows roughly how the pieces move and wants to play a friend on the sofa, or
beat a gentle computer, or play a friend who lives somewhere else. Not a tournament player.
Nobody has to make an account or learn any notation.

---

## 3. Visual system

The chosen direction is **sage and cream** — calm, storybook, deliberately not candy-coloured,
because a player looks at this board for an hour at a time.

### 3.1 Colour tokens

Declared once in `styles.css` as CSS custom properties. Nothing anywhere else may use a
raw hex value.

| Token | Value | Used for |
| --- | --- | --- |
| `--sq-light` | `#F3EADF` | light board squares |
| `--sq-dark` | `#9FB89A` | dark board squares |
| `--piece-w` | `#FFFBF4` | white piece bodies |
| `--piece-w-ink` | `#6B5142` | white piece faces, eyes, outline |
| `--piece-b` | `#6B5142` | black piece bodies |
| `--piece-b-ink` | `#F3EADF` | black piece faces, eyes |
| `--biscuit` | `#E28A5F` | accent — move dots, buttons, the dog's collar |
| `--paper` | `#FAF5EE` | page background |
| `--surface` | `#FFFFFF` | panels, trays, dialogs |
| `--ink` | `#3B2E27` | body text |
| `--ink-soft` | `#7A6A5F` | secondary text, labels |
| `--rule` | `#E6DBCB` | hairline borders |
| `--good` | `#6F9E72` | your turn, connected, checkmate-win |
| `--warn` | `#C8654A` | check, disconnected, resign |

A dark theme is defined by redefining these same tokens under
`@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`. The board squares stay
the same in both themes — a chess board that changes colour with the OS is disorienting —
but the page around it darkens.

### 3.2 Type

- **Display** (headings, the logo, the dog's status line): *Fraunces*, weight 900.
- **Body and UI**: *Nunito*, weights 400 / 700 / 800.
- **Numbers that line up in columns** (material count, move list): Nunito with
  `font-variant-numeric: tabular-nums`.

Both loaded from Google Fonts with a real fallback stack. If the fonts fail to load the
page must still be legible and correctly laid out.

### 3.3 The pieces

Hand-drawn dog characters, authored as inline SVG so they stay sharp at any board size and
recolour by CSS token rather than needing two image files per piece.

| Piece | Character |
| --- | --- |
| Pawn | a puppy's head with floppy ears |
| Knight | a dog's head in profile with a long snout |
| Bishop | a puppy in a tall pointed hat |
| Rook | a doghouse with a puppy peeking out of the door |
| Queen | a puppy in a three-point tiara |
| King | a puppy in a crown |

Each piece is one `<symbol>` in a sprite sheet, placed with `<use>`. White and black are
the *same* geometry with different tokens — never two separate drawings, which would drift.

Accessibility requirement: colour alone must not distinguish the sides. White pieces carry
a thin dark outline; black pieces are solid. Someone with low vision or colour blindness
can tell them apart.

### 3.4 Motion

Restrained. The point of the theme is calm.

- A moving piece slides to its destination over 180ms with an ease-out curve. It does not
  bounce or spin.
- Legal-move dots fade in over 90ms.
- Biscuit wags continuously at a slow 1.6s cycle.
- A capture sends the treat arcing from the captured square into the bowl (400ms).
- Check pulses the king's square twice in `--warn`.
- Checkmate: the winning side's dog does one happy spin; the losing side's dog lies down.

**Everything above is disabled under `prefers-reduced-motion: reduce`.** State still
changes — pieces still arrive, treats still count — they simply arrive instantly.

---

## 4. Screens

A single HTML page. Which screen shows is driven by the URL fragment, so the browser's
back button and a pasted link both work.

| URL | Screen |
| --- | --- |
| `/` | Home |
| `/#/hotseat` | Hot-seat game |
| `/#/vs` | Side picker, then Vs Computer game |
| `/#/online` | Room code entry |
| `/#/online/BISCUIT` | Online game in room `BISCUIT` |

### 4.1 Home

The logo, Biscuit sitting, and three large buttons: **Two players, one screen** /
**Play the computer** / **Play a friend online**. Plainly worded — nobody has to guess
what "hot-seat" means before they have played once. A settings row underneath holds the
music and sound toggles.

### 4.2 Game screen

The same layout for all three modes, with parts hidden when they do not apply.

```
┌──────────────────────────────┬────────────────────┐
│                              │  status line       │
│                              │  ────────────────  │
│                              │  Biscuit (you)     │
│          the board           │  growth bar        │
│                              │  captured tray     │
│                              │  ────────────────  │
│                              │  opponent's dog    │
│                              │  captured tray     │
│                              │  ────────────────  │
│                              │  buttons           │
└──────────────────────────────┴────────────────────┘
```

Below 760px wide the side panel moves underneath the board and the board takes the full
width. The board is never smaller than 280px and never larger than 560px.

**Status line** is the single most important piece of text on the screen and always says
what is happening in words, never symbols alone: *"White to move"*, *"White is in check"*,
*"Checkmate — Black wins"*, *"Stalemate — it's a draw"*, *"Waiting for a second player…"*,
*"Reconnecting…"*.

**Buttons**, by mode:

| Button | Hot-seat | Vs Computer | Online |
| --- | --- | --- | --- |
| New game | ✓ | ✓ | ✓ (resets for both players) |
| Undo | ✓ | — | — |
| Resign | — | — | ✓ |
| Flip board | ✓ | ✓ | — |
| Copy room link | — | — | ✓ |

### 4.3 Promotion chooser

When a pawn reaches the last rank, a small panel appears over the board with four buttons
— queen, rook, bishop, knight — drawn as the actual piece art at a large size. The move is
not committed until one is chosen. Pressing Escape cancels the move entirely and puts the
pawn back. Keyboard: arrow keys move between the four, Enter confirms.

Defaulting to a queen without asking is explicitly **not** acceptable — underpromotion is
part of legal chess and the brief requires a choice.

### 4.4 Board interaction

Two ways to move, both always available:

1. **Click the piece, then click the destination.** Selecting a piece shows a dot on every
   legal destination and a ring on capturable pieces.
2. **Drag and drop**, with the same dots shown while dragging.

Clicking a piece that has no legal moves gives a brief shake and no dots — the player
learns why nothing happened. Clicking the selected piece again deselects it.

**Keyboard play is fully supported**: Tab moves focus to the board, arrow keys move a
cursor square to square, Space or Enter picks up and puts down. Every square has an
accessible name like "e4, white knight".

The board is drawn from the point of view of whoever is to move in hot-seat (it flips),
from the player's own side in Vs Computer and Online, and from White's side for spectators.

---

## 5. `rules.js` — the one rules module

The single most important file in the project. Every mode imports it, and so does the
Worker. It has no dependencies, imports nothing, knows nothing about the DOM, and contains
no chess library code.

### 5.1 The position object

Plain data, no classes, treated as immutable — `makeMove` returns a new object rather than
editing the old one, which makes undo and the computer's search trivially safe.

```js
{
  board:    Array(64),   // index 0 = a8 … 63 = h1; null, or { type, color }
                         // type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
                         // color: 'w' | 'b'
  turn:     'w' | 'b',
  castling: { wK: bool, wQ: bool, bK: bool, bQ: bool },
  epTarget: null | number,   // the square a pawn may capture *onto*, this move only
  halfmove: number,          // tracked for FEN correctness; no draw rule uses it
  fullmove: number
}
```

### 5.2 Public functions

| Function | Returns |
| --- | --- |
| `initialPosition()` | the standard starting position |
| `legalMoves(pos)` | every legal move for the side to move, as an array |
| `movesFrom(pos, square)` | the subset starting on one square — what the UI draws dots from |
| `makeMove(pos, move)` | a **new** position with the move applied |
| `isInCheck(pos, color)` | boolean |
| `isSquareAttacked(pos, square, byColor)` | boolean |
| `gameStatus(pos)` | `'playing'` · `'check'` · `'checkmate'` · `'stalemate'` |
| `toFEN(pos)` / `fromFEN(text)` | position ⇄ one line of text |
| `moveToUci(move)` / `uciToMove(pos, uci)` | move ⇄ `"e2e4"`, `"e7e8q"` for promotion |
| `perft(pos, depth)` | number of move sequences — the correctness proof |

A move object:

```js
{ from, to, piece, captured, promotion, flag }
// flag: null | 'double' | 'ep' | 'castleK' | 'castleQ'
```

### 5.3 The rule that makes illegal moves impossible

`legalMoves` is the only source of truth, and it is *legal* moves, not pseudo-legal ones:
it generates candidate moves, plays each one out, and discards any that leave the mover's
own king attacked. Nothing else in the codebase decides what is allowed.

This single choice is what delivers the brief's hardest requirement. The UI cannot offer an
illegal destination because it only draws dots on squares `movesFrom` returned. The computer
cannot play one because it only searches moves `legalMoves` returned. A malicious player
cannot send one, because the Worker looks the incoming move up in `legalMoves` and drops
anything that is not in the list.

`uciToMove` deliberately resolves a move *against the current position* rather than trusting
text. A client that sends `e2e9`, or `e2e4` when it is not their turn, or a promotion to a
king, finds no match and is rejected.

### 5.4 Correctness gate

`rules.js` is not finished, and no other feature may start, until `npm test` passes.

Start position — the three numbers the brief requires:

| Depth | Expected |
| --- | --- |
| 1 | 20 |
| 2 | 400 |
| 3 | 8,902 |

Start position at depth 4 (197,281) and depth 5 (4,865,609) run too, the latter behind a
flag because it takes a few seconds.

The start position alone does **not** exercise castling or en passant, so the standard
published test positions go in as well — these are the ones that actually catch bugs:

| Position | Why it matters | d1 | d2 | d3 |
| --- | --- | --- | --- | --- |
| "Kiwipete" | castling both sides, pins, many captures | 48 | 2,039 | 97,862 |
| Position 3 | en passant and promotion edge cases | 14 | 191 | 2,812 |
| Position 4 | promotion under check | 6 | 264 | 9,467 |
| Position 5 | castling rights lost by rook capture | 44 | 1,486 | 62,379 |

These expected values are the standard published figures. If an implementation disagrees
with one, the implementation is assumed wrong until proven otherwise.

---

## 6. `engine.js` — the computer opponent

Runs entirely in the player's browser. The server never thinks about chess strategy.

- **Search**: minimax with alpha-beta pruning, fixed **depth 2**.
- **Move ordering**: captures first, best-value capture first. Pruning works far better on
  a sorted list, and this is the cheapest possible improvement.
- **Evaluation**: material (pawn 100, knight 320, bishop 330, rook 500, queen 900) plus a
  piece-square table per piece type, which nudges knights toward the centre, pawns forward
  and the king into a corner. Checkmate scores ±100000 adjusted by distance, so the engine
  prefers mate in one over mate in two.
- **Randomised tie-break**: among equally-scored moves it picks at random, so it does not
  play the identical game every time.

### Requirements

- Always returns a **legal** move — it can only choose from `legalMoves()`.
- Always returns **within two seconds**. Depth 2 from any position is a few thousand
  positions, which is milliseconds; the budget is not in danger, but the game screen still
  shows Biscuit tilting his head with *"Thinking…"* for a minimum of 300ms, because an
  instant reply feels broken rather than fast.
- Never blocks the page. The search yields to the browser before it starts so the player's
  own move finishes animating first.

If the engine ever cannot find a move, the position is checkmate or stalemate and
`gameStatus` has already said so. There is no third outcome.

---

## 7. Online mode

### 7.1 What the player sees

Type a room code — or take the one generated for you, which is always a dog word like
`BISCUIT`, `NOODLE`, `WAFFLE`, because those are easy to read down a phone line. The first
person in gets White, the second gets Black, everyone after that watches. The status line
says which you are. **Copy room link** puts a shareable URL on the clipboard.

Refreshing rejoins the same game in the same seat. Closing the tab and coming back later
does too, on the same device.

### 7.2 Architecture

One **Durable Object** per room, addressed with `env.ROOM.getByName(roomCode)` so the same
code always reaches the same object. It is registered with `new_sqlite_classes`, which
gives it a SQLite database.

The browser connects over a native WebSocket. The Durable Object accepts it with
`ctx.acceptWebSocket(ws)` — Cloudflare's hibernation-capable form, which lets the object be
evicted from memory between moves while keeping the sockets alive. That is why **the
position is written to SQLite after every single move** and never held only in memory.

**There are no timers of any kind** — no `setTimeout`, no `setInterval`, no Durable Object
alarms. Nothing in this game needs to happen at a particular time; everything happens
because someone did something.

Player identity travels on the socket itself via `ws.serializeAttachment({ playerId, role })`,
which survives hibernation. The browser keeps a random `playerId` in `localStorage`; the
room stores which `playerId` owns which seat, so a refresh is recognised and handed its seat
back rather than being demoted to spectator.

### 7.3 Messages

Every message is JSON with exactly two keys, `type` and `payload`.

Browser → server:

| type | payload | meaning |
| --- | --- | --- |
| `join` | `{ playerId }` | I'm here; tell me who I am and what the board looks like |
| `move` | `{ uci }` | I want to play this move |
| `newgame` | `{}` | reset the board for everyone |
| `resign` | `{}` | I give up |

Server → browser:

| type | payload | meaning |
| --- | --- | --- |
| `welcome` | `{ role, roomCode }` | you are `'white'`, `'black'` or `'spectator'` |
| `state` | `{ fen, lastMove, status, winner, captured, seats }` | the whole truth; redraw from this |
| `error` | `{ code, message }` | that was refused, and why |

`state` carries the complete position, not a delta. A client that misses a message and then
receives any later `state` is correct again immediately. This is the single most valuable
simplification in the online design.

### 7.4 The server decides every move

The Worker is the referee, not a relay. On `move` it:

1. loads the position from SQLite,
2. checks the sender's seat matches the side to move — a spectator or the wrong player is
   refused,
3. resolves the text against `legalMoves()` via `uciToMove`, refusing anything absent,
4. applies the move, recomputes status, **writes the new position to SQLite**,
5. broadcasts one `state` to everyone in the room, players and spectators alike.

A client that is hacked, buggy or lying changes nothing anyone else sees.

### 7.5 SQLite schema

```sql
CREATE TABLE IF NOT EXISTS game (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  fen        TEXT NOT NULL,
  status     TEXT NOT NULL,
  winner     TEXT,
  last_move  TEXT,
  white_id   TEXT,
  black_id   TEXT,
  started_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS moves (
  n         INTEGER PRIMARY KEY,
  uci       TEXT NOT NULL,
  fen_after TEXT NOT NULL
);
```

One row in `game`, always. `moves` exists so the captured-piece tray and material count can
be rebuilt exactly after a refresh instead of being guessed.

**New game** wipes `moves`, resets `game.fen` to the starting position and *keeps the
seats*, so the same two people play again without re-entering the code.

---

## 8. Biscuit

The reason this game exists.

- **Treats** = the number of pieces that side has captured. Each capture arcs a treat into
  the bowl.
- **Growth**: 0–4 treats *Puppy* · 5–9 treats *Young dog* · 10+ *Good Dog*. Each stage is a
  larger drawing with slightly different proportions, not just a CSS scale.
- **Who gets a dog**: hot-seat shows two, one per player. Vs Computer shows yours and the
  computer's. Online shows yours and your opponent's; spectators see both.
- **Reactions**: head tilt while the computer thinks · ears up on check · happy spin on
  winning · lies down on losing · sits calmly on a draw.
- A status line under the dog reads in words: *"Biscuit has 6 treats — young dog"*.

Biscuit never affects the chess. He is watching, not playing.

---

## 9. Treat Mode (power-ups) — optional, off by default

Built **last**, after everything else works. A switch on the setup screen, **off** unless
someone turns it on, so a default game of Pawsitions is always plain legal chess.

Three power-ups, one use each per player per game:

| Power-up | Effect |
| --- | --- |
| **Fetch** | Take back your last move and the reply to it. Hot-seat and Vs Computer only. |
| **Shield** | Choose one of your pieces. It cannot be captured during your opponent's next move. |
| **Sniff** | Highlights the strongest move for you for five seconds. Uses the same engine as Vs Computer. |

### Why Shield lasts one move rather than absorbing one hit

The first draft of this spec said "the next attempt to capture it fails, and the shield is
spent". Building it revealed that this cannot be done as a filter, and a filter is the only
tool available: a move that is filtered out of the legal list is never offered, so it can
never be attempted, so the shield would never be spent — which is permanent immunity, not
one save. Letting the attempt happen and bounce would mean teaching `makeMove` about
shields, which is precisely what must not happen.

So a shield protects a piece for the opponent's next move and then lapses. One move of
safety, nothing to abuse, and it needs nothing from `rules.js` but the list of moves it
already returns. A shielded piece still attacks and still blocks check — it is only immune
to being taken.

### Design rule that protects the chess

`rules.js` **is not modified** to support power-ups. Shield changes what is legal, so it
lives in a separate `powerups.js` that wraps the rules module:

```
legalMoves(pos)  →  applyShields(moves, shieldState)  →  what the UI and server use
```

With Treat Mode off, `applyShields` is the identity function and the code path is
byte-for-byte the plain game. This keeps the perft proof meaningful — it is testing the
same `legalMoves` the real game uses.

Online: shields and remaining uses live in the Durable Object and are validated there like
any move — the same `applyShields` filter runs on every incoming move, so a shielded
capture sent straight down the socket is refused. **Fetch is not offered online**: taking
back a move is not one player's to decide. **Sniff never reaches the server**, because it
only asks the engine running in the asking player's own browser and changes nothing anyone
else can see. Whether a room uses Treat Mode at all is set by the first player in, and can
only be changed before the first move.

---

## 10. Sound

All audio is **generated in the browser with the Web Audio API** — no audio files are
downloaded. It costs zero bytes, loads instantly, and loops seamlessly.

- **Music**: a slow four-chord felt-piano pad, soft attack, long release. Off until the
  player turns it on (browsers block autoplay anyway, and surprising someone with sound is
  rude). The choice is remembered per device.
- **Move sounds**, independently toggleable: a soft click on a move, a lower thud on a
  capture, a two-note chime on check, a short descending figure on checkmate.
- Both toggles sit on the Home screen and in the game screen's settings.

---

## 11. Accessibility

Not a phase-six nicety; each task's definition of done includes it.

- Full keyboard play, as described in §4.4.
- Every square and control has an accessible name.
- Status-line changes are announced to screen readers via an `aria-live` region.
- Text contrast meets WCAG AA; the side of a piece is never conveyed by colour alone.
- `prefers-reduced-motion` removes all animation.
- Visible focus rings on everything focusable.

---

## 12. Definition of done for the whole project

Pawsitions is finished when all of the following are true:

1. `npm test` passes, including all perft positions in §5.4.
2. All three modes are playable at a public Cloudflare URL.
3. All six pieces, check, checkmate, stalemate, castling, en passant and promotion with a
   choice work identically in all three modes.
4. No sequence of clicks, drags or keystrokes can produce an illegal move in any mode.
5. The computer replies with a legal move within two seconds from any position.
6. Online: first in is White, second is Black, others watch; the server decides every move;
   a refresh rejoins the same game; New game resets for everyone.
7. The four extras work: captured pieces with material count, hot-seat undo, move sounds,
   online resign.
8. Treat Mode is off by default, and turning it off yields plain legal chess.
9. The page is usable at 360px wide and by keyboard alone.
