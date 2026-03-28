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
        theme="light"
        onSuccess={handleSuccess}
      />
      <button type="submit">Submit</button>
    </form>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `siteKey` | `string` | required | Your site key |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Color theme |
| `timeLimit` | `number` | `10000` | Time limit in ms |
| `className` | `string` | — | CSS class for the container div |
| `onSuccess` | `(token: string) => void` | — | Called on successful verification |
| `onFailure` | `(error: Error) => void` | — | Called on failed verification |

## License

MIT
