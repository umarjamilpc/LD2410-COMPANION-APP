const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const DEFAULT_STORE = {
  ha_url: '',
  token: '',
  calibrations: [],
  last_connection: {
    at: null,
    ok: false,
    location_name: '',
    version: '',
    error: '',
  },
  preferences: {
    calibration_duration: 60,
    still_threshold_buffer: 5,
    move_threshold_buffer: 5,
    auto_engineering_mode: true,
    turn_off_engineering_after: true,
    theme_color_mode: 'dark',
    theme_accent: 'mint',
    nav_order: [
      '/home-assistant',
      '/sensors',
      '/live-monitor',
      '/manual-tweaking',
      '/calibration',
      '/thresholds',
      '/backups',
      '/themes',
    ],
  },
};

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function readStore() {
  ensureDirs();
  if (!fs.existsSync(STORE_PATH)) {
    writeStore(DEFAULT_STORE);
    return { ...DEFAULT_STORE };
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const { selected_sensor: _removed, ...rest } = parsed;
    return {
      ...DEFAULT_STORE,
      ...rest,
      last_connection: { ...DEFAULT_STORE.last_connection, ...(parsed.last_connection || {}) },
      preferences: {
        ...DEFAULT_STORE.preferences,
        ...(parsed.preferences || {}),
        nav_order: (() => {
          const legacy = {
            '/': '/home-assistant',
            '/dashboard': '/live-monitor',
            '/comparison': '/manual-tweaking',
            '/results': '/thresholds',
            '/backup': '/backups',
          };
          const raw = parsed.preferences?.nav_order;
          if (!raw?.length) return DEFAULT_STORE.preferences.nav_order;
          const seen = new Set();
          return raw
            .map((path) => legacy[path] || path)
            .filter((path) => {
              if (seen.has(path)) return false;
              seen.add(path);
              return true;
            });
        })(),
        still_threshold_buffer:
          parsed.preferences?.still_threshold_buffer
          ?? parsed.preferences?.threshold_buffer_pct
          ?? DEFAULT_STORE.preferences.still_threshold_buffer,
        move_threshold_buffer:
          parsed.preferences?.move_threshold_buffer
          ?? parsed.preferences?.threshold_buffer_pct
          ?? DEFAULT_STORE.preferences.move_threshold_buffer,
      },
    };
  } catch {
    writeStore(DEFAULT_STORE);
    return { ...DEFAULT_STORE };
  }
}

function writeStore(data) {
  ensureDirs();
  const { selected_sensor: _removed, ...safe } = data;
  fs.writeFileSync(STORE_PATH, JSON.stringify(safe, null, 2), 'utf8');
}

function updateStore(partial) {
  const store = readStore();
  const { selected_sensor: _removed, ...safePartial } = partial;
  const updated = { ...store, ...safePartial };
  delete updated.selected_sensor;
  writeStore(updated);
  return updated;
}

function updatePreferences(partial) {
  const store = readStore();
  store.preferences = { ...DEFAULT_STORE.preferences, ...store.preferences, ...partial };
  writeStore(store);
  return store.preferences;
}

function updateLastConnection(info) {
  const store = readStore();
  store.last_connection = { ...DEFAULT_STORE.last_connection, ...store.last_connection, ...info };
  writeStore(store);
  return store.last_connection;
}

function addCalibration(calibration) {
  const store = readStore();
  store.calibrations = store.calibrations || [];
  store.calibrations.unshift(calibration);
  if (store.calibrations.length > 50) {
    store.calibrations = store.calibrations.slice(0, 50);
  }
  writeStore(store);
  return calibration;
}

function deleteCalibration(id) {
  const store = readStore();
  store.calibrations = (store.calibrations || []).filter((c) => c.id !== id);
  writeStore(store);
  return true;
}

function clearCalibrations() {
  const store = readStore();
  store.calibrations = [];
  writeStore(store);
  return true;
}

function saveBackupFile(backup) {
  ensureDirs();
  const filename = `${backup.id}.json`;
  const filepath = path.join(BACKUPS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf8');
  return { ...backup, filename };
}

function listBackupFiles() {
  ensureDirs();
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((filename) => {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(BACKUPS_DIR, filename), 'utf8')
        );
        return { ...data, filename };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
}

function readBackupFile(id) {
  const filepath = path.join(BACKUPS_DIR, `${id}.json`);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function deleteBackupFile(id) {
  const filepath = path.join(BACKUPS_DIR, `${id}.json`);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
}

module.exports = {
  readStore,
  writeStore,
  updateStore,
  updatePreferences,
  updateLastConnection,
  addCalibration,
  deleteCalibration,
  clearCalibrations,
  saveBackupFile,
  listBackupFiles,
  readBackupFile,
  deleteBackupFile,
  DATA_DIR,
  STORE_PATH,
};
