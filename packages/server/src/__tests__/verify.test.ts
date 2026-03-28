import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verify } from '../verify';

const SECRET = 'test-secret-key';

function base64urlEncode(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeToken(payload: Record<string, unknown>, key = SECRET): string {
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = base64urlEncode(createHmac('sha256', key).update(payloadB64).digest());
  return `${payloadB64}.${sig}`;
}

describe('verify', () => {
  it('should verify a valid token (new format)', async () => {
    const token = makeToken({
      cid: 'test-123',
      method: 'shape',
      challenge: 'circle',
      score: 0.85,
      verdict: 'human',
      ts: Date.now(),
      ph: 'abc123',
      origin: 'http://localhost',
    });

    const result = await verify(token, SECRET);
    expect(result.success).toBe(true);
    expect(result.score).toBe(0.85);
    expect(result.verdict).toBe('human');
    expect(result.method).toBe('shape');
    expect(result.challenge).toBe('circle');
  });

  it('should verify a valid maze token', async () => {
    const token = makeToken({
      cid: 'test-456',
      method: 'maze',
      challenge: 'maze',
      score: 0.72,
      verdict: 'human',
      ts: Date.now(),
      ph: 'def456',
      origin: 'http://localhost',
    });

    const result = await verify(token, SECRET);
    expect(result.success).toBe(true);
    expect(result.method).toBe('maze');
    expect(result.challenge).toBe('maze');
  });

  it('should verify a valid ball token', async () => {
    const token = makeToken({
      cid: 'test-789',
      method: 'ball',
      challenge: 'ball',
      score: 0.78,
      verdict: 'human',
      ts: Date.now(),
      ph: 'ghi789',
      origin: 'http://localhost',
    });

    const result = await verify(token, SECRET);
    expect(result.success).toBe(true);
    expect(result.method).toBe('ball');
    expect(result.challenge).toBe('ball');
  });

  it('should handle legacy token format (shape field)', async () => {
    const token = makeToken({
      cid: 'test-legacy',
      shape: 'circle',
      score: 0.85,
      verdict: 'human',
      ts: Date.now(),
      ph: 'abc123',
      origin: 'http://localhost',
    });

    const result = await verify(token, SECRET);
    expect(result.success).toBe(true);
    expect(result.method).toBe('shape');
    expect(result.challenge).toBe('circle');
  });

  it('should reject a tampered token', async () => {
    const token = makeToken({
      cid: 'test-123',
      method: 'shape',
      challenge: 'circle',
      score: 0.85,
      verdict: 'human',
      ts: Date.now(),
      ph: 'abc123',
      origin: 'http://localhost',
    });

    const parts = token.split('.');
    const tampered = parts[0] + 'X.' + parts[1];
    const result = await verify(tampered, SECRET);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });

  it('should reject an expired token', async () => {
    const token = makeToken({
      cid: 'test-123',
      method: 'shape',
      challenge: 'circle',
      score: 0.85,
      verdict: 'human',
      ts: Date.now() - 6 * 60 * 1000,
      ph: 'abc123',
      origin: 'http://localhost',
    });

    const result = await verify(token, SECRET);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Token expired');
  });

  it('should reject a token signed with wrong key', async () => {
    const token = makeToken({
      cid: 'test-123',
      method: 'shape',
      challenge: 'circle',
      score: 0.85,
      verdict: 'human',
      ts: Date.now(),
      ph: 'abc123',
      origin: 'http://localhost',
    }, 'wrong-key');

    const result = await verify(token, SECRET);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });

  it('should reject empty/invalid input', async () => {
    expect((await verify('', SECRET)).error).toBe('Invalid token');
    expect((await verify('not.a.valid.token', SECRET)).error).toBe('Malformed token');
  });

  it('should correctly report bot verdict', async () => {
    const token = makeToken({
      cid: 'test-123',
      method: 'shape',
      challenge: 'square',
      score: 0.1,
      verdict: 'bot',
      ts: Date.now(),
      ph: 'abc123',
      origin: 'http://localhost',
    });

    const result = await verify(token, SECRET);
    expect(result.success).toBe(false);
    expect(result.verdict).toBe('bot');
  });
});
