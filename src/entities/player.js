// Third-person player controller and camera rig.
import * as THREE from 'three';
import { Character } from './character.js';
import { damp, angleDamp, clamp, lerp } from '../util/noise.js';

const _nrm = new THREE.Vector3();

export class Player {
  constructor(scene, world, variant = 'm') {
    this.world = world;
    this.char = new Character(variant);
    scene.add(this.char.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = Math.PI; // facing -z (north)
    this.grounded = true;
    this.swimming = false;
    this.radius = 0.34;
    this.speed = 0;
    this.running = false;
    this.lastPhase = 0;
    this.airTime = 0;
    this.frozen = false;
  }

  teleport(x, z, facing = this.facing) {
    const g = this.world.groundHeight(x, z, 999);
    this.pos.set(x, Math.max(g, this.world.waterLevel(x, z) - 1.0), z);
    this.vel.set(0, 0, 0);
    this.facing = facing;
  }

  get forward() { return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)); }

  update(dt, intent, camYaw) {
    const W = this.world;
    const busy = this.char.busy && this.char.action.type !== 'eat';
    let mx = intent.x, my = intent.y;
    if (this.frozen) { mx = 0; my = 0; }
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = fx * my + rx * mx, dz = fz * my + rz * mx;
    const mag = Math.min(1, Math.hypot(dx, dz));
    if (mag > 0.01) { const l = Math.hypot(dx, dz); dx /= l; dz /= l; }

    const terrainH = W.terrain.heightAt(this.pos.x, this.pos.z);
    const waterY = W.waterLevel(this.pos.x, this.pos.z);
    const depth = waterY - terrainH;
    const groundH = W.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    const floorAboveWater = groundH > waterY - 1.2;
    // hysteresis: start swimming at chest depth, stop once the feet touch bottom
    this.swimming = !floorAboveWater && (this.swimming ? depth > 1.2 : depth > 1.4);
    if (this.swimming !== this._wasSwimming) { this._wasSwimming = this.swimming; this.onWaterChange?.(this.swimming); }

    this.running = intent.sprint && mag > 0.3 && !this.swimming;
    let maxSpeed = this.swimming ? (intent.sprint ? 4.0 : 2.9) : this.running ? 7.4 : 4.4;
    if (busy) maxSpeed *= 0.15;
    const wantX = dx * maxSpeed * mag, wantZ = dz * maxSpeed * mag;
    const accel = this.grounded || this.swimming ? 12 : 3;
    this.vel.x = damp(this.vel.x, wantX, accel, dt);
    this.vel.z = damp(this.vel.z, wantZ, accel, dt);

    if (mag > 0.05 && !busy) this.facing = angleDamp(this.facing, Math.atan2(dx, dz), 12, dt);

    // vertical
    if (this.swimming) {
      // float with the chest at the surface (head well above), gently bobbing
      const targetY = waterY - (this.speed > 1 ? 1.32 : 1.24) + Math.sin(performance.now() / 700) * 0.03;
      this.vel.y = damp(this.vel.y, (targetY - this.pos.y) * 5, 8, dt);
      this.grounded = false;
    } else {
      if (this.grounded && intent.jump && !busy && !this.onSteep) {
        this.vel.y = 7.2; this.grounded = false;
        this.onJump?.();
      }
      this.vel.y -= 22 * dt;
    }

    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    // too steep to walk up (cliffs, karst towers): slide along or stop
    // cliffs: probe the terrain a little ahead; anything steeper than ~48 degrees blocks the way
    // (building platforms are excluded, they have their own step-up logic)
    const T = W.terrain, px = this.pos.x, pz = this.pos.z;
    const ref = this.swimming ? Math.max(T.heightAt(px, pz), waterY - 1.1) : Math.max(T.heightAt(px, pz), this.pos.y);
    const PROBE = 0.7;
    const steepDir = (ux, uz) => {
      const l = Math.hypot(ux, uz);
      if (l < 1e-5) return false;
      return T.heightAt(px + (ux / l) * PROBE, pz + (uz / l) * PROBE) - ref > PROBE * 1.1;
    };
    const mvx = nx - px, mvz = nz - pz;
    if (steepDir(mvx, mvz)) {
      if (Math.abs(mvx) > 1e-4 && !steepDir(mvx, 0)) { this.pos.x = nx; this.vel.z = 0; }
      else if (Math.abs(mvz) > 1e-4 && !steepDir(0, mvz)) { this.pos.z = nz; this.vel.x = 0; }
      else { this.vel.x = 0; this.vel.z = 0; }
    } else { this.pos.x = nx; this.pos.z = nz; }
    // standing on a cliff face (e.g. after a jump): slide back down, no climbing by hopping
    this.onSteep = false;
    if (this.grounded && !this.swimming && this.pos.y - T.heightAt(this.pos.x, this.pos.z) < 0.1) {
      const n = T.normalAt(this.pos.x, this.pos.z, _nrm);
      if (n.y < 0.64) { this.onSteep = true; this.vel.x += n.x * 24 * dt; this.vel.z += n.z * 24 * dt; }
    }
    this.pos.y += this.vel.y * dt;
    W.resolveCollisions(this.pos, this.radius);

    // keep inside the play area
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > 470) { this.pos.x *= 470 / r; this.pos.z *= 470 / r; }

    const g = W.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    if (!this.swimming) {
      if (this.pos.y < g - 0.35 && g - this.pos.y < 2.0 && this.vel.y <= 0.5) {
        // hoist up onto a raised floor (foundations on stilts)
        this.pos.y = Math.min(g, this.pos.y + dt * 7);
        this.vel.y = 0; this.grounded = true; this.airTime = 0;
      } else if (this.pos.y <= g + 0.02 && this.vel.y <= 0) {
        if (!this.grounded && this.airTime > 0.35) this.onLand?.(this.vel.y);
        this.pos.y = g; this.vel.y = 0; this.grounded = true; this.airTime = 0;
      } else if (this.grounded && this.pos.y - g < 0.45 && this.vel.y <= 0) {
        // stick to ground when walking down slopes
        this.pos.y = g; this.vel.y = 0;
      } else {
        this.grounded = false; this.airTime += dt;
      }
    } else {
      if (this.pos.y < g) this.pos.y = g;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    // animation
    const c = this.char;
    c.root.position.copy(this.pos);
    c.root.rotation.y = this.facing;
    c.update(dt, { speed: this.speed, running: this.running && this.speed > 5, grounded: this.grounded, swimming: this.swimming, vy: this.vel.y });

    // footsteps
    if (this.grounded && this.speed > 1) {
      const p = Math.floor(c.phase / Math.PI);
      if (p !== this.lastPhase) { this.lastPhase = p; this.onStep?.(terrainH < 1.8 ? 'sand' : 'grass', this.running); }
    }
    if (this.swimming && this.speed > 0.5) {
      const p = Math.floor(c.phase / Math.PI);
      if (p !== this.lastPhase) { this.lastPhase = p; this.onSwimStroke?.(); }
    }
  }
}

