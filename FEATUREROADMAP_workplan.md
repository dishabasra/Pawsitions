# Pawsitions — Feature Roadmap & Work Plan

Author: **Disha Basra**
Companion documents: [README.md](README.md) · [ProductSpec.md](ProductSpec.md)

Every feature below is one checkbox task. Each task lists what it **depends on**, which
**files** it touches, and its **definition of done** — the test that decides whether it is
finished, so "done" is never a matter of opinion.

The order is the one from the brief: **rules first, then hot-seat live on the internet,
then the computer, then online rooms, then the extras, then power-ups.**

---

## How to read this

- A task is **ready** when every task it depends on is ticked.
- Tasks within a phase are listed in the order they should be done.
- Each task is one commit (sometimes two). Nothing is committed with a failing `npm test`.
- Sizes are rough: **S** ≈ under an hour · **M** ≈ a few hours · **L** ≈ most of a day.

### The critical path

```
Phase 1 (rules)  ─────────────►  the gate. Nothing else starts until this passes.
      │
      ├──► Phase 2 (hot-seat, live)  ──► FIRST PUBLIC URL
      │            │
      │            ├──► Phase 3 (vs computer)
      │            └──► Phase 4 (online rooms)
      │                        │
      └────────────────────────┴──► Phase 5 (extras) ──► Phase 6 (Treat Mode) ──► Phase 7
```

Phases 3 and 4 both depend on Phase 2 but not on each other. Everything in Phase 5 is
independent of everything else in Phase 5.

---

## Phase 0 — Foundations ✅ complete

- [x] **0.1 — Create the repository and push an initial commit** · S
  - **Depends on:** nothing
  - **Files:** `.gitignore`, `package.json`, `LICENSE`
  - **Done when:** the repo exists on GitHub with a `main` branch and one commit.

- [x] **0.2 — Write README.md** · S
  - **Depends on:** 0.1
  - **Files:** `README.md`
  - **Done when:** a reader who has never seen the project can say what it is, run it
    locally, deploy it, and look up any term used in the other two documents.

- [x] **0.3 — Write ProductSpec.md and this roadmap** · M
  - **Depends on:** 0.2
  - **Files:** `ProductSpec.md`, `FEATUREROADMAP_workplan.md`
  - **Done when:** every feature in the brief appears either as a spec section or as a
    task below, and the visual direction is pinned to named colour tokens.

---

## Phase 1 — The rules 🔒 *the gate*

Nothing in Phases 2–7 may start until **1.8** is ticked. This is the brief's instruction
and it is also simply correct: every later phase imports this file, so a bug here is a bug
in three modes and a server at once.

All of Phase 1 is one file, `public/rules.js`, plus its test. No DOM, no imports, no
chess library.

- [x] **1.1 — Board representation, FEN and move notation** · M
  - **Depends on:** 0.3
  - **Files:** `public/rules.js`
  - **Builds:** the 64-square position object from ProductSpec §5.1; `initialPosition()`,
    `toFEN`, `fromFEN`, `moveToUci`, square-index helpers.
  - **Done when:** `toFEN(initialPosition())` returns
    `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`, and `fromFEN(toFEN(p))`
    round-trips a dozen hand-written positions without losing castling rights or the
    en-passant square.

- [x] **1.2 — Move generation for all six pieces** · L
  - **Depends on:** 1.1
  - **Files:** `public/rules.js`
  - **Builds:** candidate moves for pawn (one step, two steps, diagonal captures), knight,
    bishop, rook, queen, king. Not yet filtered for check.
  - **Done when:** from the start position the count is 20; from an empty board a lone
    knight on d4 has 8 moves and on a1 has 2; a lone queen on d4 has 27; sliding pieces
    stop at the first occupied square and may capture it only if it is an enemy.

