import { useCallback, useRef, useState } from 'react';
import { getAuthHeaders } from './useAuth';

interface UseCommandReturn {
  /** Publish a command. Resolves true when the heat pump accepted it. */
  send: (setTopic: string, value: number, successMsg?: string) => Promise<boolean>;
  pending: boolean;
  error: string | null;
  success: string | null;
}

/**
 * Sends a command to /api/command and tracks pending/error/success state.
 *
 * The server range-checks every value, so a rejection carries a useful
 * message — surface it rather than a generic "command failed".
 */
export function useCommand(): UseCommandReturn {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((setter: (v: string | null) => void, msg: string) => {
    setter(msg);
    if (clearRef.current) clearTimeout(clearRef.current);
    clearRef.current = setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 2500);
  }, []);

  const send = useCallback(async (setTopic: string, value: number, successMsg?: string) => {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ setTopic, value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Command failed (${res.status})`);
      }
      if (successMsg) flash(setSuccess, successMsg);
      return true;
    } catch (err) {
      flash(setError, err instanceof Error ? err.message : 'Command failed');
      return false;
    } finally {
      setPending(false);
    }
  }, [flash]);

  return { send, pending, error, success };
}
