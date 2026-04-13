import * as THREE from 'three';

// ─── GLOBALS ──────────────────────────────────────────────────────────────────
let scene, camera, renderer, clock;
let fish, gator;
let orbs = [], hazards = [], door = null;
let score = 0, level = 1, lives = 3;
let gameRunning = false;
let orbsCollected = 0, totalOrbs = 0;
let doorOpen = false;
let galaxyParticles;
let cameraShake = 0;
let fishTrail = [];
let gatorTrail = [];
let glowLights = [];
let levelLabel, orbLabel, livesEl, messageEl, flashEl;
let endingShown = false;

const WORLD_W = 28, WORLD_H = 16;
const FISH_SPEED = 7, GATOR_SPEED = 3.3;
const FISH_COL = 0xffd700, GATOR_COL = 0x44cc44;
const ORB_COL = 0x0055ff;
const DOOR_COL = 0xcc8800;

const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ─── MOBILE JOYSTICK STATE ────────────────────────────────────────────────────
let mobileMode = false;
const joy = {
  left:  { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 },
  right: { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 }
};
const JOY_RADIUS = 60;

function setupMobileControls() {
  const joyLeft  = document.getElementById('joystick-left');
  const joyRight = document.getElementById('joystick-right');
  const knobL    = document.getElementById('knob-left');
  const knobR    = document.getElementById('knob-right');
  joyLeft.style.display  = 'flex';
  joyRight.style.display = 'flex';
  document.getElementById('player-labels').style.display = 'none';

  function getRect(el) { return el.getBoundingClientRect(); }

  function onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const lRect = getRect(joyLeft);
      const rRect = getRect(joyRight);
      if (t.clientX >= lRect.left && t.clientX <= lRect.right &&
          t.clientY >= lRect.top  && t.clientY <= lRect.bottom) {
        joy.left.active = true; joy.left.id = t.identifier;
        joy.left.cx = lRect.left + lRect.width / 2;
        joy.left.cy = lRect.top  + lRect.height / 2;
      } else if (t.clientX >= rRect.left && t.clientX <= rRect.right &&
                 t.clientY >= rRect.top  && t.clientY <= rRect.bottom) {
        joy.right.active = true; joy.right.id = t.identifier;
        joy.right.cx = rRect.left + rRect.width / 2;
        joy.right.cy = rRect.top  + rRect.height / 2;
      }
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const [side, knob] of [[joy.left, knobL], [joy.right, knobR]]) {
        if (side.active && side.id === t.identifier) {
          let dx = t.clientX - side.cx;
          let dy = t.clientY - side.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > JOY_RADIUS) { dx = dx / dist * JOY_RADIUS; dy = dy / dist * JOY_RADIUS; }
          side.dx = dx / JOY_RADIUS;
          side.dy = dy / JOY_RADIUS;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        }
      }
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (joy.left.active  && joy.left.id  === t.identifier) { joy.left.active  = false; joy.left.dx  = 0; joy.left.dy  = 0; knobL.style.transform = ''; }
      if (joy.right.active && joy.right.id === t.identifier) { joy.right.active = false; joy.right.dx = 0; joy.right.dy = 0; knobR.style.transform = ''; }
    }
  }

  document.addEventListener('touchstart', onTouchStart, { passive: false });
  document.addEventListener('touchmove',  onTouchMove,  { passive: false });
  document.addEventListener('touchend',   onTouchEnd,   { passive: false });
  document.addEventListener('touchcancel',onTouchEnd,   { passive: false });
}

// ─── LEVEL DEFINITIONS ────────────────────────────────────────────────────────
const LEVELS = [
  { // Level 1 – Gentle intro
    orbCount: 6,
    hazardCount: 4,
    hazardSpeed: 2.8,
    orbPositions: null, // random
    bg: { fogColor: 0x000010, fogDensity: 0.018 }
  },
  { // Level 2 – Picking up pace
    orbCount: 9,
    hazardCount: 7,
    hazardSpeed: 4.2,
    orbPositions: null,
    bg: { fogColor: 0x050008, fogDensity: 0.022 }
  },
  { // Level 3 – Intense
    orbCount: 12,
    hazardCount: 11,
    hazardSpeed: 5.8,
    orbPositions: null,
    bg: { fogColor: 0x000005, fogDensity: 0.026 }
  }
];

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  levelLabel = document.getElementById('level-display');
  orbLabel = document.getElementById('orbs-left');
  livesEl = document.getElementById('lives');
  messageEl = document.getElementById('message');
  flashEl = document.getElementById('transition-flash');

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000010, 0.018);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 6, 22);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  clock = new THREE.Clock();

  // Lighting
  const ambient = new THREE.AmbientLight(0x111133, 0.8);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0x8899ff, 1.5);
  sun.position.set(10, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 100;
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  const backLight = new THREE.DirectionalLight(0xff6600, 0.3);
  backLight.position.set(-10, -5, -10);
  scene.add(backLight);

  // Galaxy background
  buildGalaxy();

  // Arena floor (subtle grid)
  buildArena();

  window.addEventListener('resize', onResize);
}

