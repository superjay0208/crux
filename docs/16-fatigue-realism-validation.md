# Fatigue and realism prototype validation

Implementation date: 2026-10-09. Research and execution plan: [15-fatigue-and-realism-mode.md](15-fatigue-and-realism-mode.md). This is a playable 2D game approximation, not a validated biomechanical simulation.

## Delivered behavior

- Standard movement reserve drains faster and recovers much more slowly. Full crimps last four seconds, and the footswap wheel has a shorter deadline, faster rotation, and narrower green sector.
- Both hands must securely match TOP for 0.35 seconds. An open crimp, incomplete goals, pending swap, lost required support, or depleted reserve prevents establishment.
- Realism has one reserve across the attempt, slow idle loss, movement/action costs, and no passive refill. Better foot loading reduces arm demand. Crimp reserve is five seconds.
- Hold Z/C to unload and shake the left/right arm. Recovery requires the other hand on a jug, at least 25% useful foot loading, balance, and a steady body. Release the key and drag the resting hand back. Invalid activation never drops the last supporting hand.
- Ordinary toe support pushes through the leg rather than pulling the torso through a rope. High, overly folded, overextended, unreachable, or incorrectly directed contacts do not provide upward support. A briefly unweighted high step is allowed; the body must transfer weight before moving the next foot.
- All twelve realism routes include upward foot progression and viable jug rest opportunities. Realism establishment needs at least 15% useful foot load. Standard and Realism have separate unlocks, records, and menu demos.
- Hip reserve, hand crimp rings, shoe loading marks, and arm recovery feedback remain compact. The FOOT goal shows whether the realism finish has useful support. Paired crimp rings separate when the hands match a small finish. Hidden tabs pause resources and clear held inputs; retry and navigation clear attempt state.

## Final tuning

All values below are gameplay settings, not measured physiological constants.

| Setting | Standard | Realism |
| --- | --- | --- |
| General movement base drain | 0.30/s, plus force-dependent effort | 0.055/s, multiplied by effort and arm demand |
| Idle reserve | Refills 0.22/s | Loses 0.0015/s plus arm-load loss |
| Arm-load loss | Included in drag effort | 0.008/s times squared arm demand; one-hand factor 1.7 |
| Starting hand / foot move cost | None separate from drag | 0.018 / 0.012 |
| Qualified rest recovery | Idle refill | 0.045/s before ongoing load loss |
| Full-crimp duration | 4 s | 5 s |
| Open-grip grace | 0.40 s | 0.45 s |
| Wheel deadline / rotation | 2.4 s / 0.8 turns/s | Same |
| Wheel green width | 0.14 turns, about 175 ms per revolution | Same |
| TOP establishment | Both hands, 0.35 s | Same, plus useful feet |

Support uses a damped, nonnegative compression spring, rotated hold friction cone, geometric quality, and bounded reaction forces. An active stance controller supplies bounded lateral steering and hip balance. Secure bent arms can bear residual vertical load before an arm-length rope becomes taut. These approximations address the instability of an endpoint-only inverted pendulum without secretly attaching feet in tension.

## Route matrix

`npm run campaign:check` executes all recipes through ordinary simulation commands, records them, and replays each on a fresh world. It grants no reserve and does not attach contacts through a debug shortcut.

| Route | Standard moves | Realism moves | Physics and fresh replay |
| --- | ---: | ---: | --- |
| First Light | 2 | 4 | Pass |
| Thin Edge | 3 | 5 | Pass |
| Switchback | 4 | 4 | Pass |
| Contact | 7 | 10 | Pass |
| Sidewinder | 8 | 10 | Pass |
| Balance | 8 | 10 | Pass |
| Crossover | 9 | 11 | Pass |
| Pinpoint | 9 | 12 | Pass |
| Chalk Line | 11 | 16 | Pass |
| Offset | 11 | 15 | Pass |
| Sequence | 14 | 18 | Pass |
| Crux | 16 | 21 | Pass |

Browser testing caught sequences that consumed crimp reserve during foot transfers. Crossover/Offset now offer a jug before the second transfer. Pinpoint performs the foot swap before its short final crimp section. Realism recipes establish the next stance before committing to a crimp when appropriate. These are content fixes validated with human-speed mouse input, not faster test-only movement.

The final Crux section also retains an intermediate stance: skipping directly to the highest footholds made them unweightable before the hips rose. A second foot progression shifts support beneath the final match. Raising a foothold alone was insufficient; feet must be staged at heights the current body position can actually load.

## Acceptance evidence

- TypeScript and **93 unit tests passed**. These cover resource integration and costs, support benefit, qualified/rejected/interrupted rests, exhaustion, reset, two-hand dwell, contact reach loss, compression without tension, friction direction and caps, save migration/isolation, and existing mechanics.
- All **28 level assets** passed validation.
- All **24 campaign solutions and fresh replays** passed.
- Replay framing checks cover every route in both modes at 1280x720, 1012x1050 at DPR 1.25, 640x360 at DPR 2, and 1920x800. Camera input conversion remains invertible.
- Production build passed. All **48 browser scenarios passed locally**: 47 in the full production regression, then the corrected final Crux route in a focused rerun. All twelve routes in both modes use actual mouse/keyboard input. The suite also covers matched finishes, paired crimp rings, qualified recovery, mode saves, blur/retry/navigation, hidden-tab freeze, reduced motion, display scaling, and existing gameplay.
- The production **`/crux/` subpath smoke passed**: menu demo, two-hand finishes in both modes, isolated saves, direct-level loading, JSON and font requests. Screenshots were visually reviewed, including loaded feet, recovery, final matched crimps, and whole-body containment.
- **GitHub Linux/Chromium validation and Pages deployment passed** for release `d70b09c`: [run 38029012451](https://github.com/superjay0208/crux/actions/runs/38029012451). The complete suite of 48 browser tests ran with no retries before deployment.
- **Live website smoke passed** at https://superjay0208.github.io/crux/: actual first-route finishes in both modes, refusal of a single-hand finish, isolated progression and reload, animated demo, direct route, JSON and fonts. No browser errors or failed HTTP responses were observed.
- Local launcher refreshed and health-checked at http://localhost:8642/, build `c44c5f66aab6730d`. The deployed Linux build is `f03539518ea0d119`; both serve `index-DfSqbOKn.js` and `index-WkNoTfl8.css`. The live Crux variant has 21 target moves and 16 checkpoints, confirming the final foot-progression content is deployed.

Canonical replay evidence is versioned in `game/tests/replays/campaign/` and `game/tests/replays/realism/`. Raw results and screenshots are saved locally in `validation/fatigue-realism-2026-10-09/`; generated output is intentionally excluded from Git. CI repeats the complete physics, unit, asset, browser, and web-path gates before Pages publishing.

The final small FOOT cue received a focused production rerun locally; the final complete browser run on Linux/Chromium covers that cue across all twelve realism finishes. Deployment metadata is archived in `deployment-results.json`, and live/subpath smoke results in `browser/live-results.json` and `browser/subpath-results.json`.

## Limits and next useful work

The model uses a front-view torso proxy for balance and endpoint leg geometry. It does not resolve knee/ankle joint torque, wall-normal depth, wall angle, heel/toe hooking, true three-dimensional barn-door effects, or individual muscle fatigue. Force and friction values are tuned for this game's body scale. It should not be used to predict a real person's feasible moves or injury risk.

Next work should prioritize human playtesting of difficulty and alternate solutions, then an articulated leg controller and wall-depth/contact model if greater physical fidelity is desired. An optional slower timing/accessibility setting is also a useful follow-up.
