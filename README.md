# 🐶 Pawsitions

**A browser chess game where a puppy grows up beside the board.**

Built by **Disha Basra**.

Every piece you capture drops a treat in Biscuit's bowl. Enough treats and he grows —
puppy, then young dog, then Good Dog — wagging away next to the board while you play.
It is real chess underneath: every rule, every edge case, no shortcuts.

---

## What it is

Pawsitions is a chess game that runs in a web browser. There is nothing to install and
no account to make. You open a link and play.

Three ways to play:

| Mode | What happens |
| --- | --- |
| **Hot-seat** | Two people share one screen and take turns. The board flips to face whoever is up. |
| **Vs Computer** | You pick White or Black; the browser plays the other side and answers within two seconds. |
| **Online** | Two people type the same room code on two different devices and see each other's moves live. |

In Online mode, the first person into a room plays White, the second plays Black, and
anyone else who joins watches. Refreshing the page puts you back in the same game in the
same seat. **New game** resets the board for everyone at once.

---

## The chess is real chess

This is the part that matters most, so it is the part built first and tested hardest.

All six pieces move correctly. Check, checkmate and stalemate are detected. The three
rules people usually skip are all here:

- **Castling** — the king and rook swap places in one move, with all the conditions
  that make it illegal (pieces in the way, king in check, king passing through an
  attacked square, either piece having already moved).
- **En passant** — the sideways pawn capture that is only legal for exactly one move
  after an enemy pawn jumps two squares past you.
- **Promotion** — a pawn reaching the far end becomes a queen, rook, bishop or knight,
  and *you choose which*.

**An illegal move is impossible to make.** Not "rejected with an error" — impossible.
The board only lets you drop a piece on a square the rules already said yes to, and in
Online mode the server checks the move again before anyone sees it.

### How we prove it

There is a standard way to test a chess rules engine called **perft** (short for
*performance test*): count every possible sequence of moves up to a given depth from a
known position and compare against published numbers. If a single rule is wrong anywhere,
the count comes out wrong.

From the starting position:

| Depth | Expected move count |
| --- | --- |
| 1 | 20 |
| 2 | 400 |
| 3 | 8,902 |

Run it yourself:

```bash
npm test
```

The rules are not considered finished until those three numbers match exactly. Several
harder positions — ones designed specifically to catch castling and en-passant bugs —
are in the test file too.

---

## Quick start

