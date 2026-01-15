import "./style.css";
import { renderHome } from "./pages/home";
import { renderPlay } from "./pages/play";
import { renderProfile } from "./pages/profile";

type Cleanup = void | (() => void);

function mustGetAppRoot(): HTMLDivElement {
  const el = document.querySelector<HTMLDivElement>("#app");
  if (!el) {
    throw new Error("Missing #app element. Check index.html has <div id='app'></div>.");
  }
  return el;
}

const app = mustGetAppRoot();

let cleanup: Cleanup;

function setCleanup(next: Cleanup) {
  if (typeof cleanup === "function") {
    try {
      cleanup();
    } catch (e) {
      console.error("cleanup error:", e);
    }
  }
  cleanup = next;
}

function route() {
  const hash = location.hash || "#/";
  const path = hash.startsWith("#") ? hash.slice(1) : hash;

  // Always mount a root container so we never get a blank app
  app.innerHTML = `<div id="pageRoot"></div>`;
  const root = app.querySelector<HTMLDivElement>("#pageRoot")!;

  if (path === "/" || path === "" || path === "/home") {
    setCleanup(renderHome(root));
    return;
  }

  if (path.startsWith("/play")) {
    setCleanup(renderPlay(root));
    return;
  }

  if (path.startsWith("/profile")) {
    setCleanup(renderProfile(root));
    return;
  }

  // 404
  setCleanup(undefined);
  root.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="brand">
          RETRO VAULT
          <div class="sub">Router</div>
        </div>
        <div class="nav">
          <a href="#/">Home</a>
          <a href="#/play">Play</a>
          <a href="#/profile">Profile</a>
        </div>
      </div>

      <div class="card" style="margin-top: 12px;">
        <h1>Not found</h1>
        <p class="muted">Route: <code>${hash}</code></p>
      </div>
    </div>
  `;
}

window.addEventListener("hashchange", route);
route();
