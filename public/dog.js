/**
 * dog.js — Biscuit and Pepper, and the patch of grass they live on.
 *
 * The dogs are not decoration sitting in a box beside the board. They live in a
 * strip of meadow along the bottom of the screen, where they wander about, sit
 * down, look around and wag. When you capture a piece a treat arcs out of the
 * board and lands in their bowl, and they trot over and eat it. Enough treats
 * and they grow up.
 *
 * None of this touches the chess. Nothing here imports rules.js, and rules.js
 * has never heard of a dog — which is the point: the game stays provably correct
 * no matter what the puppies do.
 *
 * ── How the drawing works ───────────────────────────────────────────────────
 *
 * There is one dog, drawn from a handful of proportions: how big the head is,
 * how long the legs are, how far the muzzle sticks out. The three growth stages
 * are the same drawing with different numbers — a puppy is mostly head and has
 * almost no legs; a grown dog has a longer body, longer legs and a longer nose.
 * That is what actually makes something read as "grown up", far more than size
 * does, and doing it this way means there is one dog to get right rather than
 * three to keep in step.
 */

const VIEW = '0 0 200 200';

/**
 * The three stages, as proportions rather than as separate drawings.
 *
 * A puppy is almost all head with stubby everything; growing up means the head
 * shrinks relative to the body, the body gets taller, and the ears get longer.
 * Changing the ratio is what reads as "grown up" — far more than size does.
 */
const STAGES = [
  { at: 0,  name: 'puppy',     head: 58, bodyRx: 40, bodyRy: 38, bodyCy: 146, ear: 38, eye: 13.5, muzzle: 1.0 },
  { at: 5,  name: 'young dog', head: 55, bodyRx: 44, bodyRy: 42, bodyCy: 142, ear: 42, eye: 13.0, muzzle: 1.06 },
  { at: 10, name: 'good dog',  head: 52, bodyRx: 47, bodyRy: 45, bodyCy: 139, ear: 45, eye: 12.5, muzzle: 1.12 },
];

/**
 * The two coats. Both dogs have a cream face, as the reference does — it is what
 * lets the big dark eyes and the nose read at any size — and differ in the
 * colour of the cap, the ears and the body.
 */
const COATS = {
  w: { coat: '#EFC492', face: '#FFFAF3', chest: '#FFFFFF', line: '#6B4A32', ink: '#3E2A1C' },
  b: { coat: '#7A5232', face: '#FBF1E4', chest: '#FFF7EA', line: '#43291A', ink: '#2E1D12' },
};

const BLUSH = '#F4A0A6';
const PAD = '#F2A5AB';
const TONGUE = '#F2808C';

/** Which stage a number of treats earns. */
export function stageFor(treats) {
  let found = STAGES[0];
  for (const stage of STAGES) if (treats >= stage.at) found = stage;
  return found;
}

/** How many more treats until he grows, or null once fully grown. */
export function treatsToNextStage(treats) {
  const next = STAGES.find((s) => s.at > treats);
  return next ? next.at - treats : null;
}

