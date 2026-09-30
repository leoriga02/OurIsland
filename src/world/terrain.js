// Island heightfield built from the hand-designed layout (layout.js): coastline, tiered massifs,
// clearings, paths/ramps, pond, cove. Provides height/biome queries, chunked mesh, water-depth texture & minimap image.
import * as THREE from 'three';
import { makeNoise2D, fbm, smoothstep, clamp, lerp } from '../util/noise.js';
import { grassDetailTexture, sandDetailTexture, rockDetailTexture } from '../util/textures.js';
import {
  LAND, CARVE, MASSIFS, MASSIF_A, CLEARINGS, POND, CAVE, COVE, LOOKOUT, ARCH, ISLETS, ROCKY, BEACHES, PATHS,
} from './layout.js';

export const WORLD_SIZE = 960;
export const GRID = 384;
export const HALF = WORLD_SIZE / 2;
const CELL = WORLD_SIZE / GRID;
const N = GRID + 1;
const CHUNK = 48; // cells per mesh chunk (frustum culling)
export const HT_MIN = -22, HT_MAX = 18; // encoding range of the height texture

const C = (hex) => new THREE.Color(hex);
const COL = {
  sandDry: C(0xf0dcae), sandWet: C(0xcdb488), sandUnder: C(0xe6d6a8), seabed: C(0x7fa39a),
  reef: C(0x6b6a3e), reef2: C(0x8a5a4c),
  grass1: C(0x587a34), grass2: C(0x476a2e), grass3: C(0x7c8a46), jungle: C(0x3b5628), litter: C(0x5e5432),
  meadow: C(0x64803c), meadow2: C(0x7e8a48), high: C(0x66803f),
  dirt: C(0x94704a), dirtDark: C(0x6e5236),
  rock: C(0x9a9384), rockDark: C(0x5f5a52), moss: C(0x52693a),
};

