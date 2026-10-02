// Farming: data-driven crops grown on farm plots (free placeables of type 'farm_plot').
// Growth runs on played time (progress.playTime), so it survives save/load and never jumps while the game is closed.
import * as THREE from 'three';
import { fiberPlantGeometry } from '../world/models.js';
import { materials } from '../world/materials.js';
import { ASSETS } from '../world/assets.js';
import { itemGeometry, itemMaterial } from './items.js';

// crop visuals: scanned plants where available, the fiber grass otherwise
const scan = (k, i = 0) => () => (ASSETS.ok && ASSETS.models[k] ? { geo: ASSETS.models[k][i].geo, mat: ASSETS.models[k][i].mat, s: 1.6 } : null);
const grass = (tint) => () => {
  const m = materials().fiber.clone();
  if (tint) m.color.setHex(tint);
  return { geo: fiberPlantGeometry(), mat: m, s: 1 };
};

// grow: seconds of play from planting to ripe; stages: visible growth steps before ripe.
// yield: item -> [min, max]; seeds: [min, max] seeds returned so the crop can always be replanted.
export const CROPS = {
  fiber: { name: 'Fibra', seed: 'fiber_sprout', grow: 240, stages: 3, yield: { fiber: [3, 5] }, seeds: [1, 2], model: grass() },
  potato: { name: 'Patate', seed: 'potato', grow: 300, stages: 3, yield: { potato: [3, 5] }, seeds: [0, 0], model: scan('weed', 0), fallback: grass(0x9ac070), scale: 4.5 },
  corn: { name: 'Mais', seed: 'corn_seed', grow: 360, stages: 3, yield: { corn: [2, 4] }, seeds: [1, 3], model: grass(0xb8d070), scale: 1.5 },
  herb: { name: 'Erbe medicinali', seed: 'herb_seed', grow: 240, stages: 3, yield: { herb: [2, 4] }, seeds: [1, 2], model: scan('calathea', 1), fallback: grass(0x7ab060), scale: 1.3 },
  pineapple: { name: 'Ananas', seed: 'pineapple_top', grow: 480, stages: 3, yield: { pineapple: [1, 2] }, seeds: [1, 1], model: scan('anthurium', 4), fallback: grass(0x8ab050), scale: 1.4 },
};
export const SEED_CROP = Object.fromEntries(Object.entries(CROPS).map(([id, c]) => [c.seed, id]));

const SPOTS = [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]];
const rand = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));

export class Farming {
  constructor(game) {
    this.g = game;
    this.geos = {};
    this.t = 0;
  }

  now() { return this.g.progress.playTime || 0; }
  plots() { return this.g.building.placeables.filter((p) => p.type === 'farm_plot'); }

  // 0..1 growth; 1 = ripe
  growth(p) {
    if (!p.crop) return 0;
    const c = CROPS[p.crop.id];
    return c ? Math.min(1, Math.max(0, (this.now() - p.crop.t) / c.grow)) : 0;
  }
  ripe(p) { return !!p.crop && this.growth(p) >= 1; }
  stage(p) {
    if (!p.crop) return -1;
    const c = CROPS[p.crop.id];
    return Math.min(c.stages, Math.floor(this.growth(p) * c.stages + 1e-6));
  }

  plant(p, cropId) {
    p.crop = { id: cropId, t: this.now() };
    this.refresh(p);
  }

  // returns { item: n } yielded (crop + seeds); the plot is left empty for replanting
  harvest(p) {
    const c = CROPS[p.crop.id];
    const out = {};
    for (const [id, r] of Object.entries(c.yield)) out[id] = rand(r);
    out[c.seed] = (out[c.seed] || 0) + rand(c.seeds);
    const hc = this.g.progress.harvestedCrops ||= {};
    hc[p.crop.id] = (hc[p.crop.id] || 0) + 1;
    p.crop = null;
    this.refresh(p);
    return out;
  }

  // crop meshes live inside the plot object, scaled by growth stage
  refresh(p) {
    const st = this.stage(p);
    if (p._stage === st && (st < 0 || p.cropObj)) return;
    p._stage = st;
    if (p.cropObj) { p.obj.remove(p.cropObj); p.cropObj = null; }
    if (st < 0) return;
    const c = CROPS[p.crop.id];
    const vis = this.geos[p.crop.id] || (this.geos[p.crop.id] = c.model() || c.fallback());
    const grp = new THREE.Group();
    const s = [0.22, 0.45, 0.7, 1.0][Math.min(3, Math.round((st / c.stages) * 3))] * (c.scale || 1);
    SPOTS.forEach(([x, z], i) => {
      const m = new THREE.Mesh(vis.geo, vis.mat);
      m.position.set(x, 0.14, z);
      m.rotation.y = i * 1.7;
      m.scale.set(s * 0.8, s * 0.85, s * 0.8);
      grp.add(m);
    });
    // ripe crops get a little fruit/tassel marker so you can spot them
    if (st >= c.stages) {
      const id = Object.keys(c.yield)[0];
      const fruit = new THREE.Mesh(itemGeometry(id), itemMaterial);
      fruit.position.set(0, 0.35, 0); fruit.scale.setScalar(1.6);
      grp.add(fruit);
    }
    p.cropObj = grp;
    p.obj.add(grp);
  }

  update(dt) {
    this.t += dt;
    if (this.t < 1) return;
    this.t = 0;
    for (const p of this.plots()) this.refresh(p);
  }
}
