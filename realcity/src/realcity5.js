// v20 (Nov 9): on-foot overhaul + road realism. Loaded after realcity4.js, before boot().
window.__hl = /[?&]hl\b/.test(location.search);
window.__r5 = {
  // headless helpers: render one frame synchronously and return it as a JPEG data URL
  snap(s) {
    if (s && s.pos) { if (!s.abs) { s = { ...s, pos: [s.pos[0], s.pos[1] + rcH(s.pos[0], s.pos[2]), s.pos[2]], look: [s.look[0], s.look[1] + rcH(s.look[0], s.look[2]), s.look[2]] }; } shot(s); camera.position.copy(SHOT.pos); camera.fov = SHOT.fov; camera.updateProjectionMatrix(); camera.lookAt(SHOT.look); }
    else { SHOT = null; if (s && s.q) setQuality(s.q, true); if (s && s.time) setTime(s.time, true); updateRig(0.016); updateCamera(1, performance.now() / 1000); camera.position.copy(camPos); camera.lookAt(camLook); }
    const ld = sun.userData.dir || sunDir; rcSunSnap(SHOT ? SHOT.look : P.pos, ld); rcNearPlane(); rcTreeLOD();
    sky.position.copy(camera.position); ST.f = 0; r5StreetLOD(0);
    if (s && s.fast) renderer.render(scene, camera); else if (quality.bloom && composer) composer.render(); else renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/jpeg', 0.9);
  },
  async load(x, z, r = 900) { const px = P.pos.x, pz = P.pos.z; await rcPreload(x, z, r); },
  go(x, z, yaw, mode) { if (mode) setMode(mode, true); P.pos.set(x, groundAt(x, z, rcH(x, z) + 0.5), z); if (yaw !== undefined) P.yaw = yaw; P.speed = 0; P.vy = 0; cam.yawS = P.yaw; cam.yawOff = 0; RC.pendingTP = null; },
  step(sec, input) { if (input) Object.assign(keys, input); const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { simT += 1 / 60; updateTraffic(1 / 60, simT); updatePlayer(1 / 60); updateRig(1 / 60); updateCamera(1 / 60, simT); } if (input) for (const k in input) keys[k] = false; return [+P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2), +P.speed.toFixed(2), P.mode]; },
  ll: (la, lo) => llx(la, lo), P, RC, cam, ST: () => ST
};

// ================================================================ ON FOOT (v20)
// Camera-relative movement, jog / sprint (stamina) / stroll, jump, an articulated character, a shoulder camera with a
// spring arm, getting in and out of vehicles (yours stay where you leave them), pedestrians and a radar.
const FOOT = { vx: 0, vz: 0, stam: 1, tired: false, ground: true, landT: 0, down: 0, camYaw: 0, camD: 3.6, lookT: -9, jumpQ: 0, slow: false, runW: 0, moveW: 0, airW: 0, turn: 0, idleT: 0, tx: 0, ty: 0, tz: 0, pp: 0, runHold: false, sprint: false };
const PARK = { drive: null, cycle: null };
const r5Ang = a => Math.atan2(Math.sin(a), Math.cos(a));
const r5Now = () => performance.now() / 1000;
const r5Above = () => P.pos.y - rcH(P.pos.x, P.pos.z);

// ---------- the walker: capsule limbs with knees and elbows, posed procedurally
function r5Human(parent, o = {}) {
  const C = { top: '#0b4f53', bottom: '#26324a', skin: '#8a5a3e', shoe: '#eceae4', cap: '#e8e8e8', ...o };
  const mT = mat(C.top, { roughness: 0.92 }), mB = mat(C.bottom, { roughness: 0.88 }), mS = mat(C.skin, { roughness: 0.7 }), mSh = mat(C.shoe, { roughness: 0.7 }), mC = mat(C.cap, { roughness: 0.8 }), mD = mat('#16181c', { roughness: 0.6 });
  const g = new THREE.Group(); parent.add(g);
  const grp = (p, x, y, z) => { const n = new THREE.Group(); n.position.set(x, y, z); p.add(n); return n; };
  const cap = (m, r, len, p, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; p.add(o); return o; };
  const hips = grp(g, 0, 0.94, 0);
  cap(mB, 0.105, 0.17, hips, 0, 0, 0).rotation.z = Math.PI / 2;
  const spine = grp(hips, 0, 0.05, 0);
  cap(mT, 0.165, 0.27, spine, 0, 0.29, 0, 1.12, 1, 0.74);
  cap(mT, 0.1, 0.25, spine, 0, 0.5, 0, 1, 1, 0.95).rotation.z = Math.PI / 2;
  part(new THREE.SphereGeometry(0.12, 10, 8), mT, 0, 0.55, 0.09, spine).scale.set(1.15, 0.8, 0.8);   // hood
  part(new THREE.BoxGeometry(0.26, 0.11, 0.03), mT, 0, 0.16, -0.125, spine);                            // hoodie pocket
  const head = grp(spine, 0, 0.62, 0);
  cap(mS, 0.055, 0.05, head, 0, 0.02, 0);
  part(new THREE.SphereGeometry(0.112, 16, 12), mS, 0, 0.145, -0.005, head).scale.set(0.94, 1.1, 1.02);
  part(new THREE.SphereGeometry(0.117, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mC, 0, 0.165, 0, head).scale.set(0.97, 0.95, 1.05);
  part(new THREE.CylinderGeometry(0.115, 0.115, 0.018, 14, 1, false, Math.PI * 0.5, Math.PI), mC, 0, 0.172, -0.085, head).rotation.x = 0.12;   // brim
  part(new THREE.BoxGeometry(0.12, 0.022, 0.02), mD, 0, 0.15, -0.108, head);                              // shades
  const limbs = {};
  for (const s of [-1, 1]) {
    const sh = grp(spine, s * 0.245, 0.5, 0); cap(mT, 0.056, 0.2, sh, 0, -0.14, 0);
    const el = grp(sh, 0, -0.29, 0); cap(mT, 0.048, 0.18, el, 0, -0.12, 0); part(new THREE.SphereGeometry(0.047, 8, 6), mS, 0, -0.27, 0, el).scale.set(0.85, 1.15, 1);
    const hp = grp(hips, s * 0.1, -0.03, 0); cap(mB, 0.082, 0.28, hp, 0, -0.21, 0);
    const kn = grp(hp, 0, -0.44, 0); cap(mB, 0.064, 0.27, kn, 0, -0.2, 0);
    part(new THREE.BoxGeometry(0.105, 0.085, 0.27), mSh, 0, -0.425, -0.055, kn); part(new THREE.BoxGeometry(0.11, 0.03, 0.28), mD, 0, -0.475, -0.055, kn);
    limbs[s] = { sh, el, hp, kn };
  }
  g.userData = { legL: limbs[-1].hp, legR: limbs[1].hp, armL: limbs[-1].sh, armR: limbs[1].sh, hips, spine, head, L: limbs[-1], R: limbs[1], r5: true };
  return g;
}
function r5Pose(g, dt) {
  const u = g.userData, F = FOOT, sp = Math.hypot(F.vx, F.vz);
  const k = Math.min(1, dt * 10);
  F.moveW += (clamp(sp / 1.4, 0, 1) - F.moveW) * k; F.runW += (clamp((sp - 3.9) / 2.6, 0, 1) - F.runW) * k; F.airW += ((F.ground ? 0 : 1) - F.airW) * Math.min(1, dt * 12);
  F.landT = Math.max(0, F.landT - dt * 3.2); F.idleT += dt;
  const w = F.moveW, r = F.runW, a = F.airW, ph = P.phase, land = Math.sin(Math.min(1, F.landT) * Math.PI) * (1 - a);
  const A = 0.5 * w + 0.42 * r, KB = 0.55 * w + 0.75 * r, k0 = 0.06 * w + 0.3 * r, AA = 0.34 * w + 0.5 * r, e0 = 0.12 + 0.22 * w + 0.95 * r;
  const idle = 1 - w, t = F.idleT;
  let i = 0;
  for (const s of [-1, 1]) {
    const L = s < 0 ? u.L : u.R, p = ph + (s < 0 ? 0 : Math.PI), sn = Math.sin(p), cs = Math.cos(p);
    let hip = sn * A + 0.06 * r, knee = -(k0 + KB * Math.max(0, cs) ** 1.4 + 0.12 * w * Math.max(0, -sn)), arm = -sn * AA, elbow = e0 + 0.25 * r * Math.max(0, -sn);
    // airborne: tuck one knee, trail the other, arms up and out
    const jh = s < 0 ? 0.85 : 0.15, jk = s < 0 ? -1.2 : -0.55;
    hip += (jh - hip) * a; knee += (jk - knee) * a; arm += ((s < 0 ? -0.5 : 0.9) - arm) * a; elbow += (0.9 - elbow) * a;
    hip += land * 0.75; knee -= land * 1.35;
    L.hp.rotation.set(hip, 0, s * 0.03 * idle); L.kn.rotation.x = knee;
    L.sh.rotation.set(arm + idle * Math.sin(t * 1.1 + i) * 0.03, 0, s * (0.07 + 0.05 * r + 0.35 * a) + s * idle * 0.02 * Math.sin(t * 1.6)); L.el.rotation.x = elbow; i++;
  }
  const bob = Math.abs(Math.cos(ph)) * (0.022 * w + 0.05 * r);
  u.hips.position.y = 0.94 - 0.035 * w - 0.03 * r + bob - land * 0.2 + idle * Math.sin(t * 1.6) * 0.004;
  u.hips.rotation.set(-(0.02 * w + 0.1 * r) - land * 0.25, Math.sin(ph) * (0.08 * w + 0.1 * r), clamp(-F.turn * 0.05, -0.2, 0.2) * w);
  u.spine.rotation.set(-(0.03 * w + 0.16 * r) + idle * Math.sin(t * 1.6) * 0.012 + a * 0.12, -Math.sin(ph) * (0.14 * w + 0.16 * r), 0);
  u.head.rotation.set(0.03 * w + 0.14 * r - a * 0.1, idle * Math.sin(t * 0.37) * 0.3 + Math.sin(ph) * 0.05 * w, 0);
  // knocked down: tip onto the back, then get up
  const d = F.down > 0 ? clamp(Math.min(F.downT * 5, F.down * 1.6), 0, 1) : 0;
  g.rotation.x = d * 1.45; g.position.y = d * 0.16; g.position.z = d * 0.5;
}

// ---------- movement
function r5ViewYaw() {
  if (camMode === 'chase') return FOOT.camYaw;
  if (camMode === 'fp') return P.yaw;
  const e = camera.matrixWorld.elements; return Math.atan2(e[8], e[10]);   // whatever the active camera is looking along
}
function r5Blocked(x, z, y) {   // inside a building / wall at chest height?
  for (const c of queryCols(x, z, 2)) if (c.top > y + 0.55 && c.bottom < y + 1.8 && inCol(c, x, z, 0.3)) return true;
  return false;
}
function r5Foot(dt) {
  const F = FOOT, inp = readInput(), t = r5Now();
  if (camMode === 'fp') { P.yaw += cam.yawOff; cam.yawOff = 0; }
  const cy = r5ViewYaw(), fwx = -Math.sin(cy), fwz = -Math.cos(cy), rtx = Math.cos(cy), rtz = -Math.sin(cy);
  let wx = fwx * inp.f + rtx * inp.s, wz = fwz * inp.f + rtz * inp.s; const wl = Math.hypot(wx, wz), mag = Math.min(1, wl);
  if (wl > 1e-3) { wx /= wl; wz /= wl; }
  if (F.down > 0) { F.down -= dt; F.downT += dt; wx = wz = 0; }
  const want = (!!(keys.ShiftLeft || keys.ShiftRight) || F.runHold) && mag > 0.4 && F.down <= 0;
  if (F.tired && F.stam > 0.3) F.tired = false;
  F.sprint = want && !F.tired;
  if (F.sprint && F.ground) { F.stam = Math.max(0, F.stam - dt / 10); if (F.stam <= 0) F.tired = true; } else F.stam = Math.min(1, F.stam + dt / (mag > 0.1 ? 7 : 4));
  const top = F.down > 0 ? 0 : F.sprint ? 6.9 : F.slow || mag < 0.55 ? 1.55 : 3.75;
  const tvx = wx * top * (mag < 0.55 && !F.slow ? 1 : Math.max(mag, 0.6)), tvz = wz * top * (mag < 0.55 && !F.slow ? 1 : Math.max(mag, 0.6));
  const acc = (F.ground ? (mag > 0.05 ? 16 : 22) : 4) * dt, dvx = tvx * (mag > 0.05 ? 1 : 0) - F.vx, dvz = tvz * (mag > 0.05 ? 1 : 0) - F.vz, dl = Math.hypot(dvx, dvz);
  if (dl <= acc) { F.vx += dvx; F.vz += dvz; } else { F.vx += dvx / dl * acc; F.vz += dvz / dl * acc; }
  let sp = Math.hypot(F.vx, F.vz);
  // face the way we move (first-person: the body follows the view instead)
  if (camMode !== 'fp' && sp > 0.35 && F.down <= 0) { const d = r5Ang(Math.atan2(-F.vx, -F.vz) - P.yaw), st = clamp(d, -13 * dt, 13 * dt); P.yaw += st; F.turn += (st / Math.max(dt, 1e-4) - F.turn) * Math.min(1, dt * 8); } else F.turn *= Math.exp(-dt * 8);
  // ---- horizontal move + collision (buildings, vehicles, water, steep steps)
  const y = P.pos.y, R = 0.36, ox = P.pos.x, oz = P.pos.z, q = { x: ox + F.vx * dt, z: oz + F.vz * dt };
  if (!walkable(q.x, q.z, y)) { if (walkable(q.x, oz, y)) q.z = oz; else if (walkable(ox, q.z, y)) q.x = ox; else { q.x = ox; q.z = oz; } }
  for (let it = 0; it < 2; it++) for (const c of queryCols(q.x, q.z, R + 2)) { if (c.top < y + 0.55 || c.bottom > y + 1.8) continue; pushOut(c, q, R); }
  for (const v of nearbyVehicles(q.x, q.z, 7)) {
    if (v.y !== undefined && Math.abs(v.y - y) > 2.6) continue;
    if (pushOut(v.col, q, R) && !v.parked && Math.abs(v.v || 0) > 4.5 && F.down <= 0) {   // clipped by moving traffic: knocked off your feet
      const vy = v.yaw || 0; F.vx = -Math.sin(vy) * v.v * 0.7; F.vz = -Math.cos(vy) * v.v * 0.7; F.down = 2.2; F.downT = 0; P.vy = 3.2; F.ground = false; v.stun = Math.max(v.stun || 0, 1.6); toast('Watch the traffic!');
    }
  }
  let g = groundAt(q.x, q.z, y + 0.4);
  if (F.ground && g - y > 1.15) { q.x = ox; q.z = oz; g = groundAt(ox, oz, y + 0.4); }   // a ledge too tall to step up
  if (dt > 0) { const ax = (q.x - ox) / dt, az = (q.z - oz) / dt; if (Math.hypot(ax, az) < sp) { F.vx = ax; F.vz = az; sp = Math.hypot(ax, az); } }
  P.pos.x = q.x; P.pos.z = q.z;
  // ---- vertical: jump, fall, land
  F.jumpQ -= dt;
  if (F.ground) {
    if (F.jumpQ > 0 && F.down <= 0) { P.vy = 6.6 + (F.sprint ? 0.5 : 0); F.ground = false; F.jumpQ = 0; }
    else if (g < y - 0.45) { F.ground = false; P.vy = 0; }
    else { P.pos.y = g > y ? g : y + (g - y) * Math.min(1, dt * 22); P.vy = 0; }
  }
  if (!F.ground) {
    P.vy -= 21 * dt; P.pos.y += P.vy * dt;
    if (P.pos.y <= g && P.vy <= 0) { F.landT = clamp(-P.vy / 11, 0.3, 1); P.pos.y = g; P.vy = 0; F.ground = true; if (F.landT > 0.85) { F.vx *= 0.4; F.vz *= 0.4; } }
  }
  P.speed = sp; P.steer = 0; P.phase += dt * sp * Math.PI / (0.74 + 0.5 * F.runW);
}

// ---------- shoulder camera on a spring arm
function r5CamBlocked(x, y, z) {
  if (y < groundAt(x, z, P.pos.y + 1.2) + 0.22) return true;
  for (const c of queryCols(x, z, 1)) if (y < c.top + 0.15 && y > c.bottom && inCol(c, x, z, 0.28)) return true;
  return false;
}
function r5FootCam(dt, t) {
  const F = FOOT;
  if (cam.yawOff !== 0 || cam.pitch !== F.pp || cam.dragging) F.lookT = t;
  F.camYaw += cam.yawOff; cam.yawOff = 0; cam.lastDrag = t; F.pp = cam.pitch;
  const sp = Math.hypot(F.vx, F.vz);
  if (t - F.lookT > 1.3 && sp > 0.6) { const d = r5Ang(P.yaw - F.camYaw); if (Math.abs(d) < 2.5) F.camYaw += clamp(d, -1.2, 1.2) * dt * 0.85 * Math.min(1, sp / 3); }   // drift behind the runner when the view is left alone
  cam.yawS = F.camYaw;
  const p = clamp(cam.pitch - 0.08, -0.5, 1.25), cy = F.camYaw, fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy), cp = Math.cos(p), sn = Math.sin(p);
  const ks = dt >= 1 ? 1 : 1 - Math.exp(-dt * 16);
  F.tx += (P.pos.x - F.tx) * ks; F.tz += (P.pos.z - F.tz) * ks; F.ty += (P.pos.y - F.ty) * (dt >= 1 ? 1 : 1 - Math.exp(-dt * 10));
  if (Math.hypot(P.pos.x - F.tx, P.pos.z - F.tz) > 6) { F.tx = P.pos.x; F.tz = P.pos.z; F.ty = P.pos.y; }
  const sh = 0.42 * Math.min(1, cam.zoom), ox = F.tx + rx * sh, oy = F.ty + 1.56, oz = F.tz + rz * sh;
  const D = (3.3 + F.runW * 0.6) * cam.zoom; let ok = D;
  for (let s = 0.35; s <= D + 0.3; s += 0.3) if (r5CamBlocked(ox - fx * cp * s, oy + sn * s, oz - fz * cp * s)) { ok = Math.max(0.45, s - 0.4); break; }
  F.camD = dt >= 1 || ok < F.camD ? ok : F.camD + (ok - F.camD) * Math.min(1, dt * 4);
  camPos.set(ox - fx * cp * F.camD, oy + sn * F.camD, oz - fz * cp * F.camD);
  camLook.set(ox + fx * cp * 30, oy - sn * 30, oz + fz * cp * 30);
  camera.position.copy(camPos); camera.lookAt(camLook);
  const fov = 60 + F.runW * 8 * (F.ground ? 1 : 0.6);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
}

