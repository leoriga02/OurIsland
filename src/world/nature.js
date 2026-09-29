// Populates the island with vegetation, rocks & pickups; owns harvestable resources and colliders.
import * as THREE from 'three';
import { materials } from './materials.js';
import {
  palmGeometry, jungleTreeGeometry, bushGeometry, bananaPlantGeometry, grassTuftGeometry,
  fiberPlantGeometry, flowerGeometry, boulderGeometry, spireGeometry, merge, setColor,
} from './models.js';
import { itemGeometry, itemMaterial } from '../game/items.js';
import { mulberry32, smoothstep, clamp } from '../util/noise.js';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

export class Pool {
  constructor(scene, parts, capacity, { shadow = true, receive = true } = {}) {
    this.parts = parts;
    this.meshes = parts.map(({ geo, mat }) => {
      const m = new THREE.InstancedMesh(geo, mat, capacity);
      m.count = 0;
      m.castShadow = shadow; m.receiveShadow = receive;
      scene.add(m);
      return m;
    });
    this.count = 0;
    this.capacity = capacity;
    this.matrices = [];
  }
  add(matrix, color) {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    for (const m of this.meshes) {
      m.setMatrixAt(i, matrix);
      if (color) m.setColorAt(i, color);
      m.count = this.count;
    }
    this.matrices[i] = matrix.clone();
    return i;
  }
  set(i, matrix) { for (const m of this.meshes) { m.setMatrixAt(i, matrix); m.instanceMatrix.needsUpdate = true; } }
  show(i, v) { this.set(i, v ? this.matrices[i] : ZERO); }
  scaled(i, s) {
    _m.copy(this.matrices[i]);
    const e = _m.elements;
    // scale around the instance origin (keep translation)
    for (let k = 0; k < 12; k++) if (k % 4 !== 3) e[k] *= s;
    _m.elements[12] = this.matrices[i].elements[12]; _m.elements[13] = this.matrices[i].elements[13]; _m.elements[14] = this.matrices[i].elements[14];
    this.set(i, _m);
  }
  finalize() {
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      m.computeBoundingBox?.();
    }
  }
}

// Simple uniform grid for spatial queries
class Grid {
  constructor(cell = 10) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  add(o) {
    const k = this.key(Math.floor(o.x / this.cell), Math.floor(o.z / this.cell));
    let a = this.map.get(k); if (!a) this.map.set(k, a = []);
    a.push(o);
  }
  remove(o) {
    const k = this.key(Math.floor(o.x / this.cell), Math.floor(o.z / this.cell));
    const a = this.map.get(k); if (!a) return;
    const i = a.indexOf(o); if (i >= 0) a.splice(i, 1);
  }
  query(x, z, r, out = []) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = this.map.get(this.key(i, j));
      if (a) for (const o of a) out.push(o);
    }
    return out;
  }
}

export class Nature {
  constructor(scene, terrain, { quality = 1 } = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.quality = quality;
    this.M = materials();
    this.resources = new Grid(10);
    this.colliders = new Grid(10);
    this.all = [];
    this.falling = [];
    this.growing = [];
    this.shaking = [];
    this.occupied = new Grid(6);
    this.rnd = mulberry32(1234);
    this._build();
  }

  // ---------- placement helpers ----------
  free(x, z, r) {
    for (const o of this.occupied.query(x, z, r + 4)) if (Math.hypot(o.x - x, o.z - z) < r + o.r) return false;
    return true;
  }
  occupy(x, z, r) { this.occupied.add({ x, z, r }); }
  addCollider(x, z, r, h = 99) {
    const c = { x, z, r, h, active: true };
    this.colliders.add(c);
    return c;
  }
  addResource(res) {
    res.alive = true;
    this.resources.add(res);
    this.all.push(res);
    return res;
  }

