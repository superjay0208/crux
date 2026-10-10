# Crux task tracker

Current polish plan: [docs/12-framing-demo-and-web-release.md](docs/12-framing-demo-and-web-release.md).

- [x] S0 Inspect build and research framing, UI and GitHub Pages; write execution plan.
- [x] S1 Smaller view and whole-body containment during active climbing.
- [x] S2 Limb-bound grip rings and swap wheel, clear fatigue warning.
- [x] S3 Animated climbing start screen and clean navigation lifecycle.
- [x] S4 Distinct harder routes with proven physics and browser solutions.
- [ ] S5 Web-path compatibility, GitHub repository and Pages publishing.
- [ ] S6 Production browser, framing, UI, route and deployment validation.

Publishing access: existing Git Credential Manager login verified as superjay0208; ready to publish.

Active request: independent identity and style; progressive grip/swap campaign; constrained crossed-foot
reach; spinning green-zone QTE; contact effects; detailed research and validation.

Plan: [docs/11-crux-campaign-and-timing-plan.md](docs/11-crux-campaign-and-timing-plan.md).

- [x] R0 Research and detailed design before implementation.
- [x] R1 Crux identity, project relocation, distinct menu/wall/hold/character styling.
- [x] R2 Torso-local crossed-foot reach, circular timing rules, temporary swap-joint removal/restoration.
- [x] R3 Wheel QTE, Space/click input, grip/swap effects, visible goals and lifecycle cleanup.
- [x] R4 Twelve authored routes, progressive mechanics, order-driven unlocks and solution recipes.
- [x] R5 62 unit tests, type checks, all twelve physical solution replays and production build.
- [x] R6 Final production browser regression, visual inspection, launch verification and handoff.

## Implemented behavior

1. Level 1 jugs; level 2 secure-crimp checkpoint; level 3 foot swap and exit support; levels 4–12 combine
   all mechanics, with mirrored stances and reach changes. Practice is always unlocked.
2. Q/E independently drain about six seconds of reserve. Full crimp secures an edge; key release or
   exhaustion enters a short grace period before slip. Jugs recover reserve.
3. Foot range rotates with the torso and is shortened smoothly across the hip. The same envelope
   clamps pointer targets, rejects impossible contacts and draws the reach guide.
4. Swap wheel rotates at 0.55 turns/second over a 3.6-second deadline. One Space/click confirmation
   succeeds in green. Miss/timeout/cancel keeps outgoing support; success transfers in one command.
5. Parked incoming foot has no rope joint during timing, so it cannot accidentally add physical support.
6. Contact rings, chalk dust, crimp halos/finger marks, swap sound/result feedback; reduced motion
   suppresses decorative particles. Retry/back/blur clear input safely.

## Follow-up after this playable slice

- Tune difficulty and expand routes beyond short mechanics exercises using human play feedback.
- More complete articulated hip/knee/heel-hook mechanics and directional hold friction.
- A persistent accessibility/settings panel and optional slower timing mode.
- Package the runtime inside a standalone release folder; the current launch uses the workspace Node.
- Establish reviewed visual baselines for Crux; current visual QA archives screenshots for inspection.

## Validation log

2026-10-09: research/plan saved before edits. Existing investigation archived before relocation.
All twelve routes complete with actual physics and finite state. First browser pass completed all twelve
routes and mechanics cases; repaired two obsolete regressions (unused-font check, fixed-delay release).
Production screenshot probes at DPR 1/1.25 pass with no page errors or failed assets. Final production
regression: 25/25 browser tests pass. All twelve solutions replay correctly in fresh worlds; every
exit approach accepts the freed leg and rejects the crossed leg. Batch launch and repeat server reuse
are verified against build `24540d8bac54f1e8`; final source-comment cleanup was rebuilt with the same bundle identity.
Details and practical limitations: [validation review](validation/crux-2026-10-09/REVIEW.md).
