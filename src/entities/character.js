// Procedural stylized-realistic castaway: model hierarchy + procedural animation.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, lerp, clamp } from '../util/noise.js';

function fabricTexture(base, speck, seed) {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const r = mulberry32(seed);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${speck},${0.05 + r() * 0.12})`;
    const s = 1 + r() * 3;
    g.fillRect(r() * S, r() * S, s, s);
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(${speck},${0.08 + r() * 0.1})`;
    g.beginPath(); g.arc(r() * S, r() * S, 2 + r() * 7, 0, 7); g.fill();
  }
  // weave
  g.strokeStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < S; y += 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const mats = () => ({
  skin: new THREE.MeshStandardMaterial({ color: 0xa9704e, roughness: 0.58 }),
  stubble: new THREE.MeshStandardMaterial({ color: 0x80563c, roughness: 0.8 }),
  shirt: new THREE.MeshStandardMaterial({ map: fabricTexture('#cdb994', '90,62,38', 1), roughness: 0.95 }),
  shorts: new THREE.MeshStandardMaterial({ map: fabricTexture('#534a3c', '30,24,18', 2), roughness: 0.95 }),
  leather: new THREE.MeshStandardMaterial({ map: fabricTexture('#6a4428', '30,18,8', 3), roughness: 0.75 }),
  pack: new THREE.MeshStandardMaterial({ map: fabricTexture('#6b5034', '35,22,12', 4), roughness: 0.85 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x4e3320, roughness: 0.7 }),
  sole: new THREE.MeshStandardMaterial({ color: 0x22180f, roughness: 0.9 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x2c1b10, roughness: 0.75 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.3 }),
  roll: new THREE.MeshStandardMaterial({ map: fabricTexture('#6f6a48', '30,30,15', 5), roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.4, metalness: 0.7 }),
});

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 12);
const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

export class Character {
  constructor() {
    const M = this.mats = mats();
    const root = this.root = new THREE.Group();
    const body = this.body = new THREE.Group(); // tilts for swimming
    root.add(body);
    const hips = this.hips = new THREE.Group();
    hips.position.y = 0.98;
    body.add(hips);

    // pelvis / shorts
    const pel = mesh(sph(1, 16, 12), M.shorts, 0, -0.02, 0, hips); pel.scale.set(0.185, 0.13, 0.13);
    const belt = mesh(new THREE.TorusGeometry(0.172, 0.028, 8, 24), M.leather, 0, 0.07, 0, hips);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.74, 1);
    mesh(new RoundedBoxGeometry(0.06, 0.05, 0.02, 2, 0.008), M.metal, 0, 0.07, 0.132, hips);
    // belt pouches
    for (const s of [-1, 1]) {
      const p = mesh(new RoundedBoxGeometry(0.08, 0.1, 0.06, 2, 0.015), M.leather, s * 0.17, 0.0, 0.03, hips);
      p.rotation.y = s * 0.5;
    }
    const knife = mesh(new RoundedBoxGeometry(0.035, 0.17, 0.03, 2, 0.01), M.leather, 0.12, -0.04, -0.1, hips);
    knife.rotation.z = 0.2;

