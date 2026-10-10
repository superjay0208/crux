# Polish validation, 2026-10-09

Implemented:

- Base camera height 8.7 instead of 6.9, whole visual body bounds including both IK bend
  directions, immediate expansion and minimal pan, no within-attempt zoom oscillation.
- Limb-bound circular grip resources, green-to-red reserve, low reserve shaking suppressed
  by reduced motion; 96px foot wheel with center click/Space input and circular deadline.
- A minimal start screen replaying Contact, Crossover and Sequence through real physics;
  replay playback never registers gameplay input or records save progress.
- Individually authored upper sequences, visited secure-contact checkpoints, high steps,
  repeated pivots and upper crimps. Route solution counts: 1, 2, 3, 6, 7, 7, 8, 8, 10, 10, 13, 15.
- Relative JSON/demo URLs and Vite-processed font URLs; project-site Pages workflow.

Local checks:

- TypeScript and 70 unit tests pass, including all saved replay poses at four viewport/DPR
  combinations, dangling legs, coordinate round trips and checkpoint completion/reset semantics.
- All 14 route assets load and initialize.
- All 12 campaign recipes finish through real actuator commands; fresh simulations replay
  the recorded commands and match the finish/move count.
- 32 production browser tests pass in Edge: every campaign route uses real mouse/keyboard
  input; UI tracking, warning/reduced motion, swap failure/cancellation, demo cycling/cleanup,
  saves, painted shoe picking, resize and body containment are covered.
- Production build served beneath `/crux/` passes demo, actual first-route completion,
  saved reload, direct-level, JSON and font smoke checks without console or HTTP errors.

Raw reports and screenshots are retained locally in `validation/web-polish-2026-10-09/`.
Canonical solutions are in `game/tests/replays/campaign/`; three are also shipped as demo assets.
Third-party font and Planck notices are preserved.

Remaining practical limits: gameplay approximates body mechanics in 2D; checkpoints enforce
route challenges but alternate beta is possible. Difficulty has proven solvability and increased
sequence/precision demands, but enjoyment and grading still need human playtesting. Desktop
keyboard plus mouse is the supported control scheme; touch crimp buttons are future work.

Remote publication verification is recorded below after deployment.