// returns t along segment P0->P1 where it crosses segment A->B, or null
function segIntersect(x0, z0, x1, z1, ax, az, bx, bz) {
  const dx = x1 - x0, dz = z1 - z0, ex = bx - ax, ez = bz - az;
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((ax - x0) * ez - (az - z0) * ex) / den;
  const u = ((ax - x0) * dz - (az - z0) * dx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.2;
    this.dist = 4.8;
    this.curDist = 4.8;
    this.target = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.lastInput = 0;
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.cinematic = null;
  }

  shake(amp = 0.08, t = 0.25) { this.shakeAmp = amp; this.shakeT = t; }

  update(dt, player, intent) {
    const now = performance.now();
    if (intent) {
      if (intent.look.dx || intent.look.dy) this.lastInput = now;
      this.yaw -= intent.look.dx * 0.0052;
      this.pitch = clamp(this.pitch + intent.look.dy * 0.004, -0.25, 1.25);
      this.dist = clamp(this.dist + intent.zoom, 2.8, 11);
    }
    // build mode: pull back and look down a bit for an overview
    this.buildBlend = damp(this.buildBlend || 0, this.building ? 1 : 0, 4, dt);
    // gentle auto-follow behind the player while moving
    if (this.autoFollow !== false && now - this.lastInput > 2200 && player.speed > 2.5 && !player.char.busy && !this.building) {
      const want = player.facing + Math.PI;
      this.yaw = angleDamp(this.yaw, want, 0.9, dt);
    }
    const t = this.target;
    const tx = player.pos.x, tz = player.pos.z;
    const ty = player.pos.y + (player.swimming ? 1.85 : 1.55);
    t.x = damp(t.x, tx, 14, dt); t.z = damp(t.z, tz, 14, dt); t.y = damp(t.y, ty, 8, dt);
    if (t.distanceToSquared(player.pos) > 400) t.set(tx, ty, tz);

    const pitch = this.pitch + this.buildBlend * Math.max(0, 0.55 - this.pitch);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const ox = Math.sin(this.yaw) * cp, oy = sp, oz = Math.cos(this.yaw) * cp;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const shoulder = 0.42;
    const base = new THREE.Vector3(t.x + right.x * shoulder, t.y, t.z + right.z * shoulder);

    // terrain collision along the boom
    let d = this.dist + this.buildBlend * 2.5;
    const T = this.world.terrain;
    for (let i = 1; i <= 8; i++) {
      const k = (i / 8) * d;
      const px = base.x + ox * k, py = base.y + oy * k, pz = base.z + oz * k;
      const gh = Math.max(T.heightAt(px, pz), this.world.waterLevel(px, pz) - 0.2) + 0.45;
      if (py < gh) { d = Math.max(1.6, k * 0.9); break; }
    }
    // don't let walls block the view: shorten the boom at the first wall it crosses
    for (const w of this.world.walls) {
      const ex = base.x + ox * d, ez = base.z + oz * d;
      const t = segIntersect(base.x, base.z, ex, ez, w.ax, w.az, w.bx, w.bz);
      if (t !== null) {
        const hy = base.y + oy * d * t;
        if (hy > w.bottom - 0.2 && hy < w.top + 0.3) d = Math.max(0.9, d * t - 0.25);
      }
    }
    this.curDist = d < this.curDist ? d : damp(this.curDist, d, 3, dt);
    const D = this.curDist;
    this.pos.set(base.x + ox * D, base.y + oy * D, base.z + oz * D);
    const minY = Math.max(T.heightAt(this.pos.x, this.pos.z) + 0.35, this.world.waterLevel(this.pos.x, this.pos.z) + (player.swimming ? 0.9 : 0.45));
    if (this.pos.y < minY) this.pos.y = minY;

    this.camera.position.copy(this.pos);
    // subtle FOV kick while sprinting
    const baseFov = this.baseFov || (this.baseFov = this.camera.fov);
    const wantFov = baseFov + (player.running && player.speed > 5 ? 5 : 0);
    if (Math.abs(this.camera.fov - wantFov) > 0.05) { this.camera.fov = damp(this.camera.fov, wantFov, 5, dt); this.camera.updateProjectionMatrix(); }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 4;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    this.camera.lookAt(base.x, base.y + 0.05, base.z);
  }
}
