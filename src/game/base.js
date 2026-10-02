// Base infrastructure that works on its own over played time: chicken coops and water collectors.
// State lives in the placeable's `data` (saved with the building). Chickens are only drawn when a real
// chicken model exists (assets/external/animals/chicken.glb); otherwise the coop shows hens as a count.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { ASSETS } from '../world/assets.js';
import { itemGeometry, itemMaterial } from './items.js';

export const COOP = { maxHens: 6, layEvery: 90, breedEvery: 240, hatchTime: 120, feedPerEgg: 1, feedPerChick: 2, maxEggs: 12, maxFeed: 30 };
export const COLLECTOR = { every: 30, max: 10, drink: 30 };

export class Base {
  constructor(game) { this.g = game; this.t = 0; }
  now() { return this.g.progress.playTime || 0; }
  coops() { return this.g.building.placeables.filter((p) => p.type === 'coop'); }
  collectors() { return this.g.building.placeables.filter((p) => p.type === 'water_collector'); }

  init(p) {
    const now = this.now();
    if (p.type === 'coop') p.data = Object.assign({ hens: 0, feed: 0, eggs: 0, t: now, breedT: now, hatch: null }, p.data || {});
    if (p.type === 'water_collector') p.data = Object.assign({ water: 0, t: now }, p.data || {});
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

  // visuals: eggs in the nest box, water level, hens if a model exists
  refresh(p) {
    const d = p.data;
    if (!d || !p.obj) return;
    const key = p.type === 'coop' ? `${d.eggs}|${d.hens}` : `${d.water}`;
    if (p._vis === key) return;
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
    }
  }
}
