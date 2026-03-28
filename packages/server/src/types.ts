export type ShapeType = 'circle' | 'triangle' | 'square';

export interface TokenPayload {
  cid: string;
  shape: ShapeType;
  score: number;
  verdict: 'bot' | 'human' | 'uncertain';
  ts: number;
  ph: string;
  origin: string;
}

export interface VerifyResult {
  success: boolean;
  score: number;
  shape: ShapeType;
  verdict: 'bot' | 'human' | 'uncertain';
  timestamp: number;
  error?: string;
}
