import type { BallFrame, TrajectoryChangeEvent } from '../types';

const CANVAS_W = 480;
const CANVAS_H = 400;
const PADDING = 28;
const MIN_SPEED = 18;
const MAX_SPEED = 70;
const FRAME_INTERVAL = 1000 / 60; // ~16.67ms
const CHANGE_MIN_MS = 500;
const CHANGE_MAX_MS = 1200;
const LERP_DURATION = 200;
const BOUNCE_DAMPEN = 0.85;
const COLOR_CHANGE_MIN_MS = 800;
const COLOR_CHANGE_MAX_MS = 3000;

// Decoys: small ball-colored shapes that move independently alongside the
// main ball. Present primarily to defeat naive centroid-extraction attacks
// (corner-based background subtraction + all-non-bg-pixels averaging).
// Humans lock onto the large coherent moving ball visually; naive color
// averaging picks up decoys too, biasing the attacker's tracked position.
const NUM_DECOYS = 4;
const DECOY_MIN_SPEED = 12;
const DECOY_MAX_SPEED = 38;
const DECOY_MIN_DIST_FROM_BALL = 70; // spawn away from the ball start

export interface DecoySnapshot {
  /** Centre x at display resolution (480×400 coords). */
  x: number;
  /** Centre y at display resolution. */
  y: number;
}

interface DecoyState extends DecoySnapshot {
  vx: number;
  vy: number;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clampSpeed(vx: number, vy: number): { vx: number; vy: number } {
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed < MIN_SPEED) {
    const scale = MIN_SPEED / speed;
    return { vx: vx * scale, vy: vy * scale };
  }
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    return { vx: vx * scale, vy: vy * scale };
  }
  return { vx, vy };
}

