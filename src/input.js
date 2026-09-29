// Touch (floating joystick + drag-to-look) and keyboard/mouse input.
export class Input {
  constructor(el, ui) {
    this.el = el;
    this.move = { x: 0, y: 0 };   // joystick / keys, y = forward
    this.look = { dx: 0, dy: 0 }; // accumulated pixels
    this.zoom = 0;
    this.keys = new Set();
    this.sprintToggle = false;
    this.actionHeld = false;
    this.jumpPressed = false;
    this.enabled = true;
    this.lastLookTime = 0;
    this.touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookTouch = { id: null, x: 0, y: 0 };
    this.pinch = null;
    this.joyBase = document.getElementById('joy');
    this.joyKnob = document.getElementById('joy-knob');

    const opts = { passive: false };
    el.addEventListener('touchstart', (e) => this._ts(e), opts);
    el.addEventListener('touchmove', (e) => this._tm(e), opts);
    el.addEventListener('touchend', (e) => this._te(e), opts);
    el.addEventListener('touchcancel', (e) => this._te(e), opts);

    // mouse
    let drag = false, lx = 0, ly = 0;
    el.addEventListener('mousedown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', () => { drag = false; });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === el) { this._addLook(e.movementX, e.movementY); return; }
      if (!drag) return;
      this._addLook(e.clientX - lx, e.clientY - ly);
      lx = e.clientX; ly = e.clientY;
    });
    el.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY) * 0.6; e.preventDefault(); }, opts);

    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpPressed = true;
      this.onKey?.(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.actionHeld = false; });
  }

  _addLook(dx, dy) {
    if (!this.enabled) return;
    this.look.dx += dx; this.look.dy += dy;
    this.lastLookTime = performance.now();
  }

  _ts(e) {
    e.preventDefault();
    const W = window.innerWidth;
    for (const t of e.changedTouches) {
      if (t.clientX < W * 0.42 && this.joy.id === null) {
        this.joy.id = t.identifier;
        this.joy.ox = t.clientX; this.joy.oy = t.clientY;
        this.joy.x = 0; this.joy.y = 0;
        this.joyBase.style.left = t.clientX + 'px';
        this.joyBase.style.top = t.clientY + 'px';
        this.joyBase.classList.add('active');
        this.joyKnob.style.transform = 'translate(-50%,-50%)';
      } else if (this.lookTouch.id === null) {
        this.lookTouch.id = t.identifier;
        this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
      } else if (!this.pinch) {
        this.pinch = { id: t.identifier, d: Math.hypot(t.clientX - this.lookTouch.x, t.clientY - this.lookTouch.y) };
      }
    }
  }
  _tm(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        const R = 55;
        let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        this.joy.x = dx / R; this.joy.y = -dy / R;
        this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (t.identifier === this.lookTouch.id) {
        if (this.pinch) continue;
        this._addLook((t.clientX - this.lookTouch.x) * 1.25, (t.clientY - this.lookTouch.y) * 1.25);
        this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
      } else if (this.pinch && t.identifier === this.pinch.id) {
        const d = Math.hypot(t.clientX - this.lookTouch.x, t.clientY - this.lookTouch.y);
        this.zoom -= (d - this.pinch.d) * 0.02;
        this.pinch.d = d;
      }
    }
  }
  _te(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        this.joy.id = null; this.joy.x = this.joy.y = 0;
        this.joyBase.classList.remove('active');
      } else if (t.identifier === this.lookTouch.id) {
        this.lookTouch.id = null;
        this.pinch = null;
      } else if (this.pinch && t.identifier === this.pinch.id) {
        this.pinch = null;
      }
    }
  }

  // Called each frame; returns movement intent
  poll() {
    let x = this.joy.x, y = this.joy.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    if (!this.enabled) { x = 0; y = 0; }
    const mag = Math.min(1, Math.hypot(x, y));
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') || (this.joy.id !== null && mag > 0.92) || this.sprintToggle;
    const jump = this.jumpPressed && this.enabled; this.jumpPressed = false;
    const action = this.enabled && (this.actionHeld || k.has('KeyE') || k.has('KeyF'));
    const look = { dx: this.look.dx, dy: this.look.dy }; this.look.dx = this.look.dy = 0;
    const zoom = this.zoom; this.zoom = 0;
    return { x, y, mag, sprint, jump, action, look, zoom };
  }
}