  sample(fn, tries) {
    const T = this.terrain, r = this.rnd;
    const out = [];
    for (let i = 0; i < tries; i++) {
      const x = (r() * 2 - 1) * 200, z = (r() * 2 - 1) * 200;
      const h = T.heightAt(x, z);
      if (h < 0.3) continue;
      const s = T.coastDist(x, z);
      const slope = T.slopeAt(x, z);
      const pd = T.pathDist(x, z);
      if (fn({ x, z, h, s, slope, pd, rnd: r })) out.push({ x, z, h });
    }
    return out;
  }

  nearSpawn(x, z, r) {
    const sp = this.terrain.spawn;
    return Math.hypot(x - sp.x, z - sp.z) < r;
  }

  _build() {
    const T = this.terrain, M = this.M, R = this.rnd, scene = this.scene;
    const pondOk = (x, z, pad) => !T.isInPond(x, z, pad);
    this.pickupPools = {};
    for (const id of ['stick', 'stone', 'coconut', 'wood']) {
      this.pickupPools[id] = new Pool(scene, [{ geo: itemGeometry(id), mat: itemMaterial }], 260);
    }

    // ---- spires (karst pillars) ----
    const spires = [
      [-40, -92, 46, 12], [-8, -108, 38, 10], [-60, -62, 32, 10], [16, -84, 28, 8], [-32, -42, 24, 8],
      [-22, -70, 30, 9], [70, -118, 30, 9], [-95, -95, 28, 9], [-122, 28, 22, 8], [135, -32, 18, 7], [48, -95, 22, 8],
    ];
    const spireGreen = [];
    spires.forEach(([x, z, H, Rr], k) => {
      const g = spireGeometry(100 + k, H, Rr);
      const base = T.heightAt(x, z) - 3;
      const rock = new THREE.Mesh(g.rock, M.rock);
      rock.position.set(x, base, z);
      rock.rotation.y = R() * 6;
      rock.castShadow = true; rock.receiveShadow = true;
      scene.add(rock);
      const gm = g.green.clone();
      gm.applyMatrix4(new THREE.Matrix4().makeRotationY(rock.rotation.y).setPosition(x, base, z));
      spireGreen.push(gm);
      this.addCollider(x, z, Rr * 0.95);
      this.occupy(x, z, Rr + 2);
    });
    // sea stacks
    const stacks = [];
    for (let i = 0; i < 7; i++) {
      const a = R() * Math.PI * 2;
      if (Math.abs(a - Math.PI / 2) < 0.5) { i--; continue; } // keep the spawn view open
      const d = T.coastR(Math.cos(a) * 150, Math.sin(a) * 150) + 12 + R() * 25;
      stacks.push([Math.cos(a) * d, Math.sin(a) * d, 10 + R() * 16, 3 + R() * 3]);
    }
    stacks.forEach(([x, z, H, Rr], k) => {
      const g = spireGeometry(300 + k, H, Rr);
      const base = T.heightAt(x, z) - 2;
      const rock = new THREE.Mesh(g.rock, M.rock);
      rock.position.set(x, base, z);
      rock.castShadow = true; rock.receiveShadow = true;
      scene.add(rock);
      const gm = g.green.clone(); gm.translate(x, base, z);
      spireGreen.push(gm);
      this.addCollider(x, z, Rr);
    });
    const greenMesh = new THREE.Mesh(merge(spireGreen), M.canopy);
    greenMesh.castShadow = true; greenMesh.receiveShadow = true;
    scene.add(greenMesh);

    // ---- cliff rocks around the waterfall ----
    const P = T.pond, MT = T.mountain;
    let dx = MT.x - P.x, dz = MT.z - P.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    this.waterfallDir = new THREE.Vector2(dx, dz);
    const cliffRocks = [];
    // columnar limestone pillars forming the cliff face around the waterfall
    const pillarRock = [], pillarGreen = [];
    const hAt = (t, lat) => T.heightAt(P.x + dx * t - dz * lat, P.z + dz * t + dx * lat);
    for (let lat = -21; lat <= 21; lat += 2.9 + R() * 0.8) {
      if (Math.abs(lat) < 2.3) continue;
      const flank = Math.abs(lat) < 5.5;
      const t = P.r + (flank ? 3.2 : 4 + R() * 1.2);
      const x = P.x + dx * t - dz * lat, z = P.z + dz * t + dx * lat;
      const baseY = Math.min(T.heightAt(x, z), hAt(t - 3, lat), hAt(t - 1.5, lat - 2), hAt(t - 1.5, lat + 2)) - 2;
      const topY = hAt(P.r + 9.5, lat);
      const H = Math.max(4, topY - baseY + (flank ? 2.5 : 0.5 + R() * 2.5));
      const Rr = flank ? 2.6 : 2.4 + R() * 1.1;
      const g = spireGeometry(700 + Math.round(lat * 10), H, Rr, 1.6);
      const rot = new THREE.Matrix4().makeRotationY(R() * 6).setPosition(x, baseY, z);
      g.rock.applyMatrix4(rot); g.green.applyMatrix4(rot);
      pillarRock.push(g.rock); pillarGreen.push(g.green);
      this.addCollider(x, z, Rr * 0.9, baseY + H);
      this.occupy(x, z, Rr);
    }
    const pr = new THREE.Mesh(merge(pillarRock), M.rock);
    pr.castShadow = pr.receiveShadow = true;
    const pg = new THREE.Mesh(merge(pillarGreen), M.canopy);
    pg.castShadow = pg.receiveShadow = true;
    scene.add(pr, pg);

    // ---- boulders ----
    const bVariants = [0, 1, 2, 3].map((k) => boulderGeometry(500 + k, { rough: 0.3, flat: 0.3, moss: 0.7, tint: [0.56, 0.5, 0.44] }));
    const bigRocks = new Pool(scene, bVariants.map((g) => ({ geo: g, mat: M.rock })).slice(0, 1), 1);
    this.boulderPools = bVariants.map((g) => new Pool(scene, [{ geo: g, mat: M.rock }], 160));
    const placeBoulder = (x, z, s, h, collide = true) => {
      const y = T.heightAt(x, z);
      _e.set((R() - 0.5) * 0.3, R() * 6, (R() - 0.5) * 0.3); _q.setFromEuler(_e);
      _s.set(s * (0.8 + R() * 0.4), h, s * (0.8 + R() * 0.4));
      _m.compose(_p.set(x, y + h * 0.15, z), _q, _s);
      this.boulderPools[Math.floor(R() * 4)].add(_m);
      if (collide) this.addCollider(x, z, s * 0.85, y + h * 1.1);
      this.occupy(x, z, s);
    };
    cliffRocks.forEach((c) => placeBoulder(c.x, c.z, c.s, c.h));
    // coastal clusters (beach & shallows, like the references)
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI * 2;
      const cx0 = Math.cos(a), cz0 = Math.sin(a);
      const rC = T.coastR(cx0 * 150, cz0 * 150);
      const d = rC + (R() - 0.3) * 14;
      const x = cx0 * d, z = cz0 * d;
      if (this.nearSpawn(x, z, 22)) continue;
      const n = 2 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) {
        const bx = x + (R() - 0.5) * 7, bz = z + (R() - 0.5) * 7;
        const s = 0.8 + R() * 2.2;
        placeBoulder(bx, bz, s, s * (0.6 + R() * 0.5));
      }
    }
    // inland scattered rocks
    this.sample(({ x, z, h, slope, pd }) => h > 2 && pd > 3 && pondOk(x, z, 4) && slope < 0.5 && this.free(x, z, 2), 900)
      .slice(0, 60).forEach(({ x, z }) => { const s = 0.6 + R() * 1.6; placeBoulder(x, z, s, s * 0.7); });
    // outcrops on steep slopes break up smooth cliff faces
    this.sample(({ x, z, h, slope }) => slope > 0.42 && h > 3 && !T.isInPond(x, z, 3) && this.free(x, z, 2.5), 8000)
      .slice(0, 110).forEach(({ x, z }) => { const s = 2.2 + R() * 3.2; placeBoulder(x, z, s, s * (0.7 + R() * 0.7)); });
    bigRocks.meshes.forEach((m) => scene.remove(m));

    // ---- mineable stone nodes ----
    const nodeGeos = [0, 1, 2].map((k) => boulderGeometry(700 + k, { rough: 0.35, flat: 0.25, moss: 0.25, tint: [0.66, 0.64, 0.62] }));
    this.nodePools = nodeGeos.map((g) => new Pool(scene, [{ geo: g, mat: M.rock }], 40));
    const nodeSpots = this.sample(({ x, z, h, slope, pd, s }) => h > 1.8 && s > 10 && pd > 3 && pondOk(x, z, 4) && slope < 0.4 && this.free(x, z, 3), 1500).slice(0, 38);
    // guarantee a couple near spawn path
    const sp = T.spawn;
    nodeSpots.unshift({ x: sp.x + 16, z: sp.z - 30 }, { x: sp.x - 14, z: sp.z - 45 });
    nodeSpots.forEach(({ x, z }) => {
      const y = T.heightAt(x, z);
      const s = 1.0 + R() * 0.35;
      _e.set(0, R() * 6, 0); _q.setFromEuler(_e);
      _m.compose(_p.set(x, y + 0.2, z), _q, _s.set(s * 1.1, s * 0.8, s));
      const v = Math.floor(R() * 3);
      const idx = this.nodePools[v].add(_m);
      const col = this.addCollider(x, z, s * 0.9, y + s);
      this.occupy(x, z, s + 1);
      this.addResource({ kind: 'node', x, z, y, r: s, hp: 5, maxHp: 5, pool: this.nodePools[v], idx, collider: col, label: 'Stone Boulder' });
    });

    // ---- palms ----
    const palmVariants = [0, 1, 2, 3, 4].map((k) => palmGeometry(20 + k * 7));
    this.palmVariants = palmVariants;
    this.palmPools = palmVariants.map((v) => new Pool(scene, [{ geo: v.trunk, mat: M.palmBark }, { geo: v.fronds, mat: M.frond }], 90));
    const palmSpots = this.sample(({ x, z, h, s, slope, pd, rnd }) => {
      if (h < 0.9 || h > 14 || slope > 0.32 || pd < 3 || !pondOk(x, z, 3)) return false;
      if (this.nearSpawn(x, z, 7)) return false;
      const p = s < 50 ? 0.75 : 0.18;
      return rnd() < p && this.free(x, z, 3.2);
    }, 5000);
    // A few palms around the start beach for the first chop
    const starter = [[sp.x + 9, sp.z - 7], [sp.x - 8, sp.z - 12], [sp.x + 14, sp.z - 18], [sp.x - 16, sp.z - 3]];
    starter.forEach(([x, z]) => { if (T.heightAt(x, z) > 0.7) palmSpots.unshift({ x, z }); });
    let palmCount = 0;
    for (const { x, z } of palmSpots) {
      if (palmCount > 330) break;
      if (!this.free(x, z, 2.2) && palmCount >= starter.length) continue;
      const v = Math.floor(R() * palmVariants.length);
      const y = T.heightAt(x, z) - 0.1;
      const s = 0.85 + R() * 0.35;
      // lean palms toward the sea
      const toSea = Math.atan2(z, x);
      _e.set(0, -toSea + (R() - 0.5) * 1.2, 0); _q.setFromEuler(_e);
      _m.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
      const idx = this.palmPools[v].add(_m);
      const col = this.addCollider(x, z, 0.35 * s);
      this.occupy(x, z, 2.2);
      this.addResource({ kind: 'palm', x, z, y, r: 0.4, hp: 4, maxHp: 4, pool: this.palmPools[v], variant: v, idx, collider: col, scale: s, rotY: -toSea, label: 'Palm Tree' });
      palmCount++;
      // coconuts on the ground below some palms
      if (R() < 0.25) this._pickup('coconut', x + (R() - 0.5) * 3, z + (R() - 0.5) * 3);
    }

    // ---- jungle trees ----
    const jVariants = [0, 1, 2].map((k) => jungleTreeGeometry(60 + k * 13));
    this.jungleVariants = jVariants;
    this.junglePools = jVariants.map((v) => new Pool(scene, [{ geo: v.trunk, mat: M.bark }, { geo: v.canopy, mat: M.canopy }], 110));
    const jSpots = this.sample(({ x, z, h, s, slope, pd, rnd }) => h > 3 && s > 35 && slope < 0.58 && pd > 3.5 && pondOk(x, z, 5) && rnd() < 0.7 && this.free(x, z, 4), 5000);
    jSpots.slice(0, 330).forEach(({ x, z }) => {
      if (!this.free(x, z, 3.5)) return;
      const v = Math.floor(R() * jVariants.length);
      const y = T.heightAt(x, z) - 0.15;
      const s = 0.8 + R() * 0.45;
      _e.set(0, R() * 6, 0); _q.setFromEuler(_e);
      _m.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
      const idx = this.junglePools[v].add(_m);
      const col = this.addCollider(x, z, 0.45 * s);
      this.occupy(x, z, 3.5);
      this.addResource({ kind: 'tree', x, z, y, r: 0.5, hp: 6, maxHp: 6, pool: this.junglePools[v], variant: v, idx, collider: col, scale: s, rotY: _e.y, label: 'Jungle Tree' });
      if (R() < 0.5) this._pickup('stick', x + (R() - 0.5) * 5, z + (R() - 0.5) * 5);
    });

    // ---- bushes, bananas, flowers (decor) ----
    const bushGeos = [bushGeometry(1), bushGeometry(2, true), bushGeometry(3)];
    const bushPools = bushGeos.map((g) => new Pool(scene, [{ geo: g, mat: M.bush }], 400, { shadow: this.quality > 0 }));
    const flowerPool = new Pool(scene, [{ geo: flowerGeometry(), mat: M.flower }], 800, { shadow: false });
    const tint = new THREE.Color();
    this.sample(({ x, z, h, slope, pd, rnd }) => h > 1.2 && slope < 0.5 && pd > 1.8 && pondOk(x, z, 1) && rnd() < 0.85, 9000)
      .slice(0, 900).forEach(({ x, z }) => {
        if (this.nearSpawn(x, z, 3)) return;
        const y = T.heightAt(x, z);
        const s = 0.7 + R() * 0.8;
        _e.set(0, R() * 6, 0); _q.setFromEuler(_e);
        _m.compose(_p.set(x, y - 0.1, z), _q, _s.set(s, s * (0.8 + R() * 0.4), s));
        tint.setHSL(0.22 + R() * 0.1, 0.35 + R() * 0.2, 0.42 + R() * 0.12);
        const v = Math.floor(R() * 3);
        bushPools[v].add(_m, tint.clone().multiplyScalar(1.7));
        if (R() < 0.3) {
          const nf = 2 + Math.floor(R() * 4);
          for (let k = 0; k < nf; k++) {
            const a = R() * 6.28, rr = 0.5 * s + R() * 0.3;
            _e.set(0, R() * 6, 0); _q.setFromEuler(_e);
            _m.compose(_p.set(x + Math.cos(a) * rr, y + s * (0.5 + R() * 0.5), z + Math.sin(a) * rr), _q, _s.set(1, 1, 1));
            flowerPool.add(_m);
          }
        }
      });
    const banGeos = [bananaPlantGeometry(1), bananaPlantGeometry(2)];
    const banPools = banGeos.map((g) => new Pool(scene, [{ geo: g, mat: M.banana }], 250, { shadow: this.quality > 0 }));
    this.sample(({ x, z, h, s, slope, pd, rnd }) => h > 1.6 && slope < 0.4 && pd > 2 && pondOk(x, z, 0) && (s > 30 || rnd() < 0.3), 5000)
      .slice(0, 420).forEach(({ x, z }) => {
        if (this.nearSpawn(x, z, 4)) return;
        const y = T.heightAt(x, z);
        const s = 0.8 + R() * 0.9;
        _e.set(0, R() * 6, 0); _q.setFromEuler(_e);
        _m.compose(_p.set(x, y - 0.05, z), _q, _s.set(s, s, s));
        banPools[Math.floor(R() * 2)].add(_m);
      });

    // ---- fiber plants (harvestable) ----
    const fiberPool = new Pool(scene, [{ geo: fiberPlantGeometry(), mat: M.fiber }], 200, { shadow: false });
    const fSpots = this.sample(({ x, z, h, slope, pd }) => h > 1.4 && slope < 0.35 && pd > 2 && pondOk(x, z, 1) && this.free(x, z, 1), 3000).slice(0, 120);
    const fStarter = [[sp.x + 5, sp.z - 12], [sp.x - 6, sp.z - 16], [sp.x + 2, sp.z - 20], [sp.x - 11, sp.z - 9]];
    fStarter.forEach(([x, z]) => fSpots.unshift({ x, z }));
    fSpots.forEach(({ x, z }) => {
      const y = T.heightAt(x, z);
      _e.set(0, R() * 6, 0); _q.setFromEuler(_e);
      const s = 0.9 + R() * 0.3;
      _m.compose(_p.set(x, y - 0.05, z), _q, _s.set(s, s, s));
      const idx = fiberPool.add(_m);
      this.addResource({ kind: 'fiber', x, z, y, r: 0.5, hp: 1, pool: fiberPool, idx, label: 'Fiber Plant' });
    });

    // ---- berry bushes ----
    const bbGeo = bushGeometry(9, true);
    const berryPool = new Pool(scene, [{ geo: bbGeo, mat: M.bush }], 60);
    const berryParts = [];
    const br = mulberry32(77);
    for (let i = 0; i < 26; i++) {
      const d = new THREE.Vector3(br() * 2 - 1, br() * 1.2 - 0.1, br() * 2 - 1).normalize();
      const s = new THREE.SphereGeometry(0.06, 7, 5);
      s.translate(d.x * 1.15, 0.85 + d.y * 0.85, d.z * 1.15);
      setColor(s, 0.75, 0.05, 0.1);
      berryParts.push(s);
    }
    const berryFruitPool = new Pool(scene, [{ geo: merge(berryParts), mat: itemMaterial }], 60, { shadow: false });
    const bSpots = this.sample(({ x, z, h, s, slope, pd }) => h > 2 && s > 15 && slope < 0.35 && pd > 3 && pondOk(x, z, 3) && this.free(x, z, 2), 3000).slice(0, 36);
    bSpots.unshift({ x: sp.x - 12, z: sp.z - 34 });
    bSpots.forEach(({ x, z }) => {
      const y = T.heightAt(x, z);
      _e.set(0, R() * 6, 0); _q.setFromEuler(_e);
      _m.compose(_p.set(x, y - 0.1, z), _q, _s.set(1, 1, 1));
      berryPool.add(_m, new THREE.Color(0.9, 1.05, 0.85));
      const idx = berryFruitPool.add(_m);
      this.occupy(x, z, 1.5);
      this.addResource({ kind: 'berry', x, z, y, r: 1.1, hp: 1, pool: berryFruitPool, idx, label: 'Berry Bush' });
    });

    // ---- pickups ----
    // starter pickups
    const ring = (n, r0, r1, id) => {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (R() - 0.5) * 2.4, d = r0 + R() * (r1 - r0);
        this._pickup(id, sp.x + Math.cos(a) * d, sp.z + Math.sin(a) * d);
      }
    };
    ring(4, 3, 10, 'stick'); ring(4, 3, 11, 'stone');
    this.sample(({ x, z, h, pd, s }) => h > 0.5 && s < 12 && pd > 1, 3000).slice(0, 60).forEach(({ x, z }) => this._pickup('stone', x, z));
    this.sample(({ x, z, h, pd, s }) => h > 0.5 && s < 10 && pd > 1, 3000).slice(0, 26).forEach(({ x, z }) => this._pickup('wood', x, z));
    this.sample(({ x, z, h, pd, slope }) => h > 1.5 && slope < 0.4, 3000).slice(0, 60).forEach(({ x, z }) => this._pickup('stick', x, z));
    this.sample(({ x, z, h, pd, slope }) => h > 2 && slope < 0.4, 3000).slice(0, 40).forEach(({ x, z }) => this._pickup('stone', x, z));

    // ---- grass (chunked) ----
    this._grass();

    for (const p of [...this.boulderPools, ...this.nodePools, ...this.palmPools, ...this.junglePools, ...bushPools, ...banPools, fiberPool, flowerPool, berryPool, berryFruitPool, ...Object.values(this.pickupPools)]) p.finalize();
    this.cliffRocks = cliffRocks;
  }

  _pickup(id, x, z) {
    const T = this.terrain, R = this.rnd;
    const y = T.heightAt(x, z);
    if (y < 0.25 || T.isInPond(x, z, 0.5)) return;
    const pool = this.pickupPools[id];
    const n = T.normalAt(x, z, new THREE.Vector3());
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
    _q.multiply(qy);
    const s = id === 'wood' ? 1.8 : 1.15;
    const lift = { stick: 0.03, stone: 0.05, coconut: 0.1, wood: 0.18 }[id];
    _m.compose(_p.set(x, y + lift, z), _q, _s.set(s, s, s));
    const idx = pool.add(_m);
    if (idx < 0) return;
    const labels = { stick: 'Stick', stone: 'Stone', coconut: 'Coconut', wood: 'Driftwood' };
    this.addResource({ kind: 'pickup', item: id, x, z, y, r: 0.45, hp: 1, pool, idx, label: labels[id] });
  }

  _grass() {
    const T = this.terrain, R = mulberry32(99), scene = this.scene;
    const CH = 40;
    this.grassChunks = [];
    const geos = [grassTuftGeometry(1), grassTuftGeometry(2)];
    const chunks = new Map();
    const step = this.quality > 0 ? 1.25 : 1.7;
    const col = new THREE.Color();
    for (let x = -190; x < 190; x += step) {
      for (let z = -190; z < 190; z += step) {
        const px = x + (R() - 0.5) * step, pz = z + (R() - 0.5) * step;
        const h = T.heightAt(px, pz);
        if (h < 2.0) continue;
        const dens = T.noise(px * 0.03, pz * 0.03) * 0.5 + 0.5;
        if (R() > dens * 0.95 + 0.1) continue;
        if (T.slopeAt(px, pz) > 0.4) continue;
        if (T.pathDist(px, pz) < 1.3 || T.isInPond(px, pz, 0.8)) continue;
        const key = Math.floor(px / CH) + ',' + Math.floor(pz / CH);
        let c = chunks.get(key);
        if (!c) chunks.set(key, c = { items: [], cx: (Math.floor(px / CH) + 0.5) * CH, cz: (Math.floor(pz / CH) + 0.5) * CH });
        c.items.push([px, h, pz]);
      }
    }
    for (const c of chunks.values()) {
      const pool = new Pool(scene, [{ geo: geos[c.items.length % 2], mat: this.M.grass }], c.items.length, { shadow: false });
      for (const [x, y, z] of c.items) {
        _e.set(0, R() * 6, 0); _q.setFromEuler(_e);
        const s = 0.7 + R() * 0.7;
        _m.compose(_p.set(x, y - 0.03, z), _q, _s.set(s, s * (0.7 + R() * 0.6), s));
        col.setHSL(0.21 + R() * 0.07, 0.45, 0.33 + R() * 0.14);
        pool.add(_m, col.clone().multiplyScalar(1.8));
      }
      pool.finalize();
      this.grassChunks.push({ pool, x: c.cx, z: c.cz });
    }
  }

  // ---------- runtime ----------
  query(x, z, r) { return this.resources.query(x, z, r); }

  update(dt, camPos, time) {
    // grass distance culling
    const far = this.quality > 0 ? 85 : 60;
    for (const g of this.grassChunks) {
      const d = Math.hypot(g.x - camPos.x, g.z - camPos.z);
      g.pool.meshes[0].visible = d < far;
    }
    this._updateShakes(dt);
    // falling trees
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      const k = Math.min(1, f.t / 1.6);
      const ang = k * k * 1.45;
      f.pivot.rotation.set(0, 0, 0);
      f.pivot.rotateOnWorldAxis(f.axis, ang);
      if (f.t > 1.6 && !f.landed) { f.landed = true; f.onLand?.(); }
      if (f.t > 2.4) f.group.position.y -= dt * 2.5;
      if (f.t > 3.4) { this.scene.remove(f.group); this.falling.splice(i, 1); }
    }
    // regrowth
    for (const res of this.all) {
      if (!res.alive && res.respawnAt && time > res.respawnAt) {
        res.alive = true; res.hp = res.maxHp || 1;
        if (res.collider) res.collider.active = true;
        this.restoreStump(res);
        this.growing.push({ res, t: 0 });
      }
    }
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const g = this.growing[i];
      g.t += dt;
      const k = Math.min(1, g.t / 2);
      g.res.pool.scaled(g.res.idx, 0.05 + 0.95 * (1 - Math.pow(1 - k, 3)));
      if (k >= 1) this.growing.splice(i, 1);
    }
  }

  // shake an instance a little (hit feedback)
  shake(res, amount = 1, fromX = 0, fromZ = 0) {
    res.shakeT = 0.35;
    res.shakeAmp = amount;
    res.shakeAxis = new THREE.Vector3(res.x - fromX, 0, res.z - fromZ).normalize().cross(new THREE.Vector3(0, -1, 0));
    if (!this.shaking.includes(res)) this.shaking.push(res);
  }

  _updateShakes(dt) {
    for (let i = this.shaking.length - 1; i >= 0; i--) {
      const r = this.shaking[i];
      r.shakeT -= dt;
      if (r.shakeT <= 0 || !r.alive) {
        if (r.alive) r.pool.show(r.idx, true);
        this.shaking.splice(i, 1);
        continue;
      }
      const k = r.shakeT / 0.35;
      const ang = Math.sin(k * 30) * 0.035 * k * r.shakeAmp;
      _q.setFromAxisAngle(r.shakeAxis, ang);
      _m.makeRotationFromQuaternion(_q);
      const base = r.pool.matrices[r.idx];
      const t = new THREE.Matrix4().makeTranslation(base.elements[12], base.elements[13], base.elements[14]);
      const ti = new THREE.Matrix4().makeTranslation(-base.elements[12], -base.elements[13], -base.elements[14]);
      r.pool.set(r.idx, t.multiply(_m).multiply(ti).multiply(base));
    }
  }

  fellTree(res, fromX, fromZ, onLand) {
    const isPalm = res.kind === 'palm';
    const v = isPalm ? this.palmVariants[res.variant] : this.jungleVariants[res.variant];
    const group = new THREE.Group();
    group.position.set(res.x, res.y, res.z);
    const pivot = new THREE.Group();
    group.add(pivot);
    const inner = new THREE.Group();
    inner.rotation.y = res.rotY || 0;
    inner.scale.setScalar(res.scale || 1);
    pivot.add(inner);
    const a = new THREE.Mesh(v.trunk, isPalm ? this.M.palmBark : this.M.bark);
    const b = new THREE.Mesh(isPalm ? v.fronds : v.canopy, isPalm ? this.M.frond : this.M.canopy);
    a.castShadow = b.castShadow = true;
    inner.add(a, b);
    this.scene.add(group);
    // fall away from the player
    const dir = new THREE.Vector3(res.x - fromX, 0, res.z - fromZ).normalize();
    const axis = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    this.falling.push({ group, pivot, axis, t: 0, onLand });
    res.pool.show(res.idx, false);
    this.stumps ||= [];
    // stump
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * (res.scale || 1), 0.3 * (res.scale || 1), 0.35, 9), this.M.bark);
    stump.position.set(res.x, res.y + 0.17, res.z);
    stump.castShadow = true;
    this.scene.add(stump);
    res.stump = stump;
  }

  remove(res, respawnDelay, time) {
    res.alive = false;
    if (res.collider) res.collider.active = false;
    res.pool.show(res.idx, false);
    res.respawnAt = respawnDelay ? time + respawnDelay : 0;
  }

  restoreStump(res) {
    if (res.stump) { this.scene.remove(res.stump); res.stump = null; }
  }
}
