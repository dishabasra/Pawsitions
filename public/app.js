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
import { Meadow, buildDog, stageFor, treatsToNextStage } from './dog.js';
import { Game } from './game.js';
import { chooseMove } from './engine.js';
import { RoomConnection, suggestRoomCode, normaliseRoomCode } from './online.js';
import { sound, playMoveSound } from './audio.js';
import { startBackdrop } from './backdrop.js';
import {
  emptyTreatState, applyShields, canUse, markUsed, raiseShield,
  lapseShield, followMove, TREAT_LABELS, TREAT_BLURBS,
} from './powerups.js';

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
 * Whether Treat Mode is wanted, remembered per device. Off unless asked for.
 */
const TREAT_KEY = 'pawsitions.treatMode';

function treatModeWanted() {
  try { return localStorage.getItem(TREAT_KEY) === 'on'; } catch { return false; }
}

function setTreatModeWanted(on) {
  try { localStorage.setItem(TREAT_KEY, on ? 'on' : 'off'); } catch { /* fine */ }
}

/** A labelled on/off switch. */
function switchControl({ title, blurb, isOn, onChange }) {
  const node = el('button', 'switch');
  node.type = 'button';
  const track = el('span', 'switch-track');
  const text = el('span', 'switch-text');
  text.append(el('strong', null, title), el('span', null, blurb));
  node.append(track, text);
  const paint = () => node.setAttribute('aria-pressed', String(isOn()));
  node.addEventListener('click', () => { onChange(!isOn()); paint(); });
  paint();
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

  // The same two settings can be changed from the home screen, so repaint these
  // whenever they move rather than letting the two views disagree.
  const stop = sound.onChange(() => { music.paint(); sfx.paint(); });
  wrap.addEventListener('DOMNodeRemovedFromDocument', stop);

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

  const dog = el('div', 'home-dog');
  dog.appendChild(buildDog(stageFor(6), 'w'));

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

  const settings = el('div', 'home-modes');

  settings.appendChild(switchControl({
    title: '♫  Calming music',
    blurb: 'A slow four-chord piano loop while you play. Off unless you want it.',
    isOn: () => sound.musicOn,
    onChange: (on) => sound.setMusic(on),
  }));

  settings.appendChild(switchControl({
    title: '♪  Move sounds',
    blurb: 'A soft tap on a move, a thud on a capture, a chime on check.',
    isOn: () => sound.sfxOn,
    onChange: (on) => sound.setSfx(on),
  }));

  settings.appendChild(switchControl({
    title: 'Treat Mode',
    blurb: 'Three one-use power-ups: Shield, Fetch and Sniff. Off means plain, legal chess.',
    isOn: treatModeWanted,
    onChange: setTreatModeWanted,
  }));

  const treatWrap = settings;

  view.append(dog, heading, blurb, modes, treatWrap);
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
    /** Treat Mode state, or a disabled one. Set by whichever mode owns it. */
    this.treats = emptyTreatState(false);
    /** What each power-up does when pressed, filled in by the mode. */
    this.treatActions = {};

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

    // The dogs do not live in the panel any more — they live on the grass at
    // the bottom of the screen. What stays here is the bookkeeping: who has
    // taken what, and who is ahead.
    this.meadow = new Meadow();
    this.dogs = {
      // Both dogs stay in the open ground under the board rather than under the
      // side panel, where they would spend most of their time hidden behind the
      // buttons — and clear of the edges, so a name pill or a bowl never runs
      // off screen on a narrow phone.
      w: this.meadow.addDog({ color: 'w', name: names.w, range: [13, 30], bowlAt: 6 }),
      b: this.meadow.addDog({ color: 'b', name: names.b, range: [40, 57], bowlAt: 64 }),
    };

    this.rows = {};
    for (const color of ['w', 'b']) {
      const row = el('section', `player player--${color}`);
      const chip = el('span', 'player-chip');
      const middle = el('div');
      const name = el('div', 'player-name', names[color]);
      const sub = el('div', 'player-sub');
      const tray = el('div', 'tray');
      middle.append(name, sub, tray);
      const score = el('span', 'player-score');
      row.append(chip, middle, score);
      this.rows[color] = { row, sub, tray, score };
    }

    this.controlsEl = el('div', 'controls');

    this.treatsEl = el('section', 'treats');
    this.treatsEl.hidden = true;

    this.panel.append(
      this.statusEl, this.subtitleEl,
      this.rows.w.row, this.rows.b.row,
      this.treatsEl,
      this.controlsEl,
    );
    this.root.append(boardArea, this.panel);

    this.board = new Board(this.boardEl, {
      onMove: (move) => this.onMove(move),
      onPickUp: () => sound.play('pickup'),
      // Treat Mode's last word on which moves may be offered. With it off this
      // hands back the array it was given, untouched.
      moveFilter: (moves) => applyShields(moves, this.treats),
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
    this.meadow.mount(document.body);
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
      const taken = captures[color];
      const dog = this.dogs[color];
      const row = this.rows[color];

      dog.setTreats(taken.pieces.length);
      dog.setActive(!status.over && game.turn === color);
      if (status.over) {
        dog.setMood(status.winner === null ? 'drew' : (status.winner === color ? 'won' : 'lost'));
      } else if (dog.mood !== 'think' && dog.mood !== 'eating') {
        dog.setMood('calm');
      }

      const stage = stageFor(taken.pieces.length);
      const left = treatsToNextStage(taken.pieces.length);
      row.row.classList.toggle('player--active', !status.over && game.turn === color);
      row.sub.textContent = left === null
        ? `${stage.name} · fully grown`
        : `${stage.name} · ${left} more ${left === 1 ? 'treat' : 'treats'} to grow`;
      row.score.textContent = taken.lead > 0 ? `+${taken.lead}` : '';

      row.tray.replaceChildren();
      for (const piece of taken.pieces) {
        const holder = el('span', `sq--${piece.color}`);
        holder.style.display = 'contents';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 48 48');
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', `#piece-${piece.type}`);
        svg.appendChild(use);
        holder.appendChild(svg);
        row.tray.appendChild(holder);
      }
      row.tray.setAttribute('aria-label',
        taken.pieces.length === 0 ? 'nothing captured yet' : `${taken.pieces.length} captured`);
    }

    for (const { spec, node } of this.controlButtons) {
      if (typeof spec.label === 'function') node.textContent = spec.label();
      node.disabled = spec.enabled ? !spec.enabled() : false;
    }

    this._renderTreats(status);

    // The board paints the shield markers itself, so that a redraw it does on
    // its own — selecting a piece, say — cannot lose them.
    this.board.setShields(
      [this.treats.shield.w, this.treats.shield.b].filter((sq) => sq !== null),
    );

    announce(status.text);
  }

  /** Let go of everything that outlives the screen. */
  destroy() {
    this.board.destroy();
    this.meadow.destroy();
  }

  /**
   * The Treat Mode panel: one button per power-up, for the side this person is
   * playing. Hidden entirely when Treat Mode is off, so a plain game shows no
   * trace of it.
   */
  _renderTreats(status) {
    if (!this.treats.enabled) {
      this.treatsEl.hidden = true;
      return;
    }
    this.treatsEl.hidden = false;

    const mine = this.bothSides ? this.game.turn : this.myColor;
    const head = el('div', 'treats-head');
    head.append(el('span', 'treats-title', 'Treat Mode'));

    const row = el('div', 'treats-row');
    for (const kind of Object.keys(this.treatActions)) {
      const node = el('button', 'treat-btn', TREAT_LABELS[kind]);
      node.type = 'button';
      node.title = TREAT_BLURBS[kind];
      node.setAttribute('aria-label', `${TREAT_LABELS[kind]} — ${TREAT_BLURBS[kind]}`);
      const usable = mine !== null && canUse(this.treats, mine, kind, {
        isMyTurn: this.bothSides || this.myColor === this.game.turn,
        gameOver: status.over,
      });
      node.disabled = !usable;
      node.addEventListener('click', () => this.treatActions[kind]());
      row.appendChild(node);
    }

    const note = el('p', 'treats-note',
      this.pendingTreatNote
        ?? (mine === null
          ? 'Watching — power-ups are for the players.'
          : 'One use each, per player, per game.'));

    this.treatsEl.replaceChildren(head, row, note);
  }

  setTreatNote(text) {
    this.pendingTreatNote = text;
    this.refresh({ animate: false });
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
    this.meadow.throwTreat(this.board.squares[square], this.dogs[move.piece.color]);
  }
}

