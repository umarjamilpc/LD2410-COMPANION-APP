import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { formatLocalDateTime, recordDisplayName, buildExportFilename } from '../format';

export default function BackupPage() {
  const [backups, setBackups] = useState([]);
  const [calibrations, setCalibrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exportingCurrent, setExportingCurrent] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    load();
    api.getConfig().then((c) => setSelectedSensor(c.selected_sensor || ''));
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
      setMessage({ type: 'error', text: 'Select a sensor on the Sensors page first.' });
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
      setMessage({ type: 'error', text: 'Select a sensor on the Sensors page first.' });
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

  return (
    <div>
      <h1 className="page-title">Backup & Restore</h1>
      <p className="page-subtitle">
        Save, export, import, and restore LD2410 calibration profiles as JSON files.
      </p>

      {message && (
        <div className={`alert alert-${message.type === 'success' ? 'success' : 'error'}`}>
          {message.text}
        </div>
      )}

      <div className="card">
        <h2>Current gates (from Home Assistant)</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Read the live g0–g8 move/still thresholds and zone distances currently set on your LD2410
          {selectedSensor ? (
            <> for <code style={{ fontFamily: 'var(--mono)' }}>{selectedSensor}</code></>
          ) : (
            ' — select a sensor first'
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
        <h2>Calibration History ({calibrations.length})</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Previously applied calibrations stored in the app database.
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
                  >
                    Re-apply
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
