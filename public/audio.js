/**
 * audio.js — the sounds and the music.
 *
 * Every sound in Pawsitions is generated in the browser with the Web Audio API.
 * Not one audio file is downloaded. That is not a stunt: a music loop as an mp3
 * would be a megabyte or two, would have to finish downloading before it could
 * start, and would almost certainly click at the loop point. Generating it costs
 * nothing, starts instantly, and lets the loop be made genuinely seamless.
 *
 * Two independent switches — move sounds, and the background music — each
 * remembered per device. Both start OFF. Browsers refuse to play audio before a
 * person has interacted with the page anyway, and surprising somebody with sound
 * is rude.
 *
 * Phones are the hard part, and the rules are not the same as on a laptop:
 *
 *   1. The audio has to be woken up *inside* the tap. Not a moment later — the
 *      permission a tap grants is gone by the time an `await` comes back. So
 *      `wake()` below is deliberately synchronous, and everything that can be
 *      slow happens after it.
 *   2. iOS only counts a context as unlocked once sound has actually gone
 *      through it, so `wake()` pushes one silent sample through on the way past.
 *   3. iOS silences Web Audio when the phone's ring/silent switch is flipped,
 *      unless the page says what the audio is *for*. `navigator.audioSession`
 *      is how you say "this is music" — without it a muted phone stays silent
 *      no matter how correct the rest of this file is.
 *   4. Nothing may create a second AudioContext. iOS allows only a handful per
 *      page and throws once you pass the limit, which is a silent, permanent
 *      failure.
 */

const KEYS = {
  sfx: 'pawsitions.sound',
  music: 'pawsitions.music',
};

function readSetting(key) {
  try {
    return localStorage.getItem(key) === 'on';
  } catch {
    return false; // private browsing, or storage switched off
  }
}

function writeSetting(key, on) {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    // Not being able to remember the choice is not worth breaking the game over.
  }
}

/** Frequency of a MIDI note number. 69 is A above middle C, at 440Hz. */
function hz(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

/**
 * Tell the phone that what is coming is music.
 *
 * On iOS this is the difference between sound and silence whenever the ring
 * switch is set to silent — which, on a phone somebody actually carries around,
 * is most of the time. Safari 16.4 and up understand it; older versions ignore
 * the whole thing, which is why `canIgnoreSilentSwitch` is reported back to the
 * screen so it can say so out loud rather than looking broken.
 */
function claimPlaybackSession() {
  try {
    const session = navigator.audioSession;
    if (!session) return false;
    if (session.type !== 'playback') session.type = 'playback';
    return true;
  } catch {
    return false;
  }
}

export const canIgnoreSilentSwitch = typeof navigator !== 'undefined' && 'audioSession' in navigator;

/** Best guess at "this is an iPhone or iPad", used only to word a hint. */
export const looksLikeApplePhone = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // An iPad on recent iPadOS claims to be a Mac. A Mac has no touch screen.
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
})();

// ─────────────────────────────────────────────────────────────────────────────
// The music
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Four chords in F major — F, D minor, B flat, C — struck softly and left to
 * ring. Slow enough to think over, which is the whole requirement.
 */
const PROGRESSION = [
  [53, 57, 60, 64], // F major 7
  [50, 53, 57, 60], // D minor 7
  [46, 50, 53, 57], // B flat major 7
  [48, 52, 55, 60], // C
];

const CHORD_SECONDS = 4;
const LOOP_SECONDS = PROGRESSION.length * CHORD_SECONDS;
/** Room past the end for the last chord to ring into, which is then folded back. */
const TAIL_SECONDS = 4;

/**
 * Old Safari only ever offered the callback form of startRendering, and some
 * builds offer both. Take whichever arrives first and ignore the other.
 */
function awaitRender(offline) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (buffer) => {
      if (settled) return;
      settled = true;
      resolve(buffer || null);
    };

    offline.oncomplete = (event) => done(event.renderedBuffer);

    let promise;
    try {
      promise = offline.startRendering();
    } catch {
      done(null);
      return;
    }
    if (promise && typeof promise.then === 'function') promise.then(done, () => done(null));
  });
}

