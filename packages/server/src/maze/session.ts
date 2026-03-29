import { createHmac, randomBytes } from 'crypto';
import type { MazeDefinition, CursorPoint, ZoneRect, MazeVerifyResult, ClientEnvironment, RequestMeta } from '../types';
import { generateMaze } from './generate';
import { solveMaze } from './solve';
import { renderMazeImage } from './renderer';
import { analyzeMazePath, analyzeFittsLaw, type FittsMetrics } from './analyze';
import {
  analyzeBehavior, scoreBehavioral, analyzePowerLaw, isPowerLawBotFlag,
  analyzeTimingSpectrum, isSpectralBotFlag, analyzeJerk, analyzeSubMovements,
  analyzeDrift, isTimestampBotFlag, isEnvironmentBotFlag, scoreEnvironment,
} from '../ball/scoring';

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

  verify(sessionId: string, cursorPoints: CursorPoint[], origin: string, clientEnv?: ClientEnvironment, requestMeta?: RequestMeta): MazeVerifyResult {
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

    // Hard fail from maze geometry = absolute zero (no behavioral compensation)
    if (mazeMetrics.wallCrossings > 3 || mazeMetrics.wallTouches >= 5) {
      const reason = mazeMetrics.wallCrossings > 3
        ? `wall_crossings (${mazeMetrics.wallCrossings})`
        : `wall_touches (${mazeMetrics.wallTouches})`;
      this.sessions.delete(sessionId);
      return { success: false, score: 0, verdict: 'bot', token: '', error: reason };
    }

    // Hard flags — immediate bot verdict
    if (isTimestampBotFlag(cursorPoints)) {
      this.sessions.delete(sessionId);
      return { success: false, score: 0, verdict: 'bot', token: '', error: 'timestamp_violation' };
    }
    if (isEnvironmentBotFlag(clientEnv, requestMeta)) {
      this.sessions.delete(sessionId);
      return { success: false, score: 0, verdict: 'bot', token: '', error: 'environment_violation' };
    }
    const powerLaw = analyzePowerLaw(cursorPoints);
    if (isPowerLawBotFlag(powerLaw)) {
      this.sessions.delete(sessionId);
      return { success: false, score: 0, verdict: 'bot', token: '', error: 'power_law_violation' };
    }
    const spectral = analyzeTimingSpectrum(cursorPoints);
    if (isSpectralBotFlag(spectral)) {
      this.sessions.delete(sessionId);
      return { success: false, score: 0, verdict: 'bot', token: '', error: 'spectral_violation' };
    }

    // Fitts's Law analysis (maze-specific)
    const fittsMetrics = analyzeFittsLaw(cursorPoints, session.maze, session.offsetX, session.offsetY);

    // Maze-specific scoring (with Fitts's Law)
    const mazeScore = this.scoreMaze(mazeMetrics, fittsMetrics);

    // Compute all behavioral signals
    const jerk = analyzeJerk(cursorPoints);
    const subMovement = analyzeSubMovements(cursorPoints);
    const drift = analyzeDrift(cursorPoints);
    const envScore = scoreEnvironment(clientEnv, requestMeta);

    const behavioral = analyzeBehavior(cursorPoints);
    const behavScore = scoreBehavioral(behavioral, {
      powerLaw, spectral, jerk, subMovement, drift, envScore,
    });

    const score = Math.max(0, Math.min(1, 0.45 * behavScore + 0.45 * mazeScore + 0.10 * envScore));

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

  private scoreMaze(m: import('../types').MazeAnalysisMetrics, fitts?: FittsMetrics): number {
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

    // Fitts's Law: humans show moderate correlation (R² 0.15-0.7)
    let fittsScore = 0.5; // neutral if no data
    if (fitts && fitts.fittsSampleCount >= 5) {
      if (fitts.fittsR2 < 0.05) fittsScore = 0.2;       // no correlation (bot)
      else if (fitts.fittsR2 < 0.15) fittsScore = 0.5;
      else if (fitts.fittsR2 <= 0.75) fittsScore = 1.0;  // human range
      else fittsScore = 0.7;                                // very high but possible
    }

    return (
      wallScore * 0.20 +
      touchScore * 0.12 +
      straightScore * 0.17 +
      optimalScore * 0.17 +
      backtrackScore * 0.17 +
      fittsScore * 0.17
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