function buildGalaxy() {
  const count = 8000;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const starColors = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xaaaaff),
    new THREE.Color(0xffaaaa),
    new THREE.Color(0xaaffff),
    new THREE.Color(0xffddaa),
  ];

  for (let i = 0; i < count; i++) {
    const r = 80 + Math.random() * 120;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const c = starColors[Math.floor(Math.random() * starColors.length)];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    sizes[i] = Math.random() * 2 + 0.3;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 0.3,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
  });

  galaxyParticles = new THREE.Points(geo, mat);
  scene.add(galaxyParticles);

  // Nebula clouds
  for (let n = 0; n < 5; n++) {
    const nebGeo = new THREE.SphereGeometry(15 + Math.random() * 20, 8, 8);
    const nebMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.8, 0.1),
      transparent: true,
      opacity: 0.06,
      wireframe: false,
      side: THREE.BackSide
    });
    const neb = new THREE.Mesh(nebGeo, nebMat);
    neb.position.set(
      (Math.random() - 0.5) * 120,
      (Math.random() - 0.5) * 60,
      (Math.random() - 0.5) * 120
    );
    scene.add(neb);
  }
}

function buildArena() {
  // Invisible boundary walls (for collision)
  // Subtle glowing arena border
  const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(WORLD_W, WORLD_H, 0.1));
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x224488, transparent: true, opacity: 0.4 });
  const edgeMesh = new THREE.LineSegments(edgeGeo, edgeMat);
  edgeMesh.position.z = 0;
  scene.add(edgeMesh);
}

// ─── ENTITY BUILDERS ──────────────────────────────────────────────────────────

function buildFish() {
  const group = new THREE.Group();

  // Body
  const bodyGeo = new THREE.SphereGeometry(0.55, 16, 12);
  bodyGeo.scale(1.5, 1, 0.8);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: FISH_COL, roughness: 0.3, metalness: 0.6,
    emissive: new THREE.Color(0xaa6600), emissiveIntensity: 0.3
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  group.add(body);

  // Tail
  const tailGeo = new THREE.ConeGeometry(0.35, 0.7, 4);
  tailGeo.rotateZ(Math.PI / 2);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xcc8800, roughness: 0.4, metalness: 0.5 });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.position.set(-0.9, 0, 0);
  tail.castShadow = true;
  group.add(tail);

  // Eye
  const eyeGeo = new THREE.SphereGeometry(0.14, 8, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.set(0.5, 0.25, 0.45);
  group.add(eye);

  // Eye glow
  const eyeGlowGeo = new THREE.SphereGeometry(0.07, 6, 6);
  const eyeGlowMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const eyeGlow = new THREE.Mesh(eyeGlowGeo, eyeGlowMat);
  eyeGlow.position.set(0.5, 0.25, 0.55);
  group.add(eyeGlow);

  // Fin on top
  const finGeo = new THREE.ConeGeometry(0.2, 0.5, 6);
  const finMat = new THREE.MeshStandardMaterial({ color: 0xffa500, roughness: 0.5 });
  const fin = new THREE.Mesh(finGeo, finMat);
  fin.position.set(0.1, 0.55, 0);
  group.add(fin);

  // Point light on fish
  const fishLight = new THREE.PointLight(0xffd700, 1.5, 5);
  fishLight.position.set(0, 0, 0);
  group.add(fishLight);

  group.position.set(5, -3, 0);
  group.userData.velocity = new THREE.Vector3();
  group.userData.light = fishLight;
  scene.add(group);
  return group;
}

