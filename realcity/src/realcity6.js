// v21 (Nov 17): game controller support — built for a PS5 DualSense over Bluetooth in Safari (macOS / iPadOS),
// works with any pad the browser reports with the W3C "standard" mapping (Chrome, Edge, Firefox, Xbox pads too).
// Loaded after realcity5.js, before boot().
//
// Safari notes (researched Nov 17):
//  - WebKit exposes the DualSense through GameController.framework as mapping "standard": buttons 0-16, axes 0-3,
//    L2/R2 analog in buttons[6/7].value. The touchpad click is NOT mapped in Safari (Chrome reports it as 17).
//  - A pad only shows up after a button press while the page is visible (fingerprinting rule), so we poll every frame
//    and also listen for gamepadconnected.
//  - macOS keeps the PS button (opens Games / Launchpad) and Create (screenshot / recording), so the game never uses them.
//  - vibrationActuator.playEffect('dual-rumble') exists from Safari 16.4; it's best-effort and wrapped in try/catch.
const PB = { X: 0, O: 1, SQ: 2, TRI: 3, L1: 4, R1: 5, L2: 6, R2: 7, CREATE: 8, OPT: 9, L3: 10, R3: 11, UP: 12, DN: 13, LT: 14, RT: 15, PS: 16 };
const PAD = {
  on: false, idx: -1, id: '', std: true, b: new Float32Array(17), pb: new Float32Array(17), lx: 0, ly: 0, rx: 0, ry: 0,
  f: 0, s: 0, u: 0, boost: false, sprint: false, ui: false, menuI: 0, rep: 0, repDir: 0, lastSpd: 0, rumbleT: 0, warned: false,
  cfg: { invert: false, rumble: true, sens: 1 }
};
try { Object.assign(PAD.cfg, JSON.parse(localStorage.getItem('slopPad') || '{}')); } catch (e) {}
const r6Save = () => { try { localStorage.setItem('slopPad', JSON.stringify(PAD.cfg)); } catch (e) {} };
window.__pad = PAD;
const R6_MODES = ['walk', 'drive', 'cycle', 'fly'];

// radial deadzone with rescale, so small drift is ignored but the full range is still reachable
function r6Stick(x, y, dz = 0.13) {
  const m = Math.hypot(x, y); if (m < dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz)) / m; return [x * k, y * k];
}
const r6Curve = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
const r6Down = i => PAD.b[i] > 0.5, r6Hit = i => PAD.b[i] > 0.5 && PAD.pb[i] <= 0.5;

function r6Pick() {
  let list = []; try { list = navigator.getGamepads ? [...navigator.getGamepads()] : []; } catch (e) {}
  if (PAD.idx >= 0 && list[PAD.idx] && list[PAD.idx].connected) return list[PAD.idx];
  return list.find(g => g && g.connected && g.mapping === 'standard') || list.find(g => g && g.connected) || null;
}
function r6Connect(g) {
  PAD.on = true; PAD.idx = g.index; PAD.id = g.id; PAD.std = g.mapping === 'standard';
  PAD.pb.fill(1);   // ignore whatever button woke the pad up
  document.body.classList.add('pad-on');
  const ds = /dualsense|054c|wireless controller|playstation/i.test(g.id);
  toast(ds ? 'DualSense connected · OPTIONS for menu' : 'Controller connected · Start for menu');
  if (!PAD.std && !PAD.warned) { PAD.warned = true; setTimeout(() => toast('Controller layout not recognised: buttons may be off'), 1900); }
  r6Glyphs(); updateHint(); r6Rumble(0.15, 0.35, 120);
}
function r6Disconnect() {
  PAD.on = false; PAD.idx = -1; PAD.f = PAD.s = PAD.u = 0; PAD.boost = false;
  if (PAD.sprint) { keys.ShiftRight = false; PAD.sprint = false; }
  document.body.classList.remove('pad-on'); r6Glyphs(); updateHint(); toast('Controller disconnected');
}
addEventListener('gamepadconnected', e => { if (!PAD.on) r6Connect(e.gamepad); });
addEventListener('gamepaddisconnected', e => { if (PAD.on && e.gamepad.index === PAD.idx) r6Disconnect(); });

function r6Rumble(strong, weak, ms) {
  if (!PAD.cfg.rumble || !PAD.on) return;
  try {
    const g = r6Pick(), a = g && g.vibrationActuator; if (!a || !a.playEffect) return;
    const p = a.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak });
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}

