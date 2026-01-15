// src/game/sprites.ts
export type Sprite = { sx: number; sy: number; sw: number; sh: number };
export type Anim = { frames: Sprite[]; fps: number };

export type SpritePack = {
  sheet: HTMLCanvasElement; // CanvasImageSource
  player: {
    run: Anim;
    jump: Sprite;
    duck: Sprite;
  };
  flyer: Anim;
  obstacles: {
    spike: Sprite;
    rock: Sprite;
    stump: Sprite;
  };
  env: {
    ground: Sprite;     // repeating tile
    far: Sprite;        // parallax tile
    mid: Sprite;        // parallax tile
    near: Sprite;       // parallax tile
  };
};

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}
function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x | 0, y | 0, 1, 1);
}
function outlineRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, out: string, fill?: string) {
  if (fill) rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
  rect(ctx, x, y, w, 1, out);
  rect(ctx, x, y + h - 1, w, 1, out);
  rect(ctx, x, y, 1, h, out);
  rect(ctx, x + w - 1, y, 1, h, out);
}

/* ---------------------------
   Character / obstacles
----------------------------*/
function stampKnight(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  variant: 0 | 1,
  pose: "run" | "jump" | "duck"
) {
  const OUT = "#0e1220";
  const W1 = "#f4f6ff";
  const W2 = "#cfd6f3";
  const TEAL = "#7ad9ff";
  const RED = "#ff6b8b";
  const DARK = "#2a304a";

  rect(ctx, ox, oy, 32, 32, "rgba(0,0,0,0)");

  const baseY = pose === "duck" ? oy + 18 : oy + 10;
  const baseX = ox + 10;

  if (pose !== "duck") {
    const capeX = baseX - 7;
    const capeY = baseY + 2;
    outlineRect(ctx, capeX, capeY, 10, 14, OUT, RED);
    rect(ctx, capeX + 2, capeY + 4, 1, 8, OUT);
    rect(ctx, capeX + 5, capeY + 6, 1, 6, OUT);
  }

  const headX = baseX + 6;
  const headY = baseY - 8;
  outlineRect(ctx, headX, headY, 10, 9, OUT, W1);
  rect(ctx, headX + 2, headY + 4, 6, 1, OUT);
  px(ctx, headX + 3, headY + 3, TEAL);
  px(ctx, headX + 5, headY + 3, TEAL);

  const torsoX = baseX + 4;
  const torsoY = baseY;
  outlineRect(ctx, torsoX, torsoY, 12, 10, OUT, W2);
  px(ctx, torsoX + 6, torsoY + 9, TEAL);

  if (pose !== "duck") {
    outlineRect(ctx, torsoX + 11, torsoY + 3, 5, 3, OUT, W1);
    rect(ctx, torsoX + 15, torsoY + 1, 1, 2, OUT);
    rect(ctx, torsoX + 16, torsoY - 4, 1, 6, OUT);
    rect(ctx, torsoX + 16, torsoY - 4, 1, 1, TEAL);
  }

  const legY = torsoY + 10;
  const legX = torsoX + 2;

  if (pose === "jump") {
    outlineRect(ctx, legX + 2, legY + 1, 4, 7, OUT, W1);
    outlineRect(ctx, legX + 7, legY + 1, 4, 7, OUT, W1);
  } else if (pose === "duck") {
    outlineRect(ctx, legX + 2, legY + 2, 5, 4, OUT, W1);
    outlineRect(ctx, legX + 7, legY + 2, 5, 4, OUT, W1);
  } else {
    if (variant === 0) {
      outlineRect(ctx, legX + 1, legY + 0, 4, 8, OUT, W1);
      outlineRect(ctx, legX + 7, legY + 2, 4, 6, OUT, W1);
    } else {
      outlineRect(ctx, legX + 1, legY + 2, 4, 6, OUT, W1);
      outlineRect(ctx, legX + 7, legY + 0, 4, 8, OUT, W1);
    }
  }

  rect(ctx, baseX + 1, baseY + 9, 3, 1, DARK);
}

function stampFlyer(ctx: CanvasRenderingContext2D, ox: number, oy: number, f: 0 | 1) {
  const OUT = "#0e1220";
  const W1 = "#f4f6ff";
  const W2 = "#cfd6f3";
  const TEAL = "#7ad9ff";

  rect(ctx, ox, oy, 32, 16, "rgba(0,0,0,0)");

  outlineRect(ctx, ox + 10, oy + 6, 14, 7, OUT, W2);
  px(ctx, ox + 21, oy + 8, TEAL);

  if (f === 0) {
    outlineRect(ctx, ox + 2, oy + 6, 9, 4, OUT, W1);
    outlineRect(ctx, ox + 23, oy + 4, 9, 4, OUT, W1);
  } else {
    outlineRect(ctx, ox + 2, oy + 3, 9, 4, OUT, W1);
    outlineRect(ctx, ox + 23, oy + 7, 9, 4, OUT, W1);
  }

  rect(ctx, ox + 7, oy + 10, 4, 1, OUT);
}

