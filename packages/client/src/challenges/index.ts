import type { ChallengeMethod } from '../types';
import type { ChallengeInstance } from '../challenge';
import { ShapeChallenge } from './shape';
import { MazeChallenge } from './maze';
import { BallChallenge } from './ball';

const ALL_METHODS: ChallengeMethod[] = ['shape', 'maze', 'ball'];

export interface CreateChallengeOptions {
  serverUrl?: string;
  siteKey?: string;
}

export function createChallenge(
  method: ChallengeMethod | 'random',
  options: CreateChallengeOptions = {},
): ChallengeInstance {
  if (!options.serverUrl) {
    throw new Error('007captcha: serverUrl is required for all challenge methods');
  }

  const pool = method === 'random' ? ALL_METHODS : [method];
  const resolved = pool.length > 1
    ? pool[Math.floor(Math.random() * pool.length)]
    : pool[0];

  switch (resolved) {
    case 'shape':
      return new ShapeChallenge(options.serverUrl, options.siteKey || '');
    case 'maze':
      return new MazeChallenge(options.serverUrl, options.siteKey || '');
    case 'ball':
      return new BallChallenge(options.serverUrl, options.siteKey || '');
    default:
      return new ShapeChallenge(options.serverUrl, options.siteKey || '');
  }
}
