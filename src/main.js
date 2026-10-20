import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import { createSequence, BASES } from "./sequence.js";
import { createDNA, BDNA } from "./helix.js";
import { createEnvironment, createBackdrop, createParticles, createLights } from "./scene.js";

/* -------------------------------------------------------------------------- */
/* Настройки                                                                  */
/* -------------------------------------------------------------------------- */

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarseQuery = window.matchMedia("(pointer: coarse)");

const state = {
  ready: false,
  reducedMotion: motionQuery.matches,
  isMobile: window.matchMedia("(max-width: 820px)").matches,
  autoRotate: !motionQuery.matches,
  rotateSpeed: 1.2,
  view: "overview",
  hovered: -1,
  pointerInside: false,
  pointer: new THREE.Vector2(-2, -2),
  pointerClient: { x: 0, y: 0 },
  lastPick: 0,
  touchStart: null,
  tween: null,
  hintHidden: false,
  drawerOpen: false,
  sequence: "",
  seqFocus: null,
};

const QUALITY = state.isMobile || (navigator.hardwareConcurrency || 8) <= 4 ? "low" : "high";
const BP_COUNT = state.isMobile ? 60 : 84;

const SEQ_ROWS = 7;
const SEQ_COLS = 12;

const dom = {
  canvas: document.getElementById("scene"),
  loader: document.getElementById("loader"),
  loaderBar: document.getElementById("loader-bar"),
  statBp: document.getElementById("stat-bp"),
  statTurns: document.getElementById("stat-turns"),
  statLength: document.getElementById("stat-length"),
  tooltip: document.getElementById("tooltip"),
  tipIndex: document.getElementById("tip-index"),
  tipPair: document.getElementById("tip-pair"),
  tipMeta: document.getElementById("tip-meta"),
  infoBtn: document.getElementById("info-btn"),
  infoClose: document.getElementById("info-close"),
  drawer: document.getElementById("info-panel"),
  backdrop: document.getElementById("drawer-backdrop"),
  rotateBtn: document.getElementById("rotate-btn"),
  speed: document.getElementById("speed"),
  speedValue: document.getElementById("speed-value"),
  hint: document.getElementById("hint"),
  fallback: document.getElementById("fallback"),
  viewButtons: Array.from(document.querySelectorAll("[data-view]")),
  seqRows: document.getElementById("seq-rows"),
  seqTotal: document.getElementById("seq-total"),
};

let renderer;
let scene;
let camera;
let controls;
let composer;
let bloomPass;
let dna;
let dust;
let raycaster;
let timer;

/* -------------------------------------------------------------------------- */
/* Запуск                                                                     */
/* -------------------------------------------------------------------------- */

boot();

async function boot() {
  try {
    await Promise.race([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]);

    init();
    state.ready = true;

    dom.loaderBar.style.width = "62%";
    await nextFrame();
    dom.loaderBar.style.width = "100%";
    await new Promise((resolve) => setTimeout(resolve, 340));

    document.body.classList.add("is-ready");
    dom.loader.classList.add("is-done");
    setTimeout(() => dom.loader.remove(), 900);
  } catch (error) {
    console.error(error);
    dom.loader.classList.add("is-done");
    dom.fallback.hidden = false;
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/* -------------------------------------------------------------------------- */
/* Инициализация                                                              */
/* -------------------------------------------------------------------------- */

function init() {
  dom.loaderBar.style.width = "28%";

  renderer = new THREE.WebGLRenderer({
    canvas: dom.canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050810);
  scene.fog = new THREE.FogExp2(0x050810, 0.0055);
  scene.environment = createEnvironment(renderer);
  scene.environmentIntensity = 0.7;
  scene.add(createBackdrop());
  scene.add(createLights());

  camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 400);

  const sequence = createSequence(BP_COUNT);
  state.sequence = sequence.strand1;
  dna = createDNA({ sequence, quality: QUALITY });
  scene.add(dna.group);

  dust = createParticles({ count: QUALITY === "high" ? 950 : 420 });
  scene.add(dust);

  raycaster = new THREE.Raycaster();
  timer = new THREE.Timer();
  timer.connect(document);

  controls = new OrbitControls(camera, dom.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.rotateSpeed = 0.62;
  controls.zoomSpeed = 0.85;
  controls.minDistance = 2.4;
  controls.maxDistance = 120;
  controls.minPolarAngle = 0.15 * Math.PI;
  controls.maxPolarAngle = 0.85 * Math.PI;
  controls.autoRotate = false;
  controls.autoRotateSpeed = state.rotateSpeed;

  const overview = buildPreset("overview");
  camera.position.copy(overview.pos).multiplyScalar(1.45);
  camera.lookAt(overview.target);
  controls.target.copy(overview.target);
  controls.update();

  composer = createComposer();
  setupUi();
  updateStats();
  renderSequence();

  // Вступительный проезд камеры.
  if (state.reducedMotion) {
    applyView("overview", { immediate: true });
  } else {
    applyView("overview", { duration: 2100, user: false });
  }

  window.addEventListener("resize", onResize);
  setupInteractions();

  animate();
}

function createComposer() {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: state.isMobile ? 2 : 4,
  });

  const instance = new EffectComposer(renderer, target);
  instance.setPixelRatio(renderer.getPixelRatio());
  instance.setSize(window.innerWidth, window.innerHeight);

  instance.addPass(new RenderPass(scene, camera));

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    state.isMobile ? 0.4 : 0.34,
    0.6,
    0.86,
  );
  instance.addPass(bloomPass);
  instance.addPass(new OutputPass());

  return instance;
}

