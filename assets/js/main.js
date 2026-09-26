// VoltManager landing page: theme, navigation, live download data and interactive demos.

const REPO = 'Albix4563/VoltManager';
const RELEASES_LATEST_URL = `https://github.com/${REPO}/releases/latest`;
const API_RELEASE = `https://api.github.com/repos/${REPO}/releases/latest`;
const API_REPO = `https://api.github.com/repos/${REPO}`;
const CACHE_TTL = 10 * 60 * 1000;

const PLAN_NAMES = { risparmio: 'Risparmio', bilanciato: 'Bilanciato', prestazioni: 'Prestazioni' };
const PLAN_READOUT = {
  risparmio: { cpu: [8, 18], watt: [6, 10] },
  bilanciato: { cpu: [22, 42], watt: [14, 24] },
  prestazioni: { cpu: [55, 88], watt: [38, 65] },
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

let sceneApi = null;

/* ---------- Theme ---------- */
function initTheme() {
  const btn = $('[data-theme-toggle]');
  const meta = $('meta[name="theme-color"]');
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    btn.setAttribute('aria-label', theme === 'dark' ? 'Attiva il tema chiaro' : 'Attiva il tema scuro');
    meta.setAttribute('content', theme === 'dark' ? '#0A1633' : '#EEF2F8');
    sceneApi?.setTheme(theme);
  };
  apply(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('vm-theme', next); } catch { /* storage unavailable */ }
    apply(next);
  });
}

/* ---------- Navigation ---------- */
function initNav() {
  const nav = $('[data-nav]');
  const toggle = $('[data-nav-toggle]');
  const menu = $('#nav-menu');

  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
    if (open) $('a', menu)?.focus();
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  // highlight the section currently in view
  const links = new Map($$('.nav__links a').map((a) => [a.hash.slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const link = links.get(entry.target.id);
      if (!link) return;
      if (entry.isIntersecting) {
        links.forEach((l) => l.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'true');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
}

/* ---------- Hero scene + demo ---------- */
async function initScene() {
  const hero = $('.hero');
  const canvas = $('[data-scene]');
  const plan = hero.dataset.plan;
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('WebGL non disponibile');
    const { createScene } = await import('./scene.js');
    sceneApi = createScene(canvas, {
      plan,
      theme: document.documentElement.dataset.theme,
      reducedMotion,
      host: $('.hero__stage'),
    });
    sceneApi.setPlan(hero.dataset.plan);
  } catch {
    hero.classList.add('no-webgl');
  }
}

function initDemo() {
  const hero = $('.hero');
  const group = $('[data-plan-switch]');
  const radios = $$('[role="radio"]', group);
  const power = $('[data-power-toggle]');
  const powerLabel = $('[data-power-label]');
  const status = $('[data-demo-status]');
  const cpuEl = $('[data-readout-cpu]');
  const wattEl = $('[data-readout-watt]');

  let plan = hero.dataset.plan;
  let planOnAC = plan;
  let onBattery = false;

  const setPlan = (name, { focus = false } = {}) => {
    plan = name;
    hero.dataset.plan = name;
    radios.forEach((r) => {
      const on = r.dataset.planValue === name;
      r.setAttribute('aria-checked', String(on));
      r.tabIndex = on ? 0 : -1;
      if (on && focus) r.focus();
    });
    sceneApi?.setPlan(name);
    tickReadout();
  };

  radios.forEach((r) => r.addEventListener('click', () => {
    setPlan(r.dataset.planValue);
    if (onBattery) {
      status.textContent = `Su batteria hai scelto ${PLAN_NAMES[plan]} a mano: VoltManager rispetta la tua scelta.`;
    } else {
      planOnAC = plan;
      status.textContent = `Piano attivo: ${PLAN_NAMES[plan]}.`;
    }
  }));
  group.addEventListener('keydown', (e) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = radios.findIndex((r) => r.dataset.planValue === plan);
    let n = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % radios.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + radios.length) % radios.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = radios.length - 1;
    radios[n].click();
    radios[n].focus();
  });

  power.addEventListener('click', () => {
    onBattery = !onBattery;
    power.setAttribute('aria-pressed', String(onBattery));
    powerLabel.textContent = onBattery ? 'batteria' : 'rete elettrica';
    sceneApi?.setPower(onBattery ? 'battery' : 'ac');
    if (onBattery) {
      planOnAC = plan;
      setPlan('risparmio');
      status.textContent = 'Su batteria: VoltManager è passato a Risparmio.';
    } else {
      setPlan(planOnAC);
      status.textContent = `Di nuovo alla rete: ripristinato ${PLAN_NAMES[planOnAC]}.`;
    }
  });

  // simulated live readout, coherent with the plan
  let cpu = 34;
  let watt = 18;
  function tickReadout() {
    const r = PLAN_READOUT[plan];
    const tc = r.cpu[0] + Math.random() * (r.cpu[1] - r.cpu[0]);
    const tw = r.watt[0] + Math.random() * (r.watt[1] - r.watt[0]);
    cpu = reducedMotion ? tc : cpu + (tc - cpu) * 0.6;
    watt = reducedMotion ? tw : watt + (tw - watt) * 0.6;
    cpuEl.textContent = Math.round(cpu);
    wattEl.textContent = Math.round(watt);
  }
  tickReadout();
  if (!reducedMotion) {
    setInterval(() => { if (!document.hidden && window.scrollY < window.innerHeight) tickReadout(); }, 1400);
  }
}

/* ---------- Feature tabs ---------- */
function initFeatures() {
  const list = $('[data-tabs]');
  const tabs = $$('[role="tab"]', list);
  const panel = $('[data-panel]');
  const vizzes = $$('[data-viz]', panel);

  const select = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tab.id);
    vizzes.forEach((v) => { v.hidden = v.dataset.viz !== tab.dataset.feature; });
    if (!reducedMotion) {
      panel.classList.remove('is-switching');
      void panel.offsetWidth; // restart the animation
      panel.classList.add('is-switching');
    }
    if (focus) {
      tab.focus();
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  tabs.forEach((t) => t.addEventListener('click', () => select(t, false)));
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let n = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = tabs.length - 1;
    if (n === null) return;
    e.preventDefault();
    select(tabs[n], true);
  });
}

