// Set dressing: shipwreck debris at the start beach, the waterfall, and distant karst islands.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { materials } from './materials.js';
import { merge, setColor, noise3, archGeometry, boulderGeometry } from './models.js';
import { waterfallTexture, softDotTexture } from '../util/textures.js';
import { mulberry32 } from '../util/noise.js';

export class Props {
  constructor(scene, terrain, nature, world) {
    this.scene = scene;
    this.terrain = terrain;
    this.M = materials();
    this.world = world;
    this._wreck(nature);
    this._waterfall();
    this._landmarks(nature);
  }

  _wreck(nature) {
    const T = this.terrain, M = this.M, scene = this.scene;
    const sp = T.spawn;
    const g = new THREE.Group();
    scene.add(g);
    const place = (obj, x, z, lift = 0, ry = 0, tilt = 0) => {
      const y = Math.max(T.heightAt(x, z), -0.6);
      obj.position.set(x, y + lift, z);
      obj.rotation.set(tilt, ry, tilt * 0.5);
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.add(obj);
      return obj;
    };
    const crate = (s = 1) => {
      const c = new THREE.Group();
      const box = new THREE.Mesh(new RoundedBoxGeometry(0.9 * s, 0.7 * s, 0.7 * s, 2, 0.04), M.planks);
      c.add(box);
      for (const y of [-0.28, 0.28]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.94 * s, 0.08 * s, 0.74 * s), M.woodDark);
        b.position.y = y * s; c.add(b);
      }
      for (const x of [-0.4, 0.4]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.72 * s, 0.74 * s), M.woodDark);
        b.position.x = x * s; c.add(b);
      }
      return c;
    };
    const barrel = () => {
      const b = new THREE.Group();
      const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.9, 16, 6);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + 0.14 * (1 - (y / 0.45) ** 2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
      geo.computeVertexNormals();
      b.add(new THREE.Mesh(geo, M.wood));
      for (const y of [-0.3, 0.3]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.025, 6, 20), M.metal); r.rotation.x = Math.PI / 2; r.position.y = y; b.add(r); }
      return b;
    };
    // crates and barrel near spawn
    place(crate(1), sp.x + 3.2, sp.z + 1.5, 0.3, 0.4, 0.05);
    place(crate(0.8), sp.x + 4.1, sp.z + 2.4, 0.22, 1.1, -0.1);
    const br = barrel(); place(br, sp.x - 3, sp.z + 2.5, 0.2, 0, 1.45);
    nature.addCollider(sp.x + 3.4, sp.z + 1.8, 0.8, 5);
    // The raft that carried the player here, smashed in the surf: one half washed up on the sand,
    // loose logs strewn along the tide line, the snapped mast and torn sail lying in the sand.
    const r = mulberry32(5);
    const sandAt = (x, zFrom) => { let z = zFrom; while (z < zFrom + 40 && T.heightAt(x, z) > 0.55) z += 0.5; return z; };
    const logMesh = (L, rad, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.95, rad, L, 10), mat); m.rotation.z = Math.PI / 2; return m; };
    // half raft, beached & tilted
    const half = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const L = 2.2 + r() * 1.3;
      const log = logMesh(L, 0.16, i === 2 ? M.woodDark : M.wood);
      log.position.set((r() - 0.5) * 0.5 + (i === 3 ? 0.4 : 0), 0, i * 0.34 - 0.5);
      log.rotation.y = (r() - 0.5) * 0.12;
      half.add(log);
    }
    const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.7, 8), M.woodDark);
    cross.rotation.x = Math.PI / 2; cross.rotation.z = 0.12; cross.position.set(-0.6, 0.17, 0.1); half.add(cross);
    for (const x of [-0.6]) for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 5, 10), M.rope); b.position.set(x, 0.02, i * 0.34 - 0.5); half.add(b); }
    const hx = sp.x - 8, hz = sandAt(sp.x - 8, sp.z + 2) - 1.2;
    place(half, hx, hz, 0.05, 0.65, 0.12);
    // loose logs along the tide line
    for (let i = 0; i < 5; i++) {
      const lx = sp.x - 16 + i * 6 + (r() - 0.5) * 3;
      const lz = sandAt(lx, sp.z) - 2 - r() * 4;
      const log = logMesh(2.3 + r() * 1.4, 0.15, r() < 0.3 ? M.woodDark : M.wood);
      const g2 = new THREE.Group(); g2.add(log);
      place(g2, lx, lz, 0.06, r() * 3, (r() - 0.5) * 0.08);
    }
    // snapped mast with the torn sail draped over the sand
    const mastG = new THREE.Group();
    const mast = logMesh(3.4, 0.09, M.woodDark); mastG.add(mast);
    const stub = logMesh(0.6, 0.09, M.woodDark); stub.position.set(2.1, 0.05, 0.1); stub.rotation.z = Math.PI / 2 + 0.3; mastG.add(stub);
    const sailGeo = new THREE.PlaneGeometry(2.2, 1.8, 12, 10);
    const sp2 = sailGeo.attributes.position;
    for (let i = 0; i < sp2.count; i++) {
      const x = sp2.getX(i), y = sp2.getY(i);
      // lying flat, crumpled, one edge still wrapped round the mast
      sp2.setZ(i, Math.abs(noise3(x * 1.8, y * 1.8, 2)) * 0.25 + Math.max(0, 0.4 - (y + 0.9)) * 0.5);
      if (y > 0.3 && x > 0.4) sp2.setX(i, x - (y - 0.3) * 0.6); // torn corner
    }
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, M.canvas);
    sail.rotation.x = -Math.PI / 2; sail.position.set(-0.2, 0.02, 1.0);
    mastG.add(sail);
    const mx = sp.x + 6, mz = sandAt(sp.x + 6, sp.z) - 6;
    place(mastG, mx, mz, 0.08, -0.5, 0);
    nature.addCollider(hx, hz, 1.1, 3);
    // a crate still bobbing in the shallows
    const fc = crate(0.9);
    const fz = sandAt(sp.x - 2, sp.z) + 7;
    fc.position.set(sp.x - 2, 0.05, fz);
    fc.rotation.set(0.1, 0.8, 0.05);
    fc.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(fc);
    this.floating = [{ obj: fc, base: 0.05, ph: 0 }];
  }

  _waterfall() {
    const T = this.terrain, P = T.pond, scene = this.scene;
    const M = T.mountain;
    let dx = M.x - P.x, dz = M.z - P.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    const topD = P.r + 3 + 5.5;
    const tx = P.x + dx * topD, tz = P.z + dz * topD;
    const topY = T.heightAt(tx, tz) + 0.4;
    const planeD = P.r + 1.6;
    const bx = P.x + dx * (P.r - 1), bz = P.z + dz * (P.r - 1);
    const H = topY - P.y + 0.3;
    const back = topD - planeD;
    const tex = waterfallTexture();
    tex.repeat.set(1, 2);
    this.wfTex = tex;
    const geo = new THREE.PlaneGeometry(4.2, H, 6, 24);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); const t = (y + H / 2) / H; // 0 bottom 1 top
      // falls straight, then bends back over the lip of the cliff
      const lip = Math.max(0, (t - 0.82) / 0.18);
      p.setZ(i, -back * lip * lip + (1 - t) * 0.5 + Math.sin(p.getX(i) * 3 + y) * 0.08);
      p.setY(i, y - lip * lip * 0.6);
      p.setX(i, p.getX(i) * (1 + (1 - t) * 0.3));
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.92, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide, emissive: 0x99c8d8, emissiveIntensity: 0.25 });
    const wf = new THREE.Mesh(geo, mat);
    const midD = planeD;
    wf.position.set(P.x + dx * midD, P.y - 0.3 + H / 2, P.z + dz * midD);
    wf.rotation.y = Math.atan2(-dx, -dz);
    wf.renderOrder = 2;
    scene.add(wf);
    this.waterfall = wf;
    // mist
    this.mist = [];
    const mm = new THREE.SpriteMaterial({ map: softDotTexture(), transparent: true, opacity: 0.45, depthWrite: false, color: 0xffffff });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(mm.clone());
      s.userData = { ph: Math.random() * 6, bx, bz };
      scene.add(s);
      this.mist.push(s);
    }
    this.wfBase = new THREE.Vector3(bx, P.y, bz);
    this.waterfallPos = new THREE.Vector3(P.x + dx * midD, P.y + H / 2, P.z + dz * midD);
  }

  _landmarks(nature) {
    const T = this.terrain, M = this.M, scene = this.scene;
    const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
    // sea arch off the east peninsula: visible across the bay from the start beach and the lookout
    const A = T.arch;
    const arch = archGeometry(3);
    const rockMat = M.scanRock || M.rock;
    const am = shadowy(new THREE.Mesh(arch.rock, rockMat));
    const ag = shadowy(new THREE.Mesh(arch.green, M.canopy));
    for (const m of [am, ag]) { m.position.set(A.x, 0, A.z); m.rotation.y = A.rot; scene.add(m); }
    for (const s of [-1, 1]) {
      const lx = A.x + Math.cos(A.rot) * s * 23, lz = A.z - Math.sin(A.rot) * s * 23;
      nature.addCollider(lx, lz, 9);
    }
    this.archMesh = am;

    // cave mouth in the main mountain's cliff (sealed for now; future exploration)
    const cv = T.cave;
    const side = new THREE.Vector3(-cv.az, 0, cv.ax);
    const floorY = T.heightAt(cv.x + cv.ax * 3, cv.z + cv.az * 3);
    // find the cliff face just behind the notch: base point and the up-along-the-wall direction
    const wallAt = (dy) => { for (let d = 4; d > -20; d -= 0.25) if (T.heightAt(cv.x + cv.ax * d, cv.z + cv.az * d) > floorY + dy) return d; return -20; };
    const d0 = wallAt(0.4), d1 = wallAt(6.4);
    const base = new THREE.Vector3(cv.x + cv.ax * d0, floorY + 0.4, cv.z + cv.az * d0);
    const up = new THREE.Vector3(cv.ax * (d1 - d0), 6, cv.az * (d1 - d0)).normalize();
    const outN = new THREE.Vector3().crossVectors(side, up).normalize();
    if (outN.x * cv.ax + outN.z * cv.az < 0) outN.negate();
    base.addScaledVector(outN, 0.25);
    // dark opening with a soft rim (vertex-coloured half ellipse lying on the wall)
    const W = 2.9, Hh = 4.2, SEG = 18;
    const pos = [base.x - up.x * 0.6, base.y - up.y * 0.6, base.z - up.z * 0.6], col = [0.01, 0.01, 0.01], idx = [];
    for (let ring = 1; ring <= 2; ring++) {
      const k = ring === 1 ? 0.78 : 1;
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI;
        const v = base.clone().addScaledVector(side, Math.cos(a) * W * k).addScaledVector(up, Math.sin(a) * Hh * k - 0.6 * (1 - Math.sin(a)));
        pos.push(v.x, v.y, v.z);
        const c = ring === 1 ? 0.02 : 0.1;
        col.push(c, c * 0.9, c * 0.8);
      }
    }
    for (let i = 0; i < SEG; i++) { idx.push(0, 1 + i, 2 + i); const a = 1 + i, b2 = 1 + SEG + 1 + i; idx.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    hg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    hg.setIndex(idx);
    const hole = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }));
    scene.add(hole);
    // chunky rock frame and rubble around the opening
    const frame = [];
    for (let k = 0; k < 13; k++) {
      const a = (k / 12) * Math.PI;
      const g = boulderGeometry(900 + k, { detail: 10, rough: 0.35, moss: 0.5, tint: [0.46, 0.43, 0.39] });
      const s = 0.9 + (k % 3) * 0.35;
      g.scale(s * 1.2, s, s);
      const p = base.clone().addScaledVector(side, Math.cos(a) * (W + 0.7)).addScaledVector(up, Math.sin(a) * (Hh + 0.6)).addScaledVector(outN, 0.4);
      g.translate(p.x, p.y, p.z);
      frame.push(g);
    }
    for (let k = 0; k < 5; k++) {
      const g = boulderGeometry(930 + k, { detail: 9, rough: 0.3, moss: 0.2, tint: [0.5, 0.47, 0.43] });
      const s = 0.4 + k * 0.12;
      g.scale(s, s * 0.7, s);
      const p = base.clone().addScaledVector(side, (k - 2) * 1.6).addScaledVector(outN, 1.5 + (k % 2) * 1.2);
      g.translate(p.x, floorY, p.z);
      frame.push(g);
    }
    scene.add(shadowy(new THREE.Mesh(merge(frame), M.scanRock || M.rock)));
    this.caveMouth = base;

    // stone cairn marking the lookout plateau
    const L = T.lookout, ly = T.heightAt(L.x, L.z);
    const cairn = [];
    let y = ly;
    for (let k = 0; k < 5; k++) {
      const s = 0.55 - k * 0.08;
      const g = boulderGeometry(950 + k, { detail: 9, rough: 0.2, flat: 0.5, moss: 0.2, tint: [0.62, 0.6, 0.56] });
      g.scale(s * 1.3, s * 0.8, s * 1.2);
      g.rotateY(k * 1.3);
      g.translate(L.x + (k % 2 ? 0.08 : -0.06), y + s * 0.5, L.z);
      y += s * 0.95;
      cairn.push(g);
    }
    scene.add(shadowy(new THREE.Mesh(merge(cairn), M.scanRock || M.rock)));
    nature.addCollider(L.x, L.z, 0.7, ly + 3);
  }

  update(dt, time) {
    if (this.wfTex) this.wfTex.offset.y += dt * 1.4;
    for (const f of this.floating) {
      f.obj.position.y = f.base + Math.sin(time * 1.2 + f.ph) * 0.06;
      f.obj.rotation.z = Math.sin(time * 0.9 + f.ph) * 0.04;
    }
    for (const s of this.mist) {
      const u = s.userData;
      u.ph += dt * 0.5;
      const k = u.ph % 1;
      s.position.set(this.wfBase.x + Math.sin(u.ph * 7) * 2, this.wfBase.y + 0.3 + k * 3, this.wfBase.z + Math.cos(u.ph * 5) * 2);
      s.scale.setScalar(1.5 + k * 3.5);
      s.material.opacity = 0.35 * (1 - k);
    }
  }
}
