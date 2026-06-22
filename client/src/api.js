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
  getRelatedEntities: (sensor) =>
    request(`/sensors/related-entities?sensor=${encodeURIComponent(sensor)}`),
  getLd2410Bundle: (sensor) => {
    if (!sensor) return Promise.reject(new Error('sensor is required'));
    return request(`/sensors/ld2410-bundle?sensor=${encodeURIComponent(sensor)}`);
  },
  getDashboard: (sensor) => {
    if (!sensor) return Promise.reject(new Error('sensor is required'));
    return request(`/sensors/dashboard?sensor=${encodeURIComponent(sensor)}`);
  },
  setEngineeringMode: (enable, sensor) =>
    request('/sensors/engineering-mode', {
      method: 'POST',
      body: JSON.stringify({ enable, sensor }),
    }),
  startCalibration: (duration, options = {}) =>
    request('/calibration/start', {
      method: 'POST',
      body: JSON.stringify({
        duration,
        sensor: options.sensor,
        still_threshold_buffer: options.stillThresholdBuffer ?? 5,
        move_threshold_buffer: options.moveThresholdBuffer ?? 5,
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
  deleteCalibration: (id) => request(`/calibrations/${id}`, { method: 'DELETE' }),
  clearCalibrations: () => request('/calibrations', { method: 'DELETE' }),
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
  applyGateThresholds: (sensor, gates) =>
    request('/sensors/gate-thresholds', {
      method: 'POST',
      body: JSON.stringify({ sensor, gates }),
    }),
  getGateComparison: (sensor) => {
    if (!sensor) return Promise.reject(new Error('sensor is required'));
    return request(`/sensors/gate-comparison?sensor=${encodeURIComponent(sensor)}`);
  },
  getCurrentCalibration: (sensor) => {
    if (!sensor) return Promise.reject(new Error('sensor is required'));
    return request(`/sensors/current-calibration?sensor=${encodeURIComponent(sensor)}`);
  },
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