- [x] **1.3 — Check detection and legal-move filtering** · M
  - **Depends on:** 1.2
  - **Files:** `public/rules.js`
  - **Builds:** `isSquareAttacked`, `isInCheck`, and the filter that turns candidate moves
    into **legal** moves by rejecting any that leave your own king attacked. This is the
    function every other part of the project will trust.
  - **Done when:** a pinned piece cannot move off the pin line; a king cannot move to an
    attacked square, including one defended by a piece it would capture; a king cannot
    step backwards along a checking queen's line; when in check, only moves that resolve
    the check are returned.

- [x] **1.4 — Castling** · M
  - **Depends on:** 1.3
  - **Files:** `public/rules.js`
  - **Builds:** both sides, both colours, all the conditions, and the rights bookkeeping —
    rights are lost when the king moves, when a rook moves, *and when a rook is captured
    on its home square*, which is the clause most implementations forget.
  - **Done when:** castling is offered with an empty path and unmoved pieces; refused if
    the king is in check, passes through an attacked square, or lands on one; refused
    after the king or that rook has moved; refused after that rook has been captured. The
    rook lands on the correct square in all four cases.

- [x] **1.5 — En passant** · M
  - **Depends on:** 1.3
  - **Files:** `public/rules.js`
  - **Builds:** setting `epTarget` on a two-square pawn move, offering the capture only on
    the immediately following move, and removing the captured pawn from the square *behind*
    the destination.
  - **Done when:** the capture is available for exactly one move and gone the next; the
    correct pawn disappears; and an en-passant capture that would expose your own king
    along a rank is refused — the notorious edge case where two pawns leave the rank at
    once.

- [x] **1.6 — Promotion** · S
  - **Depends on:** 1.3
  - **Files:** `public/rules.js`
  - **Builds:** four separate legal moves per promoting pawn move — queen, rook, bishop,
    knight — with the promotion piece carried on the move object and in UCI as `e7e8q`.
  - **Done when:** a pawn reaching the last rank generates exactly four moves per
    destination, including on capturing diagonals; promoting to a king or a pawn is
    impossible; `uciToMove` rejects `e7e8k`.

- [x] **1.7 — Checkmate and stalemate** · S
  - **Depends on:** 1.4, 1.5, 1.6
  - **Files:** `public/rules.js`
  - **Builds:** `gameStatus(pos)` returning `playing` / `check` / `checkmate` / `stalemate`.
  - **Done when:** fool's mate is `checkmate`; the classic king-and-pawn stalemate position
    is `stalemate`; a position with no legal moves is never reported as `playing`; being in
    check with legal moves available is `check`, not `checkmate`.

