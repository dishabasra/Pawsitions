/**
 * board.js — drawing the board and letting a person move a piece on it.
 *
 * This module knows nothing about whose turn it is, what mode is being played,
 * or where a move goes next. It shows a position, it lets the player pick a
 * piece up and put it down on a square the rules allow, and it tells whoever is
 * listening which move was chosen. Everything else is app.js's business.
 *
 * The important property: it can only ever report a legal move. It asks
 * rules.js which squares a piece may go to and draws a dot on exactly those, and
 * a drop on any other square is thrown away. There is no path through this file
 * that produces a move the rules did not first offer.
 */

import {
  movesFrom, indexToSquare, PROMOTION_TYPES, findKing, isInCheck, opposite,
} from './rules.js';

const PIECE_NAMES = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};
const COLOUR_NAMES = { w: 'white', b: 'black' };
const FILES = 'abcdefgh';

/** How far the pointer must travel before a press counts as a drag, in pixels. */
const DRAG_THRESHOLD = 6;

/** `<svg class="piece"><use href="#piece-n"></use></svg>` */
function pieceSvg(piece, extraClass = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `piece ${extraClass}`.trim());
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#piece-${piece.type}`);
  svg.appendChild(use);
  return svg;
}

/** "e4, white knight" or "e4, empty" — what a screen reader reads out. */
function squareLabel(square, piece) {
  const name = indexToSquare(square);
  if (piece === null) return `${name}, empty`;
  return `${name}, ${COLOUR_NAMES[piece.color]} ${PIECE_NAMES[piece.type]}`;
}

