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
  topbarActions.replaceChildren();
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

    this.board = new Board(this.boardEl, { onMove: (move) => this.onMove(move) });

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

  topbarActions.replaceChildren(
    button('← Menu', 'btn--quiet', () => { window.location.hash = '#/'; }),
  );

  view.mount();
  announce('Hot-seat game. White to move.');
  return view;
}

// ─────────────────────────────────────────────────────────────────────────────
// Placeholders for the modes still to come
// ─────────────────────────────────────────────────────────────────────────────

function renderNotYet(title, detail) {
  topbarActions.replaceChildren(
    button('← Menu', 'btn--quiet', () => { window.location.hash = '#/'; }),
  );
  const card = el('div', 'card');
  card.append(el('h2', null, title), el('p', 'note', detail));
  card.appendChild(button('Back to the menu', 'btn--primary', () => { window.location.hash = '#/'; }));
  screen.replaceChildren(card);
  announce(`${title}. ${detail}`);
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
      renderNotYet('Playing the computer', 'This mode is being built next. Hot-seat works now.');
      break;
    case 'online':
      renderNotYet('Online rooms', 'This mode is being built. Hot-seat works now.');
      break;
    default:
      window.location.hash = '#/';
  }
}

window.addEventListener('hashchange', route);
route();