function buildGator() {
  const group = new THREE.Group();
  const S = 0.5; // scale factor — matches fish footprint

  // Body
  const bodyGeo = new THREE.BoxGeometry(2.8 * S, 0.6 * S, 0.9 * S);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: GATOR_COL, roughness: 0.7, metalness: 0.2,
    emissive: new THREE.Color(0x114400), emissiveIntensity: 0.2
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.BoxGeometry(1.1 * S, 0.5 * S, 0.85 * S);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x33aa33, roughness: 0.6, metalness: 0.1 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(1.8 * S, 0, 0);
  head.castShadow = true;
  group.add(head);

  // Snout
  const snoutGeo = new THREE.BoxGeometry(0.7 * S, 0.3 * S, 0.7 * S);
  const snoutMat = new THREE.MeshStandardMaterial({ color: 0x44bb44, roughness: 0.7 });
  const snout = new THREE.Mesh(snoutGeo, snoutMat);
  snout.position.set(2.55 * S, -0.05 * S, 0);
  group.add(snout);

  // Eyes
  for (let side of [-1, 1]) {
    const eyeGeo = new THREE.SphereGeometry(0.12 * S, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xaaaa00, emissiveIntensity: 0.5 });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(1.75 * S, 0.33 * S, side * 0.35 * S);
    group.add(eye);
  }

  // Tail
  const tailGeo = new THREE.ConeGeometry(0.25 * S, 1.4 * S, 4);
  tailGeo.rotateZ(-Math.PI / 2);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x228822, roughness: 0.8 });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.position.set(-1.9 * S, 0, 0);
  group.add(tail);

  // Legs
  for (let [x, z] of [[-0.6, 0.5], [-0.6, -0.5], [0.6, 0.5], [0.6, -0.5]]) {
    const legGeo = new THREE.CylinderGeometry(0.1 * S, 0.08 * S, 0.6 * S, 6);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x33aa33, roughness: 0.8 });
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x * S, -0.5 * S, z * S);
    leg.rotation.z = Math.PI / 6 * (z > 0 ? 1 : -1);
    group.add(leg);
  }

  // Spine bumps
  for (let i = 0; i < 6; i++) {
    const bumpGeo = new THREE.ConeGeometry(0.08 * S, 0.25 * S, 4);
    const bumpMat = new THREE.MeshStandardMaterial({ color: 0x228822 });
    const bump = new THREE.Mesh(bumpGeo, bumpMat);
    bump.position.set((0.8 - i * 0.4) * S, 0.38 * S, 0);
    group.add(bump);
  }

  const gatorLight = new THREE.PointLight(0x44ff44, 1, 4);
  group.add(gatorLight);

  group.position.set(-6, 2, 0);
  group.userData.velocity = new THREE.Vector3();
  scene.add(group);
  return group;
}

function buildOrb(x, y) {
  const group = new THREE.Group();

  const outerGeo = new THREE.SphereGeometry(0.4, 16, 16);
  const outerMat = new THREE.MeshStandardMaterial({
    color: ORB_COL, roughness: 0.1, metalness: 0.8,
    emissive: new THREE.Color(ORB_COL), emissiveIntensity: 0.6,
    transparent: true, opacity: 0.9
  });
  const outer = new THREE.Mesh(outerGeo, outerMat);
  group.add(outer);

  const innerGeo = new THREE.SphereGeometry(0.2, 8, 8);
  const innerMat = new THREE.MeshBasicMaterial({ color: 0xaaccff });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  group.add(inner);

  const light = new THREE.PointLight(0x0077ff, 1.2, 4);
  group.add(light);

  group.position.set(x, y, 0);
  group.userData.collected = false;
  group.userData.bobOffset = Math.random() * Math.PI * 2;
  scene.add(group);
  return group;
}

function buildHazard(x, y) {
  const group = new THREE.Group();

  const outerGeo = new THREE.SphereGeometry(0.4, 16, 16);
  const outerMat = new THREE.MeshStandardMaterial({
    color: 0xff2200, roughness: 0.1, metalness: 0.8,
    emissive: new THREE.Color(0xcc1100), emissiveIntensity: 0.7,
    transparent: true, opacity: 0.9
  });
  const mesh = new THREE.Mesh(outerGeo, outerMat);
  group.add(mesh);

  const innerGeo = new THREE.SphereGeometry(0.2, 8, 8);
  const innerMat = new THREE.MeshBasicMaterial({ color: 0xffaaaa });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  group.add(inner);

  const light = new THREE.PointLight(0xff2200, 1.2, 4);
  group.add(light);

  const angle = Math.random() * Math.PI * 2;
  const speed = (Math.random() * 0.5 + 0.75) * LEVELS[level - 1].hazardSpeed;
  group.position.set(x, y, 0);
  group.userData.vx = Math.cos(angle) * speed;
  group.userData.vy = Math.sin(angle) * speed;
  group.userData.rotSpeed = (Math.random() - 0.5) * 3;
  scene.add(group);
  return group;
}

