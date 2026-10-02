// Item definitions, crafting recipes, build pieces and item 3D models.
import * as THREE from 'three';
import { setColor, merge, boulderGeometry, noise3 } from '../world/models.js';
import { mulberry32 } from '../util/noise.js';

export const ITEMS = {
  wood: { name: 'Legno', desc: 'Un tronco robusto. La base di ogni costruzione.', stack: 50 },
  stick: { name: 'Bastone', desc: 'Un ramo secco. Utile per gli attrezzi.', stack: 50 },
  stone: { name: 'Pietra', desc: 'Un sasso grande quanto una mano.', stack: 50 },
  fiber: { name: 'Fibra', desc: 'Fibre resistenti. Intrecciale per fare corda.', stack: 50 },
  leaf: { name: 'Foglia di palma', short: 'Foglie', desc: 'Ottima per tetti di paglia e giacigli.', stack: 50 },
  rope: { name: 'Corda', desc: 'Tiene insieme ogni cosa.', stack: 50 },
  coconut: { name: 'Cocco', desc: 'Acqua dolce e polpa. +Acqua +Cibo', stack: 20, food: 8, water: 25 },
  berries: { name: 'Bacche', desc: 'Succose e aspre. +Cibo', stack: 20, food: 12, water: 5 },
  crab_raw: { name: 'Granchio crudo', desc: 'Meglio cotto sul fuoco...', stack: 20, food: 6, health: -6 },
  crab_cooked: { name: 'Granchio alla brace', desc: 'Delizioso! Ripristina cibo e salute.', stack: 20, food: 38, health: 12 },
  axe: { name: 'Ascia di pietra', desc: 'Abbatte alberi. Legno e foglie.', stack: 1, tool: 'axe' },
  pickaxe: { name: 'Piccone di pietra', desc: 'Spacca i massi per la pietra.', stack: 1, tool: 'pickaxe' },
  torch: { name: 'Torcia', desc: 'Illumina la notte.', stack: 1, tool: 'torch' },
  campfire: { name: 'Falò', desc: 'Calore, luce e cucina. Posizionalo a terra.', stack: 5, place: 'campfire' },
  bed: { name: 'Giaciglio di foglie', desc: 'Dormi fino al mattino. Imposta il punto di rinascita.', stack: 2, place: 'bed' },
  spear: { name: 'Lancia', desc: 'Arma semplice. Colpisci con il tasto azione.', stack: 1, tool: 'spear', dmg: 4 },
  fiber_sprout: { name: 'Germoglio di fibra', desc: 'Piantalo in un orto per coltivare fibra.', stack: 30 },
  farm_plot: { name: 'Orto', desc: 'Terreno da coltivare. Posizionalo a terra.', stack: 5, place: 'farm_plot' },
  meat_raw: { name: 'Carne cruda', desc: 'Meglio cotta sul fuoco…', stack: 20, food: 8, health: -5 },
  meat_cooked: { name: 'Carne arrostita', desc: 'Sostanziosa. Ripristina cibo e salute.', stack: 20, food: 45, health: 15 },
  hide: { name: 'Pelle', desc: 'Pelle grezza di cinghiale. Servirà per nuovi oggetti.', stack: 20 },
  egg: { name: 'Uovo', desc: 'Piccolo ma nutriente. +Cibo', stack: 20, food: 10 },
};

// Damage dealt by whatever is in hand (bare hands = 1).
export const WEAPON_DMG = { spear: 4, axe: 3, pickaxe: 3, torch: 1 };

// Cooking at a campfire: raw -> cooked (data-driven so new foods only need a line here).
export const COOKING = { crab_raw: 'crab_cooked', meat_raw: 'meat_cooked' };

// Items that are placed freely on the ground (not grid-snapped): placement distance and footprint radius.
export const FREE_PLACE = { campfire: { d: 1.8, r: 0.7 }, bed: { d: 2.2, r: 0.7 }, farm_plot: { d: 2.6, r: 1.3 } };

