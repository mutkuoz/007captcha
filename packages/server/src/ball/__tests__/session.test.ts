import { describe, it, expect, afterEach } from 'vitest';
import { BallChallengeManager } from '../session';

const SECRET = 'test-secret';
// Use short duration for fast tests
const TEST_DURATION = 500;

describe('BallChallengeManager', () => {
  let manager: BallChallengeManager;

  afterEach(() => {
    manager?.destroy();
  });

  it('should create a session with id and visuals', () => {
    manager = new BallChallengeManager(SECRET, { durationMs: TEST_DURATION });
    const { sessionId, visuals } = manager.createSession();

    expect(sessionId).toHaveLength(32);
    expect(visuals.bgColor).toBeTruthy();
    expect(visuals.ballColor).toBeTruthy();
    expect(['circle', 'square', 'triangle', 'diamond']).toContain(visuals.ballShape);
  });

  it('should retrieve a created session', () => {
    manager = new BallChallengeManager(SECRET, { durationMs: TEST_DURATION });
    const { sessionId } = manager.createSession();

    const session = manager.getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session!.status).toBe('pending');
  });

  it('should stream rendered PNG frames and complete', async () => {
    manager = new BallChallengeManager(SECRET, { durationMs: TEST_DURATION });
    const { sessionId } = manager.createSession();
    const frames: Array<{ img: string; t: number }> = [];

    await new Promise<void>((resolve) => {
      manager.startStreaming(
        sessionId,
        (frame) => frames.push(frame),
        () => resolve(),
      );
    });

    // ~20fps (every 3rd tick of 60fps) over 500ms = ~10 frames
    expect(frames.length).toBeGreaterThan(5);

    // Verify frames contain base64 PNG data, not raw coordinates
    for (const frame of frames) {
      expect(frame.img).toBeTruthy();
      expect(typeof frame.img).toBe('string');
      // PNG header in base64 starts with 'iVBOR'
      expect(frame.img.startsWith('iVBOR')).toBe(true);
      expect(frame.t).toBeGreaterThanOrEqual(0);
      // Must NOT have x/y coordinates
      expect((frame as any).x).toBeUndefined();
      expect((frame as any).y).toBeUndefined();
    }

    const session = manager.getSession(sessionId);
    expect(session!.status).toBe('awaiting_result');
  }, 10000);

  it('should verify cursor points and return a signed token', async () => {
    manager = new BallChallengeManager(SECRET, { durationMs: TEST_DURATION });
    const { sessionId } = manager.createSession();

    // Run the simulation
    await new Promise<void>((resolve) => {
      manager.startStreaming(sessionId, () => {}, () => resolve());
    });

    // Submit some cursor points
    const cursorPoints = Array.from({ length: 100 }, (_, i) => ({
      x: 150 + Math.sin(i / 10) * 40 + (Math.random() - 0.5) * 20,
      y: 130 + Math.cos(i / 10) * 40 + (Math.random() - 0.5) * 20,
      t: i * 16 + 1000,
    }));

    const result = manager.verify(sessionId, cursorPoints, 1000, [], 'http://localhost');

    expect(result.token).toBeTruthy();
    expect(result.token.split('.')).toHaveLength(2);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(['bot', 'human', 'uncertain']).toContain(result.verdict);
  }, 10000);

  it('should cancel a session', () => {
    manager = new BallChallengeManager(SECRET, { durationMs: TEST_DURATION });
    const { sessionId } = manager.createSession();

    manager.cancelSession(sessionId);
    expect(manager.getSession(sessionId)).toBeNull();
  });

  it('should reject streaming for non-existent session', () => {
    manager = new BallChallengeManager(SECRET, { durationMs: TEST_DURATION });
    const started = manager.startStreaming('nonexistent', () => {}, () => {});
    expect(started).toBe(false);
  });

  it('should handle color changes internally without exposing to caller', async () => {
    manager = new BallChallengeManager(SECRET, { durationMs: 2000 });
    const { sessionId, visuals: initialVisuals } = manager.createSession();

    await new Promise<void>((resolve) => {
      manager.startStreaming(
        sessionId,
        () => {},
        () => resolve(),
      );
    });

    // startStreaming only takes 2 callbacks now (no onColorChange)
    // Color changes happen internally — verify the API works without it
    const session = manager.getSession(sessionId);
    expect(session!.status).toBe('awaiting_result');
  }, 10000);
});