function buildDoor(x, y) {
  const group = new THREE.Group();

  // Door frame
  const frameGeo = new THREE.BoxGeometry(1.6, 2.4, 0.2);
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xcc7700, roughness: 0.4, metalness: 0.7,
    emissive: 0x663300, emissiveIntensity: 0.3
  });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  group.add(frame);

  // Door fill
  const fillGeo = new THREE.BoxGeometry(1.2, 2.0, 0.15);
  const fillMat = new THREE.MeshStandardMaterial({
    color: 0x8b4513, roughness: 0.6, metalness: 0.3,
    emissive: 0x441100, emissiveIntensity: 0.2
  });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.position.z = 0.03;
  group.add(fill);

  // Door handle
  const handleGeo = new THREE.SphereGeometry(0.12, 8, 8);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0.45, 0, 0.15);
  group.add(handle);

  // "NEXT" text arrow indicator (3 triangles)
  for (let i = 0; i < 3; i++) {
    const arrowGeo = new THREE.ConeGeometry(0.15, 0.3, 3);
    arrowGeo.rotateZ(-Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.set(1.1 + i * 0.35, 0, 0.2);
    group.add(arrow);
  }

  const doorLight = new THREE.PointLight(0xff8800, 0, 6); // starts off
  doorLight.position.set(0, 0, 1);
  group.add(doorLight);
  group.userData.light = doorLight;

  group.position.set(x, y, 0);
  group.visible = false;
  scene.add(group);
  return group;
}

// ─── LEVEL SETUP ──────────────────────────────────────────────────────────────

function setupLevel(lvl) {
  // Clean up old entities
  orbs.forEach(o => scene.remove(o));
  hazards.forEach(h => scene.remove(h));
  if (door) scene.remove(door);
  fishTrail.forEach(t => scene.remove(t));
  gatorTrail.forEach(t => scene.remove(t));
  orbs = []; hazards = []; fishTrail = []; gatorTrail = [];
  doorOpen = false;
  orbsCollected = 0;

  const cfg = LEVELS[lvl - 1];
  totalOrbs = cfg.orbCount;

  // Update fog
  scene.fog = new THREE.FogExp2(cfg.bg.fogColor, cfg.bg.fogDensity);

  // Place orbs
  for (let i = 0; i < cfg.orbCount; i++) {
    const x = (Math.random() - 0.5) * (WORLD_W - 3);
    const y = (Math.random() - 0.5) * (WORLD_H - 3);
    orbs.push(buildOrb(x, y));
  }

  // Place hazards
  for (let i = 0; i < cfg.hazardCount; i++) {
    const x = (Math.random() - 0.5) * (WORLD_W - 4);
    const y = (Math.random() - 0.5) * (WORLD_H - 4);
    hazards.push(buildHazard(x, y));
  }

  // Place door (off-screen until orbs collected)
  door = buildDoor(WORLD_W / 2 - 1.5, (Math.random() - 0.5) * (WORLD_H - 3));

  // Reset fish & gator positions
  if (fish) fish.position.set(5, -3, 0);
  if (gator) gator.position.set(-6, 2, 0);

  updateUI();
  levelLabel.textContent = `Level ${lvl}`;
}

// ─── UPDATE UI ────────────────────────────────────────────────────────────────

function updateUI() {
  document.getElementById('score').textContent = `Score: ${score}`;
  const remaining = totalOrbs - orbsCollected;
  orbLabel.textContent = remaining > 0 ? `Orbs: ${remaining} left` : `Find the DOOR!`;
  livesEl.textContent = 'Lives: ' + '❤'.repeat(lives) + '🖤'.repeat(Math.max(0, 3 - lives));
}

// ─── FLASH MESSAGE ────────────────────────────────────────────────────────────

