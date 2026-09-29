// Grid-snapped building (foundations, walls, doorways, windows, roofs) + free placeables (campfire, bed).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { materials } from '../world/materials.js';
import { PIECES, campfireGeo, bedGeo, itemMaterial } from './items.js';
import { mulberry32 } from '../util/noise.js';

export const G = 3;          // grid cell size
export const WALL_H = 2.6;
const FOUND_T = 0.18;

// ---------- piece models ----------
function log(parts, mat, r, len, pos, rot) {
  const g = new THREE.CylinderGeometry(r * 0.95, r, len, 9, 1);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(pos);
  if (rot) m.rotation.set(rot.x, rot.y, rot.z);
  parts.push(m);
  return m;
}
function band(parts, mat, r, pos, axis = 'y') {
  const g = new THREE.TorusGeometry(r, 0.022, 5, 12);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(pos);
  if (axis === 'y') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.y = Math.PI / 2;
  parts.push(m);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function bake(meshes) {
  // merge meshes per material into single geometries
  const byMat = new Map();
  for (const m of meshes) {
    m.updateMatrix();
    const g = m.geometry.clone().applyMatrix4(m.matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const gi = g.index ? g.toNonIndexed() : g;
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(gi);
  }
  return [...byMat.entries()].map(([mat, gs]) => ({ mat, geo: mergeGeometries(gs) }));
}

function wallModel(kind) {
  const M = materials();
  const parts = [];
  const r = mulberry32(kind === 'wall' ? 1 : kind === 'doorway' ? 2 : 3);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = -G / 2 + (i + 0.5) * (G / n);
    const rad = 0.15 + r() * 0.025;
    const h = WALL_H + (r() - 0.5) * 0.14;
    if (kind === 'doorway' && Math.abs(x) < 0.62) {
      log(parts, M.wood, rad, 0.5, V(x, 2.15 + 0.25, 0));
      continue;
    }
    if (kind === 'window' && Math.abs(x) < 0.6) {
      log(parts, M.wood, rad, 1.0, V(x, 0.5, 0));
      log(parts, M.wood, rad, h - 1.85, V(x, 1.85 + (h - 1.85) / 2, 0));
      continue;
    }
    log(parts, M.wood, rad, h, V(x, h / 2, 0));
  }
  // horizontal beams front and back
  for (const z of [0.17, -0.17]) {
    if (kind === 'doorway') {
      for (const s of [-1, 1]) log(parts, M.woodDark, 0.075, 0.95, V(s * 1.02, 0.55, z), V(0, 0, Math.PI / 2));
      log(parts, M.woodDark, 0.085, G, V(0, 2.12, z), V(0, 0, Math.PI / 2));
    } else {
      log(parts, M.woodDark, 0.075, G, V(0, 0.55, z), V(0, 0, Math.PI / 2));
      log(parts, M.woodDark, 0.075, G, V(0, 2.12, z), V(0, 0, Math.PI / 2));
    }
    if (kind === 'window') {
      log(parts, M.woodDark, 0.07, 1.3, V(0, 1.0, z), V(0, 0, Math.PI / 2));
      log(parts, M.woodDark, 0.07, 1.3, V(0, 1.85, z), V(0, 0, Math.PI / 2));
    }
  }
  for (const x of [-1.2, 1.2]) for (const y of [0.55, 2.12]) band(parts, M.rope, 0.2, V(x, y, 0), 'y');
  // thick corner posts
  for (const s of [-1, 1]) log(parts, M.woodDark, 0.19, WALL_H + 0.2, V(s * G / 2, (WALL_H + 0.2) / 2, 0));
  return bake(parts);
}

function foundationModel(postLen = 5) {
  const M = materials();
  const parts = [];
  const deck = new THREE.Mesh(new THREE.BoxGeometry(G, FOUND_T, G), M.planks);
  deck.position.y = -FOUND_T / 2;
  parts.push(deck);
  for (const s of [-1, 1]) {
    log(parts, M.woodDark, 0.13, G + 0.3, V(s * (G / 2 - 0.05), -FOUND_T - 0.1, 0), V(Math.PI / 2, 0, 0));
    log(parts, M.woodDark, 0.12, G, V(0, -FOUND_T - 0.1, s * (G / 2 - 0.05)), V(0, 0, Math.PI / 2));
  }
  log(parts, M.woodDark, 0.1, G, V(0, -FOUND_T - 0.1, 0), V(0, 0, Math.PI / 2));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    log(parts, M.wood, 0.17, postLen, V(sx * (G / 2 - 0.1), -postLen / 2, sz * (G / 2 - 0.1)));
    band(parts, M.rope, 0.19, V(sx * (G / 2 - 0.1), -0.3, sz * (G / 2 - 0.1)));
  }
  return bake(parts);
}

