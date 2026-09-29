// Seagulls gliding over the coast (one instanced mesh, wing flap in the vertex shader).
import * as THREE from 'three';
import { shared } from '../world/materials.js';
import { merge, setColor } from '../world/models.js';

export class Birds {
  constructor(scene, count = 10) {
    const body = new THREE.SphereGeometry(0.16, 8, 6);
    body.scale(1, 0.8, 3.2);
    setColor(body, 0.95, 0.95, 0.93);
    const head = new THREE.SphereGeometry(0.1, 8, 6);
    head.translate(0, 0.06, 0.5);
    setColor(head, 0.95, 0.95, 0.95);
    const beak = new THREE.ConeGeometry(0.03, 0.14, 5);
    beak.rotateX(Math.PI / 2); beak.translate(0, 0.05, 0.66);
    setColor(beak, 0.95, 0.7, 0.2);
    const wing = (s) => {
      const g = new THREE.BufferGeometry();
      const v = [0, 0, 0.18, s * 0.9, 0.05, 0.05, s * 1.35, 0, -0.25, 0, 0, -0.2];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setIndex(s > 0 ? [0, 1, 3, 1, 2, 3] : [0, 3, 1, 1, 3, 2]);
      g.setAttribute('color', new THREE.Float32BufferAttribute([0.9, 0.9, 0.9, 0.75, 0.75, 0.78, 0.2, 0.2, 0.22, 0.9, 0.9, 0.9], 3));
      g.computeVertexNormals();
      return g;
    };
    const tail = new THREE.ConeGeometry(0.12, 0.35, 4);
    tail.rotateX(-Math.PI / 2); tail.scale(1, 0.25, 1); tail.translate(0, 0, -0.6);
    setColor(tail, 0.85, 0.85, 0.85);
    const geo = merge([body, head, beak, wing(1), wing(-1), tail]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float wx = abs(transformed.x);
        if (wx > 0.17) {
          float ph = float(gl_InstanceID) * 1.7;
          float flap = sin(uTime * 7.0 + ph) * step(0.0, sin(uTime * 0.6 + ph * 2.0));
          transformed.y += flap * (wx - 0.17) * 0.9 + (wx - 0.17) * 0.15;
        }`);
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.birds = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      this.birds.push({
        cx: Math.cos(a) * (120 + Math.random() * 60), cz: Math.sin(a) * (120 + Math.random() * 60),
        r: 18 + Math.random() * 30, h: 22 + Math.random() * 22, a: Math.random() * 6, speed: (0.12 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1),
      });
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1.4, 1.4, 1.4);
  }

  update(dt, night) {
    this.mesh.visible = night < 0.7;
    this.birds.forEach((b, i) => {
      b.a += b.speed * dt;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
      const y = b.h + Math.sin(b.a * 3 + i) * 2;
      const heading = Math.atan2(-Math.sin(b.a) * Math.sign(b.speed), Math.cos(b.a) * Math.sign(b.speed));
      this._e.set(0, heading, -0.25 * Math.sign(b.speed));
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(x, y, z), this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
