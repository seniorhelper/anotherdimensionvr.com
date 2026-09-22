/* ANOTHER DIMENSION — core: worlds, level generator and player physics.
   Pure JavaScript (no rendering) so every level can be proven solvable by a test bot. */

export const PHYS = { speed: 6.6, air: 0.9, jumpV: 8.4, grav: 22, coyote: 0.12, buffer: 0.14, r: 0.3, h: 1.7, eye: 1.6, bounceV: 15, boost: 12, fallY: -18 };

/* Four realities. Each has two phases (A and B) with their own colors. */
export const WORLDS = [
  { id: 0, key: 'prism', name: 'The Prism Void', tag: 'Glass bridges hang in an aurora that never ends.', sky: 0, a: '#38f0ff', b: '#ff5ad7', both: '#f4f7ff', fog: '#1a1440', fogD: 0.011, light: '#ffffff', mat: { rough: 0.08, metal: 0.1, trans: 1 }, music: [220, [0, 4, 7, 11, 14]] },
  { id: 1, key: 'ink', name: 'The Ink Realm', tag: 'A world brushed in black ink, where only red is real.', sky: 1, a: '#ff2d3c', b: '#1b1b1f', both: '#efe6d2', fog: '#d8cdb4', fogD: 0.014, light: '#fff4e0', mat: { rough: 0.9, metal: 0, trans: 0 }, music: [196, [0, 2, 5, 7, 9]] },
  { id: 2, key: 'chrome', name: 'Liquid Chrome', tag: 'Mirror towers melt into a sunset that is always setting.', sky: 2, a: '#ffb13d', b: '#6a5cff', both: '#d9e2ee', fog: '#ff8a6a', fogD: 0.009, light: '#ffd6a8', mat: { rough: 0.12, metal: 1, trans: 0 }, music: [174.6, [0, 3, 7, 10, 12]] },
  { id: 3, key: 'fractal', name: 'The Fractal Core', tag: 'The center of every dimension, folding in on itself forever.', sky: 3, a: '#ffd23f', b: '#2bffb0', both: '#ffffff', fog: '#07021a', fogD: 0.012, light: '#fff0c8', mat: { rough: 0.3, metal: 0.7, trans: 0 }, music: [146.8, [0, 1, 5, 7, 8]] }
];

/* 20 levels: 5 per reality, each longer and trickier. Level 20 is the Tesseract. */
export const LEVELS = [];
const NAMES = [
  ['First Light', 'Glass Steps', 'Split Horizon', 'Aurora Run', 'The Refraction'],
  ['Brushstroke', 'Red Thread', 'Ink Rain', 'Scroll of Falling', 'The Last Stroke'],
  ['Mercury Mile', 'Melting Towers', 'Mirror Maze', 'Sunset Sprint', 'The Reflection'],
  ['Folding Stairs', 'Infinite Echo', 'Kaleido Drop', 'The Spiral', 'The Tesseract']
];
for (let w = 0; w < 4; w++) for (let i = 0; i < 5; i++) {
  const n = w * 5 + i;
  LEVELS.push({
    n, world: w, name: NAMES[w][i], seed: 1000 + n * 7919,
    len: 16 + n * 3,                                     // platforms on the main path: 16 .. 73
    shift: n === 0 ? 0.0 : Math.min(0.78, 0.3 + n * 0.035), // how often the path forces a reality shift
    diff: Math.min(0.86, 0.55 + n * 0.017),              // how close jumps get to the limit
    moving: n >= 3 ? Math.min(0.28, 0.06 + n * 0.012) : 0,
    crumble: n >= 6 ? Math.min(0.22, 0.04 + n * 0.01) : 0,
    bounce: n >= 2 ? 0.07 : 0,
    lasers: n >= 4 ? Math.min(0.3, 0.08 + n * 0.012) : 0,
    boost: n >= 9 ? 0.06 : 0,
    par: 0
  });
}

export function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* horizontal reach (edge to edge, meters) for a jump that lands dy higher, with a safety factor */
export function reach(dy, k = 1) {
  const P = PHYS, disc = P.jumpV * P.jumpV - 2 * P.grav * dy; if (disc <= 0) return 0;
  const t = (P.jumpV + Math.sqrt(disc)) / P.grav; return (P.speed * t + P.r * 2 - 0.35) * k;
}