// ---------- vehicles you can leave and come back to
function r5DoorSpot(x, z, yaw, hw, hl, y) {
  const rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  for (const [a, b] of [[-(hw + 0.75), 0.2], [hw + 0.75, 0.2], [0, hl + 0.9], [0, -(hl + 0.9)]]) {
    const px = x + rx * a - fx * b, pz = z + rz * a - fz * b;
    if (walkable(px, pz, y) && !r5Blocked(px, pz, groundAt(px, pz, y + 0.4))) return [px, pz];
  }
  return [x + rx * -(hw + 0.75), z + rz * -(hw + 0.75)];
}
function r5Exit(force) {
  const m = P.mode; if (m !== 'drive' && m !== 'cycle') return;
  if (!force && Math.abs(P.speed) > 5) { toast('Slow down to get out'); return; }
  const rig = rigs[m], d = m === 'drive' ? rig.dims : { w: 0.5, len: 1.7 };
  PARK[m] = { x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: P.yaw, pitch: rig.rotation.x, hx: d.w / 2, hz: d.len / 2, name: m === 'drive' ? rig.carName : 'City bike', v: 0, kvx: 0, kvz: 0, kvy: 0, stun: 0, parked: true };
  const [sx, sz] = r5DoorSpot(P.pos.x, P.pos.z, P.yaw, d.w / 2, d.len / 2, P.pos.y);
  r5BaseSetMode('walk', true); P.mode = 'walk';
  P.pos.x = sx; P.pos.z = sz; P.pos.y = groundAt(sx, sz, PARK[m].y + 0.5); P.speed = 0; P.vy = 0;
  Object.assign(FOOT, { vx: 0, vz: 0, ground: true, down: 0, camYaw: cam.yawS + cam.yawOff, tx: sx, ty: P.pos.y, tz: sz }); cam.yawOff = 0;
  r5ModeUI(); toast('On foot');
}
function r5SetCar(mi, color) {   // swap the player's car for a specific model + paint (a car taken off the street)
  const old = rigs.drive, spotI = old && old.spot ? old.spot.intensity : 0, m = MODELS[mi];
  const g = buildCarGroup(mi, color, '#c8ff3a');
  const spot = new THREE.SpotLight(0xfff1d8, spotI, 120, 0.62, 0.55, 1.2); spot.position.set(0, 0.9, -m.len / 2); spot.target.position.set(0, -1.6, -24); g.add(spot, spot.target); g.spot = spot;
  g.rotation.order = 'YXZ'; if (old) scene.remove(old); rigs.drive = g; scene.add(g); carIdx = mi; SPEC.drive.name = g.carName; refreshPanel();
}
function r5Enter(T) {
  const kind = T.kind === 'cycle' ? 'cycle' : 'drive';
  if (T.kind === 'traffic') { const c = T.c, g = traffic.groups[c.mi], col = new THREE.Color('#888'); if (g && g.ims.paint && g.ims.paint.instanceColor) g.ims.paint.getColorAt(c.slot, col); r5SetCar(c.mi, col); c.rd = null; c.cool = 8; c.x = 0; c.z = -99999; }
  if (T.kind === 'street') { r5SetCar(T.mi, T.col); T.take(); }
  PARK[kind] = null;
  r5BaseSetMode(kind, true); P.mode = kind;
  P.pos.set(T.x, T.y !== undefined ? T.y : groundAt(T.x, T.z, P.pos.y + 0.5), T.z); P.pos.y = groundAt(T.x, T.z, P.pos.y + 0.5); P.yaw = T.yaw; P.speed = 0; P.vy = 0; cam.yawS = FOOT.camYaw; cam.yawOff = 0;
  r5ModeUI(); toast(SPEC[kind].name);
}
function r5Target() {   // what can be entered from where we stand
  if (P.mode !== 'walk' || FOOT.down > 0) return null;
  const x = P.pos.x, z = P.pos.z, y = P.pos.y; let best = null, bd = 1e9;
  const tryT = (T, cx, cz, hx, hz, yaw, reach) => { const c = Math.cos(yaw), s = Math.sin(yaw), dx = x - cx, dz = z - cz, lx = dx * c - dz * s, lz = dx * s + dz * c, d = Math.hypot(Math.max(0, Math.abs(lx) - hx), Math.max(0, Math.abs(lz) - hz)); if (d < reach && d < bd) { bd = d; best = T; } };
  if (PARK.drive) { const p = PARK.drive; if (Math.abs(p.y - y) < 2.5) tryT({ kind: 'drive', x: p.x, y: p.y, z: p.z, yaw: p.yaw, label: 'Get in', name: p.name }, p.x, p.z, p.hx, p.hz, p.yaw, 1.5); }
  if (PARK.cycle) { const p = PARK.cycle; if (Math.abs(p.y - y) < 2.5) tryT({ kind: 'cycle', x: p.x, y: p.y, z: p.z, yaw: p.yaw, label: 'Ride', name: 'City bike' }, p.x, p.z, 0.4, 0.9, p.yaw, 1.3); }
  for (const c of CARS) { if (!c.rd || Math.abs(c.v) > 3.5 || Math.abs(c.x - x) > 7 || Math.abs(c.z - z) > 7 || (c.y !== undefined && Math.abs(c.y - y) > 2.5)) continue; tryT({ kind: 'traffic', c, x: c.x, z: c.z, yaw: c.ryaw, label: 'Take', name: MODELS[c.mi] ? MODELS[c.mi].name : 'car' }, c.x, c.z, c.hx, c.hz, c.ryaw, 1.4); }
  if (typeof r5StreetCars === 'function') for (const s of r5StreetCars(x, z, 7)) { if (Math.abs(s.y - y) > 2.5) continue; tryT({ kind: 'street', x: s.x, y: s.y, z: s.z, yaw: s.yaw, mi: s.mi, col: s.col, take: s.take, label: 'Take', name: MODELS[s.mi] ? MODELS[s.mi].name : 'car' }, s.x, s.z, s.hx, s.hz, s.yaw, 1.4); }
  return best;
}
function r5Act() {
  if (!$('map').hidden || camMode === 'scenic') return;
  if (P.mode === 'drive' || P.mode === 'cycle') return r5Exit(false);
  if (P.mode === 'walk') { const T = r5Target(); if (T) r5Enter(T); }
}

