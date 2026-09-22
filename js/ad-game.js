/* ANOTHER DIMENSION — renderer, effects, input, VR, audio and UI. Three.js r160. */
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WORLDS, LEVELS, PHYS, buildLevel, newPlayer, step, shift, platPos, laserPos, respawn, stars, autopilot } from './ad-core.js';

const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOW = IS_TOUCH || (navigator.hardwareConcurrency || 8) <= 4;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- save ---------------- */
const SAVE = { stars: {}, best: {}, unlocked: 1, sens: 1, sound: true, music: true };
try { Object.assign(SAVE, JSON.parse(localStorage.getItem('ad-save-v1') || '{}')); } catch (e) { }
const save = () => { try { localStorage.setItem('ad-save-v1', JSON.stringify(SAVE)); } catch (e) { } };

/* ---------------- audio: fully synthesized ---------------- */
const Audio = {
  ctx: null,
  init() { if (this.ctx) { this.ctx.state === 'suspended' && this.ctx.resume(); return; } const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.gain.value = SAVE.sound ? 0.55 : 0; this.out.connect(this.ctx.destination); this.mus = this.ctx.createGain(); this.mus.gain.value = SAVE.music ? 0.16 : 0; this.mus.connect(this.out); const n = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = n; const conv = this.ctx.createConvolver(); const ir = this.ctx.createBuffer(2, this.ctx.sampleRate * 2.2, this.ctx.sampleRate); for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3); } conv.buffer = ir; this.verb = this.ctx.createGain(); this.verb.gain.value = 0.35; this.verb.connect(conv); conv.connect(this.out); },
  tone(f, d = 0.2, type = 'sine', v = 0.2, slide = 0, delay = 0, verb = true) { if (!this.ctx) return; const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(this.out); if (verb) g.connect(this.verb); o.start(t); o.stop(t + d + 0.05); },
  sweep(up) { if (!this.ctx) return; const t = this.ctx.currentTime, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = 6; f.frequency.setValueAtTime(up ? 300 : 3000, t); f.frequency.exponentialRampToValueAtTime(up ? 3200 : 260, t + 0.35); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); s.connect(f); f.connect(g); g.connect(this.out); g.connect(this.verb); s.start(t); s.stop(t + 0.5); this.tone(up ? 440 : 660, 0.4, 'sine', 0.12, up ? 440 : -330); },
  jump() { this.tone(260, 0.16, 'triangle', 0.1, 180, 0, false); }, land() { this.tone(90, 0.12, 'sine', 0.18, -40, 0, false); },
  bounce() { this.tone(180, 0.5, 'sine', 0.22, 600); }, boom() { this.tone(70, 0.7, 'sine', 0.35, -30); this.sweep(true); },
  crack() { if (!this.ctx) return; for (let i = 0; i < 4; i++) this.tone(900 + Math.random() * 600, 0.05, 'square', 0.04, -400, i * 0.05, false); },
  shard() { [0, 7, 12, 16, 19].forEach((n, i) => this.tone(659 * Math.pow(2, n / 12), 0.5, 'sine', 0.1, 0, i * 0.06)); },
  cp() { [0, 4, 7].forEach((n, i) => this.tone(392 * Math.pow(2, n / 12), 0.6, 'triangle', 0.1, 0, i * 0.08)); },
  zap() { this.tone(120, 0.4, 'sawtooth', 0.14, -60); }, blocked() { this.tone(140, 0.12, 'square', 0.08); this.tone(120, 0.12, 'square', 0.08, 0, 0.12); },
  win() { [0, 4, 7, 11, 12, 16, 19, 24].forEach((n, i) => this.tone(261.6 * Math.pow(2, n / 12), 0.9, 'sine', 0.11, 0, i * 0.1)); },
  ui() { this.tone(720, 0.06, 'sine', 0.06, 0, 0, false); },
  music(w) {
    this.stopMusic(); if (!this.ctx) return; const [root, sc] = w.music; let k = 0;
    const pads = [0, 2, 4].map(i => { const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = root / 2 * Math.pow(2, sc[i] / 12); f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0.12; o.connect(f); f.connect(g); g.connect(this.mus); o.start(); return o; }); this.pads = pads;
    this.timer = setInterval(() => { if (!this.ctx || !SAVE.music) return; const n = sc[(k * 2 + (k >> 3)) % sc.length] + (k % 16 < 8 ? 12 : 24); const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'triangle'; o.frequency.value = root * Math.pow(2, n / 12); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3); o.connect(g); g.connect(this.mus); g.connect(this.verb); o.start(t); o.stop(t + 1.4); k++; }, 360);
  },
  stopMusic() { clearInterval(this.timer); (this.pads || []).forEach(o => { try { o.stop(); } catch (e) { } }); this.pads = []; },
  set(s, m) { SAVE.sound = s; SAVE.music = m; save(); if (this.out) this.out.gain.value = s ? 0.55 : 0; if (this.mus) this.mus.gain.value = m ? 0.16 : 0; }
};

/* ---------------- shared GLSL ---------------- */
const NOISE = `float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f); return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0., w=.5; for(int i=0;i<5;i++){ a+=w*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); w*=.5; } return a; }`;