/* ---------- autopilot: plays a jump from one platform to the next (used to validate levels and for the ghost demo) ---------- */
export function autopilot(p, lvl, cur, nxt) {
  const cp = platPos(cur, p.t), np = platPos(nxt, p.t);
  const dx = np.x - p.x, dz = np.z - p.z, yaw = Math.atan2(-dx, -dz);
  const ex = Math.max(0, Math.abs(dx) - nxt.w / 2), ez = Math.max(0, Math.abs(dz) - nxt.d / 2), edge = Math.hypot(ex, ez);
  const onCur = p.on && p.on.id === cur.id;
  const la = 0.45, fx = p.x - Math.sin(yaw) * la, fz = p.z - Math.cos(yaw) * la;
  const leaving = onCur && (Math.abs(fx - cp.x) > cur.w / 2 || Math.abs(fz - cp.z) > cur.d / 2);
  let mz = 1, jump = false;
  if (p.ground && onCur && cur.type !== 'bounce' && cur.type !== 'boost' && (leaving || edge < 0.6)) jump = true;
  const need = reach(Math.max(0, nxt.y - cur.y), 0.9);
  if (p.ground && onCur && leaving && (nxt.type === 'move' || cur.type === 'move') && edge > need) { mz = 0; jump = false; }
  const lsC = lvl.lasers.find(l => l.plat === (p.on && p.on.id)), lsN = lvl.lasers.find(l => l.plat === nxt.id);
  let dim = p.dim;
  if (p.ground && lsC) dim = 1 - lsC.dim;
  else if (!p.ground && p.gT > 0.06) dim = lsN ? 1 - lsN.dim : nxt.dim !== 2 ? nxt.dim : p.dim;
  return { mx: 0, mz, yaw, jump, jumpHeld: true, dim };
}
function tryJump(cur, cand, plats, lasers) {
  // a small world: the two platforms plus anything nearby that could bump your head
  const near = plats.filter(p => p !== cur && Math.hypot(p.x - cand.x, p.z - cand.z) < 16);
  const lvl = { probe: true, plats: [cur, cand, ...near], lasers: lasers.filter(l => l.plat === cur.id || l.plat === cand.id), shards: [] };
  for (const phase of [0, 1.7]) {
    const pos = platPos(cur, phase);
    const p = { x: pos.x, y: pos.y, z: pos.z, vx: 0, vz: 0, vy: 0, ground: true, gT: 0, bufT: 0, dim: cur.dim === 2 ? (lvl.lasers.find(l => l.plat === cur.id) ? 1 - lvl.lasers.find(l => l.plat === cur.id).dim : 0) : cur.dim, on: cur, crumble: {}, t: phase, cp: cur.id, shards: [], jumps: 0, shifts: 0 };
    let ok = false;
    for (let f = 0; f < 60 * 7 && !ok; f++) {
      const a = autopilot(p, lvl, cur, cand); shift(p, lvl, a.dim);
      const ev = step(p, lvl, a, 1 / 60);
      if (ev.some(e => e.e === 'zapped' || e.e === 'fell')) break;
      if (p.y < Math.min(cur.y, cand.y) - 6) break;
      if (ev.some(e => (e.e === 'land' || e.e === 'bounce') && e.id === cand.id) || (p.ground && p.on === cand)) ok = true;
    }
    if (!ok) return false;
  }
  return true;
}

