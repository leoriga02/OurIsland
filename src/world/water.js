// Stylized tropical water: depth-tinted turquoise shallows, deep blue ocean, shore foam, sun glints.
import * as THREE from 'three';
import { WORLD_SIZE, HT_MIN, HT_MAX } from './terrain.js';

const vert = /* glsl */`
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D uHeight;
  uniform vec3 uIslands[12];
  uniform int uIslandCount;
  uniform float uTime, uWorldSize, uLevel, uHtMin, uHtMax, uPond, uNight;
  uniform vec3 uSunDir, uSunColor, uZenith, uHorizon, uShallow, uMid, uDeep;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float terrainH(vec2 xz) {
    vec2 uv = (xz + uWorldSize * 0.5) / uWorldSize;
    return mix(uHtMin, uHtMax, texture2D(uHeight, uv).r);
  }
  // sum of directional waves -> height derivative
  vec2 waveGrad(vec2 p, float t) {
    vec2 g = vec2(0.0);
    vec2 d1 = normalize(vec2(0.8, 0.6)), d2 = normalize(vec2(-0.5, 0.9)), d3 = normalize(vec2(0.2, -1.0)), d4 = normalize(vec2(-0.9, -0.3));
    g += d1 * cos(dot(d1, p) * 0.35 + t * 1.1) * 0.35 * 0.10;
    g += d2 * cos(dot(d2, p) * 0.6 + t * 1.5) * 0.6 * 0.06;
    g += d3 * cos(dot(d3, p) * 1.3 + t * 2.1) * 1.3 * 0.03;
    g += d4 * cos(dot(d4, p) * 2.4 + t * 2.9) * 2.4 * 0.015;
    return g;
  }

  void main() {
    vec2 p = vWorld.xz;
    float t = uTime;
    float th = terrainH(p);
    float depth = uLevel - th;
    if (uPond > 0.5) depth = max(depth, 0.0) + 0.6;
    // distant islands live outside the height texture: fake a shallow shelf around each
    for (int i = 0; i < 12; i++) {
      if (i >= uIslandCount) break;
      vec3 isl = uIslands[i];
      float dd = length(p - isl.xy) - isl.z * 1.02;
      depth = min(depth, max(dd, 0.0) * 0.09 + 0.04);
    }

    vec2 g = waveGrad(p, t);
    // fine ripples
    float e = 0.15;
    vec2 q = p * 0.9 + vec2(t * 0.35, t * 0.22);
    vec2 q2 = p * 1.7 - vec2(t * 0.28, -t * 0.4);
    float n0 = vnoise(q) + 0.5 * vnoise(q2);
    float nx = vnoise(q + vec2(e, 0.0)) + 0.5 * vnoise(q2 + vec2(e, 0.0));
    float nz = vnoise(q + vec2(0.0, e)) + 0.5 * vnoise(q2 + vec2(0.0, e));
    g += vec2(nx - n0, nz - n0) / e * 0.05;
    float calm = mix(0.35, 1.0, smoothstep(0.0, 3.0, depth));
    vec3 N = normalize(vec3(-g.x * calm, 1.0, -g.y * calm));

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uSunDir);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

    // body colour by depth
    vec3 col = mix(uShallow, uMid, smoothstep(0.4, 3.8, depth));
    col = mix(col, uDeep, smoothstep(3.8, 16.0, depth));
    // light caustic shimmer in the shallows
    float caus = pow(abs(sin(vnoise(p * 1.3 + t * 0.4) * 6.2831 + t)), 6.0);
    col += caus * 0.12 * (1.0 - smoothstep(0.5, 4.0, depth)) * (1.0 - uNight);
    float diff = 0.55 + 0.45 * max(dot(N, L), 0.0);
    col *= diff * mix(vec3(1.0), uSunColor, 0.35);

    // sky reflection
    vec3 R = reflect(-V, N);
    vec3 sky = mix(uHorizon, uZenith, clamp(R.y * 1.6, 0.0, 1.0));
    col = mix(col, sky * vec3(0.8, 0.92, 1.05), fres * 0.6);

    // sun glints
    float spec = pow(max(dot(R, L), 0.0), 220.0) * 3.5 + pow(max(dot(R, L), 0.0), 30.0) * 0.18;
    col += uSunColor * spec * (1.0 - uNight * 0.7);

    // shore foam
    float fn = vnoise(p * 1.6 + vec2(t * 0.3, 0.0)) * 0.6 + vnoise(p * 4.0 - t * 0.5) * 0.4;
    float shore = 1.0 - smoothstep(0.0, 0.1 + fn * 0.14, depth);
    float wave = sin(depth * 5.0 - t * 1.6 + fn * 3.0);
    float band = smoothstep(0.86, 1.0, wave) * (1.0 - smoothstep(0.15, 0.9, depth)) * smoothstep(0.45, 0.65, fn);
    float foam = clamp(max(shore, band * 0.8), 0.0, 1.0) * (1.0 - uPond * 0.6);
    col = mix(col, vec3(0.96, 0.98, 1.0) * (0.75 + 0.25 * diff), foam);

    float alpha = mix(0.66, 0.96, smoothstep(0.0, 2.5, depth));
    alpha = max(alpha, fres * 0.9);
    alpha = max(alpha, foam);
    alpha *= smoothstep(-0.05, 0.08, depth);

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createWaterMaterial(heightTex, { level = 0, pond = false } = {}) {
  const lin = (hex) => new THREE.Color(hex);
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uHeight: { value: heightTex },
        uTime: { value: 0 },
        uWorldSize: { value: WORLD_SIZE },
        uLevel: { value: level },
        uHtMin: { value: HT_MIN }, uHtMax: { value: HT_MAX },
        uPond: { value: pond ? 1 : 0 },
        uNight: { value: 0 },
        uIslands: { value: Array.from({ length: 12 }, () => new THREE.Vector3(1e6, 1e6, 0)) },
        uIslandCount: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
        uZenith: { value: new THREE.Color(0x2f7fd8) },
        uHorizon: { value: new THREE.Color(0xa9d8f0) },
        uShallow: { value: pond ? lin(0x3fb7a8) : lin(0x22d6cc) },
        uMid: { value: pond ? lin(0x1d7f7a) : lin(0x0e9cc0) },
        uDeep: { value: pond ? lin(0x145a5a) : lin(0x0a4d93) },
      },
    ]),
  });
}

export function createOcean(heightTex) {
  const mat = createWaterMaterial(heightTex, { level: 0 });
  const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  mesh.name = 'ocean';
  return mesh;
}

export function setWaterIslands(mat, list) {
  list.slice(0, 12).forEach((v, i) => mat.uniforms.uIslands.value[i].copy(v));
  mat.uniforms.uIslandCount.value = Math.min(12, list.length);
}

export function createPond(heightTex, pond) {
  const mat = createWaterMaterial(heightTex, { level: pond.y, pond: true });
  const geo = new THREE.CircleGeometry(pond.r + 2.5, 48);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pond.x, pond.y, pond.z);
  mesh.renderOrder = 1;
  return mesh;
}
