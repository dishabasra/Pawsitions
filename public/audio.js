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
 * Render the loop once, into a buffer.
 *
 * Rendering ahead of time rather than scheduling notes as they come up is what
 * keeps this free of timers and free of drift: the finished buffer is handed to
 * the audio hardware with loop = true, and the browser repeats it forever with
 * sample accuracy. Ten minutes later it is exactly as in time as it was at the
 * start, because nothing is being decided as it goes.
 */
async function renderLoop(sampleRate) {
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const length = Math.round((LOOP_SECONDS + TAIL_SECONDS) * sampleRate);
  const offline = new OfflineCtx(2, length, sampleRate);

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

        // Spread the voices gently left and right.
        const panner = offline.createStereoPanner();
        panner.pan.value = ((voice / (chord.length - 1)) - 0.5) * 0.5;

        osc.connect(gain);
        gain.connect(panner);
        panner.connect(filter);
        osc.start(at);
        osc.stop(at + 5.4);
      }
    });
  });

  const rendered = await offline.startRendering();

  // Fold the tail back over the beginning. Without this the final chord is cut
  // off at the loop point and you hear the join every sixteen seconds; with it,
  // the last chord rings on over the first exactly as it would if the music
  // simply continued.
  const ctxForBuffer = new (window.AudioContext || window.webkitAudioContext)();
  const loop = ctxForBuffer.createBuffer(2, Math.round(LOOP_SECONDS * sampleRate), sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const from = rendered.getChannelData(channel);
    const to = loop.getChannelData(channel);
    const loopSamples = to.length;
    for (let i = 0; i < loopSamples; i++) to[i] = from[i];
    for (let i = loopSamples; i < from.length; i++) to[i - loopSamples] += from[i];
  }
  ctxForBuffer.close();
  return loop;
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

  /**
   * Get the audio running.
   *
   * Browsers create an AudioContext in a suspended state and refuse to start it
   * until the person has done something — clicked, tapped, pressed a key. So
   * this is called from those events rather than on load, and quietly does
   * nothing if it is not allowed yet.
   */
  async unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    return this.ctx.state === 'running';
  }

  // ── switches ──────────────────────────────────────────────────────────────

  async setSfx(on) {
    this.sfxOn = on;
    writeSetting(KEYS.sfx, on);
    if (on) await this.unlock();
    this._changed();
  }

  async setMusic(on) {
    this.musicOn = on;
    writeSetting(KEYS.music, on);
    if (on) await this.startMusic();
    else this.stopMusic();
    this._changed();
  }

  // ── music ─────────────────────────────────────────────────────────────────

  async startMusic() {
    if (!this.musicOn) return;
    if (!(await this.unlock())) return;
    if (this.musicSource) return;

    if (!this.loopBuffer) {
      try {
        this.loopBuffer = await renderLoop(this.ctx.sampleRate);
      } catch {
        return; // no Web Audio worth the name; the game is unaffected
      }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this.loopBuffer;
    source.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.5); // fade in

    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();

    this.musicSource = source;
    this.musicGain = gain;
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
    if (!this.sfxOn || !this.ctx || this.ctx.state !== 'running') return;

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
