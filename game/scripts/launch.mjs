// Local launcher for the Crux production build. Plain ESM with no
// dependencies, so it runs from a release copy without `npm install`.
//
// Responsibilities:
//  - Serve the prebuilt `dist/` on loopback (no Python dependency).
//  - Reuse an already-running instance of THIS game on repeat launches instead of piling up
//    duplicate servers; fall back to the next free port if something else owns the preferred one.
//  - Track the server we own in a lock file so `--stop` only ever kills a process we started
//    and verified, never an arbitrary one that happens to hold the port.
//  - Wait for the server to actually answer before opening a browser, and fail with an
//    actionable message instead of leaving the player at a blank tab.
//
// Usage: node scripts/launch.mjs [--desktop] [--stop] [--no-open] [--port=8642]
//        node scripts/launch.mjs --serve --port=8642   (internal: the long-running server process)

import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ID = 'crux';
const DEFAULT_PORT = 8642;
const PORT_SCAN_RANGE = 20;

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(root, 'dist');
const lockDir = join(root, '.launcher');
const lockFile = join(lockDir, 'server.lock.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

function parseArgs(argv) {
  const out = { desktop: false, stop: false, serve: false, noOpen: false, port: null };
  for (const a of argv) {
    if (a === '--desktop') out.desktop = true;
    else if (a === '--stop') out.stop = true;
    else if (a === '--serve') out.serve = true;
    else if (a === '--no-open') out.noOpen = true;
    else if (a.startsWith('--port=')) out.port = parseInt(a.slice('--port='.length), 10);
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBuildInfo() {
  try {
    return JSON.parse(readFileSync(join(distDir, 'build-info.json'), 'utf8'));
  } catch {
    return null;
  }
}

function fetchHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/__crux/health', timeout: 800 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, '127.0.0.1');
  });
}

/** Kills the server on `port` only if this launcher's own lock file names it and a live health
 * check confirms the same pid is still the one answering — the same ownership check `--stop`
 * uses. Returns false (and touches nothing) if ownership can't be verified. */
async function killVerifiedOwned(port) {
  if (!existsSync(lockFile)) return false;
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  } catch {
    return false;
  }
  if (lock.port !== port) return false;
  const health = await fetchHealth(port);
  if (!(health && health.app === APP_ID && health.pid === lock.pid)) return false;
  try {
    process.kill(lock.pid);
  } catch {
    return false;
  }
  rmSync(lockFile, { force: true });
  for (let i = 0; i < 20; i++) {
    if (await isPortFree(port)) return true;
    await sleep(100);
  }
  return true; // proceed anyway; a lingering bind would surface as a clear server-start error
}

async function resolvePort(preferred, localBuildId) {
  for (let p = preferred; p < preferred + PORT_SCAN_RANGE; p++) {
    const health = await fetchHealth(p);
    if (health && health.app === APP_ID) {
      if (!localBuildId || health.buildId === localBuildId) {
        return { port: p, reused: true };
      }
      // A previous launch is still serving an older build — reusing it would silently hide
      // every source change behind a stale server (this is exactly what happened once already:
      // see TASKS.md's "clicking/dragging appeared to do nothing" entry). Replace it if we can
      // verify we started it; otherwise leave it alone and keep looking for another port.
      console.log(
        `Port ${p} is running an older crux build (${health.buildId}); replacing it with the current build (${localBuildId}).`
      );
      if (await killVerifiedOwned(p)) {
        return { port: p, reused: false };
      }
      console.warn(`Could not verify ownership of the stale server on port ${p}; leaving it running and trying another port.`);
      continue;
    }
    if (!health) {
      if (await isPortFree(p)) return { port: p, reused: false };
    }
    // else: occupied by an unrelated process — try the next port rather than touching it.
  }
  throw new Error(
    `No free port found for the local game server between ${preferred} and ${preferred + PORT_SCAN_RANGE - 1}.`
  );
}

async function waitForHealth(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const h = await fetchHealth(port);
    if (h && h.app === APP_ID) return h;
    await sleep(150);
  }
  throw new Error(
    `Server on port ${port} did not become ready within ${timeoutMs}ms. ` +
      `It may be blocked by a firewall/antivirus, or the port may be claimed by something that ` +
      `doesn't answer HTTP. Try again, or pass --port=<other number>.`
  );
}

