import { useState, useEffect } from 'react';
import { api } from '../api';

export default function SensorPicker({
  value,
  onChange,
  disabled = false,
  label = 'LD2410 sensor',
  id = 'sensor-picker',
}) {
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getSensors();
        if (!active) return;
        setSensors(data.sensors || []);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
      >
        <option value="">{loading ? 'Loading sensors…' : 'Choose a sensor…'}</option>
        {sensors.map((s) => (
          <option key={s.entity_id} value={s.entity_id}>
            {s.friendly_name} ({s.entity_id})
          </option>
        ))}
      </select>
      {error && (
        <small style={{ color: 'var(--danger)', fontSize: '0.8rem', display: 'block', marginTop: '0.35rem' }}>
          {error}
        </small>
      )}
      {!error && (
        <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginTop: '0.35rem' }}>
          Selection applies to this browser session only and is not saved to disk.
        </small>
      )}
    </div>
  );
}