/* four reality skies in one shader */
function makeSky(world) {
  const u = { uT: { value: 0 }, mode: { value: world.sky }, phase: { value: 0 }, cA: { value: new THREE.Color(world.a) }, cB: { value: new THREE.Color(world.b) }, fogC: { value: new THREE.Color(world.fog) } };
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
    fragmentShader: `uniform float uT, mode, phase; uniform vec3 cA, cB, fogC; varying vec3 vD; ${NOISE}
      vec3 hue(float h){ return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
      void main(){
        vec3 d = normalize(vD); float y = d.y; vec3 accent = mix(cA, cB, phase); vec3 c;
        if (mode < .5) {            // PRISM VOID: aurora ribbons over deep violet
          c = mix(vec3(.03,.02,.10), vec3(.16,.08,.32), smoothstep(-.4,.6,y));
          for (int i=0;i<3;i++){ float fi=float(i); float w = fbm(vec3(d.x*1.6+fi*3., d.z*1.6, uT*.03+fi)); float band = smoothstep(.06,0., abs(y - .25 - fi*.18 + (w-.5)*.5)); c += hue(fract(w*.8 + fi*.23 + uT*.01 + phase*.4))*band*(.7-fi*.15); }
          vec3 sp = floor(d*380.); float s = step(.997, h3(sp)); c += vec3(s)*smoothstep(-.1,.4,y)*(.6+.4*sin(uT+h3(sp)*30.));
          c += accent*.15*pow(max(0.,1.-abs(y)),6.);
        } else if (mode < 1.5) {    // INK REALM: parchment, ink clouds, red sun
          vec3 paper = vec3(.93,.89,.80); float grain = fbm(d*60.)*.08; c = paper - grain;
          float cl = fbm(vec3(d.x*2.2, d.y*4., d.z*2.2) + vec3(uT*.01,0.,0.)); float ink = smoothstep(.55,.62, cl) * smoothstep(-.3,.35,y);
          c = mix(c, vec3(.08,.08,.1), ink*.85); float wash = smoothstep(.45,.6,cl)*(1.-ink); c = mix(c, vec3(.55,.52,.48), wash*.35);
          float sd = length(d - normalize(vec3(.35,.28,-.9))); c = mix(c, mix(vec3(.85,.1,.12), accent, phase*.3), smoothstep(.16,.145, sd));
          c = mix(c, vec3(.2,.18,.17), smoothstep(-.05,-.5,y)*.6);
          float mtn = fbm(vec3(atan(d.z,d.x)*3.,0.,0.))*.18 - .05; c = mix(c, vec3(.18,.17,.18), smoothstep(mtn+.005, mtn, y)*.9);
        } else if (mode < 2.5) {    // LIQUID CHROME: endless sunset with a striped sun
          c = mix(vec3(1.,.55,.35), vec3(.25,.12,.45), smoothstep(-.05,.6,y)); c = mix(c, vec3(.05,.02,.12), smoothstep(.55,1.,y));
          c = mix(c, vec3(.35,.12,.3), smoothstep(0.,-.4,y));
          vec3 sd3 = d - normalize(vec3(0.,.12,-1.)); float sr = length(sd3.xy*vec2(1.,1.)); float sun = smoothstep(.3,.29, length(vec2(d.x, (d.y-.12)*1.)) ) * step(0., d.z*-1.);
          float stripes = step(.5, fract((d.y-.12)*38.)) + step(.2, d.y);
          c = mix(c, mix(vec3(1.,.85,.35), vec3(1.,.3,.5), smoothstep(.4,.0,d.y)), sun*clamp(stripes,0.,1.));
          float cl = fbm(vec3(d.x*3., d.y*9., d.z*3.)+uT*.01); c = mix(c, vec3(.95,.5,.6), smoothstep(.6,.75,cl)*smoothstep(0.,.3,y)*.5);
          c += accent*.08;
        } else {                    // FRACTAL CORE: a folding kaleidoscope
          vec2 p = vec2(atan(d.z, d.x), acos(clamp(d.y,-1.,1.))); float a = p.x; float seg = 6.28318/8.; a = mod(a, seg); a = abs(a - seg*.5);
          vec2 q = vec2(cos(a), sin(a)) * (p.y*2.2); float t = uT*.05;
          for (int i=0;i<5;i++){ q = abs(q)/dot(q,q) - vec2(.92 + .05*sin(t), .6 + .08*phase); }
          float v = length(q); c = hue(fract(v*.08 + t*.2 + phase*.5)) * (.35 + .65*smoothstep(.2,2.5,v)) * .9;
          c = mix(c, vec3(.02,.0,.05), .35) + accent*.1;
        }
        gl_FragColor = vec4(c, 1.);
      }`
  })); m.frustumCulled = false; m.userData.u = u; return m;
}

/* the reality-dissolve: platforms melt in and out along a noise edge that glows */
function dissolve(mat, edgeColor) {
  const U = { uVis: { value: 1 }, uEdge: { value: new THREE.Color(edgeColor) }, uT: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 dw = vec4(transformed,1.);\n#ifdef USE_INSTANCING\ndw = instanceMatrix*dw;\n#endif\nvDW = (modelMatrix*dw).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vDW; uniform float uVis, uT; uniform vec3 uEdge;\n${NOISE}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat dn = fbm(vDW*.9 + vec3(0., uT*.2, 0.)); if (dn > uVis*1.08) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uEdge * 3. * smoothstep(uVis*1.08 - .09, uVis*1.08, dn) * step(uVis, .999);');
  };
  mat.userData.U = U; mat.customProgramCacheKey = () => 'dissolve';
  return mat;
}