function createStaticServer(buildId) {
  return http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    if (urlPath === '/__crux/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ app: APP_ID, buildId, pid: process.pid }));
      return;
    }

    const filePath = urlPath === '/' ? '/index.html' : urlPath;
    const resolved = normalize(join(distDir, filePath));
    if (!resolved.startsWith(distDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let data;
    try {
      data = readFileSync(resolved);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`Not found: ${filePath}`);
      return;
    }
    const ext = extname(resolved).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function spawnDetachedServer(port) {
  const self = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, [self, '--serve', `--port=${port}`], {
    detached: true,
    stdio: 'ignore',
    cwd: root,
    windowsHide: true,
  });
  child.unref();
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(
    lockFile,
    JSON.stringify({ app: APP_ID, pid: child.pid, port, startedAt: new Date().toISOString() }, null, 2)
  );
  return child.pid;
}

async function stopOwnedServer() {
  if (!existsSync(lockFile)) {
    console.log('No launcher lock file found; nothing to stop.');
    return;
  }
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  } catch {
    console.log('Lock file is unreadable; removing it without stopping anything.');
    rmSync(lockFile, { force: true });
    return;
  }
  if (await killVerifiedOwned(lock.port)) {
    console.log(`Stopped crux server (pid ${lock.pid}, port ${lock.port}).`);
  } else {
    console.log('The recorded server is not currently answering as this game; not killing anything.');
    rmSync(lockFile, { force: true });
  }
}

function openBrowser(port, desktop) {
  const profile = desktop ? 'desktop' : 'original_browser';
  const url = `http://localhost:${port}/?profile=${profile}`;
  const edgeCandidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const edge = edgeCandidates.find((p) => existsSync(p));
  try {
    if (edge) {
      spawn(edge, [`--app=${url}`], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (err) {
    console.error(`Could not open a browser automatically (${err.message}).`);
    console.error(`Open this URL manually: ${url}`);
  }
  if (desktop) {
    console.log(
      '[crux] --desktop selects the experimental physics profile. ' +
        'Use the default launch for the validated Crux campaign.'
    );
  }
  return url;
}

function ensureBuildPresent() {
  if (existsSync(join(distDir, 'index.html'))) return;

  const hasToolchain = existsSync(join(root, 'node_modules'));
  if (!hasToolchain) {
    console.error('ERROR: Game assets are missing (dist/index.html not found), and no local');
    console.error('toolchain (node_modules) is present to build them. This release looks');
    console.error('incomplete or corrupted — re-download or reinstall the game.');
    process.exit(1);
  }

  console.log('No build found — building now (development checkout)...');
  const result = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0 || !existsSync(join(distDir, 'index.html'))) {
    console.error('ERROR: Build failed; dist/index.html is still missing. See the output above.');
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.serve) {
    const port = args.port || DEFAULT_PORT;
    const buildInfo = readBuildInfo();
    if (!buildInfo) {
      console.warn('[crux-server] warning: dist/build-info.json missing; serving an unstamped build.');
    }
    const server = createStaticServer(buildInfo ? buildInfo.buildId : 'unknown');
    server.on('error', (err) => {
      console.error(`[crux-server] failed to bind port ${port}: ${err.message}`);
      process.exit(1);
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`[crux-server] listening on http://127.0.0.1:${port} (pid ${process.pid})`);
    });
    return;
  }

  if (args.stop) {
    await stopOwnedServer();
    return;
  }

  ensureBuildPresent();

  const desiredPort = args.port || DEFAULT_PORT;
  const localBuildInfo = readBuildInfo();
  const { port, reused } = await resolvePort(desiredPort, localBuildInfo ? localBuildInfo.buildId : null);

  if (!reused) {
    spawnDetachedServer(port);
  }

  const health = await waitForHealth(port, 5000);
  console.log(
    `Crux server ready at http://localhost:${port}/ (build ${health.buildId}${reused ? ', reused existing server' : ''})`
  );

  if (!args.noOpen) {
    const url = openBrowser(port, args.desktop);
    console.log(`Opened ${url}`);
  }
}

main().catch((err) => {
  console.error(`Launcher failed: ${err.message}`);
  process.exit(1);
});
