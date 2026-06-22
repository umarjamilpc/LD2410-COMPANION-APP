import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useSensor } from '../SensorContext';
import SensorPicker from '../components/SensorPicker';

const GATE_ORDER = Array.from({ length: 9 }, (_, i) => `g${i}`);

function emptyDraft() {
  const draft = {};
  for (const g of GATE_ORDER) {
    draft[g] = { move_threshold: '', still_threshold: '' };
  }
  return draft;
}

function EnergyRangeBar({ energy, threshold, min = 0, max = 100 }) {
  const span = Math.max(1, max - min);
  const energyPct = energy != null ? Math.min(100, Math.max(0, ((energy - min) / span) * 100)) : 0;
  const threshPct = threshold != null && threshold !== ''
    ? Math.min(100, Math.max(0, ((Number(threshold) - min) / span) * 100))
    : null;
  const triggered = energy != null && threshold !== '' && threshold != null && energy >= Number(threshold);

  return (
    <div className="comparison-range">
      <div className={`comparison-range-track ${triggered ? 'triggered' : ''}`}>
        {energy != null && (
          <div className="comparison-range-energy" style={{ width: `${energyPct}%` }} />
        )}
        {threshPct != null && (
          <div className="comparison-range-threshold" style={{ left: `${threshPct}%` }} title={`Threshold ${threshold}`} />
        )}
      </div>
      <div className="comparison-range-labels">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default function ComparisonPage() {
  const { selectedSensor, setSelectedSensor } = useSensor();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [applying, setApplying] = useState(false);
  const [engToggling, setEngToggling] = useState(false);
  const draftInitRef = useRef('');
  const pauseRefreshRef = useRef(false);

  const syncDraftFromHa = useCallback((gates, preferApplied) => {
    const next = emptyDraft();
    for (const g of GATE_ORDER) {
      const row = gates?.[g];
      if (!row) continue;
      if (row.move_threshold != null) {
        next[g].move_threshold = String(
          preferApplied?.[g]?.move_threshold ?? row.move_threshold
        );
      }
      if (row.still_threshold != null) {
        next[g].still_threshold = String(
          preferApplied?.[g]?.still_threshold ?? row.still_threshold
        );
      }
    }
    setDraft(next);
  }, []);

  const refresh = useCallback(async (initDraft = false) => {
    if (!selectedSensor || pauseRefreshRef.current) return;
    try {
      const comparison = await api.getGateComparison(selectedSensor);
      setData(comparison);
      setError(null);
      if (initDraft || draftInitRef.current !== selectedSensor) {
        syncDraftFromHa(comparison.gates);
        draftInitRef.current = selectedSensor;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedSensor, syncDraftFromHa]);

  useEffect(() => {
    if (!selectedSensor) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    draftInitRef.current = '';
    refresh(true);
    if (!autoRefresh) return undefined;
    const id = setInterval(() => refresh(false), 2000);
    return () => clearInterval(id);
  }, [selectedSensor, autoRefresh, refresh]);

  function updateDraft(gate, field, value) {
    setDraft((prev) => ({
      ...prev,
      [gate]: { ...prev[gate], [field]: value },
    }));
  }

  function nudge(gate, field, delta) {
    setDraft((prev) => {
      const row = data?.gates?.[gate] || {};
      const min = row.min ?? 0;
      const max = row.max ?? 100;
      const current = prev[gate][field] === '' ? (row[field] ?? min) : Number(prev[gate][field]);
      const next = Math.max(min, Math.min(max, current + delta));
      return {
        ...prev,
        [gate]: { ...prev[gate], [field]: String(next) },
      };
    });
  }

  async function handleToggleEngineering(enable) {
    if (!selectedSensor) return;
    setEngToggling(true);
    setError(null);
    try {
      const result = await api.setEngineeringMode(enable, selectedSensor);
      setMessage({ type: 'success', text: result.message || `Engineering mode ${enable ? 'enabled' : 'disabled'}.` });
      await refresh(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setEngToggling(false);
    }
  }

  async function handleApply() {
    if (!selectedSensor || !data) return;
    setApplying(true);
    setMessage(null);
    pauseRefreshRef.current = true;
    try {
      const gates = {};
      const appliedDraft = {};
      for (const g of GATE_ORDER) {
        const move = draft[g].move_threshold;
        const still = draft[g].still_threshold;
        if (move === '' && still === '') continue;
        gates[g] = {};
        appliedDraft[g] = {};
        if (move !== '') {
          gates[g].move_threshold = Number(move);
          appliedDraft[g].move_threshold = Number(move);
        }
        if (still !== '') {
          gates[g].still_threshold = Number(still);
          appliedDraft[g].still_threshold = Number(still);
        }
      }

      const result = await api.applyGateThresholds(selectedSensor, gates);
      setData({
        sensor: result.sensor,
        engineering_mode_on: result.engineering_mode_on,
        gate_data_available: result.gate_data_available,
        gates: result.gates,
        updated_at: result.updated_at,
      });
      syncDraftFromHa(result.gates, appliedDraft);
      setMessage({
        type: 'success',
        text: `Applied ${result.updates?.length || 0} threshold updates. Synced with Home Assistant.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      pauseRefreshRef.current = false;
      setApplying(false);
    }
  }

  const gates = data?.gates || {};
  const hasRows = GATE_ORDER.some((g) => {
    const row = gates[g];
    return row && (
      row.move_threshold != null || row.still_threshold != null
      || row.move_energy != null || row.still_energy != null
    );
  });

  return (
    <div>
      <h1 className="page-title">Manual Tweaking</h1>
      <p className="page-subtitle">
        Compare live gate energy against thresholds in Home Assistant, adjust values, and apply.
        Scale: 0 = most sensitive, 100 = off. Energy at or above the threshold highlights as
        active detection.
      </p>

      <div className="card">
        <h2>Sensor</h2>
        <SensorPicker value={selectedSensor} onChange={setSelectedSensor} />
      </div>

      {!selectedSensor && (
        <div className="alert alert-error">Choose a sensor to compare gate energy and thresholds.</div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {message && (
        <div className={`alert alert-${message.type === 'success' ? 'success' : 'error'}`}>
          {message.text}
        </div>
      )}

      {selectedSensor && (
        <div className="card">
          <h2>Radar Engineering Mode</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Gate energy (g0–g8) is only reported when engineering mode is on.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span className={`live-badge ${data?.engineering_mode_on ? 'motion' : 'still'}`}>
              <span className={`status-dot ${data?.engineering_mode_on ? 'on' : 'off'}`} />
              Engineering mode: {data?.engineering_mode_on ? 'ON' : 'OFF'}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Gate data: {data?.gate_data_available ? 'available' : 'not available yet'}
            </span>
          </div>
          <div className="form-row">
            <button
              className="btn btn-secondary"
              onClick={() => handleToggleEngineering(true)}
              disabled={engToggling || applying || data?.engineering_mode_on}
            >
              Enable Engineering Mode
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleToggleEngineering(false)}
              disabled={engToggling || applying || !data?.engineering_mode_on}
            >
              Disable Engineering Mode
            </button>
          </div>
        </div>
      )}

      {selectedSensor && data && (
        <div className="alert alert-info">
          Live comparison data
          {data.updated_at && (
            <span style={{ marginLeft: '0.75rem', opacity: 0.85 }}>
              Updated {new Date(data.updated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {selectedSensor && (
        <div className="form-row" style={{ marginBottom: '1rem' }}>
          <button className="btn btn-secondary" onClick={() => refresh(true)} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button className="btn btn-secondary" onClick={() => syncDraftFromHa(gates)} disabled={!data}>
            Reload thresholds from HA
          </button>
          <button className="btn" onClick={handleApply} disabled={applying || !data || loading}>
            {applying ? 'Applying & syncing…' : 'Apply thresholds to HA'}
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
      )}

      {selectedSensor && hasRows && (
        <div className="card">
          <h2>Gate energy vs threshold</h2>
          <div className="data-table-wrap">
            <table className="data-table comparison-table">
              <thead>
                <tr>
                  <th>Gate</th>
                  <th>Type</th>
                  <th>Live energy</th>
                  <th>Set threshold</th>
                  <th>Range (0–100)</th>
                  <th>Tweak</th>
                </tr>
              </thead>
              <tbody>
                {GATE_ORDER.map((g) => {
                  const row = gates[g];
                  if (!row) return null;
                  const types = [
                    { key: 'move', energy: row.move_energy, field: 'move_threshold', color: 'var(--motion)' },
                    { key: 'still', energy: row.still_energy, field: 'still_threshold', color: 'var(--still)' },
                  ];
                  return types.map((type, idx) => (
                    <tr key={`${g}-${type.key}`}>
                      {idx === 0 && (
                        <td rowSpan={2}><strong>{g}</strong></td>
                      )}
                      <td style={{ color: type.color, fontWeight: 600 }}>{type.key}</td>
                      <td>
                        <strong>{type.energy != null ? type.energy : '—'}</strong>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={row.min ?? 0}
                          max={row.max ?? 100}
                          step={1}
                          value={draft[g]?.[type.field] ?? ''}
                          onChange={(e) => updateDraft(g, type.field, e.target.value)}
                          className="comparison-threshold-input"
                        />
                      </td>
                      <td>
                        <EnergyRangeBar
                          energy={type.energy}
                          threshold={draft[g]?.[type.field]}
                          min={row.min ?? 0}
                          max={row.max ?? 100}
                        />
                      </td>
                      <td>
                        <div className="comparison-tweak">
                          <button type="button" className="btn btn-secondary" onClick={() => nudge(g, type.field, -1)}>−</button>
                          <button type="button" className="btn btn-secondary" onClick={() => nudge(g, type.field, 1)}>+</button>
                        </div>
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedSensor && data && !hasRows && !loading && (
        <div className="alert alert-info">
          No gate threshold or energy entities found. Enable engineering mode and confirm g0–g8
          entities exist in Home Assistant.
        </div>
      )}
    </div>
  );
}