// ---------- hooks into the game loop
const r5BaseSetMode = setMode, r5BasePlayer = updatePlayer, r5BaseRig = updateRig, r5BaseCam = updateCamera, r5BaseVeh = nearbyVehicles, r5BaseRigs = buildRigs, r5BaseHint = updateHint;
setMode = (m, quiet) => {
  const was = P.mode;
  if (!quiet && m === was) return;
  if (!quiet && m === 'walk' && (was === 'drive' || was === 'cycle')) return r5Exit(true);   // "Walk" = step out; the vehicle stays where you left it
  if (m === 'drive' || m === 'cycle') { PARK[m] = null; if (was === 'walk') P.speed = 0; }                                     // picking Drive / Cycle brings your vehicle to you
  r5BaseSetMode(m, quiet);
  if (m === 'walk') Object.assign(FOOT, { vx: 0, vz: 0, ground: true, down: 0, camYaw: cam.yawS + cam.yawOff, tx: P.pos.x, ty: P.pos.y, tz: P.pos.z });
  r5ModeUI();
};
updatePlayer = dt => { if (P.mode === 'walk') r5Foot(dt); else r5BasePlayer(dt); };
nearbyVehicles = (x, z, r) => {
  const V = r5BaseVeh(x, z, r);
  for (const k of ['drive', 'cycle']) { const p = PARK[k]; if (!p || P.mode === k || Math.abs(p.x - x) > r + 4 || Math.abs(p.z - z) > r + 4) continue; p.col ||= { cx: 0, cz: 0, hx: p.hx, hz: p.hz, c: 1, s: 0 }; Object.assign(p.col, { cx: p.x, cz: p.z, hx: p.hx, hz: p.hz, c: Math.cos(p.yaw), s: Math.sin(p.yaw) }); p.ryaw = p.yaw; V.push(p); }
  return V;
};
buildRigs = () => {
  r5BaseRigs();
  const w = rigs.walk; w.remove(w.person); w.person = r5Human(w);
};
updateRig = dt => {
  const ph = P.phase;
  r5BaseRig(dt);
  if (P.mode === 'walk') { P.phase = ph; r5Pose(rigs.walk.person, dt); }
  for (const k of ['drive', 'cycle']) { const p = PARK[k], r = rigs[k]; if (!p || !r || P.mode === k) continue; r.visible = true; r.position.set(p.x, p.y, p.z); r.rotation.set(p.pitch || 0, p.yaw, 0); }
};
updateCamera = (dt, t) => {
  if (P.mode === 'walk' && camMode === 'chase') return r5FootCam(dt, t);
  if (P.mode === 'walk') cam.lastDrag = t;   // no auto-recentre on foot: the view stays where you put it
  r5BaseCam(dt, t);
};
updateHint = () => {
  if (P.mode === 'walk') $('hint').innerHTML = '<b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump · <b>X</b> stroll<br><b>F</b> get in / out · drag or click to look · <b>M</b> map';
  else { r5BaseHint(); if (P.mode === 'drive' || P.mode === 'cycle') $('hint').innerHTML += ' · <b>F</b> get out'; }
};
addEventListener('keydown', e => {
  if (e.repeat || (e.target && e.target.tagName === 'INPUT') || !$('map').hidden) return;
  if (e.code === 'KeyF' || e.code === 'Enter') { if (e.target.closest && e.target.closest('button')) return; r5Act(); }
  if (e.code === 'Space' && P.mode === 'walk') FOOT.jumpQ = 0.18;
  if (e.code === 'KeyX' && P.mode === 'walk') { FOOT.slow = !FOOT.slow; toast(FOOT.slow ? 'Strolling' : 'Jogging'); }
});
// mouse capture on foot: click the view to look around without holding a button (Esc releases)
(function r5Pointer() {
  let dn = null;
  canvas.addEventListener('pointerdown', e => { dn = e.pointerType === 'mouse' ? [e.clientX, e.clientY] : null; });
  canvas.addEventListener('pointerup', e => {
    if (!dn || P.mode !== 'walk' || document.pointerLockElement || Math.hypot(e.clientX - dn[0], e.clientY - dn[1]) > 4 || !canvas.requestPointerLock) return;
    try { const pr = canvas.requestPointerLock(); if (pr && pr.catch) pr.catch(() => {}); } catch (err) {}
  });
  document.addEventListener('mousemove', e => { if (document.pointerLockElement !== canvas) return; cam.yawOff -= e.movementX * 0.0026; cam.pitch = clamp(cam.pitch + e.movementY * 0.002, -0.42, 1.25); cam.lastDrag = r5Now(); });
})();

// ---------- HUD: stamina, context prompt, touch buttons
function r5InitUI() {
  if ($('stam')) return;
  const st = document.createElement('div'); st.id = 'stam'; st.innerHTML = '<i></i>'; st.hidden = true; $('gauge').appendChild(st);
  const fb = document.createElement('div'); fb.id = 'footBtns'; fb.hidden = true;
  fb.innerHTML = '<button id="actBtn" class="glass" hidden>GET IN</button><button id="runBtn" class="glass" aria-pressed="false">RUN</button><button id="jumpBtn" class="glass">JUMP</button>';
  $('br').insertBefore(fb, $('gauge'));
  const tap = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(); });
  tap('actBtn', r5Act); tap('jumpBtn', () => { FOOT.jumpQ = 0.18; });
  tap('runBtn', () => { FOOT.runHold = !FOOT.runHold; $('runBtn').classList.toggle('on', FOOT.runHold); $('runBtn').setAttribute('aria-pressed', String(FOOT.runHold)); });
}
function r5ModeUI() {
  r5InitUI();
  const m = P.mode, foot = m === 'walk';
  $('stam').hidden = !foot;
  $('footBtns').hidden = !(isTouch && (foot || m === 'drive' || m === 'cycle'));
  $('runBtn').hidden = $('jumpBtn').hidden = !foot;
  document.querySelectorAll('#modes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  $('veh').textContent = SPEC[m].name; updateHint();
}
let r5UiT = 0, r5Tgt = null, r5RadT = 0;
function r5Frame(dt, t) {
  if (!$('stam')) r5ModeUI();
  r5UiT -= dt;
  if (r5UiT <= 0) {
    r5UiT = 0.1;
    const m = P.mode, cine = camMode === 'scenic' || camMode === 'auto' || camMode === 'aerial' || !!SHOT;
    r5Tgt = m === 'walk' ? r5Target() : null;
    const inVeh = m === 'drive' || m === 'cycle', txt = r5Tgt ? `${r5Tgt.label} <em>${r5Tgt.name}</em>` : '';
    $('prompt').hidden = !r5Tgt || isTouch || cine; if (r5Tgt && $('promptTxt').innerHTML !== txt) $('promptTxt').innerHTML = txt;
    const ab = $('actBtn'); ab.hidden = !(r5Tgt || inVeh); if (!ab.hidden) ab.textContent = inVeh ? 'EXIT' : r5Tgt.kind === 'cycle' ? 'RIDE' : 'GET IN';
    if (m === 'walk') { const s = $('stam'); s.firstChild.style.transform = `scaleX(${FOOT.stam.toFixed(3)})`; s.classList.toggle('low', FOOT.tired); }
    $('radar').hidden = cine || !$('map').hidden;
  }
  r5RadT -= dt; if (r5RadT <= 0 && !$('radar').hidden && !window.__hl) { r5RadT = 0.05; r5Radar(t); }
  if (typeof r5StreetLOD === 'function') r5StreetLOD(dt);
}

// ---------- radar: heading-up street map around the player
const RAD = { near: [], t: 0, range: 120 };
function r5Radar(t) {
  const cv = $('radarC'), g = cv.getContext('2d'), S = cv.width, R = S / 2, px = P.pos.x, pz = P.pos.z;
  const want = P.mode === 'walk' ? 105 : P.mode === 'fly' ? 700 + Math.min(900, P.pos.y * 2) : 170 + Math.abs(P.speed) * 3.5;
  RAD.range += (want - RAD.range) * 0.08; const range = RAD.range, sc = R / range;
  if (t - RAD.t > 0.6 || t < RAD.t) {
    RAD.t = t; RAD.near.length = 0; const lim = range * 1.5 + 60, big = range > 420;
    for (const rd of RC.roads) { if (rd.dead || rd.cls > 3 && rd.cls !== 6 || big && rd.cls > 2) continue; const mi = (rd.n >> 1) * 2; if (Math.abs(rd.P[mi] - px) < lim + rd.L / 2 && Math.abs(rd.P[mi + 1] - pz) < lim + rd.L / 2) RAD.near.push(rd); }
  }
  let yaw = camMode === 'chase' || camMode === 'fp' || camMode === 'low' ? (P.mode === 'walk' && camMode === 'chase' ? FOOT.camYaw : cam.yawS + (camMode === 'fp' ? cam.yawOff : 0)) : P.yaw;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#16121f'; g.fillRect(0, 0, S, S);
  g.save(); g.beginPath(); g.arc(R, R, R, 0, 7); g.clip();
  g.setTransform(c * sc, s * sc, -s * sc, c * sc, R, R); g.translate(-px, -pz);
  if (RC.mapBase) { const e = range * 1.5, sx = (px - e - RCB.x0) * RC_MS, sy = (pz - e - RCB.z0) * RC_MS, sw = 2 * e * RC_MS; g.globalAlpha = 0.9; g.imageSmoothingEnabled = true; g.drawImage(RC.mapBase, sx, sy, sw, sw, px - e, pz - e, 2 * e, 2 * e); g.globalAlpha = 1; }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pass of [0, 1]) for (const rd of RAD.near) {
    const hw = rd.cls === 0;
    if (pass === 0) { g.strokeStyle = '#0c0a12'; g.lineWidth = Math.max(rd.w + 5, 5 / sc); } else { g.strokeStyle = hw ? '#e9c46a' : rd.cls <= 2 ? '#e9e4f2' : '#aaa3ba'; g.lineWidth = Math.max(rd.w, (hw ? 3.2 : rd.cls <= 2 ? 2.6 : 1.7) / sc); }
    g.beginPath(); const Pp = rd.P, st = range > 300 ? 3 : 1; g.moveTo(Pp[0], Pp[1]); for (let i = st; i < rd.n - 1; i += st) g.lineTo(Pp[2 * i], Pp[2 * i + 1]); g.lineTo(Pp[2 * rd.n - 2], Pp[2 * rd.n - 1]); g.stroke();
  }
  if (P.mode !== 'fly') { g.fillStyle = '#8f88a3'; for (const cr of CARS) if (cr.rd && Math.abs(cr.x - px) < range && Math.abs(cr.z - pz) < range) { g.beginPath(); g.arc(cr.x, cr.z, 2.6 / sc, 0, 7); g.fill(); } }
  g.fillStyle = '#b79bff'; for (const L of RC_LM) if (Math.abs(L[1] - px) < range && Math.abs(L[2] - pz) < range) { g.beginPath(); g.arc(L[1], L[2], 5 / sc, 0, 7); g.fill(); }
  g.restore(); g.setTransform(1, 0, 0, 1, 0, 0);
  const blip = (x, z, col, sq) => { let bx = (c * (x - px) - s * (z - pz)) * sc, by = (s * (x - px) + c * (z - pz)) * sc; const d = Math.hypot(bx, by), m = R - 12; if (d > m) { bx *= m / d; by *= m / d; } g.fillStyle = '#0c0a12'; g.fillRect(R + bx - 8, R + by - 8, 16, 16); g.fillStyle = col; g.fillRect(R + bx - 6, R + by - 6, 12, 12); };
  if (PARK.drive && P.mode !== 'drive') blip(PARK.drive.x, PARK.drive.z, '#c8ff3a'); if (PARK.cycle && P.mode !== 'cycle') blip(PARK.cycle.x, PARK.cycle.z, '#3ad7ff');
  // you
  g.save(); g.translate(R, R); g.rotate(yaw - P.yaw); g.fillStyle = 'rgba(200,255,58,.2)'; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
  g.fillStyle = '#c8ff3a'; g.strokeStyle = '#0c0a12'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -13); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.fill(); g.stroke(); g.restore();
  g.fillStyle = '#efecf5'; g.font = '800 22px "Saira Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', R + s * (R - 18), R - c * (R - 18));
  g.strokeStyle = 'rgba(196,178,255,.35)'; g.lineWidth = 3; g.beginPath(); g.arc(R, R, R - 1.5, 0, 7); g.stroke();
}

