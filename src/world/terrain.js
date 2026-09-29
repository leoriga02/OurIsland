// Island heightfield: generation, mesh, height queries, water-depth texture & minimap image.
import * as THREE from 'three';
import { makeNoise2D, fbm, smoothstep, clamp, lerp } from '../util/noise.js';
import { grassDetailTexture, sandDetailTexture, rockDetailTexture } from '../util/textures.js';

export const WORLD_SIZE = 560;
export const GRID = 280;
export const HALF = WORLD_SIZE / 2;
const CELL = WORLD_SIZE / GRID;
export const HT_MIN = -22, HT_MAX = 18; // encoding range of the height texture

const C = (hex) => new THREE.Color(hex);
const COL = {
  sandDry: C(0xf0dcae), sandWet: C(0xcdb488), sandUnder: C(0xe6d6a8), seabed: C(0x7fa39a),
  reef: C(0x6b6a3e), reef2: C(0x8a5a4c),
  grass1: C(0x4c8a2c), grass2: C(0x376f22), grass3: C(0x7a9636), jungle: C(0x2a5e1e),
  dirt: C(0x94704a), dirtDark: C(0x6e5236),
  rock: C(0xa39a8b), rockDark: C(0x6f675c), moss: C(0x4f6e2c),
};

export class Terrain {
  constructor(seed = 7) {
    this.noise = makeNoise2D(seed);
    this.n2 = makeNoise2D(seed + 11);
    this.n3 = makeNoise2D(seed + 23);
    this.mountain = { x: -18, z: -62, h: 54, s: 52 };
    this.pond = { x: 28, z: 14, r: 11, y: 0 };
    // limestone karst peaks, part of the heightfield so they blend into the land (x, z, radius, height)
    this.peaks = [
      [-40, -92, 14, 58], [-8, -110, 12, 48], [-62, -62, 12, 40], [16, -86, 10, 32], [-32, -44, 9, 26],
      [-22, -72, 11, 40], [66, -116, 11, 34], [-96, -94, 11, 30], [-118, 26, 9, 24], [48, -96, 9, 24], [-78, -30, 9, 22],
    ].map(([x, z, r, h]) => ({ x, z, r, h }));
    // small rocky islets offshore (x, z, radius, peak height)
    this.islets = [];
    for (const [a, off, r, h] of [[0.95, 34, 12, 9], [2.3, 30, 10, 14], [3.3, 40, 14, 18], [4.1, 26, 8, 7], [5.0, 38, 13, 16], [5.9, 30, 9, 9]]) {
      const cr = this.coastR(Math.cos(a) * 150, Math.sin(a) * 150) + off;
      this.islets.push({ x: Math.cos(a) * cr, z: Math.sin(a) * cr, r, h });
    }
    this.paths = [];
    this.heights = new Float32Array((GRID + 1) * (GRID + 1));
    this._generate();
  }

  coastR(x, z) {
    return 146 + 34 * fbm(this.n2, x * 0.0045 + 3.1, z * 0.0045 - 1.7, 3) + 7 * this.n3(x * 0.02, z * 0.02);
  }

  coastDist(x, z) { return this.coastR(x, z) - Math.hypot(x, z); }

  _cliff(x, z) {
    const P = this.pond, M = this.mountain;
    let dx = M.x - P.x, dz = M.z - P.z;
    const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    const qx = P.x + dx * (P.r + 3), qz = P.z + dz * (P.r + 3);
    const px = x - qx, pz = z - qz;
    const t = px * dx + pz * dz;
    const lat = px * -dz + pz * dx;
    return 9 * smoothstep(0, 5, t) * Math.exp(-(lat * lat) / (2 * 22 * 22));
  }

  rawHeight(x, z) {
    const s = this.coastDist(x, z);
    let h;
    if (s < 0) {
      h = 0.35 + s * 0.07 - smoothstep(-18, -60, s) * 18;
      const reef = Math.max(0, this.n3(x * 0.07, z * 0.07) - 0.25) * 1.3 * (1 - smoothstep(-4, -26, s));
      h += reef;
    } else {
      const beach = 0.35 + Math.min(s, 14) * 0.1;
      const inland = smoothstep(8, 55, s);
      const hills = (fbm(this.noise, x * 0.011, z * 0.011, 4) * 0.5 + 0.5) * 10 * inland;
      h = beach + hills + inland * 1.2;
      h += this.noise(x * 0.09, z * 0.09) * 0.25 * smoothstep(3, 12, s);
    }
    const M = this.mountain;
    const dx = x - M.x, dz = z - M.z;
    const ridge = 1 - Math.abs(this.noise(x * 0.018 + 5, z * 0.018));
    const mt = M.h * Math.exp(-(dx * dx + dz * dz) / (2 * M.s * M.s)) * (0.7 + 0.45 * ridge);
    h += mt * smoothstep(-12, 22, s);
    h += this._cliff(x, z) * smoothstep(5, 30, s);
    h += this.peakHeight(x, z);
    if (s < 12) h = Math.max(h, this.isletHeight(x, z));
    return Math.max(h, HT_MIN);
  }

