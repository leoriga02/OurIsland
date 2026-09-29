import * as THREE from 'three';
import { Game } from './game/game.js';

const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer: coarse)').matches;
const quality = params.has('low') ? 0 : isMobile ? 1 : 2;

// Filmic grade: ACES + a little vibrance, soft S-curve and warm/cool split toning (free: runs in every material).
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) {
    vec3 c = ACESFilmicToneMapping( color );
    float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
    c = mix( vec3( l ), c, 1.17 );
    c = mix( c, c * c * ( 3.0 - 2.0 * c ), 0.2 );
    c += vec3( 0.02, 0.009, -0.012 ) * smoothstep( 0.35, 0.95, l );
    c += vec3( -0.012, 0.002, 0.02 ) * ( 1.0 - smoothstep( 0.0, 0.35, l ) );
    return saturate( c );
  }`);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality > 0, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio, quality >= 2 ? 2 : 1.75);
let maxRatio = pixelRatio;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = params.has('aces') ? THREE.ACESFilmicToneMapping : THREE.CustomToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 3000);

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = camera.aspect < 1.2 ? 72 : camera.aspect > 1.9 ? 55 : 60;
  if (window.__game) window.__game.rig.baseFov = camera.fov;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

const loading = document.getElementById('loading');
const title = document.getElementById('title');

async function boot() {
  await new Promise((r) => setTimeout(r, 30));
  const game = new Game({ renderer, scene, camera, quality, canvas });
  game.init();
  window.__game = game;
  game.onQualityChange = (high) => {
    const max = high ? Math.min(window.devicePixelRatio, quality >= 2 ? 2 : 1.75) : 1;
    pixelRatio = Math.min(pixelRatio, max);
    maxRatio = max;
    renderer.setPixelRatio(pixelRatio); onResize();
  };
  game.applySettings();

  const startBtn = document.getElementById('btn-start');
  const newBtn = document.getElementById('btn-new');
  if (game.loaded) {
    startBtn.textContent = 'Continue';
    newBtn.classList.remove('hidden');
  }
  document.getElementById('title-hint').textContent = isMobile
    ? 'Left thumb: move (push to the edge to sprint) · Right thumb: look · Big button: act'
    : 'WASD move · Shift sprint · Space jump · E act · Drag mouse to look · Tab backpack · B build';
  const begin = () => {
    title.classList.add('gone');
    document.getElementById('hud').classList.remove('hidden');
    game.start();
    if (isMobile && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  };
  startBtn.addEventListener('click', begin);
  newBtn.addEventListener('click', () => { game.clearSave(); location.reload(); });
  window.addEventListener('beforeunload', () => game.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });

  // compile shaders before revealing
  renderer.compile(scene, camera);
  loading.classList.add('gone');
  if (params.has('autostart')) begin();

  let last = performance.now();
  let fpsAcc = 0, fpsN = 0, fpsT = 0;
  function frame(now) {
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    game.update(dt);
    renderer.render(scene, camera);
    // adaptive resolution
    const real = Math.min((now - (frame.prev || now)) / 1000, 0.5); frame.prev = now;
    fpsAcc += real; fpsN++; fpsT += real;
    if (fpsT > 3) {
      const fps = fpsN / fpsAcc;
      if (fps < 40 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); onResize(); }
      else if (fps > 58 && pixelRatio < maxRatio - 0.05) { pixelRatio = Math.min(maxRatio, pixelRatio + 0.1); renderer.setPixelRatio(pixelRatio); onResize(); }
      fpsAcc = 0; fpsN = 0; fpsT = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
boot().catch((e) => {
  console.error(e);
  loading.innerHTML = '<div style="padding:20px;max-width:90vw;font-family:sans-serif">Something went wrong: ' + e.message + '</div>';
});