/**
 * Give a view the three power-ups.
 *
 * `sideNow()` says whose power-ups the buttons belong to right now — in hot-seat
 * that changes with the turn; elsewhere it is fixed.
 *
 * `fetch` is left out where it makes no sense: online, taking back a move is not
 * one player's to decide.
 */
function wireTreats(view, game, { sideNow, afterChange, includeFetch = true, onSniff = null }) {
  const actions = {
    shield: () => {
      const side = sideNow();
      view.setTreatNote('Pick one of your pieces to shield. Escape to cancel.');
      view.board.beginPick({
        color: side,
        onPick: (square) => {
          if (!raiseShield(view.treats, side, square, game.position)) {
            view.setTreatNote('That is not one of your pieces.');
            return;
          }
          sound.play('promote');
          view.setTreatNote(null);
          afterChange();
        },
        onCancel: () => view.setTreatNote(null),
      });
    },

    sniff: () => {
      const side = sideNow();
      const suggestion = chooseMove(game.position, { depth: 2 });
      if (suggestion === null) return;
      markUsed(view.treats, side, 'sniff');
      view.board.showHint(suggestion, 5000);
      view.setTreatNote('Biscuit says: try the green squares.');
      sound.play('pickup');
      afterChange();
      setTimeout(() => view.setTreatNote(null), 5000);
    },
  };

  if (includeFetch) {
    actions.fetch = () => {
      const side = sideNow();
      // Two half-moves: yours, and the reply to it.
      if (!game.undo()) return;
      game.undo();
      markUsed(view.treats, side, 'fetch');
      view.setTreatNote('Fetched! Those two moves never happened.');
      sound.play('move');
      afterChange();
    };
  }

  if (onSniff) actions.sniff = onSniff;

  // A fixed order, so the buttons do not shuffle about between renders.
  view.treatActions = {};
  for (const kind of ['shield', 'fetch', 'sniff']) {
    if (actions[kind]) view.treatActions[kind] = actions[kind];
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
          view.treats = emptyTreatState(treatModeWanted());
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
      const mover = move.piece.color;
      game.play(move);
      // A shield follows its piece, and lapses when its owner's turn comes round
      // again — which, now this move is played, it has for the other side.
      followMove(view.treats, move);
      lapseShield(view.treats, mover === 'w' ? 'b' : 'w');
      playMoveSound(move, game.status().state);
      view.refresh();
      if (move.captured !== null) view.celebrateCapture(move);
    },
  });

  view.treats = emptyTreatState(treatModeWanted());
  wireTreats(view, game, {
    sideNow: () => game.turn,
    afterChange: () => view.refresh({ animate: false }),
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
 * Let the engine choose, but only from the moves it is actually allowed.
 *
 * With Treat Mode off this is just chooseMove. With a shield up, the engine is
 * asked for its choice and, if that move is not allowed, the best allowed move
 * is taken instead — so it never tries to capture through a shield.
 */
function pickFrom(allowed, position) {
  const wanted = chooseMove(position, { depth: 2 });
  if (wanted === null) return allowed[0] ?? null;
  const match = allowed.find(
    (m) => m.from === wanted.from && m.to === wanted.to && m.promotion === wanted.promotion,
  );
  if (match) return match;
  return allowed[Math.floor(Math.random() * allowed.length)];
}

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
      followMove(view.treats, move);
      lapseShield(view.treats, computer);
      playMoveSound(move, game.status().state);
      view.refresh();
      if (move.captured !== null) view.celebrateCapture(move);
      takeComputerTurn();
    },
  });

  view.treats = emptyTreatState(treatModeWanted());
  wireTreats(view, game, {
    sideNow: () => side,
    afterChange: () => view.refresh({ animate: false }),
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
      // The computer plays by the same rules, shields included: it chooses from
      // the filtered list, so it cannot take a piece the player has protected.
      const allowed = applyShields(game.legalMoves(), view.treats);
      const move = allowed.length === 0
        ? null
        : pickFrom(allowed, game.position);
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
        followMove(view.treats, move);
        lapseShield(view.treats, side);
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

  card.append(field, switchControl({
    title: 'Treat Mode',
    blurb: 'Power-ups for both players. Only changeable before the first move.',
    isOn: treatModeWanted,
    onChange: setTreatModeWanted,
  }), go);
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
  /** So a reconnection does not try to re-assert a preference mid-game. */
  let announcedPreference = false;

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
      // The first player to arrive sets the room's Treat Mode from their own
      // preference. The server refuses it once a move has been played, which is
      // exactly right: the second player joins the room as it already is, and a
      // reconnection cannot change the rules mid-game.
      if (seat === 'white' && !announcedPreference) {
        announcedPreference = true;
        room.send('treat', { kind: 'enable', on: treatModeWanted() });
      }
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
      // Treat Mode, like the position, is whatever the server says it is.
      if (payload.treats) view.treats = payload.treats;

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

  /**
   * Online power-ups are requests, not actions. The button asks; the server
   * decides and tells everybody. Fetch is not offered — taking back a move is
   * not one player's to decide. Sniff never leaves the browser, because it only
   * asks the engine running here and changes nothing anyone else can see.
   */
  view.treatActions = {
    shield: () => {
      const side = ROLE_COLOUR[role];
      if (!side) return;
      view.setTreatNote('Pick one of your pieces to shield. Escape to cancel.');
      view.board.beginPick({
        color: side,
        onPick: (square) => {
          view.setTreatNote(null);
          room.send('treat', { kind: 'shield', square });
        },
        onCancel: () => view.setTreatNote(null),
      });
    },
    sniff: () => {
      const side = ROLE_COLOUR[role];
      if (!side) return;
      const suggestion = chooseMove(game.position, { depth: 2 });
      if (suggestion === null) return;
      // Spent here rather than on the server, because the server never hears
      // about it — there is nothing it could meaningfully check.
      markUsed(view.treats, side, 'sniff');
      view.board.showHint(suggestion, 5000);
      view.setTreatNote('Biscuit says: try the green squares.');
      sound.play('pickup');
      view.refresh({ animate: false });
      setTimeout(() => view.setTreatNote(null), 5000);
    },
  };

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

startBackdrop();

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
