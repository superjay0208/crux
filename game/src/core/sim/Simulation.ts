import { World, Vec2 } from 'planck';
import { Climber, LimbStatus } from './Climber';
import { DragActuator } from './DragActuator';
import { SupportModel } from './SupportModel';
import { GripRules, HoverCandidate, FootSwapCandidate } from '../rules/GripRules';
import { StaminaModel } from '../rules/StaminaModel';
import { CrimpModel, CrimpSnapshot } from '../rules/CrimpModel';
import { Scoring, ScoreResult } from '../rules/Scoring';
import { Session, SessionState, GameEvent } from '../rules/Session';
import {
  LevelData,
  ProfileConfig,
  LimbId,
  HandId,
  FootId,
  FootSwapKey,
} from '../data/schema';
import { Vec2D, vec, vDist, vSub, vLerp } from '../vec';
import { normalizeAngle } from '../math';
import { wrapPhase, isInGreen } from '../rules/TimingWheel';
import { FootReachModel } from '../rules/FootReachModel';

export interface SimCommand {
  tick: number;
  type: 'down' | 'move' | 'up' | 'drop' | 'reset' | 'crimp' | 'swap_key' | 'swap_confirm' | 'swap_cancel';
  limb?: LimbId;
  pos?: Vec2D;
  hand?: HandId;
  active?: boolean;
  key?: FootSwapKey;
}

export interface LimbSnapshot {
  pos: Vec2D;
  status: LimbStatus;
  holdId: string | null;
}

export interface SimSnapshot {
  tick: number;
  torso: { pos: Vec2D; angle: number };
  limbs: Record<LimbId, LimbSnapshot>;
  stamina: number;
  staminaVisible: boolean;
  crimp: CrimpSnapshot;
  footSwap: FootSwapSnapshot | null;
  hoverCandidateHoldId: string | null;
  hoverFootSwapHoldId: string | null;
  moves: number;
  timeSeconds: number;
  sessionState: SessionState;
  reachLimited: FootId | null;
  goals: { crimp: boolean; footSwaps: number; support: boolean; checkpoints: string[] };
}

export interface FootSwapSnapshot {
  incoming: FootId;
  outgoing: FootId;
  holdId: string;
  phase: number;
  targetCenter: number;
  targetWidth: number;
  inGreen: boolean;
  remainingSeconds: number;
  totalSeconds: number;
}

interface FootSwapState extends FootSwapSnapshot {
  anchor: Vec2D;
  fromHoldId: string | null;
}

export class Simulation {
  readonly world: World;
  readonly climber: Climber;
  readonly dragActuator: DragActuator;
  readonly stamina: StaminaModel;
  readonly crimp: CrimpModel;
  readonly scoring: Scoring;
  readonly session: Session;
  readonly level: LevelData;
  readonly profile: ProfileConfig;

  private currentTick = 0;
  private accumulator = 0;
  readonly hz = 120;
  readonly dt = 1 / 120;

  private queuedCommands: SimCommand[] = [];
  private activeDraggedLimb: LimbId | null = null;
  private currentCursorPos: Vec2D = { x: 0, y: 0 };
  private hoverCandidate: HoverCandidate | null = null;
  private hoverFootSwapCandidate: FootSwapCandidate | null = null;
  private footSwap: FootSwapState | null = null;
  private noHandsTimer = 0;
  private crimpGoalMet = false;
  private completedFootSwaps = 0;
  private checkpoints = new Set<string>();
  private reachLimited: FootId | null = null;

  // Snapshot ring buffer (keep last 16 snapshots)
  private snapshots: SimSnapshot[] = [];
  private maxSnapshots = 16;

