// Set dressing: shipwreck debris at the start beach, the waterfall, and distant karst islands.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { materials } from './materials.js';
import { spireGeometry, merge, setColor, noise3 } from './models.js';
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
    // broken raft in the shallows
    const raft = new THREE.Group();
    const r = mulberry32(5);
    for (let i = 0; i < 7; i++) {
      const L = 3.4 + r() * 0.8;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, L, 10), i === 5 ? M.woodDark : M.wood);
      log.rotation.z = Math.PI / 2; log.rotation.y = (r() - 0.5) * 0.1;
      log.position.set((r() - 0.5) * 0.4, 0, i * 0.34 - 1.1);
      raft.add(log);
    }
    for (const x of [-1.2, 0, 1.2]) {
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), M.woodDark);
      cross.rotation.x = Math.PI / 2; cross.position.set(x, 0.17, 0); raft.add(cross);
    }
    // broken mast with torn sail
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 8), M.woodDark);
    mast.position.set(0.3, 1.4, 0.2); mast.rotation.z = 0.5; raft.add(mast);
    const sailGeo = new THREE.PlaneGeometry(1.8, 1.6, 10, 10);
    const sp2 = sailGeo.attributes.position;
    for (let i = 0; i < sp2.count; i++) {
      const x = sp2.getX(i), y = sp2.getY(i);
      sp2.setZ(i, Math.sin(x * 2) * 0.15 + noise3(x * 2, y * 2, 0) * 0.12);
      if (y < -0.3 && x > 0.2) sp2.setY(i, y + (x - 0.2) * 0.5); // torn corner
    }
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, M.canvas);
    sail.position.set(-0.6, 1.6, 0.25); sail.rotation.set(0.1, 0.3, 0.5);
    raft.add(sail);
    const wx = T.wreck.x, wz = T.wreck.z;
    raft.position.set(wx, Math.max(T.heightAt(wx, wz), -0.5) + 0.1, wz);
    raft.rotation.set(0.08, 0.7, -0.05);
    raft.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(raft);
    // floating crate
    const fc = crate(0.9);
    fc.position.set(wx + 5, 0.05, wz + 3);
    fc.rotation.set(0.1, 0.8, 0.05);
    fc.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(fc);
    this.floating = [{ obj: fc, base: 0.05, ph: 0 }, { obj: raft, base: raft.position.y, ph: 1.3 }];
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