/* -------------------------------------------------------------------------- */
/* Ракурсы                                                                    */
/* -------------------------------------------------------------------------- */

function buildPreset(name) {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const fitHeight = (dna.height + 2.6) / 2 / Math.tan(vFov / 2);
  const fitWidth = (BDNA.radius * 2 + 2.6) / 2 / (Math.tan(vFov / 2) * camera.aspect);
  const fit = Math.max(fitHeight, fitWidth) * (state.isMobile ? 1.16 : 1.06);

  if (name === "helix") {
    const target = new THREE.Vector3(0, dna.height * 0.08, 0);
    const distance = THREE.MathUtils.clamp(fit * 0.44, 8, 34);
    const direction = new THREE.Vector3(0.66, 0.2, 0.78).normalize();
    return { target, pos: target.clone().addScaledVector(direction, distance) };
  }

  if (name === "pair") {
    const index = Math.floor(dna.count * 0.56);
    const frame = dna.pairFrames[index];
    const target = frame.center.clone();
    const direction = frame.outward
      .clone()
      .multiplyScalar(0.85)
      .add(new THREE.Vector3(0, 0.62, 0))
      .addScaledVector(frame.tangent, 0.22)
      .normalize();
    const distance = camera.aspect < 0.9 ? 6.6 : 5.2;
    return { target, pos: target.clone().addScaledVector(direction, distance) };
  }

  const target = new THREE.Vector3(0, -0.5, 0);
  const direction = new THREE.Vector3(0.16, 0.05, 1).normalize();
  return { target, pos: target.clone().addScaledVector(direction, fit) };
}

function applyView(name, { immediate = false, duration = 1150, user = true } = {}) {
  state.view = name;
  setActiveView(name);

  if (user) {
    closeTooltip();
    hideHint();
  }

  const preset = buildPreset(name);

  if (immediate || state.reducedMotion) {
    state.tween = null;
    camera.position.copy(preset.pos);
    controls.target.copy(preset.target);
    camera.lookAt(preset.target);
    controls.update();
    controls.autoRotate = state.autoRotate;
    return;
  }

  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();
  controls.autoRotate = false;

  state.tween = {
    started: performance.now(),
    duration,
    fromPos,
    toPos: preset.pos,
    fromTarget,
    toTarget: preset.target,
  };
}

function updateTween(now) {
  const tween = state.tween;
  if (!tween) return false;

  const progress = Math.min(1, (now - tween.started) / tween.duration);
  const eased =
    progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;

  camera.position.lerpVectors(tween.fromPos, tween.toPos, eased);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
  camera.lookAt(controls.target);

  if (progress >= 1) {
    state.tween = null;
    controls.autoRotate = state.autoRotate;
    controls.update();
  }
  return true;
}

