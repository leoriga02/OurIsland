// Exploration rewards: a handful of one-time supply caches at Island 2.0's landmarks.
// Each gives useful materials and some unlock a crafting blueprint. Opened state is saved by id.
import * as THREE from 'three';
import { chestGeo, itemMaterial } from './items.js';

export const BLUEPRINTS = {
  tools2: { name: 'Attrezzi migliori', desc: 'Ascia e lancia rinforzate' },
  build2: { name: 'Costruzione avanzata', desc: 'Finestre e baule' },
  metal: { name: 'Metallurgia', desc: 'Fornace: fondi il minerale di ferro in lingotti' },
};

// where(T) -> [x, z] near a landmark; the cache snaps to the nearest flat, dry spot
export const CACHES = [
  { id: 'wreck', name: 'Cassa del relitto', where: (T) => [T.spawn.x - 6, T.spawn.z + 3], loot: { rope: 2, coconut: 2, fiber: 4, potato: 3 } },
  { id: 'jungle', name: 'Scorta nella giungla', where: () => [24, 120], loot: { berries: 4, stick: 5, torch: 1, corn_seed: 3 } },
  { id: 'falls', name: 'Cassa della cascata', where: (T) => [T.pond.x + 9, T.pond.z + 12], loot: { stone: 5, rope: 1, coconut: 2, herb_seed: 2 } },
  { id: 'cave', name: 'Forziere della grotta', where: (T) => [T.cave.x + T.cave.ax * 5, T.cave.z + T.cave.az * 5], loot: { stone: 6, hide: 1 }, blueprint: 'tools2' },
  { id: 'cove', name: 'Baule dei contrabbandieri', where: (T) => [T.cove.x - 14, T.cove.z - 22], loot: { rope: 3, hide: 2, meat_cooked: 2 }, blueprint: 'build2' },
  { id: 'lookout', name: 'Scorta del belvedere', where: (T) => [T.lookout.x + 3, T.lookout.z + 2], loot: { coconut: 3, meat_cooked: 1, fiber_sprout: 3, pineapple_top: 2 } },
  { id: 'rocky', name: 'Cassa sugli scogli', where: () => [-372, 92], loot: { wood: 6, stone: 4, rope: 1 } },
  // deep in the cave: the reason to go in
  { id: 'deep', name: 'Forziere dei minatori', where: (T) => (T.caveRooms ? [T.caveRooms.deep.x, T.caveRooms.deep.z] : [T.cave.x, T.cave.z]), loot: { iron_ore: 4, torch: 2, rope: 2, jerky: 2 }, blueprint: 'metal', exact: true },
];

function findSpot(T, x, z) {
  for (let r = 0; r < 30; r += 1.5) {
    for (let a = 0; a < 6.28; a += 0.5) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const h = T.heightAt(px, pz);
      if (h > 0.6 && T.slopeAt(px, pz) < 0.32 && !T.isInPond(px, pz, 1.5)) return [px, pz];
      if (r === 0) break;
    }
  }
  return [x, z];
}

const DRIFT_SEEDS = [['potato', [2, 3]], ['corn_seed', [2, 3]], ['herb_seed', [2, 3]], ['pineapple_top', [1, 2]], ['fiber_sprout', [2, 3]]];
const DRIFT_GOODS = [['rope', [1, 2], 3], ['wood', [2, 4], 3], ['coconut', [1, 2], 3], ['fish_cooked', [1, 1], 2], ['stone', [2, 4], 2], ['hide', [1, 1], 1], ['bottle', [1, 1], 1]];
const rnd = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
function rollDrift() {
  const loot = {};
  const [sd, sr] = DRIFT_SEEDS[Math.floor(Math.random() * DRIFT_SEEDS.length)];
  loot[sd] = rnd(sr);
  const tot = DRIFT_GOODS.reduce((a, g) => a + g[2], 0);
  for (let k = 0; k < 2; k++) {
    let r = Math.random() * tot;
    for (const [id, range, w] of DRIFT_GOODS) { r -= w; if (r <= 0) { loot[id] = (loot[id] || 0) + rnd(range); break; } }
  }
  return loot;
}

export class Caches {
  constructor(scene, terrain, nature) {
    this.list = [];
    const geo = chestGeo(0.95, 0.62, 0.62);
    for (const c of CACHES) {
      const [x, z] = c.exact ? c.where(terrain) : findSpot(terrain, ...c.where(terrain));
      const y = terrain.heightAt(x, z);
      const m = new THREE.Mesh(geo, itemMaterial);
      m.castShadow = m.receiveShadow = true;
      m.position.set(x, y - 0.04, z);
      m.rotation.set((Math.random() - 0.5) * 0.12, Math.random() * 6.28, (Math.random() - 0.5) * 0.12);
      scene.add(m);
      nature.addCollider(x, z, 0.55, y + 0.7);
      this.list.push({ ...c, kind: 'cache', label: c.name, x, y, z, r: 0.6, mesh: m, opened: false, alive: true });
    }
  }
  open(c) {
    c.opened = true; c.alive = false;
    c.mesh.material = c.mesh.material.clone();
    c.mesh.material.color.setRGB(0.55, 0.5, 0.45); // emptied: weathered and dull
    c.mesh.rotation.z += 0.08;
  }
  // ---------- world event: crates washing ashore ----------
  // A random beach spot gets a small crate (seeds always included, so farming never stalls).
  spawnDrift(T, scene, data) {
    let x, z;
    if (data) { x = data.x; z = data.z; }
    else {
      for (let k = 0; k < 2000; k++) {
        const px = (Math.random() * 2 - 1) * 440, pz = (Math.random() * 2 - 1) * 440;
        const h = T.heightAt(px, pz), cd = T.coastDist(px, pz);
        if (h > 0.35 && h < 1.3 && cd > 0 && cd < 14 && T.slopeAt(px, pz) < 0.2 && T.rockyW(px, pz) < 0.4 && Math.hypot(px - T.spawn.x, pz - T.spawn.z) > 25) { x = px; z = pz; break; }
      }
      if (x === undefined) return null;
    }
    const loot = data ? data.loot : rollDrift();
    const y = T.heightAt(x, z);
    const m = new THREE.Mesh(this.driftGeo ||= chestGeo(0.7, 0.45, 0.48), this.driftMat ||= (() => { const mm = itemMaterial.clone(); mm.color.setRGB(0.8, 0.86, 0.9); return mm; })());
    m.castShadow = true;
    m.position.set(x, y - 0.08, z);
    m.rotation.set(0.15, Math.random() * 6.28, -0.1);
    scene.add(m);
    const c = { id: 'drift', drift: true, kind: 'cache', label: 'Cassa portata dal mare', name: 'Cassa portata dal mare', x, y, z, r: 0.5, mesh: m, opened: false, alive: true, loot };
    this.list.push(c);
    return c;
  }
  removeDrift(c, scene) { scene.remove(c.mesh); this.list.splice(this.list.indexOf(c), 1); }
  driftJSON() { return this.list.filter((c) => c.drift && !c.opened).map((c) => ({ x: c.x, z: c.z, loot: c.loot })); }

  // saved as a list of opened ids
  toJSON() { return this.list.filter((c) => c.opened).map((c) => c.id); }
  load(ids = []) { for (const c of this.list) if (ids.includes(c.id) && !c.opened) this.open(c); }
}