function stampSpike(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const OUT = "#0e1220";
  const W1 = "#f4f6ff";
  const W2 = "#cfd6f3";

  rect(ctx, ox, oy, 24, 24, "rgba(0,0,0,0)");
  outlineRect(ctx, ox + 2, oy + 18, 20, 4, OUT, W2);

  for (let i = 0; i < 3; i++) {
    const x = ox + 5 + i * 6;
    rect(ctx, x, oy + 10, 4, 8, OUT);
    rect(ctx, x + 1, oy + 11, 2, 6, W1);
  }
}

function stampRock(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const OUT = "#0e1220";
  const W1 = "#f4f6ff";
  const W2 = "#cfd6f3";

  rect(ctx, ox, oy, 28, 18, "rgba(0,0,0,0)");
  outlineRect(ctx, ox + 1, oy + 4, 26, 13, OUT, W2);
  rect(ctx, ox + 6, oy + 8, 8, 1, OUT);
  rect(ctx, ox + 16, oy + 12, 6, 1, OUT);
  px(ctx, ox + 22, oy + 6, W1);
}

function stampStump(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const OUT = "#0e1220";
  const W1 = "#f4f6ff";
  const W2 = "#cfd6f3";

  rect(ctx, ox, oy, 24, 24, "rgba(0,0,0,0)");
  outlineRect(ctx, ox + 4, oy + 6, 16, 16, OUT, W2);
  rect(ctx, ox + 7, oy + 10, 3, 1, OUT);
  rect(ctx, ox + 14, oy + 14, 4, 1, OUT);
  px(ctx, ox + 12, oy + 8, W1);
}

/* ---------------------------
   Environment (parallax + ground tile)
----------------------------*/
function stampParallaxFar(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // 128x64 tile: distant ruins/mountains silhouette
  const SKY = "rgba(0,0,0,0)";
  const OUT = "#0e1220";
  const A = "rgba(255,255,255,0.09)";
  const B = "rgba(255,255,255,0.05)";

  rect(ctx, ox, oy, 128, 64, SKY);

  // silhouette hills
  rect(ctx, ox, oy + 44, 128, 20, B);
  for (let x = 0; x < 128; x += 8) {
    const h = 6 + ((x * 17) % 9);
    rect(ctx, ox + x, oy + 44 - h, 8, h, B);
  }

  // ruin towers
  for (let i = 0; i < 6; i++) {
    const x = ox + 8 + i * 20 + ((i * 7) % 5);
    const h = 10 + (i % 3) * 6;
    rect(ctx, x, oy + 40 - h, 6, h, A);
    rect(ctx, x, oy + 40 - h, 6, 1, OUT);
  }

  // tiny stars/sparks
  for (let i = 0; i < 14; i++) {
    const x = ox + ((i * 23) % 128);
    const y = oy + 6 + ((i * 11) % 22);
    px(ctx, x, y, "rgba(255,255,255,0.10)");
  }
}

function stampParallaxMid(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // 128x64 tile: tree line
  rect(ctx, ox, oy, 128, 64, "rgba(0,0,0,0)");

  const OUT = "#0e1220";
  const FILL = "rgba(255,255,255,0.08)";

  // trunks + canopy blocks
  for (let i = 0; i < 10; i++) {
    const x = ox + i * 12 + (i % 3);
    const trunkH = 16 + (i % 4) * 2;
    rect(ctx, x + 4, oy + 40 - trunkH, 3, trunkH, FILL);
    rect(ctx, x + 3, oy + 28 - (i % 3), 7, 8, FILL);

    // outline hint
    rect(ctx, x + 3, oy + 28 - (i % 3), 7, 1, OUT);
  }
  rect(ctx, ox, oy + 44, 128, 20, "rgba(255,255,255,0.03)");
}

function stampParallaxNear(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // 128x64 tile: bushes + rocks closer
  rect(ctx, ox, oy, 128, 64, "rgba(0,0,0,0)");

  const OUT = "#0e1220";
  const F = "rgba(255,255,255,0.10)";
  const F2 = "rgba(255,255,255,0.06)";

  for (let i = 0; i < 9; i++) {
    const x = ox + i * 14 + (i % 2);
    rect(ctx, x, oy + 42, 12, 10, F2);
    rect(ctx, x + 2, oy + 38, 8, 6, F);
    rect(ctx, x, oy + 42, 12, 1, OUT);
  }
  // little rocks
  for (let i = 0; i < 6; i++) {
    const x = ox + 10 + i * 18;
    rect(ctx, x, oy + 52, 10, 5, F2);
    rect(ctx, x, oy + 52, 10, 1, OUT);
  }
}

