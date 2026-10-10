# Crux

A physics climbing puzzle: place hands and feet, manage separate crimp reserves, and time foot transfers
to open the next move. Twelve original routes progress from one-move introductions to a 15-move finale,
with traverses, high steps, grip transfers and repeated pivots. A live climbing demo welcomes you,
and a smaller view keeps the entire climber in frame.

## Play

Web address: [Play Crux](https://superjay0208.github.io/crux/).

In the development workspace, double-click [run.bat](run.bat) to play the prebuilt release.
For a fresh clone, install Node 22, run `npm ci` and `npm run build` in `game/` first.
Then run `npm run launch` in `game/`, or use the Windows launcher. `npm run dev` starts development.

- Drag a hand or shoe; release when the actual limb reaches a highlighted hold.
- Jugs stay secure. Hold **Q** for the left hand or **E** for the right hand on a crimp.
- Hand rings show about six seconds of full-crimp reserve: green to red, shaking near exhaustion.
  Move onto a jug to recover; release the crimp key before reengaging after exhaustion.
- For a foot swap, drag the other shoe onto an occupied foothold. Press **Space** or click the center
  while the pointer is over the green arc. A miss keeps the original supporting foot attached.
- Crossing over the hip reduces the foot's reach. An amber guide shows the feasible range.
- Touch numbered checkpoints and reach **TOP** with a foot on **EXIT FOOT** where shown.
- **Escape** cancels a pending swap. Bottom-left controls return to routes or retry.
- **Grip Lab** is always available from route selection. **?** toggles concise controls.
- Reduced-motion preferences disable demo playback and fatigue shake.

The body and grip constants are gameplay approximations. Real climbing permits more hip rotation,
cross-through techniques, and grip options than this 2D controller models.

Validation details and deployment steps: [web publishing](docs/13-web-publishing.md).
Local release checks pass: **70 unit tests, 32 production browser tests, 12 physics solutions and
fresh replays**, plus a smoke test beneath the `/crux/` hosting path.

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

Research and implementation: [polish plan](docs/12-framing-demo-and-web-release.md).
Progress: [TASKS.md](TASKS.md). Raw local evidence is in `validation/web-polish-2026-10-09/`.
Dependency and font notices: [THIRD_PARTY.md](THIRD_PARTY.md).
