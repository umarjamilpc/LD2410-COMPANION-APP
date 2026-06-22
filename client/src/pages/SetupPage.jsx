import { useState, useEffect } from 'react';
import { useAppConfig } from '../AppConfigContext';

export default function SetupPage() {
  const { config, connectionStatus, saveConfig, checkConnection } = useAppConfig();
  const [haUrl, setHaUrl] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!config) return;
    setHaUrl(config.ha_url || '');
  }, [config]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const body = { ha_url: haUrl };
      if (token) body.token = token;
      await saveConfig(body);
      setToken('');
      setMessage({ type: 'success', text: 'Configuration saved to local storage (persists across restarts).' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMessage(null);
    try {
      if (haUrl || token) {
        const body = { ha_url: haUrl };
        if (token) body.token = token;
        await saveConfig(body);
        setToken('');
      }
      const result = await checkConnection();
      if (result?.connected) {
        setMessage({
          type: 'success',
          text: `Connected to ${result.location_name} (HA ${result.version})`,
        });
      } else {
        setMessage({ type: 'error', text: result?.error || 'Connection failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setTesting(false);
    }
  }

  const last = config?.last_connection;

  return (
    <div>
      <h1 className="page-title">Home Assistant</h1>
      <p className="page-subtitle">
        Connect to Home Assistant. URL and token are saved locally in{' '}
        <code style={{ fontFamily: 'var(--mono)' }}>data/store.json</code> and restored after restarts.
        Sensor choice is session-only and is not stored here.
      </p>

      {message && (
        <div className={`alert alert-${message.type === 'success' ? 'success' : 'error'}`}>
          {message.text}
        </div>
      )}

      {config?.ha_url && config?.token_set && (
        <div className={`alert alert-${connectionStatus?.connected ? 'success' : 'info'}`}>
          <strong>Saved connection:</strong> {config.ha_url}
          {connectionStatus?.connected && connectionStatus.location_name && (
            <> · {connectionStatus.location_name}</>
          )}
          {last?.at && (
            <span style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.85rem', opacity: 0.9 }}>
              Last verified: {new Date(last.at).toLocaleString()}
              {last.ok ? ` · HA ${last.version}` : last.error ? ` · ${last.error}` : ''}
            </span>
          )}
        </div>
      )}

      <div className="card">
        <h2>Connection</h2>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="ha_url">Home Assistant URL</label>
            <input
              id="ha_url"
              type="url"
              placeholder="http://homeassistant.local:8123"
              value={haUrl}
              onChange={(e) => setHaUrl(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="token">Long-Lived Access Token</label>
            <input
              id="token"
              type="password"
              placeholder={config?.token_set ? `Saved: ${config.token_preview}` : 'Paste your token'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            {config?.token_set && !token && (
              <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Token is saved — leave blank to keep it, or paste a new one to replace
              </small>
            )}
          </div>
          <div className="form-row">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={testing}>
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Quick start</h2>
        <ol style={{ paddingLeft: '1.25rem', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.8 }}>
          <li>Create a long-lived access token in Home Assistant → Profile → Security</li>
          <li>Enter your HA URL and token above, then save</li>
          <li>Pick a <strong>radar target</strong> sensor on <strong>Sensors</strong> or any workflow page</li>
          <li>Use <strong>Comparison</strong> to tune thresholds against live gate energy</li>
          <li>Run <strong>Calibration</strong> with an empty room, then apply on <strong>Thresholds</strong></li>
          <li>Use <strong>Backups</strong> to export or restore profiles; customize the UI under <strong>Themes</strong></li>
        </ol>
      </div>
    </div>
  );
}
