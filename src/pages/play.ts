import { startGame } from "../game/startGame";

export function renderPlay(root: HTMLElement) {
  root.innerHTML = `
    <div class="playShell">
      <div class="gameStage">
        <div class="gameFrame">
          <canvas id="gameCanvas"></canvas>

          <!-- HUD (keep this minimal) -->
          <div class="hud">
            <div class="hudTop">
              <div class="hudBox">
                <div class="scoreRow">
                  <span class="muted">SCORE</span>
                  <div id="score">00000</div>
                </div>
              </div>

              <div class="hudBox">
                <div class="scoreRow">
                  <span class="muted">BEST</span>
                  <div id="best">BEST 00000</div>
                </div>
              </div>

              <div class="hudBox" title="Press H to toggle hitboxes">
                <div class="scoreRow">
                  <span class="muted">H</span>
                  <div style="opacity:.9;">Hitbox</div>
                </div>
              </div>
            </div>

            <!-- Keep these hidden but present (startGame expects them) -->
            <div style="display:none;">
              <div id="heatFill"></div>
              <span id="heatText">DASH OFF</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>("#gameCanvas")!;
  const scoreEl = root.querySelector<HTMLDivElement>("#score")!;
  const bestEl = root.querySelector<HTMLDivElement>("#best")!;
  const heatFillEl = root.querySelector<HTMLDivElement>("#heatFill")!;
  const heatTextEl = root.querySelector<HTMLSpanElement>("#heatText")!;

  const cleanup = startGame({
    canvas,
    scoreEl,
    bestEl,
    heatFillEl,
    heatTextEl,
  });

  return cleanup;
}