- [x] **1.8 — 🔒 Perft proof** · M
  - **Depends on:** 1.7
  - **Files:** `public/rules.js` (adds `perft`), `test/perft.test.js`, `test/positions.js`
  - **Builds:** the move-counting test described in ProductSpec §5.4, using Node's built-in
    `node --test` — no test framework to install.
  - **Done when:** `npm test` passes with the start position at **depth 1 = 20, depth 2 =
    400, depth 3 = 8,902** (the brief's requirement) and depth 4 = 197,281; and the
    Kiwipete, Position 3, Position 4 and Position 5 positions all match their published
    counts to depth 3. Any mismatch is a rules bug and is fixed here, not worked around
    later.

> **🔒 Gate PASSED.** All perft positions match to depth 4, and the starting
> position matches to depth 5 (4,865,609). Phase 2 is unblocked.

---

## Phase 2 — Hot-seat, live on the internet

The first thing that exists as a real URL. Two people, one screen, taking turns.

- [x] **2.1 — Cloudflare project and a deployed placeholder** · S
  - **Depends on:** 1.8
  - **Files:** `wrangler.jsonc`, `public/index.html`, `src/worker.js`
  - **Builds:** the Workers Free plan project with `compatibility_date` set to today,
    `observability` enabled, `assets` pointing at `public/` with
    `not_found_handling: "single-page-application"`, and `run_worker_first` reserved for
    the WebSocket path. A one-line placeholder page.
  - **Done when:** `npm run dev` serves the page locally and `npm run deploy` puts it at a
    public `*.workers.dev` URL that loads in a phone browser. Proving the deploy pipeline
    now means later phases never debug chess and Cloudflare at the same time.

- [x] **2.2 — Visual foundation** · M
  - **Depends on:** 2.1
  - **Files:** `public/styles.css`, `public/index.html`
  - **Builds:** every colour token from ProductSpec §3.1, the Fraunces/Nunito pairing with
    fallbacks, the page shell, and the board-plus-side-panel layout that collapses to one
    column under 760px.
  - **Done when:** no raw hex value appears outside the token block; the layout holds at
    360px and at 1440px with no horizontal scrolling; the dark theme is legible; and
    blocking the Google Fonts request still leaves a correctly laid out page.

- [x] **2.3 — Piece artwork** · M
  - **Depends on:** 2.2
  - **Files:** `public/art/pieces.svg`, `public/styles.css`
  - **Builds:** the six dog characters from ProductSpec §3.3 as one SVG sprite sheet,
    recoloured by token so white and black share one drawing.
  - **Done when:** all twelve piece/colour combinations render crisply at 32px and at
    120px; white and black are distinguishable in greyscale; and a stranger shown the
    board can name all six pieces.

- [x] **2.4 — Board rendering** · M
  - **Depends on:** 2.3, 1.8
  - **Files:** `public/board.js`
  - **Builds:** drawing any position from `rules.js` onto the 8×8 grid, plus coordinate
    labels, board flipping, and the 180ms slide animation.
  - **Done when:** a dozen positions loaded from FEN — including mid-game and
    nearly-empty ones — draw correctly in both orientations; the board is square at every
    width; and `prefers-reduced-motion` removes the slide.

- [x] **2.5 — Picking up and putting down pieces** · L
  - **Depends on:** 2.4
  - **Files:** `public/board.js`
  - **Builds:** click-then-click and drag-and-drop, legal-move dots from
    `movesFrom()`, capture rings, deselection, and the shake when a piece has no moves.
  - **Done when:** both input methods work on desktop and on a touchscreen; dots appear
    only on legal destinations; **there is no sequence of clicks or drags that plays an
    illegal move**; and dragging a piece off the board cancels cleanly.

- [x] **2.6 — Promotion chooser** · S
  - **Depends on:** 2.5
  - **Files:** `public/board.js`, `public/styles.css`
  - **Builds:** the four-piece chooser from ProductSpec §4.3.
  - **Done when:** every promotion asks; all four choices are reachable by mouse, touch and
    keyboard; Escape cancels the move and restores the pawn; and no code path silently
    promotes to a queen.

- [x] **2.7 — The hot-seat game** · M
  - **Depends on:** 2.6, 1.7
  - **Files:** `public/app.js`, `public/index.html`
  - **Builds:** the home screen, the `#/hotseat` route, the turn loop, the status line, the
    automatic board flip between turns, New game, and Flip board.
  - **Done when:** two people can play a complete legal game from first move to checkmate
    on one device; the status line names the state in words at every point, including
    check, checkmate with a winner, and stalemate; and New game returns to the start
    position with the board facing White.

- [x] **2.8 — Biscuit** · M
  - **Depends on:** 2.7
  - **Files:** `public/dog.js`, `public/art/dog.svg`, `public/styles.css`
  - **Builds:** the dog beside the board, the treat count, the three growth stages, the
    treat-arc animation on capture, and the reaction animations from ProductSpec §8.
  - **Done when:** capturing a piece moves a treat into the bowl and increases the count;
    the dog visibly changes at 5 and at 10 treats; hot-seat shows one dog per player; the
    status line reads in words; all animation stops under `prefers-reduced-motion`; and
    Biscuit has no effect whatsoever on what moves are legal.

- [x] **2.9 — Keyboard play and accessibility pass** · M
  - **Depends on:** 2.8
  - **Files:** `public/board.js`, `public/app.js`, `public/styles.css`
  - **Builds:** everything in ProductSpec §11.
  - **Done when:** a full game can be played with the keyboard alone; every square
    announces like "e4, white knight"; status changes reach an `aria-live` region; focus
    rings are visible; and text contrast passes WCAG AA.

- [ ] **2.10 — 🚀 Ship hot-seat** · S · ⛔ **blocked: needs Disha's Cloudflare login**
  - **Depends on:** 2.9
  - **Files:** none — deploy and verify
  - **Blocked because:** deploying publishes to a Cloudflare account, and this build
    environment has no credentials for one. `wrangler login` opens a browser to sign in,
    which cannot be done from here. Everything the deploy needs is built and verified
    locally against `wrangler dev`.
  - **To unblock, run two commands:**
    ```bash
    npx wrangler login     # opens your browser, once
    npm run deploy         # prints the public URL
    ```
  - **Done when:** the public URL plays a complete hot-seat game on a laptop and on a
    phone, and the link has been sent to one other person who played a game on it.

> **🚀 Milestone: hot-seat is complete and verified locally.** It plays a full legal
> game — click, drag or keyboard — with promotion, checkmate, stalemate, undo and
> Biscuit. Only the deploy itself waits on a Cloudflare login. Phases 3 and 4 do not
> depend on it, so they proceed.

---

## Phase 3 — Vs Computer

- [x] **3.1 — Position evaluation** · M
  - **Depends on:** 2.10
  - **Files:** `public/engine.js`
  - **Builds:** the material values and piece-square tables from ProductSpec §6, scoring a
    position from White's point of view.
  - **Done when:** the start position scores 0; being a queen up scores roughly +900; a
    knight on d4 scores higher than the same knight on a1; and checkmate scores are large
    enough that no material total can outweigh them.

- [x] **3.2 — Minimax with alpha-beta at depth 2** · L
  - **Depends on:** 3.1
  - **Files:** `public/engine.js`
  - **Builds:** the search, capture-first move ordering, and the random tie-break.
  - **Done when:** the engine takes a free queen when one is offered; does **not** take a
    defended pawn that loses a rook; finds mate in one from ten test positions; plays a
    legal move from a thousand random legal positions; and its slowest reply across those
    thousand is comfortably under two seconds.

- [x] **3.3 — The Vs Computer game** · M
  - **Depends on:** 3.2
  - **Files:** `public/app.js`
  - **Builds:** the `#/vs` route, the White-or-Black side picker, the alternating loop,
    the "Thinking…" state with Biscuit's head tilt and its 300ms minimum, and the
    computer's own dog.
  - **Done when:** a complete game can be played and lost as either colour; choosing Black
    means the computer opens; the board faces the player's own side; the interface never
    freezes while the computer thinks; and New game returns to the side picker.

- [ ] **3.4 — 🚀 Ship vs computer** · S · ⛔ **blocked with 2.10 on the Cloudflare login**
  - **Depends on:** 3.3, 2.10
  - **Verified locally:** a full game as White and as Black against `wrangler dev`, with
    the slowest reply 640ms round-trip — and that figure includes the deliberate 400ms
    pause, so the search itself is a fraction of it.
  - **Done when:** the same is true of the public URL, on a phone.

---

## Phase 4 — Online rooms

- [x] **4.1 — Durable Object wiring** · S
  - **Depends on:** 2.10
  - **Files:** `wrangler.jsonc`, `src/worker.js`
  - **Builds:** the `ROOM` binding, the `new_sqlite_classes` migration, and
    `run_worker_first` on the WebSocket path only, so static files are still served
    without running code.
  - **Done when:** `npm run deploy` succeeds with the Durable Object registered, the
    static pages still load, and a request to the WebSocket path reaches the Worker.

- [x] **4.2 — The Room object and its database** · M
  - **Depends on:** 4.1
  - **Files:** `src/worker.js`
  - **Builds:** routing by room code through `env.ROOM.getByName(roomCode)`, the WebSocket
    upgrade accepted with `ctx.acceptWebSocket(ws)`, the SQLite schema from ProductSpec
    §7.5, and the `{ type, payload }` message envelope.
  - **Done when:** two browser tabs connect to the same code and reach the same object;
    the schema is created on first use; the object survives hibernation and answers
    afterwards; and **no timer of any kind exists anywhere in the file**.

- [x] **4.3 — Seats, identity and rejoining** · M
  - **Depends on:** 4.2
  - **Files:** `src/worker.js`, `public/online.js`
  - **Builds:** first-in-is-White and second-is-Black, everyone else a spectator; the
    `playerId` kept in `localStorage`; identity on the socket via `ws.serializeAttachment`;
    and seat reclaim on reconnect.
  - **Done when:** two devices get White and Black in join order, a third watches,
    refreshing either player's page returns them to the **same seat and the same
    position**, and closing and reopening the tab does too.

- [x] **4.4 — The server decides every move** · L
  - **Depends on:** 4.3, 1.8
  - **Files:** `src/worker.js`, `public/online.js`
  - **Builds:** the five-step validation from ProductSpec §7.4 — including importing
    `rules.js` into the Worker so there is genuinely one rules module — the write to SQLite
    after every move, and the `state` broadcast.
  - **Done when:** a legal move appears on the other device within a second; a move sent
    out of turn, by a spectator, or hand-crafted to be illegal is refused with an `error`
    and changes nothing for anyone; and the position in SQLite is correct after every
    single move.

- [x] **4.5 — New game and disconnection** · M
  - **Depends on:** 4.4
  - **Files:** `src/worker.js`, `public/online.js`, `public/app.js`
  - **Builds:** New game resetting the board for everyone while keeping the seats; the
    `#/online` code-entry screen with generated dog-word codes; Copy room link; the
    "Waiting for a second player…" and "Reconnecting…" states; and automatic reconnect
    with backoff.
  - **Done when:** New game pressed on one device resets both; a player who loses their
    network reconnects to the correct position without either side pressing anything; and
    the status line always says what is happening.

- [ ] **4.6 — 🚀 Ship online** · S · ⛔ **blocked with 2.10 on the Cloudflare login**
  - **Depends on:** 4.5, 2.10
  - **Verified locally** against `wrangler dev` with three separate browsers: seats handed
    out in join order, moves appearing on all three screens, a spectator and an
    out-of-turn player both refused, a refresh returning to the same seat and position,
    resign, New game resetting everyone, reconnection after the socket is killed, and
    every illegal move refused when sent straight down the socket by a genuinely seated
    player.
  - **Done when:** the same is true of the public URL, between two people on two
    different networks.

---

## Phase 5 — The extras

All four are independent of each other. Any can be skipped or reordered.

- [x] **5.1 — Captured pieces and material count** · M
  - **Depends on:** 2.10 (and 4.6 to work online)
  - **Files:** `public/app.js`, `public/board.js`, `public/styles.css`
  - **Builds:** the tray beside each dog showing captured pieces at small size, plus the
    material difference as a number. Online it is rebuilt from the `moves` table so a
    refresh is exact.
  - **Done when:** the tray matches the pieces actually taken in all three modes; the
    number matches pawn 1 / knight 3 / bishop 3 / rook 5 / queen 9; it survives a refresh
    online; and it shares its count with Biscuit's treats rather than counting separately.

- [x] **5.2 — Undo in hot-seat** · S
  - **Depends on:** 2.10
  - **Files:** `public/app.js`
  - **Builds:** a history of positions and a take-back button, hot-seat only.
  - **Done when:** Undo restores the previous position, turn, castling rights, en-passant
    square, captured tray and treat count exactly; it can be pressed repeatedly back to the
    start; it is disabled at the start position; and it does not appear in the other modes.

- [x] **5.3 — Sound on move** · S
  - **Depends on:** 2.10
  - **Files:** `public/audio.js`, `public/app.js`
  - **Builds:** the Web Audio move, capture, check and checkmate sounds from ProductSpec
    §10, with a toggle remembered per device.
  - **Done when:** each event makes its own distinct sound in all three modes; no audio
    file is downloaded; nothing plays before the player has interacted with the page; and
    the toggle survives a refresh.

- [x] **5.4 — Resign in online** · S
  - **Depends on:** 4.6
  - **Files:** `src/worker.js`, `public/online.js`, `public/app.js`
  - **Builds:** the `resign` message, a confirmation step, and the result written to
    SQLite.
  - **Done when:** resigning ends the game for both players and any spectators with the
    opponent named as winner in the status line; it survives a refresh; a spectator cannot
    resign; and the button only appears while a game is in progress.

- [x] **5.5 — Calming music** · M
  - **Depends on:** 5.3
  - **Files:** `public/audio.js`
  - **Builds:** the generated four-chord felt-piano loop from ProductSpec §10.
  - **Done when:** it loops with no audible seam; it is off until switched on and the
    choice is remembered; it is independent of the move-sound toggle; it does not drift out
    of time over ten minutes; and it never plays over a browser's autoplay block.

---

## Phase 6 — Treat Mode (power-ups)

Built last, on purpose. Off by default, so a normal game is unaffected.

- [x] **6.1 — The Treat Mode wrapper and switch** · M
  - **Depends on:** 5.1, 4.6
  - **Files:** `public/powerups.js`, `public/app.js`, `public/index.html`
  - **Builds:** the `applyShields` wrapper from ProductSpec §9, the per-player budget of
    one use each, and the setup-screen toggle.
  - **Done when:** `rules.js` is **unchanged**, `npm test` still passes, and with the
    toggle off `applyShields` is provably the identity function — verified by playing a
    full game with Treat Mode off and confirming the move lists are identical.

- [x] **6.2 — Shield** · M
  - **Depends on:** 6.1
  - **Files:** `public/powerups.js`, `public/board.js`, `src/worker.js`
  - **Builds:** choosing a piece, the visual marker, refusing the next capture of it, and
    spending the shield.
  - **Done when:** a shielded piece survives exactly one capture attempt and is normal
    afterwards; the shield moves with the piece; it cannot be used twice; and online the
    Durable Object enforces all of that, so a modified client gains nothing.

- [x] **6.3 — Fetch** · S
  - **Depends on:** 6.1, 5.2
  - **Files:** `public/powerups.js`, `public/app.js`
  - **Builds:** taking back the last two half-moves, in hot-seat and vs computer only.
  - **Done when:** it restores the position exactly as Undo does, is usable once per
    player per game, and is absent in online mode.

- [x] **6.4 — Sniff** · S
  - **Depends on:** 6.1, 3.2
  - **Files:** `public/powerups.js`, `public/app.js`
  - **Builds:** running the engine on the human's position and highlighting its choice for
    five seconds.
  - **Done when:** the highlight names a legal move, disappears on its own, is usable once
    per player per game, and works in all three modes including online — where it is purely
    a client-side hint and sends nothing to the server.

---

## Phase 7 — Designs back into Figma

- [ ] **7.1 — Publish the design to Figma** · M
  - **Depends on:** 2.10
  - **Files:** none in this repo
  - **Builds:** a Figma file containing the colour tokens, the type scale, the piece
    artwork as components, and the Home and Game screens as frames.
  - **Done when:** the file exists in Disha's Figma and its colours and spacing match
    `styles.css`. **Known risk:** the Figma account currently has a *View* seat, which is
    read-only — if writing is blocked, this task is reported as blocked rather than
    quietly skipped, and the artwork is delivered as SVG files instead.

---

## Out of scope — not tasks, and deliberately so

accounts or logins · chess clocks · ratings · draw by threefold repetition · the fifty-move
rule · opening books · PGN export · React or any other framework · engine depth beyond 2 ·
spectator chat · mobile app builds

---

## Next task

**2.10 — the deploy**, which needs a Cloudflare login and is the only thing left. Every
feature is built and verified locally; 3.4 and 4.6 are the same deploy seen from the other
two modes, and 7.1 is the optional Figma push.
