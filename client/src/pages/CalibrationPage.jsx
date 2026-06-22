import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { api, connectWebSocket } from '../api';
import { useAppConfig } from '../AppConfigContext';
import { useSensor } from '../SensorContext';
import SensorPicker from '../components/SensorPicker';

const DURATIONS = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600];

function formatDuration(seconds) {
  const min = seconds / 60;
  return min === 1 ? '1 minute' : `${min} minutes`;
}

function gateChartValue(gate) {
  if (gate == null) return null;
  if (typeof gate === 'object') return gate.move ?? gate.still ?? gate.energy ?? null;
  return gate;
}

export default function CalibrationPage() {
  const { config, savePreferences } = useAppConfig();
  const { selectedSensor, setSelectedSensor } = useSensor();
  const [duration, setDuration] = useState(60);
  const [stillThresholdBuffer, setStillThresholdBuffer] = useState(5);
  const [moveThresholdBuffer, setMoveThresholdBuffer] = useState(5);
  const [autoEngineeringMode, setAutoEngineeringMode] = useState(true);
  const [turnOffEngineeringAfter, setTurnOffEngineeringAfter] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [engToggling, setEngToggling] = useState(false);
  const [status, setStatus] = useState({ status: 'idle' });
  const [chartData, setChartData] = useState([]);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const wsRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    if (!config?.preferences) return;
    const p = config.preferences;
    if (p.calibration_duration) setDuration(p.calibration_duration);
    if (p.still_threshold_buffer != null) setStillThresholdBuffer(p.still_threshold_buffer);
    else if (p.threshold_buffer_pct != null) setStillThresholdBuffer(p.threshold_buffer_pct);
    if (p.move_threshold_buffer != null) setMoveThresholdBuffer(p.move_threshold_buffer);
    else if (p.threshold_buffer_pct != null) setMoveThresholdBuffer(p.threshold_buffer_pct);
    if (p.auto_engineering_mode != null) setAutoEngineeringMode(p.auto_engineering_mode);
    if (p.turn_off_engineering_after != null) setTurnOffEngineeringAfter(p.turn_off_engineering_after);
  }, [config?.preferences]);

  function persistPreferences(partial) {
    savePreferences(partial).catch(() => {});
  }

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getCalibrationStatus();
      setStatus(s);
    } catch {
      /* ignore */
    }
  }, []);

  const loadBundle = useCallback(async (sensor) => {
    if (!sensor) return;
    try {
      const data = await api.getLd2410Bundle(sensor);
      setBundle(data.bundle);
    } catch {
      setBundle(null);
    }
  }, []);

  useEffect(() => {
    if (selectedSensor) loadBundle(selectedSensor);
    else setBundle(null);
    refreshStatus();

    const ws = connectWebSocket((data) => {
      if (data.type === 'engineering_mode') {
        setInfo(data.message);
      } else if (data.type === 'sample') {
        setStatus((prev) => ({
          ...prev,
          progress: data.progress,
          remaining_ms: data.remaining_ms,
          sample_count: data.sample_count,
          latest_sample: data.sample,
          engineering_mode: data.engineering_mode,
          gates_available: data.gates_available,
          status: 'running',
        }));
        setChartData((prev) => {
          const point = {
            t: prev.length,
            distance: data.sample.distance ?? null,
            motion: data.sample.motion ? 1 : 0,
          };
          for (let i = 0; i <= 8; i++) {
            const g = `g${i}`;
            const val = gateChartValue(data.sample.gates?.[g]);
            if (val != null) point[g] = val;
            const move = data.sample.gates?.[g]?.move;
            const still = data.sample.gates?.[g]?.still;
            if (move != null) point[`${g}_move`] = move;
            if (still != null) point[`${g}_still`] = still;
          }
          return [...prev.slice(-300), point];
        });
      } else if (data.type === 'completed') {
        resultRef.current = data.result;
        setStatus((prev) => ({ ...prev, status: 'completed' }));
        sessionStorage.setItem('calibrationResult', JSON.stringify(data.result));
        sessionStorage.setItem('calibrationSensor', selectedSensor);
        if (data.engineering_mode_restore?.message) {
          setInfo(`Calibration complete. ${data.engineering_mode_restore.message}`);
        }
        loadBundle(selectedSensor);
      } else if (data.type === 'error') {
        setError(data.error);
      }
    });
    wsRef.current = ws;

    const poll = setInterval(refreshStatus, 2000);
    return () => {
      clearInterval(poll);
      ws.close();
    };
  }, [refreshStatus, selectedSensor, loadBundle]);

  async function handleToggleEngineering(enable) {
    setEngToggling(true);
    setError(null);
    try {
      const result = await api.setEngineeringMode(enable, selectedSensor);
      setBundle(result.bundle);
      setInfo(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setEngToggling(false);
    }
  }

  async function handleStart() {
    setError(null);
    setInfo(null);
    setChartData([]);
    resultRef.current = null;
    sessionStorage.removeItem('calibrationResult');
    try {
      const s = await api.startCalibration(duration, {
        sensor: selectedSensor,
        stillThresholdBuffer,
        moveThresholdBuffer,
        autoEngineeringMode,
        turnOffEngineeringAfter,
      });
      setStatus(s);
      if (s.engineering_mode_meta?.message) {
        setInfo(s.engineering_mode_meta.message);
      }
      loadBundle(selectedSensor);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStop() {
    try {
      const data = await api.stopCalibration();
      setStatus(data);
      if (data.result) {
        resultRef.current = data.result;
        sessionStorage.setItem('calibrationResult', JSON.stringify(data.result));
        sessionStorage.setItem('calibrationSensor', selectedSensor);
      }
      loadBundle(selectedSensor);
    } catch (err) {
      setError(err.message);
    }
  }

  const running = status.status === 'running';
  const latest = status.latest_sample;
  const progress = status.progress ?? 0;
  const engOn = bundle?.engineering_mode_on;
  const gateSensorCount = Object.keys(bundle?.gate_sensors || {}).length;
  const gateKeys = chartData.length
    ? Object.keys(chartData[chartData.length - 1]).filter((k) => /^g\d$/.test(k))
    : [];

  return (
    <div>
      <h1 className="page-title">Empty Room Calibration</h1>
      <p className="page-subtitle">
        Capture gate energy while the room is empty, then compute thresholds from peak samples plus
        your buffer. Enable Radar Engineering Mode for g0–g8 energy readings.
      </p>

      <div className="card">
        <h2>Sensor</h2>
        <SensorPicker
          value={selectedSensor}
          onChange={setSelectedSensor}
          disabled={running}
        />
      </div>

      {!selectedSensor && (
        <div className="alert alert-error">
          Choose an LD2410 sensor above to start calibration.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {info && <div className="alert alert-info">{info}</div>}

      {selectedSensor && bundle && (
        <div className="card">
          <h2>Radar Engineering Mode</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Gate energy sensors (g0–g8 move/still energy) are only reported when engineering mode is on.
            Your ESPHome config exposes this as{' '}
            <code style={{ fontFamily: 'var(--mono)' }}>
              {bundle.engineering_mode_switch?.entity_id || 'switch.*_engineering_mode'}
            </code>
            .
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span className={`live-badge ${engOn ? 'motion' : 'still'}`}>
              <span className={`status-dot ${engOn ? 'on' : 'off'}`} />
              Engineering mode: {engOn ? 'ON' : 'OFF'}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {gateSensorCount} gates mapped · {bundle.gate_data_available ? 'data available' : 'no gate data yet'}
            </span>
          </div>
          <div className="form-row">
            <button
              className="btn btn-secondary"
              onClick={() => handleToggleEngineering(true)}
              disabled={engToggling || running || engOn}
            >
              Enable Engineering Mode
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleToggleEngineering(false)}
              disabled={engToggling || running || !engOn}
            >
              Disable Engineering Mode
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Session Settings</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Empty room calibration — leave the space unoccupied for the full session. Samples with
          presence or motion are excluded. Threshold scale: 0 = most sensitive, 100 = off.
        </p>
        <div className="form-row">
          <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
            <label>Duration</label>
            <select
              value={duration}
              onChange={(e) => {
                const val = Number(e.target.value);
                setDuration(val);
                persistPreferences({ calibration_duration: val });
              }}
              disabled={running}
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>{formatDuration(d)}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
            <label>Still threshold buffer (+{stillThresholdBuffer})</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={stillThresholdBuffer}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setStillThresholdBuffer(val);
                  persistPreferences({ still_threshold_buffer: val });
                }}
                disabled={running}
                style={{ flex: 1 }}
              />
              <span className="range-value">+{stillThresholdBuffer}</span>
            </div>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Points added above peak still energy (e.g. 5 → peak 40 becomes 45).
            </small>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
            <label>Move threshold buffer (+{moveThresholdBuffer})</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={moveThresholdBuffer}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMoveThresholdBuffer(val);
                  persistPreferences({ move_threshold_buffer: val });
                }}
                disabled={running}
                style={{ flex: 1 }}
              />
              <span className="range-value">+{moveThresholdBuffer}</span>
            </div>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Points added above peak move energy (higher = less sensitive).
            </small>
          </div>
        </div>
        <div className="toggle-row">
          <input
            type="checkbox"
            id="auto_engineering"
            checked={autoEngineeringMode}
            onChange={(e) => {
              setAutoEngineeringMode(e.target.checked);
              persistPreferences({ auto_engineering_mode: e.target.checked });
            }}
            disabled={running}
          />
          <label htmlFor="auto_engineering" style={{ margin: 0 }}>
            Auto-enable engineering mode when calibration starts
          </label>
        </div>
        <div className="toggle-row">
          <input
            type="checkbox"
            id="turn_off_engineering"
            checked={turnOffEngineeringAfter}
            onChange={(e) => {
              setTurnOffEngineeringAfter(e.target.checked);
              persistPreferences({ turn_off_engineering_after: e.target.checked });
            }}
            disabled={running}
          />
          <label htmlFor="turn_off_engineering" style={{ margin: 0 }}>
            Turn off engineering mode when calibration ends
          </label>
        </div>
        <div className="form-row">
          <button className="btn" onClick={handleStart} disabled={running || !selectedSensor}>
            Start Calibration
          </button>
          <button className="btn btn-danger" onClick={handleStop} disabled={!running}>
            Stop Early
          </button>
          {status.status === 'completed' && (
            <Link to="/results" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
              View Results →
            </Link>
          )}
        </div>
      </div>

      {running && (
        <div className="card">
          <h2>Live Status</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span className={`live-badge ${latest?.motion || latest?.presence ? 'motion' : 'still'}`}>
              <span className={`status-dot ${latest?.motion || latest?.presence ? 'on' : 'off'}`} />
              {latest?.motion || latest?.presence ? 'Presence detected' : 'Room clear'}
            </span>
            {(latest?.motion || latest?.presence) && (
              <span style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
                Leave the room — presence will reduce accuracy
              </span>
            )}
            {latest?.engineering_mode != null && (
              <span className={`live-badge ${latest.engineering_mode ? 'motion' : 'still'}`}>
                Eng. mode: {latest.engineering_mode ? 'ON' : 'OFF'}
              </span>
            )}
            {latest?.distance != null && (
              <span style={{ fontSize: '0.9rem' }}>
                Distance: <strong>{latest.distance}</strong> cm
              </span>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Gates: {status.gates_available ?? Object.keys(latest?.gates || {}).length}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Samples: {status.sample_count || 0}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Remaining: {Math.ceil((status.remaining_ms || 0) / 1000)}s
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {chartData.length > 1 && (
        <div className="card">
          <h2>Distance Over Time</h2>
          <div className="chart-container" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#8b9cb3" />
                <YAxis tick={{ fontSize: 10 }} stroke="#8b9cb3" />
                <Tooltip contentStyle={{ background: '#1a2332', border: '1px solid #2d3f56' }} />
                <Line type="monotone" dataKey="distance" stroke="#3dcea3" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {gateKeys.length > 0 && chartData.length > 1 && (
        <div className="card">
          <h2>Gate Energy (move)</h2>
          <div className="chart-container" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#8b9cb3" />
                <YAxis tick={{ fontSize: 10 }} stroke="#8b9cb3" />
                <Tooltip contentStyle={{ background: '#1a2332', border: '1px solid #2d3f56' }} />
                <Legend />
                {gateKeys.map((g, i) => (
                  <Line
                    key={g}
                    type="monotone"
                    dataKey={g}
                    dot={false}
                    strokeWidth={1.5}
                    stroke={`hsl(${160 + i * 25}, 70%, 55%)`}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {latest?.gates && Object.keys(latest.gates).length > 0 && (
        <div className="card">
          <h2>Current Gate Readings</h2>
          <div className="gate-grid">
            {Object.entries(latest.gates).map(([g, v]) => (
              <div key={g} className="gate-card">
                <div className="gate-label">{g}</div>
                {typeof v === 'object' ? (
                  <div style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
                    {v.move != null && <div>move: <strong>{v.move}</strong></div>}
                    {v.still != null && <div>still: <strong>{v.still}</strong></div>}
                    {v.energy != null && <div>energy: <strong>{v.energy}</strong></div>}
                  </div>
                ) : (
                  <div className="threshold">{v}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {bundle && gateSensorCount === 0 && (
        <div className="alert alert-error">
          No g0–g8 energy sensors found for this device. Check that your ESPHome LD2410 sensor block
          exposes gate energy entities and that the correct presence sensor is selected.
        </div>
      )}
    </div>
  );
}