// ---------- menu panel: D-pad / left stick moves focus, ✕ presses, ○ or OPTIONS closes
function r6MenuItems() { return [...$('panel').querySelectorAll('button')].filter(b => b.offsetParent !== null && !b.disabled); }
function r6MenuFocus(d) {
  const L = r6MenuItems(); if (!L.length) return;
  PAD.menuI = clamp(PAD.menuI + d, 0, L.length - 1);
  const b = L[PAD.menuI]; b.focus({ preventScroll: true }); b.scrollIntoView({ block: 'nearest' });
}
function r6OpenPanel(open) {
  $('panel').hidden = !open; $('btnMenu').setAttribute('aria-expanded', String(open));
  if (open) { PAD.menuI = 0; requestAnimationFrame(() => r6MenuFocus(0)); } else { document.activeElement && document.activeElement.blur && document.activeElement.blur(); canvas.focus(); }
}
function r6Menu(dt) {
  if (r6Hit(PB.O) || r6Hit(PB.OPT)) return r6OpenPanel(false);
  if (r6Hit(PB.X)) { const b = r6MenuItems()[PAD.menuI]; if (b) { b.click(); requestAnimationFrame(() => r6MenuFocus(0)); } return; }
  // held direction repeats: first step at once, then after 0.35 s every 0.11 s
  const dir = (r6Down(PB.DN) || r6Down(PB.RT) || PAD.ly > 0.6) ? 1 : (r6Down(PB.UP) || r6Down(PB.LT) || PAD.ly < -0.6) ? -1 : 0;
  if (!dir) { PAD.repDir = 0; return; }
  if (dir !== PAD.repDir) { PAD.repDir = dir; PAD.rep = 0.35; r6MenuFocus(dir); return; }
  PAD.rep -= dt; if (PAD.rep <= 0) { PAD.rep = 0.11; r6MenuFocus(dir); }
}

// ---------- Street Atlas: left stick pans, R2 / L2 zoom, ✕ teleports to the crosshair, ○ closes
function r6Map(dt) {
  if (r6Hit(PB.O) || r6Hit(PB.DN) || r6Hit(PB.OPT)) return closeMap();
  const x = PAD.lx + (r6Down(PB.RT) ? 1 : 0) - (r6Down(PB.LT) ? 1 : 0), y = PAD.ly - (r6Down(PB.UP) ? 1 : 0);
  if (x || y) { const v = 620 / view.s * dt; view.cx += x * v; view.cz += y * v; }
  const z = PAD.b[PB.R2] - PAD.b[PB.L2] + (PAD.ry < -0.5 ? 1 : PAD.ry > 0.5 ? -1 : 0);
  if (Math.abs(z) > 0.04) view.s = clamp(view.s * Math.exp(z * 1.7 * dt), 0.015, 2.5);
  if (r6Hit(PB.X)) {
    teleport(clamp(view.cx, RCB.x0 + 50, RCB.x1 - 50), clamp(view.cz, RCB.z0 + 50, RCB.z1 - 50));
    if (camMode === 'scenic') camMode = 'chase'; toast(placeName(P.pos.x, P.pos.z, P.pos.y)); closeMap(); r6Rumble(0.2, 0.5, 140);
  }
}

