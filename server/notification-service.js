const webpush = require('web-push');
const db = require('./db');

class NotificationService {
  constructor() {
    this.wsClients = null; // Injected from index.js
    this.vapidPublicKey = null;
    this.vapidPrivateKey = null;
    this.initVapid();
  }

  setWsClients(clients) {
    this.wsClients = clients;
  }

  initVapid() {
    const settings = db.getNotificationSettings();
    let pub = settings.vapid_public_key;
    let priv = settings.vapid_private_key;

    if (!pub || !priv) {
      console.log('[NotificationService] Generating new VAPID keys for Web Push...');
      const keys = webpush.generateVAPIDKeys();
      pub = keys.publicKey;
      priv = keys.privateKey;
      db.updateNotificationSetting('vapid_public_key', pub);
      db.updateNotificationSetting('vapid_private_key', priv);
    }

    this.vapidPublicKey = pub;
    this.vapidPrivateKey = priv;

    let email = process.env.VAPID_EMAIL;
    if (!email) {
      const user = process.env.HERRFORS_USERNAME || process.env.TAPO_USERNAME || process.env.ADMIN_EMAIL;
      if (user) {
        const cleanUser = user.replace(/["']/g, '').trim();
        email = cleanUser.startsWith('mailto:') ? cleanUser : `mailto:${cleanUser}`;
      } else {
        email = 'mailto:notifications@kotialy.app';
      }
    }

    webpush.setVapidDetails(email, this.vapidPublicKey, this.vapidPrivateKey);
    console.log(`[NotificationService] VAPID initialized successfully with subject ${email}. Public key ready.`);
  }

  getPublicKey() {
    return this.vapidPublicKey;
  }

  /**
   * Send notification via Web Push, Telegram (if configured), and WebSocket
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.body
   * @param {string} [options.url]
   * @param {string} [options.type] - e.g. 'leak', 'heatpump', 'dhw', 'sauna', 'freeze', 'daily_report', 'general'
   * @param {string} [options.severity] - 'info' | 'warning' | 'critical'
   */
  async sendNotification({ title, body, url = '/', type = 'general', severity = 'info' }) {
    console.log(`[NotificationService] Sending notification [${severity.toUpperCase()}] (${type}): ${title} - ${body}`);

    // 1. Record in DB History
    try {
      db.addNotificationHistory({ type, title, body, severity });
    } catch (err) {
      console.error('[NotificationService] Failed to save notification history:', err.message);
    }

    // 2. Broadcast via WebSocket to connected browser tabs
    if (this.wsClients && this.wsClients.size > 0) {
      const wsPayload = JSON.stringify({
        type: 'notification',
        notification: {
          id: Date.now(),
          type,
          title,
          body,
          severity,
          url,
          timestamp: Date.now(),
        },
      });
      for (const client of this.wsClients) {
        if (client.readyState === 1 && client.isAuth) {
          try {
            client.send(wsPayload);
          } catch {}
        }
      }
    }

    // Check if notifications are globally enabled
    const settings = db.getNotificationSettings();
    if (settings.notifications_enabled === 'false') {
      console.log('[NotificationService] Notifications are disabled in settings. Skipping push/telegram.');
      return { webPushSent: 0, telegramSent: false };
    }

    // 3. Dispatch Web Push
    const subscriptions = db.getPushSubscriptions();
    let webPushSent = 0;

    const payload = JSON.stringify({
      title,
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: {
        url,
        type,
        severity,
        timestamp: Date.now(),
      },
    });

    const pushPromises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys_p256dh,
          auth: sub.keys_auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payload, {
          TTL: 86400, // 24 hours
          urgency: severity === 'critical' ? 'high' : 'normal',
        });
        db.updatePushSubscriptionUsed(sub.endpoint);
        webPushSent++;
      } catch (err) {
        // 410 Gone or 404 Not Found: subscription is expired/unregistered
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[NotificationService] Subscription expired (${err.statusCode}), removing: ${sub.endpoint.slice(0, 30)}...`);
          db.deletePushSubscription(sub.endpoint);
        } else {
          console.error(`[NotificationService] Push delivery error (${err.statusCode || err.message})`);
        }
      }
    });

    await Promise.allSettled(pushPromises);

    // 4. Send Telegram message if enabled
    let telegramSent = false;
    const tgToken = settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;
    const tgChatId = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;
    const tgEnabled = settings.telegram_enabled === 'true' || (Boolean(tgToken) && Boolean(tgChatId) && settings.telegram_enabled !== 'false');

    if (tgEnabled && tgToken && tgChatId) {
      try {
        const severityEmoji = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
        const tgText = `${severityEmoji} *${title}*\n\n${body}`;

        const tgUrl = `https://api.telegram.org/bot${tgToken}/sendMessage`;
        const res = await fetch(tgUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            text: tgText,
            parse_mode: 'Markdown',
          }),
        });

        if (res.ok) {
          telegramSent = true;
          console.log('[NotificationService] Telegram message sent successfully.');
        } else {
          const errText = await res.text();
          console.error('[NotificationService] Telegram send failed:', errText);
        }
      } catch (tgErr) {
        console.error('[NotificationService] Telegram request error:', tgErr.message);
      }
    }

    return { webPushSent, telegramSent };
  }
}

module.exports = new NotificationService();