function showMessage(text, duration = 1500, color = '#fff') {
  messageEl.textContent = text;
  messageEl.style.color = color;
  messageEl.style.opacity = '1';
  setTimeout(() => { messageEl.style.opacity = '0'; }, duration);
}

function flashScreen() {
  flashEl.style.opacity = '0.6';
  setTimeout(() => { flashEl.style.opacity = '0'; }, 150);
}

// ─── GAME START ───────────────────────────────────────────────────────────────

window.startGame = function (mode) {
  mobileMode = (mode === 'mobile');
  document.getElementById('overlay').style.display = 'none';
  score = 0; level = 1; lives = 3; endingShown = false;
  gameRunning = true;
  if (mobileMode) setupMobileControls();

  if (!scene) init();
  if (fish) scene.remove(fish);
  if (gator) scene.remove(gator);
  fish = buildFish();
  gator = buildGator();

  setupLevel(1);
  renderer.setAnimationLoop(gameLoop);
};

window.restartGame = function () {
  document.getElementById('ending-overlay').style.display = 'none';
  window.startGame();
};

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────

let deathCooldown = 0;

function gameLoop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!gameRunning) return;

  deathCooldown = Math.max(0, deathCooldown - dt);

  // Galaxy slow rotation
  if (galaxyParticles) galaxyParticles.rotation.y += dt * 0.01;

  // Input
  handleInput(dt);

  // Move hazards
  updateHazards(dt);

  // Animate orbs
  animateOrbs(dt);

  // Animate door
  if (door && doorOpen) animateDoor(dt);

  // Check collisions
  if (deathCooldown <= 0) checkCollisions();

  // Camera
  updateCamera(dt);

  // Trails
  updateTrails();

  renderer.render(scene, camera);
}

// ─── INPUT ────────────────────────────────────────────────────────────────────

function handleInput(dt) {
  // Gator – WASD or left joystick
  let gvx = 0, gvy = 0;
  if (mobileMode) {
    gvx = joy.left.dx; gvy = -joy.left.dy;
  } else {
    if (keys['KeyW']) gvy += 1;
    if (keys['KeyS']) gvy -= 1;
    if (keys['KeyA']) gvx -= 1;
    if (keys['KeyD']) gvx += 1;
  }

  if (gvx !== 0 || gvy !== 0) {
    const len = Math.sqrt(gvx * gvx + gvy * gvy);
    gvx /= len; gvy /= len;
    gator.position.x += gvx * GATOR_SPEED * dt;
    gator.position.y += gvy * GATOR_SPEED * dt;
    // Face direction
    if (gvx !== 0) gator.scale.x = gvx > 0 ? 1 : -1;
    // Leg animation
    gator.children.forEach((c, i) => {
      if (i >= 8 && i <= 11) c.rotation.x = Math.sin(Date.now() * 0.01 + i) * 0.4;
    });
  }

  // Fish – Arrows or right joystick
  let fvx = 0, fvy = 0;
  if (mobileMode) {
    fvx = joy.right.dx; fvy = -joy.right.dy;
  } else {
    if (keys['ArrowUp']) fvy += 1;
    if (keys['ArrowDown']) fvy -= 1;
    if (keys['ArrowLeft']) fvx -= 1;
    if (keys['ArrowRight']) fvx += 1;
  }

  if (fvx !== 0 || fvy !== 0) {
    const len = Math.sqrt(fvx * fvx + fvy * fvy);
    fvx /= len; fvy /= len;
    fish.position.x += fvx * FISH_SPEED * dt;
    fish.position.y += fvy * FISH_SPEED * dt;
    if (fvx !== 0) fish.scale.x = fvx > 0 ? 1 : -1;
  }

  // Bobbing
  fish.position.z = Math.sin(Date.now() * 0.003) * 0.3;
  gator.position.z = Math.cos(Date.now() * 0.002) * 0.2;

  // Clamp to world bounds
  const hw = WORLD_W / 2 - 1, hh = WORLD_H / 2 - 1;
  fish.position.x = Math.max(-hw, Math.min(hw, fish.position.x));
  fish.position.y = Math.max(-hh, Math.min(hh, fish.position.y));
  gator.position.x = Math.max(-hw, Math.min(hw, gator.position.x));
  gator.position.y = Math.max(-hh, Math.min(hh, gator.position.y));
}

