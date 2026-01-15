import { makeSpritePack, drawSprite } from "./sprites";

type StartGameArgs = {
  canvas: HTMLCanvasElement;
  scoreEl: HTMLDivElement;
  bestEl: HTMLDivElement;
  heatFillEl: HTMLDivElement;
  heatTextEl: HTMLSpanElement;
};

type GameState = "READY" | "RUNNING" | "GAMEOVER";
type ObKind = "CACTUS" | "FLYER" | "PIT";
type Stage = "EARLY" | "MID" | "LATE";

type GroundVariant =
  | "CACTUS_SINGLE"
  | "CACTUS_TALL"
  | "CACTUS_WIDE"
  | "CACTUS_CLUSTER_2"
  | "CACTUS_CLUSTER_3"
  | "ROCK_LOW"
  | "ROCK_WIDE"
  | "ROCK_STACK"
  | "STUMP";

type Ob = {
  kind: ObKind;
  x: number;
  y: number;
  w: number;
  h: number;

  flightLevel?: 0 | 1 | 2;

  variant?: GroundVariant;
  seed?: number;
  hardness?: number;
};

type Cloud = {
  x: number;
  y: number;
  scale: number;
  speedMul: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
};

type PatternStep =
  | { kind: "CACTUS"; gapBase: number; tallBias?: number }
  | { kind: "FLYER"; gapBase: number; level?: 0 | 1 | 2 }
  | { kind: "PIT"; gapBase: number; width?: number };

