// Wildlife: data-driven species with simple state AI (wander / flee / chase / attack / return) and basic combat.
// Animals need a real model in assets/external/animals/<id>.glb. Without it a species simply doesn't spawn,
// so no placeholder creatures ever reach the player. `?testfauna` swaps in debug shapes for automated tests only.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { ASSETS } from '../world/assets.js';
import { angleDamp } from '../util/noise.js';

export const SPECIES = {
  boar: {
    name: 'Cinghiale', hp: 12, walk: 1.2, run: 5.0, radius: 0.6, height: 0.85,
    hostile: true, sense: 6, attackRange: 1.7, damage: 12, cooldown: 1.6, leash: 28,
    drops: { meat_raw: [2, 3], hide: [1, 1] }, count: 5, respawn: 300,
    habitat: (T, x, z) => T.heightAt(x, z) > 3 && T.slopeAt(x, z) < 0.3 && T.coastDist(x, z) > 30 && T.highW(x, z) < 0.3,
  },
  chicken: {
    name: 'Gallina', hp: 2, walk: 0.7, run: 3.4, radius: 0.3, height: 0.45,
    hostile: false, flee: 4,
    drops: { meat_raw: [1, 1], egg: [0, 1] }, count: 6, respawn: 180,
    habitat: (T, x, z) => T.clearW(x, z) > 0.4 && T.slopeAt(x, z) < 0.25,
  },
};

const CLIPS = { idle: /idle|stand/i, walk: /walk/i, run: /run|gallop|trot/i, attack: /attack|bite|charge|headbutt/i, death: /death|die|dead/i };
const rand = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));

function debugMesh(sp) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: sp.hostile ? 0x4a3a2c : 0xd8cfc0, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(sp.height * 0.32, sp.height * 0.7, 4, 8), mat);
  body.rotation.x = Math.PI / 2; body.position.y = sp.height * 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(sp.height * 0.25, 8, 6), mat);
  head.position.set(0, sp.height * 0.6, sp.height * 0.6);
  g.add(body, head);
  g.traverse((o) => { o.castShadow = true; });
  return { root: g, mixer: null, actions: {} };
}

function assetMesh(id, sp) {
  const src = ASSETS.animals?.[id];
  if (!src) return null;
  const root = skClone(src.scene);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  // normalise size to the species height
  const box = new THREE.Box3().setFromObject(root);
  const h = box.max.y - box.min.y || 1;
  const wrap = new THREE.Group();
  root.scale.multiplyScalar(sp.height / h);
  root.position.y = -box.min.y * (sp.height / h);
  wrap.add(root);
  const mixer = src.animations?.length ? new THREE.AnimationMixer(root) : null;
  const actions = {};
  if (mixer) for (const [k, re] of Object.entries(CLIPS)) {
    const clip = src.animations.find((a) => re.test(a.name));
    if (clip) actions[k] = mixer.clipAction(clip);
  }
  return { root: wrap, mixer, actions };
}

export class Wildlife {
  constructor(scene, terrain, { test = false } = {}) {
    this.scene = scene;
    this.T = terrain;
    this.list = [];
    for (const [id, sp] of Object.entries(SPECIES)) {
      if (!ASSETS.animals?.[id] && !test) continue; // no proper model: species stays out of the game
      for (let i = 0; i < sp.count; i++) {
        const v = assetMesh(id, sp) || debugMesh(sp);
        scene.add(v.root);
        const a = { id, sp, kind: 'animal', label: sp.name, ...v, x: 0, z: 0, y: 0, r: sp.radius, hp: sp.hp, alive: true, state: 'idle', t: 0, dir: Math.random() * 6.28, speed: 0, cd: 0, anim: null };
        this.place(a);
        this.list.push(a);
      }
    }
  }

  place(a) {
    const T = this.T;
    for (let k = 0; k < 3000; k++) {
      const x = (Math.random() * 2 - 1) * 440, z = (Math.random() * 2 - 1) * 440;
      if (Math.hypot(x - T.spawn.x, z - T.spawn.z) < 70 || !a.sp.habitat(T, x, z)) continue;
      Object.assign(a, { x, z, y: T.heightAt(x, z), home: { x, z }, hp: a.sp.hp, alive: true, state: 'idle', t: 1 + Math.random() * 3 });
      a.root.visible = true;
      return;
    }
    a.alive = false; a.root.visible = false; a.respawnAt = Infinity;
  }