/* ---------- level generator: every jump is test-played before it goes in ---------- */
export function buildLevel(L) {
  const r = rng(L.seed), plats = [], path = [], lasers = [], shards = [], checkpoints = [], decor = [];
  const ov = (a, b, m) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + m && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + m && Math.abs(a.y - b.y) < 3.2 + m;
  const add = (p) => { p.id = plats.length; plats.push(p); return p; };
  const start = add({ x: 0, y: 0, z: 0, w: 6, d: 6, th: 1, dim: 2, type: 'start' }); path.push(start.id);
  let heading = 0, cur = start, lastDim = 2, sinceCP = 0;
  for (let i = 1; i < L.len; i++) {
    const last = i === L.len - 1; let placed = null, laser = null;
    for (let tries = 0; tries < 60 && !placed; tries++) {
      const soft = tries > 20 ? 0.6 : 1; // later tries get gentler jumps
      const turn = (r() - 0.5) * (tries > 12 ? 2.4 : 0.9), hd = heading + turn;
      const big = last || cur.type === 'boost';
      const w = big ? (last ? 8 : 4.5) : Math.max(1.8, 4.2 - L.n * 0.08 + r() * 1.6), d = big ? (last ? 8 : 4.5) : Math.max(1.8, 4.2 - L.n * 0.08 + r() * 1.6);
      let dy = last ? 0 : (r() < 0.55 ? -r() * 2.2 : r() * 1.0) * soft;
      let maxG = reach(Math.max(0, dy), L.diff * soft), minG = 0.9;
      if (cur.type === 'bounce') { dy = 2.2 + r() * 1.2; maxG = 2.6; minG = 1.2; }
      if (cur.type === 'boost') { dy = -1 + r() * 3; minG = 5; maxG = 9; }
      const gap = Math.max(minG, Math.min(maxG, 1.1 + r() * maxG));
      const hx = Math.sin(hd), hz = -Math.cos(hd);
      const ext = (ww, dd) => Math.min(Math.abs(hx) > 1e-4 ? ww / 2 / Math.abs(hx) : 1e9, Math.abs(hz) > 1e-4 ? dd / 2 / Math.abs(hz) : 1e9);
      const dist = ext(cur.w, cur.d) + gap + ext(w, d);
      const cand = { x: cur.x + hx * dist, y: cur.y + dy, z: cur.z + hz * dist, w, d, th: 0.6, dim: 2, type: 'normal' };
      if (plats.some(p => p !== cur && ov(p, cand, 1.2))) continue;
      // reality + special type
      if (!last && L.shift > 0 && r() < L.shift) cand.dim = lastDim === 2 ? (r() < 0.5 ? 0 : 1) : 1 - lastDim;
      else if (!last && L.shift > 0 && r() < 0.35) cand.dim = lastDim === 2 ? 0 : lastDim;
      const roll = r(); let lz = null;
      if (!last && tries < 30) {
        if (roll < L.moving && cur.type !== 'crumble') { cand.type = 'move'; cand.amp = 0.8 + r() * 1.0; cand.spd = 0.6 + r() * 0.5; cand.axis = r() < 0.5 ? 'x' : 'z'; cand.ph = r() * 6.28; cand.w = Math.max(cand.w, 3); cand.d = Math.max(cand.d, 3); }
        else if (roll < L.moving + L.crumble && cur.type !== 'crumble') cand.type = 'crumble';
        else if (roll < L.moving + L.crumble + L.bounce && cur.type !== 'bounce') cand.type = 'bounce';
        else if (roll < L.moving + L.crumble + L.bounce + L.boost && cur.type !== 'boost') { cand.type = 'boost'; cand.w = Math.max(cand.w, 3); cand.d = Math.max(cand.d, 3); }
        else if (r() < L.lasers) { cand.dim = 2; cand.w = Math.max(cand.w, 4.5); cand.d = Math.max(cand.d, 4.5); lz = { plat: -1, dim: r() < 0.5 ? 0 : 1, axis: Math.abs(hx) > 0.7 ? 'z' : 'x', spd: 0.9 + r() * 0.7, ph: r() * 6.28 }; }
      }
      cand.id = -2; if (lz) lz.plat = -2;
      if (cur.type === 'boost') { cur.tx = cand.x; cur.ty = cand.y; cur.tz = cand.z; }
      if (!tryJump(cur, cand, plats, lz ? [...lasers, lz] : lasers)) continue;
      placed = cand; laser = lz; heading = hd * 0.85;
    }
    if (!placed && !cur._retry) { cur._retry = true; if (cur.type !== 'start' && cur.type !== 'normal') { cur.type = 'normal'; delete cur.amp; } const li = lasers.findIndex(l => l.plat === cur.id); if (li >= 0) lasers.splice(li, 1); i--; continue; }
    if (!placed) break;
    if (cur.type === 'boost') { cur.tx = placed.x; cur.ty = placed.y; cur.tz = placed.z; }
    add(placed); if (laser) { laser.plat = placed.id; lasers.push(laser); }
    lastDim = placed.dim; path.push(placed.id); sinceCP++;
    if (sinceCP >= 7 && placed.type === 'normal' && !laser && !last) { checkpoints.push(placed.id); placed.cp = true; sinceCP = 0; }
    cur = placed;
  }
  const exit = plats[path[path.length - 1]]; exit.type = 'exit'; exit.dim = 2;
  // shards: three optional side platforms (also test-played, both ways)
  const picks = [0.3, 0.6, 0.85].map(f => path[Math.max(2, Math.floor(path.length * f))]);
  for (const pid of picks) {
    const base = plats[pid]; if (base.type !== 'normal' && base.type !== 'crumble') continue; let made = false;
    for (let t = 0; t < 40 && !made; t++) {
      const a = r() * Math.PI * 2, gap = 1.3 + r() * 1.3, dy = 0.2 + r() * 0.6;
      const s = { x: base.x + Math.sin(a) * (base.w / 2 + gap + 1.1), y: base.y + dy, z: base.z - Math.cos(a) * (base.d / 2 + gap + 1.1), w: 2.2, d: 2.2, th: 0.5, dim: L.shift > 0 ? (r() < 0.5 ? 0 : 1) : 2, type: 'shard', id: -3 };
      if (!plats.every(p => p === base || !ov(p, s, 1.0))) continue;
      if (!tryJump(base, s, plats, lasers) || !tryJump(s, base, plats, lasers)) continue;
      add(s); shards.push({ plat: s.id, x: s.x, y: s.y + 1.2, z: s.z, base: pid }); made = true;
    }
  }
  for (let i = 0; i < 70; i++) { const a = r() * Math.PI * 2, rad = 45 + r() * 120; decor.push({ x: exit.x * r() + Math.cos(a) * rad, y: -30 + r() * 70, z: exit.z * r() + Math.sin(a) * rad, s: 2 + r() * 14, k: Math.floor(r() * 5), spin: (r() - 0.5) * 0.4 }); }
  const len = path.reduce((acc, id, i) => i ? acc + Math.hypot(plats[id].x - plats[path[i - 1]].x, plats[id].z - plats[path[i - 1]].z) : 0, 0);
  L.par = Math.round(len / PHYS.speed * 1.9 + path.length * 0.6);
  return { L, plats, path, lasers, shards, checkpoints, decor, exit, start };
}