/* ---------------- post: chromatic ripple + grade + vignette ---------------- */
const DimShader = {
  uniforms: { tDiffuse: { value: null }, uShift: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uAspect: { value: 1 }, uVig: { value: 0.35 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uShift, uAspect, uVig; uniform vec3 uTint; varying vec2 vUv;
    void main(){ vec2 c = vUv - .5; c.x *= uAspect; float r = length(c);
      float wave = sin(r*28. - uShift*9.)*.012*uShift*smoothstep(.9,.0,r);
      vec2 dir = normalize(c + 1e-5); vec2 uv = vUv + dir*wave; float ca = .0025 + .012*uShift;
      vec3 col = vec3(texture2D(tDiffuse, uv + dir*ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir*ca).b);
      col *= mix(vec3(1.), uTint, .12); col *= 1. - uVig*smoothstep(.45, 1.1, r);
      gl_FragColor = vec4(col, 1.); }`
};

/* ---------------- the 4D tesseract (used in SVG title + 3D hub) ---------------- */
const TV = []; for (let i = 0; i < 16; i++) TV.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
const TE = []; for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) { let d = 0; for (let k = 0; k < 4; k++) if (TV[i][k] !== TV[j][k]) d++; if (d === 1) TE.push([i, j]); }
function tesseract(t) {
  const a = t * 0.5, b = t * 0.31, c = t * 0.23; const out = [];
  for (const v of TV) {
    let [x, y, z, w] = v; let x1 = x * Math.cos(a) - w * Math.sin(a), w1 = x * Math.sin(a) + w * Math.cos(a); x = x1; w = w1;
    let z1 = z * Math.cos(b) - w * Math.sin(b), w2 = z * Math.sin(b) + w * Math.cos(b); z = z1; w = w2;
    let y1 = y * Math.cos(c) - z * Math.sin(c), z2 = y * Math.sin(c) + z * Math.cos(c); y = y1; z = z2;
    const k = 2.2 / (3 - w); out.push([x * k, y * k, z * k, w]);
  }
  return out;
}

/* ================================================================== */
export class Game {
  constructor() {
    this.t = 0; this.mode = 'title'; this.lvl = null; this.p = null; this.yaw = 0; this.pitch = 0; this.keys = new Set(); this.edge = new Set(); this.look = { dx: 0, dy: 0 }; this.joy = { x: 0, y: 0, id: null }; this.btn = new Set(); this.shiftK = 0; this.time = 0; this.inVR = false; this.world = WORLDS[0];
    const R = this.R = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
    R.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.5 : 2)); R.setSize(innerWidth, innerHeight); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.xr.enabled = true;
    $('#stage').appendChild(R.domElement);
    this.cam = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 2000); this.rig = new THREE.Group(); this.rig.add(this.cam);
    this.ui(); this.inputs(); this.vr();
    addEventListener('resize', () => this.resize());
    this.loadLevel(0, true);
    R.setAnimationLoop(() => this.loop());
    this.svgTitle();
  }
  /* ---------- level build ---------- */
  loadLevel(n, demo = false) {
    if (this.scene) this.disposeScene();
    const L = LEVELS[n], W = WORLDS[L.world], lvl = buildLevel(L); this.L = L; this.W = this.world = W; this.lvl = lvl; this.demo = demo;
    const sc = this.scene = new THREE.Scene(); sc.fog = new THREE.FogExp2(new THREE.Color(W.fog), W.fogD);
    this.sky = makeSky(W); sc.add(this.sky);
    // environment reflections from the sky itself (makes chrome and glass come alive)
    const es = new THREE.Scene(); const sk2 = makeSky(W); es.add(sk2); const pm = new THREE.PMREMGenerator(this.R); this.envRT = pm.fromScene(es, 0.03); sc.environment = this.envRT.texture; pm.dispose(); sk2.geometry.dispose(); sk2.material.dispose();
    sc.add(new THREE.HemisphereLight(new THREE.Color(W.a).lerp(new THREE.Color(0xffffff), 0.6), new THREE.Color(W.b).multiplyScalar(0.4), 0.9));
    const sun = this.sun = new THREE.DirectionalLight(new THREE.Color(W.light), 2.4); sun.castShadow = true; const ss = LOW ? 1024 : 2048; sun.shadow.mapSize.set(ss, ss); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 220 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sc.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(new THREE.Color(W.b), 0.8); rim.position.set(-40, 20, 30); sc.add(rim);
    // materials per reality: A, B and BOTH
    const mk = (col, edge) => {
      let m; const M = W.mat;
      if (W.key === 'prism' && !LOW) m = new THREE.MeshPhysicalMaterial({ color: col, roughness: M.rough, metalness: 0, transmission: 0.82, thickness: 1.2, ior: 1.45, iridescence: 1, iridescenceIOR: 1.35, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4, emissive: col, emissiveIntensity: 0.08 });
      else if (W.key === 'ink') m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, metalness: 0, emissive: col, emissiveIntensity: col === W.a ? 0.25 : 0 });
      else m = new THREE.MeshStandardMaterial({ color: col, roughness: M.rough, metalness: M.metal, envMapIntensity: 1.6, emissive: col, emissiveIntensity: W.key === 'fractal' ? 0.12 : 0.04 });
      return dissolve(m, edge);
    };
    this.mats = [mk(new THREE.Color(W.a), W.a), mk(new THREE.Color(W.b), W.key === 'ink' ? '#ff2d3c' : W.b), mk(new THREE.Color(W.both), W.a)];
    this.lineMats = [W.a, W.key === 'ink' ? '#111111' : W.b, W.key === 'ink' ? '#111111' : '#ffffff'].map(c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false }));
    // platforms
    this.meshes = [];
    for (const pl of lvl.plats) {
      const g = new THREE.Group(); const geo = new RoundedBoxGeometry(pl.w, pl.th, pl.d, 2, Math.min(0.18, pl.th * 0.3)); geo.translate(0, -pl.th / 2, 0);
      const mesh = new THREE.Mesh(geo, this.mats[pl.dim]); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(pl.w + 0.02, pl.th + 0.02, pl.d + 0.02).translate(0, -pl.th / 2, 0)), this.lineMats[pl.dim]); g.add(edges);
      this.decorate(pl, g); g.position.set(pl.x, pl.y, pl.z); sc.add(g); this.meshes[pl.id] = g; g.userData = { mesh, edges };
    }
    // lasers
    this.laserMeshes = lvl.lasers.map(ls => { const col = new THREE.Color(ls.dim === 0 ? W.a : (W.key === 'ink' ? '#ff2d3c' : W.b)); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 10), new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })); m.add(glow); sc.add(m); return m; });
    // shards
    this.shardMeshes = lvl.shards.map(s => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(W.a).lerp(new THREE.Color(W.b), 0.5), emissiveIntensity: 2.2, metalness: 0.4, roughness: 0.1 })); g.add(m); g.add(this.glow(new THREE.Color(W.a).lerp(new THREE.Color(W.b), 0.5), 3, 0.6)); g.position.set(s.x, s.y, s.z); sc.add(g); return g; });
    // decor: giant floating sculptures
    this.buildDecor(); this.particles(); this.shadowRing();
    // ghost runner (for the demo)
    this.ghost = this.makeGhost(); sc.add(this.ghost);
    this.p = newPlayer(lvl); this.time = 0; this.yaw = Math.atan2(-(lvl.plats[lvl.path[1]].x - lvl.start.x), -(lvl.plats[lvl.path[1]].z - lvl.start.z)); this.pitch = -0.12; this.pathI = 0; this.shiftK = 0;
    this.cam.position.set(0, 0, 0); this.cam.rotation.set(0, 0, 0); sc.add(this.rig);
    this.composer = new EffectComposer(this.R); this.composer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5)); this.composer.setSize(innerWidth, innerHeight); this.composer.addPass(new RenderPass(sc, this.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), W.key === 'ink' ? 0.35 : 0.9, 0.55, W.key === 'ink' ? 0.85 : 0.35); this.composer.addPass(this.bloom);
    this.dim = new ShaderPass(DimShader); this.dim.uniforms.uAspect.value = innerWidth / innerHeight; this.composer.addPass(this.dim); this.composer.addPass(new OutputPass());
    this.applyPhase(true);
    if (!demo) { Audio.music(W); this.hud(true); }
  }
  decorate(pl, g) {
    const W = this.W, col = new THREE.Color(pl.dim === 1 ? W.b : W.a);
    if (pl.type === 'bounce') { for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(Math.min(pl.w, pl.d) * 0.32 - i * 0.18, 0.05, 8, 48), new THREE.MeshBasicMaterial({ color: col })); r.rotation.x = Math.PI / 2; r.position.y = 0.06 + i * 0.25; g.add(r); } g.userData.bounceRings = true; }
    if (pl.type === 'boost') { const arrowS = new THREE.Shape(); arrowS.moveTo(-0.5, -0.4); arrowS.lineTo(0, 0.45); arrowS.lineTo(0.5, -0.4); arrowS.lineTo(0, -0.1); arrowS.closePath(); const ag = new THREE.ShapeGeometry(arrowS); for (let i = 0; i < 3; i++) { const a = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide, transparent: true })); a.rotation.x = -Math.PI / 2; a.position.set(0, 0.04, 0.6 - i * 0.6); const hold = new THREE.Group(); hold.add(a); if (pl.tx != null) hold.rotation.y = Math.atan2(pl.tx - pl.x, pl.tz - pl.z) + Math.PI; g.add(hold); } g.add(this.glow(0xffd23f, 3, 0.4)); }
    if (pl.type === 'exit') { const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.16, 16, 96), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 })); ring.position.y = 2.6; g.add(ring); const disc = new THREE.Mesh(new THREE.CircleGeometry(2.05, 64), new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, a: { value: new THREE.Color(W.a) }, b: { value: new THREE.Color(W.b) } }, transparent: true, side: THREE.DoubleSide, depthWrite: false, vertexShader: 'varying vec2 vU; void main(){ vU = uv - .5; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform float uT; uniform vec3 a, b; varying vec2 vU; void main(){ float r = length(vU)*2.; float an = atan(vU.y, vU.x); float s = sin(an*5. + r*14. - uT*2.5)*.5+.5; vec3 c = mix(a, b, s)*(1.6 - r); gl_FragColor = vec4(c + vec3(1.)*pow(1.-r,4.), (1.-r*r)*.9); }' })); disc.position.y = 2.6; g.add(disc); this.exitDisc = disc; this.exitRing = ring; g.add(this.glow(new THREE.Color(W.a), 14, 0.5)); const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 2.4, 400, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(W.a), transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); beam.position.y = 200; g.add(beam); }
    if (pl.cp) { const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })); pil.position.set(pl.w / 2 - 0.4, 1.5, pl.d / 2 - 0.4); g.add(pil); const orb = this.glow(new THREE.Color(W.a), 2.2, 0.8); orb.position.copy(pil.position).setY(3.1); g.add(orb); g.userData.cpOrb = orb; }
    if (pl.type === 'move') { g.add(this.glow(col, Math.max(pl.w, pl.d) * 1.4, 0.18)); }
  }
  glow(color, size, op) { if (!this._gt) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); this._gt = new THREE.CanvasTexture(c); } const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._gt, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.setScalar(size); return s; }
  buildDecor() {
    const W = this.W, geos = [new THREE.IcosahedronGeometry(1, 0), new THREE.TorusKnotGeometry(0.7, 0.22, 140, 16), new THREE.TorusGeometry(0.9, 0.12, 12, 80), new THREE.OctahedronGeometry(1, 0), new THREE.SphereGeometry(1, 48, 32)];
    let mat;
    if (W.key === 'prism') mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transmission: LOW ? 0 : 0.9, thickness: 3, iridescence: 1, envMapIntensity: 1.5, transparent: LOW, opacity: LOW ? 0.5 : 1 });
    else if (W.key === 'ink') mat = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 1 });
    else if (W.key === 'chrome') mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.02, metalness: 1, envMapIntensity: 2 });
    else mat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.25, metalness: 1, emissive: 0x3a2400, envMapIntensity: 1.6 });
    this.decor = [];
    for (let k = 0; k < 5; k++) {
      const list = this.lvl.decor.filter(d => d.k === k); if (!list.length) continue; const im = new THREE.InstancedMesh(geos[k], mat, list.length); im.userData.list = list; this.scene.add(im); this.decor.push(im);
    }
    if (W.key === 'ink') { // brush-stroke "ink rain" ribbons
      for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3 + Math.random() * 0.8, 20 + Math.random() * 60), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); m.position.set((Math.random() - 0.5) * 300, -20 + Math.random() * 60, this.lvl.exit.z * Math.random() + (Math.random() - 0.5) * 200); m.rotation.y = Math.random() * 3; this.scene.add(m); }
    }
  }
  particles() {
    const N = LOW ? 700 : 1600, g = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), W = this.W;
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = (Math.random() - 0.5) * 40; pos[i * 3 + 2] = (Math.random() - 0.5) * 80; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const col = W.key === 'ink' ? 0x222222 : W.key === 'chrome' ? 0xffd6e0 : W.key === 'fractal' ? 0xffd23f : 0xbff6ff;
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: W.key === 'ink' ? 0.09 : 0.07, transparent: true, opacity: 0.75, blending: W.key === 'ink' ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false })); this.scene.add(this.motes);
    // burst particles
    const B = 600; this.burst = { n: B, i: 0, pos: new Float32Array(B * 3), vel: new Float32Array(B * 3), life: new Float32Array(B), col: new Float32Array(B * 3) };
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(this.burst.pos, 3)); bg.setAttribute('color', new THREE.BufferAttribute(this.burst.col, 3));
    this.burstPts = new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.burstPts.frustumCulled = false; this.scene.add(this.burstPts);
  }
  emit(x, y, z, n, color, speed = 4) { const b = this.burst, c = new THREE.Color(color); for (let k = 0; k < n; k++) { const i = b.i; b.i = (b.i + 1) % b.n; b.pos[i * 3] = x; b.pos[i * 3 + 1] = y; b.pos[i * 3 + 2] = z; const u = Math.random() * 6.28, v = Math.acos(Math.random() * 2 - 1), s = speed * (0.3 + Math.random()); b.vel[i * 3] = Math.sin(v) * Math.cos(u) * s; b.vel[i * 3 + 1] = Math.cos(v) * s; b.vel[i * 3 + 2] = Math.sin(v) * Math.sin(u) * s; b.life[i] = 1; b.col[i * 3] = c.r; b.col[i * 3 + 1] = c.g; b.col[i * 3 + 2] = c.b; } }
  shadowRing() { const m = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.34, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })); m.rotation.x = -Math.PI / 2; this.ring = m; this.scene.add(m); const dot = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); dot.rotation.x = -Math.PI / 2; this.dot = dot; this.scene.add(dot); }
  makeGhost() { const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(this.W.a), emissiveIntensity: 1.2, transparent: true, opacity: 0.85, roughness: 0.3 }); const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 6, 16), m); body.position.y = 0.85; const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), m); head.position.y = 1.55; g.add(body, head, this.glow(new THREE.Color(this.W.a), 3, 0.5)); g.children[2].position.y = 1; g.userData.m = m; return g; }
  disposeScene() { this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } }); if (this.envRT) this.envRT.dispose(); this.composer && this.composer.dispose(); }
  /* ---------- reality phase visuals ---------- */
  applyPhase(instant) { const d = this.p.dim; this.targetVis = [d === 0 ? 1 : 0, d === 1 ? 1 : 0, 1]; if (instant) this.vis = this.targetVis.slice(); }
  doShift(d) {
    const was = this.p.dim; if (!shift(this.p, this.lvl, d)) { Audio.blocked(); this.flashHint('Blocked! Something from the other side is in the way.'); return; }
    if (this.p.dim === was) return; Audio.sweep(this.p.dim === 1); this.applyPhase(); this.shiftK = 1;
    const e = this.eye(); this.emit(e.x, e.y - 0.6, e.z, 60, this.p.dim ? this.W.b : this.W.a, 5); this.hudPhase();
  }
  eye() { return new THREE.Vector3(this.p.x, this.p.y + PHYS.eye, this.p.z); }
  /* ---------- input ---------- */
  inputs() {
    const cv = this.R.domElement;
    addEventListener('keydown', e => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) return; const k = e.key.toLowerCase(); if (!this.keys.has(k)) this.edge.add(k); this.keys.add(k); if (this.mode === 'play' && [' ', 'arrowup', 'arrowdown', 'tab'].includes(k)) e.preventDefault(); if (k === 'escape' && this.mode === 'play') this.pause(); Audio.init(); });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.btn.clear(); });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => { Audio.init(); if (this.mode !== 'play') return; if (!IS_TOUCH && document.pointerLockElement !== cv) cv.requestPointerLock && cv.requestPointerLock(); else if (e.button === 2 || e.button === 0) this.edge.add(e.button === 2 ? 'rmb' : 'lmb'); });
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && this.mode === 'play' && !IS_TOUCH) this.pause(); });
    addEventListener('mousemove', e => { if (document.pointerLockElement === cv) { this.look.dx += e.movementX; this.look.dy += e.movementY; } });
    const pts = new Map();
    cv.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
    cv.addEventListener('pointermove', e => { const q = pts.get(e.pointerId); if (!q) return; this.look.dx += (e.clientX - q.x) * 1.4; this.look.dy += (e.clientY - q.y) * 1.4; q.x = e.clientX; q.y = e.clientY; });
    const up = e => pts.delete(e.pointerId); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const joy = $('#joy'), knob = $('#joy-k');
    const setJ = e => { const r = joy.getBoundingClientRect(), R0 = r.width / 2; let x = (e.clientX - r.left - R0) / R0, y = (e.clientY - r.top - R0) / R0; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } this.joy.x = x; this.joy.y = y; knob.style.transform = `translate(${x * R0 * 0.5}px,${y * R0 * 0.5}px)`; };
    joy.addEventListener('pointerdown', e => { e.preventDefault(); Audio.init(); joy.setPointerCapture(e.pointerId); this.joy.id = e.pointerId; setJ(e); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === this.joy.id) setJ(e); });
    const je = e => { if (e.pointerId === this.joy.id) { this.joy = { x: 0, y: 0, id: null }; knob.style.transform = ''; } }; joy.addEventListener('pointerup', je); joy.addEventListener('pointercancel', je);
    document.querySelectorAll('.tb').forEach(b => { const k = b.dataset.k; b.addEventListener('pointerdown', e => { e.preventDefault(); Audio.init(); b.setPointerCapture(e.pointerId); this.edge.add('b:' + k); this.btn.add(k); b.classList.add('on'); }); const off = () => { this.btn.delete(k); b.classList.remove('on'); }; b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); });
  }
  readInput() {
    const k = this.keys, e = this.edge, s = SAVE.sens || 1;
    this.yaw -= this.look.dx * 0.0022 * s; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - this.look.dy * 0.0022 * s)); this.look.dx = this.look.dy = 0;
    let mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0), mz = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    if (this.joy.id !== null) { mx = this.joy.x; mz = -this.joy.y; }
    const out = { mx, mz, yaw: this.yaw, jump: e.has(' ') || e.has('b:jump') || e.has('lmb'), jumpHeld: k.has(' ') || this.btn.has('jump') || true, shiftPress: e.has('e') || e.has('shift') || e.has('q') || e.has('b:shift') || e.has('rmb') || e.has('tab') };
    if (this.xr) { out.mx = this.xr.mx; out.mz = this.xr.mz; out.jump = out.jump || this.xr.jump; out.shiftPress = out.shiftPress || this.xr.shift; out.yaw = this.xr.yaw; }
    this.edge.clear(); return out;
  }
  /* ---------- WebXR ---------- */
  vr() {
    const b = VRButton.createButton(this.R); b.id = 'vr-btn'; b.removeAttribute('style'); $('#vr-slot').appendChild(b); new MutationObserver(() => b.removeAttribute('style')).observe(b, { attributes: true, attributeFilter: ['style'] });
    this.ctrl = [0, 1].map(i => { const c = this.R.xr.getController(i); c.addEventListener('selectstart', () => { this.xrShift = true; }); this.rig.add(c); const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -0.4)]), new THREE.LineBasicMaterial({ color: 0xffffff })); c.add(ln); return c; });
    this.R.xr.addEventListener('sessionstart', () => { this.inVR = true; Audio.init(); document.body.classList.add('in-vr'); if (this.mode !== 'play') this.play(Math.min(SAVE.unlocked - 1, 19)); });
    this.R.xr.addEventListener('sessionend', () => { this.inVR = false; this.xr = null; document.body.classList.remove('in-vr'); this.cam.position.set(0, 0, 0); });
  }
  readXR() {
    const s = this.R.xr.getSession(); if (!s) { this.xr = null; return; } const o = { mx: 0, mz: 0, jump: false, shift: !!this.xrShift, yaw: 0 }; this.xrShift = false; let turn = 0;
    for (const src of s.inputSources) { const gp = src.gamepad; if (!gp) continue; const ax = gp.axes, x = ax.length >= 4 ? ax[2] : ax[0] || 0, y = ax.length >= 4 ? ax[3] : ax[1] || 0;
      if (src.handedness === 'left') { o.mx = Math.abs(x) > 0.15 ? x : 0; o.mz = Math.abs(y) > 0.15 ? -y : 0; }
      else { if (Math.abs(x) > 0.6) turn = Math.sign(x); const a = gp.buttons[4] && gp.buttons[4].pressed; if (a && !this._a) o.jump = true; this._a = a; } }
    this.snap = (this.snap || 0) - 1 / 72; if (turn && this.snap <= 0) { this.rig.rotation.y -= turn * Math.PI / 6; this.snap = 0.3; }
    const q = this.R.xr.getCamera().getWorldQuaternion(new THREE.Quaternion()); o.yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y; this.xr = o;
  }
  /* ---------- flow ---------- */
  play(n) { this.mode = 'play'; this.loadLevel(n); document.body.classList.add('playing'); this.hideAll(); $('#hud').hidden = false; $('#touch').hidden = !IS_TOUCH; if (!IS_TOUCH && !this.inVR) this.R.domElement.requestPointerLock && this.R.domElement.requestPointerLock(); this.banner(this.L); }
  pause() { if (this.mode !== 'play') return; this.mode = 'paused'; this.showPanel('pause'); }
  resume() { this.mode = 'play'; this.hideAll(); $('#hud').hidden = false; if (!IS_TOUCH) this.R.domElement.requestPointerLock && this.R.domElement.requestPointerLock(); }
  toTitle() { this.mode = 'title'; document.body.classList.remove('playing'); document.exitPointerLock && document.exitPointerLock(); Audio.stopMusic(); $('#hud').hidden = true; $('#touch').hidden = true; this.loadLevel(Math.max(0, Math.min(19, SAVE.unlocked - 1)) - (Math.max(0, Math.min(19, SAVE.unlocked - 1)) % 5), true); this.showPanel('title'); }
  finish() {
    const p = this.p, L = this.L, st = stars(p, this.lvl, this.time); this.mode = 'done'; document.exitPointerLock && document.exitPointerLock(); Audio.win();
    const prev = SAVE.stars[L.n] || 0; SAVE.stars[L.n] = Math.max(prev, st); if (!SAVE.best[L.n] || this.time < SAVE.best[L.n]) SAVE.best[L.n] = this.time; SAVE.unlocked = Math.max(SAVE.unlocked, L.n + 2); save();
    const e = this.eye(); for (let i = 0; i < 4; i++) this.emit(e.x, e.y, e.z, 80, [this.W.a, this.W.b, '#ffffff', '#ffd23f'][i], 8);
    const card = $('#done'); card.querySelector('.dn-k').textContent = `Level ${L.n + 1} · ${this.W.name}`; card.querySelector('.dn-t').textContent = L.n === 19 ? 'YOU FOUND THE WAY HOME' : L.name + ' cleared';
    card.querySelector('.dn-stars').innerHTML = [0, 1, 2].map(i => `<svg viewBox="0 0 100 100" class="st ${i < st ? 'on' : ''}" style="--d:${i * 0.25}s" aria-hidden="true"><path d="M50 6l12.6 28.2 30.7 3.3-23 20.6 6.5 30.2L50 72.8 23.2 88.3l6.5-30.2-23-20.6 30.7-3.3z" pathLength="100"/></svg>`).join('');
    card.querySelector('.dn-s').innerHTML = `Time <b>${fmt(this.time)}</b> (par ${fmt(L.par)}) · Shards <b>${p.shards.length}/${this.lvl.shards.length}</b> · Shifts <b>${p.shifts}</b> · Falls <b>${p.deaths || 0}</b>`;
    card.querySelector('#dn-next').hidden = L.n >= 19; this.showPanel('done');
    if (this.inVR && L.n < 19) setTimeout(() => this.inVR && this.play(L.n + 1), 5000);
  }
  /* ---------- per frame ---------- */
  loop() {
    const dt = Math.min(0.05, this.clockT ? (performance.now() - this.clockT) / 1000 : 0.016); this.clockT = performance.now(); this.t += dt; const t = this.t;
    if (this.inVR) this.readXR();
    const lvl = this.lvl, p = this.p, W = this.W;
    if (this.mode === 'play') {
      const inp = this.readInput(); if (inp.shiftPress) this.doShift(); this.time += dt;
      const ev = step(p, lvl, inp, dt); this.events(ev);
      if (p.done && this.mode === 'play') this.finish();
    } else if (this.demo) {
      // attract mode: the autopilot plays the level while the camera films it
      const path = lvl.path; const cur = lvl.plats[path[this.pathI]], nxt = lvl.plats[path[Math.min(this.pathI + 1, path.length - 1)]];
      const a = autopilot(p, lvl, cur, nxt); if (a.dim !== p.dim) { if (shift(p, lvl, a.dim)) { this.applyPhase(); this.shiftK = 0.6; } } const ev = step(p, lvl, a, dt);
      for (const e of ev) { if ((e.e === 'land' || e.e === 'bounce') && path.indexOf(e.id) > this.pathI) this.pathI = path.indexOf(e.id); if (e.e === 'fell' || e.e === 'zapped') { this.pathI = Math.max(0, path.indexOf(p.cp)); this.applyPhase(true); } }
      if (p.done || this.pathI >= path.length - 1) { this.p = newPlayer(lvl); this.pathI = 0; this.applyPhase(true); }
      if (this.mode === 'done' || this.mode === 'paused') { }
      this.readInput();
    }
    // reality dissolve easing
    for (let i = 0; i < 3; i++) { this.vis[i] += (this.targetVis[i] - this.vis[i]) * Math.min(1, dt * (REDUCED ? 30 : 7)); this.mats[i].userData.U.uVis.value = this.vis[i]; this.mats[i].userData.U.uT.value = t; this.lineMats[i].opacity = i === 2 ? 0.55 : 0.2 + this.vis[i] * 0.7; }
    this.sky.userData.u.uT.value = t; this.sky.userData.u.phase.value += ((p.dim === 1 ? 1 : 0) - this.sky.userData.u.phase.value) * Math.min(1, dt * 4);
    this.shiftK = Math.max(0, this.shiftK - dt * 1.6); if (this.dim) { this.dim.uniforms.uShift.value = REDUCED ? 0 : this.shiftK; this.dim.uniforms.uTint.value.set(p.dim ? W.b : W.a); }
    // moving + crumbling platforms
    for (const pl of lvl.plats) { const g = this.meshes[pl.id]; if (!g) continue;
      if (pl.type === 'move') { const q = platPos(pl, p.t); g.position.set(q.x, q.y, q.z); }
      const c = p.crumble[pl.id]; if (pl.type === 'crumble') { if (c && !c.gone) { g.position.x = pl.x + (Math.random() - 0.5) * 0.06 * c.k; g.visible = true; } else if (c && c.gone) { if (g.visible) this.emit(pl.x, pl.y, pl.z, 50, pl.dim === 1 ? W.b : W.a, 3); g.visible = false; } else { g.visible = true; g.position.x = pl.x; } }
      if (g.userData.cpOrb) g.userData.cpOrb.material.opacity = p.cp === pl.id ? 0.95 : 0.35;
    }
    lvl.lasers.forEach((ls, i) => { const L = laserPos(ls, lvl, p.t), m = this.laserMeshes[i]; m.position.set(L.x, L.y, L.z); m.scale.set(1, L.len, 1); m.rotation.set(L.along === 'z' ? Math.PI / 2 : 0, 0, L.along === 'x' ? Math.PI / 2 : 0); const live = ls.dim === p.dim; m.material.opacity = live ? 1 : 0.12; m.children[0].material.opacity = live ? 0.35 : 0.04; });
    this.shardMeshes.forEach((m, i) => { m.visible = !p.shards.includes(lvl.shards[i].plat); m.rotation.y = t * 1.6; m.position.y = lvl.shards[i].y + Math.sin(t * 2 + i) * 0.15; });
    if (this.exitDisc) { this.exitDisc.material.uniforms.uT.value = t; this.exitRing.rotation.z = t * 0.4; }
    this.decor.forEach(im => { const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); im.userData.list.forEach((d, i) => { e.set(t * d.spin, t * d.spin * 1.3, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(d.x, d.y + Math.sin(t * 0.2 + i) * 2, d.z), q, new THREE.Vector3(d.s, d.s, d.s)); im.setMatrixAt(i, m4); }); im.instanceMatrix.needsUpdate = true; });
    // particles
    const b = this.burst; for (let i = 0; i < b.n; i++) { if (b.life[i] <= 0) { b.pos[i * 3 + 1] = -9999; continue; } b.life[i] -= dt * 0.9; b.vel[i * 3 + 1] -= dt * 3; for (let k = 0; k < 3; k++) { b.pos[i * 3 + k] += b.vel[i * 3 + k] * dt; b.vel[i * 3 + k] *= 1 - dt * 1.5; } const f = Math.max(0, b.life[i]); b.col[i * 3] *= 0.995; b.col[i * 3 + 1] *= 0.995; b.col[i * 3 + 2] *= 0.995; void f; }
    this.burstPts.geometry.attributes.position.needsUpdate = true; this.burstPts.geometry.attributes.color.needsUpdate = true;
    this.motes.position.set(p.x, p.y, p.z); this.motes.rotation.y = t * 0.02; if (W.key === 'ink') this.motes.position.y = p.y - ((t * 2) % 40) + 20;
    // shadow ring under the player (depth cue for landing)
    let top = -1e9; for (const pl of lvl.plats) { if (pl.dim !== 2 && pl.dim !== p.dim) continue; const c = p.crumble[pl.id]; if (c && c.gone) continue; const q = platPos(pl, p.t); if (Math.abs(p.x - q.x) < pl.w / 2 && Math.abs(p.z - q.z) < pl.d / 2 && q.y <= p.y + 0.05 && q.y > top) top = q.y; }
    const vis = top > -1e8 && this.mode !== 'title'; this.ring.visible = this.dot.visible = vis && !this.demo; if (vis) { const hgt = p.y - top, sc = 1 + Math.min(3, hgt * 0.35); this.ring.position.set(p.x, top + 0.02, p.z); this.ring.scale.setScalar(sc); this.dot.position.set(p.x, top + 0.015, p.z); this.ring.material.color.set(p.dim ? W.b : W.a); }
    // sun follows for crisp shadows
    this.sun.position.set(p.x + 30, p.y + 60, p.z + 20); this.sun.target.position.set(p.x, p.y, p.z);
    // camera
    if (this.demo || this.mode === 'title') {
      this.ghost.visible = true; this.ghost.position.set(p.x, p.y, p.z); this.ghost.userData.m.emissive.set(p.dim ? W.b : W.a); const sp = Math.hypot(p.vx, p.vz); if (sp > 0.5) this.ghost.rotation.y = Math.atan2(p.vx, p.vz);
      const back = new THREE.Vector3(-Math.sin(this.ghost.rotation.y), 0, -Math.cos(this.ghost.rotation.y)); const want = new THREE.Vector3(p.x, p.y + 3.4, p.z).addScaledVector(back, 7.5).add(new THREE.Vector3(Math.sin(t * 0.15) * 3, 0, 0));
      this.rig.position.lerp(want, 1 - Math.exp(-dt * 2.2)); this.cam.lookAt(p.x, p.y + 1.1, p.z); if (Math.random() < dt * 20) this.emit(p.x, p.y + 0.9, p.z, 1, p.dim ? W.b : W.a, 0.6);
    } else {
      this.ghost.visible = false; this.rig.position.set(p.x, p.y + (this.inVR ? 0 : PHYS.eye), p.z);
      if (!this.inVR) { const bob = p.ground && !REDUCED ? Math.sin(t * 11) * 0.03 * Math.min(1, Math.hypot(p.vx, p.vz) / PHYS.speed) : 0; this.cam.position.set(0, bob, 0); this.cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); const f = 72 + (p.boostT > 0 ? 12 : 0) + this.shiftK * 6; if (Math.abs(this.cam.fov - f) > 0.1) { this.cam.fov += (f - this.cam.fov) * Math.min(1, dt * 6); this.cam.updateProjectionMatrix(); } }
    }
    if (this.mode === 'play') this.hud();
    if (this.inVR) this.R.render(this.scene, this.cam); else this.composer.render();
  }
  events(ev) {
    const W = this.W, p = this.p;
    for (const e of ev) {
      if (e.e === 'jump') Audio.jump(); if (e.e === 'land') { Audio.land(); this.emit(p.x, p.y + 0.05, p.z, 10, '#ffffff', 1.5); }
      if (e.e === 'bounce') { Audio.bounce(); this.emit(p.x, p.y, p.z, 40, p.dim ? W.b : W.a, 6); }
      if (e.e === 'boost') { Audio.boom(); this.emit(p.x, p.y, p.z, 60, '#ffd23f', 7); this.shiftK = Math.max(this.shiftK, 0.5); }
      if (e.e === 'crumbling') Audio.crack(); if (e.e === 'checkpoint') { Audio.cp(); this.flashHint('Checkpoint'); }
      if (e.e === 'shard') { Audio.shard(); const s = this.lvl.shards.find(x => x.plat === e.id); this.emit(s.x, s.y, s.z, 70, '#ffffff', 5); this.flashHint(`Shard ${p.shards.length} of ${this.lvl.shards.length}`); }
      if (e.e === 'fell' || e.e === 'zapped') { Audio.zap(); this.applyPhase(true); this.hudPhase(); this.flashHint(e.e === 'zapped' ? 'Zapped! That laser lives in your reality. Shift away from it.' : 'Fell between worlds. Back to the checkpoint.'); this.shiftK = 0.8; }
    }
  }
  resize() { this.R.setSize(innerWidth, innerHeight); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); if (this.composer) this.composer.setSize(innerWidth, innerHeight); if (this.dim) this.dim.uniforms.uAspect.value = innerWidth / innerHeight; }

  /* ================= UI ================= */
  ui() {
    $('#ui').innerHTML = `
<section class="panel title" id="p-title">
  <svg class="tess" id="tess" viewBox="-3 -3 6 6" aria-hidden="true"><defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#38f0ff"/><stop offset=".5" stop-color="#ff5ad7"/><stop offset="1" stop-color="#ffd23f"/></linearGradient></defs><g id="tess-g"></g></svg>
  <p class="kick">A free VR game in your browser</p>
  <h1 class="big" aria-label="Another Dimension"><span>ANOTHER</span><span>DIMENSION</span></h1>
  <p class="sub">Every platform exists in only one reality. <b>Shift between them</b>, even in mid-air, to find your way home.</p>
  <div class="row"><button class="b hot" id="b-play" type="button">${SAVE.unlocked > 1 ? 'Continue' : 'Play'}</button><button class="b" id="b-levels" type="button">Levels</button><button class="b" id="b-how" type="button">How to play</button></div>
  <div class="row small"><span id="vr-slot"></span><button class="b ghost" id="b-snd" type="button">Sound: ${SAVE.sound ? 'on' : 'off'}</button><a class="b ghost" href="/realities/">The four realities</a></div>
</section>
<section class="panel levels" id="p-levels" hidden>
  <button class="x" type="button" data-back aria-label="Back">&#x2715;</button><h2 class="big2">Choose a level</h2><div class="worlds" id="lv-grid"></div>
</section>
<section class="panel how" id="p-how" hidden>
  <button class="x" type="button" data-back aria-label="Back">&#x2715;</button><h2 class="big2">How to play</h2>
  <div class="how-grid">
    <div><svg viewBox="0 0 120 80" aria-hidden="true"><rect x="8" y="46" width="40" height="10" rx="3" fill="#38f0ff"/><rect x="72" y="30" width="40" height="10" rx="3" fill="none" stroke="#ff5ad7" stroke-dasharray="4 3" stroke-width="2"/><path d="M40 44 Q60 4 88 28" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 4"/><circle cx="62" cy="18" r="6" fill="#fff"/></svg><h3>Shift realities</h3><p>Cyan platforms live in Reality A. Pink ones live in Reality B. White ones are in both. Press <kbd>E</kbd>, <kbd>Shift</kbd> or right-click (or the SHIFT button) to swap, even mid-jump.</p></div>
    <div><svg viewBox="0 0 120 80" aria-hidden="true"><rect x="10" y="50" width="100" height="10" rx="3" fill="#f4f7ff"/><line x1="60" y1="20" x2="60" y2="50" stroke="#ff5ad7" stroke-width="4"/><circle cx="60" cy="35" r="10" fill="none" stroke="#ff5ad7" stroke-width="1.5" opacity=".5"/></svg><h3>Dodge the lasers</h3><p>A laser only hurts you if it lives in your current reality. Shift away and walk right through it.</p></div>
    <div><svg viewBox="0 0 120 80" aria-hidden="true"><rect x="10" y="54" width="34" height="10" rx="3" fill="#ffd23f"/><path d="M20 50 L27 38 L34 50 M20 42 L27 30 L34 42" fill="none" stroke="#ffd23f" stroke-width="3"/><path d="M27 40 Q64 -10 100 44" fill="none" stroke="#ffd23f" stroke-width="2" stroke-dasharray="3 4"/><rect x="84" y="46" width="30" height="8" rx="3" fill="#fff"/></svg><h3>Launch, bounce, crumble</h3><p>Gold arrows are launch cannons. Rings bounce you high. Cracked platforms crumble a second after you land. Moving platforms carry you.</p></div>
    <div><svg viewBox="0 0 120 80" aria-hidden="true"><path d="M60 10l8 18 20 2-15 13 5 20-18-10-18 10 5-20-15-13 20-2z" fill="none" stroke="#fff" stroke-width="2"/></svg><h3>Three stars</h3><p>Reach the portal for one star. Grab every shard for two. Beat the par time for three. Twenty levels, four realities.</p></div>
  </div>
  <p class="keys">${IS_TOUCH ? 'Thumb joystick moves · drag to look · JUMP and SHIFT buttons' : 'WASD move · mouse look · Space jump · E / Shift / right-click shift reality · Esc pause'} · <b>VR:</b> left stick moves, right stick turns, A jumps, trigger shifts</p>
</section>
<section class="panel pause" id="p-pause" hidden><h2 class="big2">Paused</h2><div class="row"><button class="b hot" id="b-resume" type="button">Resume</button><button class="b" id="b-restart" type="button">Restart level</button><button class="b" id="b-quit" type="button">Menu</button></div>
  <label class="sens">Look speed <input type="range" min="0.4" max="2.2" step="0.1" id="sens" value="${SAVE.sens}"></label></section>
<section class="panel done" id="done" hidden><p class="dn-k"></p><h2 class="dn-t"></h2><div class="dn-stars"></div><p class="dn-s"></p><div class="row"><button class="b hot" id="dn-next" type="button">Next level</button><button class="b" id="dn-again" type="button">Play again</button><button class="b" id="dn-menu" type="button">Menu</button></div></section>
<section class="hud" id="hud" hidden>
  <div class="h-lv"><span id="h-world"></span><b id="h-name"></b></div>
  <div class="h-time" id="h-time">0:00</div>
  <div class="h-shards" id="h-shards"></div>
  <div class="h-dial" id="h-dial" aria-live="polite"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="rgba(0,0,0,.35)"/><path id="dial-a" d="M50 6 A44 44 0 0 1 50 94 Z"/><path id="dial-b" d="M50 94 A44 44 0 0 1 50 6 Z"/><g id="dial-n"><rect x="47" y="10" width="6" height="34" rx="3" fill="#fff"/></g><circle cx="50" cy="50" r="8" fill="#fff"/></svg><span id="dial-t">A</span></div>
  <div class="h-hint" id="h-hint"></div><div class="h-dot"></div>
</section>
<div class="touch" id="touch" hidden><div class="joy" id="joy"><div class="joy-k" id="joy-k"></div></div><button class="tb t-jump" data-k="jump" type="button">JUMP</button><button class="tb t-shift" data-k="shift" type="button">SHIFT</button><button class="tb t-pause" type="button" id="t-pause" aria-label="Pause">II</button></div>
<div class="banner" id="banner" hidden></div>`;
    $('#b-play').onclick = () => { Audio.init(); Audio.ui(); this.play(Math.min(SAVE.unlocked - 1, 19)); };
    $('#b-levels').onclick = () => { Audio.init(); Audio.ui(); this.levelGrid(); this.showPanel('levels'); };
    $('#b-how').onclick = () => { Audio.init(); Audio.ui(); this.showPanel('how'); };
    $('#b-snd').onclick = (e) => { Audio.init(); Audio.set(!SAVE.sound, !SAVE.sound); e.target.textContent = 'Sound: ' + (SAVE.sound ? 'on' : 'off'); };
    document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => this.showPanel('title'));
    $('#b-resume').onclick = () => this.resume(); $('#b-restart').onclick = () => this.play(this.L.n); $('#b-quit').onclick = () => this.toTitle();
    $('#sens').oninput = e => { SAVE.sens = +e.target.value; save(); };
    $('#dn-next').onclick = () => this.play(this.L.n + 1); $('#dn-again').onclick = () => this.play(this.L.n); $('#dn-menu').onclick = () => this.toTitle();
    $('#t-pause').onclick = () => this.pause();
  }
  showPanel(k) { this.hideAll(); const el = $(k === 'done' ? '#done' : '#p-' + k); if (el) el.hidden = false; if (k !== 'done') $('#hud').hidden = true; }
  hideAll() { document.querySelectorAll('.panel').forEach(p => p.hidden = true); }
  levelGrid() {
    $('#lv-grid').innerHTML = WORLDS.map(W => `<div class="wcol" style="--a:${W.a};--b:${W.b}"><h3>${esc(W.name)}</h3><p>${esc(W.tag)}</p>${LEVELS.filter(L => L.world === W.id).map(L => { const open = L.n < SAVE.unlocked, st = SAVE.stars[L.n] || 0; return `<button type="button" class="lv ${open ? '' : 'locked'}" data-n="${L.n}" ${open ? '' : 'disabled'}><span class="lv-n">${L.n + 1}</span><span class="lv-t">${esc(L.name)}</span><span class="lv-s">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span></button>`; }).join('')}</div>`).join('');
    document.querySelectorAll('.lv').forEach(b => b.onclick = () => { Audio.ui(); this.play(+b.dataset.n); });
  }
  banner(L) { const b = $('#banner'); b.innerHTML = `<p>Level ${L.n + 1} · ${esc(WORLDS[L.world].name)}</p><h2 style="--a:${WORLDS[L.world].a};--b:${WORLDS[L.world].b}">${esc(L.name)}</h2>${L.n === 0 ? '<p class="bs">Walk to the portal. Easy. For now.</p>' : L.n === 1 ? '<p class="bs">Pink platforms only exist in Reality B. Press SHIFT.</p>' : ''}`; b.hidden = false; b.classList.remove('out'); clearTimeout(this._bt); this._bt = setTimeout(() => { b.classList.add('out'); setTimeout(() => b.hidden = true, 900); }, 3200); }
  hud(first) {
    if (first) { $('#h-world').textContent = `Level ${this.L.n + 1} · ${this.W.name}`; $('#h-name').textContent = this.L.name; $('#dial-a').setAttribute('fill', this.W.a); $('#dial-b').setAttribute('fill', this.W.key === 'ink' ? '#1b1b1f' : this.W.b); this.hudPhase(); }
    $('#h-time').textContent = fmt(this.time); const n = this.lvl.shards.length, g = this.p.shards.length; const key = g + '/' + n; if (this._sk !== key) { this._sk = key; $('#h-shards').innerHTML = Array.from({ length: n }, (_, i) => `<svg viewBox="0 0 20 24" class="${i < g ? 'on' : ''}" aria-hidden="true"><path d="M10 1l8 11-8 11-8-11z"/></svg>`).join('') + `<span class="gb-sr">${g} of ${n} shards</span>`; }
  }
  hudPhase() { const d = this.p.dim; $('#dial-n').style.transform = `rotate(${d ? 180 : 0}deg)`; $('#dial-t').textContent = d ? 'B' : 'A'; $('#h-dial').style.setProperty('--c', d ? this.W.b : this.W.a); }
  flashHint(t) { const h = $('#h-hint'); h.textContent = t; h.classList.add('on'); clearTimeout(this._ht); this._ht = setTimeout(() => h.classList.remove('on'), 2600); }
  svgTitle() {
    const g = $('#tess-g'); if (!g) return; const lines = TE.map(() => { const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); g.appendChild(l); return l; }); const dots = TV.map(() => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', '0.07'); g.appendChild(c); return c; });
    const draw = (t) => { const P = tesseract(t); TE.forEach(([i, j], k) => { const a = P[i], b = P[j], l = lines[k]; l.setAttribute('x1', a[0].toFixed(3)); l.setAttribute('y1', a[1].toFixed(3)); l.setAttribute('x2', b[0].toFixed(3)); l.setAttribute('y2', b[1].toFixed(3)); const w = (a[3] + b[3]) / 2; l.setAttribute('stroke-width', (0.025 + (w + 1) * 0.02).toFixed(3)); l.setAttribute('opacity', (0.45 + (w + 1) * 0.27).toFixed(2)); }); P.forEach((q, k) => { dots[k].setAttribute('cx', q[0].toFixed(3)); dots[k].setAttribute('cy', q[1].toFixed(3)); }); };
    if (REDUCED) { draw(0.7); return; } const tick = () => { if (this.mode === 'title' || this.mode === 'done') draw(performance.now() / 1000 * 0.35); requestAnimationFrame(tick); }; tick();
  }
}
function fmt(s) { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; }

export function start() {
  const ok = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (!ok) { $('#nogl').hidden = false; return; }
  const g = new Game(); window.AD = g; g.showPanel('title');
  const err = (m) => { const b = $('#err'); b.hidden = false; b.textContent = 'Something glitched: ' + m + ' (a screenshot helps fix it)'; };
  addEventListener('error', e => err(e.message)); addEventListener('unhandledrejection', e => err(e.reason && e.reason.message || e.reason));
}