  constructor(level: LevelData, profile: ProfileConfig) {
    this.level = level;
    this.profile = profile;

    // Planck World
    const grav = profile.physics.gravity;
    this.world = new World(Vec2(grav[0], grav[1]));
    this.world.setAllowSleeping(false);

    // Initial torso placement: compute center of starting holds if any
    const initialPos = this.calculateInitialTorsoPos(level);
    this.climber = new Climber(this.world, profile.physics, initialPos);

    // Drag actuator
    this.dragActuator = new DragActuator(this.world, profile.physics.correctionFactor);

    // Rules
    this.stamina = new StaminaModel(profile);
    this.crimp = new CrimpModel(profile.rules.crimp);
    this.scoring = new Scoring(level, profile);
    this.session = new Session();

    // Attach limbs to start holds
    this.applyStartPositions();
    this.updateCrimpState(0);

    // Record initial snapshot
    this.recordSnapshot();
  }

  private calculateInitialTorsoPos(level: LevelData): Vec2D {
    const startHoldIds = [
      level.start.leftHand,
      level.start.rightHand,
      level.start.leftFoot,
      level.start.rightFoot,
    ].filter((id): id is string => id !== null);

    if (startHoldIds.length === 0) return { x: 0, y: 0 };

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const id of startHoldIds) {
      const hold = level.holds.find((h) => h.id === id);
      if (hold) {
        sumX += hold.pos[0];
        sumY += hold.pos[1];
        count++;
      }
    }
    return count > 0 ? { x: sumX / count, y: sumY / count } : { x: 0, y: 0 };
  }

  private applyStartPositions(): void {
    const limbKeys: Array<{ key: LimbId; holdId: string | null }> = [
      { key: 'leftHand', holdId: this.level.start.leftHand },
      { key: 'rightHand', holdId: this.level.start.rightHand },
      { key: 'leftFoot', holdId: this.level.start.leftFoot },
      { key: 'rightFoot', holdId: this.level.start.rightFoot },
    ];

    for (const { key, holdId } of limbKeys) {
      if (holdId) {
        const hold = this.level.holds.find((h) => h.id === holdId);
        if (hold) {
          this.climber.attach(key, hold.id, { x: hold.pos[0], y: hold.pos[1] });
        }
      }
    }
  }

  getTick(): number {
    return this.currentTick;
  }

  enqueueCommand(cmd: SimCommand): void {
    this.queuedCommands.push(cmd);
  }

  enqueueCommands(cmds: SimCommand[]): void {
    this.queuedCommands.push(...cmds);
  }

  /**
   * Finds the best limb under pointer position
   */
  pickLimb(pos: Vec2D): LimbId | null {
    if (this.footSwap || !this.session.isInteractive()) return null;

    const limbOrder: LimbId[] = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'];
    let bestLimb: LimbId | null = null;
    let bestDist = Infinity;

    for (const limbId of limbOrder) {
      const isHand = limbId === 'leftHand' || limbId === 'rightHand';
      // Wide enough that a reasonably-aimed click lands (the limb endpoint itself renders at
      // roughly half this radius on screen) — a tight radius with no hover feedback made the
      // first click of the game undiscoverable (docs/09 J3; see TASKS.md log).
      const pickRadius = isHand ? 0.32 : 0.34;
      const limbPos = this.climber.getLimbPosition(limbId);
      const d = vDist(pos, limbPos);
      if (d <= pickRadius && d < bestDist) {
        bestDist = d;
        bestLimb = limbId;
      }
    }
    return bestLimb;
  }

  stepTick(): void {
    const currentTick = this.currentTick;

    // 1. Pop all commands scheduled for this tick (or past due)
    const activeCmds: SimCommand[] = [];
    const remainingCmds: SimCommand[] = [];
    for (const cmd of this.queuedCommands) {
      if (cmd.tick <= currentTick) {
        activeCmds.push(cmd);
      } else {
        remainingCmds.push(cmd);
      }
    }
    this.queuedCommands = remainingCmds;

    // 2. Process input commands
    for (const cmd of activeCmds) {
      this.processCommand(cmd);
    }

    // 3. Update Drag Actuator and Capacity
    if (this.activeDraggedLimb && this.dragActuator.isDragging()) {
      const limbPos = this.climber.getLimbPosition(this.activeDraggedLimb);
      let actuatorTarget = this.currentCursorPos;
      this.reachLimited = null;
      if (this.activeDraggedLimb === 'leftFoot' || this.activeDraggedLimb === 'rightFoot') {
        const foot = this.activeDraggedLimb;
        const clamped = FootReachModel.clamp(foot, actuatorTarget, this.climber.getAnchorWorld(foot),
          this.climber.getTorsoAngle(), this.profile.physics.legReach, this.level.movement);
        actuatorTarget = clamped.target;
        if (clamped.limited) this.reachLimited = foot;
      }
      const dragDir = vSub(actuatorTarget, limbPos);
      const capacity = SupportModel.computeCapacity(
        this.climber,
        this.activeDraggedLimb,
        dragDir,
        this.profile.physics
      );
      this.dragActuator.update(actuatorTarget, capacity);
    }

    // 4. Step Planck world
    this.world.step(this.dt, 8, 3);

    // 5. Post-step rules
    this.postStepRules();

    // 6. Snapshot
    this.recordSnapshot();

    this.currentTick++;
  }

  private processCommand(cmd: SimCommand): void {
    if (cmd.type === 'reset') {
      this.reset();
      return;
    }

    // Key release and cancellation must be accepted even after the session changes state;
    // otherwise a blur or a finish on the same tick can leave a held key latched forever.
    if (cmd.type === 'crimp') {
      if (cmd.hand && typeof cmd.active === 'boolean') {
        this.crimp.setIntent(cmd.hand, cmd.active);
      }
      return;
    }

    if (cmd.type === 'swap_cancel') {
      this.cancelFootSwap('cancelled');
      return;
    }

    if (!this.session.isInteractive()) {
      return;
    }

    if (cmd.type === 'swap_confirm') {
      this.confirmFootSwap();
      return;
    }
    if (cmd.type === 'swap_key') {
      // Old A/D replay inputs have no action in the timing-wheel mechanic.
      return;
    }

    // A swap owns the two feet until it resolves. Crimp keyboard commands above still run, but
    // a second pointer gesture cannot replace or corrupt the pending transaction.
    if (this.footSwap) return;

    if (cmd.type === 'down') {
      const targetPos = cmd.pos ?? { x: 0, y: 0 };
      const limbId = cmd.limb ?? this.pickLimb(targetPos);
      if (!limbId) return;

      this.activeDraggedLimb = limbId;
      this.currentCursorPos = targetPos;

      this.climber.startDragging(limbId);

      const limbPos = this.climber.getLimbPosition(limbId);
      const dragDir = vSub(targetPos, limbPos);
      const initialCapacity = SupportModel.computeCapacity(
        this.climber,
        limbId,
        dragDir,
        this.profile.physics
      );
      this.dragActuator.startDrag(
        this.climber.getLimb(limbId).body,
        targetPos,
        initialCapacity
      );

      this.scoring.startTimer();
      this.session.emit({ type: 'DragStarted', limb: limbId });
    } else if (cmd.type === 'move') {
      if (cmd.pos) {
        this.currentCursorPos = cmd.pos;
      }
    } else if (cmd.type === 'up') {
      if (this.activeDraggedLimb) {
        const limbId = this.activeDraggedLimb;
        const candidate = GripRules.findCandidateHold(
          this.climber,
          limbId,
          this.level,
          this.profile
        );
        const swapCandidate =
          !candidate && this.profile.rules.footSwap.enabled
            ? GripRules.findFootSwapCandidate(
                this.climber,
                limbId,
                this.level,
                this.profile
              )
            : null;

        if (candidate) {
          this.attachDraggedLimb(limbId, candidate);
        } else if (swapCandidate) {
          this.startFootSwap(limbId as FootId, swapCandidate);
        } else {
          // Released into free space
          this.climber.release(limbId);
          this.scoring.recordFailedGrab();
          this.session.emit({
            type: 'Released',
            limb: limbId,
            hold: null,
          });
        }

        this.dragActuator.endDrag();
        this.session.emit({ type: 'DragEnded', limb: limbId });
        this.activeDraggedLimb = null;
        this.hoverCandidate = null;
        this.hoverFootSwapCandidate = null;
        this.reachLimited = null;
      }
    } else if (cmd.type === 'drop') {
      // Right-click drop limb (desktop profile only)
      if (this.profile.rules.dropLimbAction === 'right_click' && cmd.limb) {
        if (this.climber.getLimb(cmd.limb).status === 'attached') {
          const holdId = this.climber.getLimb(cmd.limb).holdId;
          this.climber.release(cmd.limb);
          this.session.emit({ type: 'Released', limb: cmd.limb, hold: holdId });
        }
      }
    }
  }

  private attachDraggedLimb(limbId: LimbId, candidate: HoverCandidate): void {
    const limbPos = this.climber.getLimbPosition(limbId);
    const anchor = GripRules.clampAnchorPosition(limbPos, candidate.hold);
    const fromHold = this.climber.getLimb(limbId).fromHoldId;

    this.climber.attach(limbId, candidate.hold.id, anchor);
    const counted = this.scoring.recordAttach(fromHold, candidate.hold.id);

    this.session.emit({
      type: 'Attached',
      limb: limbId,
      fromHold,
      toHold: candidate.hold.id,
    });

    if (counted) {
      this.session.emit({ type: 'MoveCounted', moves: this.scoring.getMoves() });
    }

    this.maybeFinish();
  }

  private startFootSwap(incoming: FootId, candidate: FootSwapCandidate): void {
    const outgoing = candidate.outgoingFoot as FootId;
    const incomingPos = this.climber.getLimbPosition(incoming);
    const anchor = GripRules.clampAnchorPosition(incomingPos, candidate.hold);
    this.footSwap = {
      incoming,
      outgoing,
      holdId: candidate.hold.id,
      anchor,
      phase: 0,
      targetCenter: this.profile.rules.footSwap.targetCenter ?? 0.5,
      targetWidth: this.profile.rules.footSwap.targetWidth ?? 0.22,
      inGreen: false,
      remainingSeconds: this.profile.rules.footSwap.windowSeconds,
      totalSeconds: this.profile.rules.footSwap.windowSeconds,
      fromHoldId: this.climber.getLimb(incoming).fromHoldId,
    };
    this.climber.parkForFootSwap(incoming, anchor);
    this.session.emit({
      type: 'FootSwapStarted',
      incoming,
      outgoing,
      hold: candidate.hold.id,
    });
  }

  private confirmFootSwap(): void {
    const swap = this.footSwap;
    if (!swap) return;

    if (!isInGreen(swap.phase, swap.targetCenter, swap.targetWidth)) {
      this.cancelFootSwap('miss');
      return;
    }
    this.completeFootSwap();
  }

  private completeFootSwap(): void {
    const swap = this.footSwap;
    if (!swap) return;

    const outgoingHold = this.climber.getLimb(swap.outgoing).holdId;
    this.climber.release(swap.outgoing);
    this.climber.attach(swap.incoming, swap.holdId, swap.anchor);
    const counted = this.scoring.recordAttach(swap.fromHoldId, swap.holdId);
    this.footSwap = null;
    this.completedFootSwaps++;

    this.session.emit({ type: 'Released', limb: swap.outgoing, hold: outgoingHold });
    this.session.emit({
      type: 'Attached',
      limb: swap.incoming,
      fromHold: swap.fromHoldId,
      toHold: swap.holdId,
    });
    if (counted) {
      this.session.emit({ type: 'MoveCounted', moves: this.scoring.getMoves() });
    }
    this.session.emit({
      type: 'FootSwapCompleted',
      incoming: swap.incoming,
      outgoing: swap.outgoing,
      hold: swap.holdId,
    });
  }

  private cancelFootSwap(
    reason: 'miss' | 'timeout' | 'cancelled',
    emitEvent = true
  ): void {
    const swap = this.footSwap;
    if (!swap) return;

    this.climber.release(swap.incoming);
    this.footSwap = null;
    this.session.emit({ type: 'Released', limb: swap.incoming, hold: null });
    if (emitEvent) {
      this.session.emit({
        type: 'FootSwapFailed',
        incoming: swap.incoming,
        outgoing: swap.outgoing,
        hold: swap.holdId,
        reason,
      });
    }
  }

  private maybeFinish(): void {
    if (this.session.getState() !== 'Playing') return;
    const finishHold = this.level.holds.find((hold) => hold.finish);
    if (!finishHold) return;

    const secureHands = (['leftHand', 'rightHand'] as HandId[]).filter((hand) => {
      const limb = this.climber.getLimb(hand);
      if (limb.status !== 'attached' || limb.holdId !== finishHold.id) return false;
      return (finishHold.grip ?? 'jug') !== 'crimp' || this.crimp.isEngaged(hand);
    });
    const finished =
      this.profile.rules.finishRequires === 'two_hands'
        ? secureHands.length === 2
        : secureHands.length >= 1;
    if (!finished) return;
    if (this.level.goals?.crimpHold && !this.crimpGoalMet) return;
    if (this.completedFootSwaps < (this.level.goals?.footSwaps ?? 0)) return;
    if (this.level.goals?.checkpoints?.some(id=>!this.checkpoints.has(id))) return;
    if (!this.hasFinishSupport()) return;

    this.session.setState('Finished');
    this.scoring.stopTimer();
    this.session.emit({ type: 'Finished', result: this.scoring.evaluateResult() });
  }

  private updateCrimpState(dt: number): void {
    const isHoldingCrimp = (hand: HandId): boolean => {
      const limb = this.climber.getLimb(hand);
      if (limb.status !== 'attached' || !limb.holdId) return false;
      const hold = this.level.holds.find((candidate) => candidate.id === limb.holdId);
      return (hold?.grip ?? 'jug') === 'crimp';
    };

    const slipped = this.crimp.update(dt, {
      leftHand: isHoldingCrimp('leftHand'),
      rightHand: isHoldingCrimp('rightHand'),
    });
    for (const hand of ['leftHand', 'rightHand'] as HandId[]) {
      if (this.crimp.isEngaged(hand) && this.climber.getLimb(hand).holdId === this.level.goals?.crimpHold) this.crimpGoalMet = true;
    }

    for (const hand of slipped) {
      const limb = this.climber.getLimb(hand);
      if (limb.status !== 'attached' || !limb.holdId) continue;
      const holdId = limb.holdId;
      this.climber.release(hand);
      this.session.emit({ type: 'CrimpSlipped', hand, hold: holdId });
      this.session.emit({ type: 'Released', limb: hand, hold: holdId });
    }
  }

  private postStepRules(): void {
    // 1. Falling check (torso below camera bottom - 3 units)
    const torsoPos = this.climber.getTorsoPosition();
    const camCenterY = this.level.camera.center[1];
    const camH = this.level.camera.height;
    const fallThreshold = camCenterY - camH / 2 - 3.0;

    if (this.session.getState() === 'Falling') {
      const respawn = this.session.updateFall(this.dt);
      if (respawn) {
        this.reset();
        return;
      }
    } else if (torsoPos.y < fallThreshold && this.session.getState() === 'Playing') {
      this.cancelFootSwap('cancelled');
      this.climber.releaseAll();
      if (this.dragActuator.isDragging()) {
        this.dragActuator.endDrag();
        this.activeDraggedLimb = null;
      }
      this.session.setState('Falling');
      this.session.emit({ type: 'Fell' });
      return;
    }

    // 2. Per-hand crimp support. Attached endpoints are kinematic pins in this engine, so grip
    // quality is represented by whether that pin remains secure, not by a fictitious friction
    // multiplier. Jugs never enter this model.
    this.updateCrimpState(this.dt);
    for (const id of this.level.goals?.checkpoints ?? []) {
      const hold=this.level.holds.find(h=>h.id===id)!;
      if ((['leftHand','rightHand','leftFoot','rightFoot'] as LimbId[]).some(limb=>{
        const contact=this.climber.getLimb(limb);
        return contact.status==='attached' && contact.holdId===id &&
          (hold.grip!=='crimp'||(limb.endsWith('Hand')&&this.crimp.isEngaged(limb as HandId)));
      })) this.checkpoints.add(id);
    }
    this.maybeFinish();

    // 3. Hands rule check
    if (this.session.getState() === 'Playing') {
      const handsCount = this.climber.attachedHandsCount();
      if (handsCount === 0) {
        this.noHandsTimer += this.dt;
        if (GripRules.checkHandsRuleViolated(handsCount, this.noHandsTimer, this.profile)) {
          this.cancelFootSwap('cancelled');
          this.climber.releaseAll();
          if (this.dragActuator.isDragging()) {
            this.dragActuator.endDrag();
            this.activeDraggedLimb = null;
          }
          this.session.setState('Falling');
          this.session.emit({ type: 'Fell' });
          return;
        }
      } else {
        this.noHandsTimer = 0;
      }
    }

    // 4. Hover candidate update. A full capacity-one foothold can still be highlighted as a
    // swap target, but normal attachment capacity stays strict.
    if (this.activeDraggedLimb && this.session.getState() === 'Playing') {
      this.hoverCandidate = GripRules.findCandidateHold(
        this.climber,
        this.activeDraggedLimb,
        this.level,
        this.profile
      );
      this.hoverFootSwapCandidate =
        !this.hoverCandidate && this.profile.rules.footSwap.enabled
          ? GripRules.findFootSwapCandidate(
              this.climber,
              this.activeDraggedLimb,
              this.level,
              this.profile
            )
          : null;
    } else {
      this.hoverCandidate = null;
      this.hoverFootSwapCandidate = null;
    }

    // 5. Foot-swap deadline is simulation time, not a DOM timeout. Commands ran before this
    // update, so a correct key on the final tick wins before the timeout is applied.
    if (this.footSwap && this.session.getState() === 'Playing') {
      this.footSwap.phase = wrapPhase(this.footSwap.phase + this.dt * (this.profile.rules.footSwap.revolutionsPerSecond ?? 0.55));
      this.footSwap.inGreen = isInGreen(this.footSwap.phase, this.footSwap.targetCenter, this.footSwap.targetWidth);
      this.footSwap.remainingSeconds = Math.max(
        0,
        this.footSwap.remainingSeconds - this.dt
      );
      if (this.footSwap.remainingSeconds === 0) {
        this.cancelFootSwap('timeout');
      }
    }

    // 6. Existing pointer-drag stamina integration
    const isDragging = this.activeDraggedLimb !== null && this.dragActuator.isDragging();
    const force = this.dragActuator.getActuatorForce();
    const totalMass = this.profile.physics.torsoMass + 4 * this.profile.physics.endpointMass;
    const gravity = Math.abs(this.profile.physics.gravity[1]);

    const staminaEvent = this.stamina.update(
      this.dt,
      isDragging,
      force,
      totalMass,
      gravity
    );

    if (staminaEvent === 'exhausted' && this.session.getState() === 'Playing') {
      this.session.emit({ type: 'Exhausted' });
      if (this.profile.rules.stamina.mode === 'fall') {
        this.cancelFootSwap('cancelled');
        this.climber.releaseAll();
        if (this.dragActuator.isDragging()) {
          this.dragActuator.endDrag();
          this.activeDraggedLimb = null;
        }
        this.session.setState('Falling');
        this.session.emit({ type: 'Fell' });
      } else if (this.profile.rules.stamina.mode === 'cancel_drag') {
        if (this.activeDraggedLimb) {
          this.climber.release(this.activeDraggedLimb);
          this.dragActuator.endDrag();
          this.activeDraggedLimb = null;
        }
      }
    }

    // 7. Timer update
    this.scoring.tickTimer(this.dt);
  }

  private recordSnapshot(): void {
    const snap: SimSnapshot = {
      tick: this.currentTick,
      torso: {
        pos: this.climber.getTorsoPosition(),
        angle: this.climber.getTorsoAngle(),
      },
      limbs: {
        leftHand: {
          pos: this.climber.getLimbPosition('leftHand'),
          status: this.climber.limbs.leftHand.status,
          holdId: this.climber.limbs.leftHand.holdId,
        },
        rightHand: {
          pos: this.climber.getLimbPosition('rightHand'),
          status: this.climber.limbs.rightHand.status,
          holdId: this.climber.limbs.rightHand.holdId,
        },
        leftFoot: {
          pos: this.climber.getLimbPosition('leftFoot'),
          status: this.climber.limbs.leftFoot.status,
          holdId: this.climber.limbs.leftFoot.holdId,
        },
        rightFoot: {
          pos: this.climber.getLimbPosition('rightFoot'),
          status: this.climber.limbs.rightFoot.status,
          holdId: this.climber.limbs.rightFoot.holdId,
        },
      },
      stamina: this.stamina.getValue(),
      staminaVisible: this.stamina.getIsVisible(),
      crimp: this.crimp.snapshot(),
      footSwap: this.getFootSwapSnapshot(),
      hoverCandidateHoldId: this.hoverCandidate ? this.hoverCandidate.hold.id : null,
      hoverFootSwapHoldId: this.hoverFootSwapCandidate
        ? this.hoverFootSwapCandidate.hold.id
        : null,
      moves: this.scoring.getMoves(),
      timeSeconds: this.scoring.getTimeSeconds(),
      sessionState: this.session.getState(),
      reachLimited: this.reachLimited,
      goals: { crimp: this.crimpGoalMet, footSwaps: this.completedFootSwaps, support: this.hasFinishSupport(), checkpoints: [...this.checkpoints] },
    };

    this.snapshots.push(snap);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  getLatestSnapshot(): SimSnapshot {
    return this.snapshots[this.snapshots.length - 1];
  }

  getFootSwapSnapshot(): FootSwapSnapshot | null {
    if (!this.footSwap) return null;
    return {
      incoming: this.footSwap.incoming,
      outgoing: this.footSwap.outgoing,
      holdId: this.footSwap.holdId,
      phase: this.footSwap.phase,
      targetCenter: this.footSwap.targetCenter,
      targetWidth: this.footSwap.targetWidth,
      inGreen: this.footSwap.inGreen,
      remainingSeconds: this.footSwap.remainingSeconds,
      totalSeconds: this.footSwap.totalSeconds,
    };
  }

  getInterpolatedSnapshot(alpha: number): SimSnapshot {
    alpha = Math.max(0, Math.min(1, alpha));
    if (this.snapshots.length < 2) {
      return this.getLatestSnapshot();
    }
    const s0 = this.snapshots[this.snapshots.length - 2];
    const s1 = this.snapshots[this.snapshots.length - 1];

    const interpolateLimb = (id: LimbId): LimbSnapshot => ({
      pos: vLerp(s0.limbs[id].pos, s1.limbs[id].pos, alpha),
      status: s1.limbs[id].status,
      holdId: s1.limbs[id].holdId,
    });

    const interpolateCrimpHand = (hand: HandId) => ({
      ...s1.crimp[hand],
      reserve:
        s0.crimp[hand].reserve +
        (s1.crimp[hand].reserve - s0.crimp[hand].reserve) * alpha,
      graceRemaining:
        s0.crimp[hand].graceRemaining +
        (s1.crimp[hand].graceRemaining - s0.crimp[hand].graceRemaining) * alpha,
      availableSeconds:
        s0.crimp[hand].availableSeconds +
        (s1.crimp[hand].availableSeconds - s0.crimp[hand].availableSeconds) * alpha,
    });

    return {
      tick: s1.tick,
      torso: {
        pos: vLerp(s0.torso.pos, s1.torso.pos, alpha),
        angle: s0.torso.angle + (s1.torso.angle - s0.torso.angle) * alpha,
      },
      limbs: {
        leftHand: interpolateLimb('leftHand'),
        rightHand: interpolateLimb('rightHand'),
        leftFoot: interpolateLimb('leftFoot'),
        rightFoot: interpolateLimb('rightFoot'),
      },
      stamina: s0.stamina + (s1.stamina - s0.stamina) * alpha,
      staminaVisible: s1.staminaVisible,
      crimp: {
        leftHand: interpolateCrimpHand('leftHand'),
        rightHand: interpolateCrimpHand('rightHand'),
      },
      footSwap: s1.footSwap
        ? {
            ...s1.footSwap,
            remainingSeconds:
              s0.footSwap && s0.footSwap.holdId === s1.footSwap.holdId
                ? s0.footSwap.remainingSeconds +
                  (s1.footSwap.remainingSeconds - s0.footSwap.remainingSeconds) * alpha
                : s1.footSwap.remainingSeconds,
          }
        : null,
      hoverCandidateHoldId: s1.hoverCandidateHoldId,
      hoverFootSwapHoldId: s1.hoverFootSwapHoldId,
      moves: s1.moves,
      timeSeconds: s1.timeSeconds,
      sessionState: s1.sessionState,
      reachLimited: s1.reachLimited,
      goals: { ...s1.goals },
    };
  }

  private droppedTimeSeconds = 0;

  /**
   * Advances real-time accumulator and runs fixed steps
   */
  update(realDtSeconds: number): void {
    // Cap delta time to prevent spiral of death
    const clampedDt = Math.min(realDtSeconds, 0.25);
    this.accumulator += clampedDt;

    let steps = 0;
    while (this.accumulator >= this.dt && steps < 8) {
      this.stepTick();
      this.accumulator -= this.dt;
      steps++;
    }

    // The 8-step cap bounds how much physics work one real frame can force, but under sustained
    // overload (many consecutive slow frames) the leftover debt would otherwise keep growing
    // frame over frame, since we add up to 0.25s but can only drain 8*dt (~0.067s) per call. That
    // unbounded growth is what previously pushed getInterpolationAlpha() to 40+ (docs/09 R-03):
    // render interpolation extrapolated far past the two available snapshots. Discard the excess
    // here instead of carrying it forward — simulated time (ticks, stamina, scoring) only ever
    // reflects steps actually executed; wall-clock time beyond the step budget is explicitly lost,
    // not silently deferred.
    if (this.accumulator > this.dt) {
      this.droppedTimeSeconds += this.accumulator - this.dt;
      this.accumulator = this.dt;
    }
  }

  getInterpolationAlpha(): number {
    const alpha = this.accumulator / this.dt;
    return Math.min(1, Math.max(0, alpha));
  }

  /** Total wall-clock time discarded by the overload policy above (diagnostics only). */
  getDroppedTimeSeconds(): number {
    return this.droppedTimeSeconds;
  }

  reset(): void {
    this.currentTick = 0;
    this.accumulator = 0;
    this.snapshots = [];
    this.dragActuator.endDrag();
    this.climber.releaseAll();
    this.activeDraggedLimb = null;
    this.hoverCandidate = null;
    this.hoverFootSwapCandidate = null;
    this.footSwap = null;
    this.noHandsTimer = 0;
    this.crimpGoalMet = false;
    this.completedFootSwaps = 0;
    this.checkpoints.clear();
    this.reachLimited = null;
    this.queuedCommands = [];

    // Reset torso
    const initialPos = this.calculateInitialTorsoPos(this.level);
    this.climber.torso.setPosition(Vec2(initialPos.x, initialPos.y));
    this.climber.torso.setLinearVelocity(Vec2(0, 0));
    this.climber.torso.setAngularVelocity(0);
    this.climber.torso.setAngle(0);

    // Reattach start limbs
    this.applyStartPositions();

    // Reset rules
    this.stamina.reset();
    this.crimp.reset();
    this.updateCrimpState(0);
    this.scoring.reset();
    this.session.setState('Playing');
    this.session.emit({ type: 'Reset' });

    this.recordSnapshot();
  }

  private hasFinishSupport(): boolean {
    if (!this.level.finishSupportHold) return true;
    return (['leftFoot', 'rightFoot'] as FootId[]).some((foot) => {
      const limb = this.climber.getLimb(foot);
      return limb.status === 'attached' && limb.holdId === this.level.finishSupportHold &&
        FootReachModel.canReach(foot, this.climber.getLimbPosition(foot), this.climber.getAnchorWorld(foot),
          this.climber.getTorsoAngle(), this.profile.physics.legReach, this.level.movement);
    });
  }

}
