import './ui/styles/shared.css';
import { Router } from './app/router';
import { LevelLoader } from './core/data/levelLoader';
import { LevelData, ProfileConfig } from './core/data/schema';
import { SaveStore } from './persist/SaveStore';
import { AudioBank } from './audio/AudioBank';
import { assetUrl } from './core/data/assets';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Crux campaign order. The isolated test fixture and practice route are outside progression.
const ORIGINAL_LEVEL_IDS = [
  'first_light', 'thin_edge', 'switchback', 'contact', 'sidewinder', 'balance',
  'crossover', 'pinpoint', 'chalk_line', 'offset', 'sequence', 'crux', 'lab', 'grip_lab',
];

// Shown instead of a silently blank canvas when startup fails. The batch
// launcher gets a player this far; from here on, failures need to be visible in the page itself
// since there is no console for a player to open.
function showLoadError(message: string): void {
  const shellTitle = document.getElementById('shell-title');
  if (shellTitle) shellTitle.style.display = 'none';

  const el = document.getElementById('load-error');
  const msgEl = document.getElementById('load-error-message');
  if (el && msgEl) {
    msgEl.textContent = message;
    el.hidden = false;
  } else {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<pre style="color:#fff;background:#900;padding:1em;white-space:pre-wrap;">${message}</pre>`
    );
  }
}

async function init() {
  await document.fonts.ready;

  const retryButton = document.getElementById('load-error-retry');
  if (retryButton) {
    retryButton.addEventListener('click', () => window.location.reload());
  }

  const canvas = document.getElementById('viewport') as HTMLCanvasElement | null;
  const container = document.getElementById('game-container');
  if (!canvas || !container) {
    showLoadError('The game page is missing its canvas/container elements. Try reloading; if this persists, the build may be corrupted.');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('shell') === 'true') {
    return;
  }
  const profileName = params.get('profile') || 'original_browser';
  const directLevelId = params.get('level'); // e2e tests jump straight into a level

  let profile: ProfileConfig;
  try {
    const profileData = await fetchJson<any>(assetUrl(`profiles/${profileName}.json`));
    profile = LevelLoader.validateProfile(profileData);
  } catch (err) {
    showLoadError(
      `Could not load the "${profileName}" game profile (${(err as Error).message}). ` +
        `Check that the server is serving the current build, then Retry.`
    );
    return;
  }

  const levels: LevelData[] = [];
  for (const id of ORIGINAL_LEVEL_IDS) {
    try {
      const raw = await fetchJson<any>(assetUrl(`levels/original/${id}.json`));
      levels.push(LevelLoader.validateLevel(raw));
    } catch (err) {
      console.warn(`Skipping level ${id}:`, err);
    }
  }
  if (levels.length === 0) {
    showLoadError('No playable levels could be loaded. Check that the server is serving the current build, then Retry.');
    return;
  }

  const shellTitle = document.getElementById('shell-title');
  if (shellTitle) shellTitle.style.display = 'none';

  const saveStore = new SaveStore();
  saveStore.setCampaign(levels);
  const audio = new AudioBank();
  const router = new Router({ container, canvas, profile, levels, saveStore, audio });

  if (directLevelId) {
    canvas.style.display = 'block';
    router.showLevel(directLevelId);
  } else {
    canvas.style.display = 'none';
    router.showStart();
  }

  // Attach to window for automated testing / debugging. `facade` is a live getter so e2e
  // tests keep working across menu <-> play navigation (Router replaces the facade on every
  // showLevel call).
  (window as any).__crux = {
    router,
    saveStore,
    audio,
    levels,
    profile,
    level: directLevelId ? levels.find((l) => l.id === directLevelId) : undefined,
    get facade() {
      return router.getFacade();
    },
  };
}

window.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => {
    console.error('Initialization error:', err);
    showLoadError(`Unexpected error while starting the game: ${(err as Error).message}. Try Retry.`);
  });
});
