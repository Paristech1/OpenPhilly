// v22 (Nov 23): dynamic weather, river mist, light coronas, per-context cameras, weather audio.
// Loaded after realcity6.js, before boot().
//
// The ideas come from the public research notes of ItsNotRexed/Leonida (a GTA VI recompilation project):
//  - docs/weather.md: weather *types* borrow a numeric *data set* (wind min/max, gust chance/speed, rain, fog,
//    cloud, niceness) and a *cycle* with a time multiplier picks the next type. Rain does not just switch the
//    streets wet: wetness accumulates up to a cap and dries afterwards.
//  - docs/gamedata.md "Fog volumes": placed volumes with density, falloff, noise and wind -> our river mist.
//  - docs/world_lights_paths.md: every placed light has a corona size/intensity and a light fade distance.
//  - docs/modding.md: the camera view mode is chosen per context (on foot, in a vehicle, ...).
// Nothing from that repository (GPL-3) is copied: no code, no data, no values. Everything here is written for this game.

// ---------------------------------------------------------------- weather data sets
// cloud: added to the time preset's sky cover · over: overcast dimming · rain/fog/storm 0..1
// wMin/wMax: wind m/s · gust: gusts per minute · gMax: extra m/s in a gust · nice: 1 (grim) .. 10 (perfect)
const WX = {
  extrasunny: { name: 'Extra sunny', sub: 'Clear blue sky', cloud: -0.3, over: 0, rain: 0, fog: 0, storm: 0, wMin: 0.5, wMax: 2.5, gust: 0.3, gMax: 2, nice: 10 },
  clear:      { name: 'Clear', sub: 'Fair weather', cloud: 0, over: 0, rain: 0, fog: 0, storm: 0, wMin: 1, wMax: 4, gust: 0.6, gMax: 3, nice: 9 },
  clouds:     { name: 'Clouds', sub: 'Broken cloud', cloud: 0.22, over: 0.22, rain: 0, fog: 0.03, storm: 0, wMin: 2, wMax: 6, gust: 1, gMax: 4, nice: 7 },
  haze:       { name: 'Summer haze', sub: 'Hot, hazy, still', cloud: 0.05, over: 0.12, rain: 0, fog: 0.3, storm: 0, wMin: 0.3, wMax: 1.5, gust: 0.2, gMax: 1, nice: 6 },
  overcast:   { name: 'Overcast', sub: 'Grey sky', cloud: 0.5, over: 0.62, rain: 0, fog: 0.1, storm: 0, wMin: 3, wMax: 8, gust: 1.5, gMax: 5, nice: 5 },
  drizzle:    { name: 'Drizzle', sub: 'Light rain', cloud: 0.45, over: 0.66, rain: 0.35, fog: 0.15, storm: 0, wMin: 2, wMax: 6, gust: 1, gMax: 4, nice: 4 },
  rain:       { name: 'Rain', sub: 'Wet streets, falling rain', cloud: 0.52, over: 0.78, rain: 0.8, fog: 0.2, storm: 0, wMin: 4, wMax: 10, gust: 2, gMax: 7, nice: 3 },
  thunder:    { name: 'Thunderstorm', sub: 'Downpour, lightning', cloud: 0.58, over: 0.92, rain: 1, fog: 0.25, storm: 1, wMin: 7, wMax: 15, gust: 4, gMax: 12, nice: 1 },
  foggy:      { name: 'Fog', sub: 'Thick river fog', cloud: 0.2, over: 0.45, rain: 0, fog: 1, storm: 0, wMin: 0, wMax: 1.5, gust: 0.1, gMax: 1, nice: 4 }
};
const WX_ORDER = ['extrasunny', 'clear', 'clouds', 'haze', 'overcast', 'drizzle', 'rain', 'thunder', 'foggy'];
// the cycle: where each type can go next, with weights (nicer types come back more often)
const WX_NEXT = {
  extrasunny: { clear: 3, clouds: 1, haze: 1 },
  clear: { extrasunny: 2, clouds: 3, haze: 1, foggy: 0.4 },
  clouds: { clear: 3, overcast: 3, drizzle: 1 },
  haze: { clear: 2, clouds: 1, foggy: 0.6, thunder: 0.3 },
  overcast: { clouds: 2, drizzle: 2, rain: 2, foggy: 0.5 },
  drizzle: { overcast: 2, rain: 2, clouds: 1 },
  rain: { drizzle: 2, thunder: 1, overcast: 2 },
  thunder: { rain: 3, overcast: 1 },
  foggy: { clouds: 2, clear: 1.5, haze: 0.5 }
};
const WX_SPEED = { off: 0, normal: 1, fast: 5 };   // the cycle's time multiplier
const WXF = ['cloud', 'over', 'rain', 'fog', 'storm'];
const W7 = {
  cur: 'clear', next: 'clear', k: 1, blendT: 6, hold: 0,
  v: { cloud: 0, over: 0, rain: 0, fog: 0, storm: 0 },
  wet: 0, wind: 2, windDir: rnd() * Math.PI * 2, gust: 0, flash: 0, flashT: 8, thunderQ: [],
  base: null, rainOn: false, shadowOk: true, t: 0,
  cfg: { mode: 'normal', sound: true, wx: 'clear' }
};
try { Object.assign(W7.cfg, JSON.parse(localStorage.getItem('slopWx') || '{}')); } catch (e) {}
if (!WX[W7.cfg.wx]) W7.cfg.wx = 'clear';
if (!(W7.cfg.mode in WX_SPEED)) W7.cfg.mode = 'normal';
W7.cur = W7.next = W7.cfg.wx;
const r7Save = () => { W7.cfg.wx = W7.next; try { localStorage.setItem('slopWx', JSON.stringify(W7.cfg)); } catch (e) {} };
window.__wx = W7;
if (window.__r5) window.__r5.player = () => ({ mode: P.mode, speed: P.speed, x: P.pos.x, z: P.pos.z, yaw: P.yaw, cam: camMode, sprint: !!keys.ShiftRight });
const r7Smooth = k => k * k * (3 - 2 * k);
const r7Hold = () => (240 + rnd() * 200) / Math.max(1e-3, WX_SPEED[W7.cfg.mode] || 1);   // 4-7 min per type at Normal