const svgEl = (name, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

/**
 * Draw a puppy: front on, sitting, looking straight at you.
 *
 * Facing forward is the whole trick. A dog in profile is a shape; a dog looking
 * at you has a face, and a face can be cute. Everything else follows from that
 * one decision — the eyes can be huge and wide apart, the mouth can be open in a
 * smile, the back paws splay out with their pads showing, and the ears frame it.
 */
export function buildDog(stage, colour) {
  const s = stage;
  const c = COATS[colour];

  // One outline weight everywhere. Consistency is most of what makes a drawing
  // look deliberate rather than assembled.
  const line = { stroke: c.line, 'stroke-width': 4.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  const thin = { stroke: c.line, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

  const cx = 100;
  const headCy = 200 - s.bodyRy * 2 - s.head * 0.72;
  const footY = s.bodyCy + s.bodyRy * 0.78;

  const root = svgEl('svg', { viewBox: VIEW, class: 'dg', 'aria-hidden': 'true', fill: 'none' });

  // ── tail, curling out behind ──────────────────────────────────────────────
  // Low and beside the body. An earlier draft curled it up level with the head,
  // where it read as a third ear rather than as a tail.
  const tailRootX = cx + s.bodyRx * 0.74;
  const tailRootY = s.bodyCy + s.bodyRy * 0.34;
  const tailPath = `M${tailRootX} ${tailRootY}
    C${cx + s.bodyRx * 1.24} ${s.bodyCy + s.bodyRy * 0.42},
     ${cx + s.bodyRx * 1.34} ${s.bodyCy - s.bodyRy * 0.10},
     ${cx + s.bodyRx * 1.02} ${s.bodyCy - s.bodyRy * 0.30}`;
  const tail = svgEl('g', { class: 'dg-tail' });
  tail.setAttribute('style', `transform-origin:${tailRootX}px ${tailRootY}px`);
  tail.append(
    svgEl('path', { d: tailPath, stroke: c.line, 'stroke-width': 19, 'stroke-linecap': 'round' }),
    svgEl('path', { d: tailPath, stroke: c.coat, 'stroke-width': 12, 'stroke-linecap': 'round' }),
  );
  root.appendChild(tail);

  // ── back feet, splayed out to the sides with their pads showing ───────────
  const backFoot = (side) => {
    const g = svgEl('g', { class: `dg-foot dg-foot--${side > 0 ? 'right' : 'left'}` });
    const fx = cx + side * (s.bodyRx * 1.02);
    g.appendChild(svgEl('ellipse', {
      cx: fx, cy: footY, rx: 25, ry: 17, fill: c.chest, ...line,
      transform: `rotate(${side * 10} ${fx} ${footY})`,
    }));
    // Pads: one big, three toes. The pink is a large part of why this reads cute.
    g.appendChild(svgEl('ellipse', { cx: fx, cy: footY + 3, rx: 11, ry: 7.5, fill: PAD }));
    for (const dx of [-11, 0, 11]) {
      g.appendChild(svgEl('circle', { cx: fx + dx, cy: footY - 9, r: 4.6, fill: PAD }));
    }
    return g;
  };
  root.append(backFoot(-1), backFoot(1));

  // ── body ──────────────────────────────────────────────────────────────────
  root.appendChild(svgEl('ellipse', {
    cx, cy: s.bodyCy, rx: s.bodyRx, ry: s.bodyRy, fill: c.coat, ...line,
  }));
  // Cream chest, which breaks up the body and gives the collar somewhere to sit.
  root.appendChild(svgEl('path', {
    d: `M${cx} ${s.bodyCy - s.bodyRy * 0.86}
        C${cx - s.bodyRx * 0.62} ${s.bodyCy - s.bodyRy * 0.5}, ${cx - s.bodyRx * 0.52} ${s.bodyCy + s.bodyRy * 0.7}, ${cx} ${s.bodyCy + s.bodyRy * 0.86}
        C${cx + s.bodyRx * 0.52} ${s.bodyCy + s.bodyRy * 0.7}, ${cx + s.bodyRx * 0.62} ${s.bodyCy - s.bodyRy * 0.5}, ${cx} ${s.bodyCy - s.bodyRy * 0.86} Z`,
    fill: c.chest,
  }));

  // ── front paws, together in the middle ────────────────────────────────────
  for (const side of [-1, 1]) {
    const px = cx + side * 21;
    const g = svgEl('g', { class: `dg-paw dg-paw--${side > 0 ? 'right' : 'left'}` });
    g.appendChild(svgEl('ellipse', { cx: px, cy: footY - 4, rx: 15, ry: 19, fill: c.chest, ...line }));
    for (const dx of [-6, 0, 6]) {
      g.appendChild(svgEl('path', {
        d: `M${px + dx} ${footY - 13} v7`, ...thin, 'stroke-width': 2.4, opacity: 0.55,
      }));
    }
    root.appendChild(g);
  }

  // ── head ──────────────────────────────────────────────────────────────────
  const head = svgEl('g', { class: 'dg-head' });
  head.setAttribute('style', `transform-origin:${cx}px ${headCy + s.head * 0.9}px`);

  // A tuft of fur on top, which is the difference between a ball and a puppy.
  head.appendChild(svgEl('path', {
    d: `M${cx - 15} ${headCy - s.head + 10}
        q1 -17 15 -13 q14 -4 15 13 Z`,
    fill: c.coat, ...line,
  }));

  head.appendChild(svgEl('circle', { cx, cy: headCy, r: s.head, fill: c.coat, ...line }));

  // The cream face, an egg inside the head.
  head.appendChild(svgEl('path', {
    d: `M${cx} ${headCy - s.head * 0.78}
        C${cx - s.head * 0.72} ${headCy - s.head * 0.78}, ${cx - s.head * 0.78} ${headCy + s.head * 0.18}, ${cx - s.head * 0.62} ${headCy + s.head * 0.62}
        C${cx - s.head * 0.44} ${headCy + s.head * 0.98}, ${cx + s.head * 0.44} ${headCy + s.head * 0.98}, ${cx + s.head * 0.62} ${headCy + s.head * 0.62}
        C${cx + s.head * 0.78} ${headCy + s.head * 0.18}, ${cx + s.head * 0.72} ${headCy - s.head * 0.78}, ${cx} ${headCy - s.head * 0.78} Z`,
    fill: c.face,
  }));

  // ── ears, hanging down the sides ──────────────────────────────────────────
  // Drawn as a teardrop rather than a rotated ellipse. An ellipse pinned at the
  // middle of the head and tilted outwards splays like a wing; a real floppy ear
  // attaches near the TOP of the head, hangs down past the cheek, and is
  // narrow where it joins and widest near the tip. The shape carries the angle,
  // so there is no rotation to keep symmetrical.
  for (const side of [-1, 1]) {
    const topX = cx + side * s.head * 0.72;
    const topY = headCy - s.head * 0.56;
    const tipX = cx + side * s.head * 0.92;
    const tipY = headCy + s.ear * 0.78;
    const drop = tipY - topY;

    const ear = svgEl('path', {
      d: `M${topX} ${topY}
          C${topX + side * s.head * 0.56} ${topY + drop * 0.20},
           ${tipX + side * s.head * 0.34} ${tipY - drop * 0.26},
           ${tipX} ${tipY}
          C${tipX - side * s.head * 0.20} ${tipY - drop * 0.30},
           ${topX - side * s.head * 0.04} ${topY + drop * 0.32},
           ${topX} ${topY} Z`,
      fill: c.coat, ...line,
      class: `dg-ear dg-ear--${side > 0 ? 'right' : 'left'}`,
    });
    // Flapping swings the ear about where it joins the head.
    ear.setAttribute('style', `transform-origin:${topX}px ${topY}px`);
    head.appendChild(ear);
  }

  // ── face ──────────────────────────────────────────────────────────────────
  // Eyes: big, wide apart, two highlights each. This is most of the cuteness.
  for (const side of [-1, 1]) {
    const ex = cx + side * s.head * 0.40;
    const ey = headCy + s.head * 0.04;
    const g = svgEl('g', { class: `dg-eye dg-eye--${side > 0 ? 'right' : 'left'}` });
    g.setAttribute('style', `transform-origin:${ex}px ${ey}px`);
    g.append(
      svgEl('ellipse', { cx: ex, cy: ey, rx: s.eye, ry: s.eye * 1.12, fill: c.ink }),
      svgEl('circle', { cx: ex + s.eye * 0.30, cy: ey - s.eye * 0.40, r: s.eye * 0.40, fill: '#FFFFFF' }),
      svgEl('circle', { cx: ex - s.eye * 0.34, cy: ey + s.eye * 0.40, r: s.eye * 0.20, fill: '#FFFFFF', opacity: 0.8 }),
    );
    head.appendChild(g);
  }

  // Blush
  for (const side of [-1, 1]) {
    head.appendChild(svgEl('ellipse', {
      cx: cx + side * s.head * 0.62, cy: headCy + s.head * 0.34,
      rx: s.head * 0.17, ry: s.head * 0.105, fill: BLUSH, opacity: 0.55,
    }));
  }

  // Nose: a rounded triangle, the way a puppy's actually looks.
  const noseY = headCy + s.head * 0.26;
  const nw = 11 * s.muzzle;
  head.appendChild(svgEl('path', {
    d: `M${cx - nw} ${noseY - nw * 0.42} q${nw} ${-nw * 0.34} ${nw * 2} 0 q${-nw * 0.34} ${nw * 1.24} ${-nw} ${nw * 1.24} q${-nw * 0.66} 0 ${-nw} ${-nw * 1.24} Z`,
    fill: c.ink,
  }));

  // An open, happy mouth with a tongue.
  const mouthTop = noseY + nw * 0.95;
  const mw = 17 * s.muzzle;
  const mh = 21 * s.muzzle;
  head.appendChild(svgEl('path', {
    d: `M${cx - mw} ${mouthTop} Q${cx} ${mouthTop - 7} ${cx + mw} ${mouthTop}
        Q${cx + mw * 0.96} ${mouthTop + mh * 0.86} ${cx} ${mouthTop + mh}
        Q${cx - mw * 0.96} ${mouthTop + mh * 0.86} ${cx - mw} ${mouthTop} Z`,
    fill: c.ink, ...thin, stroke: c.line,
  }));
  head.appendChild(svgEl('path', {
    d: `M${cx - mw * 0.54} ${mouthTop + mh * 0.5} Q${cx} ${mouthTop + mh * 0.36} ${cx + mw * 0.54} ${mouthTop + mh * 0.5}
        Q${cx + mw * 0.5} ${mouthTop + mh} ${cx} ${mouthTop + mh}
        Q${cx - mw * 0.5} ${mouthTop + mh} ${cx - mw * 0.54} ${mouthTop + mh * 0.5} Z`,
    fill: TONGUE,
  }));

  root.appendChild(head);

  return root;
}

/**
 * A dog you can see on screen: it wanders, sits, wags and eats.
 */
export class DogSprite {
  /**
   * @param {object} options
   *   color     'w' or 'b'
   *   name      what to call him
   *   range     [from, to] as percentages of the meadow he may wander between
   *   bowlAt    percentage where his bowl sits
   */
  constructor({ color, name, range, bowlAt }) {
    this.color = color;
    this.name = name;
    this.range = range;
    this.bowlAt = bowlAt;
    this.treats = 0;
    this.mood = 'calm';
    this.facing = 1;
    this.at = (range[0] + range[1]) / 2;
    this.timer = null;
    this.alive = true;

    this.root = document.createElement('div');
    this.root.className = `pup pup--${color}`;
    this.root.style.left = `${this.at}%`;

    this.figure = document.createElement('div');
    this.figure.className = 'pup-figure';
    this.figure.appendChild(buildDog(stageFor(0), color));

    this.label = document.createElement('div');
    this.label.className = 'pup-label';

    this.root.append(this.label, this.figure);

    this.bowl = document.createElement('div');
    this.bowl.className = `bowl bowl--${color}`;
    this.bowl.style.left = `${bowlAt}%`;
    this.bowl.innerHTML = `
      <svg viewBox="0 0 60 34" aria-hidden="true">
        <ellipse cx="30" cy="10" rx="24" ry="7" fill="#C96E43"/>
        <path d="M6 10 h48 l-6 16 a6 6 0 0 1 -6 4 h-24 a6 6 0 0 1 -6 -4 z" fill="#EF9A62"/>
        <ellipse cx="30" cy="10" rx="18" ry="4.6" fill="#8E4F2E"/>
      </svg>`;
    this.count = document.createElement('span');
    this.count.className = 'bowl-count';
    this.bowl.appendChild(this.count);

    this._render();
  }

  get reduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Start wandering. */
  start() {
    if (this.reduced) return;
    this._scheduleWander(600 + Math.random() * 1500);
  }

  stop() {
    this.alive = false;
    clearTimeout(this.timer);
  }

  _scheduleWander(delay) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this._wander(), delay);
  }

  /**
   * Pick somewhere to go, walk there, then have a think about it.
   *
   * Deliberately unhurried and a bit random — a dog that paced at a constant
   * speed between two fixed points would read as a machine.
   */
  _wander() {
    if (!this.alive || this.reduced) return;
    if (this.mood === 'eating') { this._scheduleWander(1200); return; }

    const [from, to] = this.range;
    const target = from + Math.random() * (to - from);
    const distance = Math.abs(target - this.at);

    if (distance < 1.5) {
      // Too close to bother. Sit down for a moment instead.
      this._sit();
      this._scheduleWander(1800 + Math.random() * 2600);
      return;
    }

    this.walkTo(target, () => {
      // Having arrived, stand about, and sometimes sit.
      if (Math.random() < 0.45) this._sit();
      this._scheduleWander(1400 + Math.random() * 3200);
    });
  }

  /** Walk to a percentage across the meadow. */
  walkTo(target, done = () => {}) {
    const distance = Math.abs(target - this.at);
    if (distance < 0.3 || this.reduced) { this.at = target; this.root.style.left = `${target}%`; done(); return; }

    this.facing = target > this.at ? 1 : -1;
    this.at = target;

    // Slower over a short distance, so a two-step shuffle is not a sprint.
    const seconds = Math.max(0.9, distance / 9);
    this.root.classList.add('pup--hopping');
    this.root.classList.remove('pup--sitting');
    this.root.style.setProperty('--hop', `${Math.max(0.32, 0.58 - distance / 300)}s`);
    this.root.style.transition = `left ${seconds}s linear`;
    this.root.style.left = `${target}%`;
    this._face();

    clearTimeout(this._walkTimer);
    this._walkTimer = setTimeout(() => {
      this.root.classList.remove('pup--hopping');
      this.figure.style.setProperty('--lean', '0deg');
      done();
    }, seconds * 1000);
  }

  /**
   * Lean the way he is travelling.
   *
   * A dog drawn in profile would be mirrored to turn round. This one faces you,
   * so mirroring would turn his face inside out — he leans instead, which reads
   * as direction and keeps the face pointed at the player.
   */
  _face() {
    this.figure.style.setProperty('--lean', `${this.facing * 7}deg`);
  }

  _sit() {
    if (this.reduced) return;
    this.root.classList.add('pup--sitting');
    setTimeout(() => this.root.classList.remove('pup--sitting'), 2200 + Math.random() * 2000);
  }

  /** Set the treat count. Returns true if he grew. */
  setTreats(count) {
    const grew = stageFor(count).name !== stageFor(this.treats).name;
    this.treats = count;
    if (grew) {
      this.figure.replaceChildren(buildDog(stageFor(count), this.color));
      this._face();
      this.root.classList.add('pup--growing');
      setTimeout(() => this.root.classList.remove('pup--growing'), 900);
    }
    this._render();
    return grew;
  }

  /** calm · think · won · lost · drew */
  setMood(mood) {
    if (this.mood === mood) return;
    this.mood = mood;
    this.root.classList.toggle('pup--thinking', mood === 'think');
    this.root.classList.toggle('pup--happy', mood === 'won');
    this.root.classList.toggle('pup--sad', mood === 'lost' || mood === 'drew');
    this._render();
  }

  /** Whose turn it is — only the active dog wags. */
  setActive(active) {
    this.root.classList.toggle('pup--active', active);
  }

  /**
   * Trot to the bowl and eat. Called when this side captures a piece.
   */
  goEat() {
    if (this.reduced) { this._render(); return; }
    clearTimeout(this.timer);
    this.mood = 'eating';
    this.walkTo(this.bowlAt, () => {
      this.root.classList.add('pup--eating');
      setTimeout(() => {
        this.root.classList.remove('pup--eating');
        this.mood = 'calm';
        this._scheduleWander(900);
      }, 1400);
    });
  }

  _render() {
    const stage = stageFor(this.treats);
    const remaining = treatsToNextStage(this.treats);
    this.label.textContent = this.name;
    this.count.textContent = String(this.treats);
    this.root.setAttribute(
      'aria-label',
      `${this.name}, ${stage.name}, ${this.treats} ${this.treats === 1 ? 'treat' : 'treats'}` +
      (remaining === null ? ', fully grown' : `, ${remaining} more to grow`),
    );
  }
}

/**
 * The strip of grass along the bottom of the screen that the dogs live on.
 */
export class Meadow {
  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'meadow';
    this.root.setAttribute('aria-hidden', 'true');

    // The ground: a soft hill, some tufts and a few flowers. Drawn rather than
    // tiled so it scales to any width without repeating visibly.
    this.root.innerHTML = `
      <svg class="meadow-ground" viewBox="0 0 1200 220" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 74 C150 34 290 30 420 54 C560 80 700 34 860 44 C980 52 1100 40 1200 26 L1200 220 L0 220 Z"
              fill="var(--grass)"/>
        <path d="M0 116 C170 84 320 106 500 96 C690 86 830 118 1010 104 C1090 98 1150 104 1200 98 L1200 220 L0 220 Z"
              fill="var(--grass-deep)" opacity=".5"/>
      </svg>
      <div class="meadow-flora"></div>`;

    this.flora = this.root.querySelector('.meadow-flora');
    this._sow();

    this.dogs = [];
  }

  /** Scatter grass tufts and flowers, in fixed places so they do not jitter. */
  _sow() {
    const tufts = [4, 13, 21, 30, 38, 47, 56, 64, 73, 81, 89, 96];
    const flowers = [9, 27, 52, 69, 86];
    for (const at of tufts) {
      const tuft = document.createElement('span');
      tuft.className = 'tuft';
      tuft.style.left = `${at}%`;
      tuft.style.setProperty('--sway', `${3 + (at % 5) * 0.6}s`);
      tuft.innerHTML = `<svg viewBox="0 0 24 20" aria-hidden="true">
        <path d="M12 20 C10 14 6 11 3 9 C7 9 11 12 12 16 C13 11 17 8 21 8 C18 11 14 14 12 20 Z" fill="var(--grass-blade)"/>
      </svg>`;
      this.flora.appendChild(tuft);
    }
    for (const at of flowers) {
      const flower = document.createElement('span');
      flower.className = 'flower';
      flower.style.left = `${at}%`;
      flower.style.setProperty('--sway', `${4 + (at % 4) * 0.7}s`);
      flower.innerHTML = `<svg viewBox="0 0 22 26" aria-hidden="true">
        <path d="M11 26 L11 13" stroke="var(--grass-blade)" stroke-width="2.4" stroke-linecap="round"/>
        <g fill="var(--bloom)">
          <circle cx="11" cy="6" r="4"/><circle cx="6" cy="10" r="4"/>
          <circle cx="16" cy="10" r="4"/><circle cx="8" cy="15" r="4"/><circle cx="14" cy="15" r="4"/>
        </g>
        <circle cx="11" cy="10.5" r="3" fill="var(--bloom-heart)"/>
      </svg>`;
      this.flora.appendChild(flower);
    }
  }

  addDog(options) {
    const dog = new DogSprite(options);
    this.root.append(dog.bowl, dog.root);
    this.dogs.push(dog);
    return dog;
  }

  mount(parent) {
    parent.appendChild(this.root);
    // Tells the page to leave room at the bottom. Screens without a meadow do
    // not, so they are not left with a strip of nothing under them.
    document.body.classList.add('has-meadow');
    for (const dog of this.dogs) dog.start();
  }

  destroy() {
    for (const dog of this.dogs) dog.stop();
    this.root.remove();
    document.body.classList.remove('has-meadow');
  }

  /**
   * Send a treat arcing from a square on the board into a dog's bowl.
   *
   * Purely decorative — the count has already changed by the time this runs, so
   * losing the animation costs nothing.
   */
  throwTreat(fromElement, dog) {
    if (!fromElement || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dog.goEat();
      return;
    }
    const from = fromElement.getBoundingClientRect();
    const to = dog.bowl.getBoundingClientRect();

    const treat = document.createElement('span');
    treat.className = 'treat-fly';
    treat.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 8a3 3 0 1 1 3 3h8a3 3 0 1 1 3-3 3 3 0 1 1-3 3H8a3 3 0 1 1-3-3z" fill="#C96E43"/>
      <rect x="7" y="9.5" width="10" height="5" rx="2" fill="#C96E43"/>
    </svg>`;
    document.body.appendChild(treat);

    const animation = treat.animate([
      { transform: `translate(${from.left + from.width / 2 - 13}px, ${from.top + from.height / 2 - 13}px) scale(1) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${(from.left + to.left) / 2}px, ${Math.min(from.top, to.top) - 90}px) scale(1.35) rotate(180deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${to.left + to.width / 2 - 13}px, ${to.top + 2}px) scale(.55) rotate(340deg)`, opacity: 0 },
    ], { duration: 760, easing: 'cubic-bezier(.35,0,.5,1)' });

    animation.addEventListener('finish', () => { treat.remove(); dog.goEat(); });
    animation.addEventListener('cancel', () => treat.remove());
  }
}