  playAnim(a, name) {
    if (a.anim === name || !a.mixer) { a.anim = name; return; }
    const next = a.actions[name] || a.actions.walk || a.actions.idle;
    const prev = a.actions[a.anim];
    a.anim = name;
    if (!next || next === prev) return;
    next.reset().fadeIn(0.2).play();
    if (name === 'death' || name === 'attack') { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
    if (prev) prev.fadeOut(0.2);
  }

  // damage from the player; returns drops when the animal dies
  hit(a, dmg, fromX, fromZ, time) {
    if (!a.alive) return null;
    a.hp -= dmg;
    a.hurtT = 0.25;
    const away = Math.atan2(a.x - fromX, a.z - fromZ);
    a.x += Math.sin(away) * 0.6; a.z += Math.cos(away) * 0.6;
    if (a.hp <= 0) {
      a.alive = false; a.state = 'dead'; a.deadT = 1.6; a.respawnAt = time + a.sp.respawn;
      this.playAnim(a, 'death');
      const out = {};
      for (const [id, r] of Object.entries(a.sp.drops)) { const n = rand(r); if (n > 0) out[id] = n; }
      return out;
    }
    if (a.sp.hostile) { a.state = 'chase'; a.calm = 0; } else { a.state = 'flee'; a.t = 3; a.dir = away; }
    return null;
  }

  // onAttack(animal, damage) is called when a hostile animal's bite/charge lands
  update(dt, player, time, onAttack) {
    const T = this.T, P = player.pos;
    for (const a of this.list) {
      if (!a.alive) {
        if (a.state === 'dead') {
          a.deadT -= dt;
          a.mixer?.update(dt);
          if (!a.mixer) a.root.rotation.z = Math.min(Math.PI / 2, a.root.rotation.z + dt * 4);
          if (a.deadT <= 0) { a.state = 'gone'; a.root.visible = false; a.root.rotation.z = 0; }
        } else if (time > a.respawnAt) this.place(a);
        continue;
      }
      const sp = a.sp;
      const dx = P.x - a.x, dz = P.z - a.z, d = Math.hypot(dx, dz);
      const playerOk = !player.swimming && Math.abs(P.y - a.y) < 3;
      a.cd -= dt; a.t -= dt;
      let want = 0, face = a.dir;
      if (sp.hostile) {
        const fromHome = Math.hypot(a.x - a.home.x, a.z - a.home.z);
        if (a.state !== 'chase' && a.state !== 'return' && d < sp.sense && playerOk) a.state = 'chase';
        if (a.state === 'chase') {
          if (!playerOk || fromHome > sp.leash || d > sp.sense * 3) { a.state = 'return'; }
          else {
            face = Math.atan2(dx, dz);
            if (d > sp.attackRange) want = sp.run;
            else if (a.cd <= 0) {
              a.cd = sp.cooldown; a.attackT = 0.45;
              this.playAnim(a, 'attack');
            }
          }
        }
        if (a.attackT > 0) {
          a.attackT -= dt; want = 0;
          if (a.attackT <= 0 && d < sp.attackRange + 0.4 && playerOk) onAttack?.(a, sp.damage);
        }
        if (a.state === 'return') {
          face = Math.atan2(a.home.x - a.x, a.home.z - a.z); want = sp.walk * 1.6;
          if (fromHome < 4) { a.state = 'idle'; a.t = 4; }
        }
      } else if (d < sp.flee && playerOk) { a.state = 'flee'; a.t = 2; a.dir = Math.atan2(-dx, -dz); }
      if (a.state === 'flee') { face = a.dir; want = sp.run; if (a.t <= 0) a.state = 'idle'; }
      if (a.state === 'idle' || a.state === 'wander') {
        if (a.t <= 0) {
          a.t = 2 + Math.random() * 4;
          a.state = Math.random() < 0.55 ? 'wander' : 'idle';
          const back = Math.hypot(a.x - a.home.x, a.z - a.home.z) > 12;
          a.dir = back ? Math.atan2(a.home.x - a.x, a.home.z - a.z) : a.dir + (Math.random() - 0.5) * 2.4;
        }
        face = a.dir; want = a.state === 'wander' ? sp.walk : 0;
      }
      a.speed += (want - a.speed) * Math.min(1, dt * 5);
      const nx = a.x + Math.sin(face) * a.speed * dt, nz = a.z + Math.cos(face) * a.speed * dt;
      const nh = T.heightAt(nx, nz);
      if (nh > 0.4 && T.slopeAt(nx, nz) < 0.45) { a.x = nx; a.z = nz; a.y = nh; }
      else { a.dir += Math.PI * 0.6; if (a.state === 'chase') a.state = 'return'; }
      a.root.position.set(a.x, a.y, a.z);
      a.root.rotation.y = angleDamp(a.root.rotation.y, face, 7, dt);
      if (a.attackT <= 0 || a.attackT === undefined) this.playAnim(a, a.speed > sp.walk * 1.3 ? 'run' : a.speed > 0.15 ? 'walk' : 'idle');
      if (!a.mixer) a.root.position.y += Math.abs(Math.sin(time * a.speed * 4)) * 0.04;
      a.mixer?.update(dt);
    }
  }
}
