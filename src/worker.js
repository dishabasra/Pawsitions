/**
 * The Pawsitions Worker, and the Room that runs one online game.
 *
 * Almost every request to this site never gets here: Cloudflare serves the files
 * in public/ directly, which is faster and costs nothing. The Worker exists for
 * the one thing a static file cannot do — hold a live connection open between
 * two people playing each other. `run_worker_first` in wrangler.jsonc names the
 * only path routed here first.
 *
 * The server is a referee, not a relay. It does not pass moves along and hope
 * the players agree; it holds the position, checks every move against the very
 * same rules module the browser uses, and tells everyone what the board now is.
 * A player whose browser has been tampered with changes nothing anyone sees.
 *
 * There are no timers anywhere in this file — no setTimeout, no setInterval, no
 * Durable Object alarms. Nothing here needs to happen at a particular moment;
 * everything happens because somebody did something. That is why the position is
 * written to SQLite after every single move rather than being held in memory and
 * saved later: the object can be put to sleep between moves, and when it wakes
 * the database is the whole truth.
 */

import { DurableObject } from 'cloudflare:workers';
import {
  initialPosition, fromFEN, toFEN, uciToMove, makeMove, gameStatus, legalMoves,
} from '../public/rules.js';
import {
  emptyTreatState, applyShields, canUse, markUsed, raiseShield, lapseShield, followMove,
} from '../public/powerups.js';

const START_FEN = toFEN(initialPosition());

/**
 * Tidy a room code into its one canonical form, so that "biscuit", "Biscuit "
 * and "BISCUIT" all reach the same room.
 */
export function normaliseRoomCode(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/ws/')) {
      const code = normaliseRoomCode(url.pathname.slice('/ws/'.length));
      if (code.length < 3) {
        return new Response('Room codes need at least three letters or numbers.', { status: 400 });
      }
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('This address expects a WebSocket connection.', { status: 426 });
      }

      // Every player who types the same code is routed to the same object,
      // wherever in the world they are. That is the whole trick behind rooms.
      return env.ROOM.getByName(code).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

