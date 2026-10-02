// Base infrastructure that works on its own over played time: chicken coops and water collectors.
// State lives in the placeable's `data` (saved with the building). Chickens are only drawn when a real
// chicken model exists (assets/external/animals/chicken.glb); otherwise the coop shows hens as a count.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { ASSETS } from '../world/assets.js';
import { itemGeometry, itemMaterial, SMELT, DRYING } from './items.js';

export const COOP = { maxHens: 6, layEvery: 90, breedEvery: 240, hatchTime: 120, feedPerEgg: 1, feedPerChick: 2, maxEggs: 12, maxFeed: 30 };
export const COLLECTOR = { every: 30, max: 10, drink: 30 };
export const RACK = { slots: 4, time: 150 };

export class Base {
  constructor(game) { this.g = game; this.t = 0; }
  now() { return this.g.progress.playTime || 0; }
  coops() { return this.g.building.placeables.filter((p) => p.type === 'coop'); }
  collectors() { return this.g.building.placeables.filter((p) => p.type === 'water_collector'); }

  init(p) {
    const now = this.now();
    if (p.type === 'coop') p.data = Object.assign({ hens: 0, feed: 0, eggs: 0, t: now, breedT: now, hatch: null }, p.data || {});
    if (p.type === 'water_collector') p.data = Object.assign({ water: 0, t: now }, p.data || {});
    if (p.type === 'furnace') p.data = Object.assign({ ore: 0, fuel: 0, out: 0, t: 0, last: now }, p.data || {});
    if (p.type === 'drying_rack') p.data = Object.assign({ hang: [] }, p.data || {});
    this.refresh(p);
  }

  // ---- coop ----
  addFeed(p, n) { const d = p.data; const k = Math.min(n, COOP.maxFeed - d.feed); d.feed += k; return k; }
  takeEggs(p) { const n = p.data.eggs; p.data.eggs = 0; this.refresh(p); return n; }
  startHatch(p) { p.data.hatch = this.now(); this.refresh(p); }

  stepCoop(p) {
    const d = p.data, now = this.now();
    // an egg set to hatch becomes a hen after a while, as long as there is feed
    if (d.hatch != null && now - d.hatch >= COOP.hatchTime && d.feed > 0 && d.hens < COOP.maxHens) { d.hatch = null; d.hens++; d.feed--; this.g.onBaseEvent?.('hatch', p); }
    // breeding first: two or more fed hens raise a chick now and then
    while (now - d.breedT >= COOP.breedEvery) {
      d.breedT += COOP.breedEvery;
      if (d.hens >= 2 && d.hens < COOP.maxHens && d.feed >= COOP.feedPerChick) { d.hens++; d.feed -= COOP.feedPerChick; this.g.onBaseEvent?.('breed', p); }
    }
    // fed hens lay
    while (now - d.t >= COOP.layEvery) {
      d.t += COOP.layEvery;
      const n = Math.min(d.hens, Math.floor(d.feed / COOP.feedPerEgg), COOP.maxEggs - d.eggs);
      if (n > 0) { d.eggs += n; d.feed -= n * COOP.feedPerEgg; }
    }
  }

  // ---- water collector ----
  stepCollector(p) {
    const d = p.data, now = this.now();
    while (now - d.t >= COLLECTOR.every) { d.t += COLLECTOR.every; if (d.water < COLLECTOR.max) d.water++; }
  }
  drink(p) { if (p.data.water <= 0) return false; p.data.water--; this.refresh(p); return true; }

  // ---- furnace: ore + fuel -> ingots over played time ----
  stepFurnace(p) {
    const d = p.data, now = this.now();
    let dt = now - d.last; d.last = now;
    while (dt > 0 && d.ore > 0 && d.fuel > 0) {
      const need = SMELT.time - d.t, step = Math.min(dt, need);
      d.t += step; dt -= step;
      if (d.t >= SMELT.time) { d.t = 0; d.ore--; d.fuel--; d.out++; this.g.onBaseEvent?.('smelt', p); }
    }
    if (d.ore <= 0 || d.fuel <= 0) d.t = Math.min(d.t, SMELT.time);
  }
  burning(p) { return p.data.ore > 0 && p.data.fuel > 0; }

