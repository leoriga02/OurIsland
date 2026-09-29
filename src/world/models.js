// Procedural geometry builders for vegetation & rocks.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, smoothstep, clamp } from '../util/noise.js';

// ---------- helpers ----------
export function setColor(geo, r, g, b) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
export function merge(list, groups = false) {
  const clean = list.map((g) => {
    g = g.index ? g : indexify(g);
    if (!g.attributes.color) setColor(g, 1, 1, 1);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  return mergeGeometries(clean, groups);
}
function indexify(g) {
  const n = g.attributes.position.count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// custom mesh from arrays
function build(pos, nrm, uv, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  if (!nrm) g.computeVertexNormals();
  return g;
}

// 3D value noise
function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return L(
    L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
    L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
function fbm3(x, y, z, o = 3) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < o; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.1; }
  return s / n;
}

// ---------- leaf cards ----------
function leafCards(out, center, radii, count, size, rnd, tint = [1, 1, 1], normalUp = 0.35) {
  const { pos, nrm, uv, col, idx } = out;
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const v = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    d.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    if (d.lengthSq() > 1 || d.lengthSq() < 0.01) { i--; continue; }
    d.normalize();
    const rr = 0.55 + 0.45 * rnd();
    const px = center.x + d.x * radii.x * rr, py = center.y + d.y * radii.y * rr, pz = center.z + d.z * radii.z * rr;
    e.set(rnd() * Math.PI * 2, rnd() * Math.PI * 2, rnd() * Math.PI * 2); q.setFromEuler(e);
    n.set(d.x / radii.x, d.y / radii.y + normalUp, d.z / radii.z).normalize();
    const s = size * (0.75 + rnd() * 0.5);
    const shade = 0.5 + 0.5 * clamp(d.y * 0.5 + 0.6, 0, 1);
    const hueJ = 0.9 + rnd() * 0.2;
    const base = pos.length / 3;
    for (const [cx, cy] of corners) {
      v.set(cx * s, cy * s, 0).applyQuaternion(q);
      pos.push(px + v.x, py + v.y, pz + v.z);
      nrm.push(n.x, n.y, n.z);
      uv.push(cx + 0.5, cy + 0.5);
      col.push(tint[0] * shade * hueJ, tint[1] * shade, tint[2] * shade * (2 - hueJ));
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
const newBuf = () => ({ pos: [], nrm: [], uv: [], col: [], idx: [] });
const fromBuf = (b) => build(b.pos, b.nrm, b.uv, b.col, b.idx);

// ---------- palm ----------
export function palmGeometry(seed, low = false) {
  const rnd = mulberry32(seed);
  const H = 5.2 + rnd() * 3.4;
  const bend = 0.12 + rnd() * 0.2;
  const S = low ? 6 : 14, R = low ? 5 : 8;
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  const center = (t) => new THREE.Vector3(bend * H * t * t, H * t, 0);
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const c = center(t);
    const tan = new THREE.Vector3(2 * bend * H * t, H, 0).normalize();
    const side = new THREE.Vector3(0, 0, 1);
    const other = new THREE.Vector3().crossVectors(tan, side).normalize();
    let r = 0.2 * (1 - 0.3 * t) + 0.2 * Math.pow(1 - t, 10);
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * Math.PI * 2;
      const o = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(other, Math.sin(a));
      const rr = r * (1 + 0.05 * Math.sin(t * H * 6));
      pos.push(c.x + o.x * rr, c.y + o.y * rr, c.z + o.z * rr);
      nrm.push(o.x, o.y, o.z);
      uv.push(j / R, t * H / 1.6);
      const sh = 0.75 + 0.25 * t;
      col.push(sh, sh, sh);
    }
  }
  for (let i = 0; i < S; i++) for (let j = 0; j < R; j++) {
    const a = i * (R + 1) + j, b = a + R + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const trunk = build(pos, nrm, uv, col, idx);
  const top = center(1);
  const parts = [trunk];
  // crown bulge + coconuts
  const bulge = new THREE.SphereGeometry(0.3, low ? 5 : 8, low ? 4 : 6);
  bulge.scale(1, 0.8, 1); bulge.translate(top.x, top.y - 0.05, top.z);
  setColor(bulge, 0.45, 0.4, 0.22);
  parts.push(bulge);
  const nCoco = 2 + Math.floor(rnd() * 4);
  for (let k = 0; k < nCoco; k++) {
    const a = rnd() * Math.PI * 2, dy = rnd() * 0.1, green = rnd() < 0.5;
    if (low) continue;
    const s = new THREE.SphereGeometry(0.15, 7, 5);
    s.translate(top.x + Math.cos(a) * 0.24, top.y - 0.28 - dy, top.z + Math.sin(a) * 0.24);
    if (green) setColor(s, 0.42, 0.5, 0.16); else setColor(s, 0.38, 0.24, 0.12);
    parts.push(s);
  }
  const trunkGeo = merge(parts);

  // fronds
  const fb = newBuf();
  const F = 9 + Math.floor(rnd() * 4);
  for (let k = 0; k < F; k++) {
    const yaw = (k / F) * Math.PI * 2 + rnd() * 0.4;
    const pitch0 = 0.25 + rnd() * 0.75;
    const L = 3.3 + rnd() * 1.2, W = 1.55 + rnd() * 0.3;
    const fw = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const right = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
    const SEG = low ? 4 : 8;
    const curl = 1.5 + rnd() * 0.15;
    let p = top.clone().addScaledVector(fw, 0.1);
    const base = fb.pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG;
      const pitch = pitch0 - s * curl;
      const dir = fw.clone().multiplyScalar(Math.cos(pitch)).add(new THREE.Vector3(0, Math.sin(pitch), 0));
      const w = W * (1 - 0.3 * s) * 0.5;
      const droop = w * 0.45;
      const up = new THREE.Vector3(0, 1, 0);
      const pts = [
        p.clone().addScaledVector(right, -w).addScaledVector(up, -droop),
        p.clone().addScaledVector(up, 0.02),
        p.clone().addScaledVector(right, w).addScaledVector(up, -droop),
      ];
      const n = new THREE.Vector3().crossVectors(right, dir).normalize();
      if (n.y < 0) n.negate();
      n.y += 0.8; n.normalize();
      pts.forEach((pt, c) => {
        fb.pos.push(pt.x, pt.y, pt.z);
        fb.nrm.push(n.x, n.y, n.z);
        fb.uv.push(c / 2, s);
        fb.col.push(1, 1, 1);
      });
      p.addScaledVector(dir, L / SEG);
    }
    for (let i = 0; i < SEG; i++) {
      const a = base + i * 3;
      fb.idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const frondGeo = fromBuf(fb);
  return { trunk: trunkGeo, fronds: frondGeo, top, height: H };
}

// ---------- broadleaf jungle tree ----------
export function jungleTreeGeometry(seed, low = false) {
  const rnd = mulberry32(seed);
  const H = 7 + rnd() * 5;
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.2, 0.42, H, low ? 5 : 9, low ? 3 : 7);
  trunk.translate(0, H / 2, 0);
  const p = trunk.attributes.position;
  const lean = (rnd() - 0.5) * 0.12;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / H;
    p.setX(i, p.getX(i) * (1 + 0.5 * Math.pow(1 - t, 6)) + lean * y * t + Math.sin(t * 5 + seed) * 0.12);
    p.setZ(i, p.getZ(i) * (1 + 0.5 * Math.pow(1 - t, 6)));
  }
  trunk.computeVertexNormals();
  const uvs = trunk.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setY(i, uvs.getY(i) * H / 2);
  parts.push(trunk);
  const topX = lean * H + Math.sin(5 + seed) * 0.12;
  // branches
  const clumps = [];
  const nb = 3 + Math.floor(rnd() * 2);
  for (let b = 0; b < nb; b++) {
    const a = (b / nb) * Math.PI * 2 + rnd();
    const bl = 2 + rnd() * 1.5;
    const by = H * (0.6 + rnd() * 0.25);
    const br = new THREE.CylinderGeometry(0.06, 0.14, bl, low ? 4 : 6, 1);
    br.translate(0, bl / 2, 0);
    br.rotateZ(-0.9 - rnd() * 0.3);
    br.rotateY(a);
    br.translate(topX * (by / H), by, 0);
    parts.push(br);
    const ex = topX * (by / H) + Math.cos(a) * bl * 0.8, ez = -Math.sin(a) * bl * 0.8;
    clumps.push(new THREE.Vector3(ex, by + bl * 0.55, ez));
  }
  clumps.push(new THREE.Vector3(topX, H + 0.3, 0));
  const trunkGeo = merge(parts);
  const cb = newBuf();
  clumps.forEach((c, k) => {
    const r = 1.9 + rnd() * 0.9;
    const cr = mulberry32(seed * 31 + k);
    leafCards(cb, c, new THREE.Vector3(r, r * 0.62, r), low ? 11 : 28, low ? 2.7 : 1.9, cr, [0.95, 1, 0.9]);
  });
  return { trunk: trunkGeo, canopy: fromBuf(cb), height: H + 2 };
}

// ---------- small plants ----------
export function bushGeometry(seed, big = false) {
  const rnd = mulberry32(seed);
  const cb = newBuf();
  const r = big ? 1.3 : 0.85;
  leafCards(cb, new THREE.Vector3(0, r * 0.62, 0), new THREE.Vector3(r, r * 0.7, r), big ? 26 : 16, big ? 1.2 : 0.9, rnd, [1, 1, 1], 0.5);
  return fromBuf(cb);
}

export function bananaPlantGeometry(seed) {
  const rnd = mulberry32(seed);
  const b = newBuf();
  const nL = 6 + Math.floor(rnd() * 3);
  for (let k = 0; k < nL; k++) {
    const yaw = (k / nL) * Math.PI * 2 + rnd() * 0.5;
    const L = 1.5 + rnd() * 0.9, W = 0.5 + rnd() * 0.15;
    const pitch0 = 1.1 + rnd() * 0.3;
    const fw = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const right = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
    let p = new THREE.Vector3(0, 0.25 + rnd() * 0.4, 0);
    const SEG = 6, base = b.pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG;
      const pitch = pitch0 - s * (1.4 + rnd() * 0.3);
      const dir = fw.clone().multiplyScalar(Math.cos(pitch)).add(new THREE.Vector3(0, Math.sin(pitch), 0));
      const w = W * 0.5;
      for (let c = 0; c < 3; c++) {
        const off = (c - 1) * w;
        const pt = p.clone().addScaledVector(right, off).add(new THREE.Vector3(0, c === 1 ? 0.03 : -0.03, 0));
        b.pos.push(pt.x, pt.y, pt.z);
        b.nrm.push(0, 1, 0);
        b.uv.push(c / 2, s);
        b.col.push(1, 1, 1);
      }
      p.addScaledVector(dir, L / SEG);
    }
    for (let i = 0; i < SEG; i++) {
      const a = base + i * 3;
      b.idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  return fromBuf(b);
}

function crossedQuads(w, h, n, rnd, shadeBottom = 0.55) {
  const b = newBuf();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI + (rnd ? rnd() * 0.4 : 0);
    const dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
    const base = b.pos.length / 3;
    const nx = -Math.sin(a) * 0.3, nz = Math.cos(a) * 0.3;
    b.pos.push(-dx, 0, -dz, dx, 0, dz, dx, h, dz, -dx, h, -dz);
    for (let i = 0; i < 4; i++) b.nrm.push(nx, 1, nz);
    b.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    b.col.push(shadeBottom, shadeBottom, shadeBottom, shadeBottom, shadeBottom, shadeBottom, 1, 1, 1, 1, 1, 1);
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return fromBuf(b);
}
export const grassTuftGeometry = (seed) => crossedQuads(0.9, 0.55, 3, mulberry32(seed));
export const fiberPlantGeometry = () => crossedQuads(1.2, 1.35, 3, mulberry32(3), 0.7);
export function flowerGeometry() {
  const g = new THREE.PlaneGeometry(0.28, 0.28);
  g.rotateX(-Math.PI / 2.6);
  return setColor(g, 1, 1, 1);
}

// ---------- rocks ----------
export function boulderGeometry(seed, { detail = 16, rough = 0.28, flat = 0.35, moss = 0.6, tint = [0.55, 0.51, 0.46], cuts = 4 } = {}) {
  const rnd = mulberry32(seed);
  let g = new THREE.SphereGeometry(1, detail, Math.round(detail * 0.7));
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const o = rnd() * 100;
  const disp = new Float32Array(p.count);
  // random slicing planes give chunky, fractured faces instead of an egg shape
  const planes = [];
  for (let k = 0; k < cuts; k++) {
    const n = new THREE.Vector3(rnd() * 2 - 1, rnd() * 1.4 - 0.2, rnd() * 2 - 1).normalize();
    planes.push({ n, d: 0.62 + rnd() * 0.25 });
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + rough * fbm3(x * 1.2 + o, y * 1.2, z * 1.2 + o, 3) + 0.06 * noise3(x * 5 + o, y * 5, z * 5);
    disp[i] = d;
    v.set(x * d, y * d, z * d);
    for (const pl of planes) {
      const t = v.dot(pl.n) - pl.d;
      if (t > 0) { v.addScaledVector(pl.n, -t * 0.85); disp[i] -= t * 0.4; }
    }
    x = v.x; y = v.y; z = v.z;
    if (y < -flat) y = -flat + (y + flat) * 0.25;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const v = 0.85 + 0.3 * noise3(x * 3 + o, y * 3, z * 3) + (disp[i] - 1) * 0.8;
    let r = tint[0] * v, gg = tint[1] * v, b = tint[2] * v;
    const m = smoothstep(0.55, 0.85, n.getY(i) + noise3(x * 2, y * 2, z * 2 + o) * 0.25) * moss;
    r += (0.3 - r) * m; gg += (0.42 - gg) * m; b += (0.17 - b) * m;
    const ao = 0.55 + 0.45 * smoothstep(-flat, 0.4, y);
    col[i * 3] = r * ao; col[i * 3 + 1] = gg * ao; col[i * 3 + 2] = b * ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  return g;
}

// Tall limestone karst pillar with vertical fluting.
export function spireGeometry(seed, H = 30, R = 7, rough = 1, { top = true, ledges = 4 } = {}) {
  const rnd = mulberry32(seed);
  let g = new THREE.CylinderGeometry(R * 0.55, R, H, 28, 22, false);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const o = rnd() * 50;
  const lean = (rnd() - 0.5) * 0.25;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (y + H / 2) / H;
    const a = Math.atan2(z, x);
    const rr = Math.hypot(x, z);
    let k = 1 + 0.28 * rough * noise3(Math.cos(a) * 1.6 + o, t * 2.5, Math.sin(a) * 1.6)
      + 0.1 * rough * noise3(Math.cos(a) * 6 + o, t * 0.6, Math.sin(a) * 6)
      + 0.08 * rough * noise3(Math.cos(a) * 3, y * 0.35 + o, Math.sin(a) * 3)
      + 0.06 * Math.max(0, Math.sin(y * 0.9 + o)) * rough;
    // bulges & ledges
    k *= 1 + 0.15 * Math.sin(t * 9 + o) * (1 - t);
    if (t > 0.97) k *= 0.6; // dome top
    x = Math.cos(a) * rr * k + lean * t * t * H;
    z = Math.sin(a) * rr * k;
    if (t > 0.97) y += R * 0.25 * noise3(x * 0.3, o, z * 0.3);
    p.setXYZ(i, x, y + H / 2, z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const streak = noise3(Math.cos(a) * 8 + o, y * 0.04, Math.sin(a) * 8);
    let v = 0.78 + 0.32 * streak + 0.12 * noise3(x * 0.5, y * 0.5, z * 0.5);
    let r = 0.44 * v, gg = 0.415 * v, b = 0.38 * v;
    const m = smoothstep(0.4, 0.8, n.getY(i) + 0.2 * noise3(x * 0.4, y * 0.4 + o, z * 0.4));
    r += (0.28 - r) * m; gg += (0.44 - gg) * m; b += (0.16 - b) * m;
    const ao = 0.6 + 0.4 * smoothstep(0, H * 0.3, y);
    col[i * 3] = r * ao; col[i * 3 + 1] = gg * ao; col[i * 3 + 2] = b * ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  // greenery on top and ledges
  const cb = newBuf();
  const topR = R * 0.55 * 0.8;
  if (top) leafCards(cb, new THREE.Vector3(lean * H, H + 0.5, 0), new THREE.Vector3(topR * 1.2, 1.6, topR * 1.2), 40, 2.6, rnd, [0.9, 1, 0.85]);
  for (let k = 0; k < ledges; k++) {
    const t = 0.35 + rnd() * 0.5, a = rnd() * Math.PI * 2;
    const rr = R * (1 - t * 0.45) * 1.05;
    leafCards(cb, new THREE.Vector3(Math.cos(a) * rr + lean * t * t * H, t * H, Math.sin(a) * rr), new THREE.Vector3(2.2, 1.1, 2.2), 14, 1.8, rnd, [0.9, 1, 0.85]);
  }
  return { rock: g, green: fromBuf(cb) };
}
