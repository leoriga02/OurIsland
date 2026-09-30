// Two-player online co-op over WebRTC (PeerJS). The host's browser owns the world; the guest joins with a room code.
// Signalling uses the free PeerJS cloud server by default (no setup). Gameplay data then flows peer-to-peer.

const PREFIX = 'our-island-v2-'; // bumped with the island layout so mismatched versions never connect
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
export const normalizeCode = (c) => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

let peerLib = null;
function loadPeerJS() {
  if (peerLib) return peerLib;
  peerLib = new Promise((resolve, reject) => {
    if (window.Peer) return resolve(window.Peer);
    const s = document.createElement('script');
    s.src = new URL('../../vendor/peerjs/peerjs.min.js', import.meta.url).href;
    s.onload = () => resolve(window.Peer || window.peerjs?.Peer);
    s.onerror = () => reject(new Error('Impossibile caricare la libreria di rete'));
    document.head.appendChild(s);
  });
  return peerLib;
}

// Optional self-hosted signalling server: ?peer=host:port (used for local testing).
function peerOptions() {
  const p = new URLSearchParams(location.search).get('peer');
  const opts = { debug: 1 };
  if (p) {
    const [host, port] = p.split(':');
    Object.assign(opts, { host, port: +(port || 9000), path: '/', secure: location.protocol === 'https:' && host !== 'localhost' });
  }
  return opts;
}

export class Net {
  // role: 'host' | 'guest'
  constructor(role, code, handlers) {
    this.role = role;
    this.code = normalizeCode(code);
    this.h = handlers; // { onOpen, onClose, onMessage, onStatus, onError }
    this.conn = null;
    this.peer = null;
    this.connected = false;
    this.lastRecv = 0;
    this.closed = false;
    this.retryT = null;
    this.attempt = 0;
  }

  status(s, detail) { this.state = s; this.h.onStatus?.(s, detail); }

  async start() {
    const Peer = await loadPeerJS();
    this.status('connecting');
    const id = this.role === 'host' ? PREFIX + this.code : undefined;
    this.peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    this.peer.on('open', () => {
      if (this.role === 'host') this.status('waiting');
      else this.connectToHost();
    });
    this.peer.on('connection', (conn) => {
      if (this.role !== 'host') { conn.close(); return; }
      // a single partner: a new connection replaces the old one (e.g. guest reconnecting)
      if (this.conn && this.conn !== conn) { try { this.conn.close(); } catch { /* ignore */ } }
      this.bind(conn);
    });
    this.peer.on('disconnected', () => {
      // lost the signalling server; data channels keep working, but reconnect so new joins still work
      if (!this.closed) setTimeout(() => { try { this.peer.reconnect(); } catch { /* ignore */ } }, 1500);
    });
    this.peer.on('error', (err) => {
      const t = err.type || '';
      if (t === 'unavailable-id') {
        // code taken (e.g. an old tab still open): pick a fresh one
        this.code = makeRoomCode();
        try { localStorage.setItem('ourisland-room', this.code); } catch { /* ignore */ }
        try { this.peer.destroy(); } catch { /* ignore */ }
        this.start();
        return;
      }
      if (t === 'peer-unavailable') { this.status('searching'); this.scheduleRetry(); return; }
      if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') { this.status('offline'); this.scheduleRetry(); return; }
      this.h.onError?.(err.message || String(err));
    });
  }

  connectToHost() {
    if (this.closed || !this.peer || this.peer.destroyed) return;
    if (this.peer.disconnected) { try { this.peer.reconnect(); } catch { /* ignore */ } this.scheduleRetry(); return; }
    this.status(this.attempt ? 'reconnecting' : 'connecting');
    const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
    this.bind(conn);
    // if the data channel never opens, try again
    clearTimeout(this.openT);
    this.openT = setTimeout(() => { if (!this.connected) { try { conn.close(); } catch { /* ignore */ } this.scheduleRetry(); } }, 9000);
  }

  scheduleRetry() {
    if (this.closed || this.role !== 'guest') return;
    clearTimeout(this.retryT);
    this.attempt++;
    this.retryT = setTimeout(() => this.connectToHost(), Math.min(1500 * this.attempt, 6000));
  }

  bind(conn) {
    this.conn = conn;
    conn.on('open', () => {
      if (conn !== this.conn) return;
      this.connected = true;
      this.attempt = 0;
      this.lastRecv = performance.now();
      clearTimeout(this.openT);
      this.status('connected');
      this.h.onOpen?.();
    });
    conn.on('data', (msg) => {
      if (conn !== this.conn) return;
      this.lastRecv = performance.now();
      if (msg && msg.t === 'ping') return;
      this.h.onMessage?.(msg);
    });
    const lost = () => {
      if (conn !== this.conn) return;
      const was = this.connected;
      this.connected = false;
      this.conn = null;
      if (was) this.h.onClose?.();
      if (this.role === 'host') this.status('waiting');
      else this.scheduleRetry();
    };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  send(msg) {
    if (!this.connected || !this.conn || !this.conn.open) return false;
    try { this.conn.send(msg); return true; } catch { return false; }
  }

  // Heartbeat + stale-link detection (mobile browsers can silently drop channels when backgrounded).
  tick() {
    if (!this.connected) return;
    const now = performance.now();
    if (!this._lastPing || now - this._lastPing > 1000) { this._lastPing = now; this.send({ t: 'ping' }); }
    if (now - this.lastRecv > 10000) {
      try { this.conn?.close(); } catch { /* ignore */ }
      const c = this.conn; this.conn = null; this.connected = false;
      if (c) this.h.onClose?.();
      if (this.role === 'guest') this.scheduleRetry(); else this.status('waiting');
    }
  }

  inviteLink() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    const p = new URLSearchParams(location.search).get('peer');
    const q = new URLSearchParams({ join: this.code });
    if (p) q.set('peer', p);
    return u.origin + u.pathname + '?' + q.toString();
  }

  destroy() {
    this.closed = true;
    clearTimeout(this.retryT); clearTimeout(this.openT);
    try { this.conn?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
  }
}