function r7PickNext(from) {
  const opts = WX_NEXT[from] || { clear: 1 }; let tw = 0;
  for (const k in opts) tw += opts[k];
  let u = rnd() * tw; for (const k in opts) { u -= opts[k]; if (u <= 0) return k; }
  return 'clear';
}
// start blending towards a type; quiet = no toast
function r7SetWeather(id, quiet, blend) {
  if (!WX[id]) return;
  // freeze wherever a running blend has got to, then blend from there
  if (W7.k < 1) W7.from = { ...W7.v };
  else W7.from = null;
  W7.cur = W7.k < 1 ? '_from' : W7.next; W7.next = id; W7.k = 0;
  W7.blendT = blend ?? 6; W7.hold = r7Hold();
  r7Save(); refreshPanel();
  if (!quiet) toast('Weather: ' + WX[id].name);
}
function r7Target() {
  const b = WX[W7.next], a = W7.cur === '_from' ? W7.from : WX[W7.cur], s = r7Smooth(Math.min(1, W7.k));
  for (const f of WXF) W7.v[f] = a[f] + (b[f] - a[f]) * s;
}

// ---------------------------------------------------------------- applying it to the scene
// setTime() writes the time-of-day preset; we capture that as the clear-weather base, then weather scales it every frame.
const r7C = { a: new THREE.Color(), b: new THREE.Color(), g: new THREE.Color() };
function r7Capture() {
  const c = x => x.clone();
  W7.base = {
    fogD: scene.fog.density, fogCol: c(scene.fog.color), sunI: sun.intensity, hI: hemi.intensity,
    cloud: skyU.cloud.value, cCol: c(skyU.cCol.value), cShade: c(skyU.cShade.value), top: c(skyU.top.value), hor: c(skyU.hor.value), mid: c(skyU.mid.value),
    sunCol: c(skyU.sunCol.value), stars: skyU.stars.value, fogSun: { ...FOGX.sunCol.value }, wet: SURF.wet.value,
    roads: ROAD_MATS.map(m => [m, m.roughness, m.metalness]), night: timeId === 'night' || timeId === 'blue', exp: renderer.toneMappingExposure
  };
}
// overcast grey of the same brightness, a touch blue
function r7Grey(src, out, k = 1) { const l = src.r * 0.2126 + src.g * 0.7152 + src.b * 0.0722; return out.setRGB(l * 0.96 * k, l * 0.99 * k, l * 1.06 * k); }
function r7Apply() {
  const B = W7.base; if (!B) return;
  const v = W7.v, over = v.over, fog = v.fog, rain = v.rain, f = W7.flash;
  scene.fog.density = B.fogD * (1 + 0.9 * over + 9 * fog + 1.1 * rain);
  const gm = Math.min(1, over * 0.65 + fog * 0.7);
  scene.fog.color.copy(B.fogCol).lerp(r7Grey(B.fogCol, r7C.g, 1 - over * 0.15), gm);
  if (f > 0) scene.fog.color.lerp(r7C.a.setRGB(0.55, 0.6, 0.75), f * 0.5);
  sun.intensity = B.sunI * Math.max(0.08, 1 - 0.72 * over - 0.4 * fog);
  if (sun.shadow && 'intensity' in sun.shadow) sun.shadow.intensity = clamp(1 - over * 1.05 - fog * 0.7, 0.12, 1);
  hemi.intensity = B.hI * (1 + 0.1 * over) + f * 2.6;
  skyU.cloud.value = clamp(B.cloud + v.cloud, 0, 0.98);
  skyU.cCol.value.copy(B.cCol).lerp(r7Grey(B.cCol, r7C.g, 0.8), over);
  skyU.cShade.value.copy(B.cShade).lerp(r7Grey(B.cShade, r7C.g, 0.75), over);
  for (const k of ['top', 'hor', 'mid']) skyU[k].value.copy(B[k]).lerp(r7Grey(B[k], r7C.g, k === 'top' ? 1.25 : 1), Math.min(1, over * 0.75 + fog * 0.6));
  if (f > 0) { skyU.hor.value.lerp(r7C.a.setRGB(0.8, 0.85, 1), f * 0.7); skyU.mid.value.lerp(r7C.a, f * 0.5); }
  const sv = Math.max(0, 1 - over * 0.9 - fog * 0.6);
  skyU.sunCol.value.copy(B.sunCol).multiplyScalar(sv); skyU.stars.value = B.stars * Math.max(0, 1 - over * 1.3 - fog);
  { const o = FOGX.sunCol.value; o.x = B.fogSun.x * sv; o.y = B.fogSun.y * sv; o.z = B.fogSun.z * sv; }
  // wetness: never drier than the preset, and puddles hang around after the rain stops
  const wet = Math.max(B.wet, W7.wet);
  SURF.wet.value = wet;
  for (const [m, r0, m0] of B.roads) { m.roughness = r0 + (0.3 - r0) * Math.max(0, wet - B.wet) / Math.max(1e-3, 1 - B.wet); m.metalness = m0 + (0.28 - m0) * W7.wet; }
}

