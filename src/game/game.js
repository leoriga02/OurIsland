// Game orchestrator: world setup, interaction, survival, crafting, building, quests, save/load.
import * as THREE from 'three';
import { Terrain } from '../world/terrain.js';
import { createOcean, createPond, setWaterIslands } from '../world/water.js';
import { DistantIslands } from '../world/islands.js';
import { Sky } from '../world/sky.js';
import { Nature } from '../world/nature.js';
import { World } from '../world/world.js';
import { Props } from '../world/props.js';
import { shared } from '../world/materials.js';
import { Player, CameraRig } from '../entities/player.js';
import { Character } from '../entities/character.js';
import { Crabs } from '../entities/crabs.js';
import { Birds } from '../entities/birds.js';
import { Input } from '../input.js';
import { Inventory, HOTBAR } from './inventory.js';
import { ITEMS, RECIPES, PIECES, itemMesh } from './items.js';
import { Building, pieceObject } from './building.js';
import { QUESTS, FREE_PLAY } from './quests.js';
import { Fx } from '../fx/fx.js';
import { Audio } from '../fx/audio.js';
import { UI } from '../ui/ui.js';
import { IconFactory } from '../ui/icons.js';
import { flameTexture } from '../util/textures.js';
import { clamp } from '../util/noise.js';

const SAVE_KEY = 'ourisland-save-v2'; // v2: Island 2.0 layout (v1 saves belong to the old island)
const GUEST_KEY = 'ourisland-guest-v1'; // a guest keeps their own backpack & progress; the world belongs to the host
const REACH = { pickup: 1.7, fiber: 1.7, berry: 1.9, palm: 1.35, tree: 1.35, node: 1.1, crab: 1.5, campfire: 2.0, bed: 2.0 };

