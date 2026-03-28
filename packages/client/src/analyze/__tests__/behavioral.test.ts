import { describe, it, expect } from 'vitest';
import { analyzeBehavior } from '../behavioral';
import type { CapturePoint } from '../../types';

function makeHumanLikeCircle(): CapturePoint[] {
  const points: CapturePoint[] = [];
  const cx = 150, cy = 150, r = 80;
  const n = 300;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    // Add natural jitter and speed variation
    const jitterX = (Math.random() - 0.5) * 3;
    const jitterY = (Math.random() - 0.5) * 3;
    const dt = 8 + Math.random() * 12; // 8-20ms intervals
    t += dt;
    points.push({
      x: cx + Math.cos(angle) * r + jitterX,
      y: cy + Math.sin(angle) * r + jitterY,
      t,
    });
  }
  return points;
}

function makeBotLikeCircle(): CapturePoint[] {
  const points: CapturePoint[] = [];
  const cx = 150, cy = 150, r = 80;
  const n = 15;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    t += 16.667; // perfectly regular ~60fps
    points.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      t,
    });
  }
  return points;
}

describe('analyzeBehavior', () => {
  it('should detect human-like drawing patterns', () => {
    const points = makeHumanLikeCircle();
    const result = analyzeBehavior(points);

    expect(result.pointCount).toBeGreaterThan(100);
    expect(result.speedStdDev).toBeGreaterThan(0);
    expect(result.timestampRegularity).toBeGreaterThan(1);
    expect(result.microJitterScore).toBeGreaterThan(0.05);
  });

  it('should detect bot-like drawing patterns', () => {
    const points = makeBotLikeCircle();
    const result = analyzeBehavior(points);

    expect(result.pointCount).toBeLessThan(30);
    expect(result.timestampRegularity).toBeLessThan(1);
  });

  it('should handle empty/minimal input', () => {
    expect(analyzeBehavior([]).pointCount).toBe(0);
    expect(analyzeBehavior([{ x: 0, y: 0, t: 0 }]).pointCount).toBe(1);
  });
});