// ─── HAZARDS ─────────────────────────────────────────────────────────────────

function updateHazards(dt) {
  hazards.forEach(h => {
    h.position.x += h.userData.vx * dt;
    h.position.y += h.userData.vy * dt;
    h.rotation.x += h.userData.rotSpeed * dt;
    h.rotation.z += h.userData.rotSpeed * 0.7 * dt;

    // Bounce off walls
    const hw = WORLD_W / 2 - 0.5, hh = WORLD_H / 2 - 0.5;
    if (h.position.x > hw) { h.position.x = hw; h.userData.vx *= -1; }
    if (h.position.x < -hw) { h.position.x = -hw; h.userData.vx *= -1; }
    if (h.position.y > hh) { h.position.y = hh; h.userData.vy *= -1; }
    if (h.position.y < -hh) { h.position.y = -hh; h.userData.vy *= -1; }
  });
}

// ─── ORB ANIMATION ────────────────────────────────────────────────────────────

function animateOrbs(dt) {
  const t = Date.now() * 0.001;
  orbs.forEach(o => {
    if (o.userData.collected) return;
    o.position.z = Math.sin(t * 2 + o.userData.bobOffset) * 0.4;
    o.rotation.y += dt * 1.5;
    o.rotation.x += dt * 0.8;
    // Pulse scale
    const s = 1 + Math.sin(t * 3 + o.userData.bobOffset) * 0.1;
    o.scale.set(s, s, s);
  });
}

function animateDoor(dt) {
  if (!door) return;
  door.rotation.y += dt * 0.5;
  const t = Date.now() * 0.001;
  door.userData.light.intensity = 2 + Math.sin(t * 4) * 1;
  door.position.z = Math.sin(t * 2) * 0.3;
}

// ─── COLLISIONS ───────────────────────────────────────────────────────────────

function checkCollisions() {
  const fishPos = fish.position;

  // Fish vs Orbs
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    if (o.userData.collected) continue;
    const dist = fishPos.distanceTo(o.position);
    if (dist < 1.1) {
      collectOrb(o, i);
    }
  }

  // Fish vs Hazards
  hazards.forEach(h => {
    const dist = fishPos.distanceTo(h.position);
    if (dist < 1.0) {
      fishDeath();
    }
  });

  // Fish vs Gator
  const gDist = fishPos.distanceTo(gator.position);
  if (gDist < 1.0) {
    fishDeath();
  }

  // Fish vs Door
  if (doorOpen && door) {
    const dDist = fishPos.distanceTo(door.position);
    if (dDist < 1.8) {
      nextLevel();
    }
  }
}

function collectOrb(orb, idx) {
  score += 100;
  orbsCollected++;
  orb.userData.collected = true;
  scene.remove(orb);
  orbs.splice(idx, 1);

  // Burst particles
  spawnCollectBurst(orb.position.clone());

  // Check if all collected
  if (orbsCollected >= totalOrbs) {
    doorOpen = true;
    door.visible = true;
    door.userData.light.intensity = 3;
    showMessage('All orbs! Find the DOOR!', 2000, '#ffd700');
    flashScreen();
  }

  updateUI();
}

function spawnCollectBurst(pos) {
  for (let i = 0; i < 12; i++) {
    const geo = new THREE.SphereGeometry(0.08, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(Math.random() * 0.1, 1, 0.7) });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(pos);
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 4;
    p.userData.vx = Math.cos(angle) * speed;
    p.userData.vy = Math.sin(angle) * speed;
    p.userData.life = 0.5;
    scene.add(p);

    // Animate and remove
    const start = Date.now();
    const animate = () => {
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed > 0.5) { scene.remove(p); return; }
      p.position.x += p.userData.vx * 0.016;
      p.position.y += p.userData.vy * 0.016;
      p.userData.vx *= 0.92;
      p.userData.vy *= 0.92;
      p.material.opacity = 1 - elapsed / 0.5;
      p.material.transparent = true;
      requestAnimationFrame(animate);
    };
    animate();
  }
}