// ---------- pedestrians: instanced walkers on the sidewalks of the streets around you
const PED = { list: [], N: isTouch ? 14 : 34, im: null, t: 0, roads: [], rp: [0, 0, 0, 0, 0, 0] };
const R5_SKIN = ['#8a5a3e', '#5b3a29', '#c58c67', '#e0b494', '#a4704c', '#6f4630'], R5_TOP = ['#1f3d6b', '#7a1d1d', '#2f5d48', '#e9e6de', '#15171b', '#b0a089', '#5b2a6e', '#c9a13a', '#3a78d8', '#8a9096', '#0b4f53', '#a33a2a', '#d7d9dc', '#00493a'],
  R5_BOT = ['#26324a', '#1b1d22', '#3d4654', '#5a5448', '#2b2d31', '#44506a', '#7a7466'], R5_HAIR = ['#17120f', '#2b1d14', '#4a3524', '#8a8a8a', '#e8e8e8', '#1f3d6b', '#7a1d1d', '#c2a060'];
function r5PedInit() {
  const M = () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, metalness: 0 }), N = PED.N;
  const G = {
    torso: new THREE.CapsuleGeometry(0.16, 0.36, 3, 8).scale(1.1, 1, 0.72).translate(0, 1.2, 0),
    head: new THREE.SphereGeometry(0.108, 10, 8).scale(0.95, 1.1, 1).translate(0, 1.63, 0),
    hair: new THREE.SphereGeometry(0.116, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.645, 0.012),
    thigh: new THREE.CapsuleGeometry(0.078, 0.29, 3, 6).translate(0, -0.21, 0), shin: new THREE.CapsuleGeometry(0.06, 0.27, 3, 6).translate(0, -0.2, 0),
    shoe: new THREE.BoxGeometry(0.1, 0.08, 0.26).translate(0, -0.42, -0.05), arm: new THREE.CapsuleGeometry(0.048, 0.46, 3, 6).translate(0, -0.26, 0)
  };
  PED.im = {};
  for (const k in G) { const im = new THREE.InstancedMesh(G[k], M(), N * (k === 'torso' || k === 'head' || k === 'hair' ? 1 : 2)); im.frustumCulled = false; im.castShadow = k === 'torso' || k === 'thigh' || k === 'shin'; im.count = 0; scene.add(im); PED.im[k] = im; }
  const R = mulberry32(4471), pk = a => a[Math.floor(R() * a.length)], col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const p = { on: false, x: 0, y: 0, z: 0, yaw: 0, rd: null, s: 0, dir: 1, side: 1, v: 0, v0: 1.15 + R() * 0.5, ph: R() * 6, h: 0.92 + R() * 0.14, wait: 0, flee: 0, fx: 0, fz: 0, down: 0, kx: 0, kz: 0, cool: R() * 3, mv: 0 };
    PED.list.push(p);
    const skin = pk(R5_SKIN), top = pk(R5_TOP), bot = pk(R5_BOT), sleeves = R() < 0.6;
    PED.im.torso.setColorAt(i, col.set(top)); PED.im.head.setColorAt(i, col.set(skin)); PED.im.hair.setColorAt(i, col.set(pk(R5_HAIR)));
    for (const j of [0, 1]) { PED.im.thigh.setColorAt(2 * i + j, col.set(bot)); PED.im.shin.setColorAt(2 * i + j, col.set(R() < 0.15 ? skin : bot)); PED.im.shoe.setColorAt(2 * i + j, col.set(R() < 0.5 ? '#e8e6e0' : '#1c1c1f')); PED.im.arm.setColorAt(2 * i + j, col.set(sleeves ? top : skin)); }
  }
}
function r5PedPath(p, s, out) {   // point on the ped's sidewalk line at arc length s
  const rp = rcRoadPoint(p.rd, s, PED.rp), off = (p.rd.w / 2 + 1.15) * p.side;
  out[0] = rp[0] - rp[3] * off; out[1] = rp[1] + rp[2] * off; return out;
}
const _pp = [0, 0];
function r5PedSpawn(p) {
  if (!PED.roads.length) return;
  for (let k = 0; k < 5; k++) {
    const rd = PED.roads[Math.floor(Math.random() * PED.roads.length)]; if (rd.dead) continue;
    p.rd = rd; p.s = Math.random() * rd.L; p.side = Math.random() < 0.5 ? 1 : -1; p.dir = Math.random() < 0.5 ? 1 : -1;
    const [x, z] = r5PedPath(p, p.s, _pp), d = Math.hypot(x - P.pos.x, z - P.pos.z);
    if (d < 30 || d > 165 || isWater(x, z) || rcTrMaskV(x, z) > 100) continue;
    const y = groundAt(x, z, PED.rp[4] + 0.6); if (Math.abs(y - PED.rp[4]) > 1.5 || r5Blocked(x, z, y)) continue;
    Object.assign(p, { on: true, x, z, y, yaw: Math.atan2(-PED.rp[2] * p.dir, -PED.rp[3] * p.dir), v: p.v0, wait: 0, flee: 0, down: 0, kx: 0, kz: 0 }); return;
  }
}
function r5PedNext(p) {
  const rd = p.rd, end = p.dir > 0, key = end ? rd.k1 : rd.k0, opts = [];
  for (const r of RC.ends.get(key) || []) if (r !== rd && !r.dead && r.cls >= 1 && r.cls <= 3 && r.L > 12) opts.push(r);
  if (!opts.length || Math.random() < 0.2) { p.dir = -p.dir; p.s = clamp(p.s, 0, rd.L); return; }
  const r = opts[Math.floor(Math.random() * opts.length)], ex = end ? rd.P[2 * rd.n - 2] : rd.P[0], ez = end ? rd.P[2 * rd.n - 1] : rd.P[1];
  const d0 = Math.hypot(r.P[0] - ex, r.P[1] - ez), d1 = Math.hypot(r.P[2 * r.n - 2] - ex, r.P[2 * r.n - 1] - ez);
  p.rd = r; p.dir = d0 <= d1 ? 1 : -1; p.s = p.dir > 0 ? Math.min(r.L, rd.w / 2 + 2) : Math.max(0, r.L - rd.w / 2 - 2);
  let bs = 1, bd = 1e9; for (const sd of [-1, 1]) { p.side = sd; const [x, z] = r5PedPath(p, p.s, _pp), d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; bs = sd; } } p.side = bs;
}
const _mB = new THREE.Matrix4(), _mT = new THREE.Matrix4(), _mR = new THREE.Matrix4(), _mA = new THREE.Matrix4(), _mK = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _pe = new THREE.Euler(0, 0, 0, 'YXZ'), _pv = new V3(), _ps = new V3();
function r5Peds(dt, t) {
  if (!RC.ready) return; if (!PED.im) r5PedInit();
  const px = P.pos.x, pz = P.pos.z, cine = P.mode === 'fly' && r5Above() > 120;
  PED.t -= dt;
  if (PED.t <= 0) {
    PED.t = 1.2; PED.roads.length = 0;
    if (!cine) for (const rd of RC.roads) { if (rd.dead || rd.cls < 1 || rd.cls > 3 || rd.L < 30) continue; const mi = (rd.n >> 1) * 2; if (Math.abs(rd.P[mi] - px) < 150 + rd.L / 2 && Math.abs(rd.P[mi + 1] - pz) < 150 + rd.L / 2) PED.roads.push(rd); }
  }
  const active = Math.round(PED.N * (timeId === 'night' ? 0.45 : 1) * (RAIN.on ? 0.6 : 1));
  const drv = P.mode === 'drive' || P.mode === 'cycle', pyaw = P.yaw, cfx = -Math.sin(pyaw), cfz = -Math.cos(pyaw), cs = Math.abs(P.speed), hw = drv && P.mode === 'drive' ? rigs.drive.dims.w / 2 : 0.4, hl = drv && P.mode === 'drive' ? rigs.drive.dims.len / 2 : 0.9;
  const im = PED.im, hideP = i => { for (const k in im) { if (k === 'torso' || k === 'head' || k === 'hair') im[k].setMatrixAt(i, _hide); else { im[k].setMatrixAt(2 * i, _hide); im[k].setMatrixAt(2 * i + 1, _hide); } } };
  for (let i = 0; i < PED.list.length; i++) {
    const p = PED.list[i];
    if (!p.on) { p.cool -= dt; if (i < active && p.cool <= 0 && !cine) { p.cool = 0.3 + Math.random(); r5PedSpawn(p); } if (!p.on) { hideP(i); continue; } }
    const dp = Math.hypot(p.x - px, p.z - pz);
    if (dp > 200 || p.rd.dead || i >= active && dp > 60) { p.on = false; hideP(i); continue; }
    const n = i; let tv = p.v0;
    if (p.down > 0) {
      p.down -= dt; p.x += p.kx * dt; p.z += p.kz * dt; const dk = Math.exp(-dt * 3); p.kx *= dk; p.kz *= dk; tv = 0; p.v = 0;
    } else {
      // the player's vehicle: get out of the way, or get knocked over
      const rx = p.x - px, rz = p.z - pz, ah = rx * cfx + rz * cfz, lat = rx * cfz - rz * cfx, fwd = P.speed >= 0 ? ah : -ah;
      if (drv && Math.abs(P.pos.y - p.y) < 2.5) {
        if (cs > 3 && Math.abs(lat) < hw + 0.35 && Math.abs(ah) < hl + 0.4) { p.down = 4.5 + Math.random() * 2; p.kx = cfx * P.speed * 0.75 + (lat > 0 ? cfz : -cfz) * 2; p.kz = cfz * P.speed * 0.75 + (lat > 0 ? -cfx : cfx) * 2; P.speed *= 0.86; p.flee = 0; }
        else if (cs > 4 && fwd > 0 && fwd < 9 + cs * 0.9 && Math.abs(lat) < hw + 2.2 && p.flee <= 0) { p.flee = 1.6 + Math.random(); const sgn = lat >= 0 ? 1 : -1; p.fx = cfz * sgn; p.fz = -cfx * sgn; }
      } else if (P.mode === 'walk' && dp < 0.75 && Math.abs(P.pos.y - p.y) < 1.5) {   // bumping shoulders: both give way
        const l = dp || 1, push = (0.75 - dp); p.x += rx / l * push * 0.6; p.z += rz / l * push * 0.6; P.pos.x -= rx / l * push * 0.4; P.pos.z -= rz / l * push * 0.4; p.wait = Math.max(p.wait, 0.5);
        if (FOOT.sprint && Math.hypot(FOOT.vx, FOOT.vz) > 5.5) { p.down = 1.6; p.kx = FOOT.vx * 0.5; p.kz = FOOT.vz * 0.5; }
      }
      if (p.flee > 0) {
        p.flee -= dt; tv = 5.4; const nx = p.x + p.fx * tv * dt, nz = p.z + p.fz * tv * dt;
        if (!r5Blocked(nx, nz, p.y) && !isWater(nx, nz)) { p.x = nx; p.z = nz; } else tv = 0;
        p.yaw += r5Ang(Math.atan2(-p.fx, -p.fz) - p.yaw) * Math.min(1, dt * 12);
      } else if (p.wait > 0) { p.wait -= dt; tv = 0; }
      else {
        const [ax, az] = r5PedPath(p, clamp(p.s + p.dir * 1.2, 0, p.rd.L), _pp), dx = ax - p.x, dz = az - p.z, d = Math.hypot(dx, dz);
        if (d < 2.2) { p.s += p.v0 * dt * p.dir; if (p.s > p.rd.L || p.s < 0) r5PedNext(p); }
        if (d > 0.05) { const st = Math.min(d, p.v0 * dt * (d > 2.2 ? 1.25 : 1)); p.x += dx / d * st; p.z += dz / d * st; p.yaw += r5Ang(Math.atan2(-dx, -dz) - p.yaw) * Math.min(1, dt * 7); }
        if (Math.random() < dt * 0.012) p.wait = 2 + Math.random() * 5;
      }
      p.v += (tv - p.v) * Math.min(1, dt * 6);
    }
    p.y = groundAt(p.x, p.z, p.y + 0.6) + (typeof r5WalkLift === 'function' ? r5WalkLift(p.x, p.z) : 0);
    p.ph += dt * p.v * Math.PI / (p.v > 3 ? 1.1 : 0.72);
    // ---- instance matrices
    const w = Math.min(1, p.v / 1.2), run = p.v > 3 ? 1 : 0, dn = p.down > 0 ? clamp(Math.min((6.5 - p.down) * 6, p.down * 1.4), 0, 1) : 0;
    _pe.set(dn * 1.45 - run * 0.2, p.yaw, 0); _pq.setFromEuler(_pe); _pv.set(p.x, p.y + dn * 0.14 + Math.abs(Math.cos(p.ph)) * 0.02 * w, p.z); _ps.set(p.h, p.h, p.h); _mB.compose(_pv, _pq, _ps);
    im.torso.setMatrixAt(n, _mB); im.head.setMatrixAt(n, _mB); im.hair.setMatrixAt(n, _mB);
    for (const j of [0, 1]) {
      const sg = j ? 1 : -1, sn = Math.sin(p.ph + (j ? Math.PI : 0)), cs2 = Math.cos(p.ph + (j ? Math.PI : 0)), A = (0.48 + run * 0.35) * w;
      _mT.makeRotationX(sn * A); _mT.setPosition(sg * 0.09, 0.9, 0); _mA.multiplyMatrices(_mB, _mT); im.thigh.setMatrixAt(2 * n + j, _mA);
      _mK.makeRotationX(-(0.06 + (0.55 + run * 0.6) * Math.max(0, cs2)) * w); _mK.setPosition(0, -0.44, 0); _mR.multiplyMatrices(_mA, _mK); im.shin.setMatrixAt(2 * n + j, _mR); im.shoe.setMatrixAt(2 * n + j, _mR);
      _mT.makeRotationX(-sn * (0.38 + run * 0.5) * w); _mT.setPosition(sg * 0.235, 1.44, 0); _mA.multiplyMatrices(_mB, _mT); im.arm.setMatrixAt(2 * n + j, _mA);
    }
  }
  for (const k in im) { im[k].count = im[k].instanceMatrix.count; im[k].instanceMatrix.needsUpdate = true; }
}

