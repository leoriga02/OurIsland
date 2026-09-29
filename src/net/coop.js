// Co-op session glue: sends the local player's state, renders the partner, and keeps the shared world in sync.
import * as THREE from 'three';
import { Net } from './net.js';
import { Character } from '../entities/character.js';
import { itemMesh } from '../game/items.js';
import { flameTexture } from '../util/textures.js';
import { angleDamp } from '../util/noise.js';

const SEND_HZ = 12;
const INTERP_DELAY = 130; // ms

function nameTag(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 30px "Nunito Sans", sans-serif';
  const w = Math.min(240, g.measureText(text).width + 34);
  g.fillStyle = 'rgba(12,16,20,0.7)';
  g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 22); g.fill();
  g.fillStyle = '#ffd27a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.8, 0.45, 1);
  s.renderOrder = 20;
  return s;
}

export class Coop {
  constructor(game, role, code) {
    this.g = game;
    this.role = role;
    this.remote = null;
    this.buffer = [];
    this.sendT = 0;
    this.skyT = 0;
    this.lastAction = null;
    this.welcomed = role === 'host';
    this.net = new Net(role, code, {
      onOpen: () => this.onOpen(),
      onClose: () => this.onClose(),
      onMessage: (m) => this.onMessage(m),
      onStatus: (s) => this.g.ui.setCoopStatus(this, s),
      onError: (e) => this.g.ui.toast(null, e, true),
    });
  }

  get code() { return this.net.code; }
  get connected() { return this.net.connected; }
  start() { return this.net.start(); }

  // ---------- connection lifecycle ----------
  onOpen() {
    const g = this.g;
    if (this.role === 'guest') {
      this.send({ t: 'hello', v: g.settings.character, name: g.settings.name });
    } else {
      g.ui.toast(null, '🤝 Partner joined the island!');
      g.audio.quest();
    }
  }

  onClose() {
    this.g.ui.toast(null, 'Partner connection lost — reconnecting…', true);
    if (this.remote) this.remote.lostAt = performance.now();
  }

  send(m) { return this.net.send(m); }

  // world events (resources, building, sleep) from the local player
  event(type, data) { this.send({ t: 'ev', e: type, ...data }); }

  snapshot() {
    const g = this.g;
    const depleted = [];
    g.nature.all.forEach((r, i) => { if (!r.alive) depleted.push([i, Math.max(1, (r.respawnAt || g.time + 60) - g.time)]); });
    return {
      t: 'welcome', v: g.settings.character, name: g.settings.name,
      world: { depleted, building: g.building.toJSON(), time: g.sky.time, day: g.sky.day },
      at: { x: g.player.pos.x, z: g.player.pos.z, f: g.player.facing },
    };
  }

  // ---------- incoming ----------
  onMessage(m) {
    const g = this.g;
    switch (m.t) {
      case 'hello':
        this.ensureRemote(m.v, m.name);
        this.send(this.snapshot());
        break;
      case 'welcome':
        this.ensureRemote(m.v, m.name);
        this.applySnapshot(m);
        break;
      case 's':
        if (!this.remote) this.ensureRemote(m.v, m.n);
        {
          // map the sender's clock onto ours using the smallest observed delay, so bursts of packets keep their spacing
          const now = performance.now();
          const off = now - (m.ts || now);
          this.clockOff = this.clockOff == null ? off : Math.min(off, this.clockOff + 0.02 * 16);
          const at = m.ts ? m.ts + this.clockOff : now;
          if (!this.buffer.length || at > this.buffer[this.buffer.length - 1].at) this.buffer.push({ ...m, at });
          if (this.buffer.length > 40) this.buffer.shift();
        }
        if (this.remote) this.remote.lostAt = 0;
        break;
      case 'act':
        this.remote?.char.play(m.a, m.d);
        break;
      case 'sky':
        if (this.role === 'guest') {
          let d = m.time - g.sky.time;
          if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
          if (Math.abs(d) > 0.003) g.sky.time = (m.time + 1) % 1;
          g.sky.day = m.day;
        }
        break;
      case 'ev':
        this.applyEvent(m);
        break;
    }
  }

  applySnapshot(m) {
    const g = this.g, W = m.world;
    for (const [i, rem] of W.depleted) {
      const r = g.nature.all[i];
      if (r && r.alive) g.nature.removeInstant(r, rem, g.time);
    }
    g.building.merge(W.building);
    g.syncPlacedCounts();
    g.sky.time = W.time; g.sky.day = W.day;
    if (!this.welcomed) {
      this.welcomed = true;
      // arrive next to the host
      const a = m.at;
      g.player.teleport(a.x + Math.sin(a.f + 1.2) * 2, a.z + Math.cos(a.f + 1.2) * 2, a.f);
      g.rig.yaw = g.player.facing + Math.PI;
      g.rig.target.copy(g.player.pos);
      g.onCoopReady?.();
    }
    g.ui.toast(null, '🤝 Connected to your partner');
  }

