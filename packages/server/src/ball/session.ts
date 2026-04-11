import { createHmac, randomBytes } from 'crypto';
import type { BallVisuals, BallShape, CursorPoint, BallVerifyResult, ClientEnvironment, RequestMeta, FrameAck } from '../types';
import { BallPhysics } from './physics';
import { analyzeBallTracking, analyzeSpeedAtDirectionChanges, analyzeReactionTimes, analyzeFrameAcks } from './analyze';
import { computeBallScore } from './scoring';
import { renderBallFrame } from './renderer';
import { logTrace } from '../logger';

const BALL_SHAPES: BallShape[] = ['circle', 'square', 'triangle', 'diamond'];

const COLOR_PAIRS: Array<{ bg: string; ball: string }> = [
  { bg: '#1a1a2e', ball: '#e94560' },
  { bg: '#f0f0f0', ball: '#e63946' },
  { bg: '#264653', ball: '#e9c46a' },
  { bg: '#2b2d42', ball: '#ef233c' },
  { bg: '#fefae0', ball: '#bc6c25' },
  { bg: '#003049', ball: '#fcbf49' },
  { bg: '#edf2f4', ball: '#d90429' },
  { bg: '#f8f9fa', ball: '#4361ee' },
  { bg: '#0b132b', ball: '#5bc0be' },
  { bg: '#fdf0d5', ball: '#c1121f' },
];

