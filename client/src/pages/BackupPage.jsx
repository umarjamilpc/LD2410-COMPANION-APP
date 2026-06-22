import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useSensor } from '../SensorContext';
import SensorPicker from '../components/SensorPicker';
import { formatLocalDateTime, recordDisplayName, buildExportFilename } from '../format';

export default function BackupPage() {
  const { selectedSensor, setSelectedSensor } = useSensor();
  const [backups, setBackups] = useState([]);
  const [calibrations, setCalibrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exportingCurrent, setExportingCurrent] = useState(false);
  const fileInputRef = useRef(null);
  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [b, c] = await Promise.all([api.getBackups(), api.getCalibrations()]);
      setBackups(b.backups || []);
      setCalibrations(c.calibrations || []);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(id) {
    setRestoring(id);
    setMessage(null);
    try {
      const data = await api.restoreBackup(id);
      setMessage({
        type: 'success',
        text: `Restored backup — applied ${data.updates?.length || 0} updates to Home Assistant.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setRestoring(null);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this backup?')) return;
    try {
      await api.deleteBackup(id);
      setBackups((prev) => prev.filter((b) => b.id !== id));
      setMessage({ type: 'success', text: 'Backup deleted.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  function handleExport(backup) {
    const url = api.exportBackupUrl(backup.id);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildExportFilename(backup);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }

  async function handleExportCurrent() {
    if (!selectedSensor) {
      setMessage({ type: 'error', text: 'Choose a sensor above first.' });
      return;
    }
    setExportingCurrent(true);
    setMessage(null);
    try {
      const profile = await api.getCurrentCalibration(selectedSensor);
      const slug = selectedSensor.split('.')[1]?.slice(0, 20) || 'sensor';
      downloadJson(profile, `ld2410-current-gates-${slug}.json`);
      setMessage({ type: 'success', text: 'Exported current gate calibration from Home Assistant.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setExportingCurrent(false);
    }
  }

  async function handleSaveCurrentBackup() {
    if (!selectedSensor) {
      setMessage({ type: 'error', text: 'Choose a sensor above first.' });
      return;
    }
    setExportingCurrent(true);
    setMessage(null);
    try {
      const result = await api.saveCurrentCalibrationBackup(selectedSensor);
      setBackups((prev) => [result.backup, ...prev]);
      setMessage({ type: 'success', text: `Saved current HA gates as "${result.backup.name}".` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setExportingCurrent(false);
    }
  }

  function handleExportHistory(c) {
    downloadJson(c, buildExportFilename(c));
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await api.importBackup(data);
      setBackups((prev) => [result.backup, ...prev]);
      setMessage({ type: 'success', text: `Imported backup "${result.backup.name}".` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Invalid JSON file' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function formatDate(iso) {
    return formatLocalDateTime(iso);
  }

  async function handleRestoreFromHistory(c) {
    setRestoring(c.id);
    setMessage(null);
    try {
      const data = await api.applyCalibration(c, c.sensor);
      setMessage({
        type: 'success',
        text: `Re-applied calibration — ${data.updates?.length || 0} updates.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setRestoring(null);
    }
  }

  async function handleDeleteHistory(id) {
    if (!confirm('Delete this calibration history entry?')) return;
    try {
      await api.deleteCalibration(id);
      setCalibrations((prev) => prev.filter((c) => c.id !== id));
      setMessage({ type: 'success', text: 'History entry deleted.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  async function handleClearHistory() {
    if (!calibrations.length) return;
    if (!confirm('Clear all calibration history? This cannot be undone.')) return;
    try {
      await api.clearCalibrations();
      setCalibrations([]);
      setMessage({ type: 'success', text: 'Calibration history cleared.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  return (
    <div>
      <h1 className="page-title">Backups</h1>
      <p className="page-subtitle">
        Export, import, and restore LD2410 threshold profiles. Applied calibrations are kept in history.
      </p>

      <div className="card">
        <h2>Sensor for HA operations</h2>
        <SensorPicker value={selectedSensor} onChange={setSelectedSensor} />
      </div>

      {message && (
        <div className={`alert alert-${message.type === 'success' ? 'success' : 'error'}`}>
          {message.text}
        </div>
      )}

      <div className="card">
        <h2>Current thresholds from Home Assistant</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Read live g0–g8 move/still thresholds and zone distances
          {selectedSensor ? (
            <> for <code style={{ fontFamily: 'var(--mono)' }}>{selectedSensor}</code></>
          ) : (
            ' — choose a sensor above first'
          )}
          .
        </p>
        <div className="form-row">
          <button
            className="btn"
            onClick={handleExportCurrent}
            disabled={exportingCurrent || !selectedSensor}
          >
            {exportingCurrent ? 'Reading HA…' : 'Export current gates'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleSaveCurrentBackup}
            disabled={exportingCurrent || !selectedSensor}
          >
            Save current gates to backups
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Import / Export files</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Export a backup JSON file to store elsewhere, or import a previously exported file to restore later.
        </p>
        <div className="form-row">
          <button
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? 'Importing…' : 'Import calibration file'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh list'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Saved Backups ({backups.length})</h2>
        {backups.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No backups yet. Create one from the Results page after calibration, or import a JSON file above.
          </p>
        ) : (
          <div className="backup-list">
            {backups.map((b) => (
              <div key={b.id} className="backup-item">
                <div>
                  <div style={{ fontWeight: 600 }}>{recordDisplayName(b)}</div>
                  <div className="meta">
                    {formatDate(b.timestamp)}
                  </div>
                </div>
                <div className="form-row" style={{ margin: 0 }}>
                  <button className="btn btn-secondary" onClick={() => handleExport(b)}>
                    Export
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleRestore(b.id)}
                    disabled={restoring === b.id}
                  >
                    {restoring === b.id ? 'Restoring…' : 'Restore to HA'}
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(b.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Calibration history ({calibrations.length})</h2>
          {calibrations.length > 0 && (
            <button className="btn btn-danger" onClick={handleClearHistory}>
              Clear history
            </button>
          )}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Threshold profiles previously applied to Home Assistant from this app.
        </p>
        {calibrations.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No history yet.</p>
        ) : (
          <div className="backup-list">
            {calibrations.map((c) => (
              <div key={c.id} className="backup-item">
                <div>
                  <div style={{ fontWeight: 600 }}>{recordDisplayName(c)}</div>
                  <div className="meta">
                    {formatDate(c.timestamp)}
                  </div>
                </div>
                <div className="form-row" style={{ margin: 0 }}>
                  <button className="btn btn-secondary" onClick={() => handleExportHistory(c)}>
                    Export
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleRestoreFromHistory(c)}
                    disabled={restoring === c.id}
                  >
                    {restoring === c.id ? 'Applying…' : 'Re-apply'}
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDeleteHistory(c.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
