import { createHmac, timingSafeEqual } from 'crypto';
import type { TokenPayload, VerifyResult } from './types';

function base64urlDecode(str: string): Buffer {
  let padded = str.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) padded += '=';
  return Buffer.from(padded, 'base64');
}

function base64urlEncode(data: Buffer): string {
  return data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const TOKEN_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export async function verify(token: string, secretKey: string): Promise<VerifyResult> {
  const fail = (error: string): VerifyResult => ({
    success: false,
    score: 0,
    method: 'ball',
    challenge: '',
    verdict: 'bot',
    timestamp: 0,
    error,
  });

  if (!token || typeof token !== 'string') return fail('Invalid token');

  const parts = token.split('.');
  if (parts.length !== 2) return fail('Malformed token');

  const [payloadB64, signatureB64] = parts;

  // Verify HMAC signature
  const expectedSig = base64urlEncode(
    createHmac('sha256', secretKey).update(payloadB64).digest()
  );

  const sigBuffer = Buffer.from(signatureB64);
  const expectedBuffer = Buffer.from(expectedSig);

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return fail('Invalid signature');
  }

  // Parse payload
  let payload: TokenPayload;
  try {
    const json = base64urlDecode(payloadB64).toString('utf-8');
    payload = JSON.parse(json);
  } catch {
    return fail('Invalid payload');
  }

  // Validate timestamp freshness
  const age = Date.now() - payload.ts;
  if (age > TOKEN_MAX_AGE_MS || age < -60000) {
    return fail('Token expired');
  }

  return {
    success: payload.verdict !== 'bot',
    score: payload.score,
    method: 'ball',
    challenge: payload.challenge ?? '',
    verdict: payload.verdict,
    timestamp: payload.ts,
  };
}
