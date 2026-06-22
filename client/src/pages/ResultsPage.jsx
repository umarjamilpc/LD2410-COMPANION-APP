import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const GATE_ORDER = Array.from({ length: 9 }, (_, i) => `g${i}`);

export default function ResultsPage() {
  const [result, setResult] = useState(null);
  const [sensor, setSensor] = useState('');
  const [applying, setApplying] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [message, setMessage] = useState(null);
  const [applyResult, setApplyResult] = useState(null);

  useEffect(() => {
    loadResult();
  }, []);

  async function loadResult() {
    const stored = sessionStorage.getItem('calibrationResult');
    const storedSensor = sessionStorage.getItem('calibrationSensor');
    if (stored) {
      setResult(JSON.parse(stored));
      if (storedSensor) setSensor(storedSensor);
      return;
    }
    try {
      const data = await api.getCalibrationResult();
      setResult(data.result);
      setSensor(data.sensor || '');
    } catch {
      /* no result */
    }
    const cfg = await api.getConfig().catch(() => ({}));
    if (!sensor && cfg.selected_sensor) setSensor(cfg.selected_sensor);
  }

  async function handleApply() {
    if (!result) return;
    setApplying(true);
    setMessage(null);
    try {
      const data = await api.applyCalibration(result, sensor);
      setApplyResult(data);
      setMessage({
        type: 'success',
        text: `Applied ${data.updates?.length || 0} entity updates to Home Assistant.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setApplying(false);
    }
  }

  async function handleBackup() {
    if (!result) return;
    setBackingUp(true);
    try {
      await api.createBackup(result, undefined, sensor);
      setMessage({ type: 'success', text: 'Backup saved successfully.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBackingUp(false);
    }
  }

  if (!result) {
    return (
      <div>
        <h1 className="page-title">Calibration Results</h1>
        <p className="page-subtitle">No calibration results yet.</p>
        <div className="card">
          <p style={{ color: 'var(--text-muted)' }}>
            Run a calibration session first, then return here to review and apply gate thresholds.
          </p>
          <Link to="/calibration" className="btn" style={{ display: 'inline-block', marginTop: '1rem', textDecoration: 'none' }}>
            Go to Calibration
          </Link>
        </div>
      </div>
    );
  }

  const gates = result.gates || {};
  const zones = result.zones || {};

  return (
    <div>
      <h1 className="page-title">Calibration Results</h1>
      <p className="page-subtitle">
        Computed gate thresholds and zone cutoffs. Review before pushing to Home Assistant.
      </p>

      {message && (
        <div className={`alert alert-${message.type === 'success' ? 'success' : 'error'}`}>
          {message.text}
        </div>
      )}

      {result.summary && (
        <div className="card">
          <h2>Session Summary</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
            <Stat label="Total samples" value={result.summary.total_samples} />
            <Stat label="Motion samples" value={result.summary.motion_samples} />
            <Stat label="Still samples" value={result.summary.still_samples} />
            <Stat label="Duration" value={`${Math.round(result.summary.duration_ms / 1000)}s`} />
          </div>
        </div>
      )}

      <div className="card">
        <h2>Gate Thresholds</h2>
        <div className="gate-grid">
          {GATE_ORDER.filter((g) => gates[g]).map((g) => (
            <div key={g} className="gate-card">
              <div className="gate-label">{g}</div>
              <div className="values">
                still avg {gates[g].still?.avg?.toFixed(1) ?? '—'} · motion avg {gates[g].motion?.avg?.toFixed(1) ?? '—'}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                move: <span style={{ color: 'var(--motion)', fontWeight: 700 }}>{gates[g].move_threshold}</span>
                {' · '}
                still: <span style={{ color: 'var(--still)', fontWeight: 700 }}>{gates[g].still_threshold}</span>
              </div>
            </div>
          ))}
        </div>
        {!Object.keys(gates).length && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No gate energy data was captured. Ensure your sensor exposes g0–g8 attributes in Home Assistant.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Zone Distances</h2>
        <div className="gate-grid">
          {zones.max_still_distance != null && (
            <div className="gate-card">
              <div className="gate-label">max_still_distance</div>
              <div className="threshold">{zones.max_still_distance}</div>
            </div>
          )}
          {zones.max_move_distance != null && (
            <div className="gate-card">
              <div className="gate-label">max_move_distance</div>
              <div className="threshold">{zones.max_move_distance}</div>
            </div>
          )}
          {zones.detection_gate != null && (
            <div className="gate-card">
              <div className="gate-label">detection_gate</div>
              <div className="threshold">{zones.detection_gate}</div>
            </div>
          )}
        </div>
      </div>

      {result.yaml && (
        <div className="card">
          <h2>ESPHome YAML Preview</h2>
          <pre className="yaml-block">{result.yaml}</pre>
        </div>
      )}

      <div className="form-row">
        <button className="btn" onClick={handleApply} disabled={applying}>
          {applying ? 'Applying…' : 'Push Calibration to Home Assistant'}
        </button>
        <button className="btn btn-secondary" onClick={handleBackup} disabled={backingUp}>
          {backingUp ? 'Saving…' : 'Backup Calibration'}
        </button>
      </div>

      {applyResult?.updates?.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2>Applied Updates</h2>
          <div className="sensor-list">
            {applyResult.updates.map((u) => (
              <div key={u.entity_id} className="sensor-item" style={{ cursor: 'default' }}>
                <div className="entity-id">{u.entity_id}</div>
                <div style={{ fontWeight: 600 }}>→ {u.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {applyResult?.skipped?.length > 0 && (
        <div className="alert alert-info" style={{ marginTop: '1rem' }}>
          Skipped {applyResult.skipped.length} entities (no matching threshold value).
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: 'var(--surface-2)', padding: '0.75rem', borderRadius: 'var(--radius)' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}