function setActiveView(name) {
  for (const button of dom.viewButtons) {
    const active = button.dataset.view === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

/* -------------------------------------------------------------------------- */
/* Интерфейс                                                                  */
/* -------------------------------------------------------------------------- */

function setupUi() {
  dom.rotateBtn.setAttribute("aria-pressed", String(state.autoRotate));
  dom.rotateBtn.disabled = false;
  updateRotateButton();

  dom.speed.value = String(Math.round((state.rotateSpeed / 1.8) * 100));
  updateSpeedLabel();
  for (const button of dom.viewButtons) {
    button.addEventListener("click", () => applyView(button.dataset.view));
  }

  dom.rotateBtn.addEventListener("click", () => setAutoRotate(!state.autoRotate));

  dom.speed.addEventListener("input", () => {
    const value = Number(dom.speed.value);
    state.rotateSpeed = (value / 100) * 1.8;
    controls.autoRotateSpeed = state.rotateSpeed;
    updateSpeedLabel();
  });

  dom.infoBtn.addEventListener("click", () => {
    if (state.drawerOpen) closeDrawer();
    else openDrawer();
  });
  dom.infoClose.addEventListener("click", closeDrawer);
  dom.backdrop.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", onKeyDown);

  if (coarseQuery.matches) {
    dom.hint.textContent = "Проведите — вращение · щипок — масштаб";
  }
}

function updateRotateButton() {
  dom.rotateBtn.setAttribute("aria-pressed", String(state.autoRotate));
  dom.rotateBtn.setAttribute(
    "aria-label",
    state.autoRotate ? "Пауза автовращения" : "Включить автовращение",
  );
  dom.rotateBtn.title = state.autoRotate ? "Пауза (R)" : "Вращение (R)";
  dom.rotateBtn.classList.toggle("is-paused", !state.autoRotate);
  dom.rotateBtn.innerHTML = state.autoRotate
    ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="7" y="5.5" width="3.4" height="13" rx="1.2"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1.2"/></svg>`
    : `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M8.4 5.4c0-.8.9-1.3 1.6-.9l8.2 6.1c.6.4.6 1.3 0 1.7l-8.2 6.1c-.7.5-1.6 0-1.6-.8V5.4Z"/></svg>`;
}

function setAutoRotate(value) {
  state.autoRotate = value;
  controls.autoRotate = value && !state.tween;
  updateRotateButton();
}

function updateSpeedLabel() {
  dom.speedValue.textContent = `${state.rotateSpeed.toFixed(1).replace(".", ",")}×`;
}

function updateStats() {
  const turns = (dna.count - 1) / BDNA.bpPerTurn;
  const length = (dna.count - 1) * BDNA.rise;

  dom.statBp.textContent = String(dna.count);
  dom.statTurns.textContent = turns.toFixed(1).replace(".", ",");
  dom.statLength.innerHTML = `${length.toFixed(1).replace(".", ",")}<small>нм</small>`;
  if (dom.seqTotal) dom.seqTotal.textContent = `${dna.count} п.о.`;
}

function renderSequence() {
  if (!dom.seqRows || !state.sequence) return;

  const sequence = state.sequence;
  const focus = state.seqFocus;
  const start = 0;

  let markup = "";
  for (let row = 0; row < SEQ_ROWS; row += 1) {
    let line = "";
    for (let col = 0; col < SEQ_COLS; col += 1) {
      const index = start + row * SEQ_COLS + col;
      const wrapped = ((index % sequence.length) + sequence.length) % sequence.length;
      const base = sequence[wrapped];
      const isFocus = index === focus;
      line += `<span class="seq__base${isFocus ? " seq__base--focus" : ""}" style="--c:${BASES[base].color}">${base}</span>`;
    }
    markup += `<div class="seq__row">${line}</div>`;
  }

  dom.seqRows.innerHTML = markup;
}

function setSequenceFocus(bp) {
  if (state.seqFocus === bp) return;
  state.seqFocus = bp;
  renderSequence();
}

function openDrawer() {
  state.drawerOpen = true;
  document.body.classList.add("has-drawer");
  dom.drawer.setAttribute("aria-hidden", "false");
  dom.infoBtn.setAttribute("aria-expanded", "true");
  hideHint();
  closeTooltip();

  requestAnimationFrame(() => {
    if (state.drawerOpen) dom.infoClose.focus({ preventScroll: true });
  });
}

function closeDrawer() {
  if (!state.drawerOpen) return;
  state.drawerOpen = false;
  document.body.classList.remove("has-drawer");
  dom.drawer.setAttribute("aria-hidden", "true");
  dom.infoBtn.setAttribute("aria-expanded", "false");
  dom.infoBtn.focus({ preventScroll: true });
}

function onKeyDown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target instanceof HTMLElement && event.target.closest("input, textarea")) return;

  if (event.key === "Escape") {
    closeDrawer();
    return;
  }

  if (state.drawerOpen) return;

  if (event.key === "1") applyView("overview");
  else if (event.key === "2") applyView("helix");
  else if (event.key === "3") applyView("pair");
  else if (event.key === "r" || event.key === "R" || event.key === "к" || event.key === "К") {
    setAutoRotate(!state.autoRotate);
  } else if (event.key === "i" || event.key === "I" || event.key === "ш" || event.key === "Ш") {
    openDrawer();
  }
}

function hideHint() {
  if (state.hintHidden) return;
  state.hintHidden = true;
  dom.hint.classList.add("is-hidden");
}