// ---------------------------------------------------------------- rain streaks, wind, lightning
function r7Rain(dt, t) {
  if (!RAIN.mesh) return;
  const r = W7.v.rain, on = r > 0.02;
  RAIN.mesh.visible = on;
  if (!on) return;
  const g = RAIN.mesh.geometry, n = g.attributes.position.count;
  g.setDrawRange(0, Math.max(2, Math.floor(n * Math.min(1, 0.15 + r * 0.85) / 2) * 2));
  RAIN.mesh.material.uniforms.uCol.value.set(W7.base && W7.base.night ? '#8e9ab8' : '#c4ccd8').multiplyScalar(0.75 + r * 0.35);
  if (!RAIN.on) RAIN.uT.value = t % 1000;   // frame() only moves it while RAIN.on
  RAIN.mesh.position.set(camera.position.x, camera.position.y - 10, camera.position.z);
  // lean the streaks downwind (about 2° per m/s, capped)
  const lean = Math.min(0.5, W7.wind * 0.035);
  RAIN.mesh.rotation.set(Math.cos(W7.windDir) * lean, 0, -Math.sin(W7.windDir) * lean);
}
function r7Wind(dt, t) {
  const d = WX[W7.next], a = W7.cur === '_from' ? null : WX[W7.cur], s = r7Smooth(Math.min(1, W7.k));
  const wMin = a ? a.wMin + (d.wMin - a.wMin) * s : d.wMin, wMax = a ? a.wMax + (d.wMax - a.wMax) * s : d.wMax;
  const gust = a ? a.gust + (d.gust - a.gust) * s : d.gust, gMax = a ? a.gMax + (d.gMax - a.gMax) * s : d.gMax;
  const base = wMin + (wMax - wMin) * (0.5 + 0.5 * Math.sin(t * 0.043) * Math.sin(t * 0.117 + 1.3));
  if (rnd() < gust / 60 * dt) W7.gust = Math.max(W7.gust, gMax * (0.5 + rnd() * 0.5));
  W7.gust *= Math.exp(-dt * 0.55);
  W7.wind += (base + W7.gust - W7.wind) * Math.min(1, dt * 1.5);
  W7.windDir += (Math.sin(t * 0.011) * 0.02 + (rnd() - 0.5) * 0.01) * dt;
  // light aircraft feel the gusts; the jet barely
  if (P.mode === 'fly' && W7.gust > 1.5 && !SHOT) {
    const k = (flyerId === 'jet' ? 0.08 : 0.3) * W7.gust * dt;
    P.pos.x += Math.sin(W7.windDir) * k; P.pos.z += Math.cos(W7.windDir) * k;
  }
}
function r7Lightning(dt) {
  W7.flash = Math.max(0, W7.flash - dt * 6);
  if (W7.v.storm < 0.35) { W7.flashT = 6 + rnd() * 10; return; }
  W7.flashT -= dt * W7.v.storm;
  if (W7.flashT <= 0) {
    W7.flashT = 7 + rnd() * 18;
    const dist = 0.4 + rnd() * 3.6;    // km: sets brightness and the thunder delay
    const pulse = (delay, a) => setTimeout(() => { W7.flash = Math.max(W7.flash, a); }, delay);
    const a = 1.2 / (0.6 + dist * 0.5);
    pulse(0, a); pulse(110 + rnd() * 60, a * 0.6); if (rnd() < 0.5) pulse(300 + rnd() * 200, a * 0.85);
    W7.thunderQ.push({ t: dist * 2.9, d: dist });   // sound covers ~340 m/s
  }
  for (let i = W7.thunderQ.length - 1; i >= 0; i--) {
    const q = W7.thunderQ[i]; q.t -= dt;
    if (q.t <= 0) { W7.thunderQ.splice(i, 1); r7Thunder(q.d); if (q.d < 2) r6Rumble(0.5 / q.d, 0.7 / q.d, 600 + 300 / q.d); }
  }
}

// ---------------------------------------------------------------- weather audio (WebAudio; starts on the first key, click or tap)
const AU = { ctx: null, noise: null, rainG: null, windG: null, windF: null, master: null };
function r7AudioInit() {
  if (AU.ctx || !W7.cfg.sound) { if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {}); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = AU.ctx = new AC(), sr = ctx.sampleRate, buf = ctx.createBuffer(1, sr * 3, sr), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;   // pinkish noise: softer than white
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9; }
    AU.noise = buf;
    AU.master = ctx.createGain(); AU.master.gain.value = 0.9; AU.master.connect(ctx.destination);
    const loop = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 2); return s; };
    // rain: hiss band
    const r = loop(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500; lp.type = 'lowpass'; lp.frequency.value = 6500;
    AU.rainG = ctx.createGain(); AU.rainG.gain.value = 0; r.connect(hp).connect(lp).connect(AU.rainG).connect(AU.master);
    // wind: moving band-pass
    const w = loop(); AU.windF = ctx.createBiquadFilter(); AU.windF.type = 'bandpass'; AU.windF.frequency.value = 320; AU.windF.Q.value = 0.8;
    AU.windG = ctx.createGain(); AU.windG.gain.value = 0; w.connect(AU.windF).connect(AU.windG).connect(AU.master);
  } catch (e) { console.warn('[wx audio]', e); AU.ctx = null; }
}
function r7Thunder(distKm) {
  if (!AU.ctx || !W7.cfg.sound || AU.ctx.state !== 'running') return;
  try {
    const ctx = AU.ctx, now = ctx.currentTime, s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = AU.noise; lp.type = 'lowpass';
    const near = distKm < 1.2, peak = Math.min(1.1, 0.9 / distKm), len = 3 + distKm * 1.2;
    lp.frequency.setValueAtTime(near ? 2400 : 700, now); lp.frequency.exponentialRampToValueAtTime(90, now + len);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(peak, now + (near ? 0.04 : 0.35)); g.gain.exponentialRampToValueAtTime(0.0001, now + len);
    s.connect(lp).connect(g).connect(AU.master); s.start(now, Math.random() * 1.5); s.stop(now + len + 0.1);
  } catch (e) { /* audio is best-effort */ }
}
function r7Audio(dt) {
  if (!AU.ctx) return;
  const now = AU.ctx.currentTime, on = W7.cfg.sound && !document.hidden;
  if (!Number.isFinite(W7.wind)) W7.wind = 2;
  const spd = Number.isFinite(P.speed) ? P.speed : 0;
  const inside = P.mode === 'drive' ? 0.55 : 1;   // muffled in a car
  const air = P.mode === 'fly' ? Math.min(1, Math.abs(spd) / 70) : P.mode === 'drive' || P.mode === 'cycle' ? Math.min(0.5, Math.abs(spd) / 80) : 0;
  AU.rainG.gain.setTargetAtTime(on ? W7.v.rain * 0.28 * inside : 0, now, 0.4);
  AU.windG.gain.setTargetAtTime(on ? Math.min(0.35, Math.pow(W7.wind / 16, 1.6) * 0.3 * inside + air * 0.12) : 0, now, 0.3);
  AU.windF.frequency.setTargetAtTime(220 + W7.wind * 22 + W7.gust * 30 + air * 500, now, 0.5);
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, r7AudioInit, { passive: true });

