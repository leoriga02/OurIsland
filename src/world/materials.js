// Shared materials + shader patches (wind sway, soft foliage normals).
import * as THREE from 'three';
import { ASSETS } from './assets.js';
import {
  palmFrondTexture, leafClusterTexture, bananaLeafTexture, grassTexture, fiberPlantTexture,
  barkTexture, planksTexture, rockDetailTexture, thatchTexture, flowerTexture, woodEndTexture,
} from '../util/textures.js';

export const shared = { uTime: { value: 0 } };

const foliageNormal = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');

// strength: sway amplitude; mode 'height' uses local y (plants), 'uv' uses uv.y (fronds)
export function patchFoliage(mat, { wind = 0.05, softNormals = true, key = '', mode = 'height' } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        float hh = ${mode === 'uv' ? 'uv.y * 3.0' : 'max(transformed.y, 0.0)'};
        float w = sin(uTime * 1.6 + wp.x * 0.31 + wp.z * 0.23) * 0.65 + sin(uTime * 3.1 + wp.x * 0.83 + wp.z * 0.5) * 0.25;
        transformed.x += w * hh * hh * ${wind.toFixed(4)};
        transformed.z += w * hh * hh * ${(wind * 0.7).toFixed(4)};
        transformed.y -= abs(w) * hh * hh * ${(wind * 0.2).toFixed(4)};
      }`);
    if (softNormals) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', foliageNormal);
  };
  mat.customProgramCacheKey = () => `fol_${wind}_${softNormals}_${key}_${mode}`;
  return mat;
}

let M = null;
export function materials() {
  if (M) return M;
  M = {};
  M.palmBark = new THREE.MeshStandardMaterial({ map: barkTexture([150, 128, 100], 'palmBark'), vertexColors: true, roughness: 0.95 });
  M.bark = new THREE.MeshStandardMaterial({ map: barkTexture([96, 72, 52], 'bark'), roughness: 0.95 });
  M.frond = patchFoliage(new THREE.MeshStandardMaterial({ map: palmFrondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }), { wind: 0.035, key: 'frond', mode: 'uv' });
  M.canopy = patchFoliage(new THREE.MeshStandardMaterial({ map: leafClusterTexture(98), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true }), { wind: 0.004, key: 'canopy' });
  M.bush = patchFoliage(new THREE.MeshStandardMaterial({ map: leafClusterTexture(104, 'bush'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true }), { wind: 0.03, key: 'bush' });
  M.fern = patchFoliage(new THREE.MeshStandardMaterial({ map: palmFrondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true }), { wind: 0.05, key: 'fern' });
  M.banana = patchFoliage(new THREE.MeshStandardMaterial({ map: bananaLeafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 }), { wind: 0.03, key: 'banana' });
  M.grass = patchFoliage(new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true }), { wind: 0.25, key: 'grass' });
  M.fiber = patchFoliage(new THREE.MeshStandardMaterial({ map: fiberPlantTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }), { wind: 0.08, key: 'fiber' });
  M.flower = patchFoliage(new THREE.MeshStandardMaterial({ map: flowerTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }), { wind: 0.03, key: 'flower' });
  M.rock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  // cliff rock: world-space triplanar grain so huge scaled blocks keep fine detail
  M.cliff = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const rockTex = rockDetailTexture();
  M.cliff.onBeforeCompile = (sh) => {
    sh.uniforms.uRockTex = { value: rockTex };
    sh.vertexShader = 'varying vec3 vCWP;\nvarying vec3 vCWN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      {
        vec4 cw = vec4(transformed, 1.0);
        vec3 cn = objectNormal;
        #ifdef USE_INSTANCING
          cw = instanceMatrix * cw; cn = mat3(instanceMatrix) * cn;
        #endif
        vCWP = (modelMatrix * cw).xyz; vCWN = normalize(mat3(modelMatrix) * cn);
      }`);
    sh.fragmentShader = 'uniform sampler2D uRockTex;\nvarying vec3 vCWP;\nvarying vec3 vCWN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 an = abs(vCWN); an /= (an.x + an.y + an.z + 0.001);
        float tx = texture2D(uRockTex, vec2(vCWP.z, -vCWP.y) * vec2(0.09, 0.07)).r;
        float tz = texture2D(uRockTex, vec2(vCWP.x, -vCWP.y) * vec2(0.09, 0.07)).r;
        float ty = texture2D(uRockTex, vCWP.xz * 0.12).r;
        float d = tx * an.x + tz * an.z + ty * an.y;
        float fine = texture2D(uRockTex, vec2(vCWP.x + vCWP.z, -vCWP.y) * 0.31).r;
        diffuseColor.rgb *= (0.55 + 0.6 * d) * (0.85 + 0.25 * fine);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.27, 0.12) * (0.6 + 0.6 * fine), smoothstep(0.65, 0.95, vCWN.y + (fine - 0.5) * 0.5) * 0.55);
      }`);
  };
  M.cliff.customProgramCacheKey = () => 'cliff1';
  if (ASSETS.ok) { M.scanRock = scanRockMaterial(); M.scanIsland = scanRockMaterial({ terrainBlend: true }); }
  M.planks = new THREE.MeshStandardMaterial({ map: planksTexture(), roughness: 0.85 });
  M.wood = new THREE.MeshStandardMaterial({ map: barkTexture([140, 100, 64], 'woodLight'), roughness: 0.85 });
  M.woodDark = new THREE.MeshStandardMaterial({ map: barkTexture([92, 64, 40], 'woodDark'), roughness: 0.9 });
  M.woodEnd = new THREE.MeshStandardMaterial({ map: woodEndTexture(), roughness: 0.85 });
  M.thatch = new THREE.MeshStandardMaterial({ map: thatchTexture(), roughness: 0.95, side: THREE.DoubleSide });
  M.rope = new THREE.MeshStandardMaterial({ color: 0xb89a62, roughness: 1 });
  M.stone = new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.9 });
  M.canvas = new THREE.MeshStandardMaterial({ color: 0xd8c8a4, roughness: 0.95, side: THREE.DoubleSide });
  M.metal = new THREE.MeshStandardMaterial({ color: 0x5a5a5e, roughness: 0.5, metalness: 0.6 });
  return M;
}

// Scanned rock surface (Poly Haven boulder_01) applied triplanar in world space, so decimated or stretched
// rock meshes keep crisp, undistorted detail. Weathered grey limestone tint, moss from the scanned grass on top faces.
function scanRockMaterial({ terrainBlend = false } = {}) {
  const src = ASSETS.models.boulder[0].mat;
  const tA = src.map, tN = src.normalMap, tM = ASSETS.tex.grassrock_diff;
  for (const t of [tA, tN]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
  const m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, vertexColors: terrainBlend });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tRA: { value: tA }, tRN: { value: tN }, tMoss: { value: tM } });
    sh.vertexShader = 'varying vec3 vRP;\nvarying vec3 vRN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      {
        vec4 rw = vec4(transformed, 1.0);
        vec3 rn = objectNormal;
        #ifdef USE_INSTANCING
          rw = instanceMatrix * rw; rn = mat3(instanceMatrix) * rn;
        #endif
        vRP = (modelMatrix * rw).xyz; vRN = normalize(mat3(modelMatrix) * rn);
      }`);
    sh.fragmentShader = 'uniform sampler2D tRA, tRN, tMoss;\nvarying vec3 vRP;\nvarying vec3 vRN;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 rN = normalize(vRN);
        vec3 bw = pow(abs(rN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        const float RS = 0.16;
        vec3 ra = texture2D(tRA, vRP.zy * RS).rgb * bw.x + texture2D(tRA, vRP.xz * RS + 0.5).rgb * bw.y + texture2D(tRA, vRP.xy * RS + 0.25).rgb * bw.z;
        vec3 rb = texture2D(tRA, vRP.zy * 0.043 + 0.1).rgb * bw.x + texture2D(tRA, vRP.xz * 0.043 + 0.6).rgb * bw.y + texture2D(tRA, vRP.xy * 0.043 + 0.35).rgb * bw.z;
        float rl = dot(ra, vec3(0.2126, 0.7152, 0.0722));
        // grey limestone with a hint of the scan's warm lichen
        vec3 rock = mix(vec3(rl) * vec3(1.02, 1.0, 0.95), ra, 0.28) * (0.75 + 0.5 * dot(rb, vec3(0.33)) / 0.12) * 1.55;
        vec3 moss = texture2D(tMoss, vRP.xz * 0.11).rgb * vec3(0.7, 0.95, 0.6);
        float mw = smoothstep(0.55, 0.85, rN.y + (rl - 0.12) * 1.5);
        ${terrainBlend
          ? `float rmask = smoothstep(0.3, 0.55, 1.0 - rN.y);
             diffuseColor.rgb = mix(diffuseColor.rgb * (0.8 + 0.4 * rl / 0.12), rock * 0.85, rmask);`
          : 'diffuseColor.rgb *= mix(rock, moss, mw * 0.85);'}
      `)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 nx = texture2D(tRN, vRP.zy * RS).xyz * 2.0 - 1.0;
          vec3 ny = texture2D(tRN, vRP.xz * RS + 0.5).xyz * 2.0 - 1.0;
          vec3 nz = texture2D(tRN, vRP.xy * RS + 0.25).xyz * 2.0 - 1.0;
          // UDN triplanar blend in world space
          vec3 wn = normalize(
            vec3(0.0, nx.y, nx.x) * bw.x * 1.4 +
            vec3(ny.x, 0.0, ny.y) * bw.y * 1.4 +
            vec3(nz.x, nz.y, 0.0) * bw.z * 1.4 + rN);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }
      `);
  };
  m.customProgramCacheKey = () => 'scanRock2' + terrainBlend;
  return m;
}
