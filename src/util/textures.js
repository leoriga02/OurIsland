// Procedural canvas textures: leaves, fronds, grass, bark, planks, thatch, clouds, particles.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(c, { repeat = false, srgb = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  t.generateMipmaps = mips;
  t.needsUpdate = true;
  return t;
}

const cache = {};
function cached(key, fn) { return cache[key] || (cache[key] = fn()); }

// Palm frond: a central rib with drooping leaflets. Drawn along the texture's V axis (bottom = base).
export function palmFrondTexture() {
  return cached('frond', () => {
    const W = 256, H = 512;
    const c = canvas(W, H), g = c.getContext('2d');
    const r = mulberry32(7);
    const cx = W / 2;
    for (let i = 0; i < 44; i++) {
      const t = i / 44;
      const y = H * (0.97 - t * 0.93);
      const len = (Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.85 + 0.15) * W * 0.48;
      for (const side of [-1, 1]) {
        const ang = (0.55 + r() * 0.25) * side;
        const ex = cx + side * len;
        const ey = y - len * 0.55 + r() * 10;
        const grd = g.createLinearGradient(cx, y, ex, ey);
        const l = 28 + r() * 12;
        grd.addColorStop(0, `hsl(${95 + r() * 10},55%,${l - 8}%)`);
        grd.addColorStop(1, `hsl(${80 + r() * 18},60%,${l + 8}%)`);
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(cx, y + 3);
        g.quadraticCurveTo(cx + side * len * 0.5, y - len * 0.1 - ang * 4, ex, ey);
        g.quadraticCurveTo(cx + side * len * 0.45, y - len * 0.32, cx, y - 7);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(20,40,10,0.35)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + side * len * 0.5, y - len * 0.2, ex, ey); g.stroke();
      }
    }
    g.strokeStyle = '#8a8a3a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, H * 0.03); g.stroke();
    return tex(c);
  });
}

// A cluster of broad tropical leaves, used for bushes & jungle canopies (leaf cards).
export function leafClusterTexture(hue = 100, key = 'leaf') {
  return cached(key + hue, () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    const r = mulberry32(hue * 13 + 3);
    for (let i = 0; i < 26; i++) {
      const x = S * (0.15 + r() * 0.7), y = S * (0.15 + r() * 0.7);
      const a = r() * Math.PI * 2;
      const L = S * (0.13 + r() * 0.12), Wd = L * (0.38 + r() * 0.1);
      g.save(); g.translate(x, y); g.rotate(a);
      const l = 26 + r() * 22;
      const grd = g.createLinearGradient(-L, 0, L, 0);
      grd.addColorStop(0, `hsl(${hue - 8 + r() * 12},55%,${l - 10}%)`);
      grd.addColorStop(1, `hsl(${hue + r() * 16},62%,${l + 6}%)`);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(-L, 0);
      g.quadraticCurveTo(0, -Wd, L, 0);
      g.quadraticCurveTo(0, Wd, -L, 0);
      g.fill();
      g.strokeStyle = 'rgba(210,230,150,0.35)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-L * 0.9, 0); g.lineTo(L * 0.95, 0); g.stroke();
      g.restore();
    }
    return tex(c);
  });
}

export function bananaLeafTexture() {
  return cached('banana', () => {
    const W = 128, H = 512;
    const c = canvas(W, H), g = c.getContext('2d');
    const r = mulberry32(99);
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#3f7d25'); grd.addColorStop(0.5, '#6aa43a'); grd.addColorStop(1, '#3a7422');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(W / 2, H);
    g.bezierCurveTo(W * 1.05, H * 0.7, W * 1.02, H * 0.2, W / 2, 0);
    g.bezierCurveTo(-W * 0.02, H * 0.2, -W * 0.05, H * 0.7, W / 2, H);
    g.fill();
    // tears
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const y = H * (0.15 + r() * 0.7), side = r() < 0.5 ? 0 : W;
      g.beginPath(); g.moveTo(side, y); g.lineTo(W / 2 + (side ? 6 : -6), y - 18); g.lineTo(side, y - 8); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(40,70,20,0.35)'; g.lineWidth = 1;
    for (let y = 10; y < H; y += 7) {
      g.beginPath(); g.moveTo(W / 2, y); g.lineTo(0, y - 30); g.moveTo(W / 2, y); g.lineTo(W, y - 30); g.stroke();
    }
    g.strokeStyle = '#b5c46a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 4); g.stroke();
    return tex(c);
  });
}