/**
 * Render the loop once, into a buffer.
 *
 * Rendering ahead of time rather than scheduling notes as they come up is what
 * keeps this free of timers and free of drift: the finished buffer is handed to
 * the audio hardware with loop = true, and the browser repeats it forever with
 * sample accuracy. Ten minutes later it is exactly as in time as it was at the
 * start, because nothing is being decided as it goes.
 *
 * Returns null rather than throwing if the browser cannot do it, because a
 * browser that cannot render music can still play chess.
 */
async function renderLoop(sampleRate) {
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineCtx) return null;

  const length = Math.round((LOOP_SECONDS + TAIL_SECONDS) * sampleRate);
  let offline;
  try {
    offline = new OfflineCtx(2, length, sampleRate);
  } catch {
    return null;
  }

  try {
    // A gentle low-pass takes the edge off the oscillators, which is most of what
    // makes this read as "felt piano" rather than "synthesiser".
    const filter = offline.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.4;

    const master = offline.createGain();
    master.gain.value = 0.16;
    filter.connect(master);
    master.connect(offline.destination);

    PROGRESSION.forEach((chord, index) => {
      const start = index * CHORD_SECONDS;

      chord.forEach((note, voice) => {
        // The notes of a chord are struck a hair apart, the way fingers actually
        // land. Perfectly simultaneous notes sound mechanical.
        const at = start + voice * 0.055;

        // Two oscillators a few cents apart per note: the tiny disagreement
        // between them is what stops it sounding thin.
        for (const detune of [-4, 4]) {
          const osc = offline.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = hz(note);
          osc.detune.value = detune;

          const gain = offline.createGain();
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(0.5, at + 0.25);          // soft attack
          gain.gain.exponentialRampToValueAtTime(0.0008, at + 5.2);   // long release

          osc.connect(gain);

          // Spread the voices gently left and right, where the browser can.
          // Very old Safari has no stereo panner and simply gets it in the middle.
          if (typeof offline.createStereoPanner === 'function') {
            const panner = offline.createStereoPanner();
            panner.pan.value = ((voice / (chord.length - 1)) - 0.5) * 0.5;
            gain.connect(panner);
            panner.connect(filter);
          } else {
            gain.connect(filter);
          }

          osc.start(at);
          osc.stop(at + 5.4);
        }
      });
    });

    const rendered = await awaitRender(offline);
    if (!rendered) return null;

    // Fold the tail back over the beginning. Without this the final chord is cut
    // off at the loop point and you hear the join every sixteen seconds; with it,
    // the last chord rings on over the first exactly as it would if the music
    // simply continued.
    //
    // The scratch buffer comes from the offline context we already have. An
    // AudioBuffer belongs to no context in particular, and making a second live
    // AudioContext here just to hold it is what used to break this on iPhones.
    const loop = offline.createBuffer(2, Math.round(LOOP_SECONDS * sampleRate), sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const from = rendered.getChannelData(channel);
      const to = loop.getChannelData(channel);
      const loopSamples = to.length;
      for (let i = 0; i < loopSamples; i++) to[i] = from[i];
      for (let i = loopSamples; i < from.length; i++) to[i - loopSamples] += from[i];
    }
    return loop;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The sound board
// ─────────────────────────────────────────────────────────────────────────────

class SoundBoard {
  constructor() {
    this.sfxOn = readSetting(KEYS.sfx);
    this.musicOn = readSetting(KEYS.music);
    this.ctx = null;
    this.musicSource = null;
    this.musicGain = null;
    this.loopBuffer = null;
    this.loopPromise = null;
    this.starting = false;
    /**
     * Whether anybody has actually asked for sound yet by flipping a switch.
     *
     * Until they have, a refusal is not news — every browser refuses a page that
     * has not been touched, and saying "your browser is blocking this" to
     * somebody who has not asked for anything would be nonsense.
     */
    this.asked = false;
    /** True once we know the browser is refusing us, so a screen can say so. */
    this.blocked = false;
    this.listeners = new Set();
  }

  /** Called whenever a switch changes, so the buttons can redraw. */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _changed() {
    for (const fn of this.listeners) fn(this);
  }

  /** Is sound actually coming out right now, as far as we can tell? */
  get running() {
    return Boolean(this.ctx) && this.ctx.state === 'running';
  }

  get musicPlaying() {
    return Boolean(this.musicSource) && this.running;
  }

  /**
   * Wake the audio up, synchronously.
   *
   * Nothing in here waits for anything, and that is the entire point: a browser
   * only lets a page start making noise while it is still handling the tap that
   * asked for it. Every caller therefore reaches this line with no `await`
   * between it and the click handler.
   *
   * Returns the context, or null if this browser has no Web Audio at all.
   */
  wake({ asked = false } = {}) {
    if (asked) this.asked = true;
    claimPlaybackSession();

    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) {
        this._refused();
        return null;
      }
      try {
        this.ctx = new Ctx();
      } catch {
        this._refused();
        return null;
      }
      if (typeof this.ctx.addEventListener === 'function') {
        this.ctx.addEventListener('statechange', () => {
          if (this.running) this.blocked = false;
          else this._refused();
          this._changed();
        });
      }
      this._primeForIOS();
    }

    if (this.ctx.state !== 'running') {
      this._primeForIOS();
      try {
        const resumed = this.ctx.resume();
        if (resumed && typeof resumed.then === 'function') {
          resumed.then(
            () => { if (this.running) this.blocked = false; else this._refused(); this._changed(); },
            () => { this._refused(); this._changed(); },
          );
        }
      } catch {
        this._refused();
      }
    } else {
      this.blocked = false;
    }

    return this.ctx;
  }

  /** Note a refusal, but only once somebody has actually asked for sound. */
  _refused() {
    if (this.asked) this.blocked = true;
  }

  /**
   * Push one silent sample through the context.
   *
   * iOS does not consider a context unlocked because you resumed it; it wants
   * to have actually played something. One sample of nothing is enough, and is
   * inaudible on every other browser.
   */
  _primeForIOS() {
    try {
      const buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);
    } catch {
      // Nothing to recover from; the context is either fine or already lost.
    }
  }

  // ── switches ──────────────────────────────────────────────────────────────

  setSfx(on) {
    this.sfxOn = on;
    writeSetting(KEYS.sfx, on);
    if (on) {
      this.wake({ asked: true });
      // Make a noise immediately. If the switch is on and nothing happened, the
      // person deserves to find that out now rather than three moves later.
      this.play('move');
    }
    this._changed();
  }

  setMusic(on) {
    this.musicOn = on;
    writeSetting(KEYS.music, on);
    if (on) {
      this.wake({ asked: true }); // synchronous, inside the tap
      this.startMusic();          // the slow part, safely afterwards
    } else {
      this.stopMusic();
    }
    this._changed();
  }

  // ── music ─────────────────────────────────────────────────────────────────

  async startMusic() {
    if (!this.musicOn) return;
    const ctx = this.wake();
    if (!ctx) return;
    if (this.musicSource || this.starting) return;

    this.starting = true;
    try {
      if (!this.loopBuffer) {
        // Render at most once per visit, however many times this is called.
        if (!this.loopPromise) this.loopPromise = renderLoop(ctx.sampleRate);
        this.loopBuffer = await this.loopPromise;
      }
      if (!this.loopBuffer) {
        this.loopPromise = null; // let a later attempt try again
        this._refused();
        return;
      }
      // The switch may have been turned off again while that was rendering.
      if (!this.musicOn || this.musicSource) return;

      const source = ctx.createBufferSource();
      source.buffer = this.loopBuffer;
      source.loop = true;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5); // fade in

      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();

      this.musicSource = source;
      this.musicGain = gain;
      if (this.running) this.blocked = false; else this._refused();
    } catch {
      this._refused();
    } finally {
      this.starting = false;
      this._changed();
    }
  }

  stopMusic() {
    if (!this.musicSource) return;
    const source = this.musicSource;
    const gain = this.musicGain;
    this.musicSource = null;
    this.musicGain = null;

    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.4); // fade out, no click
    try {
      source.stop(now + 0.45);
    } catch {
      // Already stopped.
    }
  }

  /**
   * Called when the tab comes back from the background, or after a phone call.
   *
   * iOS suspends — or outright interrupts — the audio when something else wants
   * the speaker, and does not hand it back on its own. Without this, the music
   * stops for good the first time somebody checks a message mid-game.
   */
  revive() {
    if (!this.musicOn && !this.sfxOn) return;
    this.wake();
    if (this.musicOn && !this.musicSource) this.startMusic();
  }

  // ── effects ───────────────────────────────────────────────────────────────

  /** One note: a shape, a pitch, and how long it rings. */
  _note({ type = 'sine', from, to = from, duration = 0.12, volume = 0.2, at = 0 }) {
    const start = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0005, start + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  play(effect) {
    if (!this.sfxOn) return;
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      // Ask for it back, but do not schedule into a stopped context: the notes
      // would all pile up and fire at once whenever it woke.
      this.wake();
      return;
    }

    switch (effect) {
      case 'move':
        // A soft wooden tap.
        this._note({ type: 'sine', from: 420, to: 300, duration: 0.09, volume: 0.18 });
        break;

      case 'capture':
        // Lower and heavier, so you can hear the difference without looking.
        this._note({ type: 'triangle', from: 190, to: 110, duration: 0.17, volume: 0.26 });
        this._note({ type: 'sine', from: 90, to: 60, duration: 0.2, volume: 0.16 });
        break;

      case 'check':
        // Two notes rising — a question.
        this._note({ type: 'sine', from: hz(76), duration: 0.14, volume: 0.17 });
        this._note({ type: 'sine', from: hz(81), duration: 0.22, volume: 0.17, at: 0.12 });
        break;

      case 'checkmate':
        // Four notes falling — over.
        [72, 69, 65, 60].forEach((note, i) => {
          this._note({ type: 'triangle', from: hz(note), duration: 0.34, volume: 0.18, at: i * 0.16 });
        });
        break;

      case 'promote':
        // Rising, because something good happened.
        [60, 64, 67, 72].forEach((note, i) => {
          this._note({ type: 'sine', from: hz(note), duration: 0.26, volume: 0.15, at: i * 0.075 });
        });
        break;

      case 'pickup':
        this._note({ type: 'sine', from: 620, duration: 0.05, volume: 0.09 });
        break;

      case 'refused':
        this._note({ type: 'square', from: 150, to: 110, duration: 0.11, volume: 0.07 });
        break;

      default:
        break;
    }
  }

  /** Everything a screen might want to say about why it is quiet. */
  report() {
    return {
      sfxOn: this.sfxOn,
      musicOn: this.musicOn,
      asked: this.asked,
      contextState: this.ctx ? this.ctx.state : 'none',
      musicPlaying: this.musicPlaying,
      loopRendered: Boolean(this.loopBuffer),
      blocked: this.blocked,
      canIgnoreSilentSwitch,
    };
  }
}

/** One sound board for the whole game. */
export const sound = new SoundBoard();

/**
 * Work out which sound a move deserves, from the move and what it led to.
 * Kept here so that every mode makes exactly the same noises.
 */
export function playMoveSound(move, statusAfter) {
  if (statusAfter === 'checkmate') sound.play('checkmate');
  else if (statusAfter === 'check') sound.play('check');
  else if (move.promotion !== null) sound.play('promote');
  else if (move.captured !== null) sound.play('capture');
  else sound.play('move');
}