  applyEvent(m) {
    const g = this.g;
    const res = m.i != null ? g.nature.all[m.i] : null;
    const near = (x, z) => Math.hypot(x - g.player.pos.x, z - g.player.pos.z) < 25;
    switch (m.e) {
      case 'remove':
        if (res && res.alive) {
          g.nature.remove(res, m.d, g.time);
          if (near(res.x, res.z)) g.fx.burst(res.kind === 'fiber' ? 'grass' : res.kind === 'berry' ? 'berry' : res.kind === 'node' ? 'dust' : 'dust', new THREE.Vector3(res.x, res.y + 0.4, res.z), 8);
        }
        break;
      case 'hit':
        if (res && res.alive) {
          res.hp = Math.min(res.hp, m.hp);
          g.nature.shake(res, res.kind === 'node' ? 0.6 : 1, m.x, m.z);
          if (near(res.x, res.z)) {
            const at = new THREE.Vector3(res.x, res.y + (res.kind === 'node' ? 0.6 : 1.1), res.z);
            if (res.kind === 'node') { g.fx.burst('stone', at, 10); g.audio.mine(); } else { g.fx.burst('wood', at, 10); g.audio.chop(); }
          }
        }
        break;
      case 'fell':
        if (res && res.alive) {
          res.alive = false;
          if (res.collider) res.collider.active = false;
          res.respawnAt = g.time + m.d;
          g.nature.fellTree(res, m.x, m.z, () => { if (near(res.x, res.z)) g.audio.treeFall(); });
        }
        break;
      case 'build':
        if (g.building.placePiece(m.type, m.tg, true)) {
          g.syncPlacedCounts();
          g.checkShelter(); g.checkQuest();
          if (near(m.tg.x ?? g.player.pos.x, m.tg.z ?? g.player.pos.z)) g.audio.build();
        }
        break;
      case 'skip':
        g.skipNight(true);
        break;
    }
  }

  // ---------- partner avatar ----------
  ensureRemote(variant = 'f', name) {
    if (this.remote) {
      if (this.remote.variant === variant) return;
      this.g.scene.remove(this.remote.char.root);
    }
    const char = new Character(variant);
    this.g.scene.add(char.root);
    const tag = nameTag(name || 'Partner');
    char.root.add(tag);
    tag.position.y = 2.2;
    this.remote = { char, variant, tag, pos: new THREE.Vector3(), facing: 0, held: null, stats: null, lostAt: 0, name: name || 'Partner' };
  }

  setRemoteHeld(id) {
    const r = this.remote;
    if (r.heldId === id) return;
    r.heldId = id;
    if (!id) { r.char.setHeld(null); r.char.holdPose = null; return; }
    const m = itemMesh(id);
    m.scale.setScalar(1.4);
    if (id === 'torch') {
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      fl.center.set(0.5, 0.1); fl.scale.set(0.22, 0.38, 1); fl.position.set(0, 0.4, 0);
      m.add(fl);
    }
    r.char.holdPose = id === 'torch' ? 'torch' : null;
    r.char.setHeld(m);
  }

  // ---------- per frame ----------
  update(dt) {
    const g = this.g, P = g.player;
    this.net.tick();
    // local state → partner
    this.sendT -= dt;
    if (this.sendT <= 0 && this.connected && this.welcomed) {
      this.sendT = 1 / SEND_HZ;
      this.send({
        t: 's', ts: Math.round(performance.now()), p: [+P.pos.x.toFixed(3), +P.pos.y.toFixed(3), +P.pos.z.toFixed(3)], f: +P.facing.toFixed(3),
        sp: +P.speed.toFixed(2), r: P.running ? 1 : 0, sw: P.swimming ? 1 : 0, gr: P.grounded ? 1 : 0,
        h: g.heldTool(), v: g.settings.character, n: g.settings.name,
        st: [Math.round(g.stats.health), Math.round(g.stats.water), Math.round(g.stats.food)],
      });
    }
    // local action animations → partner
    const a = P.char.action;
    if (a && a !== this.lastAction) this.send({ t: 'act', a: a.type, d: a.dur });
    this.lastAction = a;
    // host keeps the clock in sync
    if (this.role === 'host') {
      this.skyT -= dt;
      if (this.skyT <= 0) { this.skyT = 2; this.send({ t: 'sky', time: g.sky.time, day: g.sky.day }); }
    }

    const r = this.remote;
    if (!r) return;
    // interpolate between buffered snapshots ~130ms in the past
    const renderAt = performance.now() - INTERP_DELAY;
    const b = this.buffer;
    while (b.length > 2 && b[1].at <= renderAt) b.shift();
    let s0 = b[0], s1 = b[1];
    let speed = 0, st = s0;
    if (s0 && s1 && s1.at > s0.at) {
      const k = Math.min(1.2, Math.max(0, (renderAt - s0.at) / (s1.at - s0.at)));
      r.pos.set(s0.p[0] + (s1.p[0] - s0.p[0]) * k, s0.p[1] + (s1.p[1] - s0.p[1]) * k, s0.p[2] + (s1.p[2] - s0.p[2]) * k);
      r.facing = angleDamp(r.facing, s1.f, 14, dt);
      speed = s0.sp + (s1.sp - s0.sp) * Math.min(1, k);
      st = s1;
    } else if (s0) {
      r.pos.set(s0.p[0], s0.p[1], s0.p[2]);
      r.facing = angleDamp(r.facing, s0.f, 14, dt);
    }
    if (!st) { r.char.root.visible = false; return; }
    // stale partner (connection dropped): stand still, fade name tag, hide after a minute
    const stale = !this.connected && r.lostAt;
    r.char.root.visible = !(stale && performance.now() - r.lostAt > 60000);
    if (stale) speed = 0;
    r.tag.material.opacity = stale ? 0.4 : 1;
    r.char.root.position.copy(r.pos);
    r.char.root.rotation.y = r.facing;
    r.char.update(dt, { speed, running: !!st.r && speed > 5, grounded: !!st.gr, swimming: !!st.sw, vy: 0 });
    this.setRemoteHeld(st.h || null);
    r.stats = st.st;
    r.name = st.n || r.name;
  }

  destroy() {
    this.net.destroy();
    if (this.remote) this.g.scene.remove(this.remote.char.root);
  }
}