function lerpValue(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Real-time physics simulation that emits frames one at a time.
 * Runs on a setInterval ticker — the ball's future positions don't exist
 * until each tick computes them.
 */
export class BallPhysics {
  private x: number;
  private y: number;
  private vx: number;
  private vy: number;
  private t = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;

  // Lerp state
  private lerpStartVx = 0;
  private lerpStartVy = 0;
  private lerpTargetVx = 0;
  private lerpTargetVy = 0;
  private lerpElapsed = LERP_DURATION;
  private isLerping = false;
  private nextChangeAt: number;
  private nextColorChangeAt: number;

  // Recorded data (grows as simulation runs)
  readonly frames: BallFrame[] = [];
  /** Date.now() at the moment each frame was dispatched, parallel to `frames`. */
  readonly frameDispatchTimes: number[] = [];
  readonly changeEvents: TrajectoryChangeEvent[] = [];
  readonly colorChangeTimes: number[] = [];
  readonly startX: number;
  readonly startY: number;

  /** Decoy shapes drawn same-color-as-ball. Positions update every tick. */
  private readonly decoyStates: DecoyState[] = [];

  private onFrame: ((frame: BallFrame) => void) | null = null;
  private onEnd: (() => void) | null = null;
  private onColorChange: ((t: number) => void) | null = null;
  private durationMs: number;

  constructor(durationMs = 8000) {
    this.durationMs = durationMs;
    this.x = CANVAS_W / 2 + randomInRange(-40, 40);
    this.y = CANVAS_H / 2 + randomInRange(-30, 30);
    this.startX = this.x;
    this.startY = this.y;

    const angle = Math.random() * Math.PI * 2;
    const speed = randomInRange(30, 60);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this.nextChangeAt = randomInRange(CHANGE_MIN_MS, CHANGE_MAX_MS);
    this.nextColorChangeAt = randomInRange(COLOR_CHANGE_MIN_MS, COLOR_CHANGE_MAX_MS);

    // Initialise decoys at random canvas positions, ensuring separation from
    // the ball so the initial frame doesn't look like a pile. Velocities
    // stay slower than the ball's min speed so the moving ball is
    // visually distinct.
    for (let i = 0; i < NUM_DECOYS; i++) {
      let dx = 0, dy = 0;
      for (let tries = 0; tries < 10; tries++) {
        dx = randomInRange(PADDING + 10, CANVAS_W - PADDING - 10);
        dy = randomInRange(PADDING + 10, CANVAS_H - PADDING - 10);
        const sep = Math.hypot(dx - this.x, dy - this.y);
        if (sep > DECOY_MIN_DIST_FROM_BALL) break;
      }
      const dAngle = Math.random() * Math.PI * 2;
      const dSpeed = randomInRange(DECOY_MIN_SPEED, DECOY_MAX_SPEED);
      this.decoyStates.push({
        x: dx,
        y: dy,
        vx: Math.cos(dAngle) * dSpeed,
        vy: Math.sin(dAngle) * dSpeed,
      });
    }
  }

  /** Current decoy positions at display (480×400) resolution. */
  get decoys(): DecoySnapshot[] {
    return this.decoyStates.map((d) => ({ x: d.x, y: d.y }));
  }

  /** Start the real-time simulation. Calls onFrame for each tick, onEnd when done. */
  start(
    onFrame: (frame: BallFrame) => void,
    onEnd: () => void,
    onColorChange?: (t: number) => void,
  ): void {
    this.onFrame = onFrame;
    this.onEnd = onEnd;
    this.onColorChange = onColorChange ?? null;
    this.ticker = setInterval(() => this.tick(), FRAME_INTERVAL);
  }

  /** Stop the simulation early. */
  stop(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /** Advance decoy positions by one frame interval. Walls bounce; occasional
   * random kicks keep the path from being straight-line predictable.
   */
  private tickDecoys(): void {
    const dt = FRAME_INTERVAL / 1000;
    for (const d of this.decoyStates) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x < PADDING) { d.x = PADDING; d.vx = Math.abs(d.vx); }
      else if (d.x > CANVAS_W - PADDING) { d.x = CANVAS_W - PADDING; d.vx = -Math.abs(d.vx); }
      if (d.y < PADDING) { d.y = PADDING; d.vy = Math.abs(d.vy); }
      else if (d.y > CANVAS_H - PADDING) { d.y = CANVAS_H - PADDING; d.vy = -Math.abs(d.vy); }
      if (Math.random() < 0.015) {
        d.vx += randomInRange(-12, 12);
        d.vy += randomInRange(-12, 12);
        const s = Math.hypot(d.vx, d.vy);
        if (s > DECOY_MAX_SPEED) {
          d.vx *= DECOY_MAX_SPEED / s;
          d.vy *= DECOY_MAX_SPEED / s;
        } else if (s < DECOY_MIN_SPEED) {
          const k = DECOY_MIN_SPEED / (s || 1);
          d.vx *= k;
          d.vy *= k;
        }
      }
    }
  }

  /** Compute one step. This is where randomness happens — future is unknowable. */
  private tick(): void {
    if (this.t > this.durationMs) {
      this.stop();
      this.onEnd?.();
      return;
    }

    this.tickDecoys();

    // Direction change?
    if (this.t >= this.nextChangeAt) {
      const oldVx = this.vx;
      const oldVy = this.vy;

      const currentAngle = Math.atan2(this.vy, this.vx);
      const minDelta = Math.PI / 4;
      const delta = randomInRange(minDelta, Math.PI * 2 - minDelta);
      const newAngle = currentAngle + delta;
      const newSpeed = randomInRange(MIN_SPEED, MAX_SPEED);
      const newVx = Math.cos(newAngle) * newSpeed;
      const newVy = Math.sin(newAngle) * newSpeed;

      this.lerpStartVx = this.vx;
      this.lerpStartVy = this.vy;
      this.lerpTargetVx = newVx;
      this.lerpTargetVy = newVy;
      this.lerpElapsed = 0;
      this.isLerping = true;

      this.changeEvents.push({ t: this.t, oldVx, oldVy, newVx, newVy });
      this.nextChangeAt = this.t + randomInRange(CHANGE_MIN_MS, CHANGE_MAX_MS);
    }

    // Color change? (random timing with ~30% skip rate for irregularity)
    if (this.t >= this.nextColorChangeAt) {
      if (Math.random() > 0.3 && this.onColorChange) {
        this.colorChangeTimes.push(this.t);
        this.onColorChange(this.t);
      }
      this.nextColorChangeAt = this.t + randomInRange(COLOR_CHANGE_MIN_MS, COLOR_CHANGE_MAX_MS);
    }

    // Velocity lerp
    if (this.isLerping) {
      this.lerpElapsed += FRAME_INTERVAL;
      const progress = Math.min(1, this.lerpElapsed / LERP_DURATION);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - 2 * (1 - progress) * (1 - progress);
      this.vx = lerpValue(this.lerpStartVx, this.lerpTargetVx, eased);
      this.vy = lerpValue(this.lerpStartVy, this.lerpTargetVy, eased);
      if (progress >= 1) this.isLerping = false;
    }

    // Clamp speed
    const clamped = clampSpeed(this.vx, this.vy);
    this.vx = clamped.vx;
    this.vy = clamped.vy;

    // Advance position
    const dt = FRAME_INTERVAL / 1000;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Wall bouncing
    let bounced = false;
    if (this.x < PADDING) { this.x = PADDING; this.vx = Math.abs(this.vx) * BOUNCE_DAMPEN; bounced = true; }
    else if (this.x > CANVAS_W - PADDING) { this.x = CANVAS_W - PADDING; this.vx = -Math.abs(this.vx) * BOUNCE_DAMPEN; bounced = true; }
    if (this.y < PADDING) { this.y = PADDING; this.vy = Math.abs(this.vy) * BOUNCE_DAMPEN; bounced = true; }
    else if (this.y > CANVAS_H - PADDING) { this.y = CANVAS_H - PADDING; this.vy = -Math.abs(this.vy) * BOUNCE_DAMPEN; bounced = true; }

    if (bounced) {
      this.vx += randomInRange(-10, 10);
      this.vy += randomInRange(-10, 10);
      const reclamped = clampSpeed(this.vx, this.vy);
      this.vx = reclamped.vx;
      this.vy = reclamped.vy;
      this.isLerping = false;
    }

    const frame: BallFrame = { x: this.x, y: this.y, t: this.t };
    this.frames.push(frame);
    this.frameDispatchTimes.push(Date.now());
    this.onFrame?.(frame);

    this.t += FRAME_INTERVAL;
  }

  /** Number of direction-change events recorded during the run. */
  get directionChangeCount(): number {
    return this.changeEvents.length;
  }
}
