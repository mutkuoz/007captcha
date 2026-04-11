import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('logger', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ooseven-logger-'));
    delete process.env.LOG_TRACES;
    delete process.env.LABEL;
    delete process.env.LOG_DIR;
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.LOG_TRACES;
    delete process.env.LABEL;
    delete process.env.LOG_DIR;
    vi.resetModules();
  });

  it('is a no-op when LOG_TRACES is not set', async () => {
    process.env.LOG_DIR = tmpDir;
    const mod = await import('../logger');
    mod.logTrace({
      v: 1,
      sessionId: 'x',
      ts: 0,
      label: 'human',
      points: [],
      clientEnv: {},
      requestMeta: {},
      verdictAtCapture: 'human',
      scoreAtCapture: 1,
      signals: {},
    });
    expect(readdirSync(tmpDir)).toEqual([]);
  });

  it('throws at module import when LOG_TRACES=1 but LABEL is unset', async () => {
    process.env.LOG_TRACES = '1';
    process.env.LOG_DIR = tmpDir;
    await expect(import('../logger')).rejects.toThrow(/LABEL/);
  });

  it('writes a JSONL line when LOG_TRACES=1 and LABEL=human', async () => {
    process.env.LOG_TRACES = '1';
    process.env.LABEL = 'human';
    process.env.LOG_DIR = tmpDir;
    const mod = await import('../logger');
    mod.logTrace({
      v: 1,
      sessionId: 'abc',
      ts: 1712000000000,
      label: 'human',
      points: [{ x: 1, y: 2, t: 3 }],
      ballFrames: [{ i: 0, x: 10, y: 20, t: 0 }],
      frameAcks: [{ i: 0, t: 5, x: 1, y: 2 }],
      clientEnv: {},
      requestMeta: {},
      verdictAtCapture: 'human',
      scoreAtCapture: 0.9,
      signals: {},
    });
    const files = readdirSync(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/_human\.jsonl$/);
    const content = readFileSync(join(tmpDir, files[0]), 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.sessionId).toBe('abc');
    expect(parsed.label).toBe('human');
  });
});