function roofModel() {
  const M = materials();
  const parts = [];
  const over = 0.45, rise = 1.45;
  const half = G / 2 + over;
  const slopeLen = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  for (const s of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(G + 0.5, 0.16, slopeLen), M.thatch);
    slab.position.set(0, rise / 2 + 0.05, s * half / 2);
    slab.rotation.x = s * ang;
    parts.push(slab);
    // rafters
    for (let i = 0; i < 4; i++) {
      const x = -G / 2 + i * (G / 3);
      log(parts, M.woodDark, 0.06, slopeLen, V(x, rise / 2 - 0.08, s * half / 2), V(Math.PI / 2 + s * ang - Math.PI, 0, 0));
    }
  }
  log(parts, M.woodDark, 0.1, G + 0.6, V(0, rise + 0.1, 0), V(0, 0, Math.PI / 2));
  // gable triangles (thin log fill)
  for (const x of [-G / 2, G / 2]) {
    for (let k = -3; k <= 3; k++) {
      const z = k * 0.21;
      const h = rise * (1 - Math.abs(z) / half);
      log(parts, M.wood, 0.1, h, V(x, h / 2, z));
    }
  }
  return bake(parts);
}

const modelCache = {};
export function pieceModel(type) {
  if (modelCache[type]) return modelCache[type];
  let m;
  if (type === 'foundation') m = foundationModel();
  else if (type === 'foundation_icon') m = foundationModel(0.7);
  else if (type === 'roof') m = roofModel();
  else if (type === 'campfire') m = [{ geo: campfireGeo(1), mat: itemMaterial }];
  else if (type === 'bed') m = [{ geo: bedGeo(), mat: itemMaterial }];
  else m = wallModel(type);
  return (modelCache[type] = m);
}

export function pieceObject(type, ghostMat) {
  const g = new THREE.Group();
  for (const { geo, mat } of pieceModel(type)) {
    const mesh = new THREE.Mesh(geo, ghostMat || mat);
    mesh.castShadow = !ghostMat; mesh.receiveShadow = !ghostMat;
    g.add(mesh);
  }
  return g;
}

