/**
 * dog.js — Biscuit.
 *
 * A dog sits beside the board. Every piece his side captures is a treat in his
 * bowl, and enough treats make him grow up: puppy, then young dog, then Good
 * Dog. He tilts his head while the computer is thinking, perks up at check,
 * spins when he wins and lies down when he loses.
 *
 * He has no effect whatsoever on what moves are legal. He is watching, not
 * playing. Nothing in this file imports rules.js, and nothing in rules.js knows
 * he exists — which is the point: the chess stays provably correct no matter
 * what the dog does.
 */

const STAGES = [
  { at: 0, symbol: 'dog-1', name: 'puppy' },
  { at: 5, symbol: 'dog-2', name: 'young dog' },
  { at: 10, symbol: 'dog-3', name: 'good dog' },
];

/** Which stage a given number of treats earns. */
export function stageFor(treats) {
  let stage = STAGES[0];
  for (const candidate of STAGES) {
    if (treats >= candidate.at) stage = candidate;
  }
  return stage;
}

/** How many more treats until he grows, or null if he is fully grown. */
export function treatsToNextStage(treats) {
  const next = STAGES.find((s) => s.at > treats);
  return next ? next.at - treats : null;
}

function svg(symbol, className) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('class', className);
  el.setAttribute('viewBox', symbol === 'bowl' ? '0 0 48 24' : '0 0 64 64');
  el.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${symbol}`);
  el.appendChild(use);
  return el;
}

export class Dog {
  /**
   * @param {object} options
   *   color  'w' or 'b' — which side's dog this is
   *   name   what to call him
   */
  constructor({ color, name = 'Biscuit' }) {
    this.color = color;
    this.name = name;
    this.treats = 0;
    this.mood = 'calm';

    this.root = document.createElement('section');
    this.root.className = `dog-card dog-card--${color}`;
    this.root.setAttribute('aria-label', `${name}, playing ${color === 'w' ? 'White' : 'Black'}`);

    this.figure = svg(STAGES[0].symbol, 'dog-figure');

    const text = document.createElement('div');
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'dog-name';
    this.stageEl = document.createElement('div');
    this.stageEl.className = 'dog-stage';

    this.bowlEl = document.createElement('div');
    this.bowlEl.className = 'dog-bowl';

    text.append(this.nameEl, this.stageEl, this.bowlEl);
    this.root.append(this.figure, text);

    // The tray of captured pieces lives under the dog, because the pieces he ate
    // and the material he is up are the same fact counted twice.
    this.trayEl = document.createElement('div');
    this.trayEl.className = 'tray';
    text.appendChild(this.trayEl);

    this._render();
  }

  /** Set the treat count outright — used when rebuilding after a refresh. */
  setTreats(count) {
    const grew = stageFor(count).symbol !== stageFor(this.treats).symbol;
    this.treats = count;
    this._render();
    return grew;
  }

  /** Is this the side to move? Only the active dog wags. */
  setActive(active) {
    this.root.classList.toggle('dog-card--active', active);
  }

  /**
   * calm · think · check · won · lost · drew
   */
  setMood(mood) {
    this.mood = mood;
    this.figure.classList.remove('dog-figure--think', 'dog-figure--happy', 'dog-figure--sad');
    if (mood === 'think') this.figure.classList.add('dog-figure--think');
    if (mood === 'won') this.figure.classList.add('dog-figure--happy');
    if (mood === 'lost' || mood === 'drew') this.figure.classList.add('dog-figure--sad');
    this._render();
  }

  /** Show the pieces this side has taken, and how far ahead that puts them. */
  setTray(pieces, materialLead) {
    this.trayEl.replaceChildren();
    for (const piece of pieces) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      el.setAttribute('viewBox', '0 0 48 48');
      el.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#piece-${piece.type}`);
      el.appendChild(use);
      // The captured pieces are the opponent's colour.
      const holder = document.createElement('span');
      holder.className = `sq--${piece.color}`;
      holder.style.display = 'contents';
      holder.appendChild(el);
      this.trayEl.appendChild(holder);
    }
    if (materialLead > 0) {
      const score = document.createElement('span');
      score.className = 'tray-score';
      score.textContent = `+${materialLead}`;
      score.setAttribute('aria-label', `${materialLead} points ahead`);
      this.trayEl.appendChild(score);
    }
    if (pieces.length === 0) {
      this.trayEl.setAttribute('aria-label', 'no pieces captured yet');
    } else {
      this.trayEl.removeAttribute('aria-label');
    }
  }

  /**
   * Send a treat arcing from a square into the bowl.
   *
   * Purely decorative — the count has already changed by the time this runs, so
   * if the animation is skipped or interrupted nothing is lost.
   */
  throwTreat(fromElement) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!fromElement || !this.bowlEl.isConnected) return;

    const from = fromElement.getBoundingClientRect();
    const to = this.bowlEl.getBoundingClientRect();

    const treat = svg('treat', 'treat-fly');
    treat.setAttribute('viewBox', '0 0 24 24');
    document.body.appendChild(treat);

    const animation = treat.animate(
      [
        { transform: `translate(${from.left + from.width / 2 - 12}px, ${from.top + from.height / 2 - 12}px) scale(1)`, opacity: 1 },
        { transform: `translate(${(from.left + to.left) / 2}px, ${Math.min(from.top, to.top) - 60}px) scale(1.25)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${to.left + 4}px, ${to.top - 4}px) scale(.5)`, opacity: 0 },
      ],
      { duration: 620, easing: 'cubic-bezier(.4,0,.5,1)' },
    );
    animation.addEventListener('finish', () => treat.remove());
    animation.addEventListener('cancel', () => treat.remove());
  }

  _render() {
    const stage = stageFor(this.treats);
    this.figure.firstChild.setAttribute('href', `#${stage.symbol}`);

    this.nameEl.textContent = this.name;

    const remaining = treatsToNextStage(this.treats);
    this.stageEl.textContent = this.mood === 'think'
      ? 'thinking…'
      : remaining === null
        ? `${stage.name} — fully grown`
        : `${stage.name} · ${remaining} more to grow`;

    this.bowlEl.replaceChildren();
    this.bowlEl.appendChild(svg('bowl', ''));
    const count = document.createElement('span');
    count.textContent = this.treats === 1 ? '1 treat' : `${this.treats} treats`;
    this.bowlEl.appendChild(count);

    // One sentence a screen reader can read instead of the drawing.
    this.root.setAttribute(
      'aria-label',
      `${this.name} has ${this.treats} ${this.treats === 1 ? 'treat' : 'treats'} — ${stage.name}`,
    );
  }
}
