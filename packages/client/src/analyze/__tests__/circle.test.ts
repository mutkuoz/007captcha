import { describe, it, expect } from 'vitest';
import { analyzeCircle } from '../circle';
import type { CapturePoint } from '../../types';

function makePerfectCircle(n = 100): CapturePoint[] {
  const cx = 150, cy = 150, r = 80;
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, t: i * 10 };
  });
}

function makeWobblyCircle(n = 200, noise = 5): CapturePoint[] {
  const cx = 150, cy = 150, r = 80;
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2;
    const jx = (Math.random() - 0.5) * noise * 2;
    const jy = (Math.random() - 0.5) * noise * 2;
    return { x: cx + Math.cos(angle) * r + jx, y: cy + Math.sin(angle) * r + jy, t: i * 12 };
  });
}

describe('analyzeCircle', () => {
  it('should give high perfection score to a perfect circle', () => {
    const result = analyzeCircle(makePerfectCircle());
    expect(result.matchScore).toBeGreaterThan(0.7);
    expect(result.perfectionScore).toBeGreaterThan(0.9);
  });

  it('should give lower perfection score to a wobbly circle', () => {
    const result = analyzeCircle(makeWobblyCircle());
    expect(result.matchScore).toBeGreaterThan(0.5);
    expect(result.perfectionScore).toBeLessThan(0.8);
  });

  it('should give low match score to random scribble', () => {
    const points: CapturePoint[] = Array.from({ length: 50 }, (_, i) => ({
      x: Math.random() * 300,
      y: Math.random() * 300,
      t: i * 10,
    }));
    const result = analyzeCircle(points);
    expect(result.matchScore).toBeLessThan(0.8);
  });

  it('should handle too few points', () => {
    const result = analyzeCircle([{ x: 0, y: 0, t: 0 }]);
    expect(result.matchScore).toBe(0);
  });
});