export class Board {
  /**
   * @param {HTMLElement} element  an empty container
   * @param {object} options
   *   onMove(move)      called when the player completes a legal move
   *   onPickUp(square)  optional, for sound
   */
  constructor(element, { onMove = () => {}, onPickUp = () => {}, moveFilter = null } = {}) {
    this.root = element;
    this.onMove = onMove;
    this.onPickUp = onPickUp;
    /**
     * An optional last word on which moves may be offered. Treat Mode uses it to
     * remove captures of a shielded piece. Left null, the board offers exactly
     * what rules.js returned.
     */
    this.moveFilter = moveFilter;
    /** Set while the player is choosing a square rather than making a move. */
    this.picking = null;

    this.position = null;
    this.orientation = 'w';
    /** Which colour this person is allowed to move; null means nobody. */
    this.movableColor = null;
    this.selected = null;
    this.legalForSelected = [];
    this.lastMove = null;
    this.cursor = 60;            // the keyboard cursor, starting on e1
    this.drag = null;
    this.promotionPending = null;
    /** A move being pointed at by Sniff, or null. */
    this.hinted = null;
    this._hintTimer = null;
    /**
     * Squares holding a shielded piece. The board owns this rather than being
     * painted from outside, so that a redraw it does on its own — selecting a
     * piece, say — cannot lose the markers, and so that a square a shielded
     * piece has moved off cannot keep one.
     */
    this.shielded = [];
    /** True when the press that is in flight is what selected the piece. */
    this.selectedOnPress = false;

    this.root.classList.add('board');
    this.root.setAttribute('role', 'grid');
    this.root.setAttribute('aria-label', 'Chess board');

    this.squares = [];
    for (let i = 0; i < 64; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sq';
      button.setAttribute('role', 'gridcell');
      button.tabIndex = -1;
      this.squares.push(button);
    }

    this._bindEvents();
    this._layout();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Drawing
  // ───────────────────────────────────────────────────────────────────────────

  /** Put the squares into the grid in the current orientation. */
  _layout() {
    this.root.replaceChildren();
    for (let display = 0; display < 64; display++) {
      const square = this._displayToSquare(display);
      const button = this.squares[square];

      const file = square % 8;
      const rank = 8 - (square >> 3);
      button.classList.toggle('sq--dark', ((square >> 3) + file) % 2 === 1);

      // Coordinates are printed down one edge and along the other, as on a real
      // board — and which edge that is depends on which way round we are sitting.
      const showFile = this.orientation === 'w' ? rank === 1 : rank === 8;
      const showRank = this.orientation === 'w' ? file === 0 : file === 7;
      button.replaceChildren();
      if (showFile) {
        const span = document.createElement('span');
        span.className = 'sq-coord sq-coord--file';
        span.textContent = FILES[file];
        button.appendChild(span);
      }
      if (showRank) {
        const span = document.createElement('span');
        span.className = 'sq-coord sq-coord--rank';
        span.textContent = String(rank);
        button.appendChild(span);
      }

      this.root.appendChild(button);
    }
  }

  /** Grid slot → square index. Flipped when Black is at the bottom. */
  _displayToSquare(display) {
    return this.orientation === 'w' ? display : 63 - display;
  }

  /**
   * Show a position.
   *
   * When `animate` is true and a move is given, the moved piece slides from
   * where it was. The technique is to draw the new board, then immediately
   * shift the moved piece back to its old place and let CSS carry it forward —
   * so the animation always agrees with the real position, rather than being a
   * separate thing that could disagree with it.
   */
  setPosition(position, { lastMove = null, animate = false } = {}) {
    const previous = this.position;
    this.position = position;
    this.lastMove = lastMove;
    this.selected = null;
    this.legalForSelected = [];
    this._render();

    if (animate && lastMove && previous) this._slide(lastMove);
  }

  setOrientation(color) {
    if (this.orientation === color) return;
    this.orientation = color;
    this._layout();
    this._render();
  }

  /** Which colour this person may pick up. null locks the board. */
  setMovableColor(color) {
    this.movableColor = color;
    this._render();
  }

  _render() {
    if (this.position === null) return;
    const board = this.position.board;

    // A king in check gets a pulse — but only the one actually in check.
    let checkedKing = -1;
    for (const color of ['w', 'b']) {
      if (isInCheck(this.position, color)) checkedKing = findKing(this.position, color);
    }

    for (let square = 0; square < 64; square++) {
      const button = this.squares[square];
      const piece = board[square];

      // Keep the coordinate labels, replace everything else.
      for (const child of [...button.children]) {
        if (!child.classList.contains('sq-coord')) child.remove();
      }

      button.classList.remove(
        'sq--w', 'sq--b', 'sq--playable', 'sq--selected', 'sq--last',
        'sq--check', 'sq--dragging', 'sq--shielded',
      );

      if (piece !== null) {
        button.classList.add(piece.color === 'w' ? 'sq--w' : 'sq--b');
        button.appendChild(pieceSvg(piece));
      }

      button.classList.remove('sq--pickable', 'sq--hinted');

      if (this.picking) {
        if (piece !== null && piece.color === this.picking.color) {
          button.classList.add('sq--pickable', 'sq--playable');
        }
      } else {
        const mine = piece !== null && piece.color === this.movableColor && piece.color === this.position.turn;
        if (mine) button.classList.add('sq--playable');
      }

      if (this.hinted && (square === this.hinted.from || square === this.hinted.to)) {
        button.classList.add('sq--hinted');
      }

      if (this.shielded.includes(square)) button.classList.add('sq--shielded');

      if (square === this.selected) button.classList.add('sq--selected');
      if (this.lastMove && (square === this.lastMove.from || square === this.lastMove.to)) {
        button.classList.add('sq--last');
      }
      if (square === checkedKing) button.classList.add('sq--check');

      button.setAttribute('aria-label', squareLabel(square, piece));
      button.disabled = false;
    }

    this._syncCursor();

    // Dots on every square the selected piece may reach.
    for (const move of this.legalForSelected) {
      const target = this.squares[move.to];
      if (target.querySelector('.move-hint')) continue; // promotions share a square
      const hint = document.createElement('span');
      const capture = board[move.to] !== null || move.flag === 'ep';
      hint.className = `move-hint${capture ? ' move-hint--capture' : ''}`;
      hint.appendChild(document.createElement('i'));
      target.appendChild(hint);
      target.classList.add('sq--playable');
    }
  }

  _slide(move) {
    const from = this.squares[move.from].getBoundingClientRect();
    const to = this.squares[move.to].getBoundingClientRect();
    const piece = this.squares[move.to].querySelector('svg.piece');
    if (!piece) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    piece.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
    requestAnimationFrame(() => {
      piece.classList.add('piece--sliding');
      piece.style.transform = '';
      piece.addEventListener('transitionend', () => {
        piece.classList.remove('piece--sliding');
      }, { once: true });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Picking a piece up and putting it down
  // ───────────────────────────────────────────────────────────────────────────

  _squareOf(target) {
    const button = target.closest('.sq');
    if (!button) return -1;
    return this.squares.indexOf(button);
  }

  _canPickUp(square) {
    if (this.position === null || this.movableColor === null || this.promotionPending) return false;
    const piece = this.position.board[square];
    return piece !== null && piece.color === this.movableColor && piece.color === this.position.turn;
  }

  /** The moves this board will offer from a square, after any filter. */
  _offeredFrom(square) {
    const moves = movesFrom(this.position, square);
    return this.moveFilter ? this.moveFilter(moves) : moves;
  }

  /** Which squares hold a shielded piece. */
  setShields(squares) {
    this.shielded = squares;
    this._render();
  }

  setMoveFilter(fn) {
    this.moveFilter = fn;
    if (this.selected !== null) {
      this.legalForSelected = this._offeredFrom(this.selected);
      this._render();
    }
  }

  _select(square) {
    const moves = this._offeredFrom(square);
    if (moves.length === 0) {
      // Tell the player *why* nothing happened, rather than ignoring the click.
      this.selected = null;
      this.legalForSelected = [];
      this._render();
      const button = this.squares[square];
      button.classList.add('sq--refuse');
      button.addEventListener('animationend', () => button.classList.remove('sq--refuse'), { once: true });
      return false;
    }
    this.selected = square;
    this.legalForSelected = moves;
    this.cursor = square;
    this._render();
    this.onPickUp(square);
    return true;
  }

  _deselect() {
    this.selected = null;
    this.legalForSelected = [];
    this._render();
  }

  /**
   * Try to finish a move on `to`. Returns true if something happened.
   *
   * A destination can carry more than one move — a promoting pawn has four,
   * differing only in what it becomes — in which case the player is asked.
   */
  _tryComplete(to) {
    const candidates = this.legalForSelected.filter((m) => m.to === to);
    if (candidates.length === 0) return false;

    if (candidates.length > 1 && candidates[0].promotion !== null) {
      this._askPromotion(candidates);
      return true;
    }

    const move = candidates[0];
    this._deselect();
    this.onMove(move);
    return true;
  }

  /**
   * Ask the player to point at one of their own pieces — used by Shield.
   *
   * While this is running the board does not move anything; a click picks a
   * square and hands it back. Escape, or a click on anything else, cancels.
   */
  beginPick({ color, onPick, onCancel = () => {} }) {
    this._deselect();
    this.picking = { color, onPick, onCancel };
    this._render();
  }

  cancelPick() {
    if (!this.picking) return;
    const { onCancel } = this.picking;
    this.picking = null;
    this._render();
    onCancel();
  }

  _bindEvents() {
    this.root.addEventListener('click', (event) => {
      if (this.promotionPending) return;
      const square = this._squareOf(event.target);
      if (square === -1) return;

      // Choosing a square for a power-up, rather than making a move.
      if (this.picking) {
        const piece = this.position.board[square];
        if (piece !== null && piece.color === this.picking.color) {
          const { onPick } = this.picking;
          this.picking = null;
          this._render();
          onPick(square);
        } else {
          this.cancelPick();
        }
        return;
      }

      // Pressing down on a piece already selects it, so the click that follows
      // must not immediately undo that. Only a *second* click on the same piece
      // puts it back down.
      const selectedByThisPress = this.selectedOnPress;
      this.selectedOnPress = false;

      if (this.selected !== null) {
        if (square === this.selected) {
          if (!selectedByThisPress) this._deselect();
          return;
        }
        if (this._tryComplete(square)) return;
      }

      // First click: pick a piece up.
      if (this._canPickUp(square)) this._select(square);
      else this._deselect();
    });

    // Dragging. Pointer events cover mouse, touch and pen with one code path.
    this.root.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      if (this.promotionPending || this.picking) return;
      const square = this._squareOf(event.target);
      if (square === -1 || !this._canPickUp(square)) return;

      if (this.selected !== square) {
        if (!this._select(square)) return;
        this.selectedOnPress = true;
      }

      const piece = this.position.board[square];
      const rect = this.squares[square].getBoundingClientRect();

      const ghost = pieceSvg(piece, 'piece-ghost');
      ghost.style.width = `${rect.width * 0.8}px`;
      ghost.style.height = `${rect.height * 0.8}px`;
      const holder = document.createElement('div');
      holder.className = `sq--${piece.color} drag-holder`;
      holder.style.position = 'fixed';
      holder.style.left = '0';
      holder.style.top = '0';
      holder.style.zIndex = '50';
      holder.style.pointerEvents = 'none';
      holder.appendChild(ghost);
      document.body.appendChild(holder);

      this.drag = {
        square, holder,
        size: rect.width * 0.8,
        startX: event.clientX, startY: event.clientY,
        moved: false,
      };
      this.squares[square].classList.add('sq--dragging');
      this.root.classList.add('board--dragging');
      this._moveGhost(event);
    });

    this._onPointerMove = (event) => {
      if (!this.drag) return;
      // A few pixels of movement between pressing and releasing is a click, not
      // a drag. Without this threshold a slightly shaky hand turns "put this
      // piece back down" into a drag that landed nowhere.
      if (!this.drag.moved) {
        const dx = event.clientX - this.drag.startX;
        const dy = event.clientY - this.drag.startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        this.drag.moved = true;
      }
      this._moveGhost(event);
    };

    this._onPointerEnd = (event) => {
      if (!this.drag) return;
      const { holder, square, moved } = this.drag;
      holder.remove();
      this.squares[square].classList.remove('sq--dragging');
      this.root.classList.remove('board--dragging');
      this.drag = null;

      if (!moved) return; // a plain click; the click handler deals with it

      // Where did it land? Not event.target — during a capture the pointer is
      // captured by the board, so we have to ask the document.
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const to = under ? this._squareOf(under) : -1;
      if (to === -1 || !this._tryComplete(to)) {
        // Dropped somewhere that is not a legal destination — including off the
        // board entirely. Put it back and leave it selected.
        this._render();
      }
    };

    // On the window rather than the board: a drag that leaves the board still
    // has to end somewhere, and pointer capture is not an option here — it
    // retargets the click event that follows to the capturing element, which
    // would hide from the click handler which square was pressed.
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerEnd);
    window.addEventListener('pointercancel', this._onPointerEnd);

    this.root.addEventListener('focusin', (event) => {
      const square = this._squareOf(event.target);
      if (square === -1 || square === this.cursor) return;
      this.cursor = square;
      this._syncCursor();
    });

    this.root.addEventListener('keydown', (event) => this._onKeyDown(event));
  }

  /**
   * Point the roving tabstop at the cursor square.
   *
   * Exactly one square is ever tabbable, so Tab moves into and out of the board
   * as a single stop rather than needing 64 presses to get past it.
   */
  _syncCursor() {
    for (let i = 0; i < 64; i++) {
      this.squares[i].tabIndex = i === this.cursor ? 0 : -1;
      this.squares[i].classList.toggle('sq--cursor', i === this.cursor && this.squares[i] === document.activeElement);
    }
  }

  _moveGhost(event) {
    const { holder, size } = this.drag;
    holder.style.transform = `translate(${event.clientX - size / 2}px, ${event.clientY - size / 2}px)`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Keyboard play
  // ───────────────────────────────────────────────────────────────────────────

  _onKeyDown(event) {
    if (this.promotionPending) return;

    // While picking a square, Enter and Space are handled as clicks on the
    // focused button, which the click handler above already deals with.

    const steps = {
      ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    };

    if (event.key in steps) {
      event.preventDefault();
      let [df, dr] = steps[event.key];
      if (this.orientation === 'b') { df = -df; dr = -dr; }
      const file = (this.cursor % 8) + df;
      const rank = (7 - (this.cursor >> 3)) + dr;
      if (file < 0 || file > 7 || rank < 0 || rank > 7) return;
      this.cursor = (7 - rank) * 8 + file;
      this._render();
      this.squares[this.cursor].focus();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.picking) this.cancelPick();
      else this._deselect();
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const rank = this.cursor >> 3;
      this.cursor = rank * 8 + (event.key === 'Home' ? 0 : 7);
      this._render();
      this.squares[this.cursor].focus();
    }
    // Space and Enter arrive as a click on the focused button, which the click
    // handler above already does the right thing with.
  }

  /**
   * Point at a move for a few seconds — what Sniff does with the engine's
   * suggestion. Purely a highlight; it does not play anything.
   */
  showHint(move, milliseconds = 5000) {
    clearTimeout(this._hintTimer);
    this.hinted = { from: move.from, to: move.to };
    this._render();
    this._hintTimer = setTimeout(() => {
      this.hinted = null;
      this._render();
    }, milliseconds);
  }

  /**
   * Let go of the window-level listeners.
   *
   * Called when the screen changes. Without it every game left behind a pair of
   * listeners that would keep responding to drags on a board no longer shown.
   */
  destroy() {
    clearTimeout(this._hintTimer);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerEnd);
    window.removeEventListener('pointercancel', this._onPointerEnd);
    if (this.drag) { this.drag.holder.remove(); this.drag = null; }
  }