You need [Node.js](https://nodejs.org) version 20 or newer.

```bash
git clone https://github.com/dishabasra/Chess.git pawsitions
cd pawsitions
npm install
npm run dev
```

That prints a local address (usually `http://localhost:8787`). Open it in your browser.

Other commands:

```bash
npm test        # prove the chess rules are correct
npm run deploy  # publish to the internet
```

### Deploying

The game runs on **Cloudflare Workers**, which is free for a project this size.

```bash
npx wrangler login   # once, opens your browser to sign in
npm run deploy
```

Wrangler prints the public URL when it finishes. That link is the game — send it to anyone.

---

## How it is built, in plain English

A quick tour for anyone reading the code for the first time.

**Cloudflare Workers** is a place to run a small amount of code on Cloudflare's servers,
which sit close to whoever is visiting. There is no server to rent, patch or restart.

**Static assets** are the plain files a browser needs — the HTML page, the stylesheet,
the JavaScript, the pictures. Cloudflare serves those directly without running any code,
which is fast and free. Our `wrangler.jsonc` points at the `public/` folder.

**Single-page application handling** means that if someone visits a URL we do not have a
file for, Cloudflare hands them `index.html` anyway and lets the JavaScript work out what
to show. That is what makes a link like `/room/BISCUIT` work.

**`run_worker_first`** is the exception to the above: for the one path that carries live
game traffic, we tell Cloudflare "do not look for a file here, run my code". That is the
WebSocket path.

**A WebSocket** is a phone line held open between the browser and the server, so either
side can speak at any moment. Normal web requests are letters — you ask, you get a reply,
the connection closes. Online chess needs the phone line, because the server has to be
able to say "your opponent just moved" without being asked.

**A Durable Object** is Cloudflare's name for a small, long-lived object that exists
exactly once, globally, with its own private database attached. We create one per room
code. Everyone who types `BISCUIT` is routed to the *same* object, which is what lets two
people on opposite sides of the world share one board. Its database is SQLite, and we
write the position to it after every single move — so nothing is lost if the object goes
to sleep, and a refresh picks up exactly where you were.

**Minimax with alpha-beta pruning** is how the computer opponent thinks. Minimax means:
try each of my moves, assume my opponent then plays their best reply, and pick the move
whose worst outcome is least bad. Alpha-beta pruning means: stop evaluating a branch the
moment it is clearly worse than one already found, because the rest of it cannot change
the answer. We look two half-moves ahead (**depth 2**) — our move, then your best reply —
which is enough to stop it hanging pieces, and fast enough to reply instantly. It runs in
your browser, not on the server.

**One rules module.** `rules.js` is the only file that knows how chess works. All three
modes import it, and so does the server. There is no second copy that could drift out of
sync, and no chess library — it is written from scratch for this project.

---

## Project structure

```
pawsitions/
├── wrangler.jsonc              Cloudflare config: assets, Durable Object, routes
├── package.json
├── README.md                   you are here
├── ProductSpec.md              what it looks like and how it behaves
├── FEATUREROADMAP_workplan.md  the build order, as checkboxes
├── public/                     everything the browser downloads
│   ├── index.html
│   ├── styles.css
│   ├── rules.js                ← the chess rules. Shared by every mode AND the server.
│   ├── engine.js               the computer opponent
│   ├── board.js                drawing the board, clicking and dragging
│   ├── app.js                  screens, menus, game state
│   ├── online.js               the WebSocket client
│   ├── dog.js                  Biscuit
│   ├── audio.js                music and move sounds
│   └── art/                    piece artwork
├── src/
│   └── worker.js               the Worker and the Room Durable Object
└── test/
    └── perft.test.js           the proof that the rules are correct
```

`rules.js` lives in `public/` because the browser loads it directly. The server imports
it across the folder boundary, so there is genuinely one copy.

---

## Glossary

Terms used above and in the other documents, defined once.

- **Alpha-beta pruning** — skipping branches of the computer's search that cannot change
  the final choice.
- **Depth** — how many half-moves ahead the computer looks. Depth 2 = its move plus your reply.
- **Durable Object** — a Cloudflare object that exists exactly once worldwide and has its
  own database. One per room.
- **En passant** — "in passing". A one-time pawn capture available immediately after an
  enemy pawn uses its two-square first move to slip past yours.
- **FEN** — Forsyth–Edwards Notation. A whole chess position written as one line of text.
  We use it to save games and to send positions over the network.
- **Half-move** — one player's turn. A full move is one from each side.
- **Hot-seat** — two players sharing one device, passing it back and forth.
- **Legal move** — a move that is allowed *and* does not leave your own king in check.
- **Material** — the point value of pieces: pawn 1, knight 3, bishop 3, rook 5, queen 9.
- **Minimax** — the computer's decision method: assume both sides play their best move.
- **Perft** — a move-counting test that proves a chess rules engine is correct.
- **Stalemate** — the player to move has no legal move but is *not* in check. It is a draw.
- **UCI notation** — a move written as start square + end square, like `e2e4`. Our
  network format.
- **WebSocket** — an always-open two-way connection between browser and server.
- **Worker** — the code Cloudflare runs for us when a request arrives.
- **Wrangler** — Cloudflare's command-line tool for running and deploying Workers.

---

## Not in scope

Deliberately left out, to keep the game small and the rules provable:

accounts or logins · chess clocks · ratings · draw by threefold repetition ·
the fifty-move rule · opening books · move export (PGN) · React or any other framework

Note that the two draw rules above being out of scope is a *choice*, not an oversight:
checkmate and stalemate are both fully implemented.

---

## License

MIT. See [LICENSE](LICENSE).