export const RECIPES = [
  { out: 'axe', cost: { stick: 2, stone: 2, fiber: 3 }, cat: 'tools' },
  { out: 'pickaxe', cost: { stick: 2, stone: 3, fiber: 3 }, cat: 'tools' },
  { out: 'torch', cost: { stick: 1, fiber: 2 }, cat: 'tools' },
  { out: 'rope', n: 1, cost: { fiber: 3 }, cat: 'materials' },
  { out: 'campfire', cost: { wood: 3, stone: 5, stick: 2 }, cat: 'camp' },
  { out: 'bed', cost: { leaf: 6, wood: 3, rope: 2 }, cat: 'camp' },
  { out: 'spear', cost: { stick: 2, stone: 1, fiber: 2 }, cat: 'tools' },
  { out: 'farm_plot', cost: { stick: 4, stone: 2, fiber: 2 }, cat: 'camp' },
];

export const PIECES = {
  foundation: { name: 'Fondazione in legno', desc: 'Un pavimento rialzato di assi. Ogni casa parte da qui.', cost: { wood: 4, rope: 1 } },
  wall: { name: 'Parete in legno', desc: 'Una parete robusta di tronchi legati.', cost: { wood: 3 } },
  doorway: { name: 'Porta', desc: 'Una parete con un passaggio.', cost: { wood: 3 } },
  window: { name: 'Finestra', desc: 'Lascia entrare la brezza marina.', cost: { wood: 3 } },
  roof: { name: 'Tetto di paglia', desc: 'Foglie di palma su un telaio di legno.', cost: { wood: 2, leaf: 4 } },
};

// ---------------- item models (vertex-coloured merged geometry) ----------------
const col = (g, hex) => { const c = new THREE.Color(hex); return setColor(g, c.r, c.g, c.b); };
function noisy(g, base, amt = 0.15, freq = 6, seed = 0) {
  const c = new THREE.Color(base);
  const p = g.attributes.position;
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = 1 + amt * noise3(p.getX(i) * freq + seed, p.getY(i) * freq, p.getZ(i) * freq);
    a[i * 3] = c.r * v; a[i * 3 + 1] = c.g * v; a[i * 3 + 2] = c.b * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function logGeo(len = 0.7, r = 0.13) {
  const side = new THREE.CylinderGeometry(r, r * 1.05, len, 12, 3, true);
  const p = side.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.06 * noise3(p.getX(i) * 20, p.getY(i) * 6, p.getZ(i) * 20);
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  side.computeVertexNormals();
  noisy(side, 0x6b4a2e, 0.35, 9);
  const caps = [];
  for (const s of [-1, 1]) {
    const c = new THREE.CircleGeometry(r * 1.02, 14);
    c.rotateX(s * -Math.PI / 2); c.translate(0, s * len / 2, 0);
    const cp = c.attributes.position, ca = new Float32Array(cp.count * 3);
    for (let i = 0; i < cp.count; i++) {
      const d = Math.hypot(cp.getX(i), cp.getZ(i)) / r;
      const v = d > 0.85 ? 0.45 : 1;
      ca[i * 3] = 0.8 * v; ca[i * 3 + 1] = 0.6 * v; ca[i * 3 + 2] = 0.36 * v;
    }
    c.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    caps.push(c);
  }
  const g = merge([side, ...caps]);
  g.rotateZ(Math.PI / 2);
  return g;
}

function stickGeo() {
  const a = new THREE.CylinderGeometry(0.018, 0.028, 0.75, 6, 4);
  const p = a.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sin(p.getY(i) * 5) * 0.02);
  a.computeVertexNormals();
  noisy(a, 0x7a5a3a, 0.3, 12);
  const b = new THREE.CylinderGeometry(0.01, 0.016, 0.22, 5);
  b.translate(0, 0.11, 0); b.rotateZ(-0.7); b.translate(0.02, 0.1, 0);
  noisy(b, 0x6f5234, 0.3, 12);
  const g = merge([a, b]);
  g.rotateZ(Math.PI / 2);
  return g;
}

function stoneGeo(seed = 3) {
  const g = boulderGeometry(seed, { detail: 12, rough: 0.3, flat: 0.4, moss: 0, tint: [0.6, 0.58, 0.55] });
  g.scale(0.16, 0.13, 0.14);
  return g;
}