function base64urlEncode(data: Buffer): string {
  return data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type SessionStatus = 'pending' | 'countdown' | 'streaming' | 'awaiting_result' | 'completed' | 'expired';

export interface BallSession {
  id: string;
  status: SessionStatus;
  visuals: BallVisuals;
  physics: BallPhysics;
  createdAt: number;
  streamStartedAt: number | null;
}

export interface BallSessionStartResult {
  sessionId: string;
  visuals: BallVisuals;
}

const SESSION_TTL_MS = 60_000; // 1 minute max session lifetime
const CLEANUP_INTERVAL_MS = 30_000;

/**
 * Manages active ball challenge sessions.
 * Each session has a real-time physics simulation that streams frames.
 */
export interface BallChallengeManagerOptions {
  /** Override simulation duration in ms (default 8000). Useful for testing. */
  durationMs?: number;
}

export class BallChallengeManager {
  private sessions = new Map<string, BallSession>();
  private secretKey: string;
  private durationMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(secretKey: string, options: BallChallengeManagerOptions = {}) {
    this.secretKey = secretKey;
    this.durationMs = options.durationMs ?? 8000;
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  /** Create a new ball challenge session. Returns session ID and visuals. */
  createSession(): BallSessionStartResult {
    const id = randomBytes(16).toString('hex');
    const pair = COLOR_PAIRS[Math.floor(Math.random() * COLOR_PAIRS.length)];
    const shape = BALL_SHAPES[Math.floor(Math.random() * BALL_SHAPES.length)];
    const visuals: BallVisuals = { bgColor: pair.bg, ballColor: pair.ball, ballShape: shape };

    const session: BallSession = {
      id,
      status: 'pending',
      visuals,
      physics: new BallPhysics(this.durationMs),
      createdAt: Date.now(),
      streamStartedAt: null,
    };

    this.sessions.set(id, session);
    return { sessionId: id, visuals };
  }

  /** Get a session by ID. Returns null if not found or expired. */
  getSession(id: string): BallSession | null {
    return this.sessions.get(id) ?? null;
  }

  /**
   * Start streaming rendered PNG frames for a session.
   * Frames are rendered server-side as images — no raw coordinates are exposed.
   * onFrame receives `{ img: base64PNG, t: timeOffset }` at ~20fps.
   * onEnd is called when the simulation finishes.
   */
  startStreaming(
    sessionId: string,
    onFrame: (frame: { img: string; t: number }) => void,
    onEnd: () => void,
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'pending') return false;

    session.status = 'streaming';
    session.streamStartedAt = Date.now();
    let frameCount = 0;

    session.physics.start(
      (frame) => {
        frameCount++;
        // Send every 3rd frame (~20fps) to keep bandwidth reasonable
        if (frameCount % 3 !== 0) return;

        const png = renderBallFrame(
          frame.x, frame.y,
          session.visuals.bgColor,
          session.visuals.ballColor,
          session.visuals.ballShape,
        );
        onFrame({ img: png.toString('base64'), t: frame.t });
      },
      () => {
        session.status = 'awaiting_result';
        onEnd();
      },
      // Color changes handled internally — new colors apply to next rendered frame
      () => {
        const newPair = this.pickDifferentColorPair(session.visuals.bgColor);
        session.visuals = { ...session.visuals, bgColor: newPair.bg, ballColor: newPair.ball };
      },
    );

    return true;
  }

  /**
   * Verify cursor points against the recorded ball trajectory.
   * Returns a signed token if the challenge passes.
   */
  verify(
    sessionId: string,
    cursorPoints: CursorPoint[],
    cursorStartT: number,
    frameAcks: FrameAck[],
    origin: string,
    clientEnv?: ClientEnvironment,
    requestMeta?: RequestMeta,
  ): BallVerifyResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, score: 0, verdict: 'bot', token: '' };
    }

    if (session.status !== 'awaiting_result' && session.status !== 'streaming') {
      // If still streaming, stop it (client submitted early or timed out)
      session.physics.stop();
    }

    session.status = 'completed';

    const frames = session.physics.frames;
    const changeEvents = session.physics.changeEvents;

    if (frames.length < 10 || cursorPoints.length < 10) {
      return { success: false, score: 0, verdict: 'bot', token: '' };
    }

    // Analyze tracking quality
    const ballMetrics = analyzeBallTracking(cursorPoints, frames, changeEvents, cursorStartT);
    const speedProfile = analyzeSpeedAtDirectionChanges(cursorPoints, changeEvents, cursorStartT);
    const reactionTime = analyzeReactionTimes(cursorPoints, changeEvents, cursorStartT);
    const frameAckFlag = analyzeFrameAcks(
      frameAcks,
      frames,
      session.physics.frameDispatchTimes,
      cursorPoints,
    );
    const { score, verdict } = computeBallScore(
      cursorPoints, ballMetrics, speedProfile, reactionTime, clientEnv, requestMeta,
      session.physics.directionChangeCount,
      frameAckFlag,
    );

    // Optional: log the trace for offline ML training (opt-in via env vars)
    try {
      logTrace({
        v: 1,
        sessionId,
        ts: Date.now(),
        label:
          process.env.LABEL === 'bot' || process.env.LABEL === 'human'
            ? process.env.LABEL
            : 'human',
        points: cursorPoints.map((p) => ({ x: p.x, y: p.y, t: p.t })),
        ballFrames: frames.map((f, i) => ({ i, x: f.x, y: f.y, t: f.t })),
        frameAcks,
        clientEnv: clientEnv ?? {},
        requestMeta: requestMeta ?? {},
        verdictAtCapture: verdict,
        scoreAtCapture: score,
        signals: { ballMetrics, speedProfile, reactionTime, frameAckFlag },
      });
    } catch {
      // Never break verification because of logging
    }

    // Create signed token
    const payload = {
      cid: sessionId,
      method: 'ball' as const,
      challenge: 'ball',
      score,
      verdict,
      ts: Date.now(),
      ph: '', // no client-side points hash for server-verified challenges
      origin,
    };

    const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(payload)));
    const sig = base64urlEncode(
      createHmac('sha256', this.secretKey).update(payloadB64).digest()
    );
    const token = `${payloadB64}.${sig}`;

    const success = verdict !== 'bot';

    // Clean up session
    this.sessions.delete(sessionId);

    return { success, score, verdict, token };
  }

  /** Stop a session (e.g., client disconnected). */
  cancelSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.physics.stop();
      this.sessions.delete(sessionId);
    }
  }

  private pickDifferentColorPair(currentBg: string): { bg: string; ball: string } {
    const filtered = COLOR_PAIRS.filter(p => p.bg !== currentBg);
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  /** Remove expired sessions. */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        session.physics.stop();
        this.sessions.delete(id);
      }
    }
  }

  /** Stop the cleanup timer (for graceful shutdown). */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const [, session] of this.sessions) {
      session.physics.stop();
    }
    this.sessions.clear();
  }
}
