# @007captcha/server

Server-side token verification for 007captcha. Zero dependencies — uses only Node.js built-in `crypto`.

## Installation

```bash
pnpm add @007captcha/server
```

## Usage

```typescript
import { verify } from '@007captcha/server';

const result = await verify(token, 'your-site-key');

if (result.success) {
  console.log('Score:', result.score);    // 0.0 - 1.0
  console.log('Verdict:', result.verdict); // 'human' | 'uncertain' | 'bot'
  console.log('Shape:', result.shape);     // 'circle' | 'triangle' | 'square'
}
```

## API

### `verify(token: string, secretKey: string): Promise<VerifyResult>`

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | `true` if verdict is not `'bot'` and signature is valid |
| `score` | `number` | Humanity score from 0.0 (bot) to 1.0 (human) |
| `shape` | `ShapeType` | Which shape was drawn |
| `verdict` | `string` | `'human'`, `'uncertain'`, or `'bot'` |
| `timestamp` | `number` | When the challenge was completed |
| `error` | `string?` | Error message if verification failed |

Tokens expire after 5 minutes.

## License

MIT
