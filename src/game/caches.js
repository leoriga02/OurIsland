// Exploration rewards: a handful of one-time supply caches at Island 2.0's landmarks.
// Each gives useful materials and some unlock a crafting blueprint. Opened state is saved by id.
import * as THREE from 'three';
import { chestGeo, itemMaterial } from './items.js';

export const BLUEPRINTS = {
  tools2: { name: 'Attrezzi migliori', desc: 'Ascia e lancia rinforzate' },
  build2: { name: 'Costruzione avanzata', desc: 'Finestre e baule' },
};

// where(T) -> [x, z] near a landmark; the cache snaps to the nearest flat, dry spot
export const CACHES = [
  { id: 'wreck', name: 'Cassa del relitto', where: (T) => [T.spawn.x - 6, T.spawn.z + 3], loot: { rope: 2, coconut: 2, fiber: 4 } },
  { id: 'jungle', name: 'Scorta nella giungla', where: () => [24, 120], loot: { berries: 4, stick: 5, torch: 1 } },
  { id: 'falls', name: 'Cassa della cascata', where: (T) => [T.pond.x + 9, T.pond.z + 12], loot: { stone: 5, rope: 1, coconut: 2 } },
  { id: 'cave', name: 'Forziere della grotta', where: (T) => [T.cave.x + T.cave.ax * 5, T.cave.z + T.cave.az * 5], loot: { stone: 6, hide: 1 }, blueprint: 'tools2' },
  { id: 'cove', name: 'Baule dei contrabbandieri', where: (T) => [T.cove.x - 14, T.cove.z - 22], loot: { rope: 3, hide: 2, meat_cooked: 2 }, blueprint: 'build2' },
  { id: 'lookout', name: 'Scorta del belvedere', where: (T) => [T.lookout.x + 3, T.lookout.z + 2], loot: { coconut: 3, meat_cooked: 1, fiber_sprout: 3 } },
  { id: 'rocky', name: 'Cassa sugli scogli', where: () => [-372, 92], loot: { wood: 6, stone: 4, rope: 1 } },
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

export class Caches {
  constructor(scene, terrain, nature) {
    this.list = [];
    const geo = chestGeo(0.95, 0.62, 0.62);
    for (const c of CACHES) {
      const [x, z] = findSpot(terrain, ...c.where(terrain));
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
  // saved as a list of opened ids
  toJSON() { return this.list.filter((c) => c.opened).map((c) => c.id); }
  load(ids = []) { for (const c of this.list) if (ids.includes(c.id) && !c.opened) this.open(c); }
}
