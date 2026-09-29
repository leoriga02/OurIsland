// Sky dome, sun/moon lighting, clouds and the day/night cycle.
import * as THREE from 'three';
import { cloudTexture } from '../util/textures.js';
import { smoothstep, lerp, mulberry32 } from '../util/noise.js';

const skyVert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const skyFrag = /* glsl */`
  uniform vec3 uZenith, uHorizon, uSunDir, uSunColor, uGround;
  uniform float uNight, uTime;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.42, h), 0.6));
    col = mix(col, uGround, smoothstep(0.0, -0.15, h));
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(sd, 8.0) * 0.35 + pow(sd, 64.0) * 0.6) * (1.0 - uNight);
    col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 6.0 * (1.0 - uNight);
    // moon (opposite the sun)
    float md = max(dot(d, normalize(-uSunDir)), 0.0);
    col += vec3(0.9, 0.95, 1.0) * smoothstep(0.9990, 0.9994, md) * 1.5 * uNight;
    col += vec3(0.25, 0.35, 0.6) * pow(md, 20.0) * 0.3 * uNight;
    // stars
    if (uNight > 0.01 && h > 0.0) {
      vec3 sp = floor(d * 280.0);
      float s = hash(sp);
      float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 50.0);
      col += vec3(step(0.9975, s) * tw * uNight * smoothstep(0.0, 0.25, h));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Colour keyframes by sun elevation
const K = {
  day: { zen: 0x2270d4, hor: 0xa6d6f2, sun: 0xfff0d4, sunI: 3.0, hemiSky: 0xcfe6ff, hemiGround: 0x7a8a5a, hemiI: 1.35, fog: 0xa9d4ee },
  gold: { zen: 0x4a78b8, hor: 0xf6b37c, sun: 0xffb46e, sunI: 2.0, hemiSky: 0xffd2a8, hemiGround: 0x6a5a3a, hemiI: 0.9, fog: 0xe8b890 },
  night: { zen: 0x06122e, hor: 0x24406e, sun: 0xa8c4ff, sunI: 1.0, hemiSky: 0x6a88c8, hemiGround: 0x2a3448, hemiI: 1.0, fog: 0x1c3052 },
};
const cc = (h) => new THREE.Color(h);
const KC = {};
for (const k in K) KC[k] = { zen: cc(K[k].zen), hor: cc(K[k].hor), sun: cc(K[k].sun), hemiSky: cc(K[k].hemiSky), hemiGround: cc(K[k].hemiGround), fog: cc(K[k].fog) };

export class Sky {
  constructor(scene, { shadowSize = 2048 } = {}) {
    this.scene = scene;
    this.time = 0.33; // 0..1, 0.25 sunrise, 0.75 sunset
    this.dayLength = 720; // seconds per full day
    this.day = 1;

    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color(0x0b4d8a) },
      uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
      uNight: { value: 0 }, uTime: { value: 0 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2500, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    scene.add(dome);
    this.dome = dome;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const S = 42;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 300 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445522, 1);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xa9d4ee, 0.0011);
    this.fog = scene.fog;

    // clouds
    this.clouds = [];
    const r = mulberry32(4);
    for (let i = 0; i < 13; i++) {
      const mat = new THREE.SpriteMaterial({ map: cloudTexture(1 + (i % 5)), fog: false, depthWrite: false, transparent: true, opacity: 0.95 });
      const s = new THREE.Sprite(mat);
      const a = r() * Math.PI * 2, d = 900 + r() * 700;
      const w = 260 + r() * 340;
      s.scale.set(w, w * 0.45, 1);
      s.position.set(Math.cos(a) * d, 140 + r() * 240, Math.sin(a) * d);
      s.userData = { a, d, speed: 0.004 + r() * 0.004 };
      s.renderOrder = -5;
      scene.add(s);
      this.clouds.push(s);
    }

    this.sunDir = new THREE.Vector3();
    this.sunColor = new THREE.Color();
    this.zenith = new THREE.Color(); this.horizon = new THREE.Color();
    this.night = 0;
    this.update(0, new THREE.Vector3());
  }

  get hours() { return (this.time * 24) % 24; }
  isNight() { return this.night > 0.6; }

  update(dt, focus) {
    const prev = this.time;
    this.time = (this.time + dt * (this.night > 0.5 ? 1.8 : 1) / this.dayLength) % 1;
    if (this.time < prev) this.day++;
    const t = this.time;
    const ang = (t - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang) * 0.85, elev, 0.45 + Math.cos(ang) * 0.1).normalize();

    const dayF = smoothstep(0.02, 0.35, elev);      // 0 at horizon → 1 midday
    const nightF = smoothstep(0.02, -0.18, elev);   // 1 at night
    this.night = nightF;

    const mix3 = (key, out) => {
      out.copy(KC.gold[key]).lerp(KC.day[key], dayF);
      return out.lerp(KC.night[key], nightF);
    };
    mix3('zen', this.zenith); mix3('hor', this.horizon); mix3('sun', this.sunColor);
    const sunI = lerp(lerp(K.gold.sunI, K.day.sunI, dayF), K.night.sunI, nightF);
    const hemiI = lerp(lerp(K.gold.hemiI, K.day.hemiI, dayF), K.night.hemiI, nightF);

    const U = this.uniforms;
    U.uZenith.value.copy(this.zenith); U.uHorizon.value.copy(this.horizon);
    U.uSunDir.value.copy(this.sunDir); U.uSunColor.value.copy(this.sunColor);
    U.uNight.value = nightF; U.uTime.value += dt;
    U.uGround.value.copy(this.horizon).multiplyScalar(0.55);

    // the light comes from the moon at night (opposite side, softer)
    const lightDir = nightF > 0.5 ? _v.copy(this.sunDir).negate() : _v.copy(this.sunDir);
    if (lightDir.y < 0.12) lightDir.y = 0.12;
    lightDir.normalize();
    this.sun.color.copy(this.sunColor);
    const twilight = 1 - Math.min(1, Math.abs(elev) / 0.08) * 0; // keep
    this.sun.intensity = sunI * (nightF > 0.5 ? 1 : smoothstep(-0.05, 0.08, elev)) * twilight + (nightF > 0.5 ? 0 : 0);
    if (nightF > 0.3 && nightF < 0.7) this.sun.intensity *= Math.abs(nightF - 0.5) * 5;
    this.sun.position.copy(focus).addScaledVector(lightDir, 150);
    this.sun.target.position.copy(focus);
    // snap shadow camera to texel grid to avoid shimmering
    this.hemi.color.copy(mix3('hemiSky', _c));
    this.hemi.groundColor.copy(mix3('hemiGround', _c));
    this.hemi.intensity = hemiI;
    mix3('fog', this.fog.color);

    const cloudTint = _c.copy(this.sunColor).lerp(new THREE.Color(1, 1, 1), dayF * 0.7).multiplyScalar(1 - nightF * 0.8);
    for (const s of this.clouds) {
      s.userData.a += s.userData.speed * dt * 0.1;
      s.position.x = focus.x + Math.cos(s.userData.a) * s.userData.d;
      s.position.z = focus.z + Math.sin(s.userData.a) * s.userData.d;
      s.material.color.copy(cloudTint);
      s.material.opacity = 0.95 - nightF * 0.6;
    }
    this.dome.position.copy(focus);
  }

  applyToWater(mat) {
    const u = mat.uniforms;
    u.uSunDir.value.copy(this.sunDir.y > -0.05 ? this.sunDir : _v.copy(this.sunDir).negate());
    u.uSunColor.value.copy(this.sunColor);
    u.uZenith.value.copy(this.zenith);
    u.uHorizon.value.copy(this.horizon);
    u.uNight.value = this.night;
  }
}

const _v = new THREE.Vector3();
const _c = new THREE.Color();
