import { describe, it, expect, vi } from 'vitest';
import { BallPhysics } from '../physics';

describe('BallPhysics', () => {
  it('should emit frames and call onEnd when duration expires', async () => {
    const physics = new BallPhysics(500); // short duration for fast test
    const frames: Array<{ x: number; y: number; t: number }> = [];

    await new Promise<void>((resolve) => {
      physics.start(
        (frame) => frames.push(frame),
        () => resolve(),
      );
    });

    expect(frames.length).toBeGreaterThan(20);
    // Last frame t may be slightly under duration due to frame interval stepping
    expect(frames[frames.length - 1].t).toBeGreaterThanOrEqual(450);
  });

  it('should keep all frames within canvas bounds', async () => {
    const physics = new BallPhysics(1000);
    const frames: Array<{ x: number; y: number; t: number }> = [];

    await new Promise<void>((resolve) => {
      physics.start(
        (frame) => frames.push(frame),
        () => resolve(),
      );
    });

    for (const f of frames) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThanOrEqual(480);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeLessThanOrEqual(400);
    }
  });

  it('should record direction change events', async () => {
    const physics = new BallPhysics(3000);

    await new Promise<void>((resolve) => {
      physics.start(() => {}, () => resolve());
    });

    expect(physics.changeEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('should stop early when stop() is called', async () => {
    const physics = new BallPhysics(8000);
    const frames: Array<{ x: number; y: number; t: number }> = [];

    physics.start((frame) => frames.push(frame), () => {});

    // Let it run for ~200ms then stop
    await new Promise(r => setTimeout(r, 200));
    physics.stop();

    const count = frames.length;
    // Wait a bit more and verify no new frames
    await new Promise(r => setTimeout(r, 100));
    expect(frames.length).toBe(count);
  });

  it('should produce different paths on successive runs', async () => {
    const physics1 = new BallPhysics(500);
    const physics2 = new BallPhysics(500);

    await new Promise<void>(r => physics1.start(() => {}, () => r()));
    await new Promise<void>(r => physics2.start(() => {}, () => r()));

    const sum1 = physics1.frames.reduce((s, f) => s + f.x + f.y, 0);
    const sum2 = physics2.frames.reduce((s, f) => s + f.x + f.y, 0);
    expect(sum1).not.toBe(sum2);
  });

  it('should record start position', () => {
    const physics = new BallPhysics();
    expect(physics.startX).toBeGreaterThan(0);
    expect(physics.startX).toBeLessThan(480);
    expect(physics.startY).toBeGreaterThan(0);
    expect(physics.startY).toBeLessThan(400);
  });

  it('should record color change times matching callback invocations', async () => {
    const physics = new BallPhysics(5000);
    const cbTimes: number[] = [];

    await new Promise<void>((resolve) => {
      physics.start(
        () => {},
        () => resolve(),
        (t) => cbTimes.push(t),
      );
    });

    expect(physics.colorChangeTimes).toEqual(cbTimes);
    for (const t of physics.colorChangeTimes) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(5000);
    }
  });

  it('should not fire color changes without callback', async () => {
    const physics = new BallPhysics(1000);

    await new Promise<void>((resolve) => {
      physics.start(() => {}, () => resolve());
    });

    expect(physics.colorChangeTimes).toEqual([]);
  });
});