export function grassTexture() {
  return cached('grass', () => {
    const W = 128, H = 128;
    const c = canvas(W, H), g = c.getContext('2d');
    const r = mulberry32(5);
    for (let i = 0; i < 38; i++) {
      const x = 8 + r() * (W - 16);
      const h = H * (0.45 + r() * 0.55);
      const lean = (r() - 0.5) * 30;
      const w = 2 + r() * 3;
      const l = 30 + r() * 25;
      const grd = g.createLinearGradient(0, H, 0, H - h);
      grd.addColorStop(0, `hsl(95,50%,${l - 15}%)`);
      grd.addColorStop(1, `hsl(${78 + r() * 20},55%,${l + 10}%)`);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x - w, H); g.quadraticCurveTo(x + lean * 0.3, H - h * 0.5, x + lean, H - h);
      g.quadraticCurveTo(x + lean * 0.3 + w * 0.5, H - h * 0.5, x + w, H);
      g.fill();
    }
    return tex(c);
  });
}

export function fiberPlantTexture() {
  return cached('fiberplant', () => {
    const W = 128, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const r = mulberry32(55);
    for (let i = 0; i < 26; i++) {
      const x = W / 2 + (r() - 0.5) * 30;
      const h = H * (0.6 + r() * 0.4);
      const lean = (r() - 0.5) * 110;
      const l = 45 + r() * 15;
      g.strokeStyle = `hsl(${55 + r() * 20},45%,${l}%)`;
      g.lineWidth = 2 + r() * 2;
      g.beginPath(); g.moveTo(x, H); g.quadraticCurveTo(x + lean * 0.2, H - h * 0.6, x + lean, H - h); g.stroke();
    }
    return tex(c);
  });
}

export function flowerTexture() {
  return cached('flower', () => {
    const S = 128;
    const c = canvas(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    for (let i = 0; i < 5; i++) {
      g.rotate(Math.PI * 2 / 5);
      const grd = g.createLinearGradient(0, 0, 0, -S * 0.45);
      grd.addColorStop(0, '#7a0a18'); grd.addColorStop(0.3, '#d8243a'); grd.addColorStop(1, '#ff5a5a');
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(0, -S * 0.22, S * 0.15, S * 0.24, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
    return tex(c);
  });
}

// Tiling grey noise used as terrain detail map.
export function detailNoiseTexture() {
  return cached('detail', () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const r = mulberry32(11);
    // value noise with wrap
    const grid = 32, vals = [];
    for (let i = 0; i < grid * grid; i++) vals.push(r());
    const vn = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const v = (a, b) => vals[((b % grid + grid) % grid) * grid + ((a % grid + grid) % grid)];
      const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
      return (v(xi, yi) * (1 - sx) + v(xi + 1, yi) * sx) * (1 - sy) + (v(xi, yi + 1) * (1 - sx) + v(xi + 1, yi + 1) * sx) * sy;
    };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = vn(x / 8, y / 8) * 0.5 + vn(x / 4, y / 4) * 0.3 + r() * 0.2;
      const v = Math.floor(170 + n * 85);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c, { repeat: true, srgb: false });
  });
}

// Tiling grass-blade detail (grayscale) for the terrain.
export function grassDetailTexture() {
  return cached('grassDetail', () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = 'rgb(200,200,200)'; g.fillRect(0, 0, S, S);
    const r = mulberry32(17);
    for (let i = 0; i < 2600; i++) {
      const x = r() * S, y = r() * S, l = 3 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
      const v = Math.floor(120 + r() * 135);
      g.strokeStyle = `rgba(${v},${v},${v},0.85)`;
      g.lineWidth = 1 + r() * 1.2;
      for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
        if (x + ox < -10 || x + ox > S + 10 || y + oy < -10 || y + oy > S + 10) continue;
        g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke();
      }
    }
    // green channel: large soft blotches (used as macro variation)
    const img = g.getImageData(0, 0, S, S);
    const vals = []; const grid = 8;
    for (let i = 0; i < grid * grid; i++) vals.push(r());
    const vn = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const v = (a, b) => vals[((b % grid + grid) % grid) * grid + ((a % grid + grid) % grid)];
      const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
      return (v(xi, yi) * (1 - sx) + v(xi + 1, yi) * sx) * (1 - sy) + (v(xi, yi + 1) * (1 - sx) + v(xi + 1, yi + 1) * sx) * sy;
    };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) img.data[(y * S + x) * 4 + 1] = Math.floor(vn(x / 32, y / 32) * 255);
    g.putImageData(img, 0, 0);
    return tex(c, { repeat: true, srgb: false });
  });
}

