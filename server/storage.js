const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const DEFAULT_STORE = {
  ha_url: '',
  token: '',
  selected_sensor: '',
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
    calibration_mode: 'empty_room',
    still_baseline: false,
    auto_engineering_mode: true,
    turn_off_engineering_after: true,
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
    return {
      ...DEFAULT_STORE,
      ...parsed,
      last_connection: { ...DEFAULT_STORE.last_connection, ...(parsed.last_connection || {}) },
      preferences: { ...DEFAULT_STORE.preferences, ...(parsed.preferences || {}) },
    };
  } catch {
    writeStore(DEFAULT_STORE);
    return { ...DEFAULT_STORE };
  }
}

function writeStore(data) {
  ensureDirs();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function updateStore(partial) {
  const store = readStore();
  const updated = { ...store, ...partial };
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
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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
  saveBackupFile,
  listBackupFiles,
  readBackupFile,
  deleteBackupFile,
  DATA_DIR,
  STORE_PATH,
};
