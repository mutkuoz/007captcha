import { createHmac, randomBytes } from 'crypto';
import type { CursorPoint, ShapeType, ShapeVerifyResult } from '../types';
import { analyzeShape } from './analyze';
import { analyzeBehavior, scoreBehavioral, analyzePowerLaw, isPowerLawBotFlag } from '../ball/scoring';

const SHAPES: ShapeType[] = ['circle', 'triangle', 'square'];
const SESSION_TTL_MS = 60_000;
const CLEANUP_INTERVAL_MS = 30_000;
const MIN_POINTS = 15;
const MIN_MATCH_SCORE = 0.25;

function base64urlEncode(data: Buffer): string {
  return data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface ShapeSession {
  id: string;
  shape: ShapeType;
  createdAt: number;
  verified: boolean;
}

export interface ShapeSessionStartResult {
  sessionId: string;
  shape: ShapeType;
}

export class ShapeChallengeManager {
  private sessions = new Map<string, ShapeSession>();
  private secretKey: string;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  createSession(): ShapeSessionStartResult {
    const id = randomBytes(16).toString('hex');
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];

    this.sessions.set(id, {
      id, shape,
      createdAt: Date.now(), verified: false,
    });

    return { sessionId: id, shape };
  }

  verify(sessionId: string, cursorPoints: CursorPoint[], origin: string): ShapeVerifyResult {
    const session = this.sessions.get(sessionId);
    if (!session || session.verified) {
      const reason = !session ? 'session_not_found' : 'already_verified';
      return { success: false, score: 0, verdict: 'bot', token: '', error: reason };
    }

    session.verified = true;

    if (cursorPoints.length < MIN_POINTS) {
      this.sessions.delete(sessionId);
      return { success: false, score: 0, verdict: 'bot', token: '', error: `too_few_points (${cursorPoints.length})` };
    }

    const shapeResult = analyzeShape(cursorPoints, session.shape);

    console.log('[shape verify]', sessionId.slice(0, 8), {
      shape: session.shape,
      points: cursorPoints.length,
      matchScore: shapeResult.matchScore.toFixed(3),
      perfectionScore: shapeResult.perfectionScore.toFixed(3),
    });

    if (shapeResult.matchScore < MIN_MATCH_SCORE) {
      this.sessions.delete(sessionId);
      return { success: false, score: 0, verdict: 'bot', token: '', error: `shape_mismatch (${shapeResult.matchScore.toFixed(3)})` };
    }

    // Power law hard-flag: immediate bot verdict if movement violates the law
    const powerLaw = analyzePowerLaw(cursorPoints);
    if (isPowerLawBotFlag(powerLaw)) {
      this.sessions.delete(sessionId);
      return { success: false, score: 0, verdict: 'bot', token: '', error: 'power_law_violation' };
    }

    // Behavioral scoring (with power law integrated)
    const behavioral = analyzeBehavior(cursorPoints);
    const behavScore = scoreBehavioral(behavioral, powerLaw);

    // Shape perfection: high perfection = bot-like, so invert
    const shapeScore = 1.0 - shapeResult.perfectionScore;

    // Match score scales down the final score
    const matchFactor = Math.max(0, Math.min(1, shapeResult.matchScore));
    const rawScore = 0.60 * behavScore + 0.40 * shapeScore;
    const score = Math.max(0, Math.min(1, rawScore * matchFactor));

    let verdict: 'bot' | 'human' | 'uncertain';
    if (score < 0.3) verdict = 'bot';
    else if (score > 0.7) verdict = 'human';
    else verdict = 'uncertain';

    const payload = {
      cid: sessionId,
      method: 'shape' as const,
      challenge: session.shape,
      score, verdict,
      ts: Date.now(),
      ph: '',
      origin,
    };

    const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(payload)));
    const sig = base64urlEncode(
      createHmac('sha256', this.secretKey).update(payloadB64).digest()
    );
    const token = `${payloadB64}.${sig}`;
    const success = verdict !== 'bot';

    this.sessions.delete(sessionId);
    return { success, score, verdict, token };
  }

  cancelSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) this.sessions.delete(id);
    }
  }

  destroy(): void {
    if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }
    this.sessions.clear();
  }
}
