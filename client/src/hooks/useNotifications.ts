import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export interface NotificationSettings {
  notifications_enabled: string;
  leak_alerts_enabled: string;
  heatpump_alerts_enabled: string;
  dhw_heater_alerts_enabled: string;
  sauna_alerts_enabled: string;
  freeze_alerts_enabled: string;
  daily_report_enabled: string;
  daily_report_time: string;
  telegram_enabled: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
}

export interface NotificationHistoryItem {
  id: number;
  type: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  created_at: number;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Initialize service worker & check subscription state
  useEffect(() => {
    const checkSupport = async () => {
      if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
        setIsSupported(true);
        setPermission(Notification.permission);

        try {
          const reg = await navigator.serviceWorker.register('/sw.js');
          setSwRegistration(reg);

          const sub = await reg.pushManager.getSubscription();
          setIsSubscribed(Boolean(sub));
        } catch (err) {
          console.error('[Push] SW registration error:', err);
        }
      }
    };

    checkSupport();
  }, []);

  // Fetch settings & history
  const loadSettingsAndHistory = useCallback(async () => {
    try {
      const [resSettings, resHistory] = await Promise.all([
        apiFetch('/api/notifications/settings'),
        apiFetch('/api/notifications/history?limit=30'),
      ]);

      if (resSettings.ok) {
        const data = await resSettings.json();
        setSettings(data);
      }
      if (resHistory.ok) {
        const data = await resHistory.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('[Notifications] Failed to load settings:', err);
    }
  }, []);

  useEffect(() => {
    loadSettingsAndHistory();
  }, [loadSettingsAndHistory]);

  // Subscribe this browser to Push
  const subscribe = async (): Promise<boolean> => {
    if (!swRegistration) {
      console.error('[Push] No SW registration');
      return false;
    }

    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setLoading(false);
        return false;
      }

      // 1. Get VAPID public key
      const keyRes = await apiFetch('/api/push/public-key');
      if (!keyRes.ok) throw new Error('Failed to get VAPID key');
      const { publicKey } = await keyRes.json();

      // 2. Subscribe via pushManager
      const convertedKey = urlBase64ToUint8Array(publicKey);
      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });

      // 3. Send subscription to server
      const saveRes = await apiFetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        }),
      });

      if (saveRes.ok) {
        setIsSubscribed(true);
        setLoading(false);
        return true;
      }
      throw new Error('Failed to save push subscription on server');
    } catch (err) {
      console.error('[Push] Subscription failed:', err);
      setLoading(false);
      return false;
    }
  };

  // Unsubscribe this browser from Push
  const unsubscribe = async (): Promise<boolean> => {
    if (!swRegistration) return false;

    setLoading(true);
    try {
      const sub = await swRegistration.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await apiFetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      setIsSubscribed(false);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('[Push] Unsubscribe error:', err);
      setLoading(false);
      return false;
    }
  };

  // Send a test notification
  const sendTest = async (): Promise<{ ok: boolean; webPushSent?: number; telegramSent?: boolean; error?: string }> => {
    try {
      const res = await apiFetch('/api/push/test', { method: 'POST' });
      const data = await res.json();
      await loadSettingsAndHistory();
      return { ok: res.ok, webPushSent: data.webPushSent, telegramSent: data.telegramSent, error: data.error };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  // Update notification settings
  const updateSettings = async (updates: Partial<NotificationSettings>) => {
    try {
      const res = await apiFetch('/api/notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        return true;
      }
    } catch (err) {
      console.error('[Notifications] Failed to update settings:', err);
    }
    return false;
  };

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    settings,
    history,
    subscribe,
    unsubscribe,
    sendTest,
    updateSettings,
    refreshHistory: loadSettingsAndHistory,
  };
}