/**
 * One room. One game. One SQLite database.
 */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    // Set the schema up before anything is allowed to read it.
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS game (
          id          INTEGER PRIMARY KEY CHECK (id = 1),
          fen         TEXT NOT NULL,
          last_move   TEXT,
          resigned_by TEXT,
          white_id    TEXT,
          black_id    TEXT,
          started_at  INTEGER NOT NULL,
          treats_on   INTEGER NOT NULL DEFAULT 0,
          shield_w    INTEGER,
          shield_b    INTEGER,
          used_w      TEXT NOT NULL DEFAULT '{}',
          used_b      TEXT NOT NULL DEFAULT '{}'
        );
      `);

      // Rooms created before Treat Mode existed have a table without these
      // columns. SQLite has no "add column if missing", and adding one that is
      // already there is an error rather than a no-op, so each is attempted and
      // the complaint ignored.
      for (const column of [
        "treats_on INTEGER NOT NULL DEFAULT 0",
        "shield_w INTEGER",
        "shield_b INTEGER",
        "used_w TEXT NOT NULL DEFAULT '{}'",
        "used_b TEXT NOT NULL DEFAULT '{}'",
      ]) {
        try {
          this.sql.exec(`ALTER TABLE game ADD COLUMN ${column}`);
        } catch {
          // Already present.
        }
      }
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS moves (
          n   INTEGER PRIMARY KEY,
          uci TEXT NOT NULL
        );
      `);
      const existing = this.sql.exec('SELECT id FROM game WHERE id = 1').toArray();
      if (existing.length === 0) {
        this.sql.exec(
          'INSERT INTO game (id, fen, last_move, resigned_by, white_id, black_id, started_at) VALUES (1, ?, NULL, NULL, NULL, NULL, ?)',
          START_FEN, Date.now(),
        );
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Reading and writing the one row
  // ───────────────────────────────────────────────────────────────────────────

  _game() {
    return this.sql.exec('SELECT * FROM game WHERE id = 1').toArray()[0];
  }

  _moves() {
    return this.sql.exec('SELECT uci FROM moves ORDER BY n').toArray().map((r) => r.uci);
  }

  /** The room's Treat Mode state, in the shape powerups.js expects. */
  _treats(game = this._game()) {
    const parse = (text) => {
      try {
        return JSON.parse(text ?? '{}');
      } catch {
        return {};
      }
    };
    return {
      enabled: Boolean(game.treats_on),
      shield: {
        w: game.shield_w === null || game.shield_w === undefined ? null : game.shield_w,
        b: game.shield_b === null || game.shield_b === undefined ? null : game.shield_b,
      },
      used: {
        w: { shield: false, fetch: false, sniff: false, ...parse(game.used_w) },
        b: { shield: false, fetch: false, sniff: false, ...parse(game.used_b) },
      },
    };
  }

  _saveTreats(treats) {
    this.sql.exec(
      'UPDATE game SET treats_on = ?, shield_w = ?, shield_b = ?, used_w = ?, used_b = ? WHERE id = 1',
      treats.enabled ? 1 : 0,
      treats.shield.w,
      treats.shield.b,
      JSON.stringify(treats.used.w),
      JSON.stringify(treats.used.b),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Connecting
  // ───────────────────────────────────────────────────────────────────────────

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // acceptWebSocket rather than server.accept(): this form lets the object be
    // evicted from memory between moves while the connections stay open, which
    // is what makes a room that two people leave open all afternoon free to run.
    this.ctx.acceptWebSocket(server);

    // Identity is not known until the player says who they are, so the socket
    // starts as nobody.
    server.serializeAttachment({ playerId: null, role: 'spectator' });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let message;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return this._error(ws, 'bad_json', 'That message was not readable.');
    }
    if (message === null || typeof message !== 'object' || typeof message.type !== 'string') {
      return this._error(ws, 'bad_message', 'Every message needs a type.');
    }

    const payload = message.payload ?? {};

    switch (message.type) {
      case 'join': return this._join(ws, payload);
      case 'move': return this._move(ws, payload);
      case 'newgame': return this._newGame(ws);
      case 'resign': return this._resign(ws);
      case 'treat': return this._treat(ws, payload);
      default:
        return this._error(ws, 'unknown_type', `Nothing here handles "${message.type}".`);
    }
  }

  async webSocketClose(ws, code, reason) {
    // Answer the close frame. Newer runtimes do this by themselves, but only
    // once the handshake completes does the browser fire its own 'close' event —
    // and until it does, a client that has lost its connection sits in CLOSING
    // forever and never knows to reconnect. Replying explicitly is safe on every
    // runtime and costs nothing.
    try {
      // 1005 ("no code given") and 1006 ("closed abnormally") are status codes a
      // browser reports but nobody is allowed to send back.
      const echo = code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000;
      ws.close(echo, reason);
    } catch {
      // Already gone. Nothing to answer.
    }

    // Seats belong to a player's id, not to a connection — which is exactly what
    // lets a refresh land back in the same seat — so there is nothing to clean
    // up. Telling everyone else that somebody left is worth doing, though.
    this._broadcastState();
  }

  async webSocketError() {
    this._broadcastState();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Who is who
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Work out which seat this player gets, and remember it.
   *
   * First in plays White, second plays Black, everyone else watches. The seat is
   * tied to a `playerId` the browser keeps, not to the connection — so a refresh,
   * or closing the tab and coming back, returns you to your own seat instead of
   * demoting you to a spectator while your own game carries on without you.
   */
  _join(ws, { playerId }) {
    if (typeof playerId !== 'string' || playerId.length < 8 || playerId.length > 64) {
      return this._error(ws, 'bad_player', 'That player id looks wrong.');
    }

    const game = this._game();
    let role;

    if (game.white_id === playerId) role = 'white';
    else if (game.black_id === playerId) role = 'black';
    else if (this._seatIsFree(game.white_id, game)) {
      this.sql.exec('UPDATE game SET white_id = ? WHERE id = 1', playerId);
      role = 'white';
    } else if (this._seatIsFree(game.black_id, game)) {
      this.sql.exec('UPDATE game SET black_id = ? WHERE id = 1', playerId);
      role = 'black';
    } else {
      role = 'spectator';
    }

    ws.serializeAttachment({ playerId, role });
    this._send(ws, 'welcome', { role });
    this._broadcastState();
  }

  /**
   * May a newcomer take this seat?
   *
   * An empty seat, obviously. Beyond that the answer has to balance two things
   * that pull in opposite directions:
   *
   *   · A player who refreshes, loses signal in a tunnel, or closes the tab for a
   *     minute must get their own seat back. Handing it to a bystander because
   *     they blinked would be much worse than making the bystander watch.
   *   · But two people who played once and never came back must not lock a room
   *     code forever. With codes like BISCUIT and WAFFLE, someone will pick the
   *     same one eventually, and finding yourself a permanent spectator in an
   *     empty room with no way out is baffling.
   *
   * So: a seat is held for its owner while a game is actually under way, and is
   * otherwise free once its owner has no connection open. A room that was
   * abandoned before anyone moved, or after the game finished, opens up again.
   * A game in progress never does.
   *
   * No timers are involved, and nothing expires on a schedule — the question is
   * answered from what is true right now, every time it is asked.
   */
  _seatIsFree(ownerId, game) {
    if (ownerId === null) return true;

    for (const socket of this.ctx.getWebSockets()) {
      if (this._whoIs(socket).playerId === ownerId) return false; // they are here
    }

    const played = this.sql.exec('SELECT COUNT(*) AS n FROM moves').toArray()[0].n;
    if (played === 0) return true;              // nothing has started
    if (game.resigned_by !== null) return true; // it finished

    const status = gameStatus(fromFEN(game.fen));
    return status === 'checkmate' || status === 'stalemate';
  }

  _whoIs(ws) {
    try {
      return ws.deserializeAttachment() ?? { playerId: null, role: 'spectator' };
    } catch {
      return { playerId: null, role: 'spectator' };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Playing
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * The five checks every move has to pass. A move that fails any of them
   * changes nothing, for anybody.
   */
  _move(ws, { uci }) {
    const who = this._whoIs(ws);
    if (who.role !== 'white' && who.role !== 'black') {
      return this._error(ws, 'spectator', 'You are watching this game, not playing it.');
    }

    const game = this._game();
    if (game.resigned_by !== null) {
      return this._error(ws, 'game_over', 'That game has already finished.');
    }

    const position = fromFEN(game.fen);
    const status = gameStatus(position);
    if (status === 'checkmate' || status === 'stalemate') {
      return this._error(ws, 'game_over', 'That game has already finished.');
    }

    const myColour = who.role === 'white' ? 'w' : 'b';
    if (position.turn !== myColour) {
      return this._error(ws, 'not_your_turn', 'It is not your turn.');
    }

    // The only door move text comes through. It is resolved against the legal
    // moves of *this* position, so invented moves find no match — and then run
    // through the same Treat Mode filter the browser uses, so a shield cannot be
    // ignored by a client that has been tampered with.
    const treats = this._treats(game);
    const move = uciToMove(position, uci);
    if (move === null) {
      return this._error(ws, 'illegal', 'That is not a legal move.');
    }
    if (!applyShields([move], treats).length) {
      return this._error(ws, 'shielded', 'That piece is shielded this move.');
    }

    const next = makeMove(position, move);

    // A shield follows its piece, and the opponent's shield has now done its one
    // move of work.
    followMove(treats, move);
    lapseShield(treats, myColour === 'w' ? 'b' : 'w');
    this._saveTreats(treats);

    // Written down before anyone is told, so the database is never behind what
    // the players have seen.
    this.sql.exec(
      'UPDATE game SET fen = ?, last_move = ? WHERE id = 1',
      toFEN(next), uci,
    );
    this.sql.exec(
      'INSERT INTO moves (n, uci) VALUES ((SELECT COALESCE(MAX(n), 0) + 1 FROM moves), ?)',
      uci,
    );

    this._broadcastState();
  }

  /** Start again, keeping the seats so the same two people can play on. */
  _newGame(ws) {
    const who = this._whoIs(ws);
    if (who.role !== 'white' && who.role !== 'black') {
      return this._error(ws, 'spectator', 'Only the players can start a new game.');
    }
    this.sql.exec('DELETE FROM moves');
    this.sql.exec(
      'UPDATE game SET fen = ?, last_move = NULL, resigned_by = NULL, started_at = ? WHERE id = 1',
      START_FEN, Date.now(),
    );
    // Power-ups come back, but whether the room wants Treat Mode at all is a
    // setting, not part of the game, so it survives.
    const fresh = emptyTreatState(Boolean(this._game().treats_on));
    this._saveTreats(fresh);
    this._broadcastState();
  }

  /** Give up. The other side wins. */
  _resign(ws) {
    const who = this._whoIs(ws);
    if (who.role !== 'white' && who.role !== 'black') {
      return this._error(ws, 'spectator', 'Only the players can resign.');
    }
    const game = this._game();
    if (game.resigned_by !== null) return;

    const position = fromFEN(game.fen);
    const status = gameStatus(position);
    if (status === 'checkmate' || status === 'stalemate') {
      return this._error(ws, 'game_over', 'That game has already finished.');
    }

    this.sql.exec('UPDATE game SET resigned_by = ? WHERE id = 1', who.role === 'white' ? 'w' : 'b');
    this._broadcastState();
  }

  /**
   * Treat Mode, checked here rather than trusted from the browser.
   *
   *   enable  turn the room's Treat Mode on or off — only before the first move,
   *           because switching the rules mid-game is not a power-up
   *   shield  protect one of your own pieces for the opponent's next move
   *
   * Fetch is not offered online: taking back a move is not one player's to
   * decide. Sniff never reaches the server — it only asks the engine running in
   * the asking player's own browser, and changes nothing anyone else can see.
   */
  _treat(ws, { kind, square, on }) {
    const who = this._whoIs(ws);
    if (who.role !== 'white' && who.role !== 'black') {
      return this._error(ws, 'spectator', 'Power-ups are for the players.');
    }

    const game = this._game();
    const colour = who.role === 'white' ? 'w' : 'b';
    const treats = this._treats(game);

    if (kind === 'enable') {
      if (this._moves().length > 0) {
        return this._error(ws, 'too_late', 'Treat Mode can only be changed before the first move.');
      }
      const next = emptyTreatState(Boolean(on));
      this._saveTreats(next);
      return this._broadcastState();
    }

    if (kind !== 'shield') {
      return this._error(ws, 'unknown_treat', `There is no power-up called "${kind}".`);
    }

    const position = fromFEN(game.fen);
    const status = gameStatus(position);
    const over = game.resigned_by !== null || status === 'checkmate' || status === 'stalemate';

    if (!canUse(treats, colour, 'shield', { isMyTurn: position.turn === colour, gameOver: over })) {
      return this._error(ws, 'no_treat', 'You cannot use that right now.');
    }
    if (!Number.isInteger(square) || square < 0 || square > 63) {
      return this._error(ws, 'bad_square', 'That is not a square.');
    }
    if (!raiseShield(treats, colour, square, position)) {
      return this._error(ws, 'not_yours', 'You can only shield your own piece.');
    }

    this._saveTreats(treats);
    this._broadcastState();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Telling everyone
  // ───────────────────────────────────────────────────────────────────────────

  _send(ws, type, payload) {
    try {
      ws.send(JSON.stringify({ type, payload }));
    } catch {
      // A socket that has gone away is not an error worth reacting to.
    }
  }

  _error(ws, code, message) {
    this._send(ws, 'error', { code, message });
  }

  /**
   * Send the whole position to everyone in the room.
   *
   * Deliberately the entire truth rather than "a pawn moved from e2 to e4". A
   * client that misses a message — a phone that slept, a tunnel — is completely
   * correct again the moment any later message arrives, with no catching up and
   * no way for two players to end up looking at different boards.
   */
  _broadcastState() {
    const game = this._game();
    const moves = this._moves();
    const sockets = this.ctx.getWebSockets();

    // Which seats are actually connected right now, so the screen can say
    // "waiting for a second player" honestly.
    let whiteHere = false;
    let blackHere = false;
    let watching = 0;
    for (const socket of sockets) {
      const who = this._whoIs(socket);
      if (who.role === 'white') whiteHere = true;
      else if (who.role === 'black') blackHere = true;
      else watching++;
    }

    const payload = {
      fen: game.fen,
      moves,
      lastMove: game.last_move,
      resignedBy: game.resigned_by,
      treats: this._treats(game),
      seats: {
        whiteTaken: game.white_id !== null,
        blackTaken: game.black_id !== null,
        whiteHere,
        blackHere,
        watching,
      },
    };

    for (const socket of sockets) this._send(socket, 'state', payload);
  }
}
