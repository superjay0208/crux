# Crux

A physics climbing puzzle: place hands and feet, manage crimp reserves, and time foot transfers.
Standard mode has twelve increasingly demanding routes. Realism adds twelve variants with useful
foot loading, fatigue across the entire attempt, and supported jug rests. Both modes require an
established two-hand finish. A live climbing demo welcomes you, and the view keeps the whole body visible.

## Play

Web address: [Play Crux](https://superjay0208.github.io/crux/).

In the development workspace, double-click [run.bat](run.bat) to play the prebuilt release.
For a fresh clone, install Node 22, run `npm ci` and `npm run build` in `game/` first.
Then run `npm run launch` in `game/`, or use the Windows launcher. `npm run dev` starts development.

- Drag a hand or shoe; release when the actual limb reaches a highlighted hold.
- Jugs stay secure. Hold **Q** for the left hand or **E** for the right hand on a crimp.
- Hand rings show four seconds of full-crimp reserve in Standard, five in Realism: green to red,
  shaking near exhaustion.
  Move onto a jug to recover; release the crimp key before reengaging after exhaustion.
- For a foot swap, drag the other shoe onto an occupied foothold. Press **Space** or click the center
  while the pointer is over the green arc. A miss keeps the original supporting foot attached.
- Crossing over the hip reduces the foot's reach. An amber guide shows the feasible range.
- Touch numbered checkpoints, then match **TOP** with both hands for 0.35 seconds.
- **Realism:** one reserve lasts across the attempt. Stillness slowly drains; moves consume more.
  Move the feet upward and wait for useful weight transfer. Mint shoe rings show loaded contacts;
  amber rings mark unweighted placements. A loaded foot is required to establish the finish.
- Hold **Z** / **C** to shake the left / right hand while the other hand holds a jug and useful feet
  support a steady body. Release the key, then drag the resting hand back to a hold. Idle alone never
  refills reserve. Mode selection and campaign progress are saved separately.
- **Escape** cancels a pending swap. Bottom-left controls return to routes or retry.
- **Grip Lab** is always available from route selection. **?** toggles concise controls.
- Reduced-motion preferences disable demo playback and fatigue shake.

The forces and fatigue rates are gameplay approximations. Realism uses compressive legs with bounded
balance and bent-arm support, not an articulated human musculoskeletal simulation. Depth, true joint
torque, wall inclination, and heel/toe hooks are not resolved by this front-view model.

Validation details and deployment steps: [web publishing](docs/13-web-publishing.md).
Current research, implementation details and acceptance gates: [fatigue and realism plan](docs/15-fatigue-and-realism-mode.md).
Current results, tuning and limitations: [prototype validation](docs/16-fatigue-realism-validation.md).

## Develop and validate

Stack: TypeScript, Planck 1.5, Canvas/DOM, Vite, Vitest, and Playwright with installed Microsoft Edge.
Run these from `game/`:

```powershell
npm run dev
npm run campaign:check
npm run check
npm run levels:check
npm run build
$env:CRUX_PRODUCTION='1'
npm run e2e
npm run web:check
```

`campaign:build` regenerates the authored level files and solution recipes. `campaign:check` executes
them through the actual fixed-step physics and saves command replays. The browser campaign tests use
real keyboard and mouse input; the visual tests archive screenshots at DPR 1 and 1.25.

Progress: [TASKS.md](TASKS.md). Current raw evidence is in `validation/fatigue-realism-2026-10-09/`.
Dependency and font notices: [THIRD_PARTY.md](THIRD_PARTY.md).