/* ---------- Scroll-linked progress (steps + monitor tilt) ---------- */
function initScrollLinked() {
  const steps = $('[data-steps]');
  const stepItems = $$('.step', steps);
  const monitor = $('[data-monitor]');

  if (reducedMotion) {
    steps.style.setProperty('--progress', '1');
    stepItems.forEach((s) => s.classList.add('is-lit'));
    monitor.style.setProperty('--tilt', '0');
    return;
  }

  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;

    const r = steps.getBoundingClientRect();
    const p = clamp01((vh * 0.8 - r.top) / (r.height + vh * 0.35));
    steps.style.setProperty('--progress', p.toFixed(3));
    stepItems.forEach((s, i) => s.classList.toggle('is-lit', p >= i / stepItems.length + 0.02));

    const m = monitor.getBoundingClientRect();
    const t = clamp01((m.top - vh * 0.15) / (vh * 0.7));
    monitor.style.setProperty('--tilt', t.toFixed(3));
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

/* ---------- Pointer tilt (gaming console) ---------- */
function initTilt() {
  if (reducedMotion || !window.matchMedia('(hover: hover)').matches) return;
  $$('[data-tilt]').forEach((el) => {
    const target = el.firstElementChild;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.classList.add('is-active');
      target.style.setProperty('--ry', `${(x * 16).toFixed(2)}deg`);
      target.style.setProperty('--rx', `${(-y * 16).toFixed(2)}deg`);
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('is-active');
      target.style.setProperty('--ry', '0deg');
      target.style.setProperty('--rx', '0deg');
    });
  });
}

/* ---------- Monitor dashboard (live only while visible) ---------- */
function initMonitor() {
  const root = $('[data-monitor]');
  const line = $('[data-mon-line]', root);
  const area = $('[data-mon-area]', root);
  const cpuEl = $('[data-mon-cpu]', root);
  const tempEl = $('[data-mon-temp]', root);
  const gauge = $('[data-mon-gauge]', root);
  const ramEl = $('[data-mon-ram]', root);
  const ramBar = $('[data-mon-ram-bar]', root);
  const gpuEl = $('[data-mon-gpu]', root);
  const gpuBar = $('[data-mon-gpu-bar]', root);
  const fmt = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const N = 60;
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const data = [];
  let v = 35;
  for (let i = 0; i < N; i++) { v = Math.min(92, Math.max(6, v + (rand() - 0.5) * 18)); data.push(v); }

  const draw = () => {
    const pts = data.map((d, i) => `${(i / (N - 1)) * 300},${80 - (d / 100) * 76}`);
    line.setAttribute('d', `M${pts.join(' L')}`);
    area.setAttribute('d', `M0,80 L${pts.join(' L')} L300,80 Z`);
    const last = data[N - 1];
    cpuEl.textContent = Math.round(last);
    const temp = Math.round(42 + last * 0.38);
    tempEl.textContent = temp;
    gauge.style.setProperty('--g', ((temp - 30) / 70).toFixed(3));
    const ram = 9.2 + rand() * 1.4;
    ramEl.textContent = fmt.format(ram);
    ramBar.style.setProperty('--v', (ram / 16).toFixed(3));
    const gpu = Math.round(12 + rand() * 20);
    gpuEl.textContent = gpu;
    gpuBar.style.setProperty('--v', (gpu / 100).toFixed(3));
  };
  draw();
  if (reducedMotion) return;

  let timer = 0;
  const tick = () => {
    const prev = data[N - 1];
    data.shift();
    data.push(Math.min(92, Math.max(6, prev + (rand() - 0.5) * 16)));
    draw();
  };
  new IntersectionObserver(([entry]) => {
    clearInterval(timer);
    if (entry.isIntersecting) timer = setInterval(tick, 1500);
  }).observe(root);
}

