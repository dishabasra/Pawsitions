/**
 * app.js — the screens, and the loop that runs a game.
 *
 * Which screen shows is decided by the part of the address after the "#". That
 * keeps the browser's back button working and makes every screen a real link
 * somebody can send, without needing the server to know about any of them.
 *
 *   #/           home
 *   #/hotseat    two players, one screen
 *   #/vs         play the computer
 *   #/online     type a room code
 *   #/online/BISCUIT   that room
 */

import { Board } from './board.js';
import { Dog } from './dog.js';
import { Game } from './game.js';
import { chooseMove } from './engine.js';
import { RoomConnection, suggestRoomCode, normaliseRoomCode } from './online.js';
import { sound, playMoveSound } from './audio.js';

const screen = document.getElementById('screen');
const announcer = document.getElementById('announcer');
const topbarActions = document.getElementById('topbar-actions');

/** Say something out loud, for anyone using a screen reader. */
function announce(text) {
  if (announcer.textContent === text) return;
  announcer.textContent = text;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The two sound switches.
 *
 * They live in the top bar on every screen rather than behind a settings menu,
 * because the moment somebody wants the music off is the moment it is playing.
 */
function soundToggles() {
  const wrap = el('div', 'topbar-actions');

  const make = (key, onLabel, offLabel, isOn, set) => {
    const node = el('button', 'btn btn--quiet');
    node.type = 'button';
    const paint = () => {
      const on = isOn();
      node.textContent = on ? onLabel : offLabel;
      node.setAttribute('aria-pressed', String(on));
      node.setAttribute('aria-label', `${onLabel.replace(/^\S+\s/, '')}: ${on ? 'on' : 'off'}`);
    };
    node.addEventListener('click', async () => { await set(!isOn()); paint(); });
    paint();
    return { node, paint };
  };

  const music = make('music', '♫ Music on', '♫ Music off', () => sound.musicOn, (v) => sound.setMusic(v));
  const sfx = make('sfx', '♪ Sounds on', '♪ Sounds off', () => sound.sfxOn, (v) => sound.setSfx(v));

  wrap.append(music.node, sfx.node);
  return wrap;
}

/** The standard top bar for a screen: sound switches, then a way back. */
function setTopbar(...extra) {
  topbarActions.replaceChildren(soundToggles(), ...extra);
}

function button(label, className, onClick, { disabled = false } = {}) {
  const node = el('button', `btn ${className}`.trim(), label);
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', onClick);
  return node;
}

// ─────────────────────────────────────────────────────────────────────────────
// Home
// ─────────────────────────────────────────────────────────────────────────────

function renderHome() {
  setTopbar();
  const view = el('div', 'home');

  const dog = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  dog.setAttribute('class', 'home-dog');
  dog.setAttribute('viewBox', '0 0 64 64');
  dog.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#dog-2');
  dog.appendChild(use);

  const heading = el('h1', null, 'Chess, with a puppy');
  const blurb = el(
    'p', 'home-blurb',
    'Real chess — every rule, nothing made easier. Every piece you capture is a treat for Biscuit, and enough treats and he grows up beside the board.',
  );

  const modes = el('div', 'home-modes');
  const options = [
    ['#/hotseat', 'Two players, one screen', 'Take turns on this device. The board turns to face whoever is up.'],
    ['#/vs', 'Play the computer', 'Choose White or Black. It answers within two seconds.'],
    ['#/online', 'Play a friend online', 'Share a room code and see each other’s moves as they happen.'],
  ];
  for (const [href, title, description] of options) {
    const choice = el('button', 'mode-btn');
    choice.type = 'button';
    choice.append(el('strong', null, title), el('span', null, description));
    choice.addEventListener('click', () => { window.location.hash = href; });
    modes.appendChild(choice);
  }

  view.append(dog, heading, blurb, modes);
  screen.replaceChildren(view);
  announce('Pawsitions. Choose how you want to play.');
}

// ─────────────────────────────────────────────────────────────────────────────
// The game screen, shared by every mode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the board, the two dogs and the controls, and keeps them in step with a
 * Game. Every mode uses this one class; what differs is who is allowed to move.
 *
 *   bothSides  hot-seat — this person plays whichever side is to move
 *   myColor    vs computer and online — this person plays one fixed colour
 *   neither    a spectator, who may move nothing
 */
class GameView {
  constructor({
    game,
    bothSides = false,
    myColor = null,
    names = { w: 'Biscuit', b: 'Pepper' },
    controls = [],
    onMove = () => {},
  }) {
    this.game = game;
    this.bothSides = bothSides;
    this.myColor = myColor;
    this.onMove = onMove;
    this.controlSpecs = controls;

    /** Set when the player turns the board by hand; overrides the automatic choice. */
    this.orientationOverride = null;
    /** Extra text under the status line, e.g. "Thinking…". */
    this.subtitle = '';
    /** Locks the board regardless of whose turn it is. */
    this.frozen = false;

    this.root = el('div', 'game');

    const boardArea = el('div', 'board-area');
    this.boardEl = el('div');
    boardArea.appendChild(this.boardEl);

    this.panel = el('aside', 'panel');
    this.statusEl = el('div', 'status');
    this.statusDot = el('span', 'status-dot');
    this.statusText = el('span', null, '');
    this.statusEl.append(this.statusDot, this.statusText);
    this.subtitleEl = el('p', 'status-sub');

    this.dogs = {
      w: new Dog({ color: 'w', name: names.w }),
      b: new Dog({ color: 'b', name: names.b }),
    };

    this.controlsEl = el('div', 'controls');

    this.panel.append(
      this.statusEl, this.subtitleEl,
      this.dogs.w.root, this.dogs.b.root,
      this.controlsEl,
    );
    this.root.append(boardArea, this.panel);

    this.board = new Board(this.boardEl, {
      onMove: (move) => this.onMove(move),
      onPickUp: () => sound.play('pickup'),
    });

    this.controlButtons = this.controlSpecs.map((spec) => {
      const node = button(typeof spec.label === 'function' ? spec.label() : spec.label,
        spec.className ?? '', () => spec.onClick());
      this.controlsEl.appendChild(node);
      return { spec, node };
    });
  }

  mount() {
    screen.replaceChildren(this.root);
    this.refresh({ animate: false });
  }

  setSubtitle(text) {
    this.subtitle = text;
    this.subtitleEl.textContent = text;
  }

  setFrozen(frozen) {
    this.frozen = frozen;
    this.refresh({ animate: false });
  }

  /** Turn the board by hand. Passing null goes back to the automatic choice. */
  setOrientationOverride(color) {
    this.orientationOverride = color;
    this.refresh({ animate: false });
  }

  /** Which way round the board should face right now. */
  _orientation(status) {
    if (this.orientationOverride !== null) return this.orientationOverride;
    if (this.myColor !== null) return this.myColor;
    // Hot-seat: face whoever is up, but stop turning once the game is over so
    // the final position stays put.
    if (this.bothSides && !status.over) return this.game.turn;
    return this.board.orientation;
  }

  /**
   * Redraw everything from the game.
   *
   * One code path decides what the screen says, for all three modes. A mode
   * changes the game and calls this; it never reaches in and adjusts a label.
   */
  refresh({ animate = true } = {}) {
    const game = this.game;
    const status = game.status();

    this.board.setOrientation(this._orientation(status));
    this.board.setPosition(game.position, { lastMove: game.lastMove, animate });

    const mayMove = !status.over && !this.frozen &&
      (this.bothSides || this.myColor === game.turn);
    this.board.setMovableColor(mayMove ? game.turn : null);

    this.statusText.textContent = status.text;
    this.statusEl.classList.toggle('status--check', status.state === 'check');
    this.statusEl.classList.toggle('status--over', status.over);
    this.subtitleEl.textContent = this.subtitle;

    const captures = game.captures();
    for (const color of ['w', 'b']) {
      const dog = this.dogs[color];
      dog.setTreats(captures[color].pieces.length);
      dog.setTray(captures[color].pieces, captures[color].lead);
      dog.setActive(!status.over && game.turn === color);
      if (status.over) {
        if (status.winner === null) dog.setMood('drew');
        else dog.setMood(status.winner === color ? 'won' : 'lost');
      } else if (dog.mood !== 'think') {
        dog.setMood('calm');
      }
    }

    for (const { spec, node } of this.controlButtons) {
      if (typeof spec.label === 'function') node.textContent = spec.label();
      node.disabled = spec.enabled ? !spec.enabled() : false;
    }

    announce(status.text);
  }

  /** Let go of everything that outlives the screen. */
  destroy() {
    this.board.destroy();
  }

  /**
   * Send a treat arcing into the bowl of whoever made the capture.
   *
   * En passant takes a pawn that was never on the destination square, so the
   * treat has to start from where the pawn actually stood.
   */
  celebrateCapture(move) {
    let square = move.to;
    if (move.flag === 'ep') {
      const forward = move.piece.color === 'w' ? 1 : -1;
      const file = move.to % 8;
      const rank = (7 - (move.to >> 3)) - forward;
      square = (7 - rank) * 8 + file;
    }
    this.dogs[move.piece.color].throwTreat(this.board.squares[square]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hot-seat
// ─────────────────────────────────────────────────────────────────────────────

function renderHotSeat() {
  const game = new Game();

  const view = new GameView({
    game,
    bothSides: true,
    names: { w: 'Biscuit', b: 'Pepper' },
    controls: [
      {
        label: 'New game',
        className: 'btn--primary',
        onClick: () => {
          game.reset();
          view.setOrientationOverride(null);
          announce('New game. White to move.');
        },
      },
      {
        label: 'Undo',
        onClick: () => {
          if (!game.undo()) return;
          view.refresh({ animate: false });
          announce(`Move taken back. ${game.status().text}.`);
        },
        enabled: () => game.canUndo(),
      },
      {
        label: 'Flip board',
        onClick: () => {
          const now = view.board.orientation;
          view.setOrientationOverride(now === 'w' ? 'b' : 'w');
        },
      },
    ],
    onMove: (move) => {
      game.play(move);
      view.refresh();
      if (move.captured !== null) view.celebrateCapture(move);
    },
  });

  setTopbar(button('← Menu', 'btn--quiet', () => { window.location.hash = '#/'; }));

  view.mount();
  announce('Hot-seat game. White to move.');
  return view;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vs Computer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long the computer pauses before answering, at the very least.
 *
 * At depth 2 it decides in a few tens of milliseconds, which reads as a bug
 * rather than as cleverness — the piece appears to move before you have let go
 * of yours. A short, deliberate pause with the dog tilting his head makes it
 * feel like an opponent.
 */
const MINIMUM_THINK_MS = 400;

function renderSidePicker() {
  setTopbar(button('← Menu', 'btn--quiet', () => { window.location.hash = '#/'; }));

  const card = el('div', 'card');
  card.append(
    el('h2', null, 'Which side would you like?'),
    el('p', 'note', 'White moves first. Choose Black and the computer opens.'),
  );

  const row = el('div', 'choice-row');
  for (const [color, label] of [['w', 'Play as White'], ['b', 'Play as Black']]) {
    const choice = el('button', `side-choice side-choice--${color}`);
    choice.type = 'button';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#piece-k');
    svg.appendChild(use);
    choice.append(svg, el('span', null, label));
    choice.addEventListener('click', () => { window.location.hash = `#/vs/${color}`; });
    row.appendChild(choice);
  }

  card.appendChild(row);
  screen.replaceChildren(card);
  announce('Playing the computer. Choose White or Black.');
}

function renderVsComputer(side) {
  const computer = side === 'w' ? 'b' : 'w';
  const game = new Game();

  /** Timers in flight, so leaving the screen can cancel them. */
  let pending = [];
  let alive = true;
  const later = (fn, ms) => { pending.push(setTimeout(fn, ms)); };

  const view = new GameView({
    game,
    myColor: side,
    names: {
      w: side === 'w' ? 'Biscuit' : 'Rufus',
      b: side === 'b' ? 'Biscuit' : 'Rufus',
    },
    controls: [
      {
        label: 'New game',
        className: 'btn--primary',
        onClick: () => { window.location.hash = '#/vs'; },
      },
      {
        label: 'Flip board',
        onClick: () => {
          const now = view.board.orientation;
          view.setOrientationOverride(now === 'w' ? 'b' : 'w');
        },
      },
    ],
    onMove: (move) => {
      game.play(move);
      playMoveSound(move, game.status().state);
      view.refresh();
      if (move.captured !== null) view.celebrateCapture(move);
      takeComputerTurn();
    },
  });

  /**
   * The computer's turn.
   *
   * The search itself is fast enough to run straight through, but it is started
   * from a timer rather than inline so the browser gets a chance to paint the
   * player's own move first. Otherwise both moves appear at once and the board
   * looks like it skipped a beat.
   */
  function takeComputerTurn() {
    if (!alive) return;
    const status = game.status();
    if (status.over || game.turn !== computer) return;

    view.setSubtitle('Thinking…');
    view.dogs[computer].setMood('think');
    view.setFrozen(true);

    later(() => {
      if (!alive) return;
      const startedAt = Date.now();
      const move = chooseMove(game.position, { depth: 2 });
      const took = Date.now() - startedAt;

      if (move === null) {
        // gameStatus already said the game was over; nothing to do.
        view.setSubtitle('');
        view.dogs[computer].setMood('calm');
        view.setFrozen(false);
        return;
      }

      later(() => {
        if (!alive) return;
        game.play(move);
        playMoveSound(move, game.status().state);
        view.setSubtitle('');
        view.dogs[computer].setMood('calm');
        view.frozen = false;
        view.refresh();
        if (move.captured !== null) view.celebrateCapture(move);
      }, Math.max(0, MINIMUM_THINK_MS - took));
    }, 30);
  }

  setTopbar(button('← Menu', 'btn--quiet', () => { window.location.hash = '#/'; }));

  view.mount();
  announce(`Playing the computer as ${side === 'w' ? 'White' : 'Black'}.`);

  // If the player took Black, the computer opens.
  if (game.turn === computer) takeComputerTurn();

  const viewDestroy = view.destroy.bind(view);
  view.destroy = () => {
    alive = false;
    for (const id of pending) clearTimeout(id);
    pending = [];
    viewDestroy();
  };

  return view;
}

// ─────────────────────────────────────────────────────────────────────────────
// Online — the code entry screen
// ─────────────────────────────────────────────────────────────────────────────

function renderRoomEntry() {
  setTopbar(button('← Menu', 'btn--quiet', () => { window.location.hash = '#/'; }));

  const card = el('div', 'card');
  card.append(
    el('h2', null, 'Play a friend online'),
    el('p', 'note', 'Both of you type the same code. The first one in plays White, the second plays Black, and anyone else can watch.'),
  );

  const field = el('div', 'field');
  const label = el('label', null, 'Room code');
  label.htmlFor = 'room-code';
  const input = document.createElement('input');
  input.id = 'room-code';
  input.name = 'room-code';
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = 12;
  input.value = suggestRoomCode();
  input.setAttribute('aria-describedby', 'room-code-help');
  const help = el('p', 'note', 'Letters and numbers, at least three. We picked one for you — change it if you like.');
  help.id = 'room-code-help';
  field.append(label, input, help);

  const go = button('Open this room', 'btn--primary', () => {
    const code = normaliseRoomCode(input.value);
    if (code.length < 3) {
      help.textContent = 'That code is too short — it needs at least three letters or numbers.';
      help.classList.add('note--warn');
      input.focus();
      return;
    }
    window.location.hash = `#/online/${code}`;
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); go.click(); }
  });

  card.append(field, go);
  screen.replaceChildren(card);
  input.focus();
  input.select();
  announce('Type a room code, or use the one suggested.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Online — the game
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_COLOUR = { white: 'w', black: 'b' };

function renderOnlineGame(roomCode) {
  const game = new Game();
  let role = null;          // 'white' | 'black' | 'spectator'
  let connection = 'connecting';
  let seats = { whiteTaken: false, blackTaken: false, whiteHere: false, blackHere: false, watching: 0 };
  let lastError = '';
  /** So a redraw for some other reason does not replay the last move's sound. */
  let previousMoveUci = null;

  const view = new GameView({
    game,
    myColor: null,          // set once the server tells us our seat
    names: { w: 'Biscuit', b: 'Pepper' },
    controls: [
      {
        label: 'New game',
        className: 'btn--primary',
        onClick: () => room.send('newgame'),
        enabled: () => role === 'white' || role === 'black',
      },
      {
        label: 'Resign',
        className: 'btn--danger',
        onClick: () => {
          if (window.confirm('Resign this game? Your opponent wins.')) room.send('resign');
        },
        enabled: () => (role === 'white' || role === 'black') && !game.status().over,
      },
      {
        label: 'Copy link',
        onClick: async () => {
          const link = `${location.origin}/#/online/${roomCode}`;
          try {
            await navigator.clipboard.writeText(link);
            announce('Room link copied.');
            view.setSubtitle('Link copied — send it to your friend.');
          } catch {
            // Clipboard refused, which browsers do in plenty of situations.
            // Showing the link is more use than an apology.
            view.setSubtitle(link);
          }
        },
      },
    ],
    onMove: (move) => {
      // Send it and wait. The board does not change until the server says so —
      // that is what it means for the server to decide every move.
      room.send('move', { uci: moveUci(move) });
    },
  });

  /** UCI for a move, matching what rules.js produces. */
  function moveUci(move) {
    const FILES = 'abcdefgh';
    const name = (i) => FILES[i % 8] + String(8 - (i >> 3));
    return name(move.from) + name(move.to) + (move.promotion ?? '');
  }

  /** One sentence describing where we stand, above the chess itself. */
  function describe() {
    if (connection === 'connecting') return 'Connecting…';
    if (connection === 'reconnecting') return 'Reconnecting…';
    if (connection === 'closed') return 'Disconnected.';
    if (lastError) return lastError;
    if (role === 'spectator') return `Watching · room ${roomCode}`;
    const youAre = role === 'white' ? 'You are White' : 'You are Black';
    const opponent = role === 'white' ? seats.blackHere : seats.whiteHere;
    if (!opponent) return `${youAre} · waiting for a second player…`;
    return `${youAre} · room ${roomCode}`;
  }

  const room = new RoomConnection(roomCode, {
    onWelcome: ({ role: seat }) => {
      role = seat;
      view.myColor = ROLE_COLOUR[seat] ?? null;
      // A spectator watches from White's side; a player from their own.
      view.setOrientationOverride(ROLE_COLOUR[seat] ?? 'w');
      view.setSubtitle(describe());
      view.refresh({ animate: false });
      announce(seat === 'spectator' ? 'You are watching this game.' : `You are ${seat}.`);
    },

    onState: (payload) => {
      lastError = '';
      seats = payload.seats;

      // Rebuild the whole game from what the server sent. Replaying the moves
      // rather than only loading the position is what makes the captured-piece
      // tray and Biscuit's treat count exact after a refresh instead of guessed.
      const rebuilt = Game.fromRecord(payload.fen, payload.moves ?? []);
      game.position = rebuilt.position;
      game.history = rebuilt.history;
      game.resignedBy = payload.resignedBy ?? null;

      view.setSubtitle(describe());
      view.refresh();

      const last = game.lastMove;
      if (last && last.uci !== previousMoveUci) {
        previousMoveUci = last.uci;
        playMoveSound(last, game.status().state);
        if (last.captured !== null) view.celebrateCapture(last);
      }
    },

    onError: ({ message }) => {
      // The server refused something. Say so, and redraw from the truth we hold
      // so the board cannot be left showing a move that did not happen.
      lastError = message;
      view.setSubtitle(message);
      view.refresh({ animate: false });
      announce(message);
    },

    onStatus: (state) => {
      connection = state;
      // Lock the board whenever we are not connected: a move made now would go
      // nowhere, and letting it look as though it worked would be a lie.
      view.frozen = state !== 'open';
      view.setSubtitle(describe());
      view.refresh({ animate: false });
    },
  });

  setTopbar(button('← Menu', 'btn--quiet', () => { window.location.hash = '#/'; }));

  view.mount();
  view.setSubtitle(describe());
  announce(`Room ${roomCode}. Connecting.`);

  const viewDestroy = view.destroy.bind(view);
  view.destroy = () => {
    room.close();
    viewDestroy();
  };

  return view;
}

// ─────────────────────────────────────────────────────────────────────────────
// Routing
// ─────────────────────────────────────────────────────────────────────────────

/** Whatever is currently on screen, so it can be torn down cleanly. */
let current = null;

function route() {
  if (current && typeof current.destroy === 'function') current.destroy();
  current = null;

  const hash = window.location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);

  switch (parts[0]) {
    case undefined:
      renderHome();
      break;
    case 'hotseat':
      current = renderHotSeat();
      break;
    case 'vs':
      if (parts[1] === 'w' || parts[1] === 'b') current = renderVsComputer(parts[1]);
      else renderSidePicker();
      break;
    case 'online': {
      const code = normaliseRoomCode(parts[1] ?? '');
      if (code.length >= 3) current = renderOnlineGame(code);
      else renderRoomEntry();
      break;
    }
    default:
      window.location.hash = '#/';
  }
}

window.addEventListener('hashchange', route);
route();

/**
 * Browsers will not let a page make a sound until the person has interacted
 * with it. So rather than trying at load — which fails silently — the audio is
 * woken by the first click or key press, and only if a switch is already on
 * from a previous visit.
 */
function wakeAudioOnFirstInteraction() {
  const wake = async () => {
    if (sound.sfxOn || sound.musicOn) {
      await sound.unlock();
      if (sound.musicOn) await sound.startMusic();
    }
  };
  document.addEventListener('pointerdown', wake, { once: true });
  document.addEventListener('keydown', wake, { once: true });
}
wakeAudioOnFirstInteraction();
