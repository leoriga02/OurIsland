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

const mats = (f) => ({
  skin: new THREE.MeshStandardMaterial({ color: 0xb98263, roughness: 0.55 }),
  stubble: new THREE.MeshStandardMaterial({ color: 0x80563c, roughness: 0.8 }),
  shirt: new THREE.MeshStandardMaterial({ color: f ? 0x4d4a46 : 0xcdb994, roughness: 0.95 }),
  shorts: new THREE.MeshStandardMaterial({ color: f ? 0x56606a : 0x534a3c, roughness: 0.95 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.75 }),
  pack: new THREE.MeshStandardMaterial({ color: 0x6b5034, roughness: 0.85 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x4e3320, roughness: 0.7 }),
  sole: new THREE.MeshStandardMaterial({ color: 0x22180f, roughness: 0.9 }),
  hair: new THREE.MeshStandardMaterial({ color: f ? 0x4a2a16 : 0x2c1b10, roughness: 0.75 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.3 }),
  roll: new THREE.MeshStandardMaterial({ color: 0x6f6a48, roughness: 0.95 }),
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
  // variant: 'm' (castaway in henley & cargo shorts) or 'f' (ponytail, crop tank, denim cutoffs)
  constructor(variant = 'm') {
    const F = variant === 'f';
    this.variant = variant;
    const M = this.mats = mats(F);
    for (const k of ['skin', 'stubble', 'hair', 'eye']) M[k].userData.smooth = true;
    const root = this.root = new THREE.Group();
    const body = this.body = new THREE.Group(); // tilts for swimming
    root.add(body);
    const hips = this.hips = new THREE.Group();
    hips.position.y = 0.98;
    body.add(hips);

    // pelvis / shorts
    const pel = mesh(sph(1, 16, 12), M.shorts, 0, -0.02, 0, hips); pel.scale.set(F ? 0.18 : 0.185, 0.13, F ? 0.125 : 0.13);
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
    if (F) {
      // bare midriff, crop tank top
      mesh(cap(0.135, 0.22), M.skin, 0, 0.2, 0, spine).scale.set(1.1, 1, 0.72);
      const top = mesh(cap(0.142, 0.14), M.shirt, 0, 0.36, 0, spine); top.scale.set(1.12, 1, 0.76);
      const bust = mesh(sph(1, 16, 12), M.shirt, 0, 0.37, 0.03, spine); bust.scale.set(0.17, 0.1, 0.12);
      for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.03, 0.12, 0.02), M.shirt, s * 0.09, 0.47, 0.04, spine);
    } else {
      const torso = mesh(cap(0.16, 0.26), M.shirt, 0, 0.24, 0, spine); torso.scale.set(1.18, 1, 0.74);
      const chest = mesh(sph(1, 16, 12), M.shirt, 0, 0.36, 0.01, spine); chest.scale.set(0.215, 0.14, 0.135);
      // henley collar
      const collar = mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 16), M.shirt, 0, 0.5, 0.0, spine); collar.rotation.x = Math.PI / 2;
    }
    // pendant necklace
    const neck = mesh(new THREE.TorusGeometry(0.06, 0.005, 4, 16, Math.PI), M.leather, 0, 0.5, 0.045, spine); neck.rotation.set(Math.PI * 0.62, 0, Math.PI);
    mesh(sph(0.012, 6, 5), M.metal, 0, 0.445, 0.085, spine);
    mesh(new THREE.CylinderGeometry(F ? 0.045 : 0.052, 0.058, 0.11, 10), M.skin, 0, 0.53, 0, spine);
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
    const skull = mesh(sph(0.108, 18, 14), M.skin, 0, 0.1, 0, head); skull.scale.set(F ? 0.88 : 0.92, 1.1, 1);
    const jaw = mesh(sph(0.08, 14, 10), F ? M.skin : M.stubble, 0, 0.035, 0.022, head); jaw.scale.set(F ? 0.82 : 0.95, 0.8, 0.9);
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
    if (F) {
      // ponytail + loose strands framing the face
      const tie = mesh(new THREE.TorusGeometry(0.025, 0.009, 5, 10), M.leather, 0, 0.16, -0.125, head); tie.rotation.x = 0.4;
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const pt = mesh(sph(0.045 - t * 0.022, 8, 6), M.hair, Math.sin(t * 2) * 0.012, 0.15 - t * 0.2, -0.14 - Math.sin(t * 1.4) * 0.05, head);
        pt.scale.set(1, 1.5, 0.9);
      }
      for (const s of [-1, 1]) { const st = mesh(sph(0.03, 7, 5), M.hair, s * 0.085, 0.07, 0.07, head); st.scale.set(0.35, 1.9, 0.5); st.rotation.z = s * 0.15; }
    }

    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * (F ? 0.19 : 0.215), 0.44, 0);
      spine.add(sh);
      mesh(sph(F ? 0.058 : 0.07, 12, 10), F ? M.skin : M.shirt, 0, -0.02, 0, sh).scale.set(1, 1, 0.95);
      if (!F) mesh(cap(0.066, 0.08), M.shirt, 0, -0.08, 0, sh);
      mesh(cap(F ? 0.046 : 0.054, 0.2), M.skin, 0, -0.16, 0, sh);
      mesh(sph(1, 10, 8), M.skin, 0, -0.15, 0.018, sh).scale.set(0.05, 0.085, 0.048);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      mesh(cap(0.044, 0.19), M.skin, 0, -0.12, 0, el);
      mesh(sph(1, 10, 8), M.skin, 0, -0.07, 0.006, el).scale.set(0.05, 0.08, 0.048);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.045, 12), M.leather, 0, -0.2, 0, el);
      if (s > 0) mesh(new RoundedBoxGeometry(0.04, 0.012, 0.04, 2, 0.005), M.metal, 0, -0.2, 0.048, el); // wristwatch
      const hand = new THREE.Group(); hand.position.y = -0.27; el.add(hand);
      mesh(sph(1, 10, 8), M.skin, 0, -0.03, 0.005, hand).scale.set(0.038, 0.058, 0.03);
      mesh(sph(1, 8, 6), M.skin, s * -0.025, -0.02, 0.025, hand).scale.set(0.015, 0.03, 0.015);
      this.arms.push({ sh, el, hand, s });
    }
    this.armL = this.arms[0]; this.armR = this.arms[1];

    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * (F ? 0.09 : 0.098), -0.04, 0); hips.add(hip);
      if (F) {
        mesh(cap(0.083, 0.26), M.skin, 0, -0.2, 0, hip);
        mesh(cap(0.088, 0.06), M.shorts, 0, -0.07, 0, hip);
        mesh(new THREE.CylinderGeometry(0.09, 0.094, 0.035, 14), M.shorts, 0, -0.13, 0, hip);
        if (s > 0) mesh(new THREE.TorusGeometry(0.086, 0.012, 5, 14), M.leather, 0, -0.2, 0, hip).rotation.x = Math.PI / 2; // thigh strap
      } else {
        mesh(cap(0.087, 0.26), M.shorts, 0, -0.18, 0, hip);
        mesh(new RoundedBoxGeometry(0.05, 0.11, 0.09, 2, 0.015), M.shorts, s * 0.085, -0.2, 0.0, hip);
        mesh(new THREE.CylinderGeometry(0.093, 0.09, 0.05, 14), M.shorts, 0, -0.34, 0, hip);
      }
      const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
      mesh(cap(F ? 0.05 : 0.056, 0.27), M.skin, 0, -0.18, 0, knee);
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
    if (F) this.root.scale.setScalar(0.95);

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
  }
}

// One shared material: per-part colours live in vertex colours, a light fabric texture adds grain.
let CHAR_MAT = null, SKIN_MAT = null;
function charMaterial(smooth) {
  if (!CHAR_MAT) {
    CHAR_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, map: fabricTexture('#ffffff', '40,30,20', 9), roughness: 0.85 });
    SKIN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  }
  return smooth ? SKIN_MAT : CHAR_MAT;
}

// Merge every mesh directly under a bone into a single draw call.
function mergeChildren(group) {
  const sets = [[], []]; // [cloth, skin/hair]
  for (const c of [...group.children]) {
    if (!c.isMesh) continue;
    c.updateMatrix();
    const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
    g.applyMatrix4(c.matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const col = c.material.color;
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r * 1.08; a[i * 3 + 1] = col.g * 1.08; a[i * 3 + 2] = col.b * 1.08; }
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