export class Game {
  constructor({ renderer, scene, camera, quality, canvas, mode = 'solo' }) {
    Object.assign(this, { renderer, scene, camera, quality, canvas, mode });
    this.coop = null;
    this.time = 0;
    this.selected = -1;
    this.panelOpen = false;
    this.started = false;
    this.dead = false;
    this.stats = { health: 100, water: 72, food: 80 };
    this.progress = { col: {}, crafted: {}, ate: {}, placed: { foundation: 0, walls: 0, doorway: 0, roof: 0, campfire: 0, bed: 0 }, felled: 0, drank: 0, slept: 0, reachedPeak: false };
    this.questIndex = 0;
    this.actionCooldown = 0;
    this.settings = { sfx: true, music: true, quality: quality >= 1 ? 'high' : 'low', follow: true, character: mode === 'guest' ? 'f' : 'm', name: '' };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('ourisland-settings') || '{}')); } catch { /* ignore */ }
    this.target = null;
  }

  init() {
    const { scene } = this;
    this.terrain = new Terrain(7);
    scene.add(this.terrain.buildMesh());
    const heightTex = this.terrain.buildHeightTexture();
    this.ocean = createOcean(heightTex); scene.add(this.ocean);
    this.pond = createPond(heightTex, this.terrain.pond); scene.add(this.pond);
    this.distant = new DistantIslands(scene);
    setWaterIslands(this.ocean.material, this.distant.waterData());
    this.sky = new Sky(scene, { shadowSize: this.quality >= 2 ? 2048 : 1536 });
    // soft fill light near the camera so the character stays readable at night
    this.fill = new THREE.PointLight(0x9ab8ff, 0, 18, 1.5);
    scene.add(this.fill);
    this.nature = new Nature(scene, this.terrain, { quality: this.quality });
    this.world = new World(this.terrain, this.nature);
    this.props = new Props(scene, this.terrain, this.nature, this.world);
    this.fx = new Fx(scene);
    this.building = new Building(scene, this.world, this.fx);
    this.crabs = new Crabs(scene, this.terrain, 14);
    this.birds = new Birds(scene, 10);
    this.player = new Player(scene, this.world, this.settings.character);
    this.rig = new CameraRig(this.camera, this.world);
    this.input = new Input(this.canvas);
    this.inv = new Inventory(24);
    this.audio = new Audio();
    this.icons = new IconFactory();
    this.pieceIcons = {};
    this.ui = new UI(this);
    this.respawn = { x: this.terrain.spawn.x, z: this.terrain.spawn.z };

    this.inv.onChange((e) => {
      this.ui.renderHotbar();
      if (e.added) this.ui.popSlot(e.slot);
      this.refreshHeld();
      if (this.panelOpen) this.ui.refreshPanel();
      if (this.building.active) this.ui.renderBuildBar();
    });
    this.input.onKey = (code) => this.onKey(code);
    const P = this.player;
    P.onStep = (s) => this.audio.step(s);
    P.onJump = () => this.audio.swing();
    P.onLand = () => this.audio.step('sand');
    P.onWaterChange = (inWater) => { if (inWater) { this.audio.splash(); this.fx.burst('splash', P.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), 14); } };
    P.onSwimStroke = () => { if (Math.random() < 0.5) this.audio.splash(); this.fx.burst('splash', P.pos.clone().add(new THREE.Vector3(0, 1.32, 0)).addScaledVector(P.forward, 0.5), 4); };

    // pre-render icons
    for (const id of Object.keys(ITEMS)) this.icons.item(id);
    for (const id of Object.keys(PIECES)) this.pieceIcon(id);
    this.charIcons = {};
    for (const v of ['m', 'f']) {
      const ch = new Character(v);
      ch.update(0.016, { speed: 0, grounded: true });
      this.charIcons[v] = this.icons.render('char:' + v, ch.root, { rx: -0.08, ry: 0.35, pad: 1.02 });
    }
    this.icons.dispose();

    const sp = this.terrain.spawn;
    P.teleport(sp.x, sp.z, Math.PI);
    this.rig.yaw = 0;
    this.load();
    this.applySettings();
    this.ui.renderHotbar();
    this.refreshHeld();
    this._torchFlame = null;
  }

  pieceIcon(id) {
    if (!this.pieceIcons[id]) {
      const obj = pieceObject(id === 'foundation' ? 'foundation_icon' : id);
      this.pieceIcons[id] = this.icons.render('piece:' + id, obj, { rx: -0.45, ry: 0.6, pad: 1.05 });
    }
    return this.pieceIcons[id];
  }

  // ---------------- input ----------------
  onKey(code) {
    if (!this.started) return;
    if (code.startsWith('Digit')) { const n = +code.slice(5); if (n >= 1 && n <= HOTBAR) this.selectSlot(n - 1); }
    if (code === 'Tab' || code === 'KeyI') { this.panelOpen ? this.ui.closePanel() : this.ui.openPanel('inv'); }
    if (code === 'KeyC') this.ui.openPanel('craft');
    if (code === 'KeyB') this.toggleBuild();
    if (code === 'KeyR' && this.building.active) this.building.rotate();
    if ((code === 'Escape' || code === 'KeyQ')) { if (this.panelOpen) this.ui.closePanel(); else if (this.building.active) this.toggleBuild(false); }
    if ((code === 'KeyE' || code === 'KeyF') && this.building.active) this.tryPlace();
  }

  onActionPressed() {
    if (this.building.active) { this.tryPlace(); return; }
    this.actionCooldown = 0;
  }

  selectSlot(i) {
    const s = this.inv.slots[i];
    if (!s) { this.selected = this.selected === i ? -1 : i; this.refreshHeld(); this.ui.renderHotbar(); return; }
    this.useSlot(i);
  }

  useSlot(i) {
    const s = this.inv.slots[i];
    if (!s) return;
    const it = ITEMS[s.id];
    if (it.food) { this.eat(i); return; }
    if (it.place) {
      if (this.building.active) this.toggleBuild(false);
      this.toggleBuild(true, it.place);
      return;
    }
    if (it.tool) {
      if (i >= HOTBAR) { // move tool to hotbar first
        let free = this.inv.slots.findIndex((x, k) => k < HOTBAR && !x);
        if (free < 0) free = 0;
        this.inv.swap(i, free); i = free;
      }
      this.selected = this.selected === i ? -1 : i;
    } else {
      this.selected = this.selected === i ? -1 : i;
    }
    this.refreshHeld();
    this.ui.renderHotbar();
  }

  heldTool() {
    const s = this.inv.slots[this.selected];
    return s && ITEMS[s.id].tool ? s.id : null;
  }

  refreshHeld() {
    const id = this.heldTool();
    if (id === this._heldId) return;
    this._heldId = id;
    const c = this.player.char;
    c.holdPose = id === 'torch' ? 'torch' : null;
    if (!id) { c.setHeld(null); this.fx.torch = null; return; }
    const m = itemMesh(id);
    m.scale.setScalar(1.4);
    if (id === 'torch') {
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      fl.center.set(0.5, 0.1);
      fl.scale.set(0.22, 0.38, 1);
      fl.position.set(0, 0.4, 0);
      m.add(fl);
      this.fx.torch = fl;
      this._torchFlame = fl;
    } else this.fx.torch = null;
    c.setHeld(m);
  }

  ensureTool(tool) {
    if (this.heldTool() === tool) return true;
    const idx = this.inv.slots.findIndex((s) => s && s.id === tool);
    if (idx < 0) return false;
    if (idx >= HOTBAR) { this.useSlot(idx); return true; }
    this.selected = idx;
    this.refreshHeld();
    this.ui.renderHotbar();
    return true;
  }

  toggleBuild(on = !this.building.active, piece) {
    if (on) {
      if (this.player.swimming) { this.ui.toast(null, 'Non puoi costruire mentre nuoti', true); return; }
      const p = piece || (PIECES[this.building.piece] ? this.building.piece : 'foundation');
      this.building.enter(p);
      const item = !PIECES[p];
      this.ui.showBuildBar(true, item ? ITEMS[p].name : null);
      this.buildHints = (this.buildHints || 0) + 1;
      if (item) this.ui.center(`Posiziona: ${ITEMS[p].name}`, 'Mira con la visuale · tocca il tasto azione', 1800);
      else if (this.buildHints <= 2) this.ui.center('Costruzione', 'Mira con la visuale · posiziona con il tasto azione', 2200);
    } else {
      this.building.exit();
      this.ui.showBuildBar(false);
    }
  }

  // ---------------- crafting / consuming ----------------
  craft(r) {
    if (!this.inv.consume(r.cost)) { this.audio.error(); return; }
    const n = r.n || 1;
    const left = this.inv.add(r.out, n);
    if (left) this.ui.toast(null, 'Zaino pieno!', true);
    this.progress.crafted[r.out] = (this.progress.crafted[r.out] || 0) + n;
    this.ui.toast(r.out, `Creato: ${ITEMS[r.out].name}`);
    this.audio.craft();
    this.fx.sparkle(this.player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 12);
    if (ITEMS[r.out].tool && this.heldTool() === null) {
      const idx = this.inv.slots.findIndex((s) => s && s.id === r.out);
      if (idx >= 0 && idx < HOTBAR) { this.selected = idx; this.refreshHeld(); this.ui.renderHotbar(); }
    }
    this.checkQuest();
  }

  eat(i) {
    const s = this.inv.slots[i];
    const it = ITEMS[s.id];
    if (this.player.char.busy) return;
    const id = s.id;
    this.inv.removeAt(i, 1);
    this.player.char.play('eat', 0.8);
    this.audio.eat();
    const S = this.stats;
    S.food = clamp(S.food + (it.food || 0), 0, 100);
    S.water = clamp(S.water + (it.water || 0), 0, 100);
    S.health = clamp(S.health + (it.health || 0), 0, 100);
    this.progress.ate[id] = (this.progress.ate[id] || 0) + 1;
    const parts = [];
    if (it.food) parts.push(`+${it.food} cibo`);
    if (it.water) parts.push(`+${it.water} acqua`);
    if (it.health) parts.push(`${it.health > 0 ? '+' : ''}${it.health} salute`);
    this.ui.toast(id, parts.join(' · '), (it.health || 0) < 0);
    this.checkQuest();
  }

  // little item meshes that hop into the backpack
  fly(id, from, n = 1) {
    this.flying ||= [];
    for (let i = 0; i < Math.min(n, 3); i++) {
      const m = itemMesh(id);
      m.castShadow = false;
      m.position.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.3, (Math.random() - 0.5) * 0.6));
      this.scene.add(m);
      this.flying.push({ m, from: m.position.clone(), t: -i * 0.08, spin: Math.random() * 6 });
    }
  }

  updateFlying(dt) {
    if (!this.flying) return;
    const to = this.player.pos.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(this.player.forward, -0.25);
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      const k = clamp(f.t / 0.45, 0, 1);
      const e = k * k * (3 - 2 * k);
      f.m.position.lerpVectors(f.from, to, e);
      f.m.position.y += Math.sin(k * Math.PI) * 1.0;
      f.m.rotation.set(f.spin + k * 6, k * 4, 0);
      f.m.scale.setScalar(1.3 * (1 - k * 0.7));
      if (k >= 1) { this.scene.remove(f.m); this.flying.splice(i, 1); }
    }
  }

  give(id, n, silent, from) {
    if (from) this.fly(id, from, n);
    const left = this.inv.add(id, n);
    if (n - left > 0) {
      this.progress.col[id] = (this.progress.col[id] || 0) + (n - left);
      if (!silent) this.ui.toast(id, `+${n - left} ${ITEMS[id].name}`);
    }
    if (left > 0) this.ui.toast(null, 'Zaino pieno!', true);
    this.checkQuest();
  }

  // ---------------- interaction ----------------
  findTarget() {
    const P = this.player, p = P.pos;
    if (P.swimming) return null;
    const fwd = P.forward;
    let best = null, bestScore = 1e9;
    const consider = (o, kind, reach) => {
      const dx = o.x - p.x, dz = o.z - p.z;
      const d = Math.hypot(dx, dz);
      const edge = d - (o.r || 0.3);
      if (edge > reach) return;
      const dot = d > 0.01 ? (dx * fwd.x + dz * fwd.z) / d : 1;
      if (dot < (edge < 0.6 ? -0.3 : 0.25)) return;
      if (Math.abs((o.y ?? p.y) - p.y) > 2.2) return;
      const score = edge - dot * 0.9;
      if (score < bestScore) { bestScore = score; best = { o, kind }; }
    };
    for (const r of this.nature.query(p.x, p.z, 5)) if (r.alive) consider(r, r.kind, REACH[r.kind] || 1.5);
    for (const c of this.crabs.list) if (c.alive) consider(c, 'crab', REACH.crab);
    for (const pl of this.building.placeables) consider({ ...pl, r: 0.5, ref: pl }, pl.type, REACH[pl.type]);
    if (best) return best;
    // water
    const T = this.terrain;
    const ax = p.x + fwd.x * 1.4, az = p.z + fwd.z * 1.4;
    if (T.isInPond(ax, az, 1.2) || T.isInPond(p.x, p.z, 1.0)) return { kind: 'water', fresh: true, o: { x: ax, z: az } };
    if (T.heightAt(ax, az) < -0.05) return { kind: 'water', fresh: false, o: { x: ax, z: az } };
    return null;
  }

  describe(t) {
    if (!t) {
      const tool = this.heldTool();
      if (tool && tool !== 'torch') return { label: 'Colpisci', icon: 'item:' + tool, ready: false };
      return { label: 'Usa', icon: 'hand', ready: false };
    }
    const o = t.o;
    switch (t.kind) {
      case 'pickup': return { label: 'Raccogli', icon: 'hand', ready: true, name: o.label };
      case 'fiber': return { label: 'Raccogli', icon: 'hand', ready: true, name: 'Pianta da fibra' };
      case 'berry': return { label: 'Raccogli', icon: 'eat', ready: true, name: 'Cespuglio di bacche' };
      case 'palm': case 'tree': {
        const has = this.inv.count('axe') > 0;
        return { label: has ? 'Taglia' : 'Serve l’ascia', icon: 'item:axe', ready: has, name: o.label, hp: o.hp < o.maxHp ? o.hp / o.maxHp : null };
      }
      case 'node': {
        const has = this.inv.count('pickaxe') > 0;
        return { label: has ? 'Scava' : 'Serve il piccone', icon: 'item:pickaxe', ready: has, name: o.label, hp: o.hp < o.maxHp ? o.hp / o.maxHp : null };
      }
      case 'crab': return { label: 'Cattura', icon: 'hand', ready: true, name: 'Granchio' };
      case 'campfire': return this.inv.count('crab_raw') > 0 ? { label: 'Cucina', icon: 'fire', ready: true, name: 'Falò' } : { label: 'Scaldati', icon: 'fire', ready: true, name: 'Falò' };
      case 'bed': return { label: this.sky.isNight() || this.sky.hours > 18.5 ? 'Dormi' : 'Riposa', icon: 'moon', ready: true, name: 'Giaciglio di foglie' };
      case 'water': return t.fresh ? { label: 'Bevi', icon: 'drink', ready: true, name: 'Acqua dolce' } : { label: 'Bevi', icon: 'drink', ready: true, name: 'Acqua di mare' };
    }
    return { label: 'Usa', icon: 'hand', ready: false };
  }

  faceTarget(o) {
    const P = this.player;
    P.facing = Math.atan2(o.x - P.pos.x, o.z - P.pos.z);
  }

  doAction() {
    const t = this.target;
    const P = this.player, c = P.char;
    if (c.busy || P.swimming || this.dead) return;
    if (!t) {
      const tool = this.heldTool();
      if (tool && tool !== 'torch') { c.play('chop', 0.6); this.audio.swing(); this.actionCooldown = 0.65; }
      return;
    }
    const o = t.o;
    const time = this.time;
    switch (t.kind) {
      case 'pickup': case 'fiber': case 'berry': {
        this.faceTarget(o);
        c.play('gather', 0.55, () => {
          if (!o.alive) return;
          if (t.kind === 'pickup') {
            this.give(o.item, 1, false, new THREE.Vector3(o.x, o.y + 0.1, o.z));
            this.nature.remove(o, 180, time);
            this.emit('remove', { i: o.id, d: 180 });
            this.audio.pickup();
          } else if (t.kind === 'fiber') {
            this.give('fiber', 2 + (Math.random() < 0.4 ? 1 : 0), false, new THREE.Vector3(o.x, o.y + 0.6, o.z));
            this.nature.remove(o, 160, time);
            this.emit('remove', { i: o.id, d: 160 });
            this.fx.burst('grass', new THREE.Vector3(o.x, o.y + 0.6, o.z), 10);
            this.audio.rustle();
          } else {
            this.give('berries', 2 + Math.floor(Math.random() * 2), false, new THREE.Vector3(o.x, o.y + 0.9, o.z));
            this.nature.remove(o, 200, time);
            this.emit('remove', { i: o.id, d: 200 });
            this.fx.burst('berry', new THREE.Vector3(o.x, o.y + 0.9, o.z), 8);
            this.audio.rustle();
          }
        }, 0.5);
        this.actionCooldown = 0.6;
        break;
      }
      case 'palm': case 'tree': {
        if (!this.ensureTool('axe')) { this.ui.toast('axe', 'Ti serve un’ascia di pietra', true); this.audio.error(); this.actionCooldown = 1; return; }
        this.faceTarget(o);
        this.audio.swing();
        c.play('chop', 0.62, () => {
          if (!o.alive) return;
          o.hp--;
          const hitAt = new THREE.Vector3(o.x, o.y + 1.1, o.z).addScaledVector(P.forward, -0.35);
          this.fx.burst('wood', hitAt, 14);
          this.audio.chop();
          this.rig.shake(0.05, 0.15);
          this.nature.shake(o, 1, P.pos.x, P.pos.z);
          if (o.hp > 0) this.emit('hit', { i: o.id, hp: o.hp, x: P.pos.x, z: P.pos.z });
          if (o.hp <= 0) {
            this.emit('fell', { i: o.id, d: 300, x: P.pos.x, z: P.pos.z });
            o.alive = false;
            if (o.collider) o.collider.active = false;
            this.nature.fellTree(o, P.pos.x, P.pos.z, () => {
              this.audio.treeFall();
              this.rig.shake(0.12, 0.35);
              const fall = new THREE.Vector3(o.x, o.y + 0.3, o.z).addScaledVector(new THREE.Vector3(o.x - P.pos.x, 0, o.z - P.pos.z).normalize(), 3);
              this.fx.burst('leaf', fall.clone().add(new THREE.Vector3(0, 0.5, 0)), 24);
              this.fx.burst('dust', fall, 14);
              const at = fall.clone().add(new THREE.Vector3(0, 0.4, 0));
              if (o.kind === 'palm') {
                this.give('wood', 4, false, at); this.give('leaf', 3, false, at.clone().addScaledVector(fall.clone().sub(new THREE.Vector3(o.x, fall.y, o.z)).normalize(), 2));
                if (Math.random() < 0.6) this.give('coconut', 1 + (Math.random() < 0.3 ? 1 : 0), false, at);
              } else {
                this.give('wood', 5, false, at); this.give('stick', 2, false, at);
                if (Math.random() < 0.3) this.give('leaf', 1);
              }
              this.progress.felled++;
              this.checkQuest();
            });
            o.respawnAt = time + 300;
          }
        }, 0.55);
        this.actionCooldown = 0.65;
        break;
      }
      case 'node': {
        if (!this.ensureTool('pickaxe')) { this.ui.toast('pickaxe', 'Ti serve un piccone di pietra', true); this.audio.error(); this.actionCooldown = 1; return; }
        this.faceTarget(o);
        this.audio.swing();
        c.play('mine', 0.65, () => {
          if (!o.alive) return;
          o.hp--;
          const hitAt = new THREE.Vector3(o.x, o.y + 0.6, o.z).addScaledVector(P.forward, -o.r * 0.8);
          this.fx.burst('stone', hitAt, 14);
          this.fx.sparkle(hitAt, 4, 0xffc070);
          this.audio.mine();
          this.rig.shake(0.05, 0.15);
          this.nature.shake(o, 0.6, P.pos.x, P.pos.z);
          if (o.hp > 0) this.emit('hit', { i: o.id, hp: o.hp, x: P.pos.x, z: P.pos.z });
          this.give('stone', 1, false, hitAt);
          if (o.hp <= 0) {
            this.give('stone', 3, false, hitAt);
            this.fx.burst('dust', new THREE.Vector3(o.x, o.y + 0.4, o.z), 20);
            this.nature.remove(o, 240, time);
            this.emit('remove', { i: o.id, d: 240 });
          }
        }, 0.55);
        this.actionCooldown = 0.7;
        break;
      }
      case 'crab': {
        this.faceTarget(o);
        c.play(this.heldTool() && this.heldTool() !== 'torch' ? 'attack' : 'gather', 0.5, () => {
          if (!o.alive) return;
          if (Math.hypot(o.x - P.pos.x, o.z - P.pos.z) > 2.2) { this.ui.toast(null, 'Mancato! I granchi sono veloci…'); return; }
          o.hp -= this.heldTool() ? 2 : 1;
          this.fx.burst('splash', new THREE.Vector3(o.x, o.y + 0.2, o.z), 6);
          this.audio.hit(1500, 0.08, 0.3, 2);
          if (o.hp <= 0) { this.crabs.kill(o, time); this.give('crab_raw', 1); this.audio.pickup(); }
        }, 0.5);
        this.actionCooldown = 0.55;
        break;
      }
      case 'water': {
        if (!t.fresh) { this.ui.toast(null, 'Troppo salata! Cerca acqua dolce nell’entroterra.', true); this.audio.error(); this.actionCooldown = 1.2; return; }
        this.faceTarget(o);
        c.play('drink', 1.1, () => {
          this.stats.water = clamp(this.stats.water + 35, 0, 100);
          this.progress.drank++;
          this.audio.drink();
          this.fx.burst('splash', P.pos.clone().addScaledVector(P.forward, 0.8).add(new THREE.Vector3(0, 0.2, 0)), 10);
          this.ui.toast(null, '💧 +35 acqua');
          this.checkQuest();
        }, 0.5);
        this.actionCooldown = 1.2;
        break;
      }
      case 'campfire': {
        this.faceTarget(o);
        if (this.inv.count('crab_raw') > 0) {
          c.play('gather', 1.4, () => {
            if (this.inv.remove('crab_raw', 1)) {
              this.inv.add('crab_cooked', 1);
              this.progress.crafted.crab_cooked = (this.progress.crafted.crab_cooked || 0) + 1;
              this.ui.toast('crab_cooked', 'Granchio alla brace pronto!');
              this.audio.craft();
              this.checkQuest();
            }
          }, 0.8);
          this.actionCooldown = 1.5;
        } else {
          this.ui.toast(null, '🔥 Che tepore. Cattura granchi sulla spiaggia per cucinarli.');
          this.actionCooldown = 2;
        }
        break;
      }
      case 'bed': {
        this.sleep(o.ref);
        this.actionCooldown = 3;
        break;
      }
    }
  }

  sleep(bed) {
    const night = this.sky.isNight() || this.sky.hours > 18.5 || this.sky.hours < 5;
    this.respawn = { x: bed.x, z: bed.z };
    this.progress.slept++;
    if (!night) {
      this.ui.center('Riposato', 'Punto di rinascita impostato. Dormi qui di notte per arrivare al mattino.', 2800);
      this.stats.health = clamp(this.stats.health + 10, 0, 100);
      this.audio.quest();
      this.checkQuest();
      this.save();
      return;
    }
    this.emit('skip', {});
    this.skipNight(false);
  }

  // Fade out and wake at dawn. In co-op, either player sleeping at night moves both to morning.
  skipNight(fromPartner) {
    if (this._skipping) return;
    this._skipping = true;
    if (fromPartner) this.ui.center('Il tuo compagno si è messo a dormire…', '', 1500);
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    this.player.frozen = true;
    setTimeout(() => {
      this._skipping = false;
      if (this.sky.time > 0.5) this.sky.day++;
      this.sky.time = 0.27;
      this.stats.health = clamp(this.stats.health + 35, 0, 100);
      this.stats.food = clamp(this.stats.food - 12, 0, 100);
      this.stats.water = clamp(this.stats.water - 12, 0, 100);
      fade.classList.remove('on');
      this.player.frozen = false;
      this.ui.center(`Giorno ${this.sky.day}`, 'Un nuovo mattino sull’isola', 3000);
      this.checkQuest();
      this.save();
    }, 1600);
  }

  tryPlace() {
    const B = this.building;
    const t = B.target;
    if (!t) return;
    const piece = B.piece;
    const isItem = piece === 'campfire' || piece === 'bed';
    const cost = isItem ? { [piece]: 1 } : PIECES[piece].cost;
    if (!this.inv.has(cost)) {
      const miss = Object.entries(cost).filter(([k, n]) => this.inv.count(k) < n).map(([k, n]) => `${n - this.inv.count(k)} ${ITEMS[k].name}`).join(', ');
      this.ui.toast(null, `Mancano: ${miss}`, true); this.audio.error(); return;
    }
    if (!t.ok) {
      const why = piece === 'foundation' ? 'Serve un terreno libero e piano' : piece === 'roof' ? 'Il tetto va sopra una fondazione' : isItem ? 'Trova un punto libero e piano' : 'Le pareti vanno sul bordo di una fondazione';
      this.ui.toast(null, why, true); this.audio.error(); return;
    }
    this.inv.consume(cost);
    B.placePiece(piece, t, true);
    this.emit('build', { type: piece, tg: { i: t.i, j: t.j, d: t.d, x: t.x, y: t.y, z: t.z, rot: t.rot, level: t.level } });
    this.audio.build();
    this.player.char.play('build', 0.5);
    this.rig.shake(0.04, 0.15);
    const pl = this.progress.placed;
    if (piece === 'foundation') pl.foundation++;
    else if (piece === 'roof') pl.roof++;
    else if (piece === 'campfire') pl.campfire++;
    else if (piece === 'bed') pl.bed++;
    else { pl.walls++; if (piece === 'doorway') pl.doorway++; }
    if (isItem) this.toggleBuild(false);
    this.checkShelter();
    this.checkQuest();
    this.save();
  }

  checkShelter() {
    if (this.progress.shelterDone) return;
    const s = this.building.shelterCells();
    if (s.length) {
      this.progress.shelterDone = true;
      this.ui.center('Rifugio completato!', 'Hai costruito la tua prima casa sull’isola', 3500);
      this.audio.quest();
      const c = s[0];
      this.fx.sparkle(new THREE.Vector3((c.i + 0.5) * 3, this.player.pos.y + 1.5, (c.j + 0.5) * 3), 40);
    }
  }

  // ---------------- quests ----------------
  currentQuest() {
    if (this.questIndex >= QUESTS.length) return FREE_PLAY(this.progress);
    const q = QUESTS[this.questIndex];
    return { title: q.title, lines: q.lines(this.progress), hint: q.hint };
  }

  checkQuest() {
    if (this.questIndex >= QUESTS.length) return;
    const q = this.currentQuest();
    if (q.lines.every((l) => l.done) && !this._questPending) {
      this._questPending = true;
      this.ui.setQuest(q);
      setTimeout(() => {
        this.audio.quest();
        this.ui.center('Obiettivo completato', q.title, 2200);
        this.fx.sparkle(this.player.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 18);
        this.questIndex++;
        this._questPending = false;
        if (this.questIndex >= QUESTS.length) {
          setTimeout(() => this.ui.center('Casa dolce casa', 'L’isola è tutta da esplorare', 3500), 2400);
        }
        this.checkQuest();
      }, 700);
    }
  }

  // ---------------- survival ----------------
  updateSurvival(dt) {
    const S = this.stats, P = this.player;
    const exert = P.running ? 1.7 : P.swimming ? 1.5 : 1;
    const nearFire = this.building.placeables.some((p) => p.type === 'campfire' && Math.hypot(p.x - P.pos.x, p.z - P.pos.z) < 5);
    S.water -= dt * 0.16 * exert;
    S.food -= dt * 0.105 * exert;
    if (S.water <= 0 || S.food <= 0) {
      S.health -= dt * (S.water <= 0 && S.food <= 0 ? 1.6 : 0.8);
      if (!this._starveWarn || this.time - this._starveWarn > 12) { this._starveWarn = this.time; this.ui.toast(null, S.water <= 0 ? 'Sei disidratato!' : 'Stai morendo di fame!', true); this.audio.hurt(); }
    } else if (S.water > 35 && S.food > 35) {
      S.health += dt * (nearFire || this.building.isSheltered(P.pos.x, P.pos.z) ? 0.6 : 0.25);
    }
    S.water = clamp(S.water, 0, 100); S.food = clamp(S.food, 0, 100); S.health = clamp(S.health, 0, 100);
    if (S.health <= 0 && !this.dead) this.die();
    if (!this._lowWarn || this.time - this._lowWarn > 40) {
      if (S.water < 25) { this._lowWarn = this.time; this.ui.toast(null, 'Hai sete… cerca acqua dolce o cocchi.', true); }
      else if (S.food < 25) { this._lowWarn = this.time; this.ui.toast(null, 'Hai fame… bacche, cocchi o granchi.', true); }
    }
  }

  die() {
    this.dead = true;
    const fade = document.getElementById('fade');
    this.ui.center('Sei svenuto…', 'Il riposo ti rimetterà in forze', 2500);
    fade.classList.add('on');
    this.player.frozen = true;
    setTimeout(() => {
      const r = this.respawn;
      this.player.teleport(r.x + 1, r.z + 1);
      this.stats = { health: 60, water: 55, food: 55 };
      this.sky.time = Math.max(this.sky.time, 0.27);
      fade.classList.remove('on');
      this.player.frozen = false;
      this.dead = false;
    }, 2400);
  }

  // ---------------- save / load ----------------
  save() {
    if (!this.started || this.noSave) return;
    if (this.mode === 'guest') {
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify({ v: 1, stats: this.stats, progress: this.progress, questIndex: this.questIndex, inv: this.inv.toJSON(), selected: this.selected }));
      } catch { /* storage unavailable */ }
      return;
    }
    try {
      const depleted = [];
      this.nature.all.forEach((r, i) => { if (!r.alive) depleted.push([i, Math.max(0, (r.respawnAt || 0) - this.time)]); });
      const data = {
        v: 1, stats: this.stats, progress: this.progress, questIndex: this.questIndex, inv: this.inv.toJSON(), selected: this.selected,
        time: this.sky.time, day: this.sky.day, player: { x: this.player.pos.x, z: this.player.pos.z, f: this.player.facing },
        building: this.building.toJSON(), respawn: this.respawn, depleted,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable */ }
  }

  toggleSetting(k) {
    const s = this.settings;
    if (k === 'quality') s.quality = s.quality === 'high' ? 'low' : 'high';
    else s[k] = !s[k];
    try { localStorage.setItem('ourisland-settings', JSON.stringify(s)); } catch { /* ignore */ }
    this.applySettings();
  }

  applySettings() {
    const s = this.settings;
    this.audio.sfxOn = s.sfx; this.audio.musicOn = s.music;
    this.rig.autoFollow = s.follow;
    const high = s.quality === 'high';
    if (this.renderer.shadowMap.enabled !== high) {
      this.renderer.shadowMap.enabled = high;
      this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
    this.onQualityChange?.(high);
  }

  setCharacter(v) {
    if (v === this.settings.character) return;
    this.settings.character = v;
    try { localStorage.setItem('ourisland-settings', JSON.stringify(this.settings)); } catch { /* ignore */ }
    // swap the player model, keeping position/animation state
    const P = this.player, old = P.char;
    const ch = new Character(v);
    this.scene.remove(old.root);
    this.scene.add(ch.root);
    ch.root.position.copy(old.root.position); ch.root.rotation.copy(old.root.rotation);
    P.char = ch;
    this._heldId = undefined;
    this.refreshHeld();
  }

  emit(type, data) { this.coop?.event(type, data); }

  // Building quests count everything built on the island, by either player.
  syncPlacedCounts() {
    const c = this.building.counts(), pl = this.progress.placed;
    for (const k of Object.keys(pl)) pl[k] = Math.max(pl[k], c[k] ?? 0);
  }

  async startCoop(role, code) {
    const { Coop } = await import('../net/coop.js');
    this.coop?.destroy();
    this.coop = new Coop(this, role, code);
    await this.coop.start();
    return this.coop;
  }

  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
  clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

  load() {
    let d;
    try { d = JSON.parse(localStorage.getItem(this.mode === 'guest' ? GUEST_KEY : SAVE_KEY) || 'null'); } catch { d = null; }
    if (!d || d.v !== 1) return false;
    if (this.mode === 'guest') {
      Object.assign(this.stats, d.stats);
      this.progress = Object.assign(this.progress, d.progress);
      this.progress.placed = Object.assign({ foundation: 0, walls: 0, doorway: 0, roof: 0, campfire: 0, bed: 0 }, d.progress.placed);
      this.questIndex = d.questIndex || 0;
      this.inv.load(d.inv || []);
      this.selected = d.selected ?? -1;
      this.loaded = true;
      return true;
    }
    Object.assign(this.stats, d.stats);
    this.progress = Object.assign(this.progress, d.progress);
    this.progress.placed = Object.assign({ foundation: 0, walls: 0, doorway: 0, roof: 0, campfire: 0, bed: 0 }, d.progress.placed);
    this.questIndex = d.questIndex || 0;
    this.inv.load(d.inv || []);
    this.selected = d.selected ?? -1;
    this.sky.time = d.time ?? 0.33; this.sky.day = d.day || 1;
    this.building.load(d.building);
    this.respawn = d.respawn || this.respawn;
    for (const [i, rem] of d.depleted || []) {
      const r = this.nature.all[i];
      if (r) this.nature.removeInstant(r, rem || 60, 0);
    }
    if (d.player) this.player.teleport(d.player.x, d.player.z, d.player.f);
    this.rig.yaw = this.player.facing + Math.PI;
    this.loaded = true;
    return true;
  }

  // ---------------- main loop ----------------
  update(dt) {
    this.time += dt;
    shared.uTime.value += dt;
    const P = this.player;
    const inputEnabled = this.started && !this.panelOpen && !this.dead;
    this.input.enabled = inputEnabled;
    const intent = this.input.poll();

    if (this.started) {
      P.update(dt, intent, this.rig.yaw);
      this.rig.building = this.building.active;
      this.rig.update(dt, P, intent);
      if (this.intro && this.intro.t < 1) {
        const I = this.intro;
        I.t = Math.min(1, I.t + dt / 2.4);
        const k = I.t < 0.5 ? 4 * I.t ** 3 : 1 - Math.pow(-2 * I.t + 2, 3) / 2;
        const toQ = this.camera.quaternion.clone();
        this.camera.position.lerpVectors(I.pos, this.camera.position, k);
        this.camera.quaternion.slerpQuaternions(I.quat, toQ, k);
      }
    } else {
      // title-screen orbit
      this.titleT = (this.titleT ?? 0) + dt;
      this.titleYaw = 0.25 + Math.sin(this.titleT * 0.045) * 0.75; // sweep back and forth over the south coast
      const sp = this.terrain.spawn;
      const cx = sp.x - 5, cz = sp.z - 40;
      const x = cx + Math.sin(this.titleYaw) * 90, z = cz + Math.cos(this.titleYaw) * 90;
      this.camera.position.set(x, Math.max(32, this.terrain.heightAt(x, z) + 18), z);
      this.camera.lookAt(cx, 8, cz);
      P.update(dt, { x: 0, y: 0, sprint: false, jump: false }, 0);
    }

    this.sky.update(dt, this.started ? P.pos : this.camera.position);
    this.fill.position.copy(this.camera.position).add(new THREE.Vector3(0, 2, 0));
    this.fill.intensity = this.sky.night * 9;
    this.sky.applyToWater(this.ocean.material); this.sky.applyToWater(this.pond.material);
    this.ocean.material.uniforms.uTime.value += dt;
    this.pond.material.uniforms.uTime.value += dt;
    this.nature.update(dt, this.camera.position, this.time);
    this.crabs.update(dt, P, this.time);
    this.birds.update(dt, this.sky.night);
    this.props.update(dt, this.time);
    this.building.animate(dt);
    this.coop?.update(dt);
    // hide the roof over the player's head so the camera can see inside
    const here = this.building.cells.get(this.building.key(Math.floor(P.pos.x / 3), Math.floor(P.pos.z / 3)));
    const underRoof = here && here.roof && P.pos.y < here.level + 2;
    for (const c of this.building.cells.values()) {
      if (c.roofObj) c.roofObj.visible = !(underRoof && c.roofObj.position.distanceTo(P.pos) < 9);
    }
    this.updateFlying(dt);
    this.fx.update(dt, this.camera.position, this.sky.night);
    this.fx.setScale(this.renderer.domElement.height / this.renderer.getPixelRatio() * 0.9);

    if (!this.started) return;

    // building ghost
    if (this.building.active) {
      const B = this.building;
      const cost = B.piece === 'campfire' || B.piece === 'bed' ? { [B.piece]: 1 } : PIECES[B.piece].cost;
      B.update(dt, P, this.rig.yaw, this.inv.has(cost));
      this.ui.setAction({ label: 'Posiziona', icon: 'hammer', ready: B.target && B.target.ok && this.inv.has(cost) });
      this.ui.setTarget(null);
    } else {
      // interaction target
      this.target = this.findTarget();
      const d = this.describe(this.target);
      this.ui.setAction(d);
      this.ui.setTarget(this.target ? d.name : null, d.hp);
      this.actionCooldown -= dt;
      if (intent.action && this.actionCooldown <= 0 && !P.char.busy) this.doAction();
    }

    this.updateSurvival(dt);
    if (!this.progress.reachedPeak && P.pos.y > 40) { this.progress.reachedPeak = true; this.ui.center('Che vista!', 'Sei salito in alto tra i picchi', 2500); }

    // HUD
    this.updateWaypoint();
    {
      const fwd = this.camera.getWorldDirection(new THREE.Vector3());
      const heading = Math.atan2(fwd.x, -fwd.z);
      const t = this._wpTarget;
      this.ui.updateCompass(heading, t ? Math.atan2(t.x - P.pos.x, -(t.z - P.pos.z)) : null);
    }
    this.ui.setStats(this.stats);
    this.ui.setQuest(this.currentQuest());
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      const markers = [{ x: this.terrain.pond.x, z: this.terrain.pond.z, color: '#4fc8ff', r: 6, glyph: '~' }];
      for (const p of this.building.placeables) markers.push({ x: p.x, z: p.z, color: p.type === 'campfire' ? '#ff8a2a' : '#e8b04a', r: 4 });
      for (const [k] of this.building.cells) { const [i, j] = k.split(',').map(Number); markers.push({ x: (i + 0.5) * 3, z: (j + 0.5) * 3, color: '#c89050', r: 3 }); }
      const R = this.coop?.remote;
      if (R && R.char.root.visible) markers.push({ x: R.pos.x, z: R.pos.z, color: '#ffd27a', r: 5.5, glyph: '' });
      this.ui.drawMinimap(P, markers);
      this.ui.setPartner(this.coop);
      this.ui.setClock(this.sky.hours, this.sky.day);
    }
    // ambience
    this.audio.update(dt, { coastDist: this.terrain.coastDist(P.pos.x, P.pos.z), night: this.sky.night });
    // night warning
    const nightNow = this.sky.night > 0.5;
    if (nightNow && !this._wasNight) this.ui.toast(null, '🌙 Scende la notte. Resta vicino al fuoco o dormi.');
    this._wasNight = nightNow;
    // fireflies drifting around at night
    if (this.sky.night > 0.5 && Math.random() < dt * 6) {
      const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 12;
      const x = P.pos.x + Math.cos(a) * d, z = P.pos.z + Math.sin(a) * d;
      const h = this.terrain.heightAt(x, z);
      if (h > 1.5) this.fx.firefly(new THREE.Vector3(x, h + 0.4 + Math.random() * 1.5, z));
    }
    // hint sparkles on nearby pickups early on
    this.sparkT = (this.sparkT || 0) - dt;
    if (this.questIndex <= 1 && this.sparkT <= 0) {
      this.sparkT = 1.6;
      const want = this.questIndex === 0 ? 'pickup' : 'fiber';
      const near = this.nature.query(P.pos.x, P.pos.z, 18).filter((r) => r.alive && r.kind === want).sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z)).slice(0, 3);
      for (const r of near) this.fx.sparkle(new THREE.Vector3(r.x, r.y + 0.2, r.z), 3);
    }
    // autosave
    this.saveT = (this.saveT || 0) + dt;
    if (this.saveT > 20) { this.saveT = 0; this.save(); }
  }

  // Points the player at the current objective (nearest relevant resource / place).
  suggestRecipe() {
    const q = QUESTS[this.questIndex];
    if (!q) return null;
    if (q.id === 'axe') return 'axe';
    if (q.id === 'campfire') return 'campfire';
    if (q.id === 'bed') return this.inv.count('rope') >= 2 ? 'bed' : 'rope';
    if (q.id === 'foundation' || q.id === 'walls') return 'rope';
    return null;
  }

  // What the current objective still needs: { src: world target | null, ui: 'bag' | 'build' | null }
  questNeed() {
    const P = this.player.pos;
    const q = QUESTS[this.questIndex];
    if (!q) return {};
    const inv = this.inv, pr = this.progress;
    const nearest = (pred, r = 70) => {
      let best = null, bd = 1e9;
      for (const o of this.nature.query(P.x, P.z, r)) {
        if (!o.alive || !pred(o)) continue;
        const d = Math.hypot(o.x - P.x, o.z - P.z);
        if (d < bd) { bd = d; best = o; }
      }
      return best && { x: best.x, y: best.y + 1.2, z: best.z };
    };
    const source = (id) => {
      if (id === 'wood' || id === 'leaf') return inv.count('axe') ? nearest((o) => o.kind === 'palm') : nearest((o) => o.kind === 'pickup' && o.item === 'wood');
      if (id === 'stick') return nearest((o) => o.kind === 'pickup' && o.item === 'stick');
      if (id === 'stone') return nearest((o) => o.kind === 'pickup' && o.item === 'stone') || nearest((o) => o.kind === 'node');
      if (id === 'fiber' || id === 'rope') return nearest((o) => o.kind === 'fiber');
      return null;
    };
    // first missing ingredient of a cost (rope counts as 3 fiber)
    const missing = (cost) => {
      for (const [k, n] of Object.entries(cost)) {
        if (inv.count(k) >= n) continue;
        if (k === 'rope' && inv.count('fiber') >= 3 * (n - inv.count('rope'))) return { ui: 'bag' };
        return { src: source(k) };
      }
      return null;
    };
    const R = (out) => RECIPES.find((r) => r.out === out).cost;
    switch (q.id) {
      case 'gather': return { src: nearest((o) => o.kind === 'pickup' && ((pr.col.stick || 0) < 3 ? o.item === 'stick' : o.item === 'stone'), 40) };
      case 'fiber': return { src: nearest((o) => o.kind === 'fiber') };
      case 'axe': return missing(R('axe')) || { ui: 'bag' };
      case 'chop': return inv.count('axe') ? { src: nearest((o) => o.kind === 'palm', 40) } : {};
      case 'campfire':
        if (!(pr.crafted.campfire || inv.count('campfire'))) return missing(R('campfire')) || { ui: 'bag' };
        return { ui: 'hotbar' };
      case 'drink': { const p = this.terrain.pond; return { src: { x: p.x, y: p.y + 2, z: p.z } }; }
      case 'foundation': return missing(PIECES.foundation.cost) || { ui: 'build' };
      case 'walls': return missing(PIECES.wall.cost) || { ui: 'build' };
      case 'roof': return missing(PIECES.roof.cost) || { ui: 'build' };
      case 'bed':
        if (!(pr.crafted.bed || inv.count('bed'))) return missing(R('bed')) || { ui: 'bag' };
        return pr.placed.bed ? {} : { ui: 'hotbar' };
      default: return {};
    }
  }

  updateWaypoint() {
    this.wpT = (this.wpT || 0) - 1;
    if (this.wpT <= 0) {
      this.wpT = 10;
      const need = this.questNeed() || {};
      this._wpTarget = need.src || null;
      this.ui.attention(need.ui);
    }
    const t = this._wpTarget;
    const P = this.player.pos;
    if (!t || this.building.active || this.panelOpen) { this.ui.setWaypoint(null); return; }
    const d = Math.hypot(t.x - P.x, t.z - P.z);
    if (d < 2.2) { this.ui.setWaypoint(null); return; }
    const v = new THREE.Vector3(t.x, t.y, t.z).project(this.camera);
    const W = window.innerWidth, H = window.innerHeight;
    let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
    const behind = v.z > 1;
    if (behind) { x = W - x; y = H * 0.62; }
    x = clamp(x, 70, W - 90); y = clamp(y, 70, H - 120);
    this.ui.setWaypoint({ x, y }, d);
  }

  start() {
    this.started = true;
    this.intro = this.titleYaw !== undefined ? { t: 0, pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() } : null;
    this.audio.unlock();
    this.rig.target.copy(this.player.pos);
    if (this.mode === 'guest') {
      this.intro = null;
      setTimeout(() => this.ui.center('L’isola del tuo compagno', 'Esplorate, raccogliete e costruite insieme', 3500), 400);
    } else if (!this.loaded) {
      this.rig.yaw = 0;
      this.player.char.play('wake', 3.2);
      this.player.frozen = true;
      setTimeout(() => { this.player.frozen = false; }, 2400);
      setTimeout(() => this.ui.center('Giorno 1', 'Sei naufragato. Raccogli ciò che trovi.', 3500), 600);
    } else {
      setTimeout(() => this.ui.center('Bentornato', `Giorno ${this.sky.day}`, 2500), 400);
    }
  }
}
