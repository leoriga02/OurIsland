// Fishing: one-button and mobile friendly. Cast with the rod towards water, wait for the float to dip, press again to pull.
// Uses the shared aim (first or third person) and the normal action button.
import * as THREE from 'three';

// what bites where; weights per water type, deep sea favours the big catch
const CATCH = {
  sea: [['fish_mackerel', 45], ['fish_bream', 35], ['fish_grouper', 8], ['bottle', 6]],
  pond: [['fish_tilapia', 92], ['bottle', 8]],
};

export class Fishing {
  constructor(game) {
    this.g = game;
    this.state = 'idle'; // idle | cast | wait | bite
    this.t = 0;
    const s = game.scene;
    this.bobber = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8382a, roughness: 0.5 }));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.5 }));
    this.bobber.add(cap);
    this.bobber.visible = false;
    s.add(this.bobber);
    this.lineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: 0xe8e4d8, transparent: true, opacity: 0.7 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    s.add(this.line);
  }

  get active() { return this.state !== 'idle'; }

  // first water spot 3–8 m ahead along the aim
  findWater() {
    const g = this.g, P = g.player, T = g.terrain, f = g.aimForward();
    for (let d = 3; d <= 8; d += 0.5) {
      const x = P.pos.x + f.x * d, z = P.pos.z + f.z * d;
      if (T.isInPond(x, z, -0.8)) return { x, z, y: T.pond.y, kind: 'pond', depth: 1 };
      const h = T.heightAt(x, z);
      if (h < -0.35) return { x, z, y: 0, kind: 'sea', depth: -h };
    }
    return null;
  }

  describe() {
    if (this.state === 'bite') return { label: 'Tira!', icon: 'item:fishing_rod', ready: true, name: 'Ha abboccato!' };
    if (this.state === 'wait' || this.state === 'cast') return { label: 'Recupera', icon: 'item:fishing_rod', ready: true, name: 'In attesa che abbocchi…' };
    const w = this.findWater();
    return w ? { label: 'Lancia', icon: 'item:fishing_rod', ready: true, name: w.kind === 'pond' ? 'Laghetto' : 'Mare' } : { label: 'Serve acqua', icon: 'item:fishing_rod', ready: false, name: 'Avvicinati all’acqua' };
  }

  action() {
    const g = this.g, P = g.player;
    if (this.state === 'idle') {
      const w = this.findWater();
      if (!w) { g.ui.toast('fishing_rod', 'Avvicinati all’acqua per pescare', true); g.audio.error(); return; }
      this.spot = w; this.origin = P.pos.clone();
      P.facing = Math.atan2(w.x - P.pos.x, w.z - P.pos.z);
      P.char.play('chop', 0.5);
      g.audio.swing();
      this.state = 'cast'; this.t = 0.45;
      return;
    }
    if (this.state === 'bite') { this.catch(); return; }
    this.reset('Lenza recuperata');
  }

  catch() {
    const g = this.g, w = this.spot;
    const table = CATCH[w.kind].map(([id, wt]) => [id, id === 'fish_grouper' ? wt * (w.depth > 3 ? 2 : 0.5) : wt]);
    let r = Math.random() * table.reduce((a, [, wt]) => a + wt, 0), id = table[0][0];
    for (const [k, wt] of table) { r -= wt; if (r <= 0) { id = k; break; } }
    g.player.char.play('gather', 0.6);
    g.fx.burst('splash', this.bobber.position.clone(), 12);
    g.audio.splash();
    g.give(id, 1, false, this.bobber.position.clone());
    if (id === 'fish_grouper' || id === 'bottle') g.ui.center(id === 'bottle' ? 'Una bottiglia!' : 'Che cernia!', id === 'bottle' ? 'Aprila dalla barra rapida' : 'Una preda rara', 2000);
    g.progress.fished = (g.progress.fished || 0) + 1;
    g.checkQuest();
    this.reset();
  }

  reset(msg) {
    if (msg && this.state !== 'idle') this.g.ui.toast('fishing_rod', msg);
    this.state = 'idle';
    this.bobber.visible = false;
    this.line.visible = false;
  }

  update(dt) {
    const g = this.g, P = g.player;
    if (this.state === 'idle') return;
    // walking away, swimming or putting the rod away breaks the line
    if (g.heldTool() !== 'fishing_rod' || P.swimming || g.dead || P.pos.distanceTo(this.origin) > 2.5) { this.reset('La lenza si è staccata'); return; }
    this.t -= dt;
    const w = this.spot, b = this.bobber;
    if (this.state === 'cast') {
      const k = 1 - Math.max(0, this.t) / 0.45;
      b.visible = true;
      b.position.set(P.pos.x + (w.x - P.pos.x) * k, w.y + 0.05 + Math.sin(k * Math.PI) * 1.6, P.pos.z + (w.z - P.pos.z) * k);
      if (this.t <= 0) { this.state = 'wait'; this.t = 3 + Math.random() * 6; g.fx.burst('splash', b.position.clone(), 5); }
    } else if (this.state === 'wait') {
      b.position.set(w.x, w.y + 0.03 + Math.sin(performance.now() / 500) * 0.015, w.z);
      if (this.t <= 0) { this.state = 'bite'; this.t = 1.4; g.audio.splash(); g.fx.burst('splash', b.position.clone(), 6); g.rig.shake(0.02, 0.15); }
    } else if (this.state === 'bite') {
      b.position.set(w.x, w.y - 0.08 + Math.sin(performance.now() / 70) * 0.03, w.z);
      if (this.t <= 0) { this.reset('È scappato!'); return; }
    }
    // line from the rod tip to the float
    const tip = new THREE.Vector3();
    if (g.rig.firstPerson) tip.set(0.35, -0.05, -1.2).applyMatrix4(g.camera.matrixWorld);
    else tip.copy(P.pos).add(new THREE.Vector3(0, 1.9, 0)).addScaledVector(P.forward, 0.9);
    const a = this.lineGeo.attributes.position;
    a.setXYZ(0, tip.x, tip.y, tip.z); a.setXYZ(1, b.position.x, b.position.y + 0.05, b.position.z);
    a.needsUpdate = true;
    this.line.visible = true;
  }
}
