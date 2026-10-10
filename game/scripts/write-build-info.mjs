// Stamps game/dist with a content-hash build identity after `vite build`, so the launcher and
// the in-page error UI can tell a stale/partial dist apart from the build that was just produced
// (docs/09 J1.5 — "dist/index.html existing does not prove its contents match current sources").
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}

const files = collectFiles(distDir).sort();
const hash = createHash('sha256');
for (const f of files) {
  hash.update(relative(distDir, f).replace(/\\/g, '/'));
  hash.update(readFileSync(f));
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const buildInfo = {
  app: 'crux',
  version: pkg.version,
  buildId: hash.digest('hex').slice(0, 16),
  builtAt: new Date().toISOString(),
  fileCount: files.length,
};

writeFileSync(join(distDir, 'build-info.json'), JSON.stringify(buildInfo, null, 2));
console.log(`[write-build-info] ${buildInfo.buildId} (${files.length} files, ${buildInfo.builtAt})`);
