// Item icons rendered from the real 3D models, plus small SVG UI glyphs.
import * as THREE from 'three';
import { itemMesh } from '../game/items.js';

export class IconFactory {
  constructor() {
    this.cache = {};
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    this.renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(128, 128, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x404850, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.6);
    d.position.set(2, 4, 3);
    this.scene.add(d);
    const r = new THREE.DirectionalLight(0x9fc8ff, 0.8);
    r.position.set(-3, 1, -2);
    this.scene.add(r);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
  }

  render(key, obj, { rx = -0.45, ry = 0.6, rz = 0, pad = 1.2 } = {}) {
    if (this.cache[key]) return this.cache[key];
    if (this.disposed) return '';
    const holder = new THREE.Group();
    holder.add(obj);
    obj.rotation.set(0, 0, rz);
    holder.rotation.set(0, ry, 0);
    const outer = new THREE.Group();
    outer.add(holder);
    outer.rotation.x = -rx;
    this.scene.add(outer);
    outer.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(outer);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    outer.position.sub(center);
    const r = Math.max(size.x, size.y, size.z) * 0.5 * pad;
    const dist = r / Math.tan((this.camera.fov / 2) * Math.PI / 180);
    this.camera.position.set(0, 0, dist + size.z);
    this.camera.lookAt(0, 0, 0);
    this.camera.near = dist * 0.1; this.camera.far = dist * 10;
    this.camera.updateProjectionMatrix();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(outer);
    this.cache[key] = url;
    return url;
  }

  item(id) {
    const tweaks = {
      axe: { rz: -0.8, rx: -0.2, ry: 0.2 }, pickaxe: { rz: -0.8, rx: -0.2, ry: 0.2 }, torch: { rz: -0.6, rx: -0.2, ry: 0.3 },
      stick: { rz: 0.5, rx: -0.4 }, wood: { rx: -0.5, ry: 0.5, rz: 0.25 }, leaf: { rx: -0.2, ry: 0.4 },
      fiber: { rx: -0.3 }, campfire: { rx: -0.7 }, bed: { rx: -0.8, ry: 0.7 }, rope: { rx: -0.9 },
      crab_raw: { rx: -0.8 }, crab_cooked: { rx: -0.8 },
    };
    return this.render('item:' + id, itemMesh(id), tweaks[id] || {});
  }

  dispose() {
    this.disposed = true;
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
export const SVG = {
  heart: svg('<path fill="#ff5a4a" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/>'),
  drop: svg('<path fill="#5fc8ff" d="M12 2.5s-6.5 7.3-6.5 11.8a6.5 6.5 0 0013 0C18.5 9.8 12 2.5 12 2.5z"/><path fill="#fff" opacity=".5" d="M9 14a3 3 0 002 3 .8.8 0 01-.6 1.4A4.6 4.6 0 017.5 14 .75.75 0 019 14z"/>'),
  food: svg('<path fill="#f0a030" d="M15.8 3.2a5.2 5.2 0 00-6.9 7.7l-4.4 4.4a2 2 0 10.8 2.6 2 2 0 102.6.8l4.4-4.4a5.2 5.2 0 003.5-11.1z"/><path fill="#fff3d0" d="M5.3 16.1l2.6 2.6-1 1a2 2 0 01-2.6-2.6z" opacity=".8"/>'),
  bag: svg('<path fill="#d9b27a" d="M8 6V5a4 4 0 018 0v1h1.5A2.5 2.5 0 0120 8.5V19a3 3 0 01-3 3H7a3 3 0 01-3-3V8.5A2.5 2.5 0 016.5 6H8zm2 0h4V5a2 2 0 00-4 0v1z"/><rect x="7" y="12" width="10" height="5" rx="1.5" fill="#8a6236"/><rect x="11" y="11" width="2" height="3" rx=".6" fill="#f3d9a6"/>'),
  hammer: svg('<path fill="#c8a06a" d="M13.2 9.6l1.4 1.4-8.3 8.3a1 1 0 01-1.4 0l-.1-.1a1 1 0 010-1.4z"/><path fill="#9aa3ab" d="M11.5 4.4l3-1.9 6.9 6.9-2.3 2.3-1.8-1.8-1.8 1.8-4.7-4.7 1.8-1.8z"/>'),
  jump: svg('<path fill="#fff" d="M12 3l6 7h-4v6h-4v-6H6z"/><rect x="6" y="18" width="12" height="2.5" rx="1.2" fill="#fff" opacity=".8"/>'),
  hand: svg('<path fill="#f3d2b0" d="M8 11V5.5a1.5 1.5 0 013 0V10h.5V4a1.5 1.5 0 013 0v6h.5V5.5a1.5 1.5 0 013 0V14c0 4.4-2.6 8-7 8-3 0-4.6-1.6-6.1-3.9L3 14.7c-.8-1.2.9-2.6 2-1.5L8 16z"/>'),
  craft: svg('<path fill="#c8a06a" d="M4.6 17.9l7.9-7.9 1.5 1.5-7.9 7.9a1 1 0 01-1.5 0 1 1 0 010-1.5z"/><path fill="#9aa3ab" d="M13 3.5l2-1 4.5 4.5-1 2L17 7.5 15.5 9 12 5.5 13.5 4z"/><path fill="#c8a06a" d="M19.4 17.9L11.5 10 10 11.5l7.9 7.9a1 1 0 001.5 0 1 1 0 000-1.5z"/><path fill="#b8c0c8" d="M4 4l4 1 3 3-2 2-3-3z"/>'),
  house: svg('<path fill="#d9a860" d="M12 3l9 8h-2.5v9h-5v-6h-3v6h-5v-9H3z"/><path fill="#8a5a2a" d="M12 3l9 8h-2.5L12 5.3 5.5 11H3z"/>'),
  moon: svg('<path fill="#ffe7a0" d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>'),
  fire: svg('<path fill="#ff8a2a" d="M12 2s5 4.7 5 10a5 5 0 01-10 0c0-2.4 1.2-4 2.2-5-.1 1.8.6 3 1.8 3.4C11 7.5 12 2 12 2z"/><path fill="#ffd060" d="M12 11s2.5 2 2.5 4.2a2.5 2.5 0 01-5 0c0-1.3.8-2.3 1.4-2.8.3.9.8 1.2 1.1 1.3-.2-1.2 0-2.7 0-2.7z"/>'),
  drink: svg('<path fill="#5fc8ff" d="M12 3s-5.5 6.2-5.5 10a5.5 5.5 0 0011 0C17.5 9.2 12 3 12 3z"/><path fill="#fff" d="M4 20h16v1.5H4z" opacity=".6"/>'),
  eat: svg('<circle cx="12" cy="13" r="7" fill="#c0182a"/><path fill="#3a8a2a" d="M12 6c1-2.5 3.5-3 5-2.5-1 2-3 3-5 2.5z"/>'),
  x: svg('<path stroke="#fff" stroke-width="2.5" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>'),
  sprint: svg('<circle cx="14.5" cy="4.5" r="2.2" fill="#fff"/><path fill="#fff" d="M9 8.5l4-1.3 2.8 3.3 3 1-.6 1.8-3.8-1.2-1.5-1.6-1.3 3.4 2.6 2.5-1.1 5.1-2-.4.9-4-2.8-2.4-1.3 3.4-4.2 1.2-.6-1.8 3.3-1 2.7-6.6-1.6.6-1 2.6-1.8-.7z"/>'),
};
