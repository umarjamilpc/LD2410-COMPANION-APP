const API = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  getConfig: () => request('/config'),
  saveConfig: (body) => request('/config', { method: 'POST', body: JSON.stringify(body) }),
  savePreferences: (body) => request('/config/preferences', { method: 'POST', body: JSON.stringify(body) }),
  getConnectionStatus: () => request('/connection/status'),
  testConnection: () => request('/connection/test', { method: 'POST' }),
  getSensors: () => request('/sensors'),
  selectSensor: (entity_id) =>
    request('/sensors/select', { method: 'POST', body: JSON.stringify({ entity_id }) }),
  getRelatedEntities: () => request('/sensors/related-entities'),
  getLd2410Bundle: (sensor) =>
    request(sensor ? `/sensors/ld2410-bundle?sensor=${encodeURIComponent(sensor)}` : '/sensors/ld2410-bundle'),
  getDashboard: (sensor) =>
    request(sensor ? `/sensors/dashboard?sensor=${encodeURIComponent(sensor)}` : '/sensors/dashboard'),
  setEngineeringMode: (enable, sensor) =>
    request('/sensors/engineering-mode', {
      method: 'POST',
      body: JSON.stringify({ enable, sensor }),
    }),
  startCalibration: (duration, still_baseline, options = {}) =>
    request('/calibration/start', {
      method: 'POST',
      body: JSON.stringify({
        duration,
        still_baseline,
        calibration_mode: options.calibrationMode || 'empty_room',
        auto_engineering_mode: options.autoEngineeringMode !== false,
        turn_off_engineering_after: options.turnOffEngineeringAfter !== false,
      }),
    }),
  stopCalibration: () => request('/calibration/stop', { method: 'POST' }),
  getCalibrationStatus: () => request('/calibration/status'),
  getCalibrationResult: () => request('/calibration/result'),
  applyCalibration: (profile, sensor) =>
    request('/calibration/apply', {
      method: 'POST',
      body: JSON.stringify({ profile, sensor }),
    }),
  getCalibrations: () => request('/calibrations'),
  getBackups: () => request('/backups'),
  createBackup: (profile, name, sensor) =>
    request('/backups', {
      method: 'POST',
      body: JSON.stringify({ profile, name, sensor }),
    }),
  restoreBackup: (id, sensor) =>
    request(`/backups/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ sensor }),
    }),
  deleteBackup: (id) => request(`/backups/${id}`, { method: 'DELETE' }),
  importBackup: (data) =>
    request('/backups/import', { method: 'POST', body: JSON.stringify(data) }),
  exportBackupUrl: (id) => `/api/backups/${id}/export`,
  getCurrentCalibration: (sensor) =>
    request(sensor ? `/sensors/current-calibration?sensor=${encodeURIComponent(sensor)}` : '/sensors/current-calibration'),
  saveCurrentCalibrationBackup: (sensor, name) =>
    request('/backups/from-current', {
      method: 'POST',
      body: JSON.stringify({ sensor, name }),
    }),
};

export function connectWebSocket(onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      /* ignore */
    }
  };

  ws.onerror = () => {
    /* reconnect handled by caller if needed */
  };

  return ws;
}
