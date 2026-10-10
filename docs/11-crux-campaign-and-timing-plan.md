# Crux: identity, campaign, foot range, and timing wheel

Written before implementation, 2026-10-09. This supersedes the previous replication roadmap.

## 1. Product and research boundary

Crux is a local 2D climbing puzzle with a physical torso, four controllable endpoints, finite reach,
independent hand reserves, and deliberate contact transfers. Keep the working TypeScript/Planck/
Canvas stack. The product should have its own title, campaign names, route layouts, palette, and
interface. Relocate the playable project to `D:/Climbing/crux`; preserve previous investigation files
in a compressed history bundle outside the active project before replacing obsolete documents.
Remove prior game branding from all active source, launcher output, package metadata, page content,
debug globals, storage keys, and current documentation. Do not relabel someone else's research as
Crux evidence. No reference captures belong in the playable asset directory.

Sources checked for this pass:

- [BMC FUNdamentals guidance, sections 2.7–2.8](https://services.thebmc.co.uk/media/files/Skills/FUNdamentals%20Docs/FUNdamentals%201%2C%202%20and%203%20-%20Guidance%20Notes.pdf): foot placement,
  inside/outside edge use, precise swapping, and repositioning. It does not give universal angular limits.
- [REI movement techniques](https://www.rei.com/learn/expert-advice/climbing-techniques.html): hip
  orientation and backsteps change available extension. Crossed feet are not universally incorrect.
- [Coordination in climbing review](https://pubmed.ncbi.nlm.nih.gov/26604101/): environmental and
  individual constraints influence movement and coordination. Supports a constrained puzzle design,
  not a numerical medical model.
- [REI hold guide](https://www.rei.com/learn/expert-advice/climbing-holds.html): large positive jugs,
  small finger edges, and grip differences. Full-crimp endurance below is a gameplay resource.
- [W3C interaction animation](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html): suppress
  decorative motion when reduced motion is requested; essential timing-wheel motion remains readable.
- [Playwright page API](https://playwright.dev/docs/api/class-page#page-wait-for-function): polling
  arguments and timeout options are separate. Wait for an actual contact candidate before mouse-up.

No source supplies a universal percent reach penalty or timing window. All constants below are explicit
game design choices and must be tuned against play tests. Do not describe them as clinical biomechanics.

## 2. Detailed behavioral design

### Campaign

Twelve original routes, each with an independently recorded solution. Level 1: positive jugs only.
Level 2: jugs and a mandatory secure crimp. Level 3: jug hands and a narrow single-foot support with
a foot swap. Levels 4–12: both grip types and a support-transfer section, with mirrored layouts,
larger traverses, reduced crimp rests, and increasingly demanding timing windows where suitable.
Show the route number, name, mechanic chips, and a concise tutorial hint. Practice stays available.
Sequential unlock must derive from the loaded campaign order, not hard-coded retired route IDs.

Because the five-body engine permits hanging entirely on the hands, geometry alone cannot guarantee
footwork. Each route may author a finish stance: a hand on TOP and a foot on a specified exit support.
For grip/swap tutorials and mixed routes, author the required technique checkpoints and display them
openly as route goals. Completion must never silently demand an invisible objective. Reach restrictions
make the swap useful; checkpoints ensure the intended tutorial mechanic is actually practiced.

### Foot range

Create a pure `FootReachModel` with torso-local coordinates. Use the same function for input target
clamping, candidate eligibility, snapshots, and the visible guide. For each foot, its own side is outward
and the other side is medial. Normal radius = configured leg length. Across-hip radial reach smoothly
falls toward 64% of that length, with a transition zone to avoid a discontinuity at the midline.
The exact constants are configurable (`crossedReachFraction`, `crossTransition`). Rotate targets into
the body's frame before evaluating, then back into world coordinates. A limb cannot attach beyond
its current feasible envelope plus a small contact tolerance.

Clamp the drag actuator target, never teleport the physical endpoint. A parked incoming swap foot
must not become an additional rigid support: temporarily remove its rope joint during the QTE and
restore it on success/cancel, preserving all occupancy invariants. The outgoing foot remains attached
until success. Show an amber reach-boundary hint when the requested target is outside the envelope.
Do not apply the foot model to hands or to existing isolated test fixtures unless explicitly enabled.

### Wheel QTE

Replace the A/D sequence with a fixed-step timing phase in [0,1). Start at phase zero, advance at
0.55 revolutions/second, run for 3.6 seconds. Initial target arc: center 0.50, width 0.22 turns (about
400 ms on each pass). Green-zone membership uses circular distance and inclusive edges with epsilon.
Space key-down or the STOP button generates one `swap_confirm` command; ignore key repeat. The
pointer shown at 12 o'clock when phase=0 moves clockwise. SVG green arc and needle use the same
phase convention. No CSS animation clock, random phase, or DOM timeout determines success.

Success transfers occupancy in a single simulation command, counts one move, frees the outgoing
foot, restores the incoming joint, emits feedback. Miss, timeout, Escape, blur, hidden document, retry,
back, and fall clear pending state safely. Miss releases only the incoming foot and preserves the
outgoing support. Q/E continue working while the wheel is active. A/D have no timing-wheel action.
Keep feedback visible briefly after resolution so a miss does not look like a disappearing interface.

### Immersion and visual identity

Dark slate climbing wall with subtle panel seams/bolt dots, off-white typography, mint jugs,
amber/orange crimps, compact numbered route cards, turquoise shirt and light chalk bag. Use rounded
geometric typography from already bundled fonts, not the previous handwritten treatment.
Jugs have a visible recessed lip; crimps a thin highlighted edge; footholds use smaller angular shapes.
TOP and required exit foothold get discreet labels. Crimp engagement: chalk burst, hand halo, subtle
finger ticks; weakening: amber outline; slip: dust/scuff. Swap success: two foot contact rings and a
short chalk arc, gentle sound; miss: warm outline and a short message. Never shake the entire camera
or change the physics for decorative effects. Event effects have bounded lifetimes and bounded count.
Reset clears effects. Reduced-motion mode removes drifting particles and pulse motion, retaining state
outlines and the essential timing pointer.

## 3. Data and code contracts

- `LevelData`: optional `movement` enable/config for cross reach; `goals` with crimp contact and swap
  count requirements; `finishSupportHold`; `solution` authoring metadata stored separately from runtime.
- Profile `footSwap`: `windowSeconds`, `revolutionsPerSecond`, `targetCenter`, `targetWidth`.
- Replay/SimCommand: add `swap_confirm`; drop obsolete sequence fields from snapshots.
- Snapshot footSwap: feet/hold, phase, target center/width, remaining/total seconds, inGreen.
- Snapshot: reach-limited limb indicator and route-goal progress for the HUD.
- `TimingWheel.ts`: phase wrapping and green membership, shared by sim and tests.
- `FootReachModel.ts`: pure transforms, effective reach, clamp, feasibility.
- `Simulation.ts`: owns wheel/checkpoints/cancellation; candidate filters take movement settings.
- `Climber.ts`: owns temporary swap joint detachment/restoration; no extra pending support.
- `KeyboardInput.ts`: Q/E unchanged, Space confirmation, Escape cancellation, lifecycle cleanup.
- `PlayHud.ts`: SVG wheel, stop button, route hint/goals and result feedback, reserves.
- `EffectsRenderer.ts`/`GameFacade.ts`: session-event effects plus continuous crimp state feedback.
- `MenuCrux.ts` and style sheet: replace the old menu/banner with Crux title/cards.
- `scripts/build-campaign.mjs`: deterministic authored JSON and solution recipes; no random geometry.
- `scripts/validate-campaign.ts`: run every recipe through actual fixed-step physics, save replays/results.
- SaveStore uses a fresh Crux key/campaign revision so stale completion never unlocks redesigned routes.

## 4. Execution sequence and checkpoint list

1. R0 research/plan (this file); update TASKS before any feature implementation.
2. R1 archive obsolete research/history, rename folder, rebrand active files and refresh docs.
3. R2 pure timing/reach rules, validation and unit tests; joint lifecycle correction.
4. R3 simulation commands/snapshots/goals, input, timing wheel UI, contact effects.
5. R4 original campaign, order-driven persistence, tutorial UI, reliable solution recipes.
6. R5 full unit/type/build checks and deterministic campaign replay validation.
7. R6 real-input browser campaign completions, miss/timeout/focus/reset/lifecycle cases, DPR 1/1.25,
   visual inspection of production screenshots, launcher/stale-build verification and final documentation.

## 5. Meaningful tests and acceptance

Unit: circular wrap and inclusive arc boundaries; confirm outside/inside and final deadline; no A/D
confirmation; per-hand reserve independence; rotated mirrored reach and continuous medial transition;
same-side target reachable when crossed-side target is rejected; pending limb contributes no joint
support; success/cancel restores exactly one rope joint; no double occupant, no counted miss; reset
clears all goals/effects; crimp/swap checkpoints block and then permit finish stance.

Campaign: assert 12 files, first all jug, second mandatory crimp, third swap and no crimp, all following
both mechanics. Every authored solution must Finish with finite body values and matching goal counts.
Archive command replays, not only static reach-distance calculations. Prove swap tutorial cannot finish
by taking TOP alone, and prove correct side reaches the exit that the crossed foot cannot reach.

Browser: clean fresh save and progressive unlock; first three levels and all mixed recipes driven with
actual mouse/keyboard input (debug reads allowed, state mutation/command injection prohibited); bar
drain visible; rendered wheel stopped on green; miss preserves support; timeout/Escape/blur release
incoming only; Q+E/repeat/blur cleanup; repeated menu visits yield one effective handler. At DPR 1.25,
verify painted endpoints, wheel/panels within viewport, actual contacts, successful swap. Inspect
production screenshots at both DPRs. Collect page errors and failed asset responses. Fix the old golden
capture workflow to avoid treating a newly overwritten image as a successful regression comparison.

Completion criteria: `run.bat` starts current Crux build, all twelve routes have physics-validated solutions,
browser campaign completion succeeds, all active assets/text have Crux identity, goal/miss/reach feedback
is visible, and validation evidence plus pending follow-up work are saved with accurate counts.