  /** Move keyboard focus onto the board. */
  focus() {
    this.squares[this.cursor].focus();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Promotion
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Ask which piece the pawn becomes.
   *
   * Defaulting to a queen without asking would be simpler and is what many
   * implementations do, but underpromotion is part of legal chess — sometimes a
   * knight is the only move that works — so the choice is always offered.
   */
  _askPromotion(candidates) {
    const colour = candidates[0].piece.color;

    const backdrop = document.createElement('div');
    backdrop.className = 'promo-backdrop';

    const panel = document.createElement('div');
    panel.className = `promo sq--${colour}`;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Choose what your pawn becomes');

    const heading = document.createElement('h2');
    heading.textContent = 'Your pawn made it!';
    const blurb = document.createElement('p');
    blurb.textContent = 'What should it become?';

    const choices = document.createElement('div');
    choices.className = 'promo-choices';

    const buttons = [];
    for (const type of PROMOTION_TYPES) {
      const move = candidates.find((m) => m.promotion === type);
      if (!move) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'promo-choice';
      button.setAttribute('aria-label', PIECE_NAMES[type]);
      button.appendChild(pieceSvg({ type, color: colour }));
      button.addEventListener('click', () => finish(move));
      choices.appendChild(button);
      buttons.push(button);
    }

    panel.append(heading, blurb, choices);
    backdrop.appendChild(panel);
    this.root.appendChild(backdrop);
    this.promotionPending = backdrop;
    buttons[0].focus();

    const cancel = () => {
      // Escape puts the pawn back. The move is abandoned entirely — it is never
      // silently completed as a queen.
      close();
      this._deselect();
    };

    const close = () => {
      backdrop.remove();
      this.promotionPending = null;
      document.removeEventListener('keydown', onKey, true);
    };

    const finish = (move) => {
      close();
      this._deselect();
      this.onMove(move);
    };

    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
      const index = buttons.indexOf(document.activeElement);
      if (index === -1) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        buttons[(index + 1) % buttons.length].focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        buttons[(index - 1 + buttons.length) % buttons.length].focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) cancel();
    });
  }
}
