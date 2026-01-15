export function renderProfile(root: HTMLElement) {
  const BEST_KEY = "rv_bestScore";

  const readBest = () => {
    const raw = localStorage.getItem(BEST_KEY);
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  };

  const fmt5 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(5, "0");

  root.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="brand">
          RETRO VAULT
          <div class="sub">Local Profile</div>
        </div>

        <div class="nav">
          <a href="#/">Home</a>
          <a href="#/play">Play</a>
        </div>
      </div>

      <div class="page" style="padding: 16px;">
        <div
          style="
            max-width: 920px;
            margin: 0 auto;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.10);
            border-radius: 16px;
            padding: 16px;
          "
        >
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 12px; flex-wrap: wrap;">
            <div>
              <div style="font-size: 22px; font-weight: 900; letter-spacing: .4px;">Profile</div>
              <div class="muted" style="margin-top: 4px;">
                Stats are stored in your browser for now. Later we’ll add login + cloud sync.
              </div>
            </div>

            <div style="display:flex; gap: 10px; flex-wrap: wrap;">
              <a
                href="#/play"
                style="
                  display:inline-flex; align-items:center; justify-content:center;
                  padding: 10px 12px;
                  border-radius: 12px;
                  background: rgba(255,255,255,0.08);
                  border: 1px solid rgba(255,255,255,0.14);
                  color: rgba(255,255,255,0.92);
                  text-decoration:none;
                  font-weight: 800;
                "
              >Play</a>

              <button
                id="resetBtn"
                style="
                  cursor:pointer;
                  padding: 10px 12px;
                  border-radius: 12px;
                  background: rgba(255,255,255,0.03);
                  border: 1px solid rgba(255,255,255,0.12);
                  color: rgba(255,255,255,0.88);
                  font-weight: 800;
                "
                type="button"
              >Reset Best</button>
            </div>
          </div>

          <div style="margin-top: 14px; display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;">
            <div
              style="
                padding: 12px;
                border-radius: 14px;
                background: rgba(0,0,0,0.18);
                border: 1px solid rgba(255,255,255,0.10);
              "
            >
              <div class="muted" style="font-size: 12px; letter-spacing: .8px;">BEST SCORE</div>
              <div id="bestScore" style="margin-top: 6px; font-size: 28px; font-weight: 900;">00000</div>
            </div>

            <div
              style="
                padding: 12px;
                border-radius: 14px;
                background: rgba(0,0,0,0.18);
                border: 1px solid rgba(255,255,255,0.10);
              "
            >
              <div class="muted" style="font-size: 12px; letter-spacing: .8px;">NEXT</div>
              <div style="margin-top: 6px; font-size: 14px; opacity: .9; line-height: 1.35;">
                • Username + avatar<br/>
                • Cloud save<br/>
                • Session history
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const bestScoreEl = root.querySelector<HTMLDivElement>("#bestScore")!;
  const resetBtn = root.querySelector<HTMLButtonElement>("#resetBtn")!;

  const refresh = () => {
    bestScoreEl.textContent = fmt5(readBest());
  };

  resetBtn.onclick = () => {
    localStorage.removeItem(BEST_KEY);
    refresh();
  };

  refresh();
}