export function startGame({
  canvas,
  scoreEl,
  bestEl,
  heatFillEl,
  heatTextEl,
}: StartGameArgs) {
  const screenCtx = canvas.getContext("2d")!;
  const pxCanvas = document.createElement("canvas");
  const pxCtx = pxCanvas.getContext("2d")!;

  const SPR = makeSpritePack();

  // =========================
  // Step 2.5C: Ultrawide-safe camera
  // - Height is fixed (360)
  // - Width adapts to the canvas/frame aspect
  // =========================
  const BASE_VIEW_H = 360;
  const MIN_VIEW_W = 640;   // baseline
  const MAX_VIEW_W = 1280;  // cap so it doesn’t get too easy/empty
  const SNAP = 16;          // keep width snapped (stable pixel math)

  let screenW = 0;
  let screenH = 0;

  // Internal camera resolution (pxCanvas)
  let viewW = MIN_VIEW_W;
  let viewH = BASE_VIEW_H;

  // presentation scale (FIT). Integer scaling when possible (>=2), otherwise use fit.
  let presentScale = 1;

  function applyNearestNeighbor() {
    pxCtx.imageSmoothingEnabled = false;
    screenCtx.imageSmoothingEnabled = false;
  }

  function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
  }

  function snapTo(n: number, step: number) {
    return Math.round(n / step) * step;
  }

  // Physics / feel
  const GRAVITY = 1800;
  const JUMP_VELOCITY = -640;
  const JUMP_CUT_VELOCITY = -220;

  const COYOTE_TIME = 0.10;
  const JUMP_BUFFER_TIME = 0.12;

  const MAX_JUMP_HOLD = 0.16;
  const HOLD_GRAVITY_MULT = 0.55;
  const FAST_FALL_MULT = 1.85;

  const HIT_PAD = 4;

  // Sprite-sized player
  const STAND_W = 32;
  const STAND_H = 32;
  const DUCK_W = 32;
  const DUCK_H = 24;

  // Fixed timestep
  const FIXED_DT = 1 / 120;
  const MAX_ACCUM = 0.25;

  // Pit
  const PIT_MIN_W = 90;
  const PIT_MAX_W_HARDCAP = 240;
  const PIT_VISUAL_DEPTH = 84;

  const PIT_SPAWN_SCORE_GATE = 120;
  const PIT_BASE_CHANCE = 0.12;
  const PIT_DIFFICULTY_BONUS = 0.16;

  const PIT_WARN_LEAD = 26;
  const PIT_EDGE_GLOW = 0.22;
  const PIT_FALL_LOCK_DEPTH = 8;

  // Pattern
  const PATTERN_SCORE_GATE = 260;
  const SAFE_AFTER_PIT_DIST = 240;
  const SAFE_AFTER_LOW_FLYER_DIST = 220;

  // Parallax speeds (relative to worldSpeed)
  const FAR_MUL = 0.18;
  const MID_MUL = 0.35;
  const NEAR_MUL = 0.55;

  // Ground strip height (tile)
  const GROUND_STRIP_H = 32;

  // Best
  const BEST_KEY = "rv_bestScore";
  let best = Number(localStorage.getItem(BEST_KEY) || "0");
  bestEl.textContent = `BEST ${String(best).padStart(5, "0")}`;

  // World
  let state: GameState = "READY";

  // Ground line (relative to viewH=360)
  let groundY = 272;

  let worldSpeed = 260;
  let score = 0;
  let animTime = 0;

  let distSinceSpawn = 0;
  let nextSpawnDist = 360;

  // Scroll offsets for parallax tiles
  let farOff = 0;
  let midOff = 0;
  let nearOff = 0;
  let groundOff = 0;

  const clouds: Cloud[] = [];
  let nextCloudSpawn = 0.7;

  const obs: Ob[] = [];

  let lastKind: ObKind = "CACTUS";
  let lastFlyLevel: 0 | 1 | 2 = 1;

  let lastSpawnHardness = 0.55;
  let lastSpawnWasHard = false;

  let patternQueue: PatternStep[] | null = null;
  let patternCooldownDist = 0;

  const recentPatterns: string[] = [];

  let guardAfterPit = 0;
  let guardAfterLowFlyer = 0;

  // Input
  let jumpDown = false;
  let downDown = false;

  let jumpBuffer = 0;
  let coyote = 0;
  let jumpHold = 0;

  let showHitboxes = false;

  // Particles
  const particles: Particle[] = [];

  // Pit fall lock
  let pitFall = false;

  // Dino
  const dino = {
    x: 90,
    y: 0,
    w: STAND_W,
    h: STAND_H,
    vy: 0,
    onGround: true,
    ducking: false,
  };

  // Utils
  function rand(min: number, max: number) {
    return min + Math.random() * (max - min);
  }
  function speedFactor() {
    return clamp(worldSpeed / 260, 1, 2.35);
  }
  function scaledGap(base: number) {
    return base * speedFactor();
  }
  function difficulty01() {
    return clamp((worldSpeed - 260) / 700, 0, 1);
  }
  function stage(): Stage {
    if (score < 600) return "EARLY";
    if (score < 1600) return "MID";
    return "LATE";
  }
  function jitter(n: number, amount: number) {
    return n + rand(-amount, amount);
  }

  function setScoreUI() {
    scoreEl.textContent = String(Math.floor(score)).padStart(5, "0");
    bestEl.textContent = `BEST ${String(best).padStart(5, "0")}`;
  }

  function setStatusUI() {
    heatTextEl.textContent = "DASH OFF";
    heatFillEl.style.width = `100%`;
    heatFillEl.style.opacity = "0.35";
  }

  function spawnDust(x: number, y: number, count: number, intensity = 1) {
    for (let i = 0; i < count; i++) {
      const life = rand(0.10, 0.22) * intensity;
      particles.push({
        x: x + rand(-6, 6),
        y: y + rand(-4, 4),
        vx: rand(-160, -60) * intensity,
        vy: rand(-90, 40) * intensity,
        life,
        max: life,
        size: rand(2, 4),
      });
    }
  }

  function mulberry32(seed: number) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedInt() {
    return (Math.random() * 0x7fffffff) | 0;
  }

  // =========================
  // Resize & Present (2.5C)
  // =========================
  function resize() {
    const rect = canvas.getBoundingClientRect();
    screenW = Math.max(1, Math.floor(rect.width));
    screenH = Math.max(1, Math.floor(rect.height));

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(screenW * dpr);
    canvas.height = Math.floor(screenH * dpr);

    // draw in CSS pixels
    screenCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fixed height camera, adaptive width camera
    viewH = BASE_VIEW_H;

    const aspect = screenW / screenH;
    const targetW = Math.round(viewH * aspect);
    const snappedW = snapTo(targetW, SNAP);
    viewW = clamp(snappedW, MIN_VIEW_W, MAX_VIEW_W);

    pxCanvas.width = viewW;
    pxCanvas.height = viewH;

    applyNearestNeighbor();

    // Ground line is stable for 360p
    groundY = 272;

    // Keep dino at a nice left-side “runner” position, but scale with width a bit
    const baseX = clamp(Math.round(viewW * 0.14), 86, 140);
    dino.x = clamp(baseX, 70, Math.max(70, viewW - 140));

    if (dino.onGround) {
      dino.y = groundY - dino.h;
      dino.vy = 0;
    } else {
      dino.y = Math.min(dino.y, groundY - dino.h);
    }
  }

  function present() {
    screenCtx.clearRect(0, 0, screenW, screenH);

    // FIT scaling: keep aspect, no cropping
    const fit = Math.min(screenW / viewW, screenH / viewH);

    // Smart pixel scaling:
    // - If we can scale 2x+ cleanly, use integer scale for crisp pixels.
    // - If we are between 1x and 2x (like 1.94), use fit so it doesn’t shrink to 1x.
    const intScale = Math.floor(fit);
    if (fit >= 2 && intScale >= 2) presentScale = intScale;
    else presentScale = fit;

    const destW = viewW * presentScale;
    const destH = viewH * presentScale;

    const dx = (screenW - destW) / 2;
    const dy = (screenH - destH) / 2;

    // Background behind the game image (letterbox area)
    screenCtx.save();
    screenCtx.fillStyle = "rgb(10, 12, 16)";
    screenCtx.fillRect(0, 0, screenW, screenH);
    screenCtx.restore();

    screenCtx.drawImage(pxCanvas, 0, 0, viewW, viewH, dx, dy, destW, destH);
  }

  // Reset
  function resetToReady() {
    state = "READY";

    worldSpeed = 260;
    score = 0;
    animTime = 0;

    dino.ducking = false;
    dino.w = STAND_W;
    dino.h = STAND_H;
    dino.vy = 0;
    dino.onGround = true;
    dino.y = groundY - dino.h;

    obs.length = 0;

    clouds.length = 0;
    for (let i = 0; i < 2; i++) {
      clouds.push({
        x: rand(20, viewW - 60),
        y: rand(18, Math.max(34, groundY - 90)),
        scale: rand(0.85, 1.25),
        speedMul: rand(0.10, 0.26),
      });
    }
    nextCloudSpawn = rand(0.7, 1.4);

    distSinceSpawn = 0;
    nextSpawnDist = 360;

    farOff = 0;
    midOff = 0;
    nearOff = 0;
    groundOff = 0;

    lastKind = "CACTUS";
    lastFlyLevel = 1;

    lastSpawnHardness = 0.55;
    lastSpawnWasHard = false;

    patternQueue = null;
    patternCooldownDist = 0;
    recentPatterns.length = 0;

    guardAfterPit = 0;
    guardAfterLowFlyer = 0;

    jumpBuffer = 0;
    coyote = COYOTE_TIME;
    jumpHold = 0;

    particles.length = 0;
    pitFall = false;

    setScoreUI();
    setStatusUI();
  }

  function startRunFresh() {
    state = "RUNNING";

    worldSpeed = 260;
    score = 0;
    animTime = 0;

    dino.ducking = false;
    dino.w = STAND_W;
    dino.h = STAND_H;
    dino.vy = 0;
    dino.onGround = true;
    dino.y = groundY - dino.h;

    obs.length = 0;

    distSinceSpawn = 0;
    nextSpawnDist = 320;

    farOff = 0;
    midOff = 0;
    nearOff = 0;
    groundOff = 0;

    lastKind = "CACTUS";
    lastFlyLevel = 1;

    lastSpawnHardness = 0.55;
    lastSpawnWasHard = false;

    patternQueue = null;
    patternCooldownDist = 0;
    recentPatterns.length = 0;

    guardAfterPit = 0;
    guardAfterLowFlyer = 0;

    coyote = COYOTE_TIME;
    jumpHold = 0;

    pitFall = false;

    setScoreUI();
    setStatusUI();
  }

  function restartRun() {
    startRunFresh();
  }

  function gameOver() {
    state = "GAMEOVER";
    const s = Math.floor(score);
    if (s > best) {
      best = s;
      localStorage.setItem(BEST_KEY, String(best));
    }
    setScoreUI();
  }

  // Jump/Duck
  function queueJump() {
    jumpBuffer = JUMP_BUFFER_TIME;
  }
  function cutJumpIfNeeded() {
    if (dino.vy < JUMP_CUT_VELOCITY) dino.vy = JUMP_CUT_VELOCITY;
  }
  function applyDuckVisual(duck: boolean) {
    if (!dino.onGround) {
      dino.ducking = false;
      return;
    }
    if (duck && !dino.ducking) {
      dino.ducking = true;
      dino.w = DUCK_W;
      dino.h = DUCK_H;
      dino.y = groundY - dino.h;
    } else if (!duck && dino.ducking) {
      dino.ducking = false;
      dino.w = STAND_W;
      dino.h = STAND_H;
      dino.y = groundY - dino.h;
    }
  }
  function performJump() {
    dino.ducking = false;
    dino.w = STAND_W;
    dino.h = STAND_H;
    dino.y = groundY - dino.h;

    dino.vy = JUMP_VELOCITY;
    dino.onGround = false;

    spawnDust(dino.x + 10, groundY - 8, 10, 1);
    jumpHold = 0;
    coyote = 0;
    jumpBuffer = 0;
  }
  function tryConsumeJump() {
    if (jumpBuffer <= 0) return;
    if (state === "READY") startRunFresh();
    if (state !== "RUNNING") return;
    const canJump = dino.onGround || coyote > 0;
    if (canJump) performJump();
  }

  // Hitboxes
  function dinoHitbox() {
    return {
      x: dino.x + HIT_PAD,
      y: dino.y + HIT_PAD,
      w: dino.w - HIT_PAD * 2,
      h: dino.h - HIT_PAD * 2,
    };
  }
  function obHitbox(o: Ob) {
    const pad = o.kind === "FLYER" ? 6 : HIT_PAD;
    return { x: o.x + pad, y: o.y + pad, w: o.w - pad * 2, h: o.h - pad * 2 };
  }
  function aabb(a: any, b: any) {
    return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
  }

  // Pits
  function pitSegmentsVisible() {
    const segs: { a: number; b: number }[] = [];
    for (const o of obs) {
      if (o.kind !== "PIT") continue;
      const a = o.x;
      const b = o.x + o.w;
      if (b < -40 || a > viewW + 40) continue;
      segs.push({ a, b });
    }
    segs.sort((p, q) => p.a - q.a);
    return segs;
  }
  function isOverPit(): boolean {
    const footA = dino.x + dino.w * 0.28;
    const footB = dino.x + dino.w * 0.78;
    for (const o of obs) {
      if (o.kind !== "PIT") continue;
      const a = o.x + 4;
      const b = o.x + o.w - 4;
      if (footB > a && footA < b) return true;
    }
    return false;
  }

  // Spawn helpers
  function maxGroundWidthCap(): number {
    const st = stage();
    const base = st === "EARLY" ? 115 : st === "MID" ? 155 : 190;
    const extra = clamp((worldSpeed - 260) * 0.08, 0, st === "LATE" ? 70 : 55);
    let cap = base + extra;
    if (guardAfterPit > 0) cap -= 35;
    if (guardAfterLowFlyer > 0 && st !== "LATE") cap -= 20;
    return clamp(cap, 90, 250);
  }
  function maxGroundHeightCap(): number {
    const st = stage();
    const base = st === "EARLY" ? 72 : st === "MID" ? 82 : 90;
    return base;
  }

  function computeGroundHardness(w: number, h: number, v: GroundVariant): number {
    const wCap = maxGroundWidthCap();
    const hCap = maxGroundHeightCap();
    const wN = clamp(w / wCap, 0, 1.25);
    const hN = clamp(h / hCap, 0, 1.25);

    let bonus = 0;
    if (v === "CACTUS_TALL") bonus += 0.10;
    if (v === "CACTUS_WIDE") bonus += 0.18;
    if (v === "CACTUS_CLUSTER_2") bonus += 0.28;
    if (v === "CACTUS_CLUSTER_3") bonus += 0.38;
    if (v === "ROCK_WIDE") bonus += 0.16;
    if (v === "ROCK_STACK") bonus += 0.22;
    if (v === "STUMP") bonus += 0.14;

    const hard = 0.35 + wN * 0.55 + hN * 0.35 + bonus;
    return clamp(hard, 0.30, 1.60);
  }

  function pickGroundVariant(tallBias = 0.45): GroundVariant {
    const st = stage();
    const d = difficulty01();
    const afterPit = guardAfterPit > 0 || lastKind === "PIT";
    const afterLowFly = guardAfterLowFlyer > 0;

    let wSingle = st === "EARLY" ? 4.6 : st === "MID" ? 3.2 : 2.4;
    let wTall = st === "EARLY" ? 2.2 : st === "MID" ? 2.0 : 1.6;
    let wWide = st === "EARLY" ? 0.5 : st === "MID" ? 1.6 : 2.2;
    let wStump = st === "EARLY" ? 0.9 : st === "MID" ? 1.0 : 1.1;

    let wCl2 = st === "EARLY" ? 0.25 : st === "MID" ? 1.1 : 1.8;
    let wCl3 = st === "EARLY" ? 0.0 : st === "MID" ? 0.55 : 1.35;

    let wRockLow = st === "EARLY" ? 1.4 : st === "MID" ? 1.2 : 0.9;
    let wRockWide = st === "EARLY" ? 0.3 : st === "MID" ? 0.9 : 1.3;
    let wRockStack = st === "EARLY" ? 0.1 : st === "MID" ? 0.55 : 1.2;

    const tb = clamp(tallBias, 0, 1);
    wTall *= 0.85 + tb * 0.55;
    wCl2 *= 0.85 + tb * 0.45;
    wCl3 *= 0.90 + tb * 0.50;

    const boost = 1 + d * (st === "LATE" ? 0.55 : 0.35);
    wWide *= boost;
    wCl2 *= boost;
    wCl3 *= boost;
    wRockWide *= boost * 0.9;
    wRockStack *= boost * 0.9;

    if (afterPit) {
      wWide *= 0.35;
      wCl2 *= 0.35;
      wCl3 *= 0.25;
      wRockWide *= 0.40;
      wRockStack *= 0.35;
    }
    if (afterLowFly && st !== "LATE") {
      wWide *= 0.70;
      wCl2 *= 0.75;
      wCl3 *= 0.60;
      wRockWide *= 0.75;
    }

    const poolAll: Array<{ v: GroundVariant; w: number }> = [
      { v: "CACTUS_SINGLE", w: wSingle },
      { v: "CACTUS_TALL", w: wTall },
      { v: "CACTUS_WIDE", w: wWide },
      { v: "CACTUS_CLUSTER_2", w: wCl2 },
      { v: "CACTUS_CLUSTER_3", w: wCl3 },
      { v: "ROCK_LOW", w: wRockLow },
      { v: "ROCK_WIDE", w: wRockWide },
      { v: "ROCK_STACK", w: wRockStack },
      { v: "STUMP", w: wStump },
    ];

    const pool = poolAll.filter((p) => p.w > 0.001);

    let total = 0;
    for (const p of pool) total += p.w;

    let r = Math.random() * total;
    for (const p of pool) {
      r -= p.w;
      if (r <= 0) return p.v;
    }
    return "CACTUS_SINGLE";
  }

  function makeGroundDims(v: GroundVariant, s: number): { w: number; h: number } {
    const st = stage();
    const d = difficulty01();
    const r = mulberry32(s);
    const rr = (a: number, b: number) => a + r() * (b - a);

    const wCap = maxGroundWidthCap();
    const hCap = maxGroundHeightCap();

    let w = 26, h = 44;

    if (v === "CACTUS_SINGLE") {
      w = rr(22, 34);
      h = rr(34, st === "EARLY" ? 56 : 62);
    } else if (v === "CACTUS_TALL") {
      w = rr(14, 22);
      h = rr(58, hCap);
    } else if (v === "CACTUS_WIDE") {
      w = rr(40, st === "EARLY" ? 62 : 78);
      h = rr(30, 50);
    } else if (v === "CACTUS_CLUSTER_2") {
      w = rr(50, st === "EARLY" ? 74 : 92);
      h = rr(40, st === "EARLY" ? 62 : 74);
    } else if (v === "CACTUS_CLUSTER_3") {
      w = rr(68, st === "MID" ? 100 : 118);
      h = rr(42, st === "MID" ? 72 : 80);
    } else if (v === "ROCK_LOW") {
      w = rr(26, 56);
      h = rr(16, 28);
    } else if (v === "ROCK_WIDE") {
      w = rr(56, st === "MID" ? 98 : 120);
      h = rr(16, 30);
    } else if (v === "ROCK_STACK") {
      w = rr(34, 66);
      h = rr(28, 48);
    } else if (v === "STUMP") {
      w = rr(34, 58);
      h = rr(34, 54);
    }

    if (st === "LATE") {
      w *= 1 + d * 0.08;
      h *= 1 + d * 0.06;
    }

    w = clamp(w, 14, wCap);
    h = clamp(h, 14, hCap);
    return { w, h };
  }

  function spawnGroundObstacle(tallBias = 0.45) {
    const seed = seedInt();
    const v = pickGroundVariant(tallBias);
    const dims = makeGroundDims(v, seed);
    const w = dims.w,
      h = dims.h;

    const hardness = computeGroundHardness(w, h, v);
    obs.push({
      kind: "CACTUS",
      variant: v,
      seed,
      hardness,
      x: viewW + 40,
      y: groundY - h,
      w,
      h,
    });
    lastKind = "CACTUS";
    lastSpawnHardness = hardness;
    lastSpawnWasHard = hardness >= 1.0;
  }

  function pickFlyLevel(): 0 | 1 | 2 {
    const d = difficulty01();
    const st = stage();
    const allowLow =
      (st === "MID" && score > 650) ||
      (st === "LATE" && (score > 900 || d > 0.5));
    const roll = Math.random();

    let level: 0 | 1 | 2;
    if (st === "EARLY") level = roll < 0.7 ? 1 : 2;
    else if (st === "MID") {
      if (allowLow && roll < 0.18) level = 0;
      else if (roll < 0.68) level = 1;
      else level = 2;
    } else {
      if (allowLow && roll < 0.28) level = 0;
      else if (roll < 0.62) level = 1;
      else level = 2;
    }
    if (level === lastFlyLevel && Math.random() < 0.7) {
      if (level === 1) level = Math.random() < 0.5 ? 2 : allowLow ? 0 : 2;
      else level = 1;
      if (!allowLow && level === 0) level = 1;
    }
    if (guardAfterPit > 0 && level === 0) level = 1;
    return level;
  }

  function spawnFlyer(level?: 0 | 1 | 2) {
    const w = 48;
    const h = 24;
    let useLevel: 0 | 1 | 2 = level ?? pickFlyLevel();
    if (guardAfterPit > 0 && useLevel === 0) useLevel = 1;

    const lowBottom = groundY - (DUCK_H + 8);
    const midBottom = groundY - (DUCK_H + 26);
    const highBottom = groundY - (STAND_H + 44);
    const bottom = useLevel === 0 ? lowBottom : useLevel === 1 ? midBottom : highBottom;

    const hardness = useLevel === 0 ? 1.10 : useLevel === 1 ? 0.75 : 0.60;

    obs.push({
      kind: "FLYER",
      flightLevel: useLevel,
      hardness,
      x: viewW + 40,
      y: bottom - h,
      w,
      h,
    });
    lastKind = "FLYER";
    lastFlyLevel = useLevel;
    lastSpawnHardness = hardness;
    lastSpawnWasHard = hardness >= 1.0;
    if (useLevel === 0) guardAfterLowFlyer = SAFE_AFTER_LOW_FLYER_DIST;
  }

  function computeSafePitWidth(): number {
    const clearable = worldSpeed * 0.62 - 45;
    return clamp(clearable, PIT_MIN_W, PIT_MAX_W_HARDCAP);
  }
  function spawnPit(width?: number) {
    const maxW = computeSafePitWidth();
    const w = width ?? rand(PIT_MIN_W, maxW);
    obs.push({
      kind: "PIT",
      hardness: 1.35,
      x: viewW + 40,
      y: groundY,
      w,
      h: PIT_VISUAL_DEPTH,
    });
    lastKind = "PIT";
    lastSpawnHardness = 1.35;
    lastSpawnWasHard = true;
    guardAfterPit = SAFE_AFTER_PIT_DIST;
  }

  function computeNextSpawnDist(kind: ObKind, hardness: number) {
    const sf = speedFactor();
    const st = stage();
    const stageMul = st === "EARLY" ? 1.18 : st === "MID" ? 1.0 : 0.90;

    let min = 240 * sf * stageMul;
    let max = 440 * sf * stageMul;

    if (kind === "FLYER") {
      min += 70 * sf;
      max += 90 * sf;
    }
    if (kind === "PIT") {
      min += 160 * sf;
      max += 240 * sf;
    }

    min += hardness * 90 * sf;
    max += hardness * 130 * sf;

    if (guardAfterPit > 0) min += 80 * sf;
    if (guardAfterLowFlyer > 0) min += 40 * sf;

    return rand(min, max);
  }

  function pushRecentPattern(id: string) {
    recentPatterns.unshift(id);
    while (recentPatterns.length > 3) recentPatterns.pop();
  }
  function recentlyUsed(id: string) {
    return recentPatterns.includes(id);
  }
  function canStartPattern(): boolean {
    if (score < PATTERN_SCORE_GATE) return false;
    if (patternQueue) return false;
    if (patternCooldownDist > 0) return false;
    if (lastKind === "PIT") return false;

    const st = stage();
    const d = difficulty01();
    const base = st === "EARLY" ? 0.10 : st === "MID" ? 0.20 : 0.34;
    const chance = clamp(base + d * 0.12, 0, 0.55);
    return Math.random() < chance;
  }
  function setPatternCooldown() {
    const st = stage();
    const base = st === "EARLY" ? 540 : st === "MID" ? 430 : 320;
    patternCooldownDist = scaledGap(base) + rand(0, scaledGap(180));
  }
  function gapBaseFor(st: Stage, base: number) {
    const d = difficulty01();
    const tighten = st === "EARLY" ? 0.0 : st === "MID" ? 0.10 : 0.18;
    const out = base * (1 - tighten) - d * (st === "LATE" ? 35 : 18);
    return Math.max(160, out);
  }
  function rLevel(set: (0 | 1 | 2)[]) {
    return set[(Math.random() * set.length) | 0];
  }

  function buildPatterns(): { id: string; wEarly: number; wMid: number; wLate: number; build: () => PatternStep[] }[] {
    const st = stage();
    const earlyLevels: (0 | 1 | 2)[] = [1, 2];
    const midLevels: (0 | 1 | 2)[] = [1, 2, 1, 2, 0];
    const lateLevels: (0 | 1 | 2)[] = [0, 1, 2, 1, 0, 2];
    const levels = st === "EARLY" ? earlyLevels : st === "MID" ? midLevels : lateLevels;
    const g = (base: number, jitterAmt = 24) => jitter(gapBaseFor(st, base), jitterAmt);

    return [
      {
        id: "P1_DOUBLE_FLYERS",
        wEarly: 1.6,
        wMid: 1.9,
        wLate: 2.0,
        build: () => {
          const a = rLevel(levels);
          let b = rLevel(levels);
          if (b === a && Math.random() < 0.7) b = rLevel(levels);
          return [
            { kind: "FLYER", level: a, gapBase: 0 },
            { kind: "FLYER", level: b, gapBase: g(260, 28) },
          ];
        },
      },
      {
        id: "P2_WAVE_HMH",
        wEarly: 1.2,
        wMid: 1.6,
        wLate: 1.8,
        build: () => {
          const high = 2 as const;
          const mid = 1 as const;
          const seq = Math.random() < 0.5 ? [high, mid, high] : [high, mid, mid];
          return [
            { kind: "FLYER", level: seq[0], gapBase: 0 },
            { kind: "FLYER", level: seq[1], gapBase: g(240, 26) },
            { kind: "FLYER", level: seq[2], gapBase: g(240, 26) },
          ];
        },
      },
      {
        id: "P3_BAIT_HIGH_CACTUS",
        wEarly: 1.1,
        wMid: 1.4,
        wLate: 1.6,
        build: () => [
          { kind: "FLYER", level: 2, gapBase: 0 },
          { kind: "CACTUS", gapBase: g(240, 22), tallBias: 0.55 },
        ],
      },
      {
        id: "P4_CACTUS_THEN_FLYER",
        wEarly: 1.1,
        wMid: 1.4,
        wLate: 1.5,
        build: () => {
          const lvl = st === "EARLY" ? rLevel([1, 2]) : rLevel(levels);
          return [
            { kind: "CACTUS", gapBase: 0, tallBias: 0.42 },
            { kind: "FLYER", level: lvl, gapBase: g(280, 30) },
          ];
        },
      },
      {
        id: "P5_TRIPLE_STUTTER",
        wEarly: 0.8,
        wMid: 1.3,
        wLate: 1.7,
        build: () => {
          const a = rLevel(levels);
          const b = rLevel(levels);
          let c = rLevel(levels);
          if (c === b && Math.random() < 0.7) c = rLevel(levels);
          return [
            { kind: "FLYER", level: a, gapBase: 0 },
            { kind: "FLYER", level: b, gapBase: g(220, 26) },
            { kind: "FLYER", level: c, gapBase: g(220, 26) },
          ];
        },
      },
      {
        id: "P6_MID_LOW_CHECK",
        wEarly: 0.0,
        wMid: 1.0,
        wLate: 1.7,
        build: () => [
          { kind: "FLYER", level: 1, gapBase: 0 },
          { kind: "FLYER", level: 0, gapBase: g(265, 18) },
        ],
      },
      {
        id: "P7_DUCK_THEN_JUMP",
        wEarly: 0.0,
        wMid: 0.7,
        wLate: 1.6,
        build: () => [
          { kind: "FLYER", level: 0, gapBase: 0 },
          { kind: "CACTUS", gapBase: g(300, 18), tallBias: 0.50 },
        ],
      },
    ];
  }

  function pickPattern(): { id: string; steps: PatternStep[] } | null {
    const st = stage();
    const all = buildPatterns();
    const candidates = all.filter((p) =>
      st === "EARLY" ? p.wEarly > 0 : st === "MID" ? p.wMid > 0 : p.wLate > 0
    );
    if (!candidates.length) return null;

    function weight(p: (typeof candidates)[number]) {
      return st === "EARLY" ? p.wEarly : st === "MID" ? p.wMid : p.wLate;
    }

    for (let tries = 0; tries < 8; tries++) {
      let total = 0;
      for (const c of candidates) total += weight(c);
      let r = Math.random() * total;
      let chosen = candidates[0];
      for (const c of candidates) {
        r -= weight(c);
        if (r <= 0) {
          chosen = c;
          break;
        }
      }
      if (!recentlyUsed(chosen.id) || tries >= 5) return { id: chosen.id, steps: chosen.build() };
    }
    const fallback = candidates[(Math.random() * candidates.length) | 0];
    return { id: fallback.id, steps: fallback.build() };
  }

  function startPattern() {
    const picked = pickPattern();
    if (!picked) return;
    patternQueue = picked.steps;
    pushRecentPattern(picked.id);
    setPatternCooldown();
  }

  function spawnSingleFair() {
    const d = difficulty01();
    const st = stage();

    const allowFlyers = score > 120 || d > 0.15;

    const allowPits = score >= PIT_SPAWN_SCORE_GATE;
    const pitChance = allowPits ? PIT_BASE_CHANCE + d * PIT_DIFFICULTY_BONUS : 0;

    const canPit = allowPits && lastKind !== "PIT";
    const roll = Math.random();

    if (canPit && roll < pitChance && guardAfterPit <= 0) {
      if (lastKind === "FLYER" && lastSpawnWasHard && Math.random() < 0.65) spawnGroundObstacle(0.42);
      else spawnPit();
      return;
    }

    const flyerChance =
      allowFlyers ? (st === "EARLY" ? 0.12 : st === "MID" ? 0.22 : 0.30) + d * 0.12 : 0;

    const avoidFlyer = !allowFlyers || (lastKind === "FLYER" && score < 600);
    const avoidGroundTight = guardAfterLowFlyer > 0 && score < 900;

    if (!avoidFlyer && Math.random() < flyerChance) {
      if (lastSpawnWasHard && Math.random() < 0.60) spawnGroundObstacle(0.40);
      else spawnFlyer();
      return;
    }

    if (avoidGroundTight && Math.random() < 0.30) {
      spawnFlyer(1);
      return;
    }

    spawnGroundObstacle(0.45);
  }

  function spawnStep(step: PatternStep) {
    if (step.kind === "CACTUS") spawnGroundObstacle(step.tallBias ?? 0.45);
    else if (step.kind === "FLYER") spawnFlyer(step.level);
    else spawnPit(step.width);
  }

  function scheduleNextAfterSpawn() {
    if (patternQueue && patternQueue.length > 0) {
      const next = patternQueue[0];
      nextSpawnDist = scaledGap(next.gapBase);
      distSinceSpawn = 0;
      return;
    }
    nextSpawnDist = computeNextSpawnDist(lastKind, lastSpawnHardness);
    distSinceSpawn = 0;
  }

  function spawnManagerTick() {
    if (patternQueue && patternQueue.length > 0) {
      const step = patternQueue.shift()!;
      spawnStep(step);
      if (patternQueue.length === 0) patternQueue = null;
      scheduleNextAfterSpawn();
      return;
    }
    if (canStartPattern()) {
      startPattern();
      if (patternQueue && patternQueue.length > 0) {
        const first = patternQueue.shift()!;
        spawnStep(first);
        if (patternQueue.length === 0) patternQueue = null;
        scheduleNextAfterSpawn();
        return;
      }
    }
    spawnSingleFair();
    scheduleNextAfterSpawn();
  }

  // =========================
  // Drawing helpers
  // =========================
  function drawParallaxLayer(spr: any, y: number, alpha: number, off: number) {
    const tileW = spr.sw;
    const tileH = spr.sh;
    const yPos = Math.floor(y);

    pxCtx.save();
    pxCtx.globalAlpha = alpha;

    const startX = -((off % tileW + tileW) % tileW);
    for (let x = startX; x < viewW; x += tileW) {
      drawSprite(pxCtx, SPR.sheet, spr, x, yPos, tileW, tileH);
    }
    pxCtx.restore();
  }

  function drawGroundStrip() {
    const pits = pitSegmentsVisible();
    const spr = SPR.env.ground;
    const tileW = spr.sw;
    const y = groundY;

    function inPit(x: number) {
      for (const p of pits) if (x >= p.a && x <= p.b) return true;
      return false;
    }

    const startX = -((groundOff % tileW + tileW) % tileW);
    for (let x = startX; x < viewW; x += tileW) {
      const mid = x + tileW * 0.5;
      if (inPit(mid)) continue;
      drawSprite(pxCtx, SPR.sheet, spr, x, y, tileW, GROUND_STRIP_H);
    }

    pxCtx.save();
    pxCtx.globalAlpha = 0.25;
    pxCtx.fillStyle = "rgba(255,255,255,0.8)";
    let cursor = 0;
    for (const p of pits) {
      const a = clamp(p.a, 0, viewW);
      const b = clamp(p.b, 0, viewW);
      if (a > cursor) pxCtx.fillRect(cursor, groundY - 1, a - cursor, 1);
      cursor = Math.max(cursor, b);
    }
    if (cursor < viewW) pxCtx.fillRect(cursor, groundY - 1, viewW - cursor, 1);
    pxCtx.restore();
  }

  function drawCloud(c: Cloud) {
    const baseW = 120 * c.scale;
    const baseH = 40 * c.scale;
    pxCtx.save();
    pxCtx.globalAlpha = 0.25;
    pxCtx.fillStyle = "rgba(255,255,255,0.9)";
    pxCtx.beginPath();
    pxCtx.ellipse(c.x + baseW * 0.30, c.y + baseH * 0.55, baseW * 0.22, baseH * 0.30, 0, 0, Math.PI * 2);
    pxCtx.ellipse(c.x + baseW * 0.52, c.y + baseH * 0.45, baseW * 0.26, baseH * 0.36, 0, 0, Math.PI * 2);
    pxCtx.ellipse(c.x + baseW * 0.72, c.y + baseH * 0.58, baseW * 0.20, baseH * 0.28, 0, 0, Math.PI * 2);
    pxCtx.ellipse(c.x + baseW * 0.52, c.y + baseH * 0.70, baseW * 0.42, baseH * 0.26, 0, 0, Math.PI * 2);
    pxCtx.fill();
    pxCtx.restore();
  }

  function drawPit(o: Ob) {
    pxCtx.save();
    pxCtx.globalAlpha = 1;
    pxCtx.fillStyle = "rgba(0,0,0,0.45)";
    pxCtx.fillRect(o.x, o.y, o.w, o.h);

    pxCtx.globalAlpha = 0.18;
    pxCtx.fillStyle = "rgba(255,255,255,0.22)";
    for (let i = 0; i < 4; i++) {
      const yy = o.y + 12 + i * 16;
      pxCtx.fillRect(o.x + 10, yy, Math.max(0, o.w - 20), 2);
    }

    pxCtx.globalAlpha = PIT_EDGE_GLOW;
    pxCtx.fillStyle = "rgba(255,255,255,0.9)";
    pxCtx.fillRect(o.x, o.y, 2, 10);
    pxCtx.fillRect(o.x + o.w - 2, o.y, 2, 10);

    pxCtx.restore();
  }

  function drawPitWarning(o: Ob) {
    const x = o.x - PIT_WARN_LEAD;
    if (x < -40 || x > viewW + 40) return;
    pxCtx.save();
    pxCtx.globalAlpha = 0.22;
    pxCtx.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < 3; i++) {
      const cx = x - i * 6;
      const cy = groundY + 1 + i * 2;
      pxCtx.fillRect(cx, cy, 10, 2);
      pxCtx.fillRect(cx + 2, cy - 3, 2, 6);
    }
    pxCtx.restore();
  }

  function drawGroundObstacle(o: Ob) {
    const dx = Math.floor(o.x);
    const dy = Math.floor(o.y);
    const v = o.variant ?? "CACTUS_SINGLE";
    let spr = SPR.obstacles.spike;
    if (v.startsWith("ROCK")) spr = SPR.obstacles.rock;
    else if (v === "STUMP") spr = SPR.obstacles.stump;

    pxCtx.save();
    pxCtx.globalAlpha = 0.08;
    pxCtx.fillStyle = "rgba(0,0,0,0.9)";
    pxCtx.fillRect(dx + 3, groundY + 2, Math.max(0, o.w - 6), 2);
    pxCtx.restore();

    pxCtx.save();
    pxCtx.globalAlpha = 0.96;
    drawSprite(pxCtx, SPR.sheet, spr, dx, dy, o.w, o.h);
    pxCtx.restore();
  }

  function drawFlyer(o: Ob) {
    const anim = SPR.flyer;
    const idx = Math.floor(animTime * anim.fps) % anim.frames.length;
    const spr = anim.frames[idx];
    const dx = Math.floor(o.x);
    const dy = Math.floor(o.y);

    pxCtx.save();
    pxCtx.globalAlpha = 0.96;
    drawSprite(pxCtx, SPR.sheet, spr, dx, dy, o.w, o.h);
    pxCtx.restore();
  }

  function drawParticles() {
    if (!particles.length) return;
    pxCtx.save();
    for (const p of particles) {
      const t = clamp(p.life / p.max, 0, 1);
      pxCtx.globalAlpha = 0.55 * t;
      pxCtx.fillStyle = "rgba(255,255,255,0.8)";
      pxCtx.fillRect(p.x, p.y, p.size, p.size);
    }
    pxCtx.restore();
  }

  function drawDino() {
    const dx = Math.floor(dino.x);
    const dy = Math.floor(dino.y);

    pxCtx.save();
    pxCtx.globalAlpha = 0.10;
    pxCtx.fillStyle = "rgba(0,0,0,0.9)";
    pxCtx.fillRect(dx + 6, groundY + 2, Math.max(0, dino.w - 12), 2);
    pxCtx.restore();

    let spr = SPR.player.jump;
    if (dino.ducking && dino.onGround) spr = SPR.player.duck;
    else if (!dino.onGround) spr = SPR.player.jump;
    else {
      const run = SPR.player.run;
      const idx = Math.floor(animTime * run.fps) % run.frames.length;
      spr = run.frames[idx];
    }

    pxCtx.save();
    pxCtx.globalAlpha = 0.98;
    drawSprite(pxCtx, SPR.sheet, spr, dx, dy, dino.w, dino.h);
    pxCtx.restore();
  }

  function drawHitboxes() {
    if (!showHitboxes) return;
    pxCtx.save();
    pxCtx.lineWidth = 1;
    const dh = dinoHitbox();
    pxCtx.strokeStyle = "rgba(255,80,80,0.9)";
    pxCtx.strokeRect(dh.x, dh.y, dh.w, dh.h);
    pxCtx.strokeStyle = "rgba(80,200,255,0.9)";
    for (const o of obs) {
      if (o.kind === "PIT") continue;
      const oh = obHitbox(o);
      pxCtx.strokeRect(oh.x, oh.y, oh.w, oh.h);
    }
    pxCtx.restore();
  }

  function drawOverlays() {
    if (state === "READY") {
      pxCtx.save();
      pxCtx.fillStyle = "rgba(255,255,255,0.9)";
      pxCtx.font = "700 14px ui-sans-serif, system-ui";
      pxCtx.fillText("TAP / SPACE / W TO START", viewW / 2 - 96, 66);
      pxCtx.fillStyle = "rgba(255,255,255,0.65)";
      pxCtx.font = "11px ui-sans-serif, system-ui";
      pxCtx.fillText("2.5C • ULTRAWIDE CAMERA (HEIGHT=360, WIDTH=ADAPT)", viewW / 2 - 160, 84);
      pxCtx.fillText("S/↓ = down • H = hitboxes • R = reset", viewW / 2 - 112, 98);
      pxCtx.restore();
      return;
    }
    if (state === "GAMEOVER") {
      pxCtx.save();
      pxCtx.fillStyle = "rgba(255,255,255,0.9)";
      pxCtx.font = "700 16px ui-sans-serif, system-ui";
      pxCtx.fillText("GAME OVER", viewW / 2 - 48, 70);
      pxCtx.fillStyle = "rgba(255,255,255,0.65)";
      pxCtx.font = "11px ui-sans-serif, system-ui";
      pxCtx.fillText("Press R to restart", viewW / 2 - 48, 88);
      pxCtx.fillText("Tap / Click to restart", viewW / 2 - 60, 102);
      pxCtx.restore();
    }
  }

  function draw() {
    pxCtx.clearRect(0, 0, viewW, viewH);
    pxCtx.fillStyle = "rgba(255,255,255,0.02)";
    pxCtx.fillRect(0, 0, viewW, viewH);

    drawParallaxLayer(SPR.env.far, Math.max(0, groundY - 112), 0.80, farOff);
    drawParallaxLayer(SPR.env.mid, Math.max(0, groundY - 96), 0.90, midOff);
    drawParallaxLayer(SPR.env.near, Math.max(0, groundY - 78), 1.0, nearOff);

    for (const c of clouds) drawCloud(c);

    for (const o of obs) {
      if (o.kind === "PIT") {
        drawPit(o);
        drawPitWarning(o);
      }
    }

    drawGroundStrip();

    for (const o of obs) {
      if (o.kind === "CACTUS") drawGroundObstacle(o);
      else if (o.kind === "FLYER") drawFlyer(o);
    }

    drawDino();
    drawParticles();

    drawHitboxes();
    drawOverlays();
  }

  // Init
  applyNearestNeighbor();
  resize();
  setStatusUI();
  resetToReady();

  // Input
  const onKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    if (e.repeat) return;
    if (code === "Space" || code === "ArrowUp" || code === "ArrowDown") e.preventDefault();

    if (code === "KeyH") {
      showHitboxes = !showHitboxes;
      return;
    }
    if (code === "KeyR") {
      if (state === "GAMEOVER") restartRun();
      else resetToReady();
      return;
    }

    if (code === "KeyS" || code === "ArrowDown") {
      downDown = true;
      applyDuckVisual(true);
      return;
    }
    if (code === "KeyW" || code === "ArrowUp" || code === "Space") {
      if (!jumpDown) queueJump();
      jumpDown = true;
      return;
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const code = e.code;
    if (code === "KeyS" || code === "ArrowDown") {
      downDown = false;
      return;
    }
    if (code === "KeyW" || code === "ArrowUp" || code === "Space") {
      jumpDown = false;
      cutJumpIfNeeded();
      return;
    }
  };

  const onPointerDown = () => {
    if (state === "GAMEOVER") {
      restartRun();
      return;
    }
    queueJump();
    jumpDown = true;
  };
  const onPointerUp = () => {
    jumpDown = false;
    cutJumpIfNeeded();
  };

  const onResize = () => resize();

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  // Loop
  let last = performance.now();
  let acc = 0;
  let rafId = 0;

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    acc += dt;
    if (acc > MAX_ACCUM) acc = MAX_ACCUM;

    while (acc >= FIXED_DT) {
      update(FIXED_DT);
      acc -= FIXED_DT;
    }

    draw();
    present();
    rafId = requestAnimationFrame(frame);
  }

  function update(dt: number) {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
    }
    while (particles.length && particles[0] && particles[0].life <= 0) particles.shift();

    if (jumpBuffer > 0) jumpBuffer = Math.max(0, jumpBuffer - dt);

    if (state === "READY") {
      coyote = COYOTE_TIME;
      tryConsumeJump();
      return;
    }
    if (state === "GAMEOVER") return;

    animTime += dt;
    worldSpeed += 8 * dt;

    score += dt * (worldSpeed / 20);
    setScoreUI();

    if (patternCooldownDist > 0) patternCooldownDist = Math.max(0, patternCooldownDist - worldSpeed * dt);
    if (guardAfterPit > 0) guardAfterPit = Math.max(0, guardAfterPit - worldSpeed * dt);
    if (guardAfterLowFlyer > 0) guardAfterLowFlyer = Math.max(0, guardAfterLowFlyer - worldSpeed * dt);

    applyDuckVisual(downDown);

    if (dino.onGround) coyote = COYOTE_TIME;
    else coyote = Math.max(0, coyote - dt);

    tryConsumeJump();

    let g = GRAVITY;
    const goingUp = dino.vy < 0;

    if (!dino.onGround && jumpDown && goingUp && jumpHold < MAX_JUMP_HOLD) {
      g *= HOLD_GRAVITY_MULT;
      jumpHold += dt;
    }
    if (!dino.onGround && downDown) g *= FAST_FALL_MULT;

    dino.vy += g * dt;
    dino.y += dino.vy * dt;

    const groundTop = groundY - dino.h;
    const overPit = isOverPit();

    if (!pitFall && overPit && dino.y > groundTop + PIT_FALL_LOCK_DEPTH) pitFall = true;

    const groundExistsHere = !pitFall && !overPit;

    if (groundExistsHere && dino.y >= groundTop) {
      const landed = !dino.onGround && dino.vy > 0;
      dino.y = groundTop;
      dino.vy = 0;
      dino.onGround = true;
      jumpHold = 0;
      applyDuckVisual(downDown);

      if (landed) spawnDust(dino.x + 8, groundY - 8, 8, 0.9);
    } else {
      dino.onGround = false;
      dino.ducking = false;
    }

    if (dino.y > viewH + 120) {
      gameOver();
      return;
    }

    nextCloudSpawn -= dt;
    if (nextCloudSpawn <= 0) {
      clouds.push({
        x: viewW + rand(20, 120),
        y: rand(18, Math.max(34, groundY - 110)),
        scale: rand(0.75, 1.35),
        speedMul: rand(0.10, 0.28),
      });
      nextCloudSpawn = rand(0.9, 1.8);
    }
    for (const c of clouds) c.x -= worldSpeed * c.speedMul * dt;
    while (clouds.length && clouds[0] && clouds[0].x < -260) clouds.shift();

    farOff += worldSpeed * FAR_MUL * dt;
    midOff += worldSpeed * MID_MUL * dt;
    nearOff += worldSpeed * NEAR_MUL * dt;
    groundOff += worldSpeed * dt;

    distSinceSpawn = clamp(distSinceSpawn + worldSpeed * dt, 0, 1e9);
    if (distSinceSpawn >= nextSpawnDist) spawnManagerTick();

    for (const o of obs) o.x -= worldSpeed * dt;
    while (obs.length && obs[0] && obs[0].x + obs[0].w < -80) obs.shift();

    const dh = dinoHitbox();
    for (const o of obs) {
      if (o.kind === "PIT") continue;
      if (aabb(dh, obHitbox(o))) {
        gameOver();
        break;
      }
    }
  }

  rafId = requestAnimationFrame(frame);

  return function cleanup() {
    cancelAnimationFrame(rafId);
    window.removeEventListener("keydown", onKeyDown as any);  
    window.removeEventListener("keyup", onKeyUp as any);
    window.removeEventListener("resize", onResize as any);
    canvas.removeEventListener("pointerdown", onPointerDown as any);
    canvas.removeEventListener("pointerup", onPointerUp as any);
    canvas.removeEventListener("pointercancel", onPointerUp as any);
  };
}