function stampGroundTile(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // 32x32 ground tile
  rect(ctx, ox, oy, 32, 32, "rgba(0,0,0,0)");

  const OUT = "#0e1220";
  const TOP = "rgba(255,255,255,0.10)";
  const MID = "rgba(255,255,255,0.06)";
  const DOT = "rgba(255,255,255,0.12)";

  // top lip
  rect(ctx, ox, oy + 0, 32, 3, OUT);
  rect(ctx, ox, oy + 3, 32, 2, TOP);

  // dirt body
  rect(ctx, ox, oy + 5, 32, 27, MID);

  // pebbles
  for (let i = 0; i < 20; i++) {
    const x = ox + ((i * 13) % 32);
    const y = oy + 8 + ((i * 9) % 22);
    if ((i % 5) === 0) rect(ctx, x, y, 2, 1, DOT);
    else px(ctx, x, y, DOT);
  }

  // bottom shade
  rect(ctx, ox, oy + 29, 32, 3, "rgba(0,0,0,0.12)");
}

export function makeSpritePack(): SpritePack {
  // Atlas layout:
  // Row0 y=0:  run0(0), run1(32), jump(64), duck(96) each 32x32
  // Row1 y=32: flyer0(0) 32x16, flyer1(32) 32x16, spike(64) 24x24, rock(88,38) 28x18, stump(120) 24x24
  // Row2 y=64: env tiles:
  //   ground(0,64) 32x32
  //   far  (32,64) 128x64
  //   mid  (160,64) 128x64
  //   near (288,64) 128x64
  const sheet = document.createElement("canvas");
  sheet.width = 416; // 32 + 128 + 128 + 128 = 416
  sheet.height = 128;

  const ctx = sheet.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  // Character row
  stampKnight(ctx, 0, 0, 0, "run");
  stampKnight(ctx, 32, 0, 1, "run");
  stampKnight(ctx, 64, 0, 0, "jump");
  stampKnight(ctx, 96, 0, 0, "duck");

  // Flyers + obstacles row
  stampFlyer(ctx, 0, 32, 0);
  stampFlyer(ctx, 32, 32, 1);
  stampSpike(ctx, 64, 32);
  stampRock(ctx, 88, 38);
  stampStump(ctx, 120, 32);

  // Env tiles row
  stampGroundTile(ctx, 0, 64);
  stampParallaxFar(ctx, 32, 64);
  stampParallaxMid(ctx, 160, 64);
  stampParallaxNear(ctx, 288, 64);

  const playerRun0: Sprite = { sx: 0, sy: 0, sw: 32, sh: 32 };
  const playerRun1: Sprite = { sx: 32, sy: 0, sw: 32, sh: 32 };
  const playerJump: Sprite = { sx: 64, sy: 0, sw: 32, sh: 32 };
  const playerDuck: Sprite = { sx: 96, sy: 0, sw: 32, sh: 32 };

  const flyer0: Sprite = { sx: 0, sy: 32, sw: 32, sh: 16 };
  const flyer1: Sprite = { sx: 32, sy: 32, sw: 32, sh: 16 };

  const spike: Sprite = { sx: 64, sy: 32, sw: 24, sh: 24 };
  const rock: Sprite = { sx: 88, sy: 38, sw: 28, sh: 18 };
  const stump: Sprite = { sx: 120, sy: 32, sw: 24, sh: 24 };

  const ground: Sprite = { sx: 0, sy: 64, sw: 32, sh: 32 };
  const far: Sprite = { sx: 32, sy: 64, sw: 128, sh: 64 };
  const mid: Sprite = { sx: 160, sy: 64, sw: 128, sh: 64 };
  const near: Sprite = { sx: 288, sy: 64, sw: 128, sh: 64 };

  return {
    sheet,
    player: {
      run: { frames: [playerRun0, playerRun1], fps: 12 },
      jump: playerJump,
      duck: playerDuck,
    },
    flyer: { frames: [flyer0, flyer1], fps: 10 },
    obstacles: { spike, rock, stump },
    env: { ground, far, mid, near },
  };
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sheet: CanvasImageSource,
  spr: Sprite,
  dx: number,
  dy: number,
  dw?: number,
  dh?: number
) {
  const w = dw ?? spr.sw;
  const h = dh ?? spr.sh;
  ctx.drawImage(sheet, spr.sx, spr.sy, spr.sw, spr.sh, dx, dy, w, h);
}
