# Crux: framing, demo menu, route variety, and web release

Execution plan, 2026-10-09. Extends the Canvas / Planck / TypeScript game.

## Findings and research

Camera.ts uses only an authored camera, excluding dangling feet, rotated torso/head and bent knees. Increasing the base height alone cannot guarantee containment. Current routes mostly repeat one four-move sequence with small offsets. PlayHud already has all limb positions and mechanic state needed for dynamic placement. Runtime JSON and font URLs start with `/`, which breaks project-site hosting.

Primary references: [Vite static deployment](https://vite.dev/guide/static-deploy.html#github-pages), [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), and [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion). Use a separate `superjay0208/crux` project site at `/crux/`, preserving the portfolio at `/`. Disable decorative shaking/demo playback for reduced motion but retain essential wheel timing.

## S1: whole-body framing

Add world-space visual bounds to ClimberRenderer: shoulder/hip anchors, endpoints, both two-bone IK bend orientations, rotated shirt/shorts corners, head radius and stroke/shadow margin. Increase base camera height from 6.9 to about 8.7. Camera.framePoints includes body bounds and route holds with safe pixel padding. Expand immediately when needed; never shrink within an attempt. Pan only as much as containment requires, preventing oscillation and cursor drift. Retain CSS-pixel transforms and independent DPR buffers. Reset camera on retry; do not teleport bodies or change physics thresholds.

Test rotated bodies, dangling legs, drags, resize, letterboxing, DPR 1/1.25/2, full visual bounds, and coordinate round trips.

## S2: limb UI

Use small DOM/SVG rings positioned by camera.worldToScreen. Hand rings show Q/E and reserve by arc length with green -> amber -> red hue. Show only relevant hands: on crimp, engaged key, or recovering. Low engaged reserve shakes only the ring; reduced motion suppresses shake. Expose reserve/status through accessibility attributes. Swap wheel follows the incoming shoe; center button accepts click or Space, green target and needle remain, outer arc shows deadline. Clamp overlays to canvas bounds, keep hand rings noninteractive, remove static panels and paragraphs. Keep compact checkpoint progress and optional controls.

Validate attachment to limbs through movement/resize; depletion/color/shake; Q/E independence; wheel click/Space, miss, timeout, Escape, blur, retry and navigation cleanup.

## S3: start menu

StartScreen owns a decorative canvas and one requestAnimationFrame. Load a playlist of proven command replays exported by campaign validation. Run actual Simulation without input, audio, HUD or save writes; render with the same renderers. Pause after finishes, switch climbs, pause while hidden and show a still pose for reduced motion. Dispose all frames/listeners on navigation. Minimal CRUX title, Play and Controls buttons. Router.showStart is initial route; direct `?level=` remains. Play opens selection, selection home returns to start, gameplay Back returns to selection.

Test demo movement, no save completions and repeated start/routes/play cycles without duplicate handlers.

## S4: route design

Keep first three introductions: jugs, crimps, swaps. Author later routes individually with support heights, traverses, grip transfers and repeated pivots. Optional visited-hold checkpoints ensure intended challenges occur before finishing. Record real attached contacts, reset correctly, mark checkpoints compactly on holds. Extend recipes with releasing crimp keys/rests. Prove every route with actuator inputs and fresh replay. Export only passing replays for demos. Validate human-speed browser input because fixed-tick solutions alone do not prove sufficient crimp reserve in actual play.

## S5: repository and web

Scope repository to `crux/`; ignore dependencies, builds and local test/launch artifacts. GitHub Actions installs locked dependencies, runs type/unit/asset/route checks, builds and deploys game/dist with Pages/OIDC permissions and deployment environment. Local browser tests use Edge; CI uses Chromium. Fix relative JSON/demo requests and Vite-processed fonts. Test the production game specifically at `/crux/`, including reload/direct routes/assets.

Create repository and enable Pages after validation when GitHub access is connected. Do not claim a live release before the endpoint and deployed smoke test pass. Add a narrowly scoped portfolio game link only after source/access inspection.

## Evidence

Maintain TASKS.md. Save route reports, browser output and start/game screenshots in validation/web-polish-2026-10-09. Final handoff states local launcher, changes, test totals and actual remote deployment status.
