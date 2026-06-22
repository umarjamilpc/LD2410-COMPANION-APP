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
  const draftInitRef = useRef('');

  const syncDraftFromHa = useCallback((gates) => {
    const next = emptyDraft();
    for (const g of GATE_ORDER) {
      const row = gates?.[g];
      if (!row) continue;
      if (row.move_threshold != null) next[g].move_threshold = String(row.move_threshold);
      if (row.still_threshold != null) next[g].still_threshold = String(row.still_threshold);
    }
    setDraft(next);
  }, []);

  const refresh = useCallback(async (initDraft = false) => {
    if (!selectedSensor) return;
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

  async function handleApply() {
    if (!selectedSensor || !data) return;
    setApplying(true);
    setMessage(null);
    try {
      const gates = {};
      for (const g of GATE_ORDER) {
        const row = data.gates?.[g];
        const move = draft[g].move_threshold;
        const still = draft[g].still_threshold;
        if (move === '' && still === '') continue;
        gates[g] = {};
        if (move !== '') gates[g].move_threshold = Number(move);
        if (still !== '') gates[g].still_threshold = Number(still);
        if (row?.move_threshold != null && gates[g].move_threshold == null) {
          gates[g].move_threshold = row.move_threshold;
        }
        if (row?.still_threshold != null && gates[g].still_threshold == null) {
          gates[g].still_threshold = row.still_threshold;
        }
      }
      const result = await api.applyCalibration({ gates, zones: {} }, selectedSensor);
      setMessage({
        type: 'success',
        text: `Applied ${result.updates?.length || 0} threshold updates to Home Assistant.`,
      });
      await refresh(true);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
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
      <h1 className="page-title">Gate Comparison</h1>
      <p className="page-subtitle">
        Compare live gate energy against thresholds set in Home Assistant. Adjust thresholds manually
        and push changes. Scale: 0 = most sensitive, 100 = off. Energy at or above the threshold
        highlights as active detection.
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

      {selectedSensor && data && (
        <div className="alert alert-info">
          Engineering mode: {data.engineering_mode_on ? 'ON' : 'OFF'}
          {' · '}
          Gate data: {data.gate_data_available ? 'available' : 'enable engineering mode for live energy'}
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
          <button className="btn" onClick={handleApply} disabled={applying || !data}>
            {applying ? 'Applying…' : 'Apply thresholds to HA'}
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