/* moving platform position at time t */
export function platPos(p, t) {
  if (p.type !== 'move') return { x: p.x, y: p.y, z: p.z };
  const o = Math.sin(t * p.spd + p.ph) * p.amp; return p.axis === 'x' ? { x: p.x + o, y: p.y, z: p.z } : { x: p.x, y: p.y, z: p.z + o };
}
export function laserPos(ls, lvl, t) {
  const p = lvl.plats[ls.plat] && lvl.plats[ls.plat].id === ls.plat ? lvl.plats[ls.plat] : lvl.plats.find(q => q.id === ls.plat), pp = platPos(p, t), s = Math.sin(t * ls.spd + ls.ph);
  // the beam sweeps across the corridor at knee to chest height
  return ls.axis === 'x' ? { x: pp.x + s * (p.w / 2 - 0.3), y: pp.y + 0.9, z: pp.z, len: p.d, along: 'z' } : { x: pp.x, y: pp.y + 0.9, z: pp.z + s * (p.d / 2 - 0.3), len: p.w, along: 'x' };
}

/* ---------- player physics ---------- */
export function newPlayer(lvl) { const s = lvl.start; return { x: s.x, y: s.y, z: s.z + 1, vx: 0, vz: 0, vy: 0, yaw: 0, ground: true, gT: 0, bufT: 0, dim: 0, on: null, crumble: {}, t: 0, dead: false, cp: s.id, shards: [], done: false, jumps: 0, shifts: 0 }; }
function solid(p, pl, t) { if (pl.dim !== 2 && pl.dim !== p.dim) return false; const c = p.crumble[pl.id]; if (c && c.gone) return false; return true; }
function overlaps(px, py, pz, pl, pos) { const P = PHYS; return px + P.r > pos.x - pl.w / 2 && px - P.r < pos.x + pl.w / 2 && pz + P.r > pos.z - pl.d / 2 && pz - P.r < pos.z + pl.d / 2 && py + P.h > pos.y - pl.th && py < pos.y; }
/* can we shift into dim d right now without ending up inside something? */
export function canShift(p, lvl, d) { for (const pl of lvl.plats) { if (pl.dim !== d) continue; const pos = platPos(pl, p.t); if (overlaps(p.x, p.y + 0.05, p.z, pl, pos)) return false; } return true; }
export function shift(p, lvl, d) { if (d === undefined) d = 1 - p.dim; if (d === p.dim) return true; if (!canShift(p, lvl, d)) return false; p.dim = d; p.shifts++; return true; }