    // spine
    const spine = this.spine = new THREE.Group();
    spine.position.y = 0.08;
    hips.add(spine);
    const torso = mesh(cap(0.16, 0.26), M.shirt, 0, 0.24, 0, spine); torso.scale.set(1.18, 1, 0.74);
    const chest = mesh(sph(1, 16, 12), M.shirt, 0, 0.36, 0.01, spine); chest.scale.set(0.215, 0.14, 0.135);
    // henley collar
    const collar = mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 16), M.shirt, 0, 0.5, 0.0, spine); collar.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.11, 10), M.skin, 0, 0.53, 0, spine);
    // straps (front)
    for (const s of [-1, 1]) {
      const st = mesh(new THREE.BoxGeometry(0.045, 0.36, 0.015), M.leather, s * 0.1, 0.33, 0.118, spine);
      st.rotation.z = s * -0.08; st.rotation.x = -0.08;
      const sh = mesh(new THREE.BoxGeometry(0.05, 0.02, 0.2), M.leather, s * 0.12, 0.5, 0.0, spine);
      sh.rotation.z = s * 0.25;
    }
    // backpack
    const pack = this.pack = new THREE.Group();
    pack.position.set(0, 0.3, -0.19);
    spine.add(pack);
    mesh(new RoundedBoxGeometry(0.34, 0.42, 0.18, 3, 0.05), M.pack, 0, 0, 0, pack);
    const flap = mesh(new RoundedBoxGeometry(0.35, 0.16, 0.2, 3, 0.04), M.leather, 0, 0.15, 0.005, pack); flap.rotation.x = 0.05;
    mesh(new RoundedBoxGeometry(0.22, 0.14, 0.07, 2, 0.03), M.pack, 0, -0.09, -0.11, pack);
    for (const s of [-1, 1]) mesh(new RoundedBoxGeometry(0.07, 0.2, 0.12, 2, 0.03), M.pack, s * 0.2, -0.06, 0, pack);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.03, 0.02, 0.21), M.metal, s * 0.08, 0.1, 0.0, pack);
    const roll = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.42, 12), M.roll, 0, 0.25, 0.0, pack); roll.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) { const b = mesh(new THREE.TorusGeometry(0.068, 0.01, 5, 12), M.leather, s * 0.12, 0.25, 0, pack); b.rotation.y = Math.PI / 2; }

    // head
    const head = this.head = new THREE.Group();
    head.position.y = 0.57;
    spine.add(head);
    const skull = mesh(sph(0.108, 18, 14), M.skin, 0, 0.1, 0, head); skull.scale.set(0.92, 1.1, 1);
    const jaw = mesh(sph(0.08, 14, 10), M.stubble, 0, 0.035, 0.022, head); jaw.scale.set(0.95, 0.8, 0.9);
    mesh(sph(0.018, 8, 6), M.skin, 0, 0.085, 0.105, head).scale.set(0.9, 1.2, 1);
    for (const s of [-1, 1]) {
      mesh(sph(0.012, 8, 6), M.eye, s * 0.036, 0.113, 0.093, head);
      const brow = mesh(new THREE.BoxGeometry(0.04, 0.011, 0.012), M.hair, s * 0.037, 0.135, 0.097, head); brow.rotation.z = s * -0.12;
      const ear = mesh(sph(0.025, 8, 6), M.skin, s * 0.1, 0.1, 0, head); ear.scale.set(0.45, 1, 0.8);
    }
    // messy hair
    const hairCap = mesh(new THREE.SphereGeometry(0.122, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), M.hair, 0, 0.118, -0.01, head);
    hairCap.scale.set(1.0, 1.02, 1.08); hairCap.rotation.x = -0.28;
    const back = mesh(sph(0.108, 14, 10), M.hair, 0, 0.09, -0.03, head); back.scale.set(0.97, 0.9, 0.92);
    const hr = mulberry32(3);
    for (let i = 0; i < 26; i++) {
      const a = hr() * Math.PI * 2, e = 0.2 + hr() * 1.2;
      const d = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      if (d.z > 0.35 && e < 1.0) continue; // keep the face clear
      const t = mesh(sph(0.026 + hr() * 0.012, 7, 5), M.hair, d.x * 0.118, 0.118 + d.y * 0.112, d.z * 0.118 - 0.012, head);
      t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
      t.scale.set(1.4, 1.1, 0.4);
    }
    const fringe = mesh(sph(0.05, 8, 6), M.hair, 0.025, 0.185, 0.075, head); fringe.scale.set(1.5, 0.45, 0.75); fringe.rotation.z = 0.35;

    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.215, 0.44, 0);
      spine.add(sh);
      mesh(sph(0.07, 12, 10), M.shirt, 0, -0.02, 0, sh).scale.set(1, 1, 0.95);
      mesh(cap(0.066, 0.08), M.shirt, 0, -0.08, 0, sh);
      mesh(cap(0.054, 0.2), M.skin, 0, -0.16, 0, sh);
      mesh(sph(1, 10, 8), M.skin, 0, -0.15, 0.018, sh).scale.set(0.05, 0.085, 0.048);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      mesh(cap(0.044, 0.19), M.skin, 0, -0.12, 0, el);
      mesh(sph(1, 10, 8), M.skin, 0, -0.07, 0.006, el).scale.set(0.05, 0.08, 0.048);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.045, 12), M.leather, 0, -0.2, 0, el);
      const hand = new THREE.Group(); hand.position.y = -0.27; el.add(hand);
      mesh(sph(1, 10, 8), M.skin, 0, -0.03, 0.005, hand).scale.set(0.038, 0.058, 0.03);
      mesh(sph(1, 8, 6), M.skin, s * -0.025, -0.02, 0.025, hand).scale.set(0.015, 0.03, 0.015);
      this.arms.push({ sh, el, hand, s });
    }
    this.armL = this.arms[0]; this.armR = this.arms[1];

    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.098, -0.04, 0); hips.add(hip);
      mesh(cap(0.087, 0.26), M.shorts, 0, -0.18, 0, hip);
      mesh(new RoundedBoxGeometry(0.05, 0.11, 0.09, 2, 0.015), M.shorts, s * 0.085, -0.2, 0.0, hip);
      const cuff = mesh(new THREE.CylinderGeometry(0.093, 0.09, 0.05, 14), M.shorts, 0, -0.34, 0, hip);
      const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
      mesh(cap(0.056, 0.27), M.skin, 0, -0.18, 0, knee);
      mesh(sph(1, 10, 8), M.skin, 0, -0.11, -0.018, knee).scale.set(0.064, 0.11, 0.062);
      mesh(sph(1, 8, 6), M.skin, 0, 0.0, 0.012, knee).scale.set(0.06, 0.06, 0.055);
      mesh(new THREE.CylinderGeometry(0.06, 0.058, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 1 }), 0, -0.3, 0, knee);
      const foot = new THREE.Group(); foot.position.y = -0.43; knee.add(foot);
      mesh(new THREE.CylinderGeometry(0.066, 0.07, 0.15, 12), M.boot, 0, 0.05, 0, foot);
      mesh(new RoundedBoxGeometry(0.115, 0.085, 0.25, 3, 0.035), M.boot, 0, -0.03, 0.045, foot);
      mesh(new RoundedBoxGeometry(0.12, 0.025, 0.26, 2, 0.01), M.sole, 0, -0.07, 0.045, foot);
      mesh(new THREE.TorusGeometry(0.068, 0.008, 5, 14), M.leather, 0, 0.1, 0, foot).rotation.x = Math.PI / 2;
      this.legs.push({ hip, knee, foot, s });
    }

    // merge static meshes per bone & material to keep draw calls low
    const groups = [];
    this.root.traverse((o) => { if (o.isGroup || o === this.root) groups.push(o); });
    for (const g of groups) mergeChildren(g);
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    // animation state
    this.phase = 0;
    this.action = null; // { type, t, dur, onImpact, impacted }
    this.heldItem = null;
    this.blend = { move: 0, run: 0, swim: 0, air: 0 };
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

    const breathe = Math.sin(t * 1.8) * 0.015;
    aL.sh.rotation.set(-sin * amp * 0.9, 0, -0.1 - (1 - mv) * 0.02);
    aR.sh.rotation.set(sin * amp * 0.9, 0, 0.1 + (1 - mv) * 0.02);
    aL.el.rotation.x = -(0.25 + B.run * 1.0 * mv); aR.el.rotation.x = -(0.25 + B.run * 1.0 * mv);
    this.spine.rotation.set(0.04 + B.run * 0.2 * mv + breathe, sin * 0.08 * mv, 0);
    this.hips.position.y = 0.98 - Math.abs(cos) * 0.035 * mv - B.run * 0.03 * mv;
    this.hips.rotation.set(0, -sin * 0.1 * mv, 0);
    this.head.rotation.set(-0.04 - B.run * 0.12 * mv, 0, 0);

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
      const moving = clamp(s.speed / 2, 0, 1);
      this.body.rotation.x = lerp(0, 1.2 * moving + 0.25, w);
      const sp = ph * 1.0;
      aL.sh.rotation.x = lerp(aL.sh.rotation.x, moving > 0.2 ? -Math.PI + ((sp % (Math.PI * 2)) - Math.PI) * 0.9 : Math.sin(t * 2) * 0.4 - 0.4, w);
      aR.sh.rotation.x = lerp(aR.sh.rotation.x, moving > 0.2 ? -Math.PI + (((sp + Math.PI) % (Math.PI * 2)) - Math.PI) * 0.9 : Math.sin(t * 2 + 1) * 0.4 - 0.4, w);
      aL.sh.rotation.z = lerp(aL.sh.rotation.z, moving > 0.2 ? -0.3 : -0.9, w); aR.sh.rotation.z = lerp(aR.sh.rotation.z, moving > 0.2 ? 0.3 : 0.9, w);
      aL.el.rotation.x = lerp(aL.el.rotation.x, -0.3, w); aR.el.rotation.x = lerp(aR.el.rotation.x, -0.3, w);
      const kick = Math.sin(t * 9) * 0.35 * (0.4 + moving);
      lL.hip.rotation.x = lerp(lL.hip.rotation.x, kick, w); lR.hip.rotation.x = lerp(lR.hip.rotation.x, -kick, w);
      lL.knee.rotation.x = lerp(lL.knee.rotation.x, 0.2, w); lR.knee.rotation.x = lerp(lR.knee.rotation.x, 0.2, w);
      this.head.rotation.x = lerp(this.head.rotation.x, -1.0 * moving, w);
      this.spine.rotation.x = lerp(this.spine.rotation.x, 0, w);
    } else {
      this.body.rotation.x = 0;
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
      } else if (A.type === 'drink') {
        const d = Math.sin(u * Math.PI);
        this.spine.rotation.x += 0.9 * d; this.hips.position.y -= 0.35 * d;
        lL.knee.rotation.x += 1.3 * d; lR.knee.rotation.x += 1.3 * d; lL.hip.rotation.x -= 0.8 * d; lR.hip.rotation.x -= 0.8 * d;
        aR.sh.rotation.x = -1.0 * d; aL.sh.rotation.x = -1.0 * d;
      }
      if (A.t >= A.dur) this.action = null;
    }
  }
}

function mergeChildren(group) {
  const byMat = new Map();
  for (const c of [...group.children]) {
    if (!c.isMesh) continue;
    c.updateMatrix();
    const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
    g.applyMatrix4(c.matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!byMat.has(c.material)) byMat.set(c.material, []);
    byMat.get(c.material).push(g);
    group.remove(c);
  }
  for (const [mat, gs] of byMat) {
    const m = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
}

const easeOut = (x) => 1 - (1 - x) * (1 - x);
const easeIn = (x) => x * x;
