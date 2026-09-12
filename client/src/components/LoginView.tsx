import { useState, type FormEvent } from 'react';

interface LoginViewProps {
  onLogin: (u: string, p: string) => Promise<{ ok: boolean; error?: string }>;
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Anna käyttäjätunnus ja salasana');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await onLogin(username.trim(), password);
    if (!res.ok) {
      setError(res.error || 'Kirjautuminen epäonnistui');
      setLoading(false);
    }
  }

  return (
    <div className="app-bg" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div className="card" style={{
        maxWidth: 420,
        width: '100%',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        borderColor: 'rgba(255,255,255,0.12)',
      }}>
        <div className="card-header" style={{ justifyContent: 'center', padding: '24px 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>🏠</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Kotiäly
            </span>
          </div>
        </div>

        <div className="card-body" style={{ padding: '20px 24px 28px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              🔒 Etäkäytön kirjautuminen
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Ulkoverkkoyhteys havaittu. Kirjaudu sisään hallitaksesi lämpöpumpun toimintaa turvallisesti.
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              fontSize: 13,
              marginBottom: 16,
              textAlign: 'center',
            }}>
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Käyttäjätunnus
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Salasana
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>✓</span>
              <span>Kirjautuminen tallennetaan selaimeen (365 pv)</span>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                marginTop: 10,
                padding: '12px',
                fontSize: 14,
                fontWeight: 600,
                width: '100%',
                justifyContent: 'center',
              }}
            >
              {loading ? 'Kirjaudutaan…' : 'Kirjaudu sisään →'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
            Lähiverkosta (LAN) yhdistettäessä kirjautumista ei kysytä.
          </div>
        </div>
      </div>
    </div>
  );
}
