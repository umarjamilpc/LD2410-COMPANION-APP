import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function SensorsPage() {
  const [sensors, setSensors] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [related, setRelated] = useState([]);
  const [bundle, setBundle] = useState(null);

  useEffect(() => {
    loadSensors();
  }, []);

  async function loadSensors() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSensors();
      setSensors(data.sensors || []);
      setSelected(data.selected || '');
      if (data.selected) loadRelated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRelated() {
    try {
      const [rel, bndl] = await Promise.all([
        api.getRelatedEntities(),
        api.getLd2410Bundle(),
      ]);
      setRelated(rel.entities || []);
      setBundle(bndl.bundle);
    } catch {
      setRelated([]);
      setBundle(null);
    }
  }

  async function handleSelect(entity_id) {
    try {
      await api.selectSensor(entity_id);
      setSelected(entity_id);
      await loadRelated();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1 className="page-title">Sensor Discovery</h1>
      <p className="page-subtitle">
        ESPHome LD2410 radar sensors only (devices with Radar Engineering Mode switch).
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-row" style={{ marginBottom: '1rem' }}>
        <button className="btn btn-secondary" onClick={loadSensors} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        {selected && (
          <Link to="/calibration" className="btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Start Calibration →
          </Link>
        )}
      </div>

      <div className="card">
        <h2>Available Sensors ({sensors.length})</h2>
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Fetching entities from Home Assistant…</p>
        ) : sensors.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            No ESPHome LD2410 sensors found. Ensure your device exposes a Radar Engineering Mode switch
            and that Home Assistant is configured on the Setup page.
          </p>
        ) : (
          <div className="sensor-list">
            {sensors.map((s) => (
              <div
                key={s.entity_id}
                className={`sensor-item ${selected === s.entity_id ? 'selected' : ''}`}
                onClick={() => handleSelect(s.entity_id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleSelect(s.entity_id)}
              >
                <div>
                  <div className="name">
                    <span className={`status-dot ${s.state === 'on' ? 'on' : 'off'}`} />
                    {s.friendly_name}
                  </div>
                  <div className="entity-id">{s.entity_id}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 600 }}>{s.state}</div>
                  {s.device_class && (
                    <div style={{ color: 'var(--text-muted)' }}>{s.device_class}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && bundle && (
        <div className="card">
          <h2>LD2410 Device</h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span className={`live-badge ${bundle.engineering_mode_on ? 'motion' : 'still'}`}>
              Engineering mode: {bundle.engineering_mode_on ? 'ON' : 'OFF'}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Prefix: <code style={{ fontFamily: 'var(--mono)' }}>{bundle.device_prefix}</code>
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Gate sensors: {Object.keys(bundle.gate_sensors || {}).length}
            </span>
          </div>
          {bundle.engineering_mode_switch && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Switch: <code style={{ fontFamily: 'var(--mono)' }}>{bundle.engineering_mode_switch.entity_id}</code>
              {' — '}gate energy is {bundle.gate_data_available ? 'available' : 'unavailable until engineering mode is enabled'}
            </p>
          )}
        </div>
      )}

      {selected && related.length > 0 && (
        <div className="card">
          <h2>Related LD2410 Number Entities ({related.length})</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            These entities will be updated when you push calibration to Home Assistant.
          </p>
          <div className="sensor-list">
            {related.map((e) => (
              <div key={e.entity_id} className="sensor-item" style={{ cursor: 'default' }}>
                <div>
                  <div className="name">{e.friendly_name || e.entity_id}</div>
                  <div className="entity-id">{e.entity_id}</div>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {e.classification?.type !== 'unknown'
                    ? `${e.classification.type} ${e.classification.gate != null ? `g${e.classification.gate}` : e.classification.zone || ''}`
                    : 'unclassified'}
                  {' · '}
                  current: {e.state}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
