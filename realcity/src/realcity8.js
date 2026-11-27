// v23 (Nov 27): phone memory guard. Fast flying on a phone ran the tab out of memory and iOS killed it.
// - phones stream a smaller ring of city tiles, capped in count, with a look-ahead along the flight path
// - build jobs for tiles that were dropped before they were built are discarded at once (they used to pile up in the queue)
// - city data packs no longer needed are released on phones
// - neighbourhood models: phones load them closer, one at a time, not from high altitude, and every texture is freed on release
// - if the graphics context is lost, or the last visit ended in a crash, the next start uses a lighter "safe" streaming set
const M8 = {
  phone: isTouch,
  safe: false,
  cap: 10,          // most city tiles a phone keeps (each built tile is ~25–30 MB of geometry)
  crashKey: 'slopRun',
};
try {   // the last visit never reached pagehide: the tab was killed (usually out of memory)
  if (M8.phone && sessionStorage.getItem(M8.crashKey) === '1') M8.safe = true;
  if (localStorage.getItem('slopSafe') === '1') { M8.safe = true; localStorage.removeItem('slopSafe'); }
  sessionStorage.setItem(M8.crashKey, '1');
  addEventListener('pagehide', () => { try { sessionStorage.removeItem(M8.crashKey); } catch (e) {} });
} catch (e) {}
if (M8.phone) {
  Object.assign(RC_RADIUS, M8.safe ? { walk: 1500, cycle: 1700, drive: 2000, fly: 2200 } : { walk: 1500, cycle: 1900, drive: 2400, fly: 2800 });
  M8.cap = M8.safe ? 7 : 10;
}

// stream centre: phones look ahead along the flight path so the tiles in front arrive first
{ const _c = rcStreamC; rcStreamC = function () {
  const r = _c(); if (!M8.phone || !r[2]) return r;
  const ahead = Math.min(1200, Math.max(0, P.speed) * 5);
  return [r[0] - Math.sin(P.yaw) * ahead, r[1] - Math.cos(P.yaw) * ahead, true];
}; }
rcWant = function () {
  const [cx, cz, fly] = rcStreamC();
  const alt = fly ? Math.max(0, P.pos.y) : 0;
  const R = (fly ? RC_RADIUS.fly : RC_RADIUS[P.mode === 'fly' ? 'drive' : P.mode]) + (fly ? (M8.phone ? Math.min(M8.safe ? 300 : 600, alt * 1.5) : Math.min(2500, alt * 4)) : 0);
  const out = [];
  for (const T of RC.meta.tiles) { const d = Math.hypot(T.ox - cx, -T.oy - cz); if (d < R) out.push([d, T]); }
  out.sort((a, b) => a[0] - b[0]);
  if (M8.phone && out.length > M8.cap) out.length = M8.cap;
  return [out, R];
};
rcUpdateTiles = function () {
  const [want, R] = rcWant(), keep = new Set(want.map(w => w[1].f)), [scx, scz] = rcStreamC();
  const hyst = M8.phone ? 500 : 1500, guard = 2200;   // never drop the tiles the player is standing in
  const near = t => Math.hypot(t.ox - P.pos.x, -t.oy - P.pos.z) <= guard;
  for (const [k, t] of RC.tiles) if (!keep.has(k) && Math.hypot(t.ox - scx, -t.oy - scz) > R + hyst && !near(t)) rcDrop(k, t);
  if (M8.phone && RC.tiles.size > M8.cap + 1) {   // still over budget (fast flight): drop the farthest ones not in the wanted set
    const extra = [...RC.tiles].filter(([k, t]) => !keep.has(k) && !near(t)).sort((a, b) => Math.hypot(b[1].ox - scx, -b[1].oy - scz) - Math.hypot(a[1].ox - scx, -a[1].oy - scz));
    for (const [k, t] of extra) { if (RC.tiles.size <= M8.cap + 1) break; rcDrop(k, t); }
  }
  // queued build jobs for tiles that are gone hold their parsed data: free them now, not when they reach the front
  if (RC.queue.length) RC.queue = RC.queue.filter(q => RC.tiles.get(q[0].f) === q[0]);
  for (const [, T] of want) if (!RC.tiles.has(T.f)) {
    const t = { ...T, built: false, cols: [], meshes: [], roads: [] }; RC.tiles.set(T.f, t);
    rcPack(T.p).then(pk => { if (RC.tiles.get(T.f) === t) RC.queue.push([t, rcParse(pk.slice(T.o, T.o + T.l))]); }).catch(() => RC.tiles.delete(T.f));
  }
  if (M8.phone) {   // release data packs no current tile needs (each is ~3 MB; the browser cache makes a refetch cheap)
    const need = new Set([...RC.tiles.values()].filter(t => !t.built).map(t => t.p));
    for (const p of [...RC.packs.keys()]) if (!need.has(p)) RC.packs.delete(p);
  }
};

// neighbourhood models (Blender packs, 2–6 MB each with textures)
function r8FreeObj(obj) {
  const texKeys = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap', 'displacementMap'];
  obj.traverse(o => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      for (const k of texKeys) if (m[k]) m[k].dispose();
      const gi = GLOW.findIndex(g => g.m === m); if (gi >= 0) GLOW.splice(gi, 1);
      m.dispose();
    }
  });
}
rcPackStream = function () {
  if (!RC.loadModel) return;
  const cx = camera.position.x, cz = camera.position.z;
  const inR = M8.phone ? (M8.safe ? 700 : 1100) : 2200, outR = M8.phone ? (M8.safe ? 1300 : 1900) : 4000;
  const high = M8.phone && P.mode === 'fly' && P.pos.y - rcH(P.pos.x, P.pos.z) > 320;   // from that high the OSM blocks look the same
  let busy = Object.values(RC_NBS).some(s => s.busy);
  for (const [x, z, r, f] of RC_NB) {
    const d = Math.hypot(x - cx, z - cz), st = RC_NBS[f];
    if (d < r + inR && !st && !high && !(M8.phone && busy)) {
      RC_NBS[f] = { busy: true }; busy = true;
      RC.loadModel(f).then(o => { RC_NBS[f] = { obj: o }; });
    } else if (d > r + outR && st && st.obj) {
      scene.remove(st.obj); r8FreeObj(st.obj);
      delete RC_NBS[f]; window.__lm = (window.__lm || []).filter(n => n !== f);
    }
  }
};

// lost graphics context (the GPU ran out of memory): reload once in safe mode instead of a frozen black screen
renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  try { localStorage.setItem('slopSafe', '1'); sessionStorage.removeItem(M8.crashKey); } catch (err) {}
  status('Graphics memory ran out. Restarting in lighter mode…');
  const ld = $('loader'); if (ld) ld.style.display = '';
  setTimeout(() => location.reload(), 1200);
}, false);

if (M8.phone) {
  // a 4096² shadow map is 64 MB of GPU memory before anything else is drawn
  if (sun.shadow.mapSize.x > 2048) { sun.shadow.mapSize.set(2048, 2048); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (M8.safe) {
    const _b = boot; boot = async function () { await _b(); try { if (!quality.user) setQuality('low', true); } catch (e) {} toast('Safe mode: lighter streaming after a crash'); };
  }
}
window.__m8 = M8;