// ---------------------------------------------------------------- river mist (a fog volume laid over the water raster)
const MIST = { mesh: null, tex: null, u: null, amt: 0, waterY: 0, near: false, scanT: 0 };
window.__mist = MIST;
function r7MistBuild() {
  if (MIST.mesh || !RC.water) return;
  const data = new Uint8Array(WNX * WNZ); for (let i = 0; i < data.length; i++) data[i] = RC.water[i] ? 255 : 0;
  const tex = MIST.tex = new THREE.DataTexture(data, WNX, WNZ, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  MIST.u = {
    uMask: { value: tex }, uB0: { value: new THREE.Vector2(RCB.x0, RCB.z0) }, uBS: { value: new THREE.Vector2(WNX * WR, WNZ * WR) },
    uT: { value: 0 }, uAmt: { value: 0 }, uCol: { value: new THREE.Color() }, uCam: { value: new V3() }, uWind: { value: new THREE.Vector2() }, uLayers: { value: 4 }
  };
  const L = isTouch ? 3 : 4, geo = new THREE.PlaneGeometry(1800, 1800, 1, 1).rotateX(-Math.PI / 2), pos = [], lay = [];
  // stack L flat layers in one draw: each layer is a copy of the quad lifted by its own height
  const gp = geo.attributes.position.array, gi = geo.index.array, idx = [];
  for (let l = 0; l < L; l++) { const o = pos.length / 3; for (let i = 0; i < gp.length; i += 3) { pos.push(gp[i], gp[i + 1], gp[i + 2]); lay.push(l); } for (const k of gi) idx.push(o + k); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aL', new THREE.Float32BufferAttribute(lay, 1)); g.setIndex(idx);
  MIST.u.uLayers.value = L;
  const m = new THREE.ShaderMaterial({
    uniforms: MIST.u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute float aL; uniform float uLayers; varying vec3 vW; varying float vL;
void main(){ vec3 p = position; vL = aL / max(1.0, uLayers - 1.0); p.y += 0.6 + vL * vL * 9.0; vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D uMask; uniform vec2 uB0, uBS, uWind; uniform float uT, uAmt; uniform vec3 uCol, uCam; varying vec3 vW; varying float vL;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 uv = (vW.xz - uB0) / uBS; float m = texture2D(uMask, uv).r;
  // spill a little over the banks: blur the mask with four taps
  vec2 o = vec2(24.0) / uBS; m = max(m, 0.55 * (texture2D(uMask, uv + vec2(o.x, 0)).r + texture2D(uMask, uv - vec2(o.x, 0)).r + texture2D(uMask, uv + vec2(0, o.y)).r + texture2D(uMask, uv - vec2(0, o.y)).r) * 0.25);
  if (m < 0.02) discard;
  vec2 q = vW.xz * 0.012 + uWind * uT * 0.004 + vL * 7.3;
  float f = n(q) * 0.55 + n(q * 2.3 + 3.1) * 0.3 + n(q * 5.1 - 1.7) * 0.15;
  f = smoothstep(0.22, 0.8, f);
  float d = distance(vW.xz, uCam.xz);
  float edge = 1.0 - smoothstep(520.0, 880.0, d);                       // fade the quad's edges
  float nearFade = smoothstep(2.0, 40.0, d) * smoothstep(0.4, 4.0, abs(uCam.y - vW.y) + d * 0.05);   // no flat sheet in your face
  float a = uAmt * m * f * edge * nearFade * (1.0 - vL * 0.55) * 0.8;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uCol, a);
}`
  });
  MIST.mesh = new THREE.Mesh(g, m); MIST.mesh.frustumCulled = false; MIST.mesh.renderOrder = 3; MIST.mesh.visible = false;
  scene.add(MIST.mesh);
}
function r7MistScan() {   // is there water near the camera, and at what height?
  const cx = camera.position.x, cz = camera.position.z, hs = [];
  for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) {
    const x = cx + i * 60, z = cz + j * 60, c = rcCell(x, z);
    if (c >= 0 && RC.water[c]) hs.push(rcH(x, z));
  }
  MIST.near = hs.length > 3;
  if (MIST.near) { hs.sort((a, b) => a - b); MIST.waterY = hs[Math.floor(hs.length * 0.2)] + 0.25; }
}
function r7Mist(dt, t) {
  if (!RC.ready) return;
  if (!MIST.mesh) { r7MistBuild(); if (!MIST.mesh) return; }
  if ((MIST.scanT -= dt) <= 0) { MIST.scanT = 1.2; r7MistScan(); }
  // morning/evening river mist, worse in still air and fog; wind and midday burn it off
  const tod = timeId === 'golden' ? 0.4 : timeId === 'blue' ? 0.45 : timeId === 'night' ? 0.3 : 0.04;
  const want = clamp((tod + W7.v.fog * 0.95 + W7.v.rain * 0.12) * (1 - Math.min(0.8, W7.wind / 14)), 0, 1);
  MIST.amt += (want - MIST.amt) * Math.min(1, dt * 0.4);
  const show = MIST.near && MIST.amt > 0.02 && camera.position.y < MIST.waterY + 450;
  MIST.mesh.visible = show; if (!show) return;
  MIST.mesh.position.set(Math.round(camera.position.x / 8) * 8, MIST.waterY, Math.round(camera.position.z / 8) * 8);
  const u = MIST.u; u.uT.value = t % 5000; u.uAmt.value = MIST.amt; u.uCam.value.copy(camera.position);
  u.uWind.value.set(Math.sin(W7.windDir), Math.cos(W7.windDir)).multiplyScalar(0.6 + W7.wind * 0.4);
  u.uCol.value.copy(scene.fog.color).lerp(r7C.a.setRGB(0.92, 0.94, 1), 0.45);
  if (lampLevel > 0) u.uCol.value.lerp(r7C.a.setRGB(1, 0.82, 0.6), 0.12 * Math.min(1, lampLevel));   // sodium glow in the mist
}

// ---------------------------------------------------------------- coronas: street lamps (per tile) + traffic lights on cars
const COR = { mat: null, cars: null, carN: 0 };
function r7CoronaMat() {
  if (COR.mat) return COR.mat;
  COR.u = { uLamp: { value: 0 }, uCars: { value: 0 }, uHalo: { value: 0 }, uPR: { value: 1 }, uT: { value: 0 }, uFade: { value: 650 } };
  COR.mat = new THREE.ShaderMaterial({
    uniforms: COR.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aCol; attribute float aSeed; attribute float aKind; uniform float uLamp, uCars, uHalo, uPR, uT, uFade; varying vec3 vC; varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
  float on = aKind < 0.5 ? uLamp : uCars;
  // a few street lamps buzz and flicker
  if (aKind < 0.5 && aSeed > 0.975) on *= step(0.35, fract(sin(floor(uT * 9.0 + aSeed * 50.0)) * 9123.1));
  float size = (aKind < 0.5 ? 2.6 : 0.9) * (1.0 + uHalo * 1.6);
  vA = on * (1.0 - smoothstep(uFade * 0.6, uFade, d)) * (aKind < 0.5 ? 0.85 : 1.0);
  vC = aCol;
  gl_PointSize = clamp(size * 520.0 / max(d, 1.0), 1.5, 90.0) * uPR * step(0.002, vA);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `uniform float uHalo; varying vec3 vC; varying float vA;
void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r = dot(p, p); if (r > 1.0) discard;
  float core = exp(-r * 18.0), halo = exp(-r * (4.0 - uHalo * 1.5)) * (0.25 + uHalo * 0.3);
  gl_FragColor = vec4(vC * (core * 1.4 + halo) * vA, 1.0); }`
  });
  return COR.mat;
}
// called from r5Street with a cell's lamp list: [x, y, z, yaw, scale, colour]
function r7LampCoronas(list) {
  if (!list || !list.length) return null;
  const n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), seed = new Float32Array(n), kind = new Float32Array(n), c = new THREE.Color();
  list.forEach((L, i) => {
    const s = L[4] || 1, yw = L[3] || 0, ox = 2.75 * s, oy = 8.45 * s;   // the luminaire at the end of the arm
    pos[3 * i] = L[0] + ox * Math.cos(yw); pos[3 * i + 1] = L[1] + oy; pos[3 * i + 2] = L[2] - ox * Math.sin(yw);
    const r = rcHash ? rcHash(i * 7.31 + L[0] * 0.013 + L[2] * 0.007) : rnd();
    c.set(r < 0.7 ? '#ffc684' : '#eef0ff');   // sodium, with some newer LED heads
    col.set([c.r, c.g, c.b], 3 * i); seed[i] = r; kind[i] = 0;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  g.computeBoundingSphere();
  const pts = new THREE.Points(g, r7CoronaMat()); pts.renderOrder = 4; pts.matrixAutoUpdate = false;
  return pts;
}
function r7CarCoronasBuild() {
  const n = CARS.length * 4; if (!n) return;
  const g = new THREE.BufferGeometry(), col = new Float32Array(n * 3), kind = new Float32Array(n).fill(1);
  for (let i = 0; i < CARS.length; i++) for (let k = 0; k < 4; k++) col.set(k < 2 ? [1, 0.95, 0.85] : [1, 0.1, 0.05], (i * 4 + k) * 3);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n), 1)); g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  COR.cars = new THREE.Points(g, r7CoronaMat()); COR.cars.frustumCulled = false; COR.cars.renderOrder = 4; scene.add(COR.cars);
}
function r7Coronas(dt, t) {
  r7CoronaMat();
  const u = COR.u, bad = Math.min(1, W7.v.rain * 0.8 + W7.v.fog + W7.v.over * 0.3);
  u.uLamp.value = Math.min(1.3, lampLevel * 1.1 + (lampLevel > 0 ? 0 : W7.v.over * W7.v.fog * 0.8));
  u.uCars.value = Math.min(1.2, lampLevel * 1.1 + bad * 0.6);   // drivers switch on in rain and fog
  u.uHalo.value = bad; u.uPR.value = renderer.getPixelRatio(); u.uT.value = t % 1000;
  u.uFade.value = 700 * (1 - W7.v.fog * 0.6);   // fog swallows far lights
  if (!COR.cars && CARS.length && traffic.groups) r7CarCoronasBuild();
  if (!COR.cars) return;
  COR.cars.visible = u.uCars.value > 0.02; if (!COR.cars.visible) return;
  const a = COR.cars.geometry.attributes.position.array;
  for (let i = 0; i < CARS.length; i++) {
    const c = CARS[i], o = i * 12;
    if (!c.rd || c.z < -90000) { for (let k = 0; k < 12; k++) a[o + k] = 0; a[o + 1] = a[o + 4] = a[o + 7] = a[o + 10] = -9999; continue; }
    const yw = c.ryaw || c.yaw, fx = -Math.sin(yw), fz = -Math.cos(yw), rx = -fz, rz = fx, y = (c.y ?? 0);
    const sx = c.hx - 0.32, pts = [[sx, 0.72, c.hz + 0.05], [-sx, 0.72, c.hz + 0.05], [sx, 0.85, -c.hz - 0.05], [-sx, 0.85, -c.hz - 0.05]];
    for (let k = 0; k < 4; k++) { const [s, h, f] = pts[k]; a[o + k * 3] = c.x + rx * s + fx * f; a[o + k * 3 + 1] = y + h; a[o + k * 3 + 2] = c.z + rz * s + fz * f; }
  }
  COR.cars.geometry.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- per-context camera (on foot / road vehicles / aircraft)
const CAMX = { foot: null, road: null, air: null };
try { Object.assign(CAMX, JSON.parse(localStorage.getItem('slopCam') || '{}')); } catch (e) {}
const r7Ctx = m => m === 'walk' ? 'foot' : m === 'fly' ? 'air' : 'road';
const r7Follow = id => FOLLOW.some(f => f.id === id);
const r7BaseSetMode = setMode;
setMode = (m, quiet) => {
  const was = P.mode;
  if (r7Follow(camMode)) CAMX[r7Ctx(was)] = camMode;
  r7BaseSetMode(m, quiet);
  const want = CAMX[r7Ctx(P.mode)];
  if (P.mode !== was && want && r7Follow(want) && r7Follow(camMode) && want !== camMode) { camMode = want; autoT = 0; refreshPanel(); }
  try { localStorage.setItem('slopCam', JSON.stringify(CAMX)); } catch (e) {}
};
const r7BaseSetCam = setCam;
setCam = (id, idx) => { r7BaseSetCam(id, idx); if (r7Follow(id)) { CAMX[r7Ctx(P.mode)] = id; try { localStorage.setItem('slopCam', JSON.stringify(CAMX)); } catch (e) {} } };

// ---------------------------------------------------------------- hooks
const r7BaseSetTime = setTime;
setTime = (id, quiet) => {
  const r = RAIN.on; RAIN.on = false;      // capture the dry preset...
  r7BaseSetTime(id, quiet);
  RAIN.on = r; r7Capture();
  if (r) applyFilm();                      // ...then re-grade for rain
  r7Apply();
};
setRain = (on, quiet) => r7SetWeather(on ? (W7.next === 'thunder' || W7.next === 'drizzle' ? W7.next : 'rain') : 'clear', quiet);
const r7BaseRefresh = refreshPanel;
refreshPanel = () => {
  r7BaseRefresh();
  const el = $('wxOpts'); if (!el) return;
  const cyc = [['off', 'Hold', 'Keep this weather'], ['normal', 'Dynamic', 'Changes every few minutes'], ['fast', 'Fast', 'Time-lapse weather']];
  const row = document.createElement('div'); row.className = 'grid2'; row.style.gridTemplateColumns = 'repeat(3, 1fr)';
  row.append(...cyc.map(([k, n, s]) => optBtn(n, s, W7.cfg.mode === k, () => { W7.cfg.mode = k; W7.hold = r7Hold(); r7Save(); refreshPanel(); toast('Weather cycle: ' + n); })));
  const now = W7.k < 1 && W7.cur !== '_from' && W7.cur !== W7.next ? `${WX[W7.cur].name} → ${WX[W7.next].name}` : WX[W7.next].name;
  const stat = document.createElement('div'); stat.className = 'keys'; stat.style.margin = '2px 0 6px'; stat.id = 'wxNow'; stat.textContent = 'Now: ' + now;
  el.replaceChildren(stat, row, ...WX_ORDER.map(id => optBtn(WX[id].name, WX[id].sub, W7.next === id, () => r7SetWeather(id), id === 'rain' ? 'K' : id === 'thunder' ? 'J' : '')),
    optBtn('Weather sounds', 'Rain, wind and thunder', W7.cfg.sound, () => { W7.cfg.sound = !W7.cfg.sound; r7Save(); if (W7.cfg.sound) r7AudioInit(); refreshPanel(); }));
};
addEventListener('keydown', e => {
  if (e.repeat || e.target.tagName === 'INPUT' || !$('map').hidden) return;
  if (e.code === 'KeyJ') { const i = WX_ORDER.indexOf(W7.next); r7SetWeather(WX_ORDER[(i + 1) % WX_ORDER.length]); }
});

function r7Frame(dt, t) {
  W7.t += dt;
  // the cycle
  if (W7.k < 1) { W7.k = Math.min(1, W7.k + dt / Math.max(0.5, W7.blendT)); if (W7.k >= 1) { W7.cur = W7.next; W7.from = null; refreshPanel(); } }
  else if (WX_SPEED[W7.cfg.mode] > 0 && !SHOT) {
    W7.hold -= dt;
    if (W7.hold <= 0) {
      const nx = r7PickNext(W7.cur);
      r7SetWeather(nx, true, 50 / WX_SPEED[W7.cfg.mode]);
      const wasNice = WX[W7.cur] ? WX[W7.cur].nice : 9;
      toast(WX[nx].rain > 0 && !(WX[W7.cur] && WX[W7.cur].rain > 0) ? `${WX[nx].name} moving in` : WX[nx].nice > wasNice ? `${WX[nx].name}: clearing up` : 'Weather: ' + WX[nx].name);
    }
  }
  r7Target();
  // rain wets the streets in ~20 s; puddles take minutes to dry, faster under a clear sky
  const r = W7.v.rain;
  if (r > 0.05) W7.wet = Math.min(1, W7.wet + dt * r / 20);
  else W7.wet = Math.max(0, W7.wet - dt * (1 - W7.v.over * 0.7) / 240);
  // the grade/glare/pedestrian code keys off RAIN.on; flip it with a little hysteresis
  const ron = W7.rainOn ? r > 0.2 : r > 0.3;
  if (ron !== W7.rainOn) { W7.rainOn = ron; RAIN.on = ron; applyFilm(); }
  r7Wind(dt, t); r7Lightning(dt);
  if (!W7.base) r7Capture();
  r7Apply(); r7Rain(dt, t); r7Mist(dt, t); r7Coronas(dt, t); r7Audio(dt);
}
const r7BaseFrame = r5Frame;
r5Frame = (dt, t) => { r7BaseFrame(dt, t); try { r7Frame(dt, t); } catch (e) { if (!W7.err) { W7.err = 1; console.warn('[wx]', e); } } };

// the Rain toggle used to be the whole Weather menu; the panel and K / J keys now go through the weather system
W7.hold = r7Hold();

// ================================================================ classic GTA controller layout (PS5 DualSense)
// Mirrors GTA V's PlayStation defaults where this game has the action; "Original" keeps the v21 layout.
// Safari can't read the DualSense touchpad click, so "change view" is also on R3 (GTA's look-behind slot).
//  On foot : L move · R look · ✕ sprint · □ jump · △ get in · L3 stroll · R3 / touchpad camera
//  Car     : R2 gas · L2 brake/reverse · L steer · R1 handbrake · L3 horn · ✕ boost · □ next car · △ get out
//  Bike    : ✕ or R2 pedal · L2 brake · L steer · R1 handbrake
//  Chopper : L stick tilt/turn · R2 climb · L2 descend · L1/R1 turn · ✕ boost · □ swap aircraft
//  Jet     : R2 throttle · L2 slow · L stick roll/pitch (pull back to climb) · L1/R1 yaw · ✕ boost · □ swap
//  Always  : ◀ ▶ travel mode · ▲ time · ▼ map · OPTIONS menu
if (!PAD.cfg.layout) PAD.cfg.layout = 'gta';
PAD.hb = false; PAD.tp = 0;
const r7BasePlay = r6Play;
r6Play = dt => {
  if (PAD.cfg.layout !== 'gta') { PAD.hb = false; return r7BasePlay(dt); }
  const m = P.mode, jet = m === 'fly' && flyerId === 'jet', heli = m === 'fly' && !jet, cine = camMode === 'scenic' || camMode === 'auto' || camMode === 'aerial';
  const R2 = PAD.b[PB.R2], L2 = PAD.b[PB.L2], lx = PAD.lx, ly = PAD.ly, yawB = (r6Down(PB.R1) ? 1 : 0) - (r6Down(PB.L1) ? 1 : 0);
  if (m === 'walk') { PAD.f = -ly; PAD.s = lx; PAD.u = 0; }
  else if (m === 'drive') { PAD.f = R2 - L2; PAD.s = r6Curve(lx, 1.35); PAD.u = 0; }
  else if (m === 'cycle') { PAD.f = Math.max(R2, r6Down(PB.X) ? 1 : 0) - L2; PAD.s = r6Curve(lx, 1.35); PAD.u = 0; }
  else if (heli) { PAD.f = -ly; PAD.s = clamp(lx * 0.75 + yawB, -1, 1); PAD.u = R2 - L2; }
  else { PAD.f = R2 - L2; PAD.s = clamp(lx + yawB * 0.6, -1, 1); PAD.u = PAD.cfg.invert ? -ly : ly; }   // GTA default: pull back to climb
  PAD.boost = (m === 'drive' || m === 'fly') && r6Down(PB.X);
  PAD.hb = (m === 'drive' || m === 'cycle') && r6Down(PB.R1);
  const sp = m === 'walk' && r6Down(PB.X);                 // GTA: ✕ sprints
  if (sp !== PAD.sprint) { PAD.sprint = sp; keys.ShiftRight = sp; }

  const k = PAD.cfg.sens;
  if (PAD.rx || PAD.ry) {
    cam.yawOff -= r6Curve(PAD.rx, 1.5) * 3.1 * k * dt;
    cam.pitch = clamp(cam.pitch + r6Curve(PAD.ry, 1.5) * 1.9 * k * dt, m === 'walk' ? -0.42 : -0.25, 1.25);
    cam.lastDrag = r5Now();
  }
  // touchpad click (Chrome/Edge report it as button 17; Safari doesn't expose it)
  let tp = 0; try { const g = r6Pick(), b = g && g.buttons[17]; tp = b && b.pressed ? 1 : 0; } catch (e) {}
  const tpHit = tp && !PAD.tp; PAD.tp = tp;

  if (r6Hit(PB.OPT)) return r6OpenPanel(true);
  if (r6Hit(PB.DN)) return openMap();
  if (r6Hit(PB.UP)) setTime(TIME_ORDER[(TIME_ORDER.indexOf(timeId) + 1) % 4]);
  if (r6Hit(PB.LT) || r6Hit(PB.RT)) { const i = R6_MODES.indexOf(m), d = r6Hit(PB.RT) ? 1 : -1; setMode(R6_MODES[(i + d + 4) % 4]); r6Rumble(0, 0.25, 60); }
  if (r6Hit(PB.R3) || tpHit) { const i = FOLLOW.findIndex(f => f.id === camMode); setCam(FOLLOW[(i + 1) % FOLLOW.length].id); }
  if (r6Hit(PB.TRI)) r5Act();
  if (cine && r6Hit(PB.O)) setCam('chase');
  if (m === 'walk') {
    if (r6Hit(PB.SQ)) FOOT.jumpQ = 0.18;                    // GTA: □ jumps
    if (r6Hit(PB.L3)) { FOOT.slow = !FOOT.slow; toast(FOOT.slow ? 'Strolling' : 'Jogging'); }
  } else {
    if (r6Hit(PB.SQ)) { if (m === 'fly') setFlyer(jet ? 'heli' : 'jet'); else if (m === 'drive') setPlayerCar(carIdx + 1); updateHint(); }
    if (m === 'drive' || m === 'cycle') { if (r6Down(PB.L3)) r7Horn(true, m === 'cycle'); else if (AU.horn) r7Horn(false); }
  }
  if (PAD.hb && !PAD.hbWas && Math.abs(P.speed) > 6) r6Rumble(0.15, 0.45, 160);
  PAD.hbWas = PAD.hb;
  if (m === 'drive' || m === 'cycle' || m === 'fly') {
    const s0 = Math.abs(PAD.lastSpd), s1 = Math.abs(P.speed), drop = s0 - s1;
    if (s0 > 5 && drop > 3.2 && PAD.rumbleT <= 0 && !PAD.hb) { const a = Math.min(1, drop / 14); r6Rumble(a, a * 0.6, 90 + a * 160); PAD.rumbleT = 0.3; }
  }
  PAD.lastSpd = P.speed; PAD.rumbleT -= dt;
};

// handbrake (R1 on the pad, Space on the keyboard while driving): locks the rear, scrubs speed and tightens the turn
const r7BasePlayer = updatePlayer;
updatePlayer = dt => {
  const m = P.mode, hb = (m === 'drive' || m === 'cycle') && (PAD.hb || (keys.Space && !PAD.ui));
  const y0 = P.yaw;
  r7BasePlayer(dt);
  if (!hb) return;
  P.speed *= Math.exp(-dt * (Math.abs(P.speed) > 3 ? 0.9 : 6));
  const k = clamp(P.speed / 9, -1, 1);
  P.yaw -= P.steer * (m === 'drive' ? 1.25 : 0.8) * k * dt;   // the back steps out
  if (m === 'drive' && Math.abs(P.speed) > 8 && Math.abs(P.steer) > 0.3) P.yaw += (P.yaw - y0) * 0.15;
};

// horn: two detuned square tones through the weather-audio graph (a bell on the bike)
function r7Horn(on, bell) {
  if (!on) { if (AU.horn) { const h = AU.horn; AU.horn = null; try { h.g.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.03); h.o.forEach(o => o.stop(AU.ctx.currentTime + 0.2)); } catch (e) {} } return; }
  if (AU.horn) return;
  if (!AU.ctx) { const s = W7.cfg.sound; W7.cfg.sound = true; r7AudioInit(); W7.cfg.sound = s; }
  if (!AU.ctx) return; if (AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {});
  try {
    const ctx = AU.ctx, now = ctx.currentTime, g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = bell ? 6000 : 1800;
    const o = (bell ? [2200, 2950] : [392, 494]).map(f => { const x = ctx.createOscillator(); x.type = bell ? 'sine' : 'square'; x.frequency.value = f; x.connect(lp); x.start(now); return x; });
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(bell ? 0.12 : 0.09, now + 0.02);
    if (bell) g.gain.setTargetAtTime(0, now + 0.05, 0.25);
    lp.connect(g).connect(AU.ctx.destination); AU.horn = { g, o };
  } catch (e) {}
}

const r7BaseHint = updateHint;
updateHint = () => {
  if (!PAD.on || PAD.cfg.layout !== 'gta') return r7BaseHint();
  const m = P.mode, tail = `<b>R3</b> camera · <b>◀ ▶</b> mode · <b>▲</b> time · <b>▼</b> map · <b>OPTIONS</b> menu`;
  let top;
  if (m === 'walk') top = `<b>L</b> move · <b>R</b> look · ${G.x} sprint · ${G.sq} jump · ${G.tri} get in · <b>L3</b> stroll`;
  else if (m === 'drive') top = `<b>R2</b> gas · <b>L2</b> brake · <b>R1</b> handbrake · <b>L3</b> horn · ${G.x} boost · ${G.sq} next car · ${G.tri} get out`;
  else if (m === 'cycle') top = `${G.x}/<b>R2</b> pedal · <b>L2</b> brake · <b>R1</b> handbrake · <b>L3</b> bell · ${G.tri} get off`;
  else if (flyerId === 'jet') top = `<b>R2</b> throttle · <b>L2</b> slow · <b>L</b> roll / ${PAD.cfg.invert ? 'push to climb' : 'pull to climb'} · <b>L1 R1</b> yaw · ${G.x} boost · ${G.sq} chopper`;
  else top = `<b>L</b> tilt · <b>R2</b> up · <b>L2</b> down · <b>L1 R1</b> turn · ${G.x} boost · ${G.sq} jet`;
  $('hint').innerHTML = `${top}<br>${tail}`;
};

// Controller menu: layout switch + the GTA key card
(function r7PadUI() {
  const box = $('padOpts'); if (!box) return;
  const lay = optBtn('Classic GTA layout', '✕ sprint · □ jump · R1 handbrake · L3 horn', PAD.cfg.layout === 'gta', () => {
    PAD.cfg.layout = PAD.cfg.layout === 'gta' ? 'v21' : 'gta'; lay.setAttribute('aria-pressed', String(PAD.cfg.layout === 'gta'));
    r6Save(); updateHint(); r7Keys(); toast(PAD.cfg.layout === 'gta' ? 'Controller: classic GTA layout' : 'Controller: original layout');
  });
  box.prepend(lay);
  const card = box.nextElementSibling;
  const r7Keys = () => {
    if (!card) return;
    if (PAD.cfg.layout !== 'gta') { if (card.dataset.v21) card.innerHTML = card.dataset.v21; return; }
    if (!card.dataset.v21) card.dataset.v21 = card.innerHTML;
    card.innerHTML = 'Classic GTA layout · PS5 DualSense over Bluetooth, or any standard pad. Press a button to wake it.<br>'
      + `On foot: <b>L</b> move · <b>R</b> look · ${G.x} sprint · ${G.sq} jump · ${G.tri} get in · <b>L3</b> stroll<br>`
      + `Car: <b>R2</b> gas · <b>L2</b> brake / reverse · <b>R1</b> handbrake · <b>L3</b> horn · ${G.x} boost · ${G.sq} next car · ${G.tri} get out<br>`
      + `Bike: ${G.x} or <b>R2</b> pedal · <b>R1</b> handbrake · <b>L3</b> bell<br>`
      + `Aircraft: <b>R2/L2</b> throttle or climb/descend · <b>L</b> pitch &amp; roll · <b>L1 R1</b> yaw · ${G.x} boost · ${G.sq} swap<br>`
      + '<b>R3</b> (or touchpad in Chrome) camera · <b>◀ ▶</b> mode · <b>▲</b> time · <b>▼</b> map · <b>OPTIONS</b> menu<br>'
      + 'Map: <b>L</b> pan · <b>R2/L2</b> zoom · ✕ teleport. Menu: <b>▲▼</b> move · ✕ select · ○ close';
  };
  r7Keys();
})();
