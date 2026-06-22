import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const GATE_ORDER = Array.from({ length: 9 }, (_, i) => `g${i}`);

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [sensor, setSensor] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const dash = await api.getDashboard(sensor || undefined);
      setData(dash);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sensor]);

  useEffect(() => {
    api.getConfig().then((c) => setSensor(c.selected_sensor || ''));
  }, []);

  useEffect(() => {
    if (!sensor) {
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh();
    if (!autoRefresh) return undefined;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [sensor, autoRefresh, refresh]);

  const sample = data?.sample;
  const grouped = data?.grouped || {};
  const bundle = data?.bundle;

  return (
    <div>
      <h1 className="page-title">Sensor Dashboard</h1>
      <p className="page-subtitle">
        Live view of all LD2410 sensor data from Home Assistant.
      </p>

      {!sensor && (
        <div className="alert alert-error">
          No sensor selected. <Link to="/sensors">Select a sensor</Link> first.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {sensor && (
        <div className="alert alert-info">
          Monitoring: <code style={{ fontFamily: 'var(--mono)' }}>{sensor}</code>
          {data?.updated_at && (
            <span style={{ marginLeft: '1rem', opacity: 0.8 }}>
              Updated {new Date(data.updated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      <div className="form-row" style={{ marginBottom: '1rem' }}>
        <button className="btn btn-secondary" onClick={refresh} disabled={loading || !sensor}>
          {loading ? 'Loading…' : 'Refresh now'}
        </button>
        <label className="toggle-row" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh (2s)
        </label>
      </div>

      {sample && (
        <div className="dashboard-stats">
          <StatCard
            label="Engineering Mode"
            value={sample.engineering_mode == null ? '—' : sample.engineering_mode ? 'ON' : 'OFF'}
            highlight={sample.engineering_mode ? 'motion' : 'still'}
          />
          <StatCard
            label="Motion"
            value={sample.motion ? 'Detected' : 'None'}
            highlight={sample.motion ? 'motion' : 'still'}
          />
          <StatCard
            label="Distance"
            value={sample.distance != null ? `${sample.distance} cm` : '—'}
          />
          <StatCard
            label="Gates reporting"
            value={Object.keys(sample.gates || {}).length}
          />
        </div>
      )}

      {sample?.gates && Object.keys(sample.gates).length > 0 && (
        <div className="card">
          <h2>Gate Energy (live)</h2>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Gate</th>
                  <th>Move energy</th>
                  <th>Still energy</th>
                </tr>
              </thead>
              <tbody>
                {GATE_ORDER.filter((g) => sample.gates[g]).map((g) => (
                  <tr key={g}>
                    <td><strong>{g}</strong></td>
                    <td>{sample.gates[g].move ?? '—'}</td>
                    <td>{sample.gates[g].still ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {grouped.number?.length > 0 && (
        <div className="card">
          <h2>Thresholds &amp; Config (number entities)</h2>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Entity</th>
                  <th>Value</th>
                  <th>Range</th>
                </tr>
              </thead>
              <tbody>
                {grouped.number.map((e) => (
                  <tr key={e.entity_id}>
                    <td>{e.friendly_name}</td>
                    <td className="mono-cell">{e.entity_id}</td>
                    <td><strong>{e.state}</strong>{e.unit ? ` ${e.unit}` : ''}</td>
                    <td>{e.min != null ? `${e.min}–${e.max}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {grouped.binary_sensor?.length > 0 && (
        <EntitySection title="Binary sensors" rows={grouped.binary_sensor} />
      )}

      {grouped.sensor?.length > 0 && (
        <EntitySection title="Sensors" rows={grouped.sensor} />
      )}

      {grouped.switch?.length > 0 && (
        <EntitySection title="Switches" rows={grouped.switch} />
      )}

      {bundle && (
        <div className="card">
          <h2>Device info</h2>
          <div className="meta-grid">
            <Meta label="Device prefix" value={bundle.device_prefix} />
            <Meta label="Engineering switch" value={bundle.engineering_mode_switch?.entity_id} />
            <Meta label="Detection distance" value={bundle.detection_distance} />
            <Meta label="Moving target" value={bundle.moving_target} />
            <Meta label="Still target" value={bundle.still_target} />
            <Meta label="Gate data available" value={bundle.gate_data_available ? 'Yes' : 'No'} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }) {
  return (
    <div className={`stat-card ${highlight || ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function EntitySection({ title, rows }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Entity</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.entity_id}>
                <td>{e.friendly_name}</td>
                <td className="mono-cell">{e.entity_id}</td>
                <td>
                  <span className={`status-dot ${['on', 'detected', 'occupied'].includes(String(e.state).toLowerCase()) ? 'on' : 'off'}`} />
                  <strong>{e.state}</strong>
                  {e.unit ? ` ${e.unit}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div className="meta-item">
      <div className="meta-label">{label}</div>
      <div className="meta-value">{value || '—'}</div>
    </div>
  );
}
