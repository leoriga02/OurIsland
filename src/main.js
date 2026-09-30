import * as THREE from 'three';
import { Game } from './game/game.js';
import { makeRoomCode, normalizeCode } from './net/net.js';

const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer: coarse)').matches;
const quality = params.has('low') ? 0 : isMobile ? 1 : 2;

// Filmic grade: ACES + a little vibrance, soft S-curve and warm/cool split toning (free: runs in every material).
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) {
    vec3 c = ACESFilmicToneMapping( color );
    float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
    float gdom = smoothstep( 0.02, 0.22, c.g - max( c.r, c.b ) );
    c = mix( vec3( l ), c, 1.1 - gdom * 0.24 );
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
  const joinCode = normalizeCode(params.get('join'));
  const mode = joinCode.length === 5 ? 'guest' : 'solo';
  const game = new Game({ renderer, scene, camera, quality, canvas, mode });
  game.init();
  window.__game = game;
  game.onQualityChange = (high) => {
    const max = high ? Math.min(window.devicePixelRatio, quality >= 2 ? 2 : 1.75) : 1;
    pixelRatio = Math.min(pixelRatio, max);
    maxRatio = max;
    renderer.setPixelRatio(pixelRatio); onResize();
  };
  game.applySettings();

  const $ = (id) => document.getElementById(id);
  const startBtn = $('btn-start');
  const newBtn = $('btn-new');
  const show = (id) => { for (const m of ['menu-main', 'menu-join', 'menu-guest']) $(m).classList.toggle('hidden', m !== id); };
  if (game.loaded && mode === 'solo') {
    startBtn.textContent = 'Continua';
    newBtn.classList.remove('hidden');
  }
  $('title-hint').textContent = isMobile
    ? 'Sinistra: muovi · Destra: guarda · Tieni » per correre · Tasto grande: azione'
    : 'WASD muovi · Shift corri · Spazio salta · E azione · Trascina il mouse per guardare · Tab zaino · B costruisci';

  // character choice
  const cards = document.querySelectorAll('.char-card');
  const pickChar = (v) => { game.setCharacter(v); cards.forEach((c) => c.classList.toggle('sel', c.dataset.char === v)); };
  cards.forEach((c) => {
    c.querySelector('img').src = game.charIcons[c.dataset.char];
    c.addEventListener('click', () => pickChar(c.dataset.char));
  });
  pickChar(game.settings.character);

  const begin = () => {
    title.classList.add('gone');
    $('hud').classList.remove('hidden');
    game.start();
    if (isMobile && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  };
  startBtn.addEventListener('click', begin);
  newBtn.addEventListener('click', () => { if (confirm('Ricominciare su una nuova isola? I progressi andranno persi.')) { game.clearSave(); game.noSave = true; location.reload(); } });

  // host: open a room on this island and start playing right away
  $('btn-host').addEventListener('click', async () => {
    game.audio.unlock();
    begin();
    // reuse this device's last room code so a partner can reconnect after the host's page reloads
    let code;
    try { code = localStorage.getItem('ourisland-room') || makeRoomCode(); localStorage.setItem('ourisland-room', code); } catch { code = makeRoomCode(); }
    try { await game.startCoop('host', code); }
    catch (e) { game.ui.toast(null, 'Co-op non disponibile: ' + e.message, true); }
  });
  // join: reload into guest mode so the partner's world replaces this one cleanly
  $('btn-join').addEventListener('click', () => { show('menu-join'); setTimeout(() => $('join-code').focus(), 50); });
  $('btn-join-back').addEventListener('click', () => show('menu-main'));
  const goJoin = () => {
    const code = normalizeCode($('join-code').value);
    if (code.length !== 5) { $('join-code').focus(); return; }
    game.save();
    const q = new URLSearchParams(location.search); q.set('join', code); q.delete('autostart');
    location.search = q.toString();
  };
  $('btn-join-go').addEventListener('click', goJoin);
  $('join-code').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') goJoin(); });
  $('join-code').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });

  if (mode === 'guest') {
    show('menu-guest');
    $('guest-label').textContent = `Raggiungi l’isola del compagno · stanza ${joinCode}`;
    const status = $('guest-status');
    $('btn-guest-solo').addEventListener('click', () => { const q = new URLSearchParams(location.search); q.delete('join'); location.search = q.toString(); });
    let joining = false;
    const goGuest = async () => {
      if (joining) return;
      joining = true;
      game.audio.unlock();
      $('btn-guest-go').disabled = true;
      status.textContent = 'Connessione…';
      game.onCoopReady = () => { status.textContent = ''; begin(); };
      game.onCoopStatus = (s) => {
        if (game.started) return;
        status.textContent = { connecting: 'Connessione…', searching: `Ricerca stanza ${joinCode}… (il gioco del compagno è aperto?)`, reconnecting: 'Nuovo tentativo…', offline: 'Nessuna connessione, nuovo tentativo…', connected: 'Connesso! Caricamento isola…' }[s] || s;
      };
      try { await game.startCoop('guest', joinCode); }
      catch (e) { status.textContent = 'Impossibile avviare il co-op: ' + e.message; joining = false; $('btn-guest-go').disabled = false; }
    };
    $('btn-guest-go').addEventListener('click', goGuest);
    if (params.has('autojoin')) goGuest();
  }
  window.addEventListener('beforeunload', () => game.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });

  // compile shaders before revealing
  renderer.compile(scene, camera);
  loading.classList.add('gone');
  if (params.has('autostart') && mode === 'solo') begin();
  if (params.has('autohost') && mode === 'solo') $('btn-host').click();

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
  loading.innerHTML = '<div style="padding:20px;max-width:90vw;font-family:sans-serif">Qualcosa è andato storto: ' + e.message + '</div>';
});
