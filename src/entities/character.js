// Procedural stylized-realistic castaways (see reference sheets): sculpted lathe body, painted face,
// clumped hair, worn outfits. Built as a joint hierarchy with procedural animation.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, lerp, clamp } from '../util/noise.js';

// Worn fabric: white base (tinted by vertex colour) with dirt stains, sweat marks and a fine weave.
function fabricTexture(seed) {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  const r = mulberry32(seed);
  for (let i = 0; i < 60; i++) { // large soft stains
    const x = r() * S, y = r() * S, rad = 8 + r() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(90,62,38,${0.12 + r() * 0.14})`); gr.addColorStop(1, 'rgba(90,62,38,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 2600; i++) { // grit
    g.fillStyle = `rgba(60,40,25,${0.04 + r() * 0.12})`;
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.06)';
  for (let y = 0; y < S; y += 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let x = 0; x < S; x += 3) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Painted face on the head sphere's UVs (front of the sphere is u = 0.25).
function faceTexture(F) {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const skin = F ? [205, 148, 112] : [196, 136, 98];
  const rgb = (a, k = 1, al = 1) => `rgba(${a[0] * k | 0},${a[1] * k | 0},${a[2] * k | 0},${al})`;
  g.fillStyle = rgb(skin); g.fillRect(0, 0, W, H);
  // (ax: degrees from the front, positive to the character's left on screen; th: degrees from the top)
  const P = (ax, th) => [(0.25 + ax / 360) * W, (th / 180) * H];
  const blob = (ax, th, rx, ry, col, soft = 1) => {
    const [x, y] = P(ax, th);
    g.save(); g.translate(x, y); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, col); gr.addColorStop(soft, col.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore();
  };
  // soft modelling: warm cheeks, eye-socket shade, jaw shadow, nose bridge highlight
  for (const s of [-1, 1]) {
    blob(s * 30, 100, 26, 20, rgb([220, 120, 100], 1, 0.22));
    blob(s * 17, 82, 20, 11, rgb(skin, 0.72, 0.55));
  }
  blob(0, 92, 7, 26, rgb(skin, 1.12, 0.45));
  const jg = g.createLinearGradient(0, P(0, 118)[1], 0, P(0, 150)[1]);
  jg.addColorStop(0, rgb(skin, 1, 0)); jg.addColorStop(1, rgb(skin, 0.7, 0.8));
  g.fillStyle = jg; g.fillRect(0, P(0, 118)[1], W, P(0, 150)[1] - P(0, 118)[1]);
  // stubble / beard shadow (him)
  if (!F) {
    const r = mulberry32(3);
    for (let i = 0; i < 2600; i++) {
      const ax = (r() - 0.5) * 96, th = 100 + r() * 42;
      const lip = Math.abs(ax) < 11 && th > 104 && th < 110; // upper lip
      const chin = th > 112 && Math.abs(ax) < 40 - (th - 112) * 0.3;
      const jaw = Math.abs(ax) > 26 && Math.abs(ax) < 50 && th > 90;
      if (!(lip || chin || jaw)) continue;
      const [x, y] = P(ax, th);
      g.fillStyle = `rgba(55,35,25,${0.18 + r() * 0.3})`;
      g.fillRect(x, y, 1.4, 1.4);
    }
    for (const s of [-1, 1]) blob(s * 44, 92, 5, 14, 'rgba(45,30,20,0.55)'); // sideburns
  }
  // eyes
  for (const s of [-1, 1]) {
    const [ex, ey] = P(s * 17, 84);
    g.save(); g.translate(ex, ey);
    g.fillStyle = '#f2ebe2';
    g.beginPath(); g.ellipse(0, 0, 9.5, 4.2, 0, 0, 7); g.fill();
    g.fillStyle = F ? '#5a3a22' : '#4a3424';
    g.beginPath(); g.arc(s * -0.8, 0.3, 3.9, 0, 7); g.fill();
    g.fillStyle = '#120a06'; g.beginPath(); g.arc(s * -0.8, 0.3, 1.8, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(s * -0.8 + 1.4, -1, 0.9, 0, 7); g.fill();
    // upper lid + lashes, lower lid
    g.strokeStyle = '#2a1810'; g.lineWidth = F ? 2.4 : 2;
    g.beginPath(); g.ellipse(0, 0.6, 10, 4.8, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    if (F) { g.lineWidth = 1.4; g.beginPath(); g.moveTo(s * 9.5, -1.8); g.lineTo(s * 12, -3.5); g.stroke(); }
    g.strokeStyle = rgb(skin, 0.7, 0.8); g.lineWidth = 1;
    g.beginPath(); g.ellipse(0, -0.2, 9.5, 4.6, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
    g.restore();
    // brows
    const [b0x, b0y] = P(s * 7, 76), [b1x, b1y] = P(s * 16, 72.5), [b2x, b2y] = P(s * 27, 75.5);
    g.strokeStyle = F ? '#3a2214' : '#24160c'; g.lineCap = 'round';
    g.lineWidth = F ? 2.6 : 4.2;
    g.beginPath(); g.moveTo(b0x, b0y); g.quadraticCurveTo(b1x, b1y - 1, b2x, b2y); g.stroke();
  }
  // nose shading + nostrils
  for (const s of [-1, 1]) { blob(s * 5, 96, 4, 10, rgb(skin, 0.8, 0.5)); blob(s * 3.2, 101.5, 2.2, 1.4, 'rgba(70,35,25,0.8)'); }
  // lips
  const [mx, my] = P(0, 110);
  g.fillStyle = F ? '#b8665a' : '#a0604c';
  g.beginPath(); g.moveTo(mx - 15, my); g.quadraticCurveTo(mx - 6, my - 4.2, mx, my - 2.4); g.quadraticCurveTo(mx + 6, my - 4.2, mx + 15, my); g.quadraticCurveTo(mx, my + 1, mx - 15, my); g.fill();
  g.fillStyle = F ? '#c77766' : '#ac6c56';
  g.beginPath(); g.moveTo(mx - 13, my + 0.5); g.quadraticCurveTo(mx, my + 7.5, mx + 13, my + 0.5); g.fill();
  g.strokeStyle = 'rgba(60,25,20,0.8)'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(mx - 15, my); g.quadraticCurveTo(mx, my + 1.5, mx + 15, my); g.stroke();
  // hairline: paint the crown/back in hair colour so any gap under the hair reads as hair
  const hair = F ? '#4a2a16' : '#2a1a10';
  g.fillStyle = hair;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(W, 0);
  for (let ax = 180; ax >= -180; ax -= 6) {
    const front = Math.abs(((ax + 540) % 360) - 180) > 120 ? 0 : 1; // not used
    const d = Math.min(Math.abs(ax), 360 - Math.abs(ax));
    const th = d < 40 ? 50 + (F ? 6 : 0) : d < 70 ? 56 + (d - 40) * 0.8 : d < 110 ? 80 : 110;
    const [x, y] = P(ax, th);
    g.lineTo(x, y);
  }
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const mats = (f) => ({
  skin: new THREE.MeshStandardMaterial({ color: f ? 0xcd9470 : 0xc48862, roughness: 0.55 }),
  shirt: new THREE.MeshStandardMaterial({ color: f ? 0x57524a : 0xc9b08c, roughness: 0.95 }),
  shirt2: new THREE.MeshStandardMaterial({ color: f ? 0x4a453e : 0xb89e7a, roughness: 0.95 }),
  shorts: new THREE.MeshStandardMaterial({ color: f ? 0x5a6470 : 0x4f463a, roughness: 0.95 }),
  shorts2: new THREE.MeshStandardMaterial({ color: f ? 0x7a8490 : 0x453d32, roughness: 0.95 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.75 }),
  leather2: new THREE.MeshStandardMaterial({ color: 0x4e3220, roughness: 0.75 }),
  pack: new THREE.MeshStandardMaterial({ color: 0x6e5236, roughness: 0.85 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x5a3c24, roughness: 0.7 }),
  sole: new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.9 }),
  sock: new THREE.MeshStandardMaterial({ color: 0x8a7e6a, roughness: 1 }),
  lace: new THREE.MeshStandardMaterial({ color: 0xb09a74, roughness: 1 }),
  hair: new THREE.MeshStandardMaterial({ color: f ? 0x4f2e18 : 0x2b1b10, roughness: 0.6 }),
  hair2: new THREE.MeshStandardMaterial({ color: f ? 0x65391c : 0x3a2616, roughness: 0.6 }),
  roll: new THREE.MeshStandardMaterial({ color: 0x6f6a48, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.4, metalness: 0.7 }),
  cord: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 }),
});

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
// Lathe around Y from [radius, y] pairs (bottom to top), elliptical cross-section via sx/sz.
function lathe(pts, sx = 1, sz = 1, seg = 22) {
  // smooth the profile with a Catmull-Rom spline so silhouettes read as rounded, not faceted
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 4; k++) {
      const t = k / 4, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(pts[pts.length - 1]);
  seg = Math.max(seg, 20);
  const g = new THREE.LatheGeometry(dense.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), seg);
  g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}
const rbox = (w, h, d, r = 0.01) => new RoundedBoxGeometry(w, h, d, 2, r);

// Sculpted head: sphere reshaped into a skull with jaw, chin, cheekbones and brow; keeps UVs for the face texture.
function headGeometry(F) {
  const R = 0.1;
  const g = new THREE.SphereGeometry(R, 32, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) / R, y = p.getY(i) / R, z = p.getZ(i) / R;
    const below = Math.max(0, -y);
    // jaw narrows toward the chin
    const jawK = 1 - (F ? 0.34 : 0.26) * Math.min(1, below * 1.3) ** 1.4;
    x *= jawK * (F ? 0.9 : 0.93);
    // flatter sides & back of the skull, deeper at the back of the crown
    if (z < 0) z *= 1.06 + 0.05 * Math.max(0, y);
    // chin forward, face slightly flat
    if (z > 0) {
      z *= 1 - 0.08 * Math.max(0, z - 0.6);
      z += (F ? 0.05 : 0.08) * Math.max(0, below - 0.55) * z;
    }
    // brow ridge & cheekbones
    z += 0.05 * Math.exp(-((y - 0.28) ** 2) / 0.01) * Math.max(0, z);
    x *= 1 + 0.05 * Math.exp(-((y + 0.05) ** 2) / 0.03) * Math.max(0, z);
    // eye sockets
    for (const s of [-1, 1]) {
      const d2 = (x - s * 0.33) ** 2 + (y - 0.16) ** 2;
      z -= 0.045 * Math.exp(-d2 / 0.012) * Math.max(0, z);
    }
    p.setXYZ(i, x * R, y * R * (F ? 1.14 : 1.17), z * R * 1.02);
  }
  g.computeVertexNormals();
  return g;
}

// Tapered clump of hair, oriented along `dir`.
function hairClump(len, wid, thick) {
  const g = new THREE.ConeGeometry(wid, len, 6, 3);
  g.rotateX(Math.PI); // apex down
  g.translate(0, -len / 2, 0); // wide root at the origin, tip at -len
  g.scale(1, 1, thick / wid);
  return g;
}

export class Character {
  // variant: 'm' (castaway in henley & cargo shorts) or 'f' (ponytail, crop tank, denim cutoffs)
  constructor(variant = 'm') {
    const F = variant === 'f';
    this.variant = variant;
    const M = this.mats = mats(F);
    for (const k of ['skin', 'hair', 'hair2']) M[k].userData.smooth = true;
    const root = this.root = new THREE.Group();
    const body = this.body = new THREE.Group(); // tilts for swimming
    root.add(body);
    const hips = this.hips = new THREE.Group();
    hips.position.y = 0.98;
    body.add(hips);
    const rnd = mulberry32(F ? 11 : 5);

    // ---- pelvis, shorts top, belt & gear ----
    if (F) {
      mesh(lathe([[0.05, -0.13], [0.16, -0.1], [0.185, -0.02], [0.17, 0.06], [0.14, 0.12]], 1, 0.72, 20), M.shorts, 0, 0, 0, hips);
    } else {
      mesh(lathe([[0.05, -0.14], [0.17, -0.11], [0.185, -0.02], [0.175, 0.06], [0.16, 0.12]], 1, 0.72, 20), M.shorts, 0, 0, 0, hips);
    }
    const belt = mesh(new THREE.TorusGeometry(F ? 0.168 : 0.176, 0.024, 6, 28), M.leather, 0, F ? 0.02 : 0.075, 0, hips);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.72, 1.4);
    mesh(rbox(0.055, 0.045, 0.02, 0.006), M.metal, 0, F ? 0.02 : 0.075, 0.13, hips);
    // pouches on the belt
    for (const [ang, w] of [[0.9, 0.08], [2.3, 0.07], [-1.0, 0.075]]) {
      const pch = mesh(rbox(w, 0.09, 0.05, 0.012), M.leather2, Math.sin(ang) * 0.18, (F ? 0.02 : 0.075) - 0.06, Math.cos(ang) * 0.13, hips);
      pch.rotation.y = ang;
      mesh(rbox(w + 0.006, 0.03, 0.055, 0.008), M.leather, Math.sin(ang) * 0.182, (F ? 0.02 : 0.075) - 0.025, Math.cos(ang) * 0.132, hips).rotation.y = ang;
    }
    const knife = mesh(rbox(0.032, 0.18, 0.026, 0.01), M.leather2, 0.14, -0.06, -0.09, hips);
    knife.rotation.z = 0.15;
    mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.06, 6), M.cord, 0.148, 0.05, -0.09, hips);

    // ---- torso ----
    const spine = this.spine = new THREE.Group();
    spine.position.y = 0.08;
    hips.add(spine);
    if (F) {
      // toned bare midriff, crop tank top with straps
      mesh(lathe([[0.138, -0.06], [0.128, 0.06], [0.13, 0.15], [0.148, 0.26], [0.158, 0.35], [0.155, 0.42], [0.12, 0.47], [0.055, 0.51]], 1.04, 0.68, 22), M.skin, 0, 0, 0, spine);
      mesh(lathe([[0.15, 0.245], [0.158, 0.27], [0.166, 0.33], [0.164, 0.38], [0.15, 0.41]], 1.04, 0.72, 22), M.shirt, 0, 0, 0, spine);
      const bust = mesh(sph(1, 24, 16), M.shirt, 0, 0.335, 0.062, spine); bust.scale.set(0.13, 0.06, 0.052);
      for (const s of [-1, 1]) {
        const st = mesh(rbox(0.022, 0.1, 0.016, 0.005), M.shirt2, s * 0.085, 0.44, 0.045, spine); st.rotation.set(-0.3, 0, s * -0.1);
      }
    } else {
      // henley t-shirt over a broad chest
      mesh(lathe([[0.158, -0.06], [0.152, 0.04], [0.162, 0.15], [0.185, 0.26], [0.198, 0.35], [0.192, 0.41], [0.168, 0.45], [0.12, 0.49], [0.075, 0.52]], 1.06, 0.66, 22), M.shirt, 0, 0, 0, spine);
      const chest = mesh(sph(1, 20, 12), M.shirt, 0, 0.345, 0.05, spine); chest.scale.set(0.16, 0.085, 0.07);
      // placket with buttons, open collar
      mesh(rbox(0.036, 0.13, 0.012, 0.004), M.shirt2, 0, 0.405, 0.124, spine).rotation.x = -0.25;
      for (let k = 0; k < 3; k++) mesh(sph(0.006, 6, 4), M.leather2, 0, 0.44 - k * 0.04, 0.133 - k * 0.008, spine);
      const collar = mesh(new THREE.TorusGeometry(0.075, 0.013, 6, 18), M.shirt2, 0, 0.485, -0.004, spine);
      collar.rotation.x = Math.PI / 2 - 0.25; collar.scale.set(1, 1.1, 1);
      // tuck-in bulge at the waist
      mesh(lathe([[0.168, -0.02], [0.172, 0.03], [0.16, 0.06]], 1.06, 0.68, 20), M.shirt2, 0, 0, 0, spine);
    }
    // neck
    mesh(lathe([[F ? 0.05 : 0.058, 0.44], [F ? 0.046 : 0.056, 0.52], [F ? 0.044 : 0.052, 0.6]], 1, 1, 12), M.skin, 0, 0, 0.005, spine);
    // pendant necklace
    const neck = mesh(new THREE.TorusGeometry(F ? 0.064 : 0.07, 0.004, 4, 20, Math.PI * 1.1), M.cord, 0, 0.49, 0.03, spine);
    neck.rotation.set(Math.PI * 0.6, 0, Math.PI * 1.45);
    mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.004, 10).rotateX(Math.PI / 2), M.metal, 0, 0.415, F ? 0.108 : 0.132, spine);

    // ---- straps & backpack (canvas rucksack with leather flap, side pockets, bedroll) ----
    for (const s of [-1, 1]) {
      const st = mesh(rbox(F ? 0.03 : 0.042, 0.34, 0.012, 0.005), M.leather2, s * (F ? 0.105 : 0.095), 0.32, F ? 0.1 : 0.126, spine);
      st.rotation.z = s * -0.1; st.rotation.x = -0.12;
      mesh(rbox(0.022, 0.018, 0.01, 0.003), M.metal, s * 0.1, 0.3, F ? 0.108 : 0.134, spine);
      const sh = mesh(rbox(0.048, 0.02, 0.22, 0.006), M.leather2, s * 0.12, 0.48, -0.01, spine);
      sh.rotation.z = s * 0.28;
    }
    const pack = this.pack = new THREE.Group();
    pack.position.set(0, 0.3, F ? -0.17 : -0.19);
    spine.add(pack);
    const PS = F ? 0.88 : 1;
    const body1 = mesh(rbox(0.34 * PS, 0.42 * PS, 0.18 * PS, 0.06), M.pack, 0, 0, 0, pack);
    body1.scale.set(1, 1, 1);
    mesh(rbox(0.35 * PS, 0.18 * PS, 0.2 * PS, 0.05), M.leather, 0, 0.14 * PS, 0.005, pack).rotation.x = 0.06;
    mesh(rbox(0.23 * PS, 0.15 * PS, 0.07, 0.03), M.pack, 0, -0.09 * PS, -0.1 * PS - 0.01, pack);
    mesh(rbox(0.24 * PS, 0.05, 0.075, 0.02), M.leather, 0, -0.02 * PS, -0.1 * PS - 0.012, pack);
    for (const s of [-1, 1]) {
      mesh(rbox(0.075, 0.2 * PS, 0.12 * PS, 0.03), M.pack, s * 0.2 * PS, -0.06, 0, pack);
      mesh(rbox(0.026, 0.3 * PS, 0.012, 0.005), M.leather2, s * 0.08, 0.02, -0.093 * PS, pack);
      mesh(rbox(0.03, 0.022, 0.014, 0.004), M.metal, s * 0.08, 0.1 * PS, -0.1 * PS, pack);
    }
    if (!F) {
      const roll = mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.42, 14), M.roll, 0, 0.26, 0.0, pack); roll.rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) { const b = mesh(new THREE.TorusGeometry(0.07, 0.01, 5, 12), M.leather2, s * 0.13, 0.26, 0, pack); b.rotation.y = Math.PI / 2; }
    }
    // rope coil hanging from the side
    const coil = mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 16), M.lace, -0.2 * PS, -0.12, 0.02, pack); coil.rotation.y = Math.PI / 2;

    // ---- head ----
    const head = this.head = new THREE.Group();
    head.position.y = 0.555; head.scale.setScalar(F ? 1.07 : 1.1);
    spine.add(head);
    const faceMat = rimLit(new THREE.MeshStandardMaterial({ map: faceTexture(F), roughness: 0.5 }), 0.22);
    faceMat.userData.keep = true;
    mesh(headGeometry(F), faceMat, 0, 0.1, 0.0, head);
    // nose
    const nose = new THREE.ConeGeometry(0.018, 0.045, 4, 1);
    nose.rotateX(-Math.PI / 2 - 0.35); nose.rotateZ(Math.PI / 4); nose.scale(F ? 0.8 : 1, 1, 0.75);
    mesh(nose, M.skin, 0, 0.087, F ? 0.1 : 0.104, head);
    // ears
    for (const s of [-1, 1]) { const ear = mesh(sph(0.026, 10, 8), M.skin, s * (F ? 0.088 : 0.093), 0.1, -0.008, head); ear.scale.set(0.4, 1, 0.75); ear.rotation.y = s * 0.3; }

    // ---- hair ----
    const H = new THREE.Group(); head.add(H);
    H.position.set(0, 0.1, 0);
    // base cap hugging the skull
    const capG = new THREE.SphereGeometry(0.109, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.47);
    capG.scale(F ? 0.92 : 0.96, 1.2, 1.07); capG.rotateX(-0.34);
    mesh(capG, M.hair, 0, 0.012, -0.008, H);
    const back = mesh(sph(0.1, 16, 12), M.hair, 0, -0.005, -0.03, H); back.scale.set(F ? 0.9 : 0.95, F ? 0.95 : 1.02, 0.9);
    // clumps lying on the scalp, flowing from the crown back & down (a messy fringe for him)
    const q = new THREE.Quaternion(), f = new THREE.Vector3(), w = new THREE.Vector3();
    const addClump = (d, want, len, wid, mat, lift = 0.3) => {
      f.copy(want).addScaledVector(d, -want.dot(d)).normalize().addScaledVector(d, lift).normalize();
      const m = mesh(hairClump(len, wid, wid * 0.32), mat, d.x * 0.092 * 0.95, d.y * 0.092 * 1.18 + 0.012, d.z * 0.092 * 1.05 - 0.006, H);
      q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), f);
      m.quaternion.copy(q);
      m.rotateY((rnd() - 0.5) * 1.5);
      return m;
    };
    const nClumps = F ? 30 : 52;
    for (let i = 0; i < nClumps; i++) {
      const a = rnd() * Math.PI * 2, e = (F ? 0.15 : -0.2) + rnd() * 1.4;
      const d = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      if (d.z > 0.25 && d.y < 0.62) continue; // keep the face clear
      if (d.y > 0.88) continue; // crown is covered by the cap
      w.set((rnd() - 0.5) * (F ? 0.2 : 0.9), -0.55, -1);
      if (F) w.set(d.x * -0.2, -0.3, -1); // pulled back toward the ponytail
      addClump(d, w, (F ? 0.07 : 0.065) + rnd() * 0.045, 0.032 + rnd() * 0.014, rnd() < 0.3 ? M.hair2 : M.hair, F ? 0.06 : 0.08 + rnd() * 0.08);
    }
    if (F) {
      // strands framing the face
      for (const s of [-1, 1]) {
        const st = mesh(hairClump(0.15, 0.022, 0.01), M.hair, s * 0.074, 0.075, 0.06, H);
        st.rotation.set(0.1, 0, s * -0.12);
      }
      // ponytail (its own group so it can swing)
      const tail = this.ponytail = new THREE.Group();
      tail.position.set(0, 0.06, -0.115); H.add(tail);
      const tie = mesh(new THREE.TorusGeometry(0.024, 0.009, 5, 10), M.leather, 0, 0, 0, tail); tie.rotation.x = 0.5;
      for (let k = 0; k < 7; k++) {
        const t = k / 6;
        const pc = mesh(sph(0.042 - t * 0.024, 9, 7), k % 2 ? M.hair2 : M.hair, Math.sin(t * 3) * 0.008, -0.03 - t * 0.21, -0.03 - Math.sin(t * 1.5) * 0.04, tail);
        pc.scale.set(1, 1.7, 0.85);
      }
    } else {
      // tousled fringe swept forward and to the side over the forehead
      for (let k = 0; k < 9; k++) {
        const ax = (k - 4) * 0.22 + (rnd() - 0.5) * 0.12;
        const d = new THREE.Vector3(Math.sin(ax) * 0.7, 0.6, Math.cos(ax) * 0.7).normalize();
        addClump(d, w.set(0.5 + (rnd() - 0.5) * 0.4, -0.35, 1), 0.055 + rnd() * 0.02, 0.032, k % 3 ? M.hair : M.hair2, 0.12);
      }
    }

    // ---- arms ----
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * (F ? 0.185 : 0.212), 0.44, 0);
      spine.add(sh);
      // deltoid + sleeve
      mesh(sph(1, 18, 14), F ? M.skin : M.shirt, s * -0.01, -0.01, 0, sh).scale.set(F ? 0.052 : 0.068, F ? 0.064 : 0.072, F ? 0.05 : 0.064);
      if (!F) {
        mesh(lathe([[0.066, -0.17], [0.074, -0.12], [0.076, -0.04], [0.07, 0.0]], 1, 0.95, 14), M.shirt, 0, 0, 0, sh);
        const cuff = mesh(new THREE.TorusGeometry(0.066, 0.012, 6, 14), M.shirt2, 0, -0.165, 0, sh); cuff.rotation.x = Math.PI / 2;
      }
      // upper arm with a bicep bulge
      mesh(lathe(F ? [[0.038, -0.305], [0.041, -0.27], [0.046, -0.19], [0.049, -0.1], [0.048, 0.0]] : [[0.043, -0.305], [0.047, -0.27], [0.058, -0.19], [0.061, -0.11], [0.058, -0.02]], 1, 0.92), M.skin, 0, 0, 0.004, sh);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      mesh(sph(F ? 0.037 : 0.042, 14, 10), M.skin, 0, 0, -0.004, el);
      mesh(lathe(F ? [[0.028, -0.235], [0.032, -0.19], [0.04, -0.09], [0.039, -0.02], [0.035, 0.02]] : [[0.033, -0.235], [0.037, -0.19], [0.05, -0.08], [0.047, -0.01], [0.04, 0.02]], 1, 0.84), M.skin, 0, 0, 0, el);
      // wrist cuff, bracelets, a watch on one wrist
      mesh(new THREE.CylinderGeometry(0.045, 0.047, 0.05, 12), M.leather, 0, -0.2, 0, el);
      mesh(new THREE.TorusGeometry(0.041, 0.006, 5, 12).rotateX(Math.PI / 2), M.cord, 0, -0.17, 0, el);
      if (s < 0) { mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12).rotateX(Math.PI / 2), M.metal, 0, -0.21, 0.046, el); }
      // hand: palm, curled fingers, thumb
      const hand = new THREE.Group(); hand.position.y = -0.255; el.add(hand);
      const palm = mesh(rbox(F ? 0.052 : 0.06, 0.07, 0.03, 0.012), M.skin, 0, -0.03, 0.004, hand);
      palm.rotation.x = 0.05;
      const fing = mesh(rbox(F ? 0.05 : 0.058, 0.055, 0.026, 0.011), M.skin, 0, -0.08, 0.014, hand); fing.rotation.x = -0.45;
      const th = mesh(new THREE.CapsuleGeometry(0.011, 0.035, 3, 6), M.skin, s * -0.03, -0.035, 0.022, hand); th.rotation.set(-0.5, 0, s * 0.5);
      this.arms.push({ sh, el, hand, s });
    }
    this.armL = this.arms[0]; this.armR = this.arms[1];

    // ---- legs ----
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * (F ? 0.092 : 0.098), -0.04, 0); hips.add(hip);
      if (F) {
        // denim cutoffs: short, frayed hem, a thigh holster strap on one leg
        mesh(lathe([[0.094, -0.13], [0.1, -0.06], [0.1, 0.02]], 1, 1, 16), M.shorts, 0, 0, 0, hip);
        mesh(new THREE.CylinderGeometry(0.097, 0.1, 0.02, 16, 1, true), M.shorts2, 0, -0.13, 0, hip);
        mesh(lathe([[0.05, -0.44], [0.058, -0.4], [0.07, -0.32], [0.083, -0.2], [0.088, -0.1]], 1, 1), M.skin, 0, 0, 0, hip);
        if (s > 0) {
          const strap = mesh(new THREE.TorusGeometry(0.085, 0.012, 5, 16), M.leather2, 0, -0.2, 0, hip); strap.rotation.x = Math.PI / 2;
          mesh(rbox(0.05, 0.12, 0.03, 0.01), M.leather2, s * 0.08, -0.2, 0.01, hip).rotation.y = s * 1.3;
        }
      } else {
        // cargo shorts to just above the knee with side pockets
        mesh(lathe([[0.09, -0.35], [0.094, -0.25], [0.099, -0.12], [0.103, 0.02]], 1, 1, 16), M.shorts, 0, 0, 0, hip);
        const hem = mesh(new THREE.TorusGeometry(0.09, 0.011, 5, 16), M.shorts2, 0, -0.345, 0, hip); hem.rotation.x = Math.PI / 2;
        mesh(rbox(0.05, 0.11, 0.085, 0.014), M.shorts2, s * 0.09, -0.2, 0.005, hip);
        mesh(rbox(0.052, 0.03, 0.088, 0.01), M.shorts, s * 0.092, -0.15, 0.005, hip);
        mesh(lathe([[0.054, -0.44], [0.06, -0.4], [0.066, -0.36], [0.07, -0.33]], 1, 1), M.skin, 0, 0, 0, hip);
      }
      const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
      mesh(sph(F ? 0.05 : 0.055, 14, 10), M.skin, 0, 0, 0.004, knee);
      // calf with a proper calf-muscle shape
      mesh(lathe(F ? [[0.04, -0.32], [0.043, -0.24], [0.056, -0.13], [0.05, -0.04], [0.046, 0.02]] : [[0.045, -0.32], [0.048, -0.24], [0.064, -0.13], [0.056, -0.04], [0.051, 0.02]], 1, 0.95), M.skin, 0, 0, -0.004, knee);
      // rolled sock + lace-up boot
      mesh(new THREE.TorusGeometry(0.052, 0.014, 6, 14).rotateX(Math.PI / 2), M.sock, 0, -0.27, 0, knee);
      const foot = new THREE.Group(); foot.position.y = -0.43; knee.add(foot);
      mesh(lathe([[0.07, -0.02], [0.066, 0.08], [0.058, 0.15], [0.06, 0.17]], 1, 1.05, 14), M.boot, 0, 0, 0, foot);
      mesh(new THREE.TorusGeometry(0.06, 0.009, 5, 14).rotateX(Math.PI / 2), M.leather2, 0, 0.165, 0, foot);
      mesh(rbox(0.118, 0.09, 0.25, 0.038), M.boot, 0, -0.03, 0.045, foot);
      mesh(rbox(0.12, 0.08, 0.1, 0.035), M.boot, 0, -0.015, 0.13, foot).rotation.x = 0.15; // toe cap
      mesh(rbox(0.126, 0.028, 0.27, 0.01), M.sole, 0, -0.072, 0.05, foot);
      mesh(rbox(0.035, 0.16, 0.012, 0.004), M.lace, 0, 0.05, 0.066, foot).rotation.x = -0.12;
      for (let k = 0; k < 4; k++) mesh(rbox(0.05, 0.007, 0.008, 0.002), M.lace, 0, 0.0 + k * 0.035, 0.072 - k * 0.004, foot);
      this.legs.push({ hip, knee, foot, s });
    }

    // subtle per-part shading variation, then merge static meshes per bone & material
    this.root.traverse((o) => { if (o.isMesh && !o.material.userData.smooth) o.userData.shade = 0.92 + rnd() * 0.12; });
    const groups = [];
    this.root.traverse((o) => { if (o.isGroup || o === this.root) groups.push(o); });
    for (const g of groups) mergeChildren(g);
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (F) this.root.scale.setScalar(0.95);

    // animation state
    this.phase = 0;
    this.action = null; // { type, t, dur, onImpact, impacted }
    this.heldItem = null;
    this.blend = { move: 0, run: 0, swim: 0, air: 0 };
    this.idleSeed = rnd() * 10;
    this.tailVel = 0; this.tailAng = 0;
  }

  setHeld(obj) {
    if (this.heldItem) this.armR.hand.remove(this.heldItem);
    this.heldItem = obj;
    if (obj) {
      // grip the handle near its lower end, head pointing forward and slightly down
      obj.rotation.set(Math.PI * 0.62, 0, 0);
      const grip = new THREE.Vector3(0, -0.2 * obj.scale.y, 0).applyEuler(obj.rotation);
      obj.position.set(0, -0.06, 0.02).sub(grip);
      this.armR.hand.add(obj);
    }
  }

  play(type, dur, onImpact, impactAt = 0.55) {
    this.action = { type, t: 0, dur, onImpact, impactAt, impacted: false };
  }

  get busy() { return !!this.action; }

  update(dt, s) {
    // s: { speed (m/s), running, grounded, swimming, vy }
    const B = this.blend;
    const k = 1 - Math.exp(-dt * 10);
    B.move = lerp(B.move, clamp(s.speed / 4, 0, 1), k);
    B.run = lerp(B.run, s.running ? 1 : 0, k);
    B.swim = lerp(B.swim, s.swimming ? 1 : 0, 1 - Math.exp(-dt * 5));
    B.air = lerp(B.air, !s.grounded && !s.swimming ? 1 : 0, 1 - Math.exp(-dt * 12));

    const freq = s.swimming ? 2.2 : 1.35 + B.run * 0.35;
    this.phase += dt * (s.swimming ? 3 : Math.max(s.speed, 0.4) * freq * (s.speed > 0.1 ? 1 : 0.6));
    const ph = this.phase;
    const [lL, lR] = this.legs;
    const [aL, aR] = this.arms;
    const mv = B.move * (1 - B.swim);
    const amp = lerp(0.42, 0.72, B.run) * mv;
    const t = performance.now() / 1000;

    // --- locomotion base pose ---
    const sin = Math.sin(ph), cos = Math.cos(ph);
    lL.hip.rotation.set(sin * amp, 0, 0);
    lR.hip.rotation.set(-sin * amp, 0, 0);
    lL.knee.rotation.x = Math.max(0, -cos) * amp * 1.5 + Math.max(0, sin) * amp * 0.3;
    lR.knee.rotation.x = Math.max(0, cos) * amp * 1.5 + Math.max(0, -sin) * amp * 0.3;
    lL.foot.rotation.x = -lL.knee.rotation.x * 0.3; lR.foot.rotation.x = -lR.knee.rotation.x * 0.3;

    const idle = 1 - mv;
    const ti = t + this.idleSeed;
    const breathe = Math.sin(ti * 1.7) * 0.018;
    const shift = Math.sin(ti * 0.45); // slow weight shift from foot to foot
    const runA = B.run * mv;
    if (runA > 0.01) { // sprint: higher knees
      lL.knee.rotation.x *= 1 + runA * 0.35; lR.knee.rotation.x *= 1 + runA * 0.35;
    }
    aL.sh.rotation.set(-sin * amp * (0.9 + runA * 0.45) + idle * 0.05, 0, -0.07 - idle * (0.05 + breathe));
    aR.sh.rotation.set(sin * amp * (0.9 + runA * 0.45) + idle * 0.05, 0, 0.07 + idle * (0.05 + breathe));
    aL.el.rotation.x = -(0.2 + runA * 1.25 + Math.max(0, sin) * 0.25 * mv);
    aR.el.rotation.x = -(0.2 + runA * 1.25 + Math.max(0, -sin) * 0.25 * mv);
    this.spine.rotation.set(0.04 + runA * 0.28 + breathe, sin * (0.1 + runA * 0.08) * mv, -shift * 0.025 * idle);
    this.hips.position.set(shift * 0.02 * idle, 0.98 - Math.abs(cos) * (0.035 + runA * 0.03) * mv - runA * 0.04, 0);
    this.hips.rotation.set(0, -sin * 0.12 * mv, shift * 0.035 * idle + cos * 0.04 * mv * (1 - runA));
    // relaxed knee on the unweighted leg
    lL.knee.rotation.x += Math.max(0, shift) * 0.14 * idle; lR.knee.rotation.x += Math.max(0, -shift) * 0.14 * idle;
    lL.hip.rotation.x -= Math.max(0, shift) * 0.06 * idle; lR.hip.rotation.x -= Math.max(0, -shift) * 0.06 * idle;
    // glance around when standing still
    const look = idle * (Math.sin(ti * 0.23) * 0.35 + Math.sin(ti * 0.61) * 0.12);
    this.head.rotation.set(-0.04 - runA * 0.16 + Math.sin(ti * 0.37) * 0.04 * idle, look, -shift * 0.03 * idle);

    // --- airborne ---
    if (B.air > 0.01) {
      const a = B.air;
      lL.hip.rotation.x = lerp(lL.hip.rotation.x, -0.6, a); lL.knee.rotation.x = lerp(lL.knee.rotation.x, 1.1, a);
      lR.hip.rotation.x = lerp(lR.hip.rotation.x, 0.15, a); lR.knee.rotation.x = lerp(lR.knee.rotation.x, 0.5, a);
      aL.sh.rotation.x = lerp(aL.sh.rotation.x, -0.9, a); aR.sh.rotation.x = lerp(aR.sh.rotation.x, -0.7, a);
      aL.sh.rotation.z = lerp(aL.sh.rotation.z, -0.5, a); aR.sh.rotation.z = lerp(aR.sh.rotation.z, 0.5, a);
    }

    // --- swimming ---
    if (B.swim > 0.01) {
      const w = B.swim;
      this.swimMove = lerp(this.swimMove || 0, clamp(s.speed / 2, 0, 1), 1 - Math.exp(-dt * 4));
      const moving = this.swimMove;
      // tilt forward around the chest (which stays at the water line) so the head never dips under
      const tilt = lerp(0, 0.2 + 0.78 * moving, w);
      const PIV = 1.4;
      this.body.rotation.x = tilt;
      this.body.position.set(0, PIV - PIV * Math.cos(tilt), -PIV * Math.sin(tilt));
      const sp = ph;
      // breaststroke: arms sweep forward and out; treading water: small sculling circles
      const stroke = Math.sin(sp);
      aL.sh.rotation.x = lerp(aL.sh.rotation.x, moving > 0.2 ? -2.2 + stroke * 0.7 : -0.55 + Math.sin(t * 2.4) * 0.3, w);
      aR.sh.rotation.x = lerp(aR.sh.rotation.x, moving > 0.2 ? -2.2 + stroke * 0.7 : -0.55 + Math.sin(t * 2.4 + 1) * 0.3, w);
      aL.sh.rotation.z = lerp(aL.sh.rotation.z, moving > 0.2 ? -0.35 - Math.max(0, -stroke) * 0.8 : -0.75 + Math.sin(t * 2.4) * 0.2, w);
      aR.sh.rotation.z = lerp(aR.sh.rotation.z, moving > 0.2 ? 0.35 + Math.max(0, -stroke) * 0.8 : 0.75 - Math.sin(t * 2.4) * 0.2, w);
      aL.el.rotation.x = lerp(aL.el.rotation.x, -0.35 - Math.max(0, stroke) * 0.6, w); aR.el.rotation.x = lerp(aR.el.rotation.x, -0.35 - Math.max(0, stroke) * 0.6, w);
      const kick = Math.sin(t * (moving > 0.2 ? 8 : 4)) * 0.35 * (0.4 + moving);
      lL.hip.rotation.x = lerp(lL.hip.rotation.x, kick - 0.1, w); lR.hip.rotation.x = lerp(lR.hip.rotation.x, -kick - 0.1, w);
      lL.knee.rotation.x = lerp(lL.knee.rotation.x, 0.35 + Math.max(0, kick), w); lR.knee.rotation.x = lerp(lR.knee.rotation.x, 0.35 + Math.max(0, -kick), w);
      this.head.rotation.x = lerp(this.head.rotation.x, -tilt * 0.85, w);
      this.spine.rotation.x = lerp(this.spine.rotation.x, 0, w);
      this.hips.position.y = lerp(this.hips.position.y, 0.98 + Math.sin(t * 2) * 0.02, w);
    } else {
      this.body.rotation.x = 0;
      this.body.position.set(0, 0, 0);
    }

    // holding a torch up
    if (this.holdPose === 'torch' && B.swim < 0.5) {
      aR.sh.rotation.x = -0.75 + Math.sin(t * 2) * 0.03; aR.sh.rotation.z = 0.35; aR.el.rotation.x = -0.9;
    }
    // --- actions (upper body overrides) ---
    const A = this.action;
    if (A) {
      A.t += dt;
      const u = clamp(A.t / A.dur, 0, 1);
      if (!A.impacted && u >= A.impactAt) { A.impacted = true; A.onImpact?.(); }
      if (A.type === 'chop' || A.type === 'mine' || A.type === 'attack') {
        // wind-up then fast strike
        const up = u < 0.45 ? easeOut(u / 0.45) : u < 0.6 ? 1 - easeIn((u - 0.45) / 0.15) : 0;
        const rec = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1;
        const strike = u >= 0.45 ? rec : 0;
        const vertical = A.type === 'mine' ? 1 : 0.55;
        aR.sh.rotation.x = -2.5 * up - 0.5 * strike;
        aR.sh.rotation.z = 0.15 + (1 - vertical) * 0.9 * (up + strike * 0.5);
        aR.sh.rotation.y = (1 - vertical) * -0.6 * strike;
        aR.el.rotation.x = -0.9 * up - 0.15;
        aL.sh.rotation.x = -1.4 * up - 0.7 * strike; aL.sh.rotation.z = -0.1 - 0.6 * (1 - vertical) * strike;
        aL.el.rotation.x = -1.0;
        this.spine.rotation.y = (1 - vertical) * (0.5 * up - 0.45 * strike);
        this.spine.rotation.x += 0.35 * strike - 0.12 * up;
      } else if (A.type === 'gather') {
        const d = Math.sin(u * Math.PI);
        this.spine.rotation.x += 0.75 * d;
        this.hips.position.y -= 0.22 * d;
        lL.hip.rotation.x -= 0.6 * d; lR.hip.rotation.x -= 0.2 * d;
        lL.knee.rotation.x += 1.1 * d; lR.knee.rotation.x += 0.6 * d;
        aR.sh.rotation.x = -0.9 * d; aL.sh.rotation.x = -0.5 * d;
        aR.el.rotation.x = -0.2;
      } else if (A.type === 'eat') {
        const d = Math.sin(u * Math.PI);
        aR.sh.rotation.x = -1.2 * d; aR.sh.rotation.z = 0.3 * d;
        aR.el.rotation.x = -2.1 * d;
        this.head.rotation.x -= 0.15 * d;
      } else if (A.type === 'build') {
        const d = Math.sin(u * Math.PI * 3);
        aR.sh.rotation.x = -1.6 + d * 0.5; aR.el.rotation.x = -0.8;
        this.spine.rotation.x += 0.15;
      } else if (A.type === 'wake') {
        // lying on the sand -> sitting up -> standing
        const lie = 1 - smooth(clamp((u - 0.15) / 0.55, 0, 1));
        const sit = Math.sin(clamp((u - 0.2) / 0.7, 0, 1) * Math.PI);
        this.body.rotation.x = -1.5 * lie;
        this.body.position.y = 0.12 * lie;
        this.body.position.z = -0.9 * lie;
        lL.hip.rotation.x = -1.2 * sit; lR.hip.rotation.x = -0.4 * sit;
        lL.knee.rotation.x = 1.6 * sit; lR.knee.rotation.x = 0.8 * sit;
        this.hips.position.y -= 0.35 * sit;
        this.spine.rotation.x += 0.5 * sit;
        aL.sh.rotation.x = -0.6 * sit; aR.sh.rotation.x = 0.3 * sit - 0.3 * lie; aR.el.rotation.x = -0.4;
        this.head.rotation.x = -0.3 * lie + 0.25 * sit;
        if (A.t >= A.dur) { this.body.position.set(0, 0, 0); this.body.rotation.x = 0; }
      } else if (A.type === 'drink') {
        const d = Math.sin(u * Math.PI);
        this.spine.rotation.x += 0.9 * d; this.hips.position.y -= 0.35 * d;
        lL.knee.rotation.x += 1.3 * d; lR.knee.rotation.x += 1.3 * d; lL.hip.rotation.x -= 0.8 * d; lR.hip.rotation.x -= 0.8 * d;
        aR.sh.rotation.x = -1.0 * d; aL.sh.rotation.x = -1.0 * d;
      }
      if (A.t >= A.dur) this.action = null;
    }
    // ponytail: damped spring that trails behind when moving and bounces with each step
    if (this.ponytail) {
      const target = 0.15 + runA * 0.55 + mv * 0.2 + Math.abs(Math.sin(ph)) * 0.12 * mv + B.swim * 0.9;
      this.tailVel += ((target - this.tailAng) * 60 - this.tailVel * 9) * dt;
      this.tailAng += this.tailVel * dt;
      this.ponytail.rotation.set(this.tailAng, 0, Math.sin(ph) * 0.14 * mv + Math.sin(ti * 0.8) * 0.03);
    }
  }
}

// One shared material: per-part colours live in vertex colours, a light fabric texture adds grain.
let CHAR_MAT = null, SKIN_MAT = null;
function charMaterial(smooth) {
  if (!CHAR_MAT) {
    CHAR_MAT = rimLit(new THREE.MeshStandardMaterial({ vertexColors: true, map: fabricTexture(9), roughness: 0.88 }), 0.14);
    SKIN_MAT = rimLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), 0.22);
  }
  return smooth ? SKIN_MAT : CHAR_MAT;
}

// Warm rim light + soft wrap so characters separate from the background and read as rounded forms.
export function rimLit(mat, amount = 0.18) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float rim = pow(1.0 - ndv, 2.6);
        outgoingLight += vec3(1.0, 0.86, 0.68) * rim * ${amount.toFixed(3)} + diffuseColor.rgb * 0.06;
      }
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'rim' + amount;
  return mat;
}

// Merge every mesh directly under a bone into a single draw call.
function mergeChildren(group) {
  const sets = [[], []]; // [cloth, skin/hair]
  for (const c of [...group.children]) {
    if (!c.isMesh || c.material.userData.keep) continue;
    c.updateMatrix();
    const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
    g.applyMatrix4(c.matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const col = c.material.color;
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    const smooth = c.material.userData.smooth;
    const k = (smooth ? 1 : 1.08) * (c.userData.shade || 1);
    // soft occlusion toward the ends of each limb segment gives the body some form
    c.geometry.computeBoundingBox();
    const bb = c.geometry.boundingBox, lp = c.geometry.attributes.position;
    const nonIdx = c.geometry.index ? c.geometry.index.array : null;
    for (let i = 0; i < n; i++) {
      let ao = 1;
      if (smooth && bb.max.y - bb.min.y > 0.08) {
        const vi = nonIdx ? nonIdx[i] : i;
        const ty = (lp.getY(vi) - bb.min.y) / (bb.max.y - bb.min.y);
        ao = 0.86 + 0.14 * Math.min(1, Math.min(ty, 1 - ty) / 0.22);
      }
      a[i * 3] = col.r * k * ao; a[i * 3 + 1] = col.g * k * ao; a[i * 3 + 2] = col.b * k * ao;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    sets[c.material.userData.smooth ? 1 : 0].push(g);
    group.remove(c);
  }
  sets.forEach((gs, k) => {
    if (!gs.length) return;
    const m = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], charMaterial(k === 1));
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  });
}

const smooth = (x) => x * x * (3 - 2 * x);
const easeOut = (x) => 1 - (1 - x) * (1 - x);
const easeIn = (x) => x * x;
