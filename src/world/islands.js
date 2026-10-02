// Distant islands: small heightfield islands (beach, jungle slopes, limestone cliffs) with low-detail trees.
import * as THREE from 'three';
import { makeNoise2D, fbm, smoothstep, mulberry32 } from '../util/noise.js';
import { palmGeometry, bushGeometry } from './models.js';
import { materials } from './materials.js';

const C = (hex) => new THREE.Color(hex);
const SAND = C(0xe8d3a0), GRASS = C(0x4a8a2c), JUNGLE = C(0x2f6a20), ROCK = C(0xa89f90), ROCK2 = C(0x7a7266), SEABED = C(0x8fb8a8);

// Builds one island of a given character. Returns { mesh, trees: [{x,y,z,s,kind}], coastR }
// types: jungle | karst (tower cluster) | atoll (ring + lagoon) | mesa | volcano | ridge (long) | rocks | horizon
function buildIsland(seed, cx, cz, R, H, type = 'jungle', rot = 0) {
  const rnd = mulberry32(seed);
  const n1 = makeNoise2D(seed), n2 = makeNoise2D(seed + 5);
  const peaks = [];
  const np = type === 'karst' ? 6 : type === 'rocks' ? 5 : type === 'jungle' ? 2 : 1;
  for (let i = 0; i < np; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * R * (type === 'karst' || type === 'rocks' ? 0.6 : 0.35);
    const pr = type === 'karst' ? R * (0.12 + rnd() * 0.1) : type === 'rocks' ? R * (0.15 + rnd() * 0.12) : R * (0.26 + rnd() * 0.16);
    peaks.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: pr, h: H * (0.5 + rnd() * 0.5) });
  }
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const height = (x0, z0) => {
    // elongated islands: squash the local frame
    let x = x0 * cr + z0 * sr, z = -x0 * sr + z0 * cr;
    if (type === 'ridge') z *= 2.6;
    const d = Math.hypot(x, z);
    const coast = R * (1 + 0.16 * fbm(n1, x * 2.2 / R, z * 2.2 / R, 3));
    let s = (coast - d) / R; // >0 inside
    if (type === 'atoll') s = 0.13 - Math.abs(d - R * 0.72) / R + 0.05 * n2(x * 3 / R, z * 3 / R);
    let h = s < 0 ? s * R * 0.35 : Math.min(s * R * 0.12, 1.2);
    if (type === 'atoll') return Math.max(s < 0 ? s * R * 0.25 : Math.min(s * R * 0.2, 2.2), -8);
    if (type === 'jungle' || type === 'ridge' || type === 'horizon') h += smoothstep(0.08, 0.6, s) * H * (type === 'ridge' ? 0.8 : 0.4) * (0.6 + 0.4 * fbm(n2, x * 3 / R, z * 3 / R, 3));
    if (type === 'mesa') h += H * smoothstep(0.12, 0.2, s + 0.03 * n2(x * 6 / R, z * 6 / R)) + H * 0.25 * smoothstep(0.35, 0.45, s);
    if (type === 'volcano') {
      const cone = H * Math.pow(Math.max(0, s), 0.9) * 1.1;
      const crater = H * 0.3 * smoothstep(0.16, 0.05, d / R);
      h += Math.max(0, cone - crater) * (0.9 + 0.1 * n2(x * 5 / R, z * 5 / R));
    }
    for (const p of peaks) {
      const dd = Math.hypot(x - p.x, z - p.z) / (p.r * (1 + 0.3 * n2(x * 4 / R, z * 4 / R)));
      const pw = type === 'karst' ? 7 : 5;
      h = Math.max(h, h * 0.4 + p.h / (1 + Math.pow(dd, pw)) * smoothstep(-0.05, 0.15, s + (type === 'rocks' ? 0.2 : 0)));
    }
    return Math.max(h, -8);
  };
  const N = R > 200 ? 64 : 48, ext = R * (type === 'ridge' ? 1.3 : 1.25), step = (ext * 2) / N;
  const pos = [], col = [], idx = [];
  const hs = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = -ext + i * step, z = -ext + j * step;
    const h = height(x, z);
    hs.push(h);
    pos.push(x, h, z);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const c = new THREE.Color(), t = new THREE.Color();
  const trees = [];
  for (let k = 0; k < hs.length; k++) {
    const h = hs[k], ny = nrm.getY(k), x = pos[k * 3], z = pos[k * 3 + 2];
    const slope = 1 - ny;
    if (h < 0) c.copy(SAND).lerp(SEABED, smoothstep(0, -4, h));
    else {
      c.copy(GRASS).lerp(JUNGLE, smoothstep(2, H * 0.5, h) * 0.7 + 0.3 * n1(x * 0.2, z * 0.2));
      t.copy(ROCK).lerp(ROCK2, 0.5 + 0.5 * n2(x * 0.3, h * 0.4));
      c.lerp(t, smoothstep(0.32, 0.55, slope));
      c.lerp(SAND, 1 - smoothstep(0.7, 1.5, h));
      // trees on gentle vegetated ground
      if (type !== 'horizon' && type !== 'rocks' && h > 1.2 && slope < 0.42 && rnd() < (type === 'atoll' ? 0.8 : 0.55)) {
        trees.push({ x: cx + x + (rnd() - 0.5) * step, y: h - 0.3, z: cz + z + (rnd() - 0.5) * step, s: 0.8 + rnd() * 0.5, kind: type === 'atoll' || (h < 6 && rnd() < 0.85) || rnd() < 0.25 ? 'palm' : 'tree', r: rnd() * 6.28 });
      }
    }
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.translate(cx, 0, cz);
  const mesh = new THREE.Mesh(geo, materials().scanIsland || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  return { mesh, trees, coastR: R };
}

export class DistantIslands {
  constructor(scene) {
    this.list = [];
    // each with its own silhouette and character; all out of reach for now
    const specs = [
      { x: 700, z: -650, R: 95, H: 115, type: 'karst' },       // cluster of sheer limestone towers
      { x: 660, z: 600, R: 115, H: 3, type: 'atoll' },         // low palm ring around a lagoon
      { x: -960, z: -150, R: 160, H: 150, type: 'volcano' },   // big cone with a crater
      { x: -150, z: -980, R: 125, H: 62, type: 'mesa' },       // flat-topped plateau
      { x: 1080, z: 160, R: 150, H: 58, type: 'ridge', rot: 0.4 }, // long forested ridge
      { x: -760, z: 660, R: 105, H: 52, type: 'jungle' },
      { x: 160, z: 820, R: 55, H: 22, type: 'rocks' },         // scattered bare rocks
      { x: -1450, z: -1150, R: 320, H: 130, type: 'horizon' }, // hazy landmass on the horizon
      { x: 580, z: -260, R: 26, H: 48, type: 'karst' },        // lone sentinel stack near the cove
      { x: -640, z: -540, R: 62, H: 38, type: 'jungle' },
    ];
    const allTrees = [];
    const geos = [];
    specs.forEach((s, k) => {
      const isl = buildIsland(900 + k * 17, s.x, s.z, s.R, s.H, s.type, s.rot || 0);
      geos.push(isl.mesh);
      scene.add(isl.mesh);
      allTrees.push(...isl.trees);
      this.list.push({ x: s.x, z: s.z, r: s.R });
    });
    // low-detail trees: one instanced mesh per kind
    const M = materials();
    const palm = palmGeometry(33, true), tree = bushGeometry(11, true, 9);
    const mk = (geo, mat, list) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      list.forEach((t, i) => {
        e.set(0, t.r, 0); q.setFromEuler(e);
        m.compose(v.set(t.x, t.y, t.z), q, sc.setScalar(t.s));
        im.setMatrixAt(i, m);
      });
      im.count = list.length;
      im.computeBoundingSphere();
      scene.add(im);
      return im;
    };
    // far away: fewer, bigger trees read the same and cost far less
    const palms = allTrees.filter((t) => t.kind === 'palm' && Math.random() < 0.45).map((t) => ({ ...t, s: t.s * 1.25 }));
    const jung = allTrees.filter((t) => t.kind === 'tree' && Math.random() < 0.5).map((t) => ({ ...t, s: t.s * 4, y: t.y - 0.6 }));
    mk(palm.trunk, M.palmBark, palms); mk(palm.fronds, M.frond, palms);
    mk(tree, M.bush, jung);
  }

  // Up to 12 circles for the water shader's fake shallows ring: (x, z, coastRadius)
  waterData() {
    return this.list.map((i) => new THREE.Vector3(i.x, i.z, i.r));
  }
}
