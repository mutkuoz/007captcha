import type { ChallengeMethod } from '../types';
import type { ChallengeInstance } from '../challenge';
import { ShapeChallenge } from './shape';
import { MazeChallenge } from './maze';
import { BallChallenge } from './ball';

/** Methods that don't require a server connection */
const CLIENT_ONLY_METHODS: ChallengeMethod[] = ['shape', 'maze'];
const ALL_METHODS: ChallengeMethod[] = ['shape', 'maze', 'ball'];

export interface CreateChallengeOptions {
  serverUrl?: string;
  siteKey?: string;
}

export function createChallenge(
  method: ChallengeMethod | 'random',
  options: CreateChallengeOptions = {},
): ChallengeInstance {
  // For 'random', only include 'ball' if serverUrl is provided
  const pool = method === 'random'
    ? (options.serverUrl ? ALL_METHODS : CLIENT_ONLY_METHODS)
    : [method];

  const resolved = pool.length > 1
    ? pool[Math.floor(Math.random() * pool.length)]
    : pool[0];

  switch (resolved) {
    case 'shape':
      return new ShapeChallenge();
    case 'maze':
      return new MazeChallenge();
    case 'ball':
      if (!options.serverUrl) {
        throw new Error('007captcha: serverUrl is required for ball challenge');
      }
      return new BallChallenge(options.serverUrl, options.siteKey || '');
    default:
      return new ShapeChallenge();
  }
}
