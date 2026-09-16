/**
 * backdrop.js — the bones and paw prints drifting behind the game.
 *
 * A slow, quiet layer of dog bones floating up the page. It sits behind
 * everything, is never interactive, and is purely decorative: nothing in the
 * game reads it and removing this file would change no behaviour at all.
 *
 * Two things keep it from becoming annoying. It only ever animates `transform`
 * and `opacity`, which the browser can do without re-laying-out the page, so a
 * drifting bone costs nothing while you are thinking about a move. And it is
 * slow — thirty to fifty seconds to cross the screen — because anything faster
 * pulls the eye away from the board.
 */

/** One classic dog bone. */
function bone() {
  return `<svg viewBox="0 0 52 24" aria-hidden="true">
    <g fill="currentColor">
      <circle cx="10" cy="7.5" r="7"/><circle cx="10" cy="16.5" r="7"/>
      <circle cx="42" cy="7.5" r="7"/><circle cx="42" cy="16.5" r="7"/>
      <rect x="9" y="6" width="34" height="12" rx="6"/>
    </g>
  </svg>`;
}

/** A paw print, for variety. */
function paw() {
  return `<svg viewBox="0 0 28 28" aria-hidden="true">
    <g fill="currentColor">
      <ellipse cx="14" cy="19.5" rx="8" ry="6.6"/>
      <ellipse cx="5.6" cy="11" rx="3.5" ry="4"/>
      <ellipse cx="11.2" cy="6.6" rx="3.6" ry="4.2"/>
      <ellipse cx="17.4" cy="6.6" rx="3.6" ry="4.2"/>
      <ellipse cx="22.8" cy="11" rx="3.4" ry="3.9"/>
    </g>
  </svg>`;
}

/**
 * Fixed positions rather than random ones.
 *
 * Random placement clumps — you get three bones on top of each other and a bare
 * patch beside them — and it changes on every reload, so the page never settles
 * into a look. These are spaced by hand.
 *
 *   at     how far across the page, as a percentage
 *   size   width in pixels
 *   dur    seconds to cross the screen
 *   delay  seconds before it starts, so they are not in step
 *   sway   how far it wanders sideways on the way up
 *   spin   how far it turns
 *   o      opacity
 */
const DRIFTERS = [
  { kind: 'bone', at: 5,  size: 62, dur: 44, delay: -3,  sway: 26,  spin: 18,  o: 0.46 },
  { kind: 'paw',  at: 14, size: 30, dur: 38, delay: -19, sway: -18, spin: -24, o: 0.38 },
  { kind: 'bone', at: 23, size: 40, dur: 52, delay: -31, sway: -22, spin: -14, o: 0.34 },
  { kind: 'bone', at: 33, size: 52, dur: 40, delay: -11, sway: 20,  spin: 26,  o: 0.42 },
  { kind: 'paw',  at: 42, size: 24, dur: 47, delay: -26, sway: 16,  spin: 30,  o: 0.32 },
  { kind: 'bone', at: 51, size: 70, dur: 55, delay: -38, sway: -28, spin: -20, o: 0.44 },
  { kind: 'bone', at: 60, size: 36, dur: 36, delay: -7,  sway: 22,  spin: 22,  o: 0.36 },
  { kind: 'paw',  at: 69, size: 32, dur: 49, delay: -22, sway: -20, spin: -28, o: 0.38 },
  { kind: 'bone', at: 78, size: 56, dur: 42, delay: -34, sway: 24,  spin: 16,  o: 0.46 },
  { kind: 'bone', at: 87, size: 42, dur: 51, delay: -15, sway: -18, spin: -22, o: 0.38 },
  { kind: 'paw',  at: 95, size: 26, dur: 39, delay: -29, sway: 14,  spin: 26,  o: 0.32 },
];

/**
 * Put the drifting layer on the page. Safe to call more than once.
 */
export function startBackdrop() {
  if (document.querySelector('.drift')) return;

  const layer = document.createElement('div');
  layer.className = 'drift';
  layer.setAttribute('aria-hidden', 'true');

  for (const d of DRIFTERS) {
    const item = document.createElement('span');
    item.className = 'drift-item';
    item.style.cssText = [
      `left:${d.at}%`,
      `width:${d.size}px`,
      `--dur:${d.dur}s`,
      `--delay:${d.delay}s`,
      `--sway:${d.sway}px`,
      `--spin:${d.spin}deg`,
      `--o:${d.o}`,
    ].join(';');
    item.innerHTML = d.kind === 'bone' ? bone() : paw();
    layer.appendChild(item);
  }

  document.body.prepend(layer);
}