// ================================================================ STREETS (v20)
// Street-level realism built per tile from the same road polylines: bridge decks with fascias, parapets and piers; median
// barriers and overhead sign gantries on the expressways; traffic signals (that traffic obeys), stop signs, crosswalks and stop
// bars at intersections; street lamps with light pools at night; kerbside parked cars you can take.
const ST = { seg: new Map(), park: new Map(), chunks: [], gen: 0, kit: null, uLamp: { value: 0 }, uSig: { value: [5, 0.1, 0.1, 0.1, 0.1, 5] }, state: [2, 0], taken: new Set(), near: [], cols: [], px: 1e9, pz: 1e9, pgen: -1, pt: 0, f: 0, sid: 0 };
const ST_C = 32, ST_PC = 64, ST_GE = [Math.cos(9.18 * Math.PI / 180), Math.sin(9.18 * Math.PI / 180)];
const r5K = (i, j) => i * 100003 + j;
function r5SegAdd(t, e) {
  const P = e.P, hw = e.w / 2;
  for (let i = 0; i < e.n - 1; i++) {
    const ax = P[2 * i], az = P[2 * i + 1], bx = P[2 * i + 2], bz = P[2 * i + 3], sg = { ax, az, bx, bz, hw, y: (e.Y[i] + e.Y[i + 1]) / 2, e, t };
    for (let gx = Math.floor(Math.min(ax, bx) / ST_C); gx <= Math.floor(Math.max(ax, bx) / ST_C); gx++) for (let gz = Math.floor(Math.min(az, bz) / ST_C); gz <= Math.floor(Math.max(az, bz) / ST_C); gz++) {
      const k = r5K(gx, gz); let a = ST.seg.get(k); if (!a) ST.seg.set(k, a = []); a.push(sg); t.r5k.add(k);
    }
  }
}
// another carriageway's asphalt (within pad of its edge, at about the same level) at this point?
function r5NearOther(x, z, y, self, pad, dy = 3) {
  const R = 20;
  for (let gx = Math.floor((x - R) / ST_C); gx <= Math.floor((x + R) / ST_C); gx++) for (let gz = Math.floor((z - R) / ST_C); gz <= Math.floor((z + R) / ST_C); gz++) {
    const a = ST.seg.get(r5K(gx, gz)); if (!a) continue;
    for (const sg of a) {
      if (sg.e === self || Math.abs(sg.y - y) > dy) continue;
      const dx = sg.bx - sg.ax, dz = sg.bz - sg.az, t = clamp(((x - sg.ax) * dx + (z - sg.az) * dz) / (dx * dx + dz * dz || 1e-9), 0, 1);
      if (Math.hypot(x - sg.ax - dx * t, z - sg.az - dz * t) < sg.hw + pad) return sg;
    }
  }
  return null;
}
function r5TileGone(t) {
  if (t.r5k) { for (const k of t.r5k) { const a = ST.seg.get(k); if (!a) continue; const b = a.filter(s => s.t !== t); if (b.length) ST.seg.set(k, b); else ST.seg.delete(k); } t.r5k = null; }
  if (t.r5p) { for (const k of t.r5p) { const a = ST.park.get(k); if (!a) continue; const b = a.filter(s => s.t !== t); if (b.length) ST.park.set(k, b); else ST.park.delete(k); } t.r5p = null; }
  t.r5par = null; ST.gen++;
}
// per-point frame of a road polyline (same normals / mitres as rcStrip)
function r5Frame2(P, n) {
  const NX = new Float32Array(n), NZ = new Float32Array(n), MT = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let dx, dz;
    if (i === 0) { dx = P[2] - P[0]; dz = P[3] - P[1]; } else if (i === n - 1) { dx = P[2 * i] - P[2 * i - 2]; dz = P[2 * i + 1] - P[2 * i - 1]; }
    else { const ax = P[2 * i] - P[2 * i - 2], az = P[2 * i + 1] - P[2 * i - 1], bx = P[2 * i + 2] - P[2 * i], bz = P[2 * i + 3] - P[2 * i + 1]; const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; dx = ax / la + bx / lb; dz = az / la + bz / lb; }
    const l = Math.hypot(dx, dz) || 1; NX[i] = -dz / l; NZ[i] = dx / l; MT[i] = i === 0 || i === n - 1 ? 1 : Math.min(1.5, 2 / Math.max(l, 1.3333));
  }
  return [NX, NZ, MT];
}
const _ra = [0, 0, 0, 0, 0, 0];
// surface height of road e at arc length s, d metres to the right of its centre line (matches rcStrip's cross-section)
function r5RoadY(e, s, d, rp) {
  rp = rp || rcRoadPoint(e, s, _ra); const x = rp[0], z = rp[1], nx = -rp[3], nz = rp[2], yc = rp[4], h = e.w / 2;
  if (e.brg) return yc;
  const hc = rcH(x, z), ed = sg => { const he = rcH(x + nx * h * sg, z + nz * h * sg); return Math.max(yc + clamp(he - hc, -0.25 * h - 0.2, 0.25 * h + 0.2), he + 0.05); };
  const yr = ed(1), yl = ed(-1), t = clamp((d + h) / (2 * h), 0, 1); return yl + (yr - yl) * t;
}
function r5Merge(parts) {   // [[geometry, colour, glow = 0, tint = 0], ...] -> one non-indexed geometry with colour / aGlow / aTint
  let n = 0; const gs = parts.map(([g]) => { const q = g.index ? g.toNonIndexed() : g; n += q.attributes.position.count; return q; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), glow = new Float32Array(n), tint = new Float32Array(n), uv = new Float32Array(n * 2), c = new THREE.Color(); let o = 0;
  parts.forEach(([, hex, gl = 0, tn = 0], i) => { const q = gs[i], m = q.attributes.position.count; pos.set(q.attributes.position.array, o * 3); nor.set(q.attributes.normal.array, o * 3); if (q.attributes.uv) uv.set(q.attributes.uv.array, o * 2); c.set(hex); for (let k = 0; k < m; k++) { col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b; glow[o + k] = gl; tint[o + k] = tn; } o += m; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1)); g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere(); return g;
}
function r5GlowMat(kind) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.62, metalness: 0.25 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uLamp = ST.uLamp; sh.uniforms.uSig = ST.uSig;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow;\n' + (kind === 'sig' ? 'attribute float iGrp;\nuniform float uSig[6];\n' : 'uniform float uLamp;\n') + 'varying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (kind === 'sig' ? 'vGlow = aGlow > 0.5 ? uSig[int(iGrp + 0.5) * 3 + int(aGlow + 0.5) - 1] : 0.0;' : 'vGlow = aGlow * uLamp;'));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow;');
  };
  m.customProgramCacheKey = () => 'r5' + kind; return m;
}
function r5SignTex() {   // overhead guide signs: 2 x 5 panels
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1280; const g = cv.getContext('2d');
  const shield = (x, y, num, us) => {
    g.save(); g.translate(x, y);
    if (us) { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-46, -50); g.lineTo(46, -50); g.quadraticCurveTo(58, 0, 40, 34); g.quadraticCurveTo(0, 62, -40, 34); g.quadraticCurveTo(-58, 0, -46, -50); g.fill(); g.fillStyle = '#111'; }
    else { g.fillStyle = '#1b3f94'; g.beginPath(); g.moveTo(-48, -52); g.lineTo(48, -52); g.quadraticCurveTo(56, 6, 0, 58); g.quadraticCurveTo(-56, 6, -48, -52); g.fill(); g.fillStyle = '#c1272d'; g.fillRect(-46, -52, 92, 26); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#fff'; }
    g.font = '800 ' + (num.length > 2 ? 46 : 56) + 'px "Saira Condensed","Arial Narrow",Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 0, us ? 2 : 14); g.restore();
  };
  const panel = (k, num, us, dir, l1, l2) => {
    const x = (k % 2) * 512, y = Math.floor(k / 2) * 256;
    g.fillStyle = '#0b6a3f'; g.fillRect(x, y, 512, 256); g.strokeStyle = '#f2f2ee'; g.lineWidth = 7; g.beginPath(); g.roundRect(x + 10, y + 10, 492, 236, 22); g.stroke();
    g.fillStyle = '#f2f2ee'; g.textBaseline = 'middle';
    if (num) { shield(x + 86, y + 84, num, us); g.textAlign = 'left'; g.font = '700 50px "Saira Condensed","Arial Narrow",Arial,sans-serif'; g.fillText(dir, x + 160, y + 82); }
    g.textAlign = 'center'; g.font = '700 ' + (num ? 50 : 60) + 'px "Saira Condensed","Arial Narrow",Arial,sans-serif';
    if (l2) { g.fillText(l1, x + 256, y + (num ? 158 : 92)); g.fillText(l2, x + 256, y + (num ? 208 : 164)); } else g.fillText(l1, x + 256, y + (num ? 182 : 128));
  };
  panel(0, '95', 0, 'NORTH', 'Trenton', 'New York'); panel(1, '95', 0, 'SOUTH', 'Phila Intl Airport', 'Chester');
  panel(2, '76', 0, 'WEST', 'Valley Forge', 'Harrisburg'); panel(3, '76', 0, 'EAST', 'Sports Complex', 'Walt Whitman Br');
  panel(4, '676', 0, 'EAST', 'Ben Franklin Br', 'Camden'); panel(5, '676', 0, 'WEST', 'Art Museum', 'to I-76');
  panel(6, '1', 1, 'NORTH', 'Roosevelt Blvd', 'Northeast Phila'); panel(7, '1', 1, 'SOUTH', 'City Ave', 'to I-76');
  panel(8, '', 0, '', 'Central Phila', 'Broad St'); panel(9, '', 0, '', 'Local Streets', 'EXIT  ↗');
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function r5Kit() {
  if (ST.kit) return ST.kit;
  const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z), Cy = (r0, r1, h, y, sg = 6) => new THREE.CylinderGeometry(r0, r1, h, sg).translate(0, y, 0);
  const K = ST.kit = {};
  // street lamp: local +X reaches over the road; the lens glows with uLamp
  K.lamp = r5Merge([[Cy(0.07, 0.11, 8.4, 4.2), '#ffffff'], [Cy(0.17, 0.2, 0.5, 0.25), '#d0d0d0'], [B(2.5, 0.08, 0.08, 1.25, 8.5, 0).rotateZ(0.05), '#ffffff'], [B(0.72, 0.13, 0.32, 2.75, 8.63, 0), '#e8e8e8'], [B(0.5, 0.05, 0.24, 2.78, 8.545, 0), '#fff3d6', 1]]);
  K.lampMat = r5GlowMat('lamp');
  // signals: lenses face local -Z; aGlow 1 / 2 / 3 = red / yellow / green
  const head = (x, y, z) => { const o = [[B(0.36, 1.04, 0.26, x, y, z), '#c59a1e'], [B(0.5, 1.2, 0.03, x, y, z + 0.14), '#17181a']]; [['#8a1a12', 1, 0.32], ['#8a6a0c', 2, 0], ['#0e6a34', 3, -0.32]].forEach(([c, gl, dy]) => o.push([new THREE.CircleGeometry(0.105, 10).rotateY(Math.PI).translate(x, y + dy, z - 0.135), c, gl])); return o; };
  K.mast = r5Merge([[Cy(0.09, 0.13, 6.5, 3.25), '#2b2f2d'], [Cy(0.2, 0.22, 0.4, 0.2), '#2b2f2d'], [B(5.4, 0.11, 0.11, 2.7, 6.25, 0), '#2b2f2d'], ...head(5.1, 5.6, 0), ...head(2.6, 5.6, 0), ...head(0.34, 3.5, 0)]);
  K.post = r5Merge([[Cy(0.07, 0.09, 4.1, 2.05), '#2b2f2d'], [Cy(0.16, 0.18, 0.35, 0.17), '#2b2f2d'], ...head(0, 3.45, -0.2)]);
  K.sigMat = r5GlowMat('sig');
  // stop sign: one alpha-tested texture (the octagon; a grey patch in the corner colours the post and the back)
  { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); g.clearRect(0, 0, 128, 128); g.fillStyle = '#8d9196'; g.fillRect(0, 112, 16, 16);
    const oct = (r, c) => { g.fillStyle = c; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(64 + Math.cos(a) * r, 60 + Math.sin(a) * r); } g.closePath(); g.fill(); };
    oct(58, '#f4f4f0'); oct(53, '#b4201c'); g.fillStyle = '#f4f4f0'; g.font = '800 36px "Saira Condensed","Arial Narrow",Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 64, 62);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    const grey = geo => { const u = geo.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, 0.06, 0.06); return geo; };
    K.stop = r5Merge([[new THREE.PlaneGeometry(0.76, 0.76).rotateY(Math.PI).translate(0, 2.35, -0.035), '#ffffff'], [grey(new THREE.CircleGeometry(0.4, 8, Math.PI / 8).translate(0, 2.35, -0.03)), '#ffffff'], [grey(Cy(0.03, 0.03, 2.75, 1.375, 5)), '#ffffff']]);
    K.stopMat = new THREE.MeshStandardMaterial({ map: tx, alphaTest: 0.5, roughness: 0.6, metalness: 0.1 }); }
  { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    K.pool = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    K.poolMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: '#ffcf8a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -10 }); }
  K.paint = new THREE.MeshStandardMaterial({ color: '#d6d4cb', roughness: 0.72, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -10 });
  K.sign = new THREE.MeshStandardMaterial({ map: r5SignTex(), roughness: 0.55, metalness: 0.1 }); K.sign.emissiveMap = K.sign.map; K.sign.emissive = new THREE.Color('#ffffff'); K.sign.emissiveIntensity = 0.12;
  // parked cars: body paint takes the instance colour (aTint = 1); glass, trim and tyres keep their own
  K.carMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, metalness: 0.4, roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.12 });
  K.carMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTint;').replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvColor.rgb = mix(color.rgb, vColor.rgb, aTint);\n#endif'); };
  K.carMat.customProgramCacheKey = () => 'r5car';
  const wheels = (wx, wz, r = 0.34) => [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]].map(([x, z]) => [new THREE.CylinderGeometry(r, r, 0.24, 10).rotateZ(Math.PI / 2).translate(x, r, z), '#141414']);
  const CC = { paint: ['#ffffff', 1], accent: ['#3b3d42', 0], glass: ['#0b0f15', 0], dark: ['#131417', 0], chrome: ['#b9bec4', 0], head: ['#dfe3e8', 0], tail: ['#5a0c0c', 0] };
  if (ST.parkOn) K.cars = MODELS.map(m => { const geos = decodeModel(m, 't'), parts = []; for (const [cat, geo] of Object.entries(geos)) { const c = CC[cat] || CC.dark; parts.push([geo, c[0], 0, c[1]]); } const wo = wheelOffsets(m); parts.push(...wheels(wo[1][0], wo[2][1], 0.35)); return r5Merge(parts); });
  const low = (len, h1, h2, cab0, cab1) => { const sh = new THREE.Shape(), hl = len / 2; [[-hl, 0.3], [hl, 0.3], [hl, h1 - 0.08], [hl - 0.25, h1], [cab1 + 0.55, h1 + 0.04], [cab1, h2], [cab0, h2], [cab0 - 0.6, h1 + 0.05], [-hl + 0.1, h1], [-hl, h1 - 0.1]].forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
    const body = new THREE.ExtrudeGeometry(sh, { depth: 1.84, bevelEnabled: false }).translate(0, 0, -0.92).rotateY(Math.PI / 2);   // nose towards -Z
    const gh = h2 - h1 - 0.12, gl = cab1 - cab0 + 0.5, gm = (cab0 + cab1) / 2;
    return r5Merge([[body, '#ffffff', 0, 1], [B(1.88, gh, gl * 0.82, 0, h1 + 0.1 + gh / 2, -gm), '#0b0f15'], [B(1.5, gh, gl + 0.5, 0, h1 + 0.1 + gh / 2, -gm), '#0b0f15'], [B(1.5, 0.12, 0.05, 0, h1 - 0.2, -hl - 0.01), '#dfe3e8'], [B(1.5, 0.12, 0.05, 0, h1 - 0.15, hl + 0.01), '#6a0e0e'], ...wheels(0.86, len * 0.31)]); };
  if (ST.parkOn) K.low = [low(4.6, 0.88, 1.38, -0.75, 1.05), low(4.8, 1.02, 1.66, -1.0, 1.75)];   // sedan, SUV
  return K;
}
function r5Lane(c, nl0) {   // lane centre (metres right of the centre line, in the car's own direction) on a street with kerbside parking
  const pk = c.rd.pk, lo = pk.lo, hi = pk.hi;
  if (c.rd.ow) { const nl = Math.max(1, Math.min(nl0 || 1, Math.floor((hi - lo) / 2.9))), k = Math.min(nl - 1, Math.floor((c.lane || 0) * nl)); return (lo + (hi - lo) * (k + 0.5) / nl) * c.rd.ow; }
  const mid = (lo + hi) / 2; return c.dir > 0 ? (mid + hi) / 2 : -(lo + mid) / 2;
}
function r5SigWant(c, want) {
  for (const sg of c.rd.sigs) {
    if (sg.sig !== -c.dir) continue;
    const d = (c.s - sg.s) * sg.sig - sg.stop - c.hz; if (d < -2.5 || d > 45) continue;
    const st = ST.state[sg.grp]; if (st === 2 || st === 1 && d > 9) want = Math.min(want, Math.max(0, d * 0.85));
  }
  return want;
}


