import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface TraceRecord {
  v: 1;
  sessionId: string;
  ts: number;
  label: 'bot' | 'human';
  points: Array<{ x: number; y: number; t: number }>;
  ballFrames?: Array<{ i: number; x: number; y: number; t: number }>;
  frameAcks?: Array<{ i: number; t: number; x: number; y: number }>;
  clientEnv: unknown;
  requestMeta: unknown;
  verdictAtCapture: 'human' | 'bot' | 'uncertain';
  scoreAtCapture: number;
  signals: Record<string, unknown>;
}

const ENABLED = process.env.LOG_TRACES === '1';
const LABEL = process.env.LABEL;
const LOG_DIR = process.env.LOG_DIR ?? './traces';

if (ENABLED && LABEL !== 'bot' && LABEL !== 'human') {
  throw new Error(
    '007captcha logger: LOG_TRACES=1 requires LABEL=bot or LABEL=human. ' +
      'This prevents silent unlabeled data collection.',
  );
}

let dirEnsured = false;

function ensureDir(): void {
  if (dirEnsured) return;
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  dirEnsured = true;
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function logTrace(trace: TraceRecord): void {
  if (!ENABLED) return;
  ensureDir();
  const filename = `${todayString()}_${LABEL}.jsonl`;
  const filepath = join(LOG_DIR, filename);
  appendFileSync(filepath, JSON.stringify(trace) + '\n', 'utf-8');
}
