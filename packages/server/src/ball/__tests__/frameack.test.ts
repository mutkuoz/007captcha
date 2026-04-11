import { describe, it, expect } from 'vitest';
import type { FrameAck } from '../../types';

describe('FrameAck type', () => {
  it('should accept well-formed ack objects', () => {
    const ack: FrameAck = { i: 0, t: 100, x: 240, y: 200 };
    expect(ack.i).toBe(0);
    expect(ack.t).toBe(100);
    expect(ack.x).toBe(240);
    expect(ack.y).toBe(200);
  });
});