// ---------- gameplay
function r6Play(dt) {
  const m = P.mode, heli = m === 'fly' && flyerId !== 'jet', cine = camMode === 'scenic' || camMode === 'auto' || camMode === 'aerial';
  const R2 = PAD.b[PB.R2], L2 = PAD.b[PB.L2], lx = PAD.lx, ly = PAD.ly;
  // analog movement (added to the keyboard / touch values in readInput)
  if (m === 'walk') { PAD.f = -ly; PAD.s = lx; PAD.u = 0; }
  else if (m === 'drive' || m === 'cycle') { PAD.f = R2 - L2; PAD.s = r6Curve(lx, 1.35); PAD.u = 0; }
  else if (heli) { PAD.f = -ly; PAD.s = lx; PAD.u = R2 - L2 + (r6Down(PB.R1) ? 1 : 0); }
  else { PAD.f = R2 - L2; PAD.s = lx; PAD.u = (PAD.cfg.invert ? ly : -ly) + (r6Down(PB.R1) ? 1 : 0); }
  PAD.boost = m !== 'walk' && r6Down(PB.X);
  // sprint on foot: hold □ (drives the same Shift flag the keyboard uses; only the right Shift is touched)
  const sp = m === 'walk' && r6Down(PB.SQ);
  if (sp !== PAD.sprint) { PAD.sprint = sp; keys.ShiftRight = sp; }

  // right stick: look around (same feel as dragging; the chase cam re-centres a moment after you let go)
  const k = PAD.cfg.sens;
  if (PAD.rx || PAD.ry) {
    cam.yawOff -= r6Curve(PAD.rx, 1.5) * 3.1 * k * dt;
    cam.pitch = clamp(cam.pitch + r6Curve(PAD.ry, 1.5) * 1.9 * k * dt, m === 'walk' ? -0.42 : -0.25, 1.25);
    cam.lastDrag = r5Now();
  }

  // buttons
  if (r6Hit(PB.OPT)) return r6OpenPanel(true);
  if (r6Hit(PB.DN)) return openMap();
  if (r6Hit(PB.UP)) setTime(TIME_ORDER[(TIME_ORDER.indexOf(timeId) + 1) % 4]);
  if (r6Hit(PB.LT) || r6Hit(PB.RT)) { const i = R6_MODES.indexOf(m), d = r6Hit(PB.RT) ? 1 : -1; setMode(R6_MODES[(i + d + 4) % 4]); r6Rumble(0, 0.25, 60); }
  if (r6Hit(PB.R3)) { const i = FOLLOW.findIndex(f => f.id === camMode); setCam(FOLLOW[(i + 1) % FOLLOW.length].id); }
  if (r6Hit(PB.L1)) { if (m === 'fly') setFlyer(flyerId === 'jet' ? 'heli' : 'jet'); else if (m === 'drive') setPlayerCar(carIdx + 1); updateHint(); }
  if (r6Hit(PB.TRI)) r5Act();
  if (cine && r6Hit(PB.O)) setCam('chase');
  else if (m === 'walk') {
    if (r6Hit(PB.X)) FOOT.jumpQ = 0.18;
    if (r6Hit(PB.O)) { FOOT.slow = !FOOT.slow; toast(FOOT.slow ? 'Strolling' : 'Jogging'); }
    if (r6Hit(PB.L3)) { FOOT.runHold = !FOOT.runHold; const b = $('runBtn'); if (b) { b.classList.toggle('on', FOOT.runHold); b.setAttribute('aria-pressed', String(FOOT.runHold)); } toast(FOOT.runHold ? 'Sprint locked on' : 'Sprint off'); }
  }

  // rumble: a sudden loss of speed in a vehicle is a crash
  if (m === 'drive' || m === 'cycle' || m === 'fly') {
    const s0 = Math.abs(PAD.lastSpd), s1 = Math.abs(P.speed), drop = s0 - s1;
    if (s0 > 5 && drop > 3.2 && PAD.rumbleT <= 0) { const a = Math.min(1, drop / 14); r6Rumble(a, a * 0.6, 90 + a * 160); PAD.rumbleT = 0.3; }
  }
  PAD.lastSpd = P.speed; PAD.rumbleT -= dt;
}

function r6Poll(dt) {
  const g = document.hidden ? null : r6Pick();
  if (!g) { if (PAD.on && !document.hidden) r6Disconnect(); PAD.f = PAD.s = PAD.u = 0; PAD.boost = false; return; }
  if (!PAD.on) r6Connect(g);
  PAD.pb.set(PAD.b);
  for (let i = 0; i < 17; i++) { const bt = g.buttons[i]; PAD.b[i] = bt ? (typeof bt.value === 'number' && bt.value > 0 ? bt.value : bt.pressed ? 1 : 0) : 0; }
  PAD.b[PB.L2] = PAD.b[PB.L2] < 0.04 ? 0 : PAD.b[PB.L2]; PAD.b[PB.R2] = PAD.b[PB.R2] < 0.04 ? 0 : PAD.b[PB.R2];
  const a = g.axes;
  [PAD.lx, PAD.ly] = r6Stick(a[0] || 0, a[1] || 0); [PAD.rx, PAD.ry] = r6Stick(a[2] || 0, a[3] || 0, 0.15);
  const panel = !$('panel').hidden, map = !$('map').hidden;
  PAD.ui = panel || map;
  if (PAD.ui) {
    PAD.f = PAD.s = PAD.u = 0; PAD.boost = false; if (PAD.sprint) { PAD.sprint = false; keys.ShiftRight = false; }
    if (panel) r6Menu(dt); else r6Map(dt);
    return;
  }
  r6Play(dt);
}