// ================================================================ Walt Whitman Bridge (Blender: tools/build_wwb.py -> data/wwb.wasm)
// I-76 over the Delaware: 610 m main span, 115 m steel towers, anchorages and approach viaducts. The model replaces OSM's bridge
// ways; the deck is drivable (bridge raster), with colliders on the parapets, tower legs and median.
const WWB = Object.assign(LMF(2913.0, 5223.3, 12.45), { UPA: -2003, UNJ: 1242, GPA: 5.8, GNJ: 1.6, TW: 305, AN: 540, HW: 14.6 });
function wwbDeck(u) {
  const a = Math.abs(u);
  if (a <= WWB.TW) return 45 + 3 * (1 - (u / WWB.TW) ** 2);
  if (a <= WWB.AN) return 45 - (a - WWB.TW) / (WWB.AN - WWB.TW) * 6;
  if (u < 0) return WWB.GPA + (39 - WWB.GPA) * (u - WWB.UPA) / (-WWB.AN - WWB.UPA);
  return WWB.GNJ + (39 - WWB.GNJ) * (WWB.UNJ - u) / (WWB.UNJ - WWB.AN);
}
{
  const d0 = RC.deckFn, ex0 = rcExclusion, lm0 = rcLandmarks;
  RC.deckFn = (x, z) => { const [u, v] = WWB.toLocal(x, z); return u >= WWB.UPA && u <= WWB.UNJ && Math.abs(v) < 17 ? wwbDeck(u) : d0(x, z); };
  rcExclusion = (x, z) => { const [u, v] = WWB.toLocal(x, z); return u > WWB.UPA + 60 && u < WWB.UNJ - 60 && Math.abs(v) < 19 ? 2 : ex0(x, z); };
  rcLandmarks = () => {
    lm0();
    const add = (u0, u1, v0, v1, top, bottom) => { const [x, z] = WWB.toReal((u0 + u1) / 2, (v0 + v1) / 2); rcAddCol([], x, z, (u1 - u0) / 2, (v1 - v0) / 2, WWB.rot, top, bottom); };
    for (let u = WWB.UPA; u < WWB.UNJ; u += 40) { const b = Math.min(WWB.UNJ, u + 40), hi = Math.max(wwbDeck(u), wwbDeck(b)), lo = Math.min(wwbDeck(u), wwbDeck(b)); for (const s of [-1, 1]) add(u, b, s * 14.5 - 0.3, s * 14.5 + 0.3, hi + 1.3, lo - 3); add(u, b, -0.35, 0.35, hi + 1.0, lo - 1); }
    for (const tu of [-WWB.TW, WWB.TW]) for (const s of [-1, 1]) add(tu - 3, tu + 3, s * 16.4 - 2.4, s * 16.4 + 2.4, 118, -6);
    const iv = setInterval(() => { if (RC.loadModel) { clearInterval(iv); RC.loadModel('wwb'); } }, 400);
  };
  // the deck is drivable even before the tiles that carry its OSM ways have streamed in
  const g0 = groundAt, t0 = topAt, on = (x, z) => { const [u, v] = WWB.toLocal(x, z); return u >= WWB.UPA && u <= WWB.UNJ && Math.abs(v) < 14.3 ? wwbDeck(u) : null; };
  groundAt = (x, z, y) => { const d = on(x, z); if (d !== null && d > rcH(x, z) + 0.3 && (y === undefined || y > d - 6)) return d + 0.05; return g0(x, z, y); };
  topAt = (x, z) => { const d = on(x, z), t = t0(x, z); return d !== null ? Math.max(t, d) : t; };
  const [sx, sz] = WWB.toReal(-760, 150), [lx, lz] = WWB.toReal(120, 0), [dx, dz] = WWB.toReal(-420, 4), [ex, ez] = WWB.toReal(-200, 0);
  SCENIC.push({ name: 'Walt Whitman Bridge', pos: [sx, 30, sz], look: [lx, 62, lz], fov: 46 }, { name: 'Walt Whitman Bridge (deck)', pos: [dx, wwbDeck(-420) + 2.2, dz], look: [ex, 62, ez], fov: 58 });
}