/* one physics step. input: {mx, mz, yaw, jump(pressed edge), jumpHeld} ; returns events */
export function step(p, lvl, inp, dt) {
  const P = PHYS, ev = []; p.t += dt; const t = p.t;
  // crumbling platforms
  for (const id in p.crumble) { const c = p.crumble[id]; c.k += dt; if (!c.gone && c.k > 1.1) { c.gone = true; ev.push({ e: 'crumbled', id: +id }); } if (c.gone && c.k > 3.2) { delete p.crumble[id]; ev.push({ e: 'restored', id: +id }); } }
  // carry with moving platform
  if (p.on && p.on.type === 'move' && p.ground) { const a = platPos(p.on, t - dt), b = platPos(p.on, t); p.x += b.x - a.x; p.z += b.z - a.z; }
  // input -> horizontal velocity (relative to yaw)
  const s = Math.sin(inp.yaw), c = Math.cos(inp.yaw); let mx = inp.mx, mz = inp.mz; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const fx = -s, fz = -c, rx = c, rz = -s; // forward (-z at yaw 0) and right
  const tx = (fx * mz + rx * mx) * P.speed, tz = (fz * mz + rz * mx) * P.speed;
  const acc = p.ground ? 14 : 4.5;
  if (!(p.boostT > 0)) { p.vx += (tx - p.vx) * Math.min(1, acc * dt); p.vz += (tz - p.vz) * Math.min(1, acc * dt); }
  if (p.boostT > 0) { p.boostT -= dt; }
  // jump buffering + coyote time
  p.gT = p.ground ? 0 : p.gT + dt; if (inp.jump) p.bufT = P.buffer; else p.bufT -= dt;
  if (p.bufT > 0 && p.gT < P.coyote && p.vy <= 0.5) {
    p.vy = P.jumpV; p.ground = false; p.gT = 1; p.bufT = 0; p.jumps++; ev.push({ e: 'jump' });
    // inherit the moving platform's momentum so jumps off it feel right
    if (p.on && p.on.type === 'move') { const a0 = platPos(p.on, t - 0.02), a1 = platPos(p.on, t); p.pvx = (a1.x - a0.x) / 0.02; p.pvz = (a1.z - a0.z) / 0.02; }
  }
  if (!p.ground && p.pvx) { p.x += p.pvx * dt; p.z += p.pvz * dt; } else if (p.ground) { p.pvx = p.pvz = 0; }
  if (!inp.jumpHeld && p.vy > 3 && !(p.boostT > 0)) p.vy -= P.grav * dt * 0.9; // short hop when released early
  p.vy -= P.grav * dt;
  // integrate with axis-separated collision
  const move = (axis, d) => {
    if (axis === 'x') p.x += d; else if (axis === 'z') p.z += d; else p.y += d;
    for (const pl of lvl.plats) {
      if (!solid(p, pl, t)) continue; const pos = platPos(pl, t); if (!overlaps(p.x, p.y, p.z, pl, pos)) continue;
      if (axis === 'y') { if (d < 0) { p.y = pos.y; p.vy = 0; landed(pl); } else { p.y = pos.y - pl.th - P.h; p.vy = 0; } }
      else if (p.y > pos.y - 0.45) { p.y = pos.y; } // step up small ledges
      else { if (axis === 'x') p.x = d > 0 ? pos.x - pl.w / 2 - P.r - 1e-4 : pos.x + pl.w / 2 + P.r + 1e-4; else p.z = d > 0 ? pos.z - pl.d / 2 - P.r - 1e-4 : pos.z + pl.d / 2 + P.r + 1e-4; if (axis === 'x') p.vx = 0; else p.vz = 0; }
    }
  };
  let landedOn = null; const landed = (pl) => { landedOn = pl; };
  const wasGround = p.ground;
  move('x', p.vx * dt); move('z', p.vz * dt); move('y', p.vy * dt);
  p.ground = !!landedOn;
  if (p.ground) {
    const pl = landedOn; if (!wasGround) ev.push({ e: 'land', id: pl.id }); p.on = pl;
    if (pl.type === 'bounce') { p.vy = P.bounceV; p.ground = false; ev.push({ e: 'bounce', id: pl.id }); }
    if (pl.type === 'boost' && !(p.boostT > 0) && pl.tx != null) {
      // launch cannon: a ballistic arc from where you stand to the center of the target platform
      const T = 1.0, dy = pl.ty - p.y; p.vx = (pl.tx - p.x) / T; p.vz = (pl.tz - p.z) / T; p.vy = (dy + 0.5 * P.grav * T * T) / T;
      p.ground = false; p.boostT = T; p.gT = 1; ev.push({ e: 'boost' });
    }
    if (pl.type === 'crumble' && !p.crumble[pl.id]) { p.crumble[pl.id] = { k: 0, gone: false }; ev.push({ e: 'crumbling', id: pl.id }); }
    if (pl.cp && p.cp !== pl.id) { p.cp = pl.id; ev.push({ e: 'checkpoint', id: pl.id }); }
    if (pl.type === 'exit' && !p.done) { p.done = true; ev.push({ e: 'exit' }); }
  } else if (p.gT > 0.2) p.on = null;
  // shards
  for (const sh of lvl.shards) { if (p.shards.includes(sh.plat)) continue; if (Math.hypot(p.x - sh.x, p.y + 0.9 - sh.y, p.z - sh.z) < 1.3) { p.shards.push(sh.plat); ev.push({ e: 'shard', id: sh.plat }); } }
  // lasers
  for (const ls of lvl.lasers) { if (ls.dim !== p.dim) continue; const L = laserPos(ls, lvl, t); const d = L.along === 'z' ? Math.abs(p.x - L.x) : Math.abs(p.z - L.z); const inSpan = L.along === 'z' ? Math.abs(p.z - L.z) < L.len / 2 : Math.abs(p.x - L.x) < L.len / 2; if (d < P.r + 0.08 && inSpan && p.y < L.y + 0.1 && p.y + P.h > L.y - 0.1) { ev.push({ e: 'zapped' }); respawn(p, lvl); return ev; } }
  // falling
  if (p.y < lowest(lvl) + PHYS.fallY) { ev.push({ e: 'fell' }); respawn(p, lvl); }
  return ev;
}
function lowest(lvl) { if (lvl._low == null) lvl._low = Math.min(...lvl.plats.map(p => p.y)); return lvl._low; }
export function respawn(p, lvl) { if (lvl.probe) return; p.pvx = p.pvz = 0; p.boostT = 0; p.bufT = 0; p.gT = 0; const cp = lvl.plats[p.cp] && lvl.plats[p.cp].id === p.cp ? lvl.plats[p.cp] : lvl.plats.find(q => q.id === p.cp); const pos = platPos(cp, p.t); p.x = pos.x; p.y = pos.y; p.z = pos.z; p.vx = p.vz = p.vy = 0; p.ground = true; p.on = cp; p.deaths = (p.deaths || 0) + 1; if (cp.dim !== 2) p.dim = cp.dim; else if (!canShift(p, lvl, p.dim)) p.dim = 1 - p.dim; }
export function stars(p, lvl, time) { let s = 1; if (p.shards.length >= lvl.shards.length) s++; if (time <= lvl.L.par) s++; return s; }