// ---------- hooks: poll before the player moves; add the pad to readInput
const r6BaseRcUpdate = rcUpdate, r6BaseInput = readInput, r6BaseHint = updateHint, r6BaseFrame = r5Frame;
rcUpdate = dt => { try { r6Poll(dt); } catch (e) { console.warn('[pad]', e); } return r6BaseRcUpdate(dt); };
readInput = () => {
  const r = r6BaseInput();
  if (!PAD.on || PAD.ui) return r;
  r.f = clamp(r.f + PAD.f, -1, 1); r.s = clamp(r.s + PAD.s, -1, 1); r.u = clamp(r.u + PAD.u, -1, 1); r.boost = r.boost || PAD.boost;
  return r;
};

// ---------- HUD: PlayStation glyphs while a pad is in use
const G = { x: '<b class="pg">✕</b>', o: '<b class="pg">○</b>', sq: '<b class="pg">□</b>', tri: '<b class="pg">△</b>' };
updateHint = () => {
  if (!PAD.on) return r6BaseHint();
  const m = P.mode, tail = `<b>R3</b> cam · <b>◀ ▶</b> mode · <b>▲</b> time · <b>▼</b> map · <b>OPTIONS</b> menu`;
  let top;
  if (m === 'walk') top = `<b>L</b> move · <b>R</b> look · ${G.x} jump · ${G.sq} sprint · ${G.o} stroll · ${G.tri} get in`;
  else if (m === 'drive' || m === 'cycle') top = `<b>R2</b> gas · <b>L2</b> brake · <b>L</b> steer · ${G.x} boost · ${G.tri} get out${m === 'drive' ? ' · <b>L1</b> swap car' : ''}`;
  else if (flyerId === 'jet') top = `<b>R2</b> throttle · <b>L2</b> slow · <b>L</b> turn / ${PAD.cfg.invert ? 'pitch (inverted)' : 'climb'} · ${G.x} boost · <b>L1</b> chopper`;
  else top = `<b>L</b> fly · <b>R2</b> up · <b>L2</b> down · ${G.x} boost · <b>L1</b> jet`;
  $('hint').innerHTML = `${top}<br>${tail}`;
};
function r6Glyphs() { const b = $('prompt') && $('prompt').querySelector('b'); if (b) b.textContent = PAD.on ? '△' : 'F'; }
r5Frame = (dt, t) => {
  r6BaseFrame(dt, t);
  // touch devices hide the key prompt; with a controller on an iPad it is useful again
  if (PAD.on && isTouch && r5Tgt && camMode !== 'scenic' && !SHOT) $('prompt').hidden = false;
};

// ---------- menu: Controller section + crosshair on the map
(function r6UI() {
  const p = $('panel'); if (!p || $('padOpts')) return;
  const h = document.createElement('h2'); h.textContent = 'Controller';
  const box = document.createElement('div'); box.className = 'list'; box.id = 'padOpts';
  const tog = (label, sub, key) => {
    const b = optBtn(label, sub, PAD.cfg[key], () => { PAD.cfg[key] = !PAD.cfg[key]; b.setAttribute('aria-pressed', String(PAD.cfg[key])); r6Save(); updateHint(); if (key === 'rumble') r6Rumble(0.4, 0.6, 160); });
    return b;
  };
  box.append(tog('Invert flight stick', 'Jet: push forward to climb', 'invert'), tog('Vibration', 'Crash rumble (Safari 16.4+)', 'rumble'));
  const keysEl = document.createElement('div'); keysEl.className = 'keys'; keysEl.style.marginTop = '6px';
  keysEl.innerHTML = 'PS5 DualSense or any standard pad. Press a button to wake it.<br>'
    + '<b>L</b> move / steer · <b>R</b> look · <b>R2</b> gas · <b>L2</b> brake<br>'
    + `${G.x} jump / boost · ${G.sq} sprint · ${G.o} stroll / back · ${G.tri} get in / out<br>`
    + '<b>◀ ▶</b> mode · <b>▲</b> time · <b>▼</b> map · <b>L1</b> swap vehicle · <b>R3</b> camera · <b>OPTIONS</b> menu<br>'
    + 'Map: <b>L</b> pan · <b>R2/L2</b> zoom · ✕ teleport. Menu: <b>▲▼</b> move · ✕ select · ○ close';
  const ctrl = [...p.querySelectorAll('h2')].find(e => e.textContent === 'Controls');
  if (ctrl) p.insertBefore(h, ctrl); else p.append(h);
  h.after(box); box.after(keysEl);
  const x = document.createElement('div'); x.id = 'padCross'; x.setAttribute('aria-hidden', 'true');
  const w = $('mapWrap'); if (w) w.append(x);
})();