function fiberGeo() {
  const parts = [];
  const r = mulberry32(8);
  for (let i = 0; i < 14; i++) {
    const b = new THREE.BoxGeometry(0.012, 0.6, 0.006);
    b.rotateZ((r() - 0.5) * 0.25); b.rotateY(r() * 3);
    b.translate((r() - 0.5) * 0.06, 0, (r() - 0.5) * 0.06);
    col(b, r() < 0.5 ? 0xa8a45a : 0x8c9a48);
    parts.push(b);
  }
  const band = new THREE.TorusGeometry(0.045, 0.012, 6, 12);
  band.rotateX(Math.PI / 2); col(band, 0x6a5030);
  parts.push(band);
  const g = merge(parts);
  g.rotateZ(Math.PI / 2.3);
  return g;
}

function leafGeo() {
  // elongated palm frond piece
  const pos = [], idx = [], c = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = t * 0.8 - 0.4;
    const w = Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05)) * 0.16;
    const bend = t * t * 0.12;
    pos.push(-w, y, bend + w * 0.4, 0, y, bend, w, y, bend + w * 0.4);
    c.push(0.22, 0.52, 0.14, 0.55, 0.6, 0.25, 0.26, 0.56, 0.16);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 3;
    idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const back = g.clone(); back.index.array.reverse(); back.computeVertexNormals();
  const m = merge([g, back]);
  m.rotateZ(-0.6);
  return m;
}

function ropeGeo() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const t = new THREE.TorusGeometry(0.13 - i * 0.012, 0.022, 6, 22);
    t.rotateX(Math.PI / 2); t.translate(0, i * 0.035, 0);
    noisy(t, 0xb8955a, 0.25, 30, i);
    parts.push(t);
  }
  return merge(parts);
}

function coconutGeo() {
  const s = new THREE.SphereGeometry(0.13, 16, 12);
  s.scale(1, 1.12, 1);
  noisy(s, 0x5a3a1e, 0.35, 25);
  return s;
}

function berriesGeo() {
  const parts = [];
  const r = mulberry32(4);
  for (let i = 0; i < 9; i++) {
    const s = new THREE.SphereGeometry(0.035 + r() * 0.01, 8, 6);
    s.translate((r() - 0.5) * 0.14, (r() - 0.5) * 0.08 + 0.02, (r() - 0.5) * 0.14);
    col(s, r() < 0.7 ? 0xc0182a : 0x2a3a8a);
    parts.push(s);
  }
  for (let i = 0; i < 2; i++) {
    const l = new THREE.SphereGeometry(0.07, 8, 4);
    l.scale(1, 0.15, 0.5); l.rotateY(i * 2 + 0.5); l.translate(0, -0.03, 0);
    col(l, 0x3a7a2a);
    parts.push(l);
  }
  return merge(parts);
}

function crabGeo(cooked) {
  const parts = [];
  const shell = cooked ? 0xd8521e : 0x9a3a2a;
  const body = new THREE.SphereGeometry(0.12, 14, 10);
  body.scale(1.2, 0.45, 0.9);
  noisy(body, shell, 0.2, 18);
  parts.push(body);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.CylinderGeometry(0.012, 0.01, 0.14, 5);
      leg.rotateZ(s * 1.1); leg.rotateY((i - 1) * 0.5);
      leg.translate(s * 0.14, -0.02, (i - 1) * 0.06);
      col(leg, shell); parts.push(leg);
    }
    const claw = new THREE.SphereGeometry(0.045, 8, 6);
    claw.scale(1.4, 0.8, 0.9); claw.translate(s * 0.1, 0.01, 0.13);
    col(claw, shell); parts.push(claw);
  }
  if (cooked) {
    const skewer = new THREE.CylinderGeometry(0.008, 0.008, 0.5, 5);
    skewer.rotateX(Math.PI / 2);
    col(skewer, 0x8a6a40); parts.push(skewer);
  }
  return merge(parts);
}

function axeGeo() {
  const handle = new THREE.CylinderGeometry(0.022, 0.028, 0.62, 8);
  handle.translate(0, 0.02, 0);
  noisy(handle, 0x8a5e36, 0.3, 14);
  const head = boulderGeometry(12, { detail: 10, rough: 0.12, flat: 2, moss: 0, tint: [0.55, 0.55, 0.56] });
  head.scale(0.13, 0.085, 0.03);
  head.translate(0.08, 0.26, 0);
  const wraps = [];
  for (let i = 0; i < 3; i++) {
    const t = new THREE.TorusGeometry(0.031, 0.009, 5, 12);
    t.rotateX(Math.PI / 2); t.translate(0, 0.22 + i * 0.03, 0);
    col(t, 0xc8a870); wraps.push(t);
  }
  const grip = new THREE.CylinderGeometry(0.031, 0.031, 0.16, 8);
  grip.translate(0, -0.18, 0); col(grip, 0x4a3020);
  return merge([handle, head, ...wraps, grip]);
}

