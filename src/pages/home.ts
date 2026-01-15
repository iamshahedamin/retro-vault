export function renderHome(root: HTMLElement) {
  root.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="brand">RETRO VAULT</div>
        <div class="links">
          <a href="#/profile">Profile</a>
        </div>
      </div>

      <div class="card">
        <h1>Dino Run</h1>
        <p>Minimal. Fast. Saved progress (soon).</p>
        <button id="playBtn">Play</button>
      </div>
    </div>
  `;

  root.querySelector<HTMLButtonElement>("#playBtn")!.onclick = () => {
    location.hash = "/play";
  };
}