  // ---- drying rack: raw meat/fish -> travel food ----
  hang(p, id) { if (p.data.hang.length >= RACK.slots) return false; p.data.hang.push({ id, t: this.now() }); this.refresh(p, true); return true; }
  ready(p) { return p.data.hang.filter((h) => this.now() - h.t >= RACK.time); }
  takeDried(p) {
    const done = this.ready(p);
    p.data.hang = p.data.hang.filter((h) => !done.includes(h));
    this.refresh(p, true);
    return done.map((h) => DRYING[h.id]);
  }

  // visuals: eggs in the nest box, water level, hens if a model exists
  refresh(p, force) {
    const d = p.data;
    if (!d || !p.obj) return;
    const key = p.type === 'coop' ? `${d.eggs}|${d.hens}` : p.type === 'furnace' ? `${this.burning(p)}|${d.out}` : p.type === 'drying_rack' ? d.hang.map((h) => h.id + (this.now() - h.t >= RACK.time)).join() : `${d.water}`;
    if (p._vis === key && !force) return;
    p._vis = key;
    if (p.visGroup) p.obj.remove(p.visGroup);
    const grp = new THREE.Group();
    if (p.type === 'coop') {
      for (let i = 0; i < Math.min(d.eggs, 6); i++) {
        const e = new THREE.Mesh(itemGeometry('egg'), itemMaterial);
        e.position.set(-0.3 + (i % 3) * 0.12, 0.56, 0.62 + Math.floor(i / 3) * 0.1);
        grp.add(e);
      }
      const src = ASSETS.animals?.chicken;
      if (src) for (let i = 0; i < Math.min(d.hens, COOP.maxHens); i++) {
        const h = skClone(src.scene);
        const box = new THREE.Box3().setFromObject(h), s = 0.42 / Math.max(0.01, box.max.y - box.min.y);
        h.scale.multiplyScalar(s);
        const a = (i / COOP.maxHens) * Math.PI * 2;
        h.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.9 + 0.3);
        h.rotation.y = a + Math.PI / 2;
        grp.add(h);
      }
    } else if (p.type === 'furnace') {
      // glowing mouth while it burns, ingots stacked in front when ready
      if (this.burning(p)) {
        const glow = new THREE.Mesh(new THREE.CircleGeometry(0.25, 12, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
        glow.position.set(0, 0.19, 0.745);
        grp.add(glow);
        if (!p.fire) p.fire = this.g.fx.addFire(new THREE.Vector3(p.x, p.y + 0.25, p.z).add(new THREE.Vector3(Math.sin(p.rot), 0, Math.cos(p.rot)).multiplyScalar(0.7)), 0.35);
      } else if (p.fire) { this.g.fx.removeFire(p.fire); p.fire = null; }
      for (let i = 0; i < Math.min(d.out, 6); i++) {
        const b = new THREE.Mesh(itemGeometry('iron_ingot'), itemMaterial);
        b.position.set(-0.45 + (i % 3) * 0.15, 0.18 + Math.floor(i / 3) * 0.07, 0.95);
        grp.add(b);
      }
    } else if (p.type === 'drying_rack') {
      d.hang.forEach((h, i) => {
        const dry = this.now() - h.t >= RACK.time;
        const m = new THREE.Mesh(itemGeometry(dry ? DRYING[h.id] : h.id), itemMaterial);
        m.position.set(-0.55 + i * 0.37, 1.15, 0); m.rotation.set(0, 0, Math.PI / 2); m.scale.setScalar(1.4);
        grp.add(m);
      });
    } else {
      const lvl = d.water / COLLECTOR.max;
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.29, 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a9ac0, roughness: 0.15, transparent: true, opacity: 0.85 }));
      w.position.y = 0.08 + lvl * 0.58;
      w.visible = d.water > 0;
      grp.add(w);
    }
    p.visGroup = grp;
    p.obj.add(grp);
  }

  update(dt) {
    this.t += dt;
    if (this.t < 1) return;
    this.t = 0;
    for (const p of this.g.building.placeables) {
      if (p.type === 'coop') { if (!p.data) this.init(p); this.stepCoop(p); this.refresh(p); }
      else if (p.type === 'water_collector') { if (!p.data) this.init(p); this.stepCollector(p); this.refresh(p); }
      else if (p.type === 'furnace') { if (!p.data) this.init(p); this.stepFurnace(p); this.refresh(p); }
      else if (p.type === 'drying_rack') { if (!p.data) this.init(p); this.refresh(p); }
    }
  }
}