  isletHeight(x, z) {
    let best = -99;
    for (const p of this.islets) {
      const dx = x - p.x, dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > p.r * 2.5) continue;
      const wob = 1 + 0.25 * this.n2(x * 0.08, z * 0.08);
      const t = 1 - d / (p.r * wob);
      let ih = -5 + smoothstep(-0.9, 0.25, t) * 6.4;
      const dd = d / (p.r * 0.5 * wob);
      ih += p.h / (1 + Math.pow(dd, 4)) * smoothstep(-0.2, 0.3, t);
      best = Math.max(best, ih);
    }
    return best;
  }

  // Steep-sided, round-topped towers with lumpy outlines and weathered ledges.
  peakHeight(x, z) {
    let sum = 0;
    for (const p of this.peaks) {
      const dx = x - p.x, dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      const R = p.r * 2.2;
      if (d2 > R * R) continue;
      const wob = 1 + 0.3 * this.n3(x * 0.07 + p.x, z * 0.07) + 0.12 * this.noise(x * 0.2, z * 0.2);
      const d = Math.sqrt(d2) / (p.r * wob);
      let f = 1 / (1 + Math.pow(d, 5));
      f += 0.12 * Math.exp(-d * d * 3); // domed top
      let hp = p.h * f;
      hp += Math.sin(hp * 0.55 + this.noise(x * 0.1, z * 0.1) * 2) * 0.9 * smoothstep(0.1, 0.5, f) * (1 - smoothstep(0.85, 1, f)); // ledges
      sum = Math.max(sum, hp);
    }
    return sum;
  }

  _pathDist(x, z) {
    let best = 1e9;
    for (const seg of this.paths) {
      const [ax, az, bx, bz] = seg;
      const vx = bx - ax, vz = bz - az;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
      const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
      if (d < best) best = d;
    }
    return best;
  }

  _generate() {
    const P = this.pond;
    // Spawn: walk in from the south until we reach the beach.
    let sx = 18, sz = 260;
    while (sz > 0 && this.rawHeight(sx, sz) < 0.55) sz -= 0.5;
    this.spawn = new THREE.Vector3(sx, 0, sz - 4);
    this.wreck = new THREE.Vector3(sx - 9, 0, sz + 7);

    // pond level: a bit below the lowest point of its rim
    let minRim = 1e9;
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      minRim = Math.min(minRim, this.rawHeight(P.x + Math.cos(a) * (P.r + 3), P.z + Math.sin(a) * (P.r + 3)));
    }
    P.y = minRim - 0.45;

    // Dirt paths (polyline pairs)
    const pts = [[sx, sz - 12], [sx - 4, sz - 40], [sx + 6, sz - 70], [sx + 2, sz - 100], [P.x - 2, P.z + P.r + 3]];
    const addLine = (arr) => { for (let i = 0; i < arr.length - 1; i++) this.paths.push([...arr[i], ...arr[i + 1]]); };
    addLine(pts);
    addLine([[sx + 6, sz - 70], [sx + 40, sz - 85], [sx + 75, sz - 110]]);
    addLine([[sx + 2, sz - 100], [sx - 35, sz - 112], [sx - 70, sz - 125]]);

    const N = GRID + 1;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * CELL, z = -HALF + j * CELL;
        let h = this.rawHeight(x, z);
        const pd = this._pathDist(x, z);
        if (pd < 4 && h > 0.6) h -= 0.18 * (1 - smoothstep(1, 3.5, pd));
        const dp = Math.hypot(x - P.x, z - P.z);
        if (dp < P.r + 5) {
          const floor = dp < P.r ? P.y - 2.2 * (1 - (dp / P.r) ** 2) - 0.1 : P.y + 0.25;
          h = lerp(floor, h, smoothstep(P.r - 0.5, P.r + 5, dp));
        }
        this.heights[j * N + i] = h;
      }
    }
  }

  heightAt(x, z) {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    if (fx < 0 || fz < 0 || fx >= GRID || fz >= GRID) return HT_MIN;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const N = GRID + 1, H = this.heights;
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

  isInPond(x, z, pad = 0) {
    return Math.hypot(x - this.pond.x, z - this.pond.z) < this.pond.r + pad;
  }

  pathDist(x, z) { return this._pathDist(x, z); }

  buildMesh() {
    const N = GRID + 1;
    const pos = new Float32Array(N * N * 3);
    const uv = new Float32Array(N * N * 2);
    const col = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = -HALF + i * CELL, z = -HALF + j * CELL;
      pos[k * 3] = x; pos[k * 3 + 1] = this.heights[k]; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 4; uv[k * 2 + 1] = z / 4;
    }
    const idx = new Uint32Array(GRID * GRID * 6);
    let p = 0;
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const nrm = g.attributes.normal.array;

    const c = new THREE.Color(), t = new THREE.Color();
    const grassW = new Float32Array(N * N);
    const rockW = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) {
      const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2];
      this.colorAt(x, h, z, nrm[k * 3 + 1], c, t);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      const n = this.noise(x * 0.05, z * 0.05);
      const sandLine = 1.55 + n * 0.45;
      const slope = 1 - nrm[k * 3 + 1];
      rockW[k] = h < 0.3 ? 0 : Math.max(smoothstep(0.3, 0.55, slope), smoothstep(1, 5, this.peakHeight(x, z)) * smoothstep(0.16, 0.36, slope));
      grassW[k] = h < 0.05 ? 0 : smoothstep(sandLine, sandLine + 0.9, h) * (1 - smoothstep(0.3, 0.55, slope)) * smoothstep(1.2, 2.6, this._pathDist(x, z));
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aGrass', new THREE.BufferAttribute(grassW, 1));
    g.setAttribute('aRock', new THREE.BufferAttribute(rockW, 1));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: sandDetailTexture(), roughness: 0.93, metalness: 0,
    });
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
          // side-projected rock streaks on cliffs
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
    mat.customProgramCacheKey = () => 'terrain3';
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.mesh = mesh;
    return mesh;
  }

  colorAt(x, h, z, ny, c, t) {
    const n = this.noise(x * 0.05, z * 0.05);
    const n2 = this.n2(x * 0.013, z * 0.013);
    const slope = 1 - ny;
    if (h < 0.05) {
      // underwater: sand fading to seabed, reef patches
      c.copy(COL.sandUnder).lerp(COL.seabed, smoothstep(-1, -9, h));
      const reef = smoothstep(0.18, 0.45, this.n3(x * 0.07, z * 0.07));
      t.copy(n > 0 ? COL.reef : COL.reef2);
      c.lerp(t, reef * 0.75 * (1 - smoothstep(-5, -14, h)));
      return c;
    }
    const sandLine = 1.55 + n * 0.45;
    const sand = 1 - smoothstep(sandLine, sandLine + 0.9, h);
    // grass variety
    c.copy(COL.grass1).lerp(COL.grass2, smoothstep(-0.3, 0.5, n2));
    c.lerp(COL.grass3, smoothstep(0.3, 0.8, n) * 0.6);
    c.lerp(COL.jungle, smoothstep(6, 16, h) * 0.55);
    // dirt paths
    const pd = this._pathDist(x, z);
    const path = 1 - smoothstep(1.0, 2.8 + n * 0.8, pd);
    t.copy(COL.dirt).lerp(COL.dirtDark, smoothstep(-0.2, 0.6, n));
    c.lerp(t, path * 0.95);
    // pond shore
    const dp = Math.hypot(x - this.pond.x, z - this.pond.z);
    if (dp < this.pond.r + 3) c.lerp(COL.dirtDark, 1 - smoothstep(this.pond.r, this.pond.r + 3, dp));
    // rock on slopes
    const onPeak = smoothstep(1, 5, this.peakHeight(x, z));
    const rock = Math.max(smoothstep(0.34, 0.6, slope + n * 0.08), onPeak * smoothstep(0.16, 0.36, slope + n * 0.06));
    const streak = this.n3(x * 0.25, h * 0.6) * 0.5 + 0.5;
    t.copy(COL.rock).lerp(COL.rockDark, smoothstep(0.2, 0.9, streak * 0.7 + n2 * 0.3));
    t.lerp(COL.moss, smoothstep(0.35, 0.8, this.n2(x * 0.08, z * 0.08)) * 0.55);
    c.lerp(t, rock);
    // sand
    t.copy(COL.sandDry).lerp(COL.sandWet, 1 - smoothstep(0.25, 0.9, h));
    c.lerp(t, sand);
    return c;
  }

  // Darkens terrain colours around trunks/rocks: cheap baked ambient occlusion.
  bakeOcclusion(spots) {
    const col = this.mesh.geometry.attributes.color;
    const N = GRID + 1;
    for (const { x, z, r, k } of spots) {
      const i0 = Math.max(0, Math.floor((x - r + HALF) / CELL)), i1 = Math.min(GRID, Math.ceil((x + r + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((z - r + HALF) / CELL)), j1 = Math.min(GRID, Math.ceil((z + r + HALF) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-HALF + i * CELL - x, -HALF + j * CELL - z);
        if (d > r) continue;
        const f = 1 - k * (1 - d / r) ** 1.5;
        const idx = j * N + i;
        col.setXYZ(idx, col.getX(idx) * f, col.getY(idx) * f, col.getZ(idx) * f);
      }
    }
    col.needsUpdate = true;
  }

  // Encodes terrain height in a texture so water can compute depth & foam.
  buildHeightTexture() {
    const N = GRID + 1;
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
  buildMapImage(size = 256) {
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
        c.multiplyScalar(shade);
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
