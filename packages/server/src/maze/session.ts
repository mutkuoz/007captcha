import { createHmac, randomBytes } from 'crypto';
import type { MazeDefinition, CursorPoint, ZoneRect, MazeVerifyResult } from '../types';
import { generateMaze } from './generate';
import { solveMaze } from './solve';
import { renderMazeImage } from './renderer';
import { analyzeMazePath } from './analyze';
import { analyzeBehavior, scoreBehavioral, analyzePowerLaw, isPowerLawBotFlag } from '../ball/scoring';

const MAZE_ROWS = 6;
const MAZE_COLS = 8;
const CELL_SIZE = 44;
const SESSION_TTL_MS = 120_000;
const CLEANUP_INTERVAL_MS = 30_000;

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function base64urlEncode(data: Buffer): string {
  return data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface MazeSession {
  id: string;
  maze: MazeDefinition;
  solution: { row: number; col: number }[];
  offsetX: number;
  offsetY: number;
  createdAt: number;
  verified: boolean;
}

export interface MazeSessionStartResult {
  sessionId: string;
  image: string; // base64 PNG
  entrance: ZoneRect;
  exit: ZoneRect;
}

export class MazeChallengeManager {
  private sessions = new Map<string, MazeSession>();
  private secretKey: string;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  createSession(): MazeSessionStartResult {
    const id = randomBytes(16).toString('hex');
    const maze = generateMaze(MAZE_ROWS, MAZE_COLS, CELL_SIZE);
    const solution = solveMaze(maze);
    if (!solution) {
      // Extremely unlikely with DFS maze generation — regenerate
      return this.createSession();
    }

    const { image, offsetX, offsetY } = renderMazeImage(maze);

    this.sessions.set(id, {
      id, maze, solution, offsetX, offsetY,
      createdAt: Date.now(), verified: false,
    });

    const { entrance, exit, cellSize } = maze;

    return {
      sessionId: id,
      image: image.toString('base64'),
      entrance: {
        x: offsetX - cellSize * 0.5,
        y: offsetY + entrance.row * cellSize,
        width: cellSize * 0.5,
        height: cellSize,
      },
      exit: {
        x: offsetX + MAZE_COLS * cellSize,
        y: offsetY + exit.row * cellSize,
        width: cellSize * 0.5,
        height: cellSize,
      },
    };
  }

  verify(sessionId: string, cursorPoints: CursorPoint[], origin: string): MazeVerifyResult {
    const session = this.sessions.get(sessionId);
    if (!session || session.verified) {
      const reason = !session ? 'session_not_found' : 'already_verified';
      return { success: false, score: 0, verdict: 'bot', token: '', error: reason };
    }

    session.verified = true;

    if (cursorPoints.length < 5) {
      return { success: false, score: 0, verdict: 'bot', token: '', error: `too_few_points (${cursorPoints.length})` };
    }

    const mazeMetrics = analyzeMazePath(
      cursorPoints, session.maze, session.solution,
      session.offsetX, session.offsetY,
    );

    console.log('[maze verify]', sessionId.slice(0, 8), {
      points: cursorPoints.length,
      reachedExit: mazeMetrics.reachedExit,
      wallCrossings: mazeMetrics.wallCrossings,
      wallTouches: mazeMetrics.wallTouches,
      pathStraightness: mazeMetrics.pathStraightness.toFixed(3),
      optimalPathRatio: mazeMetrics.optimalPathRatio.toFixed(3),
      lastPt: cursorPoints[cursorPoints.length - 1],
    });

    if (!mazeMetrics.reachedExit) {
      return { success: false, score: 0, verdict: 'bot', token: '', error: 'did_not_reach_exit' };
    }

    // Maze-specific scoring
    const mazeScore = this.scoreMaze(mazeMetrics);

    // Hard fail from maze = absolute zero (no behavioral compensation)
    if (mazeScore === 0) {
      const reason = mazeMetrics.wallCrossings > 3
        ? `wall_crossings (${mazeMetrics.wallCrossings})`
        : `wall_touches (${mazeMetrics.wallTouches})`;
      this.sessions.delete(sessionId);
      return { success: false, score: 0, verdict: 'bot', token: '', error: reason };
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

    const score = Math.max(0, Math.min(1, 0.50 * behavScore + 0.50 * mazeScore));

    let verdict: 'bot' | 'human' | 'uncertain';
    if (score < 0.25) verdict = 'bot';
    else if (score > 0.45) verdict = 'human';
    else verdict = 'uncertain';

    const payload = {
      cid: sessionId,
      method: 'maze' as const,
      challenge: 'maze',
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

  private scoreMaze(m: import('../types').MazeAnalysisMetrics): number {
    if (m.wallCrossings > 3) return 0;
    if (m.wallTouches >= 5) return 0;

    const wallScore = m.wallCrossings === 0 ? 1.0
      : m.wallCrossings === 1 ? 0.7
      : m.wallCrossings === 2 ? 0.4
      : 0.15;

    const touchScore = Math.pow(0.7, m.wallTouches);

    const straightScore = 1 - normalize(m.pathStraightness, 0.3, 0.9);

    const optimalScore = m.optimalPathRatio <= 0 ? 0
      : m.optimalPathRatio < 1.2 ? 0.1
      : m.optimalPathRatio < 1.5 ? 0.5
      : m.optimalPathRatio < 4.0 ? 1.0
      : 0.7;

    const backtrackScore = normalize(m.backtrackCount, 0, 5);

    return (
      wallScore * 0.25 +
      touchScore * 0.15 +
      straightScore * 0.20 +
      optimalScore * 0.20 +
      backtrackScore * 0.20
    );
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