// ---------- building system ----------
export class Building {
  constructor(scene, world, fx) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.cells = new Map();   // "i,j" -> { level, foundation, roof, obj, roofObj }
    this.edges = new Map();   // "i,j,d" -> { type, obj }
    this.placeables = [];     // { type, x, z, y, rot, obj, fire }
    this.active = false;
    this.piece = 'foundation';
    this.rot = 0;
    this.ghostOk = new THREE.MeshBasicMaterial({ color: 0x3aff7a, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.38, depthWrite: false });
    this.ghostLine = new THREE.LineBasicMaterial({ color: 0xb8ffc8, transparent: true, opacity: 0.8, depthWrite: false });
    this.ghost = null;
    this.target = null;
  }

  key(i, j) { return i + ',' + j; }

  enter(piece) {
    this.active = true;
    this.setPiece(piece || this.piece);
  }
  exit() {
    this.active = false;
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    this.target = null;
  }
  setPiece(p) {
    this.piece = p;
    if (this.ghost) this.scene.remove(this.ghost);
    this.ghost = pieceObject(p, this.ghostOk);
    this.ghost.traverse((o) => { if (o.isMesh) o.renderOrder = 5; });
    // glowing outline like a holographic blueprint
    this.edgeCache ||= {};
    if (!this.edgeCache[p]) this.edgeCache[p] = this.ghost.children.filter((m) => m.isMesh).map((m) => new THREE.EdgesGeometry(m.geometry, 35));
    for (const eg of this.edgeCache[p]) {
      const l = new THREE.LineSegments(eg, this.ghostLine);
      l.renderOrder = 6;
      this.ghost.add(l);
    }
    this.scene.add(this.ghost);
    this.ghostValid = true;
  }
  rotate() { this.rot = (this.rot + 1) % 4; }

  levelFor(i, j) {
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = this.cells.get(this.key(i + di, j + dj));
      if (c && c.foundation) return c.level;
    }
    return null;
  }

  // Computes target placement for the current piece, from the player and camera direction.
  computeTarget(player, camYaw) {
    const T = this.world.terrain;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const p = this.piece;
    if (p === 'campfire' || p === 'bed') {
      const d = p === 'bed' ? 2.2 : 1.8;
      const x = player.pos.x + fx * d, z = player.pos.z + fz * d;
      const y = this.world.groundHeight(x, z, player.pos.y + 0.5);
      const rot = Math.atan2(fx, fz) + (this.rot * Math.PI) / 2;
      let ok = y > 0.3 && T.slopeAt(x, z) < 0.45 && !T.isInPond(x, z, 0.5);
      for (const c of this.world.nature.colliders.query(x, z, 6)) if (c.active !== false && Math.hypot(c.x - x, c.z - z) < c.r + 0.7) ok = false;
      for (const pl of this.placeables) if (Math.hypot(pl.x - x, pl.z - z) < 1.4) ok = false;
      return { kind: 'free', x, y, z, rot, ok };
    }
    const ax = player.pos.x + fx * (p === 'foundation' ? 3.2 : 2.2);
    const az = player.pos.z + fz * (p === 'foundation' ? 3.2 : 2.2);
    let i = Math.floor(ax / G), j = Math.floor(az / G);
    if (p === 'foundation') {
      const k = this.key(i, j);
      const cx = (i + 0.5) * G, cz = (j + 0.5) * G;
      const hs = [T.heightAt(i * G, j * G), T.heightAt((i + 1) * G, j * G), T.heightAt(i * G, (j + 1) * G), T.heightAt((i + 1) * G, (j + 1) * G), T.heightAt(cx, cz)];
      const maxH = Math.max(...hs), minH = Math.min(...hs);
      let level = this.levelFor(i, j);
      if (level === null) level = maxH + 0.35;
      let ok = !(this.cells.get(k)?.foundation) && minH > 0.2 && level - minH < 3.8 && maxH < level + 0.05 && !T.isInPond(cx, cz, 3);
      if (ok) for (const c of this.world.nature.colliders.query(cx, cz, 6)) {
        if (c.active === false) continue;
        if (Math.abs(c.x - cx) < G / 2 + c.r - 0.1 && Math.abs(c.z - cz) < G / 2 + c.r - 0.1) { ok = false; break; }
      }
      if (ok) for (const pl of this.placeables) if (Math.abs(pl.x - cx) < G / 2 + 0.4 && Math.abs(pl.z - cz) < G / 2 + 0.4 && !this.cells.get(k)) { ok = false; break; }
      return { kind: 'foundation', i, j, x: cx, y: level, z: cz, rot: 0, ok, level };
    }
    if (p === 'roof') {
      // prefer the cell the player stands in if it has a foundation
      const pi = Math.floor(player.pos.x / G), pj = Math.floor(player.pos.z / G);
      if (this.cells.get(this.key(pi, pj))?.foundation && !this.cells.get(this.key(pi, pj)).roof) { i = pi; j = pj; }
      const c = this.cells.get(this.key(i, j));
      const ok = !!(c && c.foundation && !c.roof);
      const level = c ? c.level : this.world.groundHeight((i + 0.5) * G, (j + 0.5) * G);
      return { kind: 'roof', i, j, x: (i + 0.5) * G, y: level + WALL_H, z: (j + 0.5) * G, rot: this.rot % 2, ok, level };
    }
    // walls: nearest edge of aim cell
    const cands = [
      { i, j, d: 'x', mx: (i + 0.5) * G, mz: j * G },
      { i, j: j + 1, d: 'x', mx: (i + 0.5) * G, mz: (j + 1) * G },
      { i, j, d: 'z', mx: i * G, mz: (j + 0.5) * G },
      { i: i + 1, j, d: 'z', mx: (i + 1) * G, mz: (j + 0.5) * G },
    ];
    let best = null, bd = 1e9;
    for (const c of cands) {
      const d = Math.hypot(c.mx - ax, c.mz - az);
      if (d < bd) { bd = d; best = c; }
    }
    const adj = best.d === 'x' ? [[best.i, best.j - 1], [best.i, best.j]] : [[best.i - 1, best.j], [best.i, best.j]];
    let level = null;
    for (const [a, b] of adj) { const c = this.cells.get(this.key(a, b)); if (c && c.foundation) { level = c.level; break; } }
    const ok = level !== null && !this.edges.has(best.i + ',' + best.j + ',' + best.d);
    const y = level !== null ? level : this.world.groundHeight(best.mx, best.mz);
    return { kind: 'wall', i: best.i, j: best.j, d: best.d, x: best.mx, y, z: best.mz, rot: best.d === 'x' ? 0 : Math.PI / 2, ok, level };
  }

  update(dt, player, camYaw, canAfford) {
    if (!this.active || !this.ghost) return;
    const t = this.computeTarget(player, camYaw);
    this.target = t;
    const valid = t.ok && canAfford;
    this.ghost.position.set(t.x, t.y, t.z);
    this.ghost.rotation.y = t.kind === 'roof' ? (t.rot ? Math.PI / 2 : 0) : t.rot;
    if (valid !== this.ghostValid) {
      this.ghostValid = valid;
      this.ghost.traverse((o) => { if (o.isMesh) o.material = valid ? this.ghostOk : this.ghostBad; });
      this.ghostLine.color.set(valid ? 0xb8ffc8 : 0xffb0a0);
    }
    const pulse = 0.3 + 0.1 * Math.sin(performance.now() / 180);
    this.ghostOk.opacity = pulse; this.ghostBad.opacity = pulse;
  }

  // Places a piece described by a target (from computeTarget or a save file)
  // Returns null when that spot is already occupied (e.g. the same piece arriving twice over the network).
  exists(type, t) {
    if (type === 'foundation') return !!this.cells.get(this.key(t.i, t.j))?.foundation;
    if (type === 'roof') return !!this.cells.get(this.key(t.i, t.j))?.roof;
    if (type === 'campfire' || type === 'bed') return this.placeables.some((p) => Math.hypot(p.x - t.x, p.z - t.z) < 0.5);
    return this.edges.has(t.i + ',' + t.j + ',' + t.d);
  }

  // Adds everything from a saved/remote building layout that isn't built here yet.
  merge(data) {
    if (!data) return;
    for (const c of data.cells || []) if (!this.exists('foundation', c)) this.placePiece('foundation', { i: c.i, j: c.j, level: c.level }, false);
    for (const c of data.cells || []) if (c.roof && !this.exists('roof', c)) this.placePiece('roof', { i: c.i, j: c.j, rot: c.roofRot }, false);
    for (const e of data.edges || []) if (!this.exists(e.type, e)) this.placePiece(e.type, e, false);
    for (const p of data.placeables || []) if (!this.exists(p.type, p)) this.placePiece(p.type, p, false);
  }

  placePiece(type, t, animate = true) {
    if (this.exists(type, t)) return null;
    let obj;
    if (type === 'foundation') {
      const k = this.key(t.i, t.j);
      const cell = this.cells.get(k) || {};
      cell.foundation = true; cell.level = t.level ?? t.y;
      obj = pieceObject('foundation');
      obj.position.set((t.i + 0.5) * G, cell.level, (t.j + 0.5) * G);
      cell.obj = obj;
      this.cells.set(k, cell);
      this.world.platforms.push({ minX: t.i * G - 0.05, maxX: (t.i + 1) * G + 0.05, minZ: t.j * G - 0.05, maxZ: (t.j + 1) * G + 0.05, top: cell.level });
    } else if (type === 'roof') {
      const cell = this.cells.get(this.key(t.i, t.j));
      if (!cell) return null;
      cell.roof = true; cell.roofRot = t.rot;
      obj = pieceObject('roof');
      obj.position.set((t.i + 0.5) * G, cell.level + WALL_H, (t.j + 0.5) * G);
      obj.rotation.y = t.rot ? Math.PI / 2 : 0;
      cell.roofObj = obj;
    } else if (type === 'campfire' || type === 'bed') {
      obj = pieceObject(type);
      obj.position.set(t.x, t.y, t.z);
      obj.rotation.y = t.rot;
      const pl = { type, x: t.x, y: t.y, z: t.z, rot: t.rot, obj };
      if (type === 'campfire') {
        pl.fire = this.fx.addFire(new THREE.Vector3(t.x, t.y + 0.1, t.z), 1);
        pl.collider = { x: t.x, z: t.z, r: 0.55, h: t.y + 0.5 };
        this.world.circles.push(pl.collider);
      }
      this.placeables.push(pl);
    } else {
      const ek = t.i + ',' + t.j + ',' + t.d;
      obj = pieceObject(type);
      const lvl = t.level ?? t.y;
      const mx = t.d === 'x' ? (t.i + 0.5) * G : t.i * G;
      const mz = t.d === 'x' ? t.j * G : (t.j + 0.5) * G;
      obj.position.set(mx, lvl, mz);
      obj.rotation.y = t.d === 'x' ? 0 : Math.PI / 2;
      this.edges.set(ek, { type, obj, i: t.i, j: t.j, d: t.d, level: lvl });
      // colliders
      const ax = t.d === 'x' ? t.i * G : t.i * G, az = t.d === 'x' ? t.j * G : t.j * G;
      const bx = t.d === 'x' ? (t.i + 1) * G : t.i * G, bz = t.d === 'x' ? t.j * G : (t.j + 1) * G;
      const W = { bottom: lvl, top: lvl + WALL_H, t: 0.2 };
      if (type === 'doorway') {
        const ux = (bx - ax) / G, uz = (bz - az) / G;
        const g1 = G / 2 - 0.62;
        this.world.walls.push({ ...W, ax, az, bx: ax + ux * g1, bz: az + uz * g1 });
        this.world.walls.push({ ...W, ax: bx - ux * g1, az: bz - uz * g1, bx, bz });
      } else {
        this.world.walls.push({ ...W, ax, az, bx, bz });
      }
    }
    this.scene.add(obj);
    if (animate) {
      obj.userData.spawnT = 0;
      obj.scale.setScalar(0.01);
      this.animating ||= [];
      this.animating.push(obj);
      this.fx.burst('dust', obj.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 16);
    }
    return obj;
  }

  animate(dt) {
    if (!this.animating) return;
    for (let i = this.animating.length - 1; i >= 0; i--) {
      const o = this.animating[i];
      o.userData.spawnT += dt;
      const k = Math.min(1, o.userData.spawnT / 0.35);
      const s = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 5) * 0.9 : 1;
      o.scale.set(1, Math.max(0.01, s), 1);
      if (k >= 1) { o.scale.set(1, 1, 1); this.animating.splice(i, 1); }
    }
  }

  // shelter: a cell with foundation + roof + all 4 walls (at least one doorway)
  shelterCells() {
    const out = [];
    for (const [k, c] of this.cells) {
      if (!c.foundation || !c.roof) continue;
      const [i, j] = k.split(',').map(Number);
      const es = [this.edges.get(`${i},${j},x`), this.edges.get(`${i},${j + 1},x`), this.edges.get(`${i},${j},z`), this.edges.get(`${i + 1},${j},z`)];
      if (es.every(Boolean)) out.push({ i, j, door: es.some((e) => e.type === 'doorway') });
    }
    return out;
  }

  isSheltered(x, z) {
    const c = this.cells.get(this.key(Math.floor(x / G), Math.floor(z / G)));
    return !!(c && c.roof);
  }

  counts() {
    let foundation = 0, walls = 0, doorway = 0, roof = 0;
    for (const c of this.cells.values()) { if (c.foundation) foundation++; if (c.roof) roof++; }
    for (const e of this.edges.values()) { walls++; if (e.type === 'doorway') doorway++; }
    return { foundation, walls, doorway, roof, campfire: this.placeables.filter((p) => p.type === 'campfire').length, bed: this.placeables.filter((p) => p.type === 'bed').length };
  }

  toJSON() {
    const cells = [];
    for (const [k, c] of this.cells) { const [i, j] = k.split(',').map(Number); cells.push({ i, j, level: c.level, roof: !!c.roof, roofRot: c.roofRot || 0 }); }
    const edges = [...this.edges.values()].map((e) => ({ i: e.i, j: e.j, d: e.d, type: e.type, level: e.level }));
    const placeables = this.placeables.map((p) => ({ type: p.type, x: p.x, y: p.y, z: p.z, rot: p.rot }));
    return { cells, edges, placeables };
  }

  load(data) {
    if (!data) return;
    for (const c of data.cells || []) this.placePiece('foundation', { i: c.i, j: c.j, level: c.level }, false);
    for (const c of data.cells || []) if (c.roof) this.placePiece('roof', { i: c.i, j: c.j, rot: c.roofRot }, false);
    for (const e of data.edges || []) this.placePiece(e.type, e, false);
    for (const p of data.placeables || []) this.placePiece(p.type, p, false);
  }
}

export { PIECES };
