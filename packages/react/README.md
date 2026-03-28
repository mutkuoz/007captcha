# @007captcha/react

React component wrapper for 007captcha.

## Installation

```bash
pnpm add @007captcha/client @007captcha/react
```

## Usage

```tsx
import { OOSevenCaptcha } from '@007captcha/react';

function MyForm() {
  const handleSuccess = (token: string) => {
    fetch('/api/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  };

  return (
    <form>
      <OOSevenCaptcha
        siteKey="your-site-key"
        method="ball"
        serverUrl={window.location.origin}
        onSuccess={handleSuccess}
      />
      <button type="submit">Submit</button>
    </form>
  );
}
```

## Props

All props from `CaptchaConfig` (except `container`, which is managed internally), plus `className`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `siteKey` | `string` | required | Your site key |
| `method` | `'random' \| 'shape' \| 'maze' \| 'ball'` | `'random'` | Challenge method |
| `serverUrl` | `string` | — | Server URL (required for `'ball'`) |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Color theme |
| `timeLimit` | `number` | varies | Max time in ms |
| `className` | `string` | — | CSS class for the wrapper div |
| `onSuccess` | `(token: string) => void` | — | Called when challenge passes |
| `onFailure` | `(error: Error) => void` | — | Called when challenge fails |
| `onExpired` | `() => void` | — | Called when token expires |

## License

MIT
