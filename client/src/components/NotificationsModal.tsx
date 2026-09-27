import { useState } from 'react';
import { useNotifications } from '../hooks/useNotifications';

interface NotificationsModalProps {
  onClose: () => void;
}

export function NotificationsModal({ onClose }: NotificationsModalProps) {
  const {
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
    refreshHistory,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<'alerts' | 'telegram' | 'history'>('alerts');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [tgToken, setTgToken] = useState<string>('');
  const [tgChatId, setTgChatId] = useState<string>('');
  const [savingTg, setSavingTg] = useState(false);

  // Sync telegram local fields when settings load
  useState(() => {
    if (settings) {
      setTgToken(settings.telegram_bot_token || '');
      setTgChatId(settings.telegram_chat_id || '');
    }
  });

  const handleToggleSub = async () => {
    setTestResult(null);
    if (isSubscribed) {
      await unsubscribe();
    } else {
      const ok = await subscribe();
      if (!ok && permission === 'denied') {
        alert('Ilmoitukset on estetty selaimen asetuksissa. Salli ilmoitukset selaimen osoitepalkin lukkokuvakkeesta.');
      }
    }
  };

  const handleTestNotification = async () => {
    setTestResult('Lähetetään...');
    const res = await sendTest();
    if (res.ok) {
      setTestResult('✅ Testi-ilmoitus lähetetty onnistuneesti!');
    } else {
      setTestResult(`❌ Lähetys epäonnistui: ${res.error || 'Tuntematon virhe'}`);
    }
  };

  const handleToggleSetting = async (key: string, currentValue: string) => {
    const nextVal = currentValue === 'true' ? 'false' : 'true';
    await updateSettings({ [key]: nextVal });
  };

  const handleSaveTelegram = async () => {
    setSavingTg(true);
    await updateSettings({
      telegram_bot_token: tgToken,
      telegram_chat_id: tgChatId,
    });
    setSavingTg(false);
    setTestResult('✅ Telegram-asetukset tallennettu!');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 640, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🔔</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Hälytykset & Push-ilmoitukset</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Reaaliaikaiset ilmoitukset selaimeen, puhelimeen ja Telegramiin
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              color: 'var(--text-primary)',
              width: 32,
              height: 32,
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Push Subscription Banner */}
        <div
          style={{
            background: isSubscribed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(249, 115, 22, 0.12)',
            border: `1px solid ${isSubscribed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(249, 115, 22, 0.3)'}`,
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22 }}>{isSubscribed ? '📱' : '🔕'}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {isSubscribed ? 'Web Push -ilmoitukset päällä tällä laitteella' : 'Ota Web Push -ilmoitukset käyttöön'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {isSubscribed
                  ? 'Saat hälytykset suoraan selaimeesi tai lukitusnäytölle.'
                  : isSupported
                  ? 'Salli ilmoitukset vastaanottaaksesi vesivuoto- ja laitehälytykset.'
                  : 'Selaimesi ei tue suoraa Web Push -rajapintaa.'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {isSubscribed && (
              <button
                type="button"
                onClick={handleTestNotification}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                🧪 Testaa
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleSub}
              disabled={loading || !isSupported}
              style={{
                background: isSubscribed ? 'rgba(239, 68, 68, 0.2)' : 'var(--heat-primary, #f97316)',
                border: isSubscribed ? '1px solid rgba(239, 68, 68, 0.4)' : 'none',
                color: isSubscribed ? '#fca5a5' : '#fff',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: 8,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? 'Käsitellään...' : isSubscribed ? 'Poista käytöstä' : 'Ota käyttöön'}
            </button>
          </div>
        </div>

        {testResult && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: testResult.startsWith('✅') ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            {testResult}
          </div>
        )}

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            background: 'rgba(255,255,255,0.04)',
            padding: 4,
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'alerts' ? 'var(--heat-primary, #f97316)' : 'transparent',
              color: activeTab === 'alerts' ? '#fff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ⚡ Hälytyskategoriat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('telegram')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'telegram' ? 'var(--heat-primary, #f97316)' : 'transparent',
              color: activeTab === 'telegram' ? '#fff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ✈️ Telegram Bot
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              refreshHistory();
            }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'history' ? 'var(--heat-primary, #f97316)' : 'transparent',
              color: activeTab === 'history' ? '#fff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            📜 Historia ({history.length})
          </button>
        </div>

        {/* TAB 1: Alert Categories */}
        {activeTab === 'alerts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <AlertToggleRow
              icon="🚨"
              title="Vesivuotovahdit (Kriittinen)"
              description="Hälyttää heti, jos Tuya-vuotoanturi laukeaa teknisessä tilassa, keittiössä, tiskikoneen alla tai wc:ssä."
              enabled={settings?.leak_alerts_enabled === 'true'}
              onToggle={() => handleToggleSetting('leak_alerts_enabled', settings?.leak_alerts_enabled || 'true')}
            />

            <AlertToggleRow
              icon="⚠️"
              title="Lämpöpumpun vikailmoitukset"
              description="Ilmoittaa Panasonic VILP:n vikakoodeista (H-virheet) ja toimintahäiriöistä."
              enabled={settings?.heatpump_alerts_enabled === 'true'}
              onToggle={() => handleToggleSetting('heatpump_alerts_enabled', settings?.heatpump_alerts_enabled || 'true')}
            />

            <AlertToggleRow
              icon="⚡"
              title="Käyttöveden sähkövastusvaroitus"
              description="Varoittaa, jos käyttövesi lämpiää suoralla vastuksella (COP 1.00) yli 45 min leudoilla säillä."
              enabled={settings?.dhw_heater_alerts_enabled === 'true'}
              onToggle={() => handleToggleSetting('dhw_heater_alerts_enabled', settings?.dhw_heater_alerts_enabled || 'true')}
            />

            <AlertToggleRow
              icon="🧖"
              title="Sauna lämmin"
              description="Ilmoittaa puhelimeen, kun kiuas on lämmittänyt saunan tavoitelämpötilaan (60 °C)."
              enabled={settings?.sauna_alerts_enabled === 'true'}
              onToggle={() => handleToggleSetting('sauna_alerts_enabled', settings?.sauna_alerts_enabled || 'true')}
            />

            <AlertToggleRow
              icon="❄️"
              title="Pakkas- ja jäätymisvahti"
              description="Hälyttää, jos teknisen tilan tai sisätilojen lämpötila laskee alle 10 °C."
              enabled={settings?.freeze_alerts_enabled === 'true'}
              onToggle={() => handleToggleSetting('freeze_alerts_enabled', settings?.freeze_alerts_enabled || 'true')}
            />

            <AlertToggleRow
              icon="☀️"
              title="Päivittäinen aamukatsaus (klo 07:30)"
              description="Yhteenveto eilisestä sähkönkulutuksesta, COP:sta ja säästöistä sekä kuluvan päivän halvimmasta sähköstä."
              enabled={settings?.daily_report_enabled === 'true'}
              onToggle={() => handleToggleSetting('daily_report_enabled', settings?.daily_report_enabled || 'true')}
            />
          </div>
        )}

        {/* TAB 2: Telegram Bot Integration */}
        {activeTab === 'telegram' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: 10,
                padding: '12px 14px',
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              <strong>💡 Telegram Bot Kaksoisjakelu:</strong> Voit vastaanottaa hälytykset myös suoraan omaan Telegram-chattiin luomalla oman botin (@BotFather) ja asettamalla sen tunnisteet tähän.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Telegram Bot Token:
              </label>
              <input
                type="text"
                placeholder="esim. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border)',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Telegram Chat ID:
              </label>
              <input
                type="text"
                placeholder="esim. 987654321"
                value={tgChatId}
                onChange={(e) => setTgChatId(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border)',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <AlertToggleRow
                icon="✈️"
                title="Ota Telegram-lähetys käyttöön"
                description="Lähettää hälytykset Telegram-kanavaan."
                enabled={settings?.telegram_enabled === 'true'}
                onToggle={() => handleToggleSetting('telegram_enabled', settings?.telegram_enabled || 'false')}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                type="button"
                onClick={handleSaveTelegram}
                disabled={savingTg}
                style={{
                  background: 'var(--heat-primary, #f97316)',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {savingTg ? 'Tallennetaan...' : 'Tallenna Telegram-asetukset'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: History */}
        {activeTab === 'history' && (
          <div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                Ei vielä lähetettyjä hälytyksiä historiassa.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                {history.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${
                        item.severity === 'critical'
                          ? 'rgba(239,68,68,0.3)'
                          : item.severity === 'warning'
                          ? 'rgba(245,158,11,0.3)'
                          : 'rgba(255,255,255,0.08)'
                      }`,
                      borderRadius: 8,
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: item.severity === 'critical' ? '#fca5a5' : '#fff' }}>
                        {item.title}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(item.created_at).toLocaleString('fi-FI')}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface AlertToggleRowProps {
  icon: string;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

function AlertToggleRow({ icon, title, description, enabled, onToggle }: AlertToggleRowProps) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: '10px 14px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3 }}>{description}</div>
        </div>
      </div>
      <div
        style={{
          width: 40,
          height: 22,
          borderRadius: 12,
          background: enabled ? 'var(--heat-primary, #f97316)' : 'rgba(255,255,255,0.15)',
          position: 'relative',
          transition: 'background 0.2s ease',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: 3,
            left: enabled ? 21 : 3,
            transition: 'left 0.2s ease',
          }}
        />
      </div>
    </div>
  );
}
