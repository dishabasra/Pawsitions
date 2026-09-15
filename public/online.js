/**
 * online.js — the browser's end of an online game.
 *
 * It keeps a WebSocket open to the room, sends what the player does, and hands
 * back whatever the server says the board now is. It does not decide anything
 * about chess: if the server refuses a move, the move did not happen.
 *
 * The one timer in this file is the pause before trying to reconnect. The rule
 * that there are no timers applies to the server, where a timer would mean state
 * living somewhere other than the database; a browser that has lost its network
 * has no way to wait without one.
 */

/** Rooms are named with dog words, because they get read out over the phone. */
const ROOM_WORDS = [
  'BISCUIT', 'NOODLE', 'WAFFLE', 'PICKLE', 'MUFFIN', 'PEANUT', 'TRUFFLE',
  'COOKIE', 'PUMPKIN', 'BAGEL', 'MOCHI', 'PRETZEL', 'CRUMPET', 'DUMPLING',
];

export function suggestRoomCode() {
  const word = ROOM_WORDS[Math.floor(Math.random() * ROOM_WORDS.length)];
  return `${word}${Math.floor(10 + Math.random() * 90)}`;
}

/** Tidy a typed code the same way the server does, so both agree. */
export function normaliseRoomCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

/**
 * This browser's identity, kept between visits.
 *
 * It is what makes a refresh land back in the same seat rather than being
 * demoted to a spectator while your own game carries on without you. It is a
 * random string and nothing else — not a login, not a name, and it never leaves
 * this device except to say "the White seat is mine".
 */
export function playerId() {
  const KEY = 'pawsitions.playerId';
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    const fresh = crypto.randomUUID();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private browsing, or storage switched off. The game still works; a refresh
    // just will not remember the seat.
    return crypto.randomUUID();
  }
}

const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000];

export class RoomConnection {
  /**
   * @param {string} roomCode
   * @param {object} handlers
   *   onWelcome({ role })
   *   onState(payload)
   *   onError({ code, message })
   *   onStatus('connecting' | 'open' | 'reconnecting' | 'closed')
   */
  constructor(roomCode, { onWelcome, onState, onError, onStatus }) {
    this.roomCode = roomCode;
    this.onWelcome = onWelcome;
    this.onState = onState;
    this.onError = onError;
    this.onStatus = onStatus;

    this.socket = null;
    this.attempt = 0;
    this.closedOnPurpose = false;
    this.retryTimer = null;

    this.connect();
  }

  connect() {
    if (this.closedOnPurpose) return;
    this.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${scheme}://${location.host}/ws/${this.roomCode}`);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.attempt = 0;
      this.onStatus('open');
      // Say who we are straight away; the server answers with our seat.
      this.send('join', { playerId: playerId() });
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === 'welcome') this.onWelcome(message.payload);
      else if (message.type === 'state') this.onState(message.payload);
      else if (message.type === 'error') this.onError(message.payload);
    });

    socket.addEventListener('close', () => {
      if (this.closedOnPurpose) { this.onStatus('closed'); return; }
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // 'close' always follows, and that is where reconnecting is handled.
    });
  }

  scheduleReconnect() {
    this.onStatus('reconnecting');
    const delay = RECONNECT_DELAYS[Math.min(this.attempt, RECONNECT_DELAYS.length - 1)];
    this.attempt++;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type, payload }));
    return true;
  }

  close() {
    this.closedOnPurpose = true;
    clearTimeout(this.retryTimer);
    if (this.socket) this.socket.close();
  }
}
