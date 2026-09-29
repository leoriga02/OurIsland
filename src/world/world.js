// World facade: ground/water queries and collision resolution shared by all actors.
export class World {
  constructor(terrain, nature) {
    this.terrain = terrain;
    this.nature = nature;
    this.platforms = []; // { minX, maxX, minZ, maxZ, top }
    this.walls = [];     // { ax, az, bx, bz, bottom, top, t }
    this.circles = [];   // extra dynamic circles { x, z, r, h }
  }

  waterLevel(x, z) {
    return this.terrain.isInPond(x, z, 1.5) ? this.terrain.pond.y : 0;
  }

  groundHeight(x, z, fromY = 999) {
    let h = this.terrain.heightAt(x, z);
    for (const p of this.platforms) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && p.top <= fromY + 0.65 && p.top > h) h = p.top;
    }
    return h;
  }

  resolveCollisions(pos, r) {
    const cs = this.nature.colliders.query(pos.x, pos.z, 12);
    for (const c of cs) this._circle(pos, r, c);
    for (const c of this.circles) this._circle(pos, r, c);
    for (const w of this.walls) {
      if (pos.y > w.top - 0.1 || pos.y + 1.7 < w.bottom) continue;
      const vx = w.bx - w.ax, vz = w.bz - w.az;
      const L2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((pos.x - w.ax) * vx + (pos.z - w.az) * vz) / L2));
      const px = w.ax + vx * t, pz = w.az + vz * t;
      const dx = pos.x - px, dz = pos.z - pz;
      const d = Math.hypot(dx, dz);
      const min = r + w.t;
      if (d < min && d > 1e-5) { pos.x = px + dx / d * min; pos.z = pz + dz / d * min; }
    }
  }

  _circle(pos, r, c) {
    if (c.active === false || pos.y > c.h) return;
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + r;
    if (d < min && d > 1e-5) { pos.x = c.x + dx / d * min; pos.z = c.z + dz / d * min; }
  }
}
