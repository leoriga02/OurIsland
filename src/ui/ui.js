// DOM HUD, hotbar, inventory/crafting panel, build bar, minimap.
import { ITEMS, RECIPES, PIECES } from '../game/items.js';
import { HOTBAR } from '../game/inventory.js';
import { SVG } from './icons.js';
import { WORLD_SIZE } from '../world/terrain.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.g = game;
    this.icons = game.icons;
    this.stats = { health: $('st-health'), water: $('st-water'), food: $('st-food') };
    this.stats.health.querySelector('.ic').innerHTML = SVG.heart;
    this.stats.water.querySelector('.ic').innerHTML = SVG.drop;
    this.stats.food.querySelector('.ic').innerHTML = SVG.food;
    $('btn-bag').querySelector('.glyph').innerHTML = SVG.bag;
    $('btn-build').querySelector('.glyph').innerHTML = SVG.hammer;
    $('btn-jump').querySelector('.glyph').innerHTML = SVG.jump;
    $('btn-sprint').querySelector('.glyph').innerHTML = SVG.sprint;
    const tabs = document.querySelectorAll('#tabs .tab');
    tabs[0].innerHTML = SVG.bag; tabs[1].innerHTML = SVG.craft; tabs[2].innerHTML = SVG.house; tabs[3].innerHTML = SVG.gear;
    this.hotbar = $('hotbar');
    this.toasts = $('toasts');
    this.quest = $('quest');
    this.panel = $('panel');
    this.tab = 'inv';
    this.selSlot = -1;
    this.craftSel = 0;
    this.buildSel = 'foundation';
    this.mm = $('minimap').getContext('2d');
    this.mapImg = game.terrain.buildMapImage(384);
    this.actionKey = '';
    this.hotbarKey = '';
    this._wire();
  }

  _wire() {
    const g = this.g;
    const act = $('btn-action');
    const press = (el, on, off) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } el.classList.add('pressed'); g.audio.unlock(); on(); });
      const up = (e) => { el.classList.remove('pressed'); off?.(); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
      el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    };
    press(act, () => { g.input.actionHeld = true; g.onActionPressed(); }, () => { g.input.actionHeld = false; });
    press($('btn-jump'), () => { g.input.jumpPressed = true; });
    const sp = $('btn-sprint');
    press(sp, () => { g.input.sprintHeld = true; sp.classList.add('on'); }, () => { g.input.sprintHeld = false; sp.classList.remove('on'); });
    press($('btn-build'), () => g.toggleBuild());
    press($('btn-bag'), () => this.openPanel(this._attn === 'bag' ? 'craft' : 'inv'));
    press($('bb-rotate'), () => g.building.rotate());
    press($('bb-cancel'), () => g.toggleBuild(false));
    document.querySelectorAll('#tabs .tab[data-tab]').forEach((b) => b.addEventListener('click', () => this.openPanel(b.dataset.tab)));
    $('panel-close').addEventListener('click', () => this.closePanel());
    this.panel.addEventListener('pointerdown', (e) => { if (e.target === this.panel) this.closePanel(); });
    this.panel.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.hotbar.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    $('build-bar').addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }

  // ---------- HUD ----------
  setStats(s) {
    const key = Math.round(s.health) + ',' + Math.round(s.water) + ',' + Math.round(s.food);
    if (key === this._statKey) return;
    this._statKey = key;
    for (const k of ['health', 'water', 'food']) {
      const el = this.stats[k];
      el.querySelector('i').style.width = Math.max(0, s[k]) + '%';
      el.classList.toggle('low', s[k] < 20);
    }
  }

  setQuest(q) {
    if (!q) { this.quest.style.opacity = 0; return; }
    const key = JSON.stringify(q);
    if (key === this.questKey) return;
    const flash = this.questKey && q.title !== this.questTitle;
    this.questKey = key; this.questTitle = q.title;
    this.quest.style.opacity = 1;
    this.quest.innerHTML = `<div class="qt">${q.title}</div>` +
      q.lines.map((l) => `<div class="qline ${l.done ? 'done' : ''}"><span class="ck">${l.done ? '✔' : '◇'}</span><span>${l.text}</span></div>`).join('') +
      (q.hint ? `<div class="qhint">${q.hint}</div>` : '');
    if (flash) { this.quest.classList.remove('flash'); void this.quest.offsetWidth; this.quest.classList.add('flash'); }
  }

  toast(id, text, warn = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (warn ? ' warn' : '');
    el.innerHTML = (id ? `<img src="${this.icons.item(id)}">` : '<span style="width:6px"></span>') + `<span>${text}</span>`;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 5) this.toasts.firstChild.remove();
    setTimeout(() => el.remove(), 2700);
  }

  center(title, sub = '', dur = 2500) {
    const el = $('center-msg');
    el.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
    el.classList.add('show');
    clearTimeout(this._ct);
    this._ct = setTimeout(() => el.classList.remove('show'), dur);
  }

  setTarget(label, hp) {
    const key = label + '|' + (hp == null ? '' : hp.toFixed(2));
    if (key === this._targetKey) return;
    this._targetKey = key;
    const el = $('target-label');
    if (!label) { el.classList.remove('show'); return; }
    el.classList.add('show');
    el.querySelector('.name').textContent = label;
    const bar = el.querySelector('.hp');
    bar.style.display = hp == null ? 'none' : 'block';
    if (hp != null) bar.querySelector('i').style.width = hp * 100 + '%';
  }

  // ---------- co-op ----------
  setCoopStatus(coop, state) {
    const pill = $('coop-pill');
    pill.classList.remove('hidden');
    const text = pill.querySelector('.cp-text');
    const code = `<span class="cp-code">${coop.code}</span>`;
    const host = coop.role === 'host';
    const msgs = {
      connecting: host ? `Apertura stanza ${code}…` : `Connessione a ${code}…`,
      waiting: `Stanza ${code} · in attesa del compagno`,
      searching: `Ricerca stanza ${code}…`,
      reconnecting: 'Riconnessione…',
      offline: 'Offline, nuovo tentativo…',
      connected: host ? 'Compagno connesso' : `In gioco su ${code}`,
    };
    text.innerHTML = msgs[state] || state;
    pill.classList.toggle('on', state === 'connected');
    pill.classList.toggle('off', state === 'offline' || state === 'reconnecting');
    pill.querySelector('.cp-invite').classList.toggle('hidden', !host);
    if (!pill._wired) {
      pill._wired = true;
      const inv = pill.querySelector('.cp-invite');
      inv.addEventListener('pointerdown', (e) => e.stopPropagation());
      inv.addEventListener('click', async () => {
        const link = coop.net.inviteLink();
        const text = `Raggiungimi su Our Island! Codice stanza: ${coop.code}`;
        try {
          if (navigator.share) { await navigator.share({ title: 'Our Island', text, url: link }); return; }
        } catch { /* cancelled */ }
        try { await navigator.clipboard.writeText(link); this.toast(null, 'Link di invito copiato!'); }
        catch { this.center(`Codice stanza ${coop.code}`, 'Il compagno tocca «Unisciti in co-op» e lo inserisce', 4000); }
      });
    }
    this.g.onCoopStatus?.(state);
  }

  setPartner(coop) {
    const card = $('partner-card');
    const r = coop?.remote;
    if (!r) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    card.querySelector('.pc-name').textContent = '🤝 ' + (r.name || 'Compagno');
    card.querySelector('.bar i').style.width = (r.stats ? r.stats[0] : 100) + '%';
    const P = this.g.player.pos;
    const d = Math.round(Math.hypot(r.pos.x - P.x, r.pos.z - P.z));
    card.querySelector('.pc-state').textContent = coop.connected ? (d > 8 ? `a ${d} m` : 'vicino') : 'riconnessione…';
  }

  attention(what) {
    if (what === this._attn) return;
    this._attn = what;
    $('btn-bag').classList.toggle('attn', what === 'bag');
    $('btn-build').classList.toggle('attn', what === 'build');
    this.hotbar.classList.toggle('attn', what === 'hotbar');
  }

  setWaypoint(p, dist) {
    const el = this._wp || (this._wp = document.getElementById('waypoint'));
    if (!p) { el.classList.remove('show'); return; }
    el.classList.add('show');
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.querySelector('.wp-d').textContent = dist > 4 ? Math.round(dist) + ' m' : '';
  }

  setAction(a) {
    const key = a.label + '|' + a.icon + '|' + a.ready;
    if (key === this.actionKey) return;
    this.actionKey = key;
    const glyph = $('action-glyph');
    glyph.innerHTML = a.icon.startsWith('item:') ? `<img src="${this.icons.item(a.icon.slice(5))}">` : (SVG[a.icon] || SVG.hand);
    $('action-label').textContent = a.label;
    $('btn-action').classList.toggle('ready', !!a.ready);
  }

  renderHotbar() {
    const inv = this.g.inv;
    const sel = this.g.selected;
    const key = JSON.stringify(inv.slots.slice(0, HOTBAR)) + sel;
    if (key === this.hotbarKey) return;
    this.hotbarKey = key;
    this.hotbar.innerHTML = '';
    for (let i = 0; i < HOTBAR; i++) {
      const s = inv.slots[i];
      const d = document.createElement('div');
      d.className = 'slot' + (i === sel ? ' sel' : '');
      d.innerHTML = `<span class="k">${i + 1}</span>` + (s ? `<img src="${this.icons.item(s.id)}">${s.n > 1 ? `<span class="n">${s.n}</span>` : ''}` : '');
      d.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.g.audio.unlock(); this.g.selectSlot(i); });
      this.hotbar.appendChild(d);
    }
  }

  popSlot(i) {
    if (i < 0 || i >= HOTBAR) return;
    const el = this.hotbar.children[i];
    if (el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }

  setClock(hours, day) {
    const h = Math.floor(hours), m = Math.floor((hours - h) * 60 / 10) * 10;
    $('clock').textContent = `Giorno ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // heading: camera look direction angle (0 = north/-z, clockwise); quest: optional bearing of the objective
  updateCompass(heading, quest) {
    const key = heading.toFixed(3) + '|' + (quest == null ? '' : quest.toFixed(2));
    if (key === this._compassKey) return;
    this._compassKey = key;
    const strip = this._strip || (this._strip = $('compass-strip'));
    const W = strip.parentElement.clientWidth || 300;
    const pxPerRad = W / 2.2;
    if (!this._compassBuilt) {
      this._compassBuilt = true;
      const names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
      let html = '';
      for (let k = -1; k <= 1; k++) {
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2 + k * Math.PI * 2;
          const x = a * pxPerRad;
          if (i % 3 === 0) html += `<div class="cl ${i % 6 ? 'minor' : ''}" style="left:${x}px">${names[i / 3]}</div>`;
          else html += `<div class="ct" style="left:${x}px"></div>`;
        }
      }
      html += '<div class="cq" id="compass-q">◆</div>';
      strip.innerHTML = html;
      this._cq = document.getElementById('compass-q');
    }
    let h = heading % (Math.PI * 2); if (h < 0) h += Math.PI * 2;
    strip.style.transform = `translateX(${W / 2 - h * pxPerRad}px)`;
    if (quest == null) { this._cq.style.display = 'none'; return; }
    let d = quest - h; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this._cq.style.display = Math.abs(d) < 1.1 ? 'block' : 'none';
    this._cq.style.left = (h + d) * pxPerRad + 'px';
  }

  drawMinimap(player, markers) {
    const c = this.mm, S = 168, R = 55; // view radius in meters
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#0d4f8f'; c.fillRect(0, 0, S, S);
    const scale = S / (R * 2);
    const img = this.mapImg, k = img.width / WORLD_SIZE;
    const sx = (player.pos.x + WORLD_SIZE / 2 - R) * k, sz = (player.pos.z + WORLD_SIZE / 2 - R) * k;
    c.imageSmoothingEnabled = true;
    c.drawImage(img, sx, sz, R * 2 * k, R * 2 * k, 0, 0, S, S);
    for (const m of markers) {
      let x = S / 2 + (m.x - player.pos.x) * scale, y = S / 2 + (m.z - player.pos.z) * scale;
      const dx = x - S / 2, dy = y - S / 2, d = Math.hypot(dx, dy);
      if (d > S / 2 - 10) { x = S / 2 + dx / d * (S / 2 - 10); y = S / 2 + dy / d * (S / 2 - 10); }
      c.fillStyle = m.color; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, m.r || 5, 0, Math.PI * 2); c.fill(); c.stroke();
      if (m.glyph) { c.fillStyle = '#fff'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.fillText(m.glyph, x, y + 3); }
    }
    // player arrow
    c.translate(S / 2, S / 2);
    c.rotate(-player.facing + Math.PI);
    c.fillStyle = '#fff'; c.strokeStyle = '#1a1a1a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6.5, 7); c.lineTo(0, 3.5); c.lineTo(-6.5, 7); c.closePath(); c.stroke(); c.fill();
    c.restore();
    // north marker
    c.fillStyle = '#fff'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
    c.fillText('N', S / 2, 13);
  }

  // ---------- panel ----------
  openPanel(tab = 'inv') {
    this.tab = tab;
    this.panel.classList.remove('hidden');
    this.g.panelOpen = true;
    document.querySelectorAll('#tabs .tab[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const want = this.g.suggestRecipe?.();
    if (want) { const i = RECIPES.findIndex((r) => r.out === want); if (i >= 0) this.craftSel = i; }
    this.refreshPanel();
    this.g.onPanelOpen?.(tab);
  }
  closePanel() {
    this.panel.classList.add('hidden');
    this.g.panelOpen = false;
    this.selSlot = -1;
  }
  get isOpen() { return !this.panel.classList.contains('hidden'); }

  refreshPanel() {
    if (!this.isOpen) return;
    const invBox = $('inv-box'), craftBox = $('craft-box');
    // inventory is always visible on wide screens next to crafting; on the inv tab show only inventory
    const wide = window.innerWidth > 900;
    const settings = this.tab === 'settings';
    invBox.classList.toggle('hidden', settings || (this.tab !== 'inv' && !wide));
    craftBox.classList.toggle('hidden', this.tab === 'inv' || settings);
    $('settings-box').classList.toggle('hidden', !settings);
    if (settings) { this._renderSettings(); return; }
    this._renderInv();
    if (this.tab === 'craft') this._renderCraft();
    if (this.tab === 'build') this._renderBuild();
  }

  _renderInv() {
    const inv = this.g.inv;
    const grid = $('inv-grid');
    grid.innerHTML = '';
    inv.slots.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'slot' + (i < HOTBAR ? ' hb' : '') + (i === this.selSlot ? ' sel' : '');
      d.innerHTML = (i < HOTBAR ? `<span class="k">${i + 1}</span>` : '') + (s ? `<img src="${this.icons.item(s.id)}">${s.n > 1 ? `<span class="n">${s.n}</span>` : ''}` : '');
      d.addEventListener('click', () => {
        if (this.selSlot >= 0 && this.selSlot !== i) { inv.swap(this.selSlot, i); this.selSlot = -1; }
        else this.selSlot = this.selSlot === i ? -1 : (s ? i : -1);
        this.refreshPanel();
      });
      grid.appendChild(d);
    });
    const det = $('inv-detail');
    const s = inv.slots[this.selSlot];
    if (s) {
      const it = ITEMS[s.id];
      const btns = [];
      if (it.food) btns.push(`<button class="pill primary" data-a="use">Mangia</button>`);
      if (it.tool) btns.push(`<button class="pill primary" data-a="use">Equipaggia</button>`);
      if (it.place) btns.push(`<button class="pill primary" data-a="use">Posiziona</button>`);
      det.innerHTML = `<b>${it.name}${s.n > 1 ? ' ×' + s.n : ''}</b>${it.desc}<div class="acts">${btns.join('')}<span style="align-self:center;font-size:11px">Tocca un altro spazio per spostarlo.</span></div>`;
      det.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const idx = this.selSlot;
        this.closePanel();
        this.g.useSlot(idx);
      }));
    } else {
      det.innerHTML = `<b>Zaino</b>Gli spazi 1–${HOTBAR} sono la barra rapida. Tocca un oggetto per i dettagli, poi un altro spazio per spostarlo.`;
    }
  }

  _renderSettings() {
    const s = this.g.settings;
    const label = { sfx: s.sfx ? 'Sì' : 'No', music: s.music ? 'Sì' : 'No', quality: s.quality === 'high' ? 'Alta' : 'Bassa', follow: s.follow ? 'Sì' : 'No' };
    document.querySelectorAll('[data-set]').forEach((b) => {
      const k = b.dataset.set;
      if (label[k]) b.textContent = label[k];
      b.onclick = () => {
        if (k === 'reset') { if (confirm('Ricominciare su una nuova isola? I progressi andranno persi.')) { this.g.clearSave(); this.g.noSave = true; location.reload(); } return; }
        this.g.toggleSetting(k);
        this._renderSettings();
      };
    });
  }

  _costHtml(cost) {
    const inv = this.g.inv;
    return `<div class="costs">` + Object.entries(cost).map(([k, n]) => {
      const have = inv.count(k);
      return `<div class="cost ${have < n ? 'miss' : ''}"><img src="${this.icons.item(k)}">${Math.min(have, 999)}/${n}</div>`;
    }).join('') + `</div>`;
  }

  _renderCraft() {
    $('craft-box').querySelector('h2').textContent = 'Crea';
    const list = $('craft-list');
    list.innerHTML = '';
    RECIPES.forEach((r, i) => {
      const can = this.g.inv.has(r.cost);
      const b = document.createElement('button');
      b.className = 'citem' + (i === this.craftSel ? ' sel' : '') + (can ? ' can' : '');
      b.innerHTML = `<img src="${this.icons.item(r.out)}"><span>${ITEMS[r.out].name}</span>`;
      b.addEventListener('click', () => { this.craftSel = i; this.refreshPanel(); });
      list.appendChild(b);
    });
    const r = RECIPES[this.craftSel];
    const it = ITEMS[r.out];
    const can = this.g.inv.has(r.cost);
    const det = $('craft-detail');
    det.innerHTML = `<b style="color:#f5ecd6;font-size:16px">${it.name}</b><span style="font-size:12px">${it.desc}</span>
      <img class="big" src="${this.icons.item(r.out)}">${this._costHtml(r.cost)}
      <button class="craft-btn" ${can ? '' : 'disabled'}>CREA</button>`;
    det.querySelector('.craft-btn').addEventListener('click', () => { this.g.craft(r); this.refreshPanel(); });
  }

  _renderBuild() {
    $('craft-box').querySelector('h2').textContent = 'Costruzioni';
    const list = $('craft-list');
    list.innerHTML = '';
    for (const [id, p] of Object.entries(PIECES)) {
      const can = this.g.inv.has(p.cost);
      const b = document.createElement('button');
      b.className = 'citem' + (id === this.buildSel ? ' sel' : '') + (can ? ' can' : '');
      b.innerHTML = `<img src="${this.g.pieceIcon(id)}"><span>${p.name}</span>`;
      b.addEventListener('click', () => { this.buildSel = id; this.refreshPanel(); });
      list.appendChild(b);
    }
    const p = PIECES[this.buildSel];
    const det = $('craft-detail');
    det.innerHTML = `<b style="color:#f5ecd6;font-size:16px">${p.name}</b><span style="font-size:12px">${p.desc}</span>
      <img class="big" src="${this.g.pieceIcon(this.buildSel)}">${this._costHtml(p.cost)}
      <button class="craft-btn">COSTRUISCI</button>`;
    det.querySelector('.craft-btn').addEventListener('click', () => { this.closePanel(); this.g.toggleBuild(true, this.buildSel); });
  }

  // ---------- build bar ----------
  showBuildBar(on, placing = null) {
    $('build-bar').classList.toggle('hidden', !on);
    $('build-pieces').classList.toggle('hidden', !!placing);
    $('bb-rotate').classList.toggle('hidden', !!placing && placing !== ITEMS.bed.name);
    this.hotbar.classList.toggle('hidden', on);
    $('btn-build').classList.toggle('on', on);
    if (on) this.renderBuildBar();
  }
  renderBuildBar() {
    const wrap = $('build-pieces');
    const cur = this.g.building.piece;
    const key = cur + JSON.stringify(this.g.inv.slots);
    if (key === this.bbKey) return;
    this.bbKey = key;
    wrap.innerHTML = '';
    for (const [id, p] of Object.entries(PIECES)) {
      const d = document.createElement('div');
      const can = this.g.inv.has(p.cost);
      d.className = 'bpiece' + (id === cur ? ' sel' : '') + (can ? '' : ' no');
      const cost = Object.entries(p.cost).map(([k, n]) => `${n} ${ITEMS[k].short || ITEMS[k].name}`).join(' · ');
      d.innerHTML = `<img src="${this.g.pieceIcon(id)}"><span>${cost}</span>`;
      d.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.g.building.setPiece(id); this.bbKey = ''; this.renderBuildBar(); });
      wrap.appendChild(d);
    }
  }
}