// ---------- the per-tile street builder
const _c = h => new THREE.Color(h), ST_COL = { conc: _c('#aaa59a'), concD: _c('#7d7a73'), concL: _c('#c2bdb1'), steel: _c('#5d6268'), stone: _c('#9a9388') };
function r5Wall(buf, a, b, ya0, ya1, yb0, yb1, col) { buf.quad([a[0], ya0, a[1]], [b[0], yb0, b[1]], [b[0], yb1, b[1]], [a[0], ya1, a[1]], col); }
function r5Box(buf, cx, cz, ex, ez, hl, hw, y0, y1, col) {   // box centred at (cx, cz): half-length hl along (ex, ez), half-width hw across
  const nx = -ez, nz = ex, C = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([a, o]) => [cx + ex * a + nx * o, cz + ez * a + nz * o]);
  for (let q = 0; q < 4; q++) r5Wall(buf, C[q], C[(q + 1) % 4], y0, y1, y0, y1, col);
  buf.quad([C[0][0], y1, C[0][1]], [C[3][0], y1, C[3][1]], [C[2][0], y1, C[2][1]], [C[1][0], y1, C[1][1]], col); buf.quad([C[0][0], y0, C[0][1]], [C[1][0], y0, C[1][1]], [C[2][0], y0, C[2][1]], [C[3][0], y0, C[3][1]], col);
}
function r5SignId(x, z, dx, dz) {
  let nm = ''; try { nm = rcStreets(x, z, 60).map(s => s.name).join(' '); } catch (e) {}
  let r = /Vine/i.test(nm) ? 676 : /Schuylkill/i.test(nm) ? 76 : /Delaware Exp|I-? ?95/i.test(nm) ? 95 : /Roosevelt/i.test(nm) ? 1 : 0;
  if (!r) r = z > -620 && z < -280 && x > -1700 && x < 1900 ? 676 : x > 1300 && z < 4300 ? 95 : x < -900 || z > 4300 ? 76 : 0;
  if (r === 95) return dz < 0 ? 0 : 1; if (r === 76) return dx + dz < 0 ? 2 : 3; if (r === 676) return dx > 0 ? 4 : 5; if (r === 1) return dz < 0 || dx > 0 ? 6 : 7; return 8;
}
function* r5Street(t, EL) {
  t.r5k = new Set();
  const K = r5Kit(), buf = new RCBuf(), pp = [], pi = [], sp = [], suv = [], si = [], cells = new Map(), rp = [0, 0, 0, 0, 0, 0], rq = [0, 0, 0, 0, 0, 0];
  const cell = (x, z) => { const k = Math.floor(x / 400) + ',' + Math.floor(z / 400); let c = cells.get(k); if (!c) cells.set(k, c = { lamp: [], pool: [], mast: [], post: [], stop: [], x: (Math.floor(x / 400) + 0.5) * 400, z: (Math.floor(z / 400) + 0.5) * 400 }); return c; };
  const slice = function* () { if (rcSlice()) { yield; RC._ts = performance.now(); } };
  for (const e of EL) { e.js = []; if (e.c <= 4 || e.c === 6) r5SegAdd(t, e); }
  yield* slice();
  // ---- intersections: OSM ways that cross share a node, so identical raw vertices = a junction
  const node = new Map();
  for (const e of EL) {
    if (e.c === 5) continue; let s = 0;
    for (let i = 0; i < e.n0; i++) {
      if (i) s += Math.hypot(e.P0[2 * i] - e.P0[2 * i - 2], e.P0[2 * i + 1] - e.P0[2 * i - 1]);
      const k = Math.round(e.P0[2 * i] * 4) + ',' + Math.round(e.P0[2 * i + 1] * 4); let a = node.get(k); if (!a) node.set(k, a = []);
      a.push([e, Math.min(s, e.L), i === 0 ? 1 : i === e.n0 - 1 ? -1 : 0]);
    }
  }
  const quad = (a, b, c, d) => { const o = pp.length / 3; pp.push(...a, ...b, ...c, ...d); pi.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  const at = (e, s, o, out) => { const q = rcRoadPoint(e, clamp(s, 0, e.L), out); return [q[0] - q[3] * o, r5RoadY(e, s, o, q) + 0.035, q[1] + q[2] * o]; };
  const mark = (e, sa, sb, o0, o1) => { const A0 = at(e, sa, o0, rp), A1 = at(e, sa, o1, rp), B1 = at(e, sb, o1, rq), B0 = at(e, sb, o0, rq); quad(A0, A1, B1, B0); quad(B0, B1, A1, A0); };
  let jn = 0;
  for (const [, L] of node) {
    if (L.length < 2 && L[0][2] !== 0) continue;
    const ents = new Set(L.map(l => l[0])); if (ents.size < 2) continue;
    const arms = [];
    for (const [e, s, end] of L) for (const sg of [1, -1]) {
      if (end === -sg || (sg > 0 ? e.L - s : s) < 3) continue;
      const q = rcRoadPoint(e, clamp(s + sg * 2, 0, e.L), rp), p0 = rcRoadPoint(e, s, rq); const dx = q[0] - p0[0], dz = q[1] - p0[1], l = Math.hypot(dx, dz) || 1;
      arms.push({ e, s, sg, dx: dx / l, dz: dz / l, x: p0[0], z: p0[1], y: p0[4] });
    }
    for (const a of arms) { let cl = 0; for (const b of arms) if (b.e !== a.e && Math.abs(a.dx * b.dx + a.dz * b.dz) < 0.8) cl = Math.max(cl, b.e.w / 2); a.clear = cl || 3; a.e.js.push([a.s, a.clear + 1]); }
    if (arms.some(a => a.e.c === 0 || a.e.c === 6 || a.e.brg || a.e.tr || a.e.trEdge)) continue;
    const drive = arms.filter(a => a.e.c <= 3), art = drive.filter(a => a.e.c <= 2); if (drive.length < 3) continue;
    const J = arms[0], hsh = rcHash(Math.floor(J.x * 3) * 7919 + Math.floor(J.z * 3));
    const kind = art.length >= 3 ? 'sig' : art.length >= 2 ? (hsh < 0.5 ? 'sig' : 'minor') : art.length === 1 ? 'stop' : hsh < 0.8 ? 'stop' : '';
    if (!kind || rcTrMaskV(J.x, J.z) > 100 || isWater(J.x, J.z)) continue;
    for (const a of drive) {
      const e = a.e, h = e.w / 2, hx = -a.dx, hz = -a.dz, rx = -hz, rz = hx, ok = !e.ow || e.ow === -a.sg, d0 = a.clear + 0.9;
      if ((a.sg > 0 ? e.L - a.s : a.s) < d0 + 6) continue;
      const stopHere = kind === 'sig' || kind === 'stop' || e.c === 3;
      if (kind === 'sig') for (let o = -h + 0.55; o < h - 0.9; o += 1.25) mark(e, a.s + a.sg * d0, a.s + a.sg * (d0 + 2.7), o, o + 0.62);   // continental crosswalk
      if (ok && stopHere) { const sb = a.s + a.sg * (d0 + (kind === 'sig' ? 3.6 : 0.6)); mark(e, sb, sb + a.sg * 0.45, e.ow ? -h + 0.3 : 0, -a.sg * (h - 0.3)); }
      if (!ok) continue;
      const grp = Math.abs(hx * ST_GE[0] + hz * ST_GE[1]) > 0.707 ? 0 : 1, yaw = Math.atan2(hx, hz);
      if (kind === 'sig') {
        const px = a.x + hx * (a.clear + 1.3) + rx * (h + 1.0), pz = a.z + hz * (a.clear + 1.3) + rz * (h + 1.0);
        (e.c <= 2 && h >= 5.5 ? cell(px, pz).mast : cell(px, pz).post).push([px, rcH(px, pz) + 0.05, pz, yaw, grp]);
        if (e.rd) (e.rd.sigs || (e.rd.sigs = [])).push({ s: a.s, sig: a.sg, stop: a.clear + 4.8, grp });
      } else if (stopHere) { const px = a.x - hx * (a.clear + 2.4) + rx * (h + 0.9), pz = a.z - hz * (a.clear + 2.4) + rz * (h + 0.9); cell(px, pz).stop.push([px, rcH(px, pz) + 0.05, pz, yaw]); }
    }
    if ((++jn & 31) === 0) yield* slice();
  }
  // ---- per road: lamps, bridge structure, expressway barrier and sign gantries
  let ei = 0;
  for (const e of EL) {
    const h = e.w / 2, c = e.c;
    if (c >= 1 && c <= 3 && !e.brg && !e.tr && e.L > 40) {
      const S = c <= 2 ? 36 : 50, reg = RC_REG(e.P[0], e.P[1]), sc = c <= 2 ? 1 : 0.84, col = c <= 2 ? (reg === 'cc' ? '#4a5055' : '#9aa0a6') : reg === 'cc' ? '#3d4246' : '#7a6753';
      let k = 0, side = rcHash(ei * 131 + t.i * 7 + t.j) < 0.5 ? 1 : -1;
      for (let s = 10 + rcHash(ei * 17 + 3) * S; s < e.L - 8; s += S, k++) {
        if (c <= 2) side = -side;
        if (e.js.some(j => Math.abs(j[0] - s) < j[1] + 1.5)) continue;
        const q = rcRoadPoint(e, s, rp), x = q[0] - q[3] * (h + 0.6) * side, z = q[1] + q[2] * (h + 0.6) * side, y = rcH(x, z);
        if (isWater(x, z) || r5Blocked(x, z, y) || r5NearOther(x, z, q[4], e, 0.4)) continue;
        const tx = q[3] * side, tz = -q[2] * side, C = cell(x, z);   // towards the road
        C.lamp.push([x, y + 0.02, z, Math.atan2(-tz, tx), sc, col]); C.pool.push([x + tx * 2.8 * sc, q[4] + 0.07, z + tz * 2.8 * sc, c <= 2 ? 20 : 15]);
      }
    }
    if (e.brg && !e.tr && c !== 5 && e.n >= 2) {
      const [NX, NZ, MT] = r5Frame2(e.P, e.n), P = e.P, Y = e.Y, up = new Uint8Array(e.n), D = 1.05, hwy = c === 0 || c === 6;
      for (let i = 0; i < e.n; i++) up[i] = Y[i] - rcH(P[2 * i], P[2 * i + 1]) > 1.4 ? 1 : 0;
      const pt = (i, o) => [P[2 * i] + NX[i] * o * MT[i], P[2 * i + 1] + NZ[i] * o * MT[i]];
      for (let i = 0; i < e.n - 1; i++) {
        if (!up[i] || !up[i + 1]) continue;
        const ya = Y[i], yb = Y[i + 1];
        r5Wall(buf, pt(i, h), pt(i + 1, h), ya - D, ya, yb - D, yb, ST_COL.conc); r5Wall(buf, pt(i + 1, -h), pt(i, -h), yb - D, yb, ya - D, ya, ST_COL.conc);
        { const a = pt(i, -h), b = pt(i, h), c2 = pt(i + 1, h), d = pt(i + 1, -h); buf.quad([a[0], ya - D, a[1]], [b[0], ya - D, b[1]], [c2[0], yb - D, c2[1]], [d[0], yb - D, d[1]], ST_COL.concD); }
        for (const sd of [1, -1]) {
          const m = pt(i, sd * (h + 1.3)), m2 = pt(i + 1, sd * (h + 1.3));
          if (r5NearOther((m[0] + m2[0]) / 2, (m[1] + m2[1]) / 2, (ya + yb) / 2, e, 0.3, 2.4)) continue;   // another deck joins here (ramp merge): no parapet across it
          const i0 = pt(i, sd * (h - 0.02)), i1 = pt(i + 1, sd * (h - 0.02)), o0 = pt(i, sd * (h + 0.3)), o1 = pt(i + 1, sd * (h + 0.3)), pc = hwy ? ST_COL.concL : ST_COL.stone, T = hwy ? 0.9 : 1.05;
          r5Wall(buf, i0, i1, ya, ya + T, yb, yb + T, pc); r5Wall(buf, o1, o0, yb - 0.1, yb + T, ya - 0.1, ya + T, pc);
          buf.quad([i0[0], ya + T, i0[1]], [i1[0], yb + T, i1[1]], [o1[0], yb + T, o1[1]], [o0[0], ya + T, o0[1]], pc);
        }
      }
      // piers
      const step = 30, n0 = Math.max(1, Math.floor(e.L / step));
      for (let k = 0; k < n0; k++) {
        const s = e.L * (k + 0.5) / n0; let q = rcRoadPoint(e, s, rp), okP = false;
        for (const ds of [0, 8, -8]) {
          q = rcRoadPoint(e, clamp(s + ds, 0, e.L), rp); const g = rcH(q[0], q[1]);
          if (q[4] - g < 3.6 || rcTrMaskV(q[0], q[1]) > 100 || RC.deckFn(q[0], q[1]) !== null) continue;
          if (r5NearOther(q[0], q[1], g + 0.3, e, 2.2, 2.6)) continue;
          okP = true; break;
        }
        if (!okP) continue;
        const x = q[0], z = q[1], tx = q[2], tz = q[3], wet = RC.water && RC.water[rcCell(x, z)] === 1, g = (wet ? -3 : rcH(x, z)) - 0.6, top = q[4] - D;
        if (e.w >= 11) { r5Box(buf, x, z, -tz, tx, e.w * 0.44, 0.75, top - 1.3, top, ST_COL.conc); for (const sd of [-1, 1]) { const px = x - tz * e.w * 0.28 * sd, pz = z + tx * e.w * 0.28 * sd; r5Box(buf, px, pz, tx, tz, 0.65, 0.65, g, top - 1.3, ST_COL.conc); if (!wet) rcAddCol(t.cols, px, pz, 0.7, 0.7, Math.atan2(tx, tz), top, g - 2); } }
        else { r5Box(buf, x, z, -tz, tx, e.w * 0.42, 0.7, top - 1.1, top, ST_COL.conc); r5Box(buf, x, z, tx, tz, 0.7, 0.8, g, top - 1.1, ST_COL.conc); if (!wet) rcAddCol(t.cols, x, z, 0.85, 0.75, Math.atan2(tx, tz), top, g - 2); }
      }
    }
    if (c === 0 && e.L > 120) {
      const dir = e.ow < 0 ? -1 : 1;
      if (!e.brg && !e.tr && e.ow) {   // median barrier on the left of the direction of travel
        const [NX, NZ, MT] = r5Frame2(e.P, e.n), sd = -dir, pt = (i, o) => [e.P[2 * i] + NX[i] * o * MT[i], e.P[2 * i + 1] + NZ[i] * o * MT[i]];
        for (let i = 0; i < e.n - 1; i++) {
          const m = pt(i, sd * (h + 0.5)), m2 = pt(i + 1, sd * (h + 0.5)), ya = e.Y[i], yb = e.Y[i + 1];
          if (r5NearOther((m[0] + m2[0]) / 2, (m[1] + m2[1]) / 2, (ya + yb) / 2, e, 1.2, 2.6)) continue;
          const a0 = pt(i, sd * (h + 0.22)), a1 = pt(i + 1, sd * (h + 0.22)), b0 = pt(i, sd * (h + 0.4)), b1 = pt(i + 1, sd * (h + 0.4)), c0 = pt(i, sd * (h + 0.6)), c1 = pt(i + 1, sd * (h + 0.6)), d0 = pt(i, sd * (h + 0.78)), d1 = pt(i + 1, sd * (h + 0.78));
          buf.quad([a0[0], ya - 0.3, a0[1]], [a1[0], yb - 0.3, a1[1]], [b1[0], yb + 0.82, b1[1]], [b0[0], ya + 0.82, b0[1]], ST_COL.concL); buf.quad([b0[0], ya + 0.82, b0[1]], [b1[0], yb + 0.82, b1[1]], [c1[0], yb + 0.82, c1[1]], [c0[0], ya + 0.82, c0[1]], ST_COL.concL); buf.quad([c0[0], ya + 0.82, c0[1]], [c1[0], yb + 0.82, c1[1]], [d1[0], yb - 0.3, d1[1]], [d0[0], ya - 0.3, d0[1]], ST_COL.concL);
        }
      }
      for (let s = 130 + rcHash(ei * 53 + 11) * 200; s < e.L - 60; s += 820) {   // overhead guide signs
        const q = rcRoadPoint(e, s, rp), x = q[0], z = q[1], tx = q[2], tz = q[3], y = q[4];
        if (rcTrenchCov(x, z) || RC.deckFn(x, z) !== null) continue;
        const dx = tx * dir, dz = tz * dir, g = e.brg && !e.tr ? y - 1 : Math.min(y, rcH(x, z)) - 0.6, span = h + 1.0;
        for (const sd of [-1, 1]) r5Box(buf, x - tz * span * sd, z + tx * span * sd, tx, tz, 0.2, 0.2, g, y + 7.7, ST_COL.steel);
        for (const yy of [6.25, 7.5]) r5Box(buf, x, z, -tz, tx, span, 0.11, y + yy, y + yy + 0.2, ST_COL.steel);
        for (let o = -span + 1.2; o < span; o += 2.4) r5Box(buf, x - tz * o, z + tx * o, tx, tz, 0.07, 0.07, y + 6.45, y + 7.5, ST_COL.steel);
        const id = r5SignId(x, z, dx, dz), ids = e.w >= 12 ? [id, id === 8 ? 9 : 8] : [id], pw = Math.min(5.6, (e.w - 0.6) / ids.length), ph = pw * 0.5, rx = -dz, rz = dx;
        ids.forEach((k, j) => {
          const oc = (j - (ids.length - 1) / 2) * (pw + 0.5), cx = x + rx * oc - dx * 0.3, cz = z + rz * oc - dz * 0.3, y0 = y + 6.9 - ph / 2 + 0.25, o = sp.length / 3, u0 = (k % 2) * 0.5, v1 = 1 - Math.floor(k / 2) * 0.2;
          sp.push(cx - rx * pw / 2, y0, cz - rz * pw / 2, cx + rx * pw / 2, y0, cz + rz * pw / 2, cx + rx * pw / 2, y0 + ph, cz + rz * pw / 2, cx - rx * pw / 2, y0 + ph, cz - rz * pw / 2);
          suv.push(u0, v1 - 0.2, u0 + 0.5, v1 - 0.2, u0 + 0.5, v1, u0, v1); si.push(o, o + 1, o + 2, o, o + 2, o + 3);
          r5Box(buf, cx + dx * 0.06, cz + dz * 0.06, rx, rz, pw / 2, 0.04, y0, y0 + ph, ST_COL.steel);
        });
      }
    }
    if ((++ei & 15) === 0) yield* slice();
  }
  // ---- meshes
  yield; RC._ts = performance.now();
  const push = (m, far, x, z) => { scene.add(m); t.meshes.push(m); if (far) ST.chunks.push({ m, x, z, far }); };
  if (buf.nv) { if (!K.conc) K.conc = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9, metalness: 0.02, side: THREE.DoubleSide }); const m = buf.mesh(K.conc); push(m); }
  if (pp.length) { const m = rcMesh(pp, pi, K.paint, false); m.receiveShadow = true; push(m); }
  if (sp.length) { const nor = []; for (let i = 0; i < sp.length; i += 3) nor.push(0, 0, 1); const m = rcMesh(sp, si, K.sign, false, nor, suv); m.geometry.computeVertexNormals(); push(m); }
  const D = new THREE.Object3D(), col = new THREE.Color();
  for (const C of cells.values()) {
    const mk = (list, geo, mat, far, shadow, fn, own) => {
      if (!list.length) return; const im = new THREE.InstancedMesh(own ? geo.clone() : geo, mat, list.length);
      list.forEach((L, i) => { D.position.set(L[0], L[1], L[2]); D.rotation.set(0, L[3] || 0, 0); D.scale.setScalar(1); if (fn) fn(L, i, im); D.updateMatrix(); im.setMatrixAt(i, D.matrix); });
      im.castShadow = shadow; im.receiveShadow = false; im.userData.keepGeo = !own; im.computeBoundingSphere(); im.matrixAutoUpdate = false; push(im, far, C.x, C.z); return im;
    };
    mk(C.lamp, K.lamp, K.lampMat, 620, false, (L, i, im) => { D.scale.setScalar(L[4]); im.setColorAt(i, col.set(L[5])); });
    mk(C.pool, K.pool, K.poolMat, 420, false, L => { D.rotation.set(0, 0, 0); D.scale.set(L[3], 1, L[3]); });
    for (const k of ['mast', 'post']) { const im = mk(C[k], K[k], K.sigMat, 520, false, null, true); if (im) im.geometry.setAttribute('iGrp', new THREE.InstancedBufferAttribute(new Float32Array(C[k].map(L => L[4])), 1)); }
    mk(C.stop, K.stop, K.stopMat, 380, false);
    yield; RC._ts = performance.now();
  }
  ST.gen++;
}
function r5StreetLOD(dt) {
  const K = ST.kit; if (!K) return;
  ST.uLamp.value = lampLevel * 7; K.poolMat.opacity = Math.min(0.5, lampLevel * 0.42); K.poolMat.visible = lampLevel > 0.03;
  // signal cycle (26 s): group 0 = the east-west streets, group 1 = north-south
  const ph = (performance.now() / 1000) % 26, on = 2 + lampLevel * 5, off = 0.05, U = ST.uSig.value;
  for (const g of [0, 1]) { const p = (ph + g * 13) % 26, st = p < 10 ? 0 : p < 13 ? 1 : 2; ST.state[g] = st; U[g * 3] = st === 2 ? on : off; U[g * 3 + 1] = st === 1 ? on : off; U[g * 3 + 2] = st === 0 ? on : off; }
  if ((ST.f++ & 7) !== 0) return;
  const cx = camera.position.x, cz = camera.position.z, L = ST.chunks; let w = 0;
  for (let i = 0; i < L.length; i++) { const c = L[i]; if (!c.m.parent) continue; L[w++] = c; c.m.visible = Math.hypot(c.x - cx, c.z - cz) < c.far + 290; }
  L.length = w;
}
