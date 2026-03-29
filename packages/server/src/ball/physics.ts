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
  readonly changeEvents: TrajectoryChangeEvent[] = [];
  readonly colorChangeTimes: number[] = [];
  readonly startX: number;
  readonly startY: number;

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

  /** Compute one step. This is where randomness happens — future is unknowable. */
  private tick(): void {
    if (this.t > this.durationMs) {
      this.stop();
      this.onEnd?.();
      return;
    }

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
    this.onFrame?.(frame);

    this.t += FRAME_INTERVAL;
  }
}
