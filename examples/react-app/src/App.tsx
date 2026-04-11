import { useState } from 'react';
import { OOSevenCaptcha } from '@007captcha/react';

interface VerifyResult {
  success: boolean;
  score: number;
  method: string;
  verdict: string;
  error?: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [key, setKey] = useState(0);

  const handleSuccess = (t: string) => {
    setToken(t);
    setResult(null);
  };

  const handleFailure = () => {
    setToken(null);
    setResult(null);
  };

  const handleVerify = async () => {
    if (!token) return;
    setVerifying(true);
    try {
      const res = await fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setResult(await res.json());
    } catch {
      setResult({ success: false, score: 0, method: '', verdict: 'bot', error: 'Network error' });
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = () => {
    setToken(null);
    setResult(null);
    setKey((k) => k + 1);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>007captcha + React</h1>
        <p style={styles.subtitle}>
          Follow the ball with your cursor, then click Verify.
        </p>

        <OOSevenCaptcha
          key={key}
          siteKey="demo-site-key-change-me"
          serverUrl={window.location.origin}
          onSuccess={handleSuccess}
          onFailure={handleFailure}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={handleVerify}
            disabled={!token || verifying}
            style={{
              ...styles.verifyBtn,
              opacity: !token || verifying ? 0.4 : 1,
              cursor: !token || verifying ? 'not-allowed' : 'pointer',
            }}
          >
            {verifying ? 'Verifying...' : 'Verify'}
          </button>
          <button onClick={handleReset} style={styles.resetBtn}>Reset</button>
        </div>

        {result && (
          <pre
            style={{
              ...styles.result,
              background: result.success ? '#ecfdf5' : '#fef2f2',
              borderColor: result.success ? '#a7f3d0' : '#fecaca',
              color: result.success ? '#065f46' : '#991b1b',
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f3f4f6',
    display: 'flex',
    justifyContent: 'center',
    padding: '48px 16px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  card: {
    background: '#fff',
    padding: 32,
    borderRadius: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)',
    width: '100%',
    maxWidth: 580,
    alignSelf: 'flex-start',
  },
  title: { fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4, color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', margin: 0, marginBottom: 24 },
  verifyBtn: {
    flex: 1,
    background: '#111827',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
  },
  resetBtn: {
    background: '#fff',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  result: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    border: '1px solid',
  },
};
