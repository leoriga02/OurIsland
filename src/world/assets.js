// External game-ready assets (Poly Haven, CC0): scanned rocks, tropical plants and ground textures.
// Loaded once before the world is built. Everything has a procedural fallback if loading fails.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = './assets/external/';
export const ASSETS = { ok: false, models: {}, tex: {}, animals: {} };

// Optional models the game can use as soon as the files exist (missing files are skipped silently).
const OPTIONAL_ANIMALS = { boar: 'animals/boar.glb', chicken: 'animals/chicken.glb' };

// quantized/meshopt attributes -> plain float32 so geometry can be transformed and merged
function dequantize(g) {
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name];
    const n = a.count, s = a.itemSize, out = new Float32Array(n * s);
    for (let i = 0; i < n; i++) for (let k = 0; k < s; k++) out[i * s + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(out, s));
  }
  return g;
}

// every mesh in the file becomes one variant: transform baked, centred on x/z, base at y = 0
function extract(gltf, { ground = true } = {}) {
  const out = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = dequantize(o.geometry.clone());
    g.applyMatrix4(o.matrixWorld);
    g.computeBoundingBox();
    const b = g.boundingBox;
    g.translate(-(b.min.x + b.max.x) / 2, ground ? -b.min.y : 0, -(b.min.z + b.max.z) / 2);
    g.computeBoundingBox(); g.computeBoundingSphere();
    out.push({ geo: g, mat: o.material, size: g.boundingBox.getSize(new THREE.Vector3()) });
  });
  return out;
}

function loadTex(loader, file, srgb) {
  return new Promise((res) => loader.load(BASE + file, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    res(t);
  }, undefined, () => res(null)));
}

export async function loadAssets(onProgress) {
  try {
    const gl = new GLTFLoader();
    gl.setMeshoptDecoder(MeshoptDecoder);
    // key -> file under assets/external/
    const MODELS = {
      boulder: 'rocks/boulder_01.glb', boulder_lod: 'rocks/boulder_01_lod.glb',
      coast_rocks: 'rocks/coast_rocks_02.glb', coast_rocks_lod: 'rocks/coast_rocks_02_lod.glb',
      anthurium: 'plants/anthurium_botany_01.glb', calathea: 'plants/calathea_orbifolia_01.glb', weed: 'plants/weed_plant_02.glb',
    };
    const files = Object.keys(MODELS);
    let done = 0;
    const models = await Promise.all(files.map((f) => gl.loadAsync(BASE + MODELS[f]).then((r) => { onProgress?.(++done / (files.length + 6)); return r; })));
    files.forEach((f, i) => { ASSETS.models[f] = extract(models[i]); });
    const tl = new THREE.TextureLoader();
    const TEX = {
      grassrock_diff: 'ground/aerial_grass_rock_diff.jpg', grassrock_nor: 'ground/aerial_grass_rock_nor.jpg',
      coastsand_diff: 'ground/coast_sand_rocks_02_diff.jpg', coastsand_nor: 'ground/coast_sand_rocks_02_nor.jpg',
      sand_diff: 'ground/sand_03_diff.jpg', sand_nor: 'ground/sand_03_nor.jpg',
    };
    const names = Object.keys(TEX);
    const texs = await Promise.all(names.map((n) => loadTex(tl, TEX[n], n.endsWith('diff')).then((t) => { onProgress?.(++done / (files.length + 6)); return t; })));
    names.forEach((n, i) => { ASSETS.tex[n] = texs[i]; });
    ASSETS.ok = texs.every(Boolean);
    // plants: plain standard material (no clear-coat/specular extensions), soft two-sided leaf lighting and wind sway
    const { patchFoliage } = await import('./materials.js');
    for (const k of ['calathea', 'anthurium', 'weed']) {
      const src = ASSETS.models[k][0].mat;
      // scanned leaf albedo is very dark; lift it and fake a little light passing through the leaves
      const m = patchFoliage(new THREE.MeshStandardMaterial({
        map: src.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, metalness: 0,
        color: new THREE.Color(1.75, 1.9, 1.55), emissiveMap: src.map, emissive: new THREE.Color(0.32, 0.38, 0.2),
      }), { wind: k === 'weed' ? 0.6 : 0.09, key: 'scan_' + k });
      for (const v of ASSETS.models[k]) v.mat = m;
    }
    for (const k of ['boulder', 'boulder_lod', 'coast_rocks', 'coast_rocks_lod']) for (const v of ASSETS.models[k]) { v.mat.roughness = 1; v.mat.metalness = 0; }
    await Promise.all(Object.entries(OPTIONAL_ANIMALS).map(([k, f]) => gl.loadAsync(BASE + f).then((r) => { ASSETS.animals[k] = r; }).catch(() => {})));
  } catch (e) {
    console.warn('assets failed, using procedural fallback', e);
    ASSETS.ok = false;
  }
  return ASSETS;
}
