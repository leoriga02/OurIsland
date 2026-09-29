// Beach crabs: scuttle around the sand, flee from the player, can be caught for food.
import * as THREE from 'three';
import { itemGeometry, itemMaterial } from '../game/items.js';
import { angleDamp } from '../util/noise.js';

export class Crabs {
  constructor(scene, terrain, count = 14) {
    this.scene = scene;
    this.terrain = terrain;
    this.list = [];
    this.geo = itemGeometry('crab_raw');
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.geo, itemMaterial);
      m.scale.setScalar(1.6);
      m.castShadow = true;
      scene.add(m);
      const crab = { mesh: m, x: 0, z: 0, y: 0, dir: Math.random() * 6, t: 0, hp: 2, alive: true, kind: 'crab', r: 0.4, label: 'Crab', speed: 0 };
      this.place(crab, i === 0);
      this.list.push(crab);
    }
  }

  place(crab, nearSpawn = false) {
    const T = this.terrain;
    for (let k = 0; k < 200; k++) {
      let x, z;
      if (nearSpawn) { x = T.spawn.x + (Math.random() - 0.5) * 30; z = T.spawn.z + (Math.random() - 0.2) * 12; }
      else { const a = Math.random() * Math.PI * 2; const r = T.coastR(Math.cos(a) * 150, Math.sin(a) * 150) - 4 - Math.random() * 8; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      const h = T.heightAt(x, z);
      if (h > 0.25 && h < 1.6) { crab.x = x; crab.z = z; crab.y = h; crab.alive = true; crab.hp = 2; crab.mesh.visible = true; return; }
    }
  }

  update(dt, player, time) {
    const T = this.terrain;
    for (const c of this.list) {
      if (!c.alive) {
        if (time > c.respawnAt) this.place(c);
        continue;
      }
      c.t -= dt;
      const dx = c.x - player.pos.x, dz = c.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      let want = c.speed;
      if (d < 3.5) { c.dir = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.6; want = 3.2; c.t = 1; }
      else if (c.t <= 0) { c.t = 1 + Math.random() * 3; c.dir += (Math.random() - 0.5) * 2.5; want = Math.random() < 0.5 ? 0 : 1.1; }
      c.speed += (want - c.speed) * Math.min(1, dt * 6);
      // crabs walk sideways
      const nx = c.x + Math.sin(c.dir) * c.speed * dt, nz = c.z + Math.cos(c.dir) * c.speed * dt;
      const h = T.heightAt(nx, nz);
      if (h > 0.15 && h < 2.2) { c.x = nx; c.z = nz; c.y = h; } else { c.dir += Math.PI * 0.7; }
      c.mesh.position.set(c.x, c.y + 0.1 + Math.abs(Math.sin(time * 18)) * 0.02 * c.speed, c.z);
      c.mesh.rotation.y = angleDamp(c.mesh.rotation.y, c.dir + Math.PI / 2, 8, dt);
      c.mesh.rotation.z = Math.sin(time * 20) * 0.05 * c.speed;
    }
  }

  kill(c, time) {
    c.alive = false;
    c.mesh.visible = false;
    c.respawnAt = time + 90;
  }
}
