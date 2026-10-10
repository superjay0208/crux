import fs from 'fs';
import path from 'path';
import { Simulation } from '../src/core/sim/Simulation';
import { LevelLoader } from '../src/core/data/levelLoader';
import { ReplayData, LevelData, ProfileConfig } from '../src/core/data/schema';

function loadJson(filePath: string): any {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }
  return JSON.parse(fs.readFileSync(absPath, 'utf-8'));
}

async function main() {
  const replayPath = process.argv[2];
  if (!replayPath) {
    console.error('Usage: tsx scripts/sim-cli.ts <path-to-replay.json>');
    process.exit(1);
  }

  const replay: ReplayData = loadJson(replayPath);

  // Load profile
  const profilePath = path.resolve(
    process.cwd(),
    `public/profiles/${replay.profile}.json`
  );
  const profile: ProfileConfig = LevelLoader.validateProfile(loadJson(profilePath));

  // Load level: check fixtures or public levels
  let levelPath = path.resolve(
    process.cwd(),
    `tests/fixtures/levels/${replay.levelId}.json`
  );
  if (!fs.existsSync(levelPath)) {
    levelPath = path.resolve(
      process.cwd(),
      `public/levels/original/${replay.levelId}.json`
    );
  }
  if (!fs.existsSync(levelPath)) {
    levelPath = path.resolve(
      process.cwd(),
      `public/levels/desktop/${replay.levelId}.json`
    );
  }

  const level: LevelData = LevelLoader.validateLevel(loadJson(levelPath));

  console.log(`Loaded Replay: ${replayPath}`);
  console.log(`Profile: ${profile.id}, Level: ${level.name} (${level.id})`);

  const sim = new Simulation(level, profile);

  sim.session.addListener((event) => {
    console.log(`[Event @ tick ${sim.getTick()}]`, JSON.stringify(event));
  });

  // Enqueue commands
  sim.enqueueCommands(
    replay.commands.map((c) => ({
      tick: c.tick,
      type: c.type,
      limb: c.limb,
      pos: c.pos ? { x: c.pos[0], y: c.pos[1] } : undefined,
      hand: c.hand,
      active: c.active,
      key: c.key,
    }))
  );

  const maxCmdTick = replay.commands.reduce((max, c) => Math.max(max, c.tick), 0);
  const runUntilTick = Math.max(maxCmdTick + 60, 120);

  let finished = false;
  for (let t = 0; t <= runUntilTick; t++) {
    sim.stepTick();
    if (sim.session.getState() === 'Finished') {
      finished = true;
      break;
    }
  }

  const finalSnap = sim.getLatestSnapshot();
  console.log('--- Simulation Finished ---');
  console.log(`Final State: ${finalSnap.sessionState}`);
  console.log(`Final Tick: ${finalSnap.tick}`);
  console.log(`Moves: ${finalSnap.moves}`);
  console.log(`Time: ${finalSnap.timeSeconds.toFixed(2)}s`);
  console.log(
    `Torso: (${finalSnap.torso.pos.x.toFixed(3)}, ${finalSnap.torso.pos.y.toFixed(3)})`
  );

  if (finalSnap.sessionState === 'Finished') {
    console.log('Finished');
    process.exit(0);
  } else {
    console.error(`Replay did not finish (ended in ${finalSnap.sessionState})`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});

