# Fatigue, matched finishes, and realism mode

Plan written 2026-10-09 before implementation. Extend the playable 2D Crux game using its fixed 120 Hz Planck simulation, command replays, Canvas renderer, and browser release pipeline.

## Findings and sources

The current standard profile loses about 16% reserve per second of low-effort dragging and recovers 160% per second whenever the pointer is released. Attached feet are kinematic pins joined to the torso by maximum-distance ropes. Every attached foot increases movement capacity, even above the hip or in an ineffective stance. Persistent fatigue and useful foot loading are absent.

Primary research informing the design:

- [Bonelli et al., contact forces and muscle excitation at different wall angles and body positions](https://doi.org/10.1007/s00421-025-06047-y): fourteen participants, two stationary positions, three inclinations. On slab and vertical walls, the stance with more extended legs shifted more load to the feet; steeper walls increased hand loading. These particular experiments do not supply a universal equation for all moves.
- [Balas et al., foot loading and slope inclination](https://doi.org/10.2478/hukin-2014-0112): instrumented climbing showed loading differences with ability and inclination. Contact count alone is inadequate.
- [Quaine and Martin, equilibrium in climbing](https://pubmed.ncbi.nlm.nih.gov/10567755/) and [Quaine et al., joint moments during leg release](https://pubmed.ncbi.nlm.nih.gov/9255397/): unloading one foot redistributes forces and moments through the remaining contacts. Lateral balance matters alongside upward force.
- [Green and Stannard, active recovery and handgrip performance](https://pubmed.ncbi.nlm.nih.gov/20072048/): the tested intermittent grip protocol found no performance benefit from shaking compared with the other recovery strategies. Arm unloading and a sustainable stance, rather than a special physiological shake multiplier, underpin this game mechanic.
- [Krupkova et al., recovery after finger-flexor fatigue](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1480205/full): recovery was context dependent and incomplete over periods much longer than game rests. Recovery time is compressed for playability.

All force limits, rates, friction values, and stance thresholds are game tuning. This front-view model does not resolve wall-normal body depth, true joint torque, hooks, or three-dimensional barn-door rotation. An ordinary toe contact is treated as compressive leg support. A high foot can be staged before weighting, but cannot pull like a hook. Telemetry is an estimate, not measured human muscle force or a physiological prediction.

## Player behavior

1. Start screen and route menu offer **Standard / Realism**. Progress stays separate, old standard saves survive migration, and mode selection persists.
2. Standard has markedly faster general fatigue drain, slower idle refill, shorter full-crimp reserve/grace, and a faster wheel with a smaller green sector/deadline.
3. All shipped profiles require both secure hands on the finish, continuously established for **0.35 seconds**. Opening a crimp, dragging either hand, leaving the hold, or losing required support resets the dwell. A small top-match indicator explains the remaining action.
4. Realism has one global reserve across the attempt. Stillness slowly consumes it; moving consumes more. Pointer release never refills it. Useful feet reduce arm demand and fatigue loss.
5. Hold **Z** to shake the left hand or **C** to shake the right. The requested hand releases and dangles. Recovery requires the other hand secure on a jug, useful feet, a stable torso, no pointer drag, and no pending swap. Release the key to stop, then drag the hand back onto a hold. Invalid activation must not release the last supporting hand. Q/E remain full crimp; Space remains swap.
6. UI remains compact: global reserve follows the hip; recovery marks follow the resting hand; small loaded/unweighted marks follow shoes. Detailed controls are behind Controls/`?`.
7. Necessary footwork comes from physical compression, load-dependent fatigue, anatomical reach, staged upward footholds, a useful-foot-load threshold at realism finishes, and viable jug rest positions. Brief feet-cut moves remain possible and expensive.

## Implementation contracts

Add ProfileId `realism`, retaining `original_browser` internally for old saves. Add validated optional realism rules: idle and movement drain, per-action costs, shake recovery/support/stability thresholds, leg stiffness/damping/caps, contact reach-loss grace, minimum finish support. Add `finishEstablishSeconds` and `shake` commands (`hand`, `active`) to simulation and replays.

Snapshots expose per-foot quality/load/direction/reason, total foot load and arm demand, shake intent/eligibility, and finish-match count/progress. Save migration fills missing profiles/settings without deleting records. All gameplay timers use simulation time. Every input and recovery wait must survive deterministic command replay.

## Useful foot support

Create a pure stance evaluator separate from world mutation:

- Find each attached toe's actual hip/contact, length, hold top direction, torso speed, and center-of-mass proxy. Exclude dragged/free/swap-pending feet.
- Reject upward loading outside anatomical reach, at/above the hip, at extremely folded length, or outside the top-surface friction cone. Smoothly reduce crossed, poorly aligned, and laterally offset contacts. Avoid an unconditional two-foot bonus.
- Estimate nonnegative compression along foot-to-hip with a damped spring toward comfortable extension. Cap by geometry/force limits, limit total upward support, and reduce rest suitability when the COM proxy is outside useful contacts.
- In realism remove attached-foot rope joints, preventing secret tensile anchoring. Free/dragged legs retain anatomical ropes. Apply compressive forces to the torso at the hips before world stepping. Detach a foot that remains outside reach after a short grace; never teleport a pose to repair it.
- Start realism in a viable crouch. Author footholds that allow hips to rise before upper hand moves. Temporarily unweighted high steps are allowed.

The spring is a game stance controller and its load estimate is not a complete equilibrium solution. Verify the physical consequence of invalid placements in the world, not only their displayed colors. Full articulated knees, ankle torque, contact depth, and hooks remain future work.

Implementation refinement from the first world validation: endpoint-only axial springs produce an unstable inverted pendulum, and maximum-distance arm ropes supply no bent-arm support. The prototype therefore steers bounded foot reactions toward the reachable contact span, adds load-limited hip/core balance torque, and supplies bounded residual vertical support at secure shoulders. A preferred stance height avoids hovering on arms above unloaded feet. New foot contacts can remain amber while existing feet shift the body toward them; wait for weight transfer before moving the next foot. These are active posture-control approximations and are included in deterministic replay, rather than hidden unlimited forces. Realism uses five-second crimp reserve; Standard uses four.

## Resource integration and shaking

Standard retains idle refill at a substantially slower rate. Realism integrates slow stance-dependent loss every Playing tick, additional drag effort, and nonzero hand/foot action costs. Useful feet reduce arm demand; one-arm hangs and full crimps add effort. Clamp resources to [0,1], emit exhaustion once, and fall at zero.

Shaking is explicit input state. Accept cancellation after finish/fall and reject invalid activation before dropping a hand. Recompute eligibility every tick: losing the jug, feet, balance, or stability stops recovery immediately. Give modest net recovery only during a qualified unloaded-arm rest. Animate from simulation ticks; reduced motion suppresses shaking. Finished/Falling/hidden-tab suspension cannot grant reserve. Retry clears resources, timers, dwell, and input states.

## Content, mode selection, and lifecycle

Append a second-hand match to all standard campaign recipes and adjust targets. Every finish must allow two hands. Create twelve realism variants retaining each route's grip/swap identity, with staged footholds and jug rest options. Store mode-specific recipes/replays/menu demos. Realism may have a longer intended solution because foot progression is necessary.

Switching mode destroys the old screen/demo and rebuilds for the new profile/content. Saves unlock only within the selected mode. Use abortable input/listener cleanup. Hidden tabs clear inputs and pause the simulation without catch-up drain on return. Keep shoe/hand indicators and rendered endpoints consistent with picking and framing.

## Starting tuning targets

Standard base drain about 0.30/s (previous 0.16), refill about 0.22/s (previous 1.60). Full crimp around four seconds (previous six), open grace around 0.4 s. Wheel about 0.8 turns/s, green width 0.14 turns, deadline 2.4 s (previous 0.55/0.22/3.6). Realism has slower movement drain but persistent costs and idle loss. Record final settings after complete physics and human-speed browser validation; adjust if controls cease to be reliable.

## Execution and acceptance gates

- F0: research/plan/task ledger before edits.
- F1: profile tuning and secure two-hand dwell. Tests cover single-hand refusal, matched crimp security, interrupted dwell, and reset. Regenerate standard solutions/demos.
- F2: pure stance evaluator and compressive physical response. Test folded/high/overextended/lateral/crossed contacts, hold direction, finite outputs, contact grace, and removal of tensile anchoring.
- F3: persistent fatigue, shake commands and lifecycle. Test idle drain, action costs, support benefit, no passive refill, qualified/rejected/interrupted recovery, exhaustion, reset, and deterministic replay.
- F4: minimal mode selection, save migration, limb indicators, and twelve playable realism variants.
- F5: type/unit checks, both full campaign matrices and fresh replays, level assets, build, production browser pointer/key solutions for every route/mode, existing mechanics/visual/framing regression, mode-save isolation, matched finish, shake cleanup, and hidden-tab freeze.
- F6: visually inspect screenshots and playthroughs, rebuild local launcher, commit/push the authorized website update, wait for CI/Pages success, then verify the live `/crux/` game in both modes. Record evidence and limitations.

Campaign/browser solutions must not refill reserve, attach endpoints, or mark completion via debug hooks. When a gate fails, fix geometry, controls, tuning, or content before calling a route playable.