/* -------------------------------------------------------------------------- */
/* Взаимодействие                                                             */
/* -------------------------------------------------------------------------- */

function setupInteractions() {
  dom.canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  dom.canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") return;
    state.pointerInside = false;
    setHovered(-1);
    setSequenceFocus(null);
    closeTooltip();
  });
  dom.canvas.addEventListener("pointerdown", (event) => {
    hideHint();
    if (event.pointerType === "touch") {
      // Тап отличается от перетаскивания: решение принимаем на pointerup,
      // чтобы вращение спирали не оставляло «залипшую» подсказку.
      state.touchStart = { x: event.clientX, y: event.clientY };
    }
  });
  dom.canvas.addEventListener("pointerup", (event) => {
    const start = state.touchStart;
    state.touchStart = null;
    if (event.pointerType !== "touch" || !start) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 12) return;
    state.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
    state.pointerClient.x = event.clientX;
    state.pointerClient.y = event.clientY;
    pickPair(true);
  });
  dom.canvas.addEventListener("wheel", hideHint, { passive: true });

  controls.addEventListener("start", () => {
    if (state.tween) {
      state.tween = null;
      controls.autoRotate = state.autoRotate;
      controls.update();
    }
    setActiveView(null);
    closeTooltip();
    setHovered(-1);
    setSequenceFocus(null);
    hideHint();
  });

  setTimeout(hideHint, 11000);
}

function onPointerMove(event) {
  if (event.pointerType === "touch") return;
  state.pointer.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1,
  );
  state.pointerClient.x = event.clientX;
  state.pointerClient.y = event.clientY;
  state.pointerInside = true;
}

function pickPair(force = false) {
  if (!dna || state.tween) return;

  const now = performance.now();
  if (!force && now - state.lastPick < 55) return;
  state.lastPick = now;

  raycaster.setFromCamera(state.pointer, camera);
  const hits = raycaster.intersectObject(dna.pickers, false);

  if (!hits.length) {
    setHovered(-1);
    setSequenceFocus(null);
    closeTooltip();
    return;
  }

  const instanceId = hits[0].instanceId;
  if (instanceId === undefined) return;

  const info = dna.pickMap[instanceId];
  if (!info) return;

  setHovered(instanceId);
  setSequenceFocus(info.bp);
  showTooltip(info);
}

function setHovered(index) {
  if (index === state.hovered) return;
  if (state.hovered >= 0) dna.setHighlight(state.hovered, false);
  state.hovered = index;
  if (index >= 0) dna.setHighlight(index, true);
}

function showTooltip(info) {
  const pair = `${info.base}–${info.pair}`;
  const pairName = `${BASES[info.base].name} · ${BASES[info.pair].name}`;

  dom.tipIndex.textContent = `пара ${String(info.bp + 1).padStart(3, "0")} / ${dna.count}`;
  dom.tipPair.textContent = pair;
  dom.tipMeta.textContent = `${info.hbonds} водородные связи · ${pairName}`;

  const x = THREE.MathUtils.clamp(state.pointerClient.x, 130, window.innerWidth - 130);
  const y = Math.max(state.pointerClient.y, 120);

  dom.tooltip.style.left = `${x}px`;
  dom.tooltip.style.top = `${y}px`;
  dom.tooltip.classList.add("is-visible");
  dom.tooltip.setAttribute("aria-hidden", "false");
}

function closeTooltip() {
  dom.tooltip.classList.remove("is-visible");
  dom.tooltip.setAttribute("aria-hidden", "true");
}

/* -------------------------------------------------------------------------- */
/* Цикл                                                                       */
/* -------------------------------------------------------------------------- */

function animate() {
  requestAnimationFrame(animate);
  if (!state.ready || document.hidden) return;

  const now = performance.now();
  const tweening = updateTween(now);

  if (!tweening) controls.update();

  timer.update();
  const time = timer.getElapsed();
  dna.update(state.reducedMotion ? 0 : time);

  dust.material.uniforms.uTime.value = state.reducedMotion ? 0 : time;
  dust.rotation.y = state.reducedMotion ? 0 : time * 0.006;


  if (!tweening) {
    if (state.pointerInside) pickPair();
  }

  composer.render();
}

/* -------------------------------------------------------------------------- */
/* Служебное                                                                  */
/* -------------------------------------------------------------------------- */

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  const pixelRatio = Math.min(window.devicePixelRatio || 1, state.isMobile ? 1.75 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  dust.material.uniforms.uPixelRatio.value = pixelRatio;
  closeTooltip();
}
