// Particles (chips, sparks, splashes, dust), campfire flames and a small pool of point lights.
import * as THREE from 'three';
import { softDotTexture, flameTexture } from '../util/textures.js';

const MAX = 500;

export class Fx {
  constructor(scene) {
    this.scene = scene;
    // generic particle system (points)
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDotTexture() }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC;
        uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a < 0.3) discard; gl_FragColor = vec4(vC, 1.0);
        #include <colorspace_fragment>
        }`,
      transparent: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX; i++) this.parts.push({ life: 0 });

    // additive glow particles (fire embers, sparkles)
    const g2 = new THREE.BufferGeometry();
    this.gpos = new Float32Array(MAX * 3); this.gcol = new Float32Array(MAX * 3); this.gsize = new Float32Array(MAX);
    g2.setAttribute('position', new THREE.BufferAttribute(this.gpos, 3));
    g2.setAttribute('color', new THREE.BufferAttribute(this.gcol, 3));
    g2.setAttribute('size', new THREE.BufferAttribute(this.gsize, 1));
    const m2 = mat.clone();
    m2.uniforms = { map: { value: softDotTexture() }, scale: { value: 600 } };
    m2.fragmentShader = `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.a, 1.0);
      #include <colorspace_fragment>
      }`;
    m2.blending = THREE.AdditiveBlending; m2.depthWrite = false; m2.transparent = true;
    this.glow = new THREE.Points(g2, m2);
    this.glow.frustumCulled = false;
    scene.add(this.glow);
    this.gparts = [];
    for (let i = 0; i < MAX; i++) this.gparts.push({ life: 0 });

    this.fires = [];
    this.lights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xff9a4a, 0, 14, 1.6);
      scene.add(l);
      return l;
    });
    this.torch = null; // { obj } when a torch is held
  }

  setScale(h) {
    this.points.material.uniforms.scale.value = h * 0.9;
    this.glow.material.uniforms.scale.value = h * 0.9;
  }

  _spawn(list, o) {
    for (const p of list) if (p.life <= 0) { p.firefly = false; Object.assign(p, o); return p; }
    return null;
  }

  burst(type, at, n = 12, dir) {
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5 + 0.5, (Math.random() - 0.5) * 2);
      let size = 0.08, life = 0.8 + Math.random() * 0.5, grav = 9;
      if (type === 'wood') { c.setHSL(0.08 + Math.random() * 0.03, 0.55, 0.35 + Math.random() * 0.25); v.multiplyScalar(3); size = 0.07 + Math.random() * 0.06; }
      else if (type === 'leaf') { c.setHSL(0.25 + Math.random() * 0.06, 0.6, 0.3 + Math.random() * 0.15); v.multiplyScalar(2); grav = 2; life = 1.6; size = 0.1; }
      else if (type === 'stone') { c.setHSL(0.08, 0.05, 0.4 + Math.random() * 0.3); v.multiplyScalar(3.2); size = 0.06; }
      else if (type === 'dust') { c.setHSL(0.1, 0.25, 0.6 + Math.random() * 0.15); v.set((Math.random() - 0.5) * 3, Math.random() * 0.8, (Math.random() - 0.5) * 3); grav = 0.5; size = 0.3 + Math.random() * 0.2; life = 0.9; }
      else if (type === 'splash') { c.setRGB(0.85, 0.95, 1); v.multiplyScalar(2.2); size = 0.1; }
      else if (type === 'berry') { c.setRGB(0.8, 0.1, 0.15); v.multiplyScalar(1.5); size = 0.06; }
      else if (type === 'grass') { c.setHSL(0.2, 0.5, 0.45 + Math.random() * 0.1); v.multiplyScalar(1.6); grav = 4; size = 0.07; }
      if (dir) v.addScaledVector(dir, 2);
      this._spawn(this.parts, { life, max: life, x: at.x, y: at.y, z: at.z, vx: v.x, vy: v.y, vz: v.z, grav, size, r: c.r, g: c.g, b: c.b });
    }
  }

  sparkle(at, n = 10, color = 0xffe08a) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      this._spawn(this.gparts, { life: 0.9, max: 0.9, x: at.x + (Math.random() - 0.5) * 0.8, y: at.y + Math.random() * 0.6, z: at.z + (Math.random() - 0.5) * 0.8, vx: 0, vy: 0.5 + Math.random() * 0.6, vz: 0, grav: 0, size: 0.07 + Math.random() * 0.04, r: c.r, g: c.g, b: c.b });
    }
  }

  firefly(at) {
    const p = this._spawn(this.gparts, { life: 3.5, max: 3.5, x: at.x, y: at.y, z: at.z, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.6, grav: 0, size: 0.09, r: 0.75, g: 1, b: 0.35 });
    if (p) p.firefly = true;
  }

  addFire(pos, scale = 1) {
    const group = new THREE.Group();
    group.position.copy(pos);
    const mats = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff });
      const s = new THREE.Sprite(m);
      s.center.set(0.5, 0.05);
      s.position.set((i - 1) * 0.12 * scale, 0.05, (i % 2) * 0.08 * scale);
      s.scale.set(0.55 * scale, 0.9 * scale, 1);
      group.add(s); mats.push(s);
    }
    this.scene.add(group);
    const f = { pos: pos.clone(), group, sprites: mats, scale, t: Math.random() * 10, lit: true };
    this.fires.push(f);
    return f;
  }

  removeFire(f) { this.scene.remove(f.group); this.fires.splice(this.fires.indexOf(f), 1); }

  update(dt, camPos, night) {
    // generic
    for (let i = 0; i < MAX; i++) {
      const p = this.parts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
        this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
        this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
        this.size[i] = p.size * Math.min(1, p.life / p.max * 2);
      } else this.size[i] = 0;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;

    // fires: flicker + embers
    for (const f of this.fires) {
      f.t += dt;
      f.sprites.forEach((s, k) => {
        const fl = 0.85 + 0.15 * Math.sin(f.t * (9 + k * 3)) + 0.1 * Math.sin(f.t * 23 + k);
        s.scale.set(0.5 * f.scale * (0.9 + 0.1 * Math.sin(f.t * 7 + k)), 0.95 * f.scale * fl, 1);
        s.material.opacity = 0.9;
      });
      if (Math.random() < dt * 14) {
        this._spawn(this.gparts, { life: 1.2, max: 1.2, x: f.pos.x + (Math.random() - 0.5) * 0.3, y: f.pos.y + 0.3, z: f.pos.z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 0.4, vy: 1.4 + Math.random(), vz: (Math.random() - 0.5) * 0.4, grav: -0.3, size: 0.06, r: 1, g: 0.55, b: 0.15 });
      }
    }
    for (let i = 0; i < MAX; i++) {
      const p = this.gparts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.grav * dt;
        p.x += p.vx * dt + Math.sin(p.life * 6 + i) * dt * 0.2; p.y += p.vy * dt; p.z += p.vz * dt;
        this.gpos[i * 3] = p.x; this.gpos[i * 3 + 1] = p.y; this.gpos[i * 3 + 2] = p.z;
        let k = p.life / p.max;
        if (p.firefly) k = Math.sin(k * Math.PI) * (0.6 + 0.4 * Math.sin(p.life * 9 + i));
        this.gcol[i * 3] = p.r * k; this.gcol[i * 3 + 1] = p.g * k; this.gcol[i * 3 + 2] = p.b * k;
        this.gsize[i] = p.size;
      } else this.gsize[i] = 0;
    }
    const b = this.glow.geometry.attributes;
    b.position.needsUpdate = b.color.needsUpdate = b.size.needsUpdate = true;

    // assign lights to nearest emitters
    const emitters = this.fires.map((f) => ({ p: f.pos, i: 2.2 * f.scale, h: 0.6 }));
    if (this.torch) {
      const wp = this.torch.getWorldPosition(new THREE.Vector3());
      emitters.push({ p: wp, i: 1.6, h: 0.25, torch: true });
    }
    emitters.sort((x, y) => x.p.distanceToSquared(camPos) - y.p.distanceToSquared(camPos));
    const t = performance.now() / 1000;
    this.lights.forEach((l, k) => {
      const e = emitters[k];
      if (!e) { l.intensity = 0; return; }
      l.position.copy(e.p); l.position.y += e.h;
      const flick = 0.85 + 0.1 * Math.sin(t * 13 + k) + 0.05 * Math.sin(t * 29);
      l.intensity = e.i * flick * (4 + night * 16);
      l.distance = 10 + night * 8;
    });
  }
}