function pickaxeGeo() {
  const handle = new THREE.CylinderGeometry(0.022, 0.028, 0.66, 8);
  noisy(handle, 0x8a5e36, 0.3, 14);
  const head = new THREE.CylinderGeometry(0.005, 0.04, 0.42, 8, 6);
  const p = head.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + y * y * -0.9);
  }
  head.computeVertexNormals();
  head.rotateZ(Math.PI / 2); head.translate(0, 0.28, 0);
  noisy(head, 0x7c7b78, 0.2, 20);
  const head2 = head.clone(); head2.rotateY(Math.PI); // other half symmetrical
  const wraps = [];
  for (let i = 0; i < 2; i++) {
    const t = new THREE.TorusGeometry(0.032, 0.01, 5, 12);
    t.rotateX(Math.PI / 2); t.translate(0, 0.24 + i * 0.07, 0);
    col(t, 0xc8a870); wraps.push(t);
  }
  const grip = new THREE.CylinderGeometry(0.031, 0.031, 0.16, 8);
  grip.translate(0, -0.2, 0); col(grip, 0x4a3020);
  return merge([handle, head, ...wraps, grip]);
}

function torchGeo() {
  const handle = new THREE.CylinderGeometry(0.022, 0.028, 0.55, 8);
  noisy(handle, 0x7a5232, 0.3, 14);
  const wrap = new THREE.CylinderGeometry(0.05, 0.035, 0.14, 10);
  wrap.translate(0, 0.3, 0); noisy(wrap, 0x6a5238, 0.3, 30);
  const tip = new THREE.SphereGeometry(0.045, 8, 6);
  tip.translate(0, 0.38, 0); col(tip, 0x2a1a10);
  return merge([handle, wrap, tip]);
}

export function campfireGeo(scale = 1) {
  const parts = [];
  const r = mulberry32(5);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = boulderGeometry(40 + i, { detail: 10, rough: 0.3, flat: 0.3, moss: 0, tint: [0.5, 0.48, 0.45] });
    s.scale(0.16, 0.12, 0.14); s.rotateY(r() * 3);
    s.translate(Math.cos(a) * 0.42, 0.04, Math.sin(a) * 0.42);
    parts.push(s);
  }
  for (let i = 0; i < 4; i++) {
    const l = logGeo(0.6, 0.05);
    l.rotateZ(0.5); l.translate(0.1, 0.12, 0); l.rotateY((i / 4) * Math.PI * 2);
    parts.push(l);
  }
  const ash = new THREE.CircleGeometry(0.34, 14);
  ash.rotateX(-Math.PI / 2); ash.translate(0, 0.01, 0); col(ash, 0x2a2420);
  parts.push(ash);
  const g = merge(parts);
  g.scale(scale, scale, scale);
  return g;
}

export function bedGeo() {
  const parts = [];
  for (const s of [-1, 1]) {
    const l = logGeo(2.0, 0.08);
    l.rotateY(Math.PI / 2); l.translate(s * 0.5, 0.08, 0);
    parts.push(l);
  }
  for (const s of [-1, 1]) {
    const l = logGeo(1.1, 0.07);
    l.translate(0, 0.08, s * 0.95);
    parts.push(l);
  }
  const r = mulberry32(7);
  for (let i = 0; i < 12; i++) {
    const lf = leafGeo();
    lf.rotateZ(0.6 + Math.PI / 2);
    lf.rotateX(-Math.PI / 2);
    lf.scale(1.25, 1.2, 1.2);
    lf.translate((r() - 0.5) * 0.5, 0.16 + i * 0.004, -0.8 + i * 0.14);
    parts.push(lf);
  }
  const pillow = new THREE.SphereGeometry(0.2, 10, 8);
  pillow.scale(1.6, 0.45, 0.8); pillow.translate(0, 0.22, -0.7);
  col(pillow, 0xcdbb90);
  parts.push(pillow);
  return merge(parts);
}