const smax = (a, b, k) => { const h = clamp(0.5 + 0.5 * (a - b) / k, 0, 1); return lerp(b, a, h) + k * h * (1 - h); };
const smin = (a, b, k) => -smax(-a, -b, k);
function segDist(x, z, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
  return { d: Math.hypot(x - (ax + vx * t), z - (az + vz * t)), t };
}
// Catmull-Rom densify
function smoothLine(pts, sub = 5) {
  if (pts.length < 3) {
    const out = [];
    for (let k = 0; k <= sub * 2; k++) { const t = k / (sub * 2); out.push([lerp(pts[0][0], pts[1][0], t), lerp(pts[0][1], pts[1][1], t)]); }
    return out;
  }
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export class Terrain {
  constructor(seed = 7) {
    this.noise = makeNoise2D(seed);
    this.n2 = makeNoise2D(seed + 11);
    this.n3 = makeNoise2D(seed + 23);
    this.mountain = MASSIF_A;
    // locate massif A's cliff along the pond and cave bearings (the cliff line wobbles with noise)
    const pb = this.cliffBase(POND.angle), cb = this.cliffBase(CAVE.angle);
    this.pond = { x: pb.x + pb.ax * (POND.r + 1.5), z: pb.z + pb.az * (POND.r + 1.5), r: POND.r, y: 0 };
    this.cave = { x: cb.x, z: cb.z, ax: cb.ax, az: cb.az };
    for (const p of PATHS) {
      if (p.id === 'pond') p.pts[p.pts.length - 1] = [this.pond.x + pb.ax * (POND.r + 5) + pb.az * 8, this.pond.z + pb.az * (POND.r + 5) - pb.ax * 8];
    }
    this.cove = COVE; this.lookout = LOOKOUT; this.arch = ARCH; this.islets = ISLETS;
    this.clearings = CLEARINGS;
    this.heights = new Float32Array(N * N);
    this.coast = new Float32Array(N * N);
    this.mHigh = new Float32Array(N * N);
    this.mRocky = new Float32Array(N * N);
    this.mClear = new Float32Array(N * N);
    this.segs = [];
    this.segGrid = new Map();
    this._generate();
  }

  // ---------- analytic layout fields ----------
  landSD(x, z) {
    let d = -1e9;
    for (const b of LAND) {
      let v;
      if (b.type === 'ellipse') {
        const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z;
        const u = (dx * c + dz * s) / b.rx, w = (-dx * s + dz * c) / b.rz;
        v = (1 - Math.hypot(u, w)) * Math.min(b.rx, b.rz);
      } else v = b.r - segDist(x, z, b.ax, b.az, b.bx, b.bz).d;
      d = d < -1e8 ? v : smax(d, v, 28);
    }
    for (const c of CARVE) {
      const dist = c.type === 'circle' ? Math.hypot(x - c.x, z - c.z) - c.r : segDist(x, z, c.ax, c.az, c.bx, c.bz).d - c.r;
      d = smin(d, dist, 10);
    }
    // irregular coastline: bays, points and small rocky bites
    d += 15 * fbm(this.n2, x * 0.0065 + 3.1, z * 0.0065 - 1.7, 3) + 4.5 * this.n3(x * 0.03, z * 0.03);
    return d;
  }

  regionW(list, x, z) {
    let w = 0;
    for (const r of list) w = Math.max(w, smoothstep(r.r, r.r * 0.5, Math.hypot(x - r.x, z - r.z)));
    return w;
  }

  tierT(t, x, z) {
    const wob = 1 + 0.13 * this.n3(x * 0.015 + t.x * 0.01, z * 0.015) + 0.06 * this.n2(x * 0.04 + t.z * 0.01, z * 0.04) + 0.03 * this.noise(x * 0.1, z * 0.1);
    const dist = Math.hypot(x - t.x, z - t.z) / wob;
    return smoothstep(t.r + t.w / 2, t.r - t.w / 2, dist);
  }

  // Walk outward from massif A's centre along a bearing; return the foot of the big cliff.
  cliffBase(angleDeg) {
    const a = (angleDeg * Math.PI) / 180, ax = Math.cos(a), az = Math.sin(a);
    const M = MASSIF_A;
    let prev = this.baseHeight(M.x + ax * 80, M.z + az * 80), best = 0, bestD = 110;
    for (let d = 81; d < 150; d += 1) {
      const h = this.baseHeight(M.x + ax * d, M.z + az * d);
      if (prev - h > best) { best = prev - h; bestD = d; }
      prev = h;
    }
    // continue outward until the ground flattens out
    let d = bestD;
    for (; d < bestD + 12; d += 0.5) {
      const h0 = this.baseHeight(M.x + ax * d, M.z + az * d), h1 = this.baseHeight(M.x + ax * (d + 1), M.z + az * (d + 1));
      if (h0 - h1 < 0.4) break;
    }
    return { x: M.x + ax * d, z: M.z + az * d, ax, az };
  }

  // height before clearings/paths/pond, plus the "upper tier" mask
  baseHeight(x, z, out) {
    const d = this.landSD(x, z);
    const rocky = this.regionW(ROCKY, x, z) * (0.75 + 0.25 * this.n2(x * 0.02, z * 0.02));
    let h;
    if (d < 0) {
      h = 0.35 + d * (0.07 + rocky * 0.12) - smoothstep(-18, -60, d) * 18;
      const reef = Math.max(0, this.n3(x * 0.07, z * 0.07) - 0.25) * 1.3 * (1 - smoothstep(-4, -26, d)) * (1 - rocky);
      h += reef;
    } else {
      const bw = 16 + 26 * this.regionW(BEACHES, x, z);
      const beach = 0.35 + Math.min(d, bw) * (1.75 / bw);
      const inland = smoothstep(bw * 0.6, bw + 70, d);
      const hills = (fbm(this.noise, x * 0.008, z * 0.008, 4) * 0.5 + 0.5) * 11 * inland;
      h = beach + inland * 2 + hills + this.noise(x * 0.09, z * 0.09) * 0.25 * smoothstep(3, 12, d);
      // rocky coast: the land rises in a cliff straight out of the sea
      h += rocky * smoothstep(0, 6, d) * (6 + 6 * (this.n3(x * 0.04, z * 0.04) * 0.5 + 0.5));
    }
    // tiered massifs
    let high = 0;
    const landK = smoothstep(-8, 18, d);
    for (const m of MASSIFS) {
      let mh = 0;
      m.tiers.forEach((t, k) => {
        const tt = this.tierT(t, x, z);
        mh += t.h * tt;
        if (k >= 1) high = Math.max(high, tt);
      });
      if (mh > 0) {
        // weathered, uneven plateau surfaces
        mh += (this.noise(x * 0.05, z * 0.05) * 0.8 + fbm(this.n3, x * 0.02, z * 0.02, 2) * 1.2) * smoothstep(2, 10, mh);
        h += mh * landK;
      }
    }
    // hidden cove: a ring of cliffs around a small beach
    const dc = Math.hypot(x - COVE.x, z - COVE.z);
    if (dc < COVE.rimOut + 10) {
      const ring = smoothstep(COVE.rimIn - 3, COVE.rimIn + 4, dc) * smoothstep(COVE.rimOut + 8, COVE.rimOut - 12, dc);
      h += COVE.rimH * ring * (0.8 + 0.3 * this.noise(x * 0.06, z * 0.06)) * smoothstep(-2, 6, d);
    }
    // rocky islets offshore
    for (const p of ISLETS) {
      const dd = Math.hypot(x - p.x, z - p.z);
      if (dd > p.r * 2.6) continue;
      const wob = 1 + 0.25 * this.n2(x * 0.08, z * 0.08);
      const t = 1 - dd / (p.r * wob);
      let ih = -5 + smoothstep(-0.9, 0.25, t) * 6.4;
      ih += p.h / (1 + Math.pow(dd / (p.r * 0.55 * wob), 4)) * smoothstep(-0.2, 0.3, t);
      h = Math.max(h, ih);
    }
    if (out) { out.d = d; out.high = high; out.rocky = d > -30 ? rocky : 0; }
    return Math.max(h, HT_MIN);
  }

  // ---------- generation ----------
  _generate() {
    const H = this.heights, info = {};
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, x = -HALF + i * CELL, z = -HALF + j * CELL;
      H[k] = this.baseHeight(x, z, info);
      this.coast[k] = info.d; this.mHigh[k] = info.high; this.mRocky[k] = info.rocky;
    }
    // flat clearings
    for (const c of CLEARINGS) {
      c.y = this.baseHeight(c.x, c.z) + 0.2;
      const R = c.r + c.blend;
      this._forArea(c.x, c.z, R, (k, x, z) => {
        const w = smoothstep(R, c.r, Math.hypot(x - c.x, z - c.z) / (1 + 0.1 * this.n3(x * 0.03, z * 0.03)));
        H[k] = lerp(H[k], c.y + this.noise(x * 0.04, z * 0.04) * 0.25, w);
        this.mClear[k] = Math.max(this.mClear[k], w);
      });
    }
    this._paths();
    // waterfall pond: level just below the lowest rim point
    const P = this.pond;
    let minRim = 1e9;
    for (let a = 0; a < Math.PI * 2; a += 0.2) minRim = Math.min(minRim, this.heightAt(P.x + Math.cos(a) * (P.r + 3), P.z + Math.sin(a) * (P.r + 3)));
    P.y = minRim - 0.45;
    this._forArea(P.x, P.z, P.r + 5, (k, x, z) => {
      const dp = Math.hypot(x - P.x, z - P.z);
      const floor = dp < P.r ? P.y - 2.2 * (1 - (dp / P.r) ** 2) - 0.1 : P.y + 0.25;
      H[k] = lerp(floor, H[k], smoothstep(P.r - 0.5, P.r + 5, dp));
    });
    // spawn on the big south beach
    let sx = -16, sz = 470;
    while (sz > 0 && this.heightAt(sx, sz) < 0.55) sz -= 0.5;
    this.spawn = new THREE.Vector3(sx, 0, sz - 5);
    this.wreck = new THREE.Vector3(sx - 10, 0, sz + 4);
  }

  _forArea(cx, cz, R, fn) {
    const i0 = Math.max(0, Math.floor((cx - R + HALF) / CELL)), i1 = Math.min(GRID, Math.ceil((cx + R + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((cz - R + HALF) / CELL)), j1 = Math.min(GRID, Math.ceil((cz + R + HALF) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * N + i, -HALF + i * CELL, -HALF + j * CELL);
  }

  _paths() {
    const H = this.heights;
    const bestD = new Float32Array(N * N).fill(1e9), bestH = new Float32Array(N * N), bestW = new Float32Array(N * N), bestF = new Float32Array(N * N);
    for (const p of PATHS) {
      const line = smoothLine(p.pts, p.ramp ? 6 : 5);
      // arc length
      const L = [0];
      for (let i = 1; i < line.length; i++) L.push(L[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
      const tot = L[L.length - 1];
      let hs;
      if (p.ramp) {
        const h0 = this.heightAt(line[0][0], line[0][1]);
        const h1 = p.flat ? h0 : this.heightAt(line[line.length - 1][0], line[line.length - 1][1]);
        hs = L.map((l) => lerp(h0, h1, l / tot));
      } else {
        const raw = line.map(([x, z]) => this.heightAt(x, z));
        hs = raw.map((_, i) => { let s = 0, n = 0; for (let k = -3; k <= 3; k++) { const v = raw[i + k]; if (v !== undefined) { s += v; n++; } } return s / n - 0.15; });
      }
      const w = p.w ?? 1.6, f = p.f ?? 3;
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1];
        this._addSeg(ax, az, bx, bz, !p.hidden);
        const R = w + f;
        const cx = (ax + bx) / 2, cz = (az + bz) / 2, rr = Math.hypot(bx - ax, bz - az) / 2 + R;
        this._forArea(cx, cz, rr, (k, x, z) => {
          const { d, t } = segDist(x, z, ax, az, bx, bz);
          if (d > R || d >= bestD[k]) return;
          bestD[k] = d; bestH[k] = lerp(hs[i], hs[i + 1], t); bestW[k] = w; bestF[k] = f;
        });
      }
    }
    for (let k = 0; k < N * N; k++) {
      if (bestD[k] > 1e8) continue;
      const a = 1 - smoothstep(bestW[k], bestW[k] + bestF[k], bestD[k]);
      H[k] = lerp(H[k], bestH[k], a);
    }
  }

  _addSeg(ax, az, bx, bz, visible) {
    const seg = [ax, az, bx, bz, visible];
    this.segs.push(seg);
    const G = 32;
    const i0 = Math.floor((Math.min(ax, bx) - 12) / G), i1 = Math.floor((Math.max(ax, bx) + 12) / G);
    const j0 = Math.floor((Math.min(az, bz) - 12) / G), j1 = Math.floor((Math.max(az, bz) + 12) / G);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const key = i * 10007 + j;
      if (!this.segGrid.has(key)) this.segGrid.set(key, []);
      this.segGrid.get(key).push(seg);
    }
  }

  // distance to the nearest visible dirt path (large when none nearby)
  _pathDist(x, z, includeHidden = false) {
    const a = this.segGrid.get(Math.floor(x / 32) * 10007 + Math.floor(z / 32));
    if (!a) return 99;
    let best = 99;
    for (const s of a) {
      if (!s[4] && !includeHidden) continue;
      const d = segDist(x, z, s[0], s[1], s[2], s[3]).d;
      if (d < best) best = d;
    }
    return best;
  }
  pathDist(x, z) { return this._pathDist(x, z, true); }

  // ---------- queries ----------
  _sample(arr, x, z, outside = 0) {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    if (fx < 0 || fz < 0 || fx >= GRID || fz >= GRID) return outside;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = arr[j * N + i], b = arr[j * N + i + 1], c = arr[(j + 1) * N + i], d = arr[(j + 1) * N + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  heightAt(x, z) {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    if (fx < 0 || fz < 0 || fx >= GRID || fz >= GRID) return HT_MIN;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const H = this.heights;
    const h00 = H[j * N + i], h10 = H[j * N + i + 1], h01 = H[(j + 1) * N + i], h11 = H[(j + 1) * N + i + 1];
    if (u + v < 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.0;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  slopeAt(x, z) { return 1 - this.normalAt(x, z, _n).y; }
  coastDist(x, z) { return this._sample(this.coast, x, z, -200); }
  highW(x, z) { return this._sample(this.mHigh, x, z); }
  rockyW(x, z) { return this._sample(this.mRocky, x, z); }
  clearW(x, z) { return this._sample(this.mClear, x, z); }
  // dense jungle: inland lowland & foothills, broken by a few natural glades
  jungleW(x, z) {
    const d = this.coastDist(x, z);
    const glade = smoothstep(0.35, 0.6, this.n2(x * 0.012 + 7, z * 0.012));
    return smoothstep(22, 55, d) * (1 - this.clearW(x, z)) * (1 - this.highW(x, z)) * (1 - this.rockyW(x, z) * 0.8) * (1 - glade * 0.85);
  }
  // direction toward the sea (for leaning palms)
  seaward(x, z) {
    const gx = this.coastDist(x + 4, z) - this.coastDist(x - 4, z), gz = this.coastDist(x, z + 4) - this.coastDist(x, z - 4);
    return Math.atan2(-gz, -gx);
  }

  isInPond(x, z, pad = 0) {
    return Math.hypot(x - this.pond.x, z - this.pond.z) < this.pond.r + pad;
  }

  // ---------- colours ----------
  colorAt(x, h, z, ny, c, t, k = -1) {
    const n = this.noise(x * 0.05, z * 0.05);
    const n2 = this.n2(x * 0.013, z * 0.013);
    const slope = 1 - ny;
    if (h < 0.05) {
      c.copy(COL.sandUnder).lerp(COL.seabed, smoothstep(-1, -9, h));
      const reef = smoothstep(0.18, 0.45, this.n3(x * 0.07, z * 0.07));
      t.copy(n > 0 ? COL.reef : COL.reef2);
      c.lerp(t, reef * 0.75 * (1 - smoothstep(-5, -14, h)));
      return c;
    }
    const clear = k >= 0 ? this.mClear[k] : this.clearW(x, z);
    const high = k >= 0 ? this.mHigh[k] : this.highW(x, z);
    const jungle = this.jungleW(x, z);
    const sandLine = 1.55 + n * 0.45;
    // no sand on sea cliffs: steep ground stays rock right down to the water
    const rk = k >= 0 ? this.mRocky[k] : this.rockyW(x, z);
    const sand = (1 - smoothstep(sandLine, sandLine + 0.9, h)) * (1 - smoothstep(0.22, 0.4, slope)) * (1 - rk * smoothstep(0.1, 0.22, slope));
    // base grass, then biome tints
    c.copy(COL.grass1).lerp(COL.grass2, smoothstep(-0.3, 0.5, n2));
    c.lerp(COL.grass3, smoothstep(0.3, 0.8, n) * 0.5);
    t.copy(COL.jungle).lerp(COL.litter, smoothstep(0.1, 0.7, this.n3(x * 0.04, z * 0.04)) * 0.6);
    c.lerp(t, jungle * 0.75);
    t.copy(COL.meadow).lerp(COL.meadow2, smoothstep(-0.2, 0.6, this.n3(x * 0.03, z * 0.03)));
    c.lerp(t, clear * 0.85);
    c.lerp(COL.high, high * 0.6);
    // dirt paths
    const pd = this._pathDist(x, z);
    const path = 1 - smoothstep(1.0, 2.6 + n * 0.8, pd);
    t.copy(COL.dirt).lerp(COL.dirtDark, smoothstep(-0.2, 0.6, n));
    c.lerp(t, path * 0.95);
    // pond shore
    const dp = Math.hypot(x - this.pond.x, z - this.pond.z);
    if (dp < this.pond.r + 3) c.lerp(COL.dirtDark, 1 - smoothstep(this.pond.r, this.pond.r + 3, dp));
    // rock on steep ground; weathered rock patches on the upper tiers
    const rock = Math.max(smoothstep(0.2, 0.42, slope + n * 0.06), high * smoothstep(0.35, 0.75, this.n3(x * 0.05, z * 0.05)) * 0.6, rk * smoothstep(0.12, 0.26, slope));
    const streak = this.n3(x * 0.25, h * 0.6) * 0.5 + 0.5;
    t.copy(COL.rock).lerp(COL.rockDark, smoothstep(0.2, 0.9, streak * 0.7 + n2 * 0.3));
    t.lerp(COL.moss, smoothstep(0.35, 0.8, this.n2(x * 0.08, z * 0.08)) * 0.5);
    c.lerp(t, rock);
    // sand
    t.copy(COL.sandDry).lerp(COL.sandWet, 1 - smoothstep(0.25, 0.9, h));
    c.lerp(t, sand);
    return c;
  }

  // ---------- mesh (chunked for frustum culling) ----------
  buildMesh() {
    const H = this.heights;
    const pos = new Float32Array(N * N * 3), nrm = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
    const col = new Float32Array(N * N * 3), grassW = new Float32Array(N * N), rockW = new Float32Array(N * N);
    const hAt = (i, j) => H[clamp(j, 0, GRID) * N + clamp(i, 0, GRID)];
    const c = new THREE.Color(), t = new THREE.Color(), v = new THREE.Vector3();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, x = -HALF + i * CELL, z = -HALF + j * CELL, h = H[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 4; uv[k * 2 + 1] = z / 4;
      v.set(hAt(i - 1, j) - hAt(i + 1, j), 2 * CELL, hAt(i, j - 1) - hAt(i, j + 1)).normalize();
      nrm[k * 3] = v.x; nrm[k * 3 + 1] = v.y; nrm[k * 3 + 2] = v.z;
      this.colorAt(x, h, z, v.y, c, t, k);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      const n = this.noise(x * 0.05, z * 0.05);
      const sandLine = 1.55 + n * 0.45;
      const slope = 1 - v.y;
      rockW[k] = h < 0.3 ? 0 : Math.max(smoothstep(0.18, 0.4, slope), this.mRocky[k] * smoothstep(0.1, 0.24, slope));
      grassW[k] = h < 0.05 ? 0 : smoothstep(sandLine, sandLine + 0.9, h) * (1 - smoothstep(0.18, 0.4, slope)) * smoothstep(1.2, 2.6, this._pathDist(x, z));
    }
    this._arrays = { pos, nrm, uv, col, grassW, rockW };

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: sandDetailTexture(), roughness: 0.93, metalness: 0 });
    const grassTex = grassDetailTexture(), rockTex = rockDetailTexture();
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGrassTex = { value: grassTex };
      sh.uniforms.uRockTex = { value: rockTex };
      sh.vertexShader = 'attribute float aGrass;\nattribute float aRock;\nvarying float vGrass;\nvarying float vRock;\nvarying vec3 vWPos;\nvarying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrass = aGrass; vRock = aRock; vWPos = position; vWN = normal;');
      sh.fragmentShader = 'uniform sampler2D uGrassTex;\nuniform sampler2D uRockTex;\nvarying float vGrass;\nvarying float vRock;\nvarying vec3 vWPos;\nvarying vec3 vWN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
        float sd = texture2D(map, vMapUv * 1.3).r;
        vec4 gd = texture2D(uGrassTex, vMapUv * 1.6);
        float macro = texture2D(uGrassTex, vMapUv * 0.09).g;
        float grassD = gd.r * (0.82 + 0.36 * macro);
        float detail = mix(sd * (0.92 + 0.16 * macro), grassD, vGrass);
        if (vRock > 0.01) {
          vec3 an = abs(normalize(vWN));
          float rx = texture2D(uRockTex, vec2(vWPos.z, -vWPos.y) * vec2(0.06, 0.09)).r;
          float rz = texture2D(uRockTex, vec2(vWPos.x, -vWPos.y) * vec2(0.06, 0.09)).r;
          float rk = mix(rz, rx, an.x / (an.x + an.z + 0.001));
          rk *= 0.8 + 0.3 * texture2D(uRockTex, vec2(vWPos.x + vWPos.z, -vWPos.y) * 0.21).r;
          detail = mix(detail, rk * 1.05, vRock);
        }
        diffuseColor.rgb *= detail * 1.12;
      `);
    };
    mat.customProgramCacheKey = () => 'terrain4';

    const group = new THREE.Group();
    group.name = 'terrain';
    this.chunks = [];
    for (let cj = 0; cj < GRID; cj += CHUNK) for (let ci = 0; ci < GRID; ci += CHUNK) {
      const w = Math.min(CHUNK, GRID - ci) + 1, hgt = Math.min(CHUNK, GRID - cj) + 1;
      const map = new Uint32Array(w * hgt);
      for (let j = 0; j < hgt; j++) for (let i = 0; i < w; i++) map[j * w + i] = (cj + j) * N + ci + i;
      // skip chunks that are entirely deep ocean (the water plane covers them)
      let maxH = -99;
      for (const k of map) maxH = Math.max(maxH, H[k]);
      if (maxH < -6) continue;
      const g = new THREE.BufferGeometry();
      const take = (src, n) => { const a = new Float32Array(map.length * n); map.forEach((k, q) => { for (let e = 0; e < n; e++) a[q * n + e] = src[k * n + e]; }); return a; };
      g.setAttribute('position', new THREE.BufferAttribute(take(pos, 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(take(nrm, 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(take(uv, 2), 2));
      g.setAttribute('color', new THREE.BufferAttribute(take(col, 3), 3));
      g.setAttribute('aGrass', new THREE.BufferAttribute(take(grassW, 1), 1));
      g.setAttribute('aRock', new THREE.BufferAttribute(take(rockW, 1), 1));
      const idx = [];
      for (let j = 0; j < hgt - 1; j++) for (let i = 0; i < w - 1; i++) {
        const a = j * w + i, b = a + 1, cc = a + w, d = cc + 1;
        idx.push(a, cc, b, b, cc, d);
      }
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      group.add(mesh);
      this.chunks.push({ geo: g, map });
    }
    this.mesh = group;
    return group;
  }

  // Darkens terrain colours around trunks/rocks: cheap baked ambient occlusion.
  bakeOcclusion(spots) {
    const col = this._arrays.col;
    for (const { x, z, r, k } of spots) {
      this._forArea(x, z, r, (idx, px, pz) => {
        const d = Math.hypot(px - x, pz - z);
        if (d > r) return;
        const f = 1 - k * (1 - d / r) ** 1.5;
        col[idx * 3] *= f; col[idx * 3 + 1] *= f; col[idx * 3 + 2] *= f;
      });
    }
    for (const ch of this.chunks) {
      const a = ch.geo.attributes.color;
      ch.map.forEach((k, q) => a.setXYZ(q, col[k * 3], col[k * 3 + 1], col[k * 3 + 2]));
      a.needsUpdate = true;
    }
  }

  // Encodes terrain height in a texture so water can compute depth & foam.
  buildHeightTexture() {
    const data = new Uint8Array(N * N * 4);
    for (let k = 0; k < N * N; k++) {
      const v = clamp((this.heights[k] - HT_MIN) / (HT_MAX - HT_MIN), 0, 1);
      data[k * 4] = Math.round(v * 255);
      data[k * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.heightTex = tex;
    return tex;
  }

  // Top-down painted map for the minimap.
  buildMapImage(size = 384) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const img = g.createImageData(size, size);
    const c = new THREE.Color(), t = new THREE.Color();
    const shallow = C(0x3fd6cf), mid = C(0x1a93bd), deep = C(0x0d4f8f);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const wx = -HALF + (x + 0.5) / size * WORLD_SIZE, wz = -HALF + (y + 0.5) / size * WORLD_SIZE;
      const h = this.heightAt(wx, wz);
      const nrm = this.normalAt(wx, wz, _n);
      if (h < 0 || (this.isInPond(wx, wz) && h < this.pond.y)) {
        const d = this.isInPond(wx, wz) ? 1 : -h;
        c.copy(shallow).lerp(mid, smoothstep(0.5, 4, d)).lerp(deep, smoothstep(4, 16, d));
      } else {
        this.colorAt(wx, h, wz, nrm.y, c, t);
        const shade = clamp(0.75 + (nrm.x * -0.6 + nrm.z * -0.5) * 0.9, 0.45, 1.25);
        c.multiplyScalar(shade * (1 + smoothstep(0, 60, h) * 0.25));
      }
      c.convertLinearToSRGB();
      const i = (y * size + x) * 4;
      img.data[i] = clamp(c.r * 255, 0, 255); img.data[i + 1] = clamp(c.g * 255, 0, 255); img.data[i + 2] = clamp(c.b * 255, 0, 255); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
}

const _n = new THREE.Vector3();