// Sand grains + faint ripples.
export function sandDetailTexture() {
  return cached('sandDetail', () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const r = mulberry32(23);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const rip = Math.sin((y + Math.sin(x / 19) * 6) / S * Math.PI * 2 * 9) * 0.5 + 0.5;
      const v = 205 + rip * 22 + (r() - 0.5) * 40;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v)); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 260; i++) { // pebbles / shell bits
      const v = Math.floor(140 + r() * 110);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.arc(r() * S, r() * S, 0.6 + r() * 1.4, 0, 7); g.fill();
    }
    return tex(c, { repeat: true, srgb: false });
  });
}

// Streaky weathered limestone (grayscale): vertical rain streaks, cracks and ledges.
export function rockDetailTexture() {
  return cached('rockDetail', () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = 'rgb(200,200,200)'; g.fillRect(0, 0, S, S);
    const r = mulberry32(61);
    const wrapDraw = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
    for (let i = 0; i < 90; i++) { // soft blotches
      const x = r() * S, y = r() * S, rad = 10 + r() * 40, v = Math.floor(150 + r() * 100);
      wrapDraw(() => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${v},${v},${v},0.5)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); });
    }
    for (let i = 0; i < 160; i++) { // vertical streaks
      const x = r() * S, y = r() * S, l = 20 + r() * 90, v = Math.floor(90 + r() * 80);
      wrapDraw(() => { g.strokeStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.35})`; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + (r() - 0.5) * 6, y + l * 0.3, x + (r() - 0.5) * 6, y + l * 0.6, x + (r() - 0.5) * 4, y + l); g.stroke(); });
    }
    for (let i = 0; i < 22; i++) { // horizontal ledges / bedding planes
      const y = r() * S, v = Math.floor(60 + r() * 50);
      wrapDraw(() => { g.strokeStyle = `rgba(${v},${v},${v},0.55)`; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= S; x += 16) g.lineTo(x, y + (r() - 0.5) * 5); g.stroke(); g.strokeStyle = 'rgba(245,245,245,0.35)'; g.beginPath(); g.moveTo(0, y + 2.5); g.lineTo(S, y + 2.5 + (r() - 0.5) * 4); g.stroke(); });
    }
    return tex(c, { repeat: true, srgb: false });
  });
}

export function barkTexture(base = [120, 88, 60], key = 'bark') {
  return cached(key, () => {
    const W = 128, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const r = mulberry32(21 + base[0]);
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 400; i++) {
      const x = r() * W, y = r() * H, l = 4 + r() * 30;
      const d = (r() - 0.5) * 60;
      g.strokeStyle = `rgba(${base[0] + d},${base[1] + d},${base[2] + d},0.6)`;
      g.lineWidth = 1 + r() * 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + l); g.stroke();
    }
    // horizontal ring bands (palm-like)
    if (key.startsWith('palm')) {
      for (let y = 0; y < H; y += 16 + r() * 6) {
        g.fillStyle = 'rgba(40,25,15,0.45)'; g.fillRect(0, y, W, 2 + r() * 2);
        g.fillStyle = 'rgba(255,230,190,0.12)'; g.fillRect(0, y + 3, W, 3);
      }
    }
    return tex(c, { repeat: true });
  });
}

export function planksTexture() {
  return cached('planks', () => {
    const W = 256, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const r = mulberry32(31);
    const n = 5, ph = H / n;
    for (let i = 0; i < n; i++) {
      const b = 0.85 + r() * 0.3;
      g.fillStyle = `rgb(${135 * b},${92 * b},${58 * b})`;
      g.fillRect(0, i * ph, W, ph);
      for (let k = 0; k < 40; k++) {
        const y = i * ph + r() * ph;
        g.strokeStyle = `rgba(${60 + r() * 40},${40 + r() * 20},20,0.35)`;
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 4, W * 0.6, y + (r() - 0.5) * 4, W, y + (r() - 0.5) * 3); g.stroke();
      }
      g.fillStyle = 'rgba(30,18,8,0.8)'; g.fillRect(0, i * ph, W, 3);
      g.fillStyle = 'rgba(255,220,170,0.15)'; g.fillRect(0, i * ph + 3, W, 2);
      // nails
      g.fillStyle = '#2a2320';
      g.beginPath(); g.arc(10, i * ph + ph / 2, 2.5, 0, 7); g.arc(W - 10, i * ph + ph / 2, 2.5, 0, 7); g.fill();
    }
    return tex(c, { repeat: true });
  });
}

export function thatchTexture() {
  return cached('thatch', () => {
    const W = 256, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const r = mulberry32(41);
    g.fillStyle = '#7a5e33'; g.fillRect(0, 0, W, H);
    for (let row = 0; row < 6; row++) {
      const y0 = row * (H / 6);
      for (let i = 0; i < 220; i++) {
        const x = r() * W, y = y0 + r() * 8;
        const l = H / 6 + 10 + r() * 14;
        const lt = 40 + r() * 25;
        g.strokeStyle = `hsl(${36 + r() * 12},${45 + r() * 15}%,${lt}%)`;
        g.lineWidth = 1 + r() * 1.5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + l); g.stroke();
      }
      g.fillStyle = 'rgba(40,25,10,0.5)'; g.fillRect(0, y0 + H / 6 - 3, W, 3);
    }
    return tex(c, { repeat: true });
  });
}

export function cloudTexture(seed = 1) {
  return cached('cloud' + seed, () => {
    const W = 512, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const r = mulberry32(seed * 77);
    const puffs = 16 + Math.floor(r() * 8);
    // shadowed underside then bright tops
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < puffs; i++) {
        const t = i / puffs;
        const x = W * (0.12 + t * 0.76) + (r() - 0.5) * 40;
        const y = H * (0.62 - Math.sin(t * Math.PI) * 0.22) + (r() - 0.5) * 20;
        const rad = (30 + r() * 45) * (0.6 + Math.sin(t * Math.PI) * 0.6);
        const grd = g.createRadialGradient(x, y - (pass ? rad * 0.3 : -rad * 0.1), rad * 0.1, x, y, rad);
        if (pass === 0) {
          grd.addColorStop(0, 'rgba(190,200,215,0.9)'); grd.addColorStop(1, 'rgba(190,200,215,0)');
        } else {
          grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.6, 'rgba(250,250,252,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        }
        g.fillStyle = grd;
        g.beginPath(); g.arc(x, y - (pass ? rad * 0.25 : 0), rad, 0, Math.PI * 2); g.fill();
      }
    }
    return tex(c, { mips: true });
  });
}

export function softDotTexture() {
  return cached('dot', () => {
    const S = 64;
    const c = canvas(S, S), g = c.getContext('2d');
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    return tex(c);
  });
}

export function flameTexture() {
  return cached('flame', () => {
    const W = 64, H = 128;
    const c = canvas(W, H), g = c.getContext('2d');
    const grd = g.createRadialGradient(W / 2, H * 0.7, 2, W / 2, H * 0.62, H * 0.5);
    grd.addColorStop(0, 'rgba(255,250,210,1)');
    grd.addColorStop(0.25, 'rgba(255,200,80,0.95)');
    grd.addColorStop(0.55, 'rgba(255,110,20,0.6)');
    grd.addColorStop(1, 'rgba(200,40,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.bezierCurveTo(W * 0.95, H * 0.45, W * 0.95, H * 0.95, W / 2, H);
    g.bezierCurveTo(W * 0.05, H * 0.95, W * 0.05, H * 0.45, W / 2, 0);
    g.fill();
    return tex(c);
  });
}

export function woodEndTexture() {
  return cached('woodend', () => {
    const S = 128;
    const c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#c9975e'; g.fillRect(0, 0, S, S);
    for (let i = 12; i > 0; i--) {
      g.strokeStyle = i % 2 ? 'rgba(120,70,30,0.45)' : 'rgba(230,180,120,0.3)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(S / 2 + Math.sin(i) * 1.5, S / 2, i * 5, 0, Math.PI * 2); g.stroke();
    }
    g.strokeStyle = '#5a3a1e'; g.lineWidth = 8;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.stroke();
    return tex(c);
  });
}

export function waterfallTexture() {
  return cached('waterfall', () => {
    const W = 128, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const r = mulberry32(3);
    g.fillStyle = 'rgba(200,235,245,0.55)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) {
      const x = r() * W, y = r() * H, l = 20 + r() * 80;
      g.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`;
      g.lineWidth = 1 + r() * 3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + l); g.stroke();
      if (y + l > H) { g.beginPath(); g.moveTo(x, y - H); g.lineTo(x, y + l - H); g.stroke(); }
    }
    return tex(c, { repeat: true });
  });
}
