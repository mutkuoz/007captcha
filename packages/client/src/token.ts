import type { CapturePoint, TokenPayload } from './types';
import { base64urlEncode, hmacSign, sha256 } from './crypto';

const encoder = new TextEncoder();

export async function hashPoints(points: CapturePoint[]): Promise<string> {
  const data = JSON.stringify(points.map(p => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.t)]));
  return sha256(data);
}

export async function createToken(payload: TokenPayload, siteKey: string): Promise<string> {
  const json = JSON.stringify(payload);
  const payloadB64 = base64urlEncode(encoder.encode(json));
  const signature = await hmacSign(payloadB64, siteKey);
  return `${payloadB64}.${signature}`;
}
