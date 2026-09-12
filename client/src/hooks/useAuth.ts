import { useState, useEffect, useCallback } from 'react';

const TOKEN_KEY = 'kotialy_auth_token';
const USERNAME_KEY = 'kotialy_auth_user';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string, username?: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    if (username) localStorage.setItem(USERNAME_KEY, username);
  } catch {
    // ignore
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  } catch {
    // ignore
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type UserRole = 'admin' | 'viewer';

export interface UseAuthReturn {
  isLocal: boolean;
  authenticated: boolean;
  username: string | null;
  role: UserRole;
  loading: boolean;
  login: (u: string, p: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  checkStatus: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [isLocal, setIsLocal] = useState<boolean>(true); // default optimistic LAN
  const [authenticated, setAuthenticated] = useState<boolean>(true);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>('admin');
  const [loading, setLoading] = useState<boolean>(true);

  const checkStatus = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch('/api/auth/status', { headers });
      if (res.ok) {
        const data = await res.json();
        setIsLocal(Boolean(data.isLocal));
        setAuthenticated(Boolean(data.authenticated));
        setUsername(data.username || (data.isLocal ? 'Lähiverkko' : null));
        setRole(data.role || (data.isLocal ? 'admin' : 'viewer'));
        if (!data.authenticated && !data.isLocal) {
          clearStoredToken();
        }
      }
    } catch {
      // Offline / network failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const login = useCallback(async (u: string, p: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Kirjautuminen epäonnistui' };
      }

      setStoredToken(data.token, data.username);
      setAuthenticated(true);
      setUsername(data.username);
      setRole(data.role || 'admin');
      setIsLocal(Boolean(data.isLocal));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Yhteysvirhe' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      clearStoredToken();
      setAuthenticated(false);
      setUsername(null);
      setRole('viewer');
      checkStatus();
    }
  }, [checkStatus]);

  return {
    isLocal,
    authenticated,
    username,
    role,
    loading,
    login,
    logout,
    checkStatus,
  };
}
