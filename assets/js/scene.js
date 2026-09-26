// Hero scene: the PC as an energy landscape. Columns rise and fall like load,
// colored by the active power plan; a cable feeds the grid while on AC power.
import * as THREE from '../vendor/three.module.min.js';

const COLS = 28;
const ROWS = 18;
const GAP = 1;
const GRID_X = 7; // shift the landscape to the right, away from the headline

const PLANS = {
  risparmio:   { amp: 0.8, speed: 0.35, spike: 0,   color: '#3DD6A4' },
  bilanciato:  { amp: 1.9, speed: 0.8,  spike: 0.2, color: '#5B8CFF' },
  prestazioni: { amp: 3.4, speed: 1.55, spike: 1,   color: '#FF8A3D' },
};

const THEMES = {
  dark:  { fog: '#0A1633', hemi: 0.55, dir: 1.6, cable: '#2F6BFF', base: '#0F1E42' },
  light: { fog: '#EEF2F8', hemi: 1.05, dir: 1.3, cable: '#2458E6', base: '#C9D4EA' },
};

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// deterministic pseudo-random for per-column jitter
function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function createScene(canvas, opts = {}) {
  const reduced = !!opts.reducedMotion;
  const host = opts.host || canvas.parentElement;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(THEMES.dark.fog, 26, 58);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const lookAt = new THREE.Vector3(GRID_X - 1, 0, 0);

  const hemi = new THREE.HemisphereLight('#bcd0ff', '#0A1633', THEMES.dark.hemi);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight('#ffffff', THEMES.dark.dir);
  dir.position.set(-8, 18, 10);
  scene.add(dir);

  // --- columns
  const count = COLS * ROWS;
  const geo = new THREE.BoxGeometry(0.7, 1, 0.7);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.08 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const cells = [];
  const entry = new THREE.Vector2(GRID_X + 2, (ROWS * GAP) / 2 + 0.2); // cable entry point (front edge, facing the camera)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = GRID_X + (c - (COLS - 1) / 2) * GAP;
      const z = (r - (ROWS - 1) / 2) * GAP;
      const i = r * COLS + c;
      cells.push({ x, z, jitter: hash(i), spikeSeed: hash(i + 999), dist: Math.hypot(x - entry.x, z - entry.y) });
    }
  }
  const maxDist = Math.max(...cells.map((c) => c.dist));

  // --- cable (nod to the plug in the logo)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(entry.x + 9, 0.25, entry.y + 9),
    new THREE.Vector3(entry.x + 6, 0.25, entry.y + 6.5),
    new THREE.Vector3(entry.x + 1.5, 0.25, entry.y + 4.5),
    new THREE.Vector3(entry.x + 0.3, 0.25, entry.y + 1.8),
    new THREE.Vector3(entry.x, 0.25, entry.y + 0.4),
  ]);
  const cableMat = new THREE.MeshStandardMaterial({ color: THEMES.dark.cable, roughness: 0.35, metalness: 0.2, emissive: THEMES.dark.cable, emissiveIntensity: 0.35 });
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.16, 10, false), cableMat);
  scene.add(cable);
  const plug = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.6), cableMat);
  plug.position.copy(curve.getPointAt(1));
  scene.add(plug);
  const pulseMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, fog: false });
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), pulseMat);
  scene.add(pulse);

  // --- state
  const initial = PLANS[opts.plan] ? opts.plan : 'bilanciato';
  const cur = { amp: PLANS[initial].amp, speed: PLANS[initial].speed, spike: PLANS[initial].spike, color: new THREE.Color(PLANS[initial].color) };
  let from = { ...cur, color: cur.color.clone() };
  let to = { ...cur, color: cur.color.clone() };
  let tween = 1; // 0..1 progress of plan transition
  let onAC = true;
  let cableGlow = 1;
  let theme = THEMES[opts.theme] || THEMES.dark;
  const baseColor = new THREE.Color(theme.base);
  const white = new THREE.Color('#ffffff');

  let phase = 0;
  let pulseT = 0;
  let introStart = -1;
  let last = 0;
  let running = false;
  let visible = true;
  let rafId = 0;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let scrollP = 0;

  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  function applyTheme(name) {
    theme = THEMES[name] || THEMES.dark;
    scene.fog.color.set(theme.fog);
    hemi.intensity = theme.hemi;
    hemi.groundColor.set(theme.fog);
    dir.intensity = theme.dir;
    cableMat.color.set(theme.cable);
    cableMat.emissive.set(theme.cable);
    baseColor.set(theme.base);
  }
  applyTheme(opts.theme);

  function updateColumns(introTime) {
    const t = phase;
    for (let i = 0; i < count; i++) {
      const c = cells[i];
      let v = 0.5 * Math.sin(c.x * 0.33 + t)
        + 0.32 * Math.sin(c.z * 0.52 - t * 1.3 + c.x * 0.14)
        + 0.22 * Math.sin((c.x + c.z) * 0.21 + t * 0.7);
      v = (v + 1.04) / 2.08; // ~0..1
      v = clamp01(v * 0.82 + c.jitter * 0.18);
      // sharp, short-lived peaks for heavier plans
      if (cur.spike > 0) {
        const s = Math.max(0, Math.sin(t * 2.1 + c.spikeSeed * 40));
        v += cur.spike * Math.pow(s, 24) * 0.9 * (c.spikeSeed > 0.6 ? 1 : 0);
      }
      let h = 0.12 + v * cur.amp * 1.6;

      if (introTime >= 0) {
        const g = clamp01((introTime - (c.dist / maxDist) * 1.0) / 0.6);
        h *= easeOut(g);
      }

      dummy.position.set(c.x, 0, c.z);
      dummy.scale.set(1, Math.max(0.001, h), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const k = clamp01(v);
      tmpColor.copy(baseColor).lerp(cur.color, 0.15 + k * 0.85);
      if (k > 0.7) tmpColor.lerp(white, (k - 0.7) * 1.2);
      mesh.setColorAt(i, tmpColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function updateCamera() {
    pointer.sx += (pointer.x - pointer.sx) * 0.05;
    pointer.sy += (pointer.y - pointer.sy) * 0.05;
    const yaw = THREE.MathUtils.degToRad(-12 + pointer.sx * 4);
    const radius = 25 - scrollP * 6;
    const height = 13.5 - scrollP * 4.5 + pointer.sy * 1.2;
    camera.position.set(lookAt.x + Math.sin(yaw) * radius, height, lookAt.z + Math.cos(yaw) * radius);
    camera.lookAt(lookAt);
  }

  function step(dt) {
    if (tween < 1) {
      tween = Math.min(1, tween + dt / 0.8);
      const e = easeOut(tween);
      cur.amp = from.amp + (to.amp - from.amp) * e;
      cur.speed = from.speed + (to.speed - from.speed) * e;
      cur.spike = from.spike + (to.spike - from.spike) * e;
      cur.color.copy(from.color).lerp(to.color, e);
    }
    phase += dt * cur.speed;

    cableGlow += ((onAC ? 1 : 0) - cableGlow) * Math.min(1, dt * 4);
    cableMat.emissiveIntensity = 0.08 + cableGlow * 0.4;
    pulse.visible = cableGlow > 0.05;
    pulseMat.opacity = cableGlow;
    if (onAC) pulseT = (pulseT + dt * 0.45) % 1;
    pulse.position.copy(curve.getPointAt(pulseT));
  }

  function frame(now) {
    rafId = 0;
    if (!running) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    if (introStart < 0) introStart = now;
    const introTime = (now - introStart) / 1000;

    step(dt);
    updateColumns(introTime < 2 ? introTime : -1);
    updateCamera();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }

  function renderStatic() {
    tween = 1;
    cur.amp = to.amp; cur.speed = to.speed; cur.spike = to.spike; cur.color.copy(to.color);
    cableGlow = onAC ? 1 : 0;
    cableMat.emissiveIntensity = 0.08 + cableGlow * 0.4;
    pulse.visible = onAC;
    pulse.position.copy(curve.getPointAt(0.6));
    phase = 1.3;
    updateColumns(-1);
    updateCamera();
    renderer.render(scene, camera);
  }

  function start() {
    if (reduced || running || !visible || document.hidden) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function resize() {
    const w = canvas.clientWidth || host.clientWidth;
    const h = canvas.clientHeight || host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the landscape in frame on narrow screens
    camera.fov = w < 700 ? 52 : 38;
    lookAt.x = w < 900 ? GRID_X - 5 : GRID_X - 1;
    camera.updateProjectionMatrix();
    if (reduced || !running) renderStatic();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const io = new IntersectionObserver(([entryObs]) => {
    visible = entryObs.isIntersecting;
    if (visible) start(); else stop();
  }, { threshold: 0 });
  io.observe(host);

  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange', onVisibility);

  const onPointer = (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onScroll = () => {
    const h = host.offsetHeight || window.innerHeight;
    scrollP = clamp01(window.scrollY / h);
  };
  if (!reduced) {
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  resize();
  if (reduced) renderStatic(); else start();

  return {
    setPlan(name) {
      const p = PLANS[name];
      if (!p) return;
      from = { amp: cur.amp, speed: cur.speed, spike: cur.spike, color: cur.color.clone() };
      to = { amp: p.amp, speed: p.speed, spike: p.spike, color: new THREE.Color(p.color) };
      tween = 0;
      if (reduced) renderStatic();
    },
    setPower(source) {
      onAC = source !== 'battery';
      if (reduced) renderStatic();
    },
    setTheme(name) {
      applyTheme(name);
      if (reduced || !running) renderStatic();
    },
    dispose() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      geo.dispose(); mat.dispose(); cableMat.dispose(); pulseMat.dispose();
      renderer.dispose();
    },
  };
}