function spearGeo() {
  const shaft = new THREE.CylinderGeometry(0.018, 0.022, 1.5, 6);
  noisy(shaft, 0x7a5a3a, 0.25, 10);
  const tip = new THREE.ConeGeometry(0.045, 0.2, 5);
  tip.translate(0, 0.85, 0); noisy(tip, 0x8a8680, 0.3, 14);
  const wrap = new THREE.CylinderGeometry(0.03, 0.03, 0.09, 6);
  wrap.translate(0, 0.72, 0); col(wrap, 0xa89a62);
  const g = merge([shaft, tip, wrap]);
  g.translate(0, 0.35, 0);
  return g;
}

function sproutGeo() {
  const parts = [];
  const r = mulberry32(31);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.PlaneGeometry(0.035, 0.22, 1, 2);
    b.translate(0, 0.11, 0); b.rotateZ((r() - 0.5) * 0.7); b.rotateY(i);
    col(b, r() < 0.5 ? 0x7f9a46 : 0x9aa95a);
    parts.push(b);
  }
  const soil = new THREE.SphereGeometry(0.07, 8, 5); soil.scale(1, 0.5, 1); col(soil, 0x5a4330);
  parts.push(soil);
  return merge(parts);
}

function meatGeo(cooked) {
  const g = new THREE.SphereGeometry(0.13, 10, 8);
  g.scale(1.3, 0.6, 0.9);
  noisy(g, cooked ? 0x7a4222 : 0xb03a36, 0.25, 9);
  const bone = new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6);
  bone.rotateZ(Math.PI / 2); bone.translate(0.2, 0, 0); col(bone, 0xe8dcc0);
  return merge([g, bone]);
}

function hideGeo() {
  const g = new THREE.CircleGeometry(0.2, 9);
  g.rotateX(-Math.PI / 2); g.scale(1.3, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, Math.sin(p.getX(i) * 9) * 0.02);
  g.computeVertexNormals();
  noisy(g, 0x6e4a30, 0.3, 8);
  return g;
}

function eggGeo() {
  const g = new THREE.SphereGeometry(0.06, 10, 8);
  g.scale(1, 1.3, 1); col(g, 0xeadfc8);
  return g;
}

// Farm plot: tilled soil bed framed by logs (crop is added on top by the farming system)
export function farmPlotGeo(scale = 1) {
  const parts = [];
  const soil = new THREE.BoxGeometry(1.9, 0.16, 1.9, 6, 1, 6);
  const p = soil.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 9) * 0.025);
  soil.computeVertexNormals();
  soil.translate(0, 0.08, 0); noisy(soil, 0x4a3524, 0.3, 5);
  parts.push(soil);
  for (let k = 0; k < 4; k++) {
    const l = logGeo(2.1, 0.07);
    l.rotateY(k * Math.PI / 2); l.translate(Math.sin(k * Math.PI / 2) * 1.0, 0.08, Math.cos(k * Math.PI / 2) * 1.0);
    parts.push(l);
  }
  const g = merge(parts);
  g.scale(scale, scale, scale);
  return g;
}

const builders = {
  wood: () => logGeo(), stick: stickGeo, stone: () => stoneGeo(), fiber: fiberGeo, leaf: leafGeo,
  rope: ropeGeo, coconut: coconutGeo, berries: berriesGeo, crab_raw: () => crabGeo(false), crab_cooked: () => crabGeo(true),
  axe: axeGeo, pickaxe: pickaxeGeo, torch: torchGeo, campfire: () => campfireGeo(0.5), bed: () => bedGeo(),
  spear: spearGeo, fiber_sprout: sproutGeo, farm_plot: () => farmPlotGeo(0.35), meat_raw: () => meatGeo(false), meat_cooked: () => meatGeo(true),
  hide: hideGeo, egg: eggGeo,
};

const geoCache = {};
export function itemGeometry(id) {
  if (!geoCache[id]) geoCache[id] = builders[id]();
  return geoCache[id];
}

export const itemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide });
export function itemMesh(id) {
  const m = new THREE.Mesh(itemGeometry(id), itemMaterial);
  m.castShadow = true;
  return m;
}
