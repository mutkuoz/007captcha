import { describe, it, expect } from 'vitest';
import { analyzeDrawing } from '../index';
import type { CapturePoint } from '../../types';

function makeHumanCircle(): CapturePoint[] {
  const cx = 150, cy = 150, r = 80;
  const points: CapturePoint[] = [];
  let t = 0;
  for (let i = 0; i < 250; i++) {
    const angle = (i / 250) * Math.PI * 2;
    const jx = (Math.random() - 0.5) * 4;
    const jy = (Math.random() - 0.5) * 4;
    t += 8 + Math.random() * 14;
    points.push({
      x: cx + Math.cos(angle) * r + jx,
      y: cy + Math.sin(angle) * r + jy,
      t,
    });
  }
  return points;
}

function makeBotCircle(): CapturePoint[] {
  const cx = 150, cy = 150, r = 80;
  return Array.from({ length: 12 }, (_, i) => ({
    x: cx + Math.cos((i / 12) * Math.PI * 2) * r,
    y: cy + Math.sin((i / 12) * Math.PI * 2) * r,
    t: i * 16.667,
  }));
}

describe('analyzeDrawing (end-to-end)', () => {
  it('should score human-like drawing higher', () => {
    const result = analyzeDrawing(makeHumanCircle(), 'circle');
    expect(result.score).toBeGreaterThan(0.4);
    expect(result.verdict).not.toBe('bot');
  });

  it('should score bot-like drawing lower', () => {
    const result = analyzeDrawing(makeBotCircle(), 'circle');
    expect(result.score).toBeLessThan(0.5);
  });
});
