// The cave inside massif A: rock roof over the carved tunnels, a jammed-boulder entrance, ore veins,
// a deep chamber worth the trip, darkness that makes light useful, and one hazard (rockfall in the gallery).
import * as THREE from 'three';
import { materials } from '../world/materials.js';
import { Pool, scanRockVariants } from '../world/nature.js';
import { ASSETS } from '../world/assets.js';
import { boulderGeometry } from '../world/models.js';
import { MINERALS } from './items.js';

// scanned rock silhouettes when the asset pack loaded, procedural boulders otherwise
let _scan = null;
const rockGeo = (i) => (ASSETS.ok ? (_scan ||= scanRockVariants('boulder'))[i][0].geo : boulderGeometry(700 + i, { detail: 10, moss: 0.1 }));

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Cave {
  constructor(game) {
    this.g = game;
    const T = game.terrain, scene = game.scene, M = materials();
    this.T = T;
    this.k = 0;
    if (!T.cavePath) return;
    this._roof(scene, M);
    this._veins(scene, M);
    this._rubble();
    this.fall = null;
    this.fallT = 8;
    this.rock = new THREE.Mesh(rockGeo(2), M.scanRock || M.rock);
    this.rock.scale.setScalar(0.55);
    this.rock.visible = false;
    this.rock.castShadow = true;
    scene.add(this.rock);
  }

  // Roof: follows the original mountain surface over every carved cell deeper than a person's height,
  // so from outside the mountain looks untouched and inside it's a closed, dark cavern.
  _roof(scene, M) {
    const T = this.T, N = Math.sqrt(T.heights.length) | 0, HALF = 480, CELL = 960 / (N - 1);
    const ok = (k) => T.roofK.has(k);
    const pos = [], idx = [], map = new Map();
    const vert = (k) => {
      if (map.has(k)) return map.get(k);
      const i = k % N, j = (k / N) | 0;
      pos.push(-HALF + i * CELL, T.caveOrig.get(k) - 0.15, -HALF + j * CELL);
      map.set(k, pos.length / 3 - 1);
      return map.get(k);
    };
    for (const k of T.caveOrig.keys()) {
      const i = k % N, j = (k / N) | 0;
      if (i >= N - 1 || j >= N - 1) continue;
      const a = k, b = k + 1, c = k + N, d = k + N + 1;
      if (!ok(a) || !ok(b) || !ok(c) || !ok(d)) continue;
      idx.push(vert(a), vert(c), vert(b), vert(b), vert(c), vert(d));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = (M.scanRock || M.rock).clone();
    mat.side = THREE.DoubleSide;
    this.roof = new THREE.Mesh(g, mat);
    this.roof.castShadow = true; this.roof.receiveShadow = true;
    scene.add(this.roof);
  }

  // Ore veins along the walls: iron in the first chamber and the gallery, obsidian only in the deep chamber.
  _veins(scene, M) {
    const T = this.T, nat = this.g.nature;
    const oreMat = M.scanRock || M.rock;
    const obsMat = new THREE.MeshStandardMaterial({ color: 0x15131a, roughness: 0.18, metalness: 0.35 });
    this.orePool = new Pool(scene, [{ geo: rockGeo(1), mat: oreMat }], 20, { near: 45, far: 120 });
    this.obsPool = new Pool(scene, [{ geo: rockGeo(3), mat: obsMat }], 8, { near: 45, far: 120 });
    nat.pools.push(this.orePool, this.obsPool);
    const R = T.cavePath;
    const spots = [];
    // walk the path and drop veins near the walls on both sides
    const along = (seg0, seg1, n, kind) => {
      for (let i = 0; i < n; i++) {
        const sgf = seg0 + (seg1 - seg0) * ((i + 0.5) / n);
        const si = Math.min(R.length - 2, Math.floor(sgf)), t = sgf - si;
        const a = R[si], b = R[si + 1];
        const x0 = a.x + (b.x - a.x) * t, z0 = a.z + (b.z - a.z) * t, w = a.w + (b.w - a.w) * t;
        const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
        const side = i % 2 ? 1 : -1;
        const x = x0 + (-dz / L) * side * (w - 1.6), z = z0 + (dx / L) * side * (w - 1.6);
        spots.push({ x, z, kind });
      }
    };
    along(1.6, 2.4, 4, 'ore');
    along(2.6, 3.9, 3, 'ore');
    along(4.3, 4.95, 3, 'obsidian');
    const tint = new THREE.Color(1.3, 0.78, 0.6);
    for (const sp of spots) {
      const def = MINERALS[sp.kind];
      const y = T.heightAt(sp.x, sp.z), s = sp.kind === 'ore' ? 0.95 : 0.8;
      _e.set(0, Math.random() * 6, 0); _q.setFromEuler(_e);
      _m.compose(_p.set(sp.x, y + 0.1, sp.z), _q, _s.set(s * 1.2, s * 0.9, s));
      const pool = sp.kind === 'ore' ? this.orePool : this.obsPool;
      const idx = pool.add(_m, sp.kind === 'ore' ? tint : null);
      const col = nat.addCollider(sp.x, sp.z, s * 0.9, y + s);
      nat.addResource({ kind: sp.kind, x: sp.x, z: sp.z, y, r: s, hp: def.hp, maxHp: def.hp, pool, idx, collider: col, label: def.label });
    }
    for (const p of [this.orePool, this.obsPool]) p.finalize();
  }

  // loose boulders on the cave floor along the walls (decor)
  _rubble() {
    const T = this.T, nat = this.g.nature, R = T.cavePath;
    if (!nat.boulderPools) return;
    for (let i = 0; i < 22; i++) {
      const sgf = 1.2 + Math.random() * 3.7, si = Math.min(R.length - 2, Math.floor(sgf)), t = sgf - si;
      const a = R[si], b = R[si + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), w = a.w + (b.w - a.w) * t, side = Math.random() < 0.5 ? -1 : 1;
      const x = a.x + dx * t + (-dz / L) * side * (w + 0.6), z = a.z + dz * t + (dx / L) * side * (w + 0.6);
      const s = 0.5 + Math.random() * 1.1;
      _e.set(Math.random(), Math.random() * 6, Math.random() * 0.4); _q.setFromEuler(_e);
      _m.compose(_p.set(x, T.heightAt(x, z), z), _q, _s.set(s, s * 0.8, s));
      nat.boulderPools[i % nat.boulderPools.length].add(_m);
    }
  }

  // how deep inside the player is (drives darkness)
  depth(pos) { return this.T.cavePath ? this.T.caveW(pos.x, pos.z) * (pos.y < this.T.caveFloor0 + 6 ? 1 : 0) : 0; }

  update(dt, player) {
    if (!this.T.cavePath) return;
    const P = player.pos;
    this.k += (this.depth(P) - this.k) * Math.min(1, dt * 2.5);
    // rockfall in the unstable gallery: a rumble and dust warn you, then a rock drops where you were standing
    const q = this.T.caveQuery(P.x, P.z);
    const inGallery = q && q.seg > 2.6 && q.seg < 4.2 && q.d < q.w + 1 && P.y < this.T.caveFloor0 + 4;
    const g = this.g;
    if (this.fall) {
      const f = this.fall;
      f.t -= dt;
      if (f.stage === 'warn' && f.t <= 0) { f.stage = 'drop'; f.t = 0.45; this.rock.visible = true; }
      if (f.stage === 'drop') {
        const k = 1 - Math.max(0, f.t) / 0.45;
        this.rock.position.set(f.x, f.y + 6.5 - 6.3 * k * k, f.z);
        this.rock.rotation.x += dt * 6;
        if (f.t <= 0) {
          f.stage = 'rest'; f.t = 4;
          g.fx.burst('dust', new THREE.Vector3(f.x, f.y + 0.3, f.z), 26);
          g.audio.treeFall?.(); g.rig.shake(0.1, 0.35);
          if (Math.hypot(P.x - f.x, P.z - f.z) < 2.1 && !g.dead) g.hurtPlayer(18, { label: 'Una frana' });
        }
      }
      if (f.stage === 'rest' && f.t <= 0) { this.rock.visible = false; this.fall = null; }
    } else if (inGallery) {
      this.fallT -= dt;
      if (this.fallT <= 0) {
        this.fallT = 6 + Math.random() * 5;
        const ahead = g.player.forward;
        const x = P.x + ahead.x * 1.2, z = P.z + ahead.z * 1.2, y = this.T.heightAt(x, z);
        this.fall = { stage: 'warn', t: 1.3, x, y, z };
        g.fx.burst('dust', new THREE.Vector3(x, y + 5.5, z), 14);
        g.audio.grunt?.(); g.rig.shake(0.03, 1.0);
        g.ui.toast(null, '⚠️ La volta trema… spostati!', true);
      }
    }
  }
}
