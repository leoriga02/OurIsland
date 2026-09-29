import { ITEMS } from './items.js';

export const HOTBAR = 8;

export class Inventory {
  constructor(size = 24) {
    this.slots = new Array(size).fill(null);
    this.listeners = [];
  }
  onChange(fn) { this.listeners.push(fn); }
  emit(info) { for (const f of this.listeners) f(info); }

  count(id) { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.n; return n; }

  has(cost) { for (const k in cost) if (this.count(k) < cost[k]) return false; return true; }

  // Adds items, preferring existing stacks, then hotbar slots, then the backpack. Returns amount not added.
  add(id, n = 1) {
    const max = ITEMS[id].stack;
    let left = n;
    let firstSlot = -1;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.n < max) {
        const k = Math.min(max - s.n, left); s.n += k; left -= k;
        if (firstSlot < 0) firstSlot = i;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const k = Math.min(max, left);
        this.slots[i] = { id, n: k }; left -= k;
        if (firstSlot < 0) firstSlot = i;
      }
    }
    if (left < n) this.emit({ added: id, n: n - left, slot: firstSlot });
    return left;
  }

  remove(id, n = 1) {
    let left = n;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const k = Math.min(s.n, left); s.n -= k; left -= k;
        if (s.n <= 0) this.slots[i] = null;
      }
    }
    this.emit({ removed: id });
    return n - left;
  }

  removeAt(i, n = 1) {
    const s = this.slots[i];
    if (!s) return;
    s.n -= n;
    if (s.n <= 0) this.slots[i] = null;
    this.emit({ removed: s.id });
  }

  consume(cost) {
    if (!this.has(cost)) return false;
    for (const k in cost) this.remove(k, cost[k]);
    return true;
  }

  swap(a, b) {
    const t = this.slots[a]; this.slots[a] = this.slots[b]; this.slots[b] = t;
    this.emit({ moved: true });
  }

  toJSON() { return this.slots; }
  load(arr) {
    this.slots = this.slots.map((_, i) => (arr[i] && ITEMS[arr[i].id] ? { id: arr[i].id, n: arr[i].n } : null));
    this.emit({ loaded: true });
  }
}