function fishDeath() {
  if (deathCooldown > 0) return;
  deathCooldown = 2;
  lives--;
  cameraShake = 0.5;
  flashScreen();

  if (lives <= 0) {
    showMessage('GAME OVER', 2000, '#ff3333');
    gameRunning = false;
    setTimeout(() => {
      document.getElementById('overlay').style.display = 'flex';
      document.getElementById('overlay').querySelector('h1').textContent = 'GAME OVER';
      document.getElementById('overlay').querySelector('.subtitle').textContent = `Score: ${score}`;
    }, 2200);
  } else {
    showMessage(`Ouch! ${lives} ${lives === 1 ? 'life' : 'lives'} left`, 1500, '#ff6666');
    fish.position.set(5, -3, 0);
  }
  updateUI();
}

function nextLevel() {
  gameRunning = false;
  flashScreen();
  const nextLvl = level + 1;

  if (nextLvl > 3) {
    // Trigger ending
    setTimeout(showEnding, 800);
    return;
  }

  showMessage(`Level ${nextLvl}!`, 1200, '#00ffff');
  setTimeout(() => {
    level = nextLvl;
    score += 500 * level;
    setupLevel(level);
    gameRunning = true;
    updateUI();
  }, 1500);
}

// ─── ENDING ───────────────────────────────────────────────────────────────────

function showEnding() {
  if (endingShown) return;
  endingShown = true;
  score += 2000;
  document.getElementById('final-score').textContent = `Final Score: ${score}`;
  const el = document.getElementById('ending-overlay');
  el.style.display = 'flex';

  // Launch a celebration particle shower
  launchCelebration();
}

function launchCelebration() {
  let count = 0;
  const interval = setInterval(() => {
    if (count++ > 100) { clearInterval(interval); return; }
    const geo = new THREE.SphereGeometry(0.15, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(Math.random(), 1, 0.6),
      transparent: true, opacity: 1
    });
    const p = new THREE.Mesh(geo, mat);
    p.position.set((Math.random() - 0.5) * WORLD_W, (Math.random() - 0.5) * WORLD_H, (Math.random() - 0.5) * 4);
    scene.add(p);
    const vy = 3 + Math.random() * 5;
    const vx = (Math.random() - 0.5) * 4;
    const start = Date.now();
    const anim = () => {
      const t = (Date.now() - start) / 1000;
      if (t > 3) { scene.remove(p); return; }
      p.position.x += vx * 0.016;
      p.position.y += vy * 0.016 - 4.9 * 0.016 * t;
      p.material.opacity = 1 - t / 3;
      requestAnimationFrame(anim);
    };
    anim();
  }, 60);
}

// ─── CAMERA ───────────────────────────────────────────────────────────────────

function updateCamera(dt) {
  // Smoothly track between fish and gator
  if (!fish || !gator) return;
  const midX = (fish.position.x + gator.position.x) / 2;
  const midY = (fish.position.y + gator.position.y) / 2;

  camera.position.x += (midX * 0.3 - camera.position.x) * dt * 2;
  camera.position.y += (midY * 0.15 + 6 - camera.position.y) * dt * 2;

  // Shake
  if (cameraShake > 0) {
    camera.position.x += (Math.random() - 0.5) * cameraShake;
    camera.position.y += (Math.random() - 0.5) * cameraShake;
    cameraShake -= dt * 2;
  }

  camera.lookAt(midX * 0.3, midY * 0.1, 0);
}

// ─── TRAILS ───────────────────────────────────────────────────────────────────

let trailTimer = 0;
function updateTrails() {
  trailTimer += 0.016;
  if (trailTimer < 0.05) return;
  trailTimer = 0;

  // Fish trail
  const fTrail = buildTrailDot(fish.position.clone(), 0xffd700);
  fishTrail.push(fTrail);
  scene.add(fTrail);
  if (fishTrail.length > 8) {
    scene.remove(fishTrail.shift());
  }

  // Gator trail
  const gTrail = buildTrailDot(gator.position.clone(), 0x44ff44);
  gatorTrail.push(gTrail);
  scene.add(gTrail);
  if (gatorTrail.length > 6) {
    scene.remove(gatorTrail.shift());
  }

  // Fade trails
  fishTrail.forEach((t, i) => { t.material.opacity = (i / fishTrail.length) * 0.4; });
  gatorTrail.forEach((t, i) => { t.material.opacity = (i / gatorTrail.length) * 0.3; });
}

function buildTrailDot(pos, color) {
  const geo = new THREE.SphereGeometry(0.12, 4, 4);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  return m;
}

// ─── RESIZE ───────────────────────────────────────────────────────────────────

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Boot
init();