/* ---------- Widgets clock / calendar ---------- */
function initWidgets() {
  const clock = $('[data-clock]');
  const date = $('[data-date]');
  const month = $('[data-cal-month]');
  const day = $('[data-cal-day]');
  const desk = $('[data-desk]');
  const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
  const long = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const monthF = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const render = () => {
    const now = new Date();
    clock.textContent = time.format(now);
    date.textContent = cap(long.format(now));
    month.textContent = cap(monthF.format(now));
    day.textContent = now.getDate();
  };
  render();
  setInterval(render, 15000);
  // touch devices: tap to fan out the stack
  desk.addEventListener('click', () => desk.classList.toggle('is-open'));
}

/* ---------- Count-up facts ---------- */
function initFacts() {
  const items = $$('[data-count]');
  if (reducedMotion || !('IntersectionObserver' in window)) return;
  items.forEach((el) => { el.textContent = '0'; });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const el = entry.target;
      const target = Number(el.dataset.count);
      const start = performance.now();
      const dur = 1400;
      const run = (now) => {
        const p = Math.min(1, (now - start) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 4)));
        if (p < 1) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    });
  }, { threshold: 0.6 });
  items.forEach((el) => io.observe(el));
}

/* ---------- GitHub data ---------- */
async function cachedJson(key, url) {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const { at, data } = JSON.parse(raw);
      if (Date.now() - at < CACHE_TTL) return data;
    }
  } catch { /* ignore broken cache */ }
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = await res.json();
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* quota */ }
  return data;
}

const formatSize = (bytes) => `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(bytes / 1048576)} MB`;
const formatDate = (iso) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));

async function initRelease() {
  const box = $('[data-release]');
  try {
    const rel = await cachedJson('vm-release', API_RELEASE);
    const assets = rel.assets || [];
    const setup = assets.find((a) => /^VoltManagerSetup-.*\.exe$/i.test(a.name));
    const portable = assets.find((a) => /^VoltManager-portable-.*-win-x64\.zip$/i.test(a.name));
    const version = String(rel.tag_name || '').replace(/^v/i, '');

    if (setup) {
      $$('[data-download]').forEach((a) => { a.href = setup.browser_download_url; });
      $('[data-asset-setup]').textContent = setup.name;
      $('[data-asset-setup-size]').textContent = formatSize(setup.size);
      $('[data-setup-name]').textContent = setup.name;
    }
    if (portable) {
      $('[data-download-portable]').href = portable.browser_download_url;
      $('[data-asset-portable]').textContent = portable.name;
      $('[data-asset-portable-size]').textContent = formatSize(portable.size);
    }
    if (version) {
      $('[data-release-version]').textContent = `Versione ${version}`;
      $('[data-release-meta]').textContent = `Versione ${version}, installer 64 bit per Windows 10 e 11`;
    }
    if (rel.published_at) $('[data-release-date]').textContent = `Pubblicata il ${formatDate(rel.published_at)}`;
    if (rel.html_url) $('[data-release-notes]').href = rel.html_url;
    if (!setup) throw new Error('Installer non trovato nella release');
  } catch {
    $$('[data-download]').forEach((a) => { a.href = RELEASES_LATEST_URL; });
    $('[data-release-error]').hidden = false;
  } finally {
    box.setAttribute('aria-busy', 'false');
    $$('[data-asset-setup-size], [data-asset-portable-size], [data-release-date]').forEach((el) => {
      if (!el.textContent.trim()) el.textContent = '';
    });
  }
}

async function initRepo() {
  try {
    const repo = await cachedJson('vm-repo', API_REPO);
    $('[data-repo-stars]').textContent = new Intl.NumberFormat('it-IT').format(repo.stargazers_count ?? 0);
    $('[data-repo-pushed]').textContent = formatDate(repo.pushed_at);
    $('[data-repo-stats]').hidden = false;
  } catch { /* the repository link still works without stats */ }
}

/* ---------- Boot ---------- */
$('[data-year]').textContent = new Date().getFullYear();
initTheme();
initNav();
initDemo();
initFeatures();
initScrollLinked();
initTilt();
initMonitor();
initWidgets();
initFacts();
initRelease();
initRepo();
initScene();
