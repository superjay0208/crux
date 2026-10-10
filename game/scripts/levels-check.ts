import fs from 'fs';
import path from 'path';
import { LevelLoader } from '../src/core/data/levelLoader';
import { Simulation } from '../src/core/sim/Simulation';
import { LevelData, ProfileConfig } from '../src/core/data/schema';

function checkDirectory(dir: string, profile: ProfileConfig): number {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  let errCount = 0;

  for (const file of files) {
    const fullPath = path.join(dir, file);
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      const level: LevelData = LevelLoader.validateLevel(data);

      // Check start holds
      const holdsMap = new Map(level.holds.map((h) => [h.id, h]));

      if (level.start.leftHand) {
        const h = holdsMap.get(level.start.leftHand);
        if (!h) throw new Error(`Start leftHand hold ${level.start.leftHand} not found`);
        if (!h.allowHands) throw new Error(`Hold ${h.id} does not allow hands`);
      }
      if (level.start.rightHand) {
        const h = holdsMap.get(level.start.rightHand);
        if (!h) throw new Error(`Start rightHand hold ${level.start.rightHand} not found`);
        if (!h.allowHands) throw new Error(`Hold ${h.id} does not allow hands`);
      }
      if (level.start.leftFoot) {
        const h = holdsMap.get(level.start.leftFoot);
        if (!h) throw new Error(`Start leftFoot hold ${level.start.leftFoot} not found`);
        if (!h.allowFeet) throw new Error(`Hold ${h.id} does not allow feet`);
      }
      if (level.start.rightFoot) {
        const h = holdsMap.get(level.start.rightFoot);
        if (!h) throw new Error(`Start rightFoot hold ${level.start.rightFoot} not found`);
        if (!h.allowFeet) throw new Error(`Hold ${h.id} does not allow feet`);
      }

      // Check outlines have at least 3 vertices
      for (const h of level.holds) {
        if (!Array.isArray(h.outline) || h.outline.length < 3) {
          throw new Error(`Hold ${h.id} outline has fewer than 3 vertices`);
        }
      }

      // Check sim can instantiate and step 1 tick
      const sim = new Simulation(level, profile);
      sim.stepTick();

      const approxMark = (level as any).approx ? ' [≈ approx]' : '';
      console.log(`✓ ${file}: ${level.name} (${level.holds.length} holds)${approxMark}`);
    } catch (e: any) {
      console.error(`✗ ${file}: ${e.message}`);
      errCount++;
    }
  }

  return errCount;
}

async function main() {
  console.log('=== Checking All Level Files ===');
  const profileOriginal = LevelLoader.validateProfile(
    JSON.parse(fs.readFileSync('public/profiles/original_browser.json', 'utf-8'))
  );

  const origDir = path.resolve(process.cwd(), 'public/levels/original');
  const origErrors = checkDirectory(origDir, profileOriginal);

  if (origErrors > 0) {
    console.error(`Validation failed with ${origErrors} error(s).`);
    process.exit(1);
  } else {
    console.log('All levels valid!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error in levels check:', err);
  process.exit(1);
});

