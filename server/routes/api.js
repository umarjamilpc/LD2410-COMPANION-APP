const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const storage = require('../storage');
const ha = require('../homeassistant');
const calibration = require('../calibration');
const { discoverLd2410Bundle, getEntityIdsToPoll, buildRegistryMaps } = require('../ld2410');

const router = express.Router();

function maskToken(token) {
  if (!token) return '';
  if (token.length <= 8) return '********';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function getHaFetch(store) {
  return (entityId) => ha.fetchEntityState(store, entityId);
}

function buildPollFn(store, bundle) {
  const entityIds = getEntityIdsToPoll(bundle);
  return () => ha.fetchEntityStates(store, entityIds);
}

function buildOnStopFn(store, bundle, turnOffAfter) {
  return async () => {
    if (!turnOffAfter || !bundle?.engineering_mode_switch) {
      return { turned_off: false, reason: 'turn off after calibration is disabled' };
    }
    return ha.ensureEngineeringMode(store, bundle, { enable: false, waitMs: 500 });
  };
}

async function loadRegistryMaps(store) {
  try {
    const registry = await ha.fetchEntityRegistry(store);
    if (Array.isArray(registry) && registry.length > 0) {
      return buildRegistryMaps(registry);
    }
  } catch {
    /* registry optional */
  }
  return buildRegistryMaps([]);
}

function broadcastCalibration(wss, data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

router.get('/config', (req, res) => {
  const store = storage.readStore();
  res.json({
    ha_url: store.ha_url,
    token_set: Boolean(store.token),
    token_preview: maskToken(store.token),
    selected_sensor: store.selected_sensor,
    last_connection: store.last_connection || null,
    preferences: store.preferences || {},
  });
});

router.post('/config', (req, res) => {
  const { ha_url, token } = req.body;
  const partial = {};
  if (ha_url !== undefined) partial.ha_url = String(ha_url).trim();
  if (token !== undefined && token !== '') partial.token = String(token).trim();
  const store = storage.updateStore(partial);
  res.json({
    ha_url: store.ha_url,
    token_set: Boolean(store.token),
    token_preview: maskToken(store.token),
    selected_sensor: store.selected_sensor,
    last_connection: store.last_connection || null,
    preferences: store.preferences || {},
  });
});

router.post('/config/preferences', (req, res) => {
  const preferences = storage.updatePreferences(req.body || {});
  res.json({ preferences });
});

router.get('/connection/status', async (req, res) => {
  const store = storage.readStore();
  if (!store.ha_url || !store.token) {
    return res.json({
      configured: false,
      connected: false,
      last_connection: store.last_connection || null,
    });
  }
  try {
    const result = await ha.testConnection(store);
    const last_connection = storage.updateLastConnection({
      at: new Date().toISOString(),
      ok: true,
      location_name: result.location_name,
      version: result.version,
      error: '',
    });
    res.json({
      configured: true,
      connected: true,
      ...result,
      last_connection,
      selected_sensor: store.selected_sensor,
      ha_url: store.ha_url,
    });
  } catch (err) {
    const last_connection = storage.updateLastConnection({
      at: new Date().toISOString(),
      ok: false,
      error: err.message,
    });
    res.json({
      configured: true,
      connected: false,
      error: err.message,
      last_connection,
      selected_sensor: store.selected_sensor,
      ha_url: store.ha_url,
    });
  }
});

router.post('/connection/test', async (req, res) => {
  try {
    const store = storage.readStore();
    const result = await ha.testConnection(store);
    storage.updateLastConnection({
      at: new Date().toISOString(),
      ok: true,
      location_name: result.location_name,
      version: result.version,
      error: '',
    });
    res.json(result);
  } catch (err) {
    storage.updateLastConnection({
      at: new Date().toISOString(),
      ok: false,
      error: err.message,
    });
    res.status(400).json({ connected: false, error: err.message });
  }
});

router.get('/sensors', async (req, res) => {
  try {
    const store = storage.readStore();
    const sensors = await ha.fetchPresenceSensors(store);
    res.json({ sensors, selected: store.selected_sensor });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sensors/select', (req, res) => {
  const { entity_id } = req.body;
  if (!entity_id) return res.status(400).json({ error: 'entity_id is required' });
  const store = storage.updateStore({ selected_sensor: entity_id });
  res.json({
    selected_sensor: store.selected_sensor,
    message: 'Sensor selection saved',
  });
});

router.get('/sensors/ld2410-bundle', async (req, res) => {
  try {
    const store = storage.readStore();
    const sensor = req.query.sensor || store.selected_sensor;
    if (!sensor) return res.status(400).json({ error: 'No sensor selected' });

    const allStates = await ha.fetchAllStates(store);
    const registryMaps = await loadRegistryMaps(store);
    const bundle = discoverLd2410Bundle(allStates, sensor, registryMaps);
    res.json({ sensor, bundle });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sensors/engineering-mode', async (req, res) => {
  try {
    const store = storage.readStore();
    const sensor = req.body.sensor || store.selected_sensor;
    if (!sensor) return res.status(400).json({ error: 'No sensor selected' });

    const enable = req.body.enable !== false;
    const allStates = await ha.fetchAllStates(store);
    const registryMaps = await loadRegistryMaps(store);
    const bundle = discoverLd2410Bundle(allStates, sensor, registryMaps);
    const result = await ha.ensureEngineeringMode(store, bundle, {
      enable,
      waitMs: enable ? 2500 : 500,
    });
    res.json({ sensor, bundle, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/sensors/related-entities', async (req, res) => {
  try {
    const store = storage.readStore();
    if (!store.selected_sensor) {
      return res.status(400).json({ error: 'No sensor selected' });
    }
    const allStates = await ha.fetchAllStates(store);
    const numbers = ha.findLd2410NumberEntities(allStates, store.selected_sensor);
    res.json({
      sensor: store.selected_sensor,
      entities: numbers.map((n) => ({
        entity_id: n.entity_id,
        friendly_name: n.attributes?.friendly_name,
        state: n.state,
        min: n.attributes?.min,
        max: n.attributes?.max,
        classification: ha.classifyNumberEntity(n.entity_id, n.attributes?.friendly_name),
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/calibration/start', async (req, res) => {
  try {
    const store = storage.readStore();
    if (!store.selected_sensor) {
      return res.status(400).json({ error: 'No sensor selected' });
    }
    if (!store.ha_url || !store.token) {
      return res.status(400).json({ error: 'Home Assistant not configured' });
    }

    const duration = Number(req.body.duration) || 60;
    const stillBaseline = Boolean(req.body.still_baseline);
    const calibrationMode = req.body.calibration_mode || 'empty_room';
    const turnOffEngineeringAfter = req.body.turn_off_engineering_after !== false;
    const autoEngineeringMode = req.body.auto_engineering_mode !== false;

    if (duration < 60 || duration > 600) {
      return res.status(400).json({ error: 'Duration must be between 60 and 600 seconds (1–10 minutes)' });
    }

    const allStates = await ha.fetchAllStates(store);
    const registryMaps = await loadRegistryMaps(store);
    const bundle = discoverLd2410Bundle(allStates, store.selected_sensor, registryMaps);

    let engineeringModeMeta = null;
    if (autoEngineeringMode && bundle.engineering_mode_switch) {
      engineeringModeMeta = await ha.ensureEngineeringMode(store, bundle, {
        enable: true,
        waitMs: 2500,
      });
      // Refresh bundle after enabling engineering mode
      const refreshed = await ha.fetchAllStates(store);
      Object.assign(bundle, discoverLd2410Bundle(refreshed, store.selected_sensor, registryMaps));
    }

    const wss = req.app.get('wss');
    const session = await calibration.startSession(
      store.selected_sensor,
      duration,
      {
        stillBaseline,
        calibrationMode,
        turnOffEngineeringAfter,
        bundle,
        engineeringModeMeta,
      },
      buildPollFn(store, bundle),
      buildOnStopFn(store, bundle, turnOffEngineeringAfter),
      (data) => broadcastCalibration(wss, data)
    );

    res.json(session.getStatus());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/calibration/stop', async (req, res) => {
  const session = await calibration.stopSession();
  if (!session) return res.status(404).json({ error: 'No active session' });
  res.json({
    ...session.getStatus(),
    result: session.result,
  });
});

router.get('/calibration/status', (req, res) => {
  const session = calibration.getActiveSession();
  if (!session) return res.json({ status: 'idle' });
  res.json(session.getStatus());
});

router.get('/calibration/result', (req, res) => {
  const session = calibration.getActiveSession();
  if (!session || !session.result) {
    return res.status(404).json({ error: 'No calibration result available' });
  }
  res.json({
    status: session.status,
    result: session.result,
    sensor: session.sensorEntityId,
  });
});

router.post('/calibration/apply', async (req, res) => {
  try {
    const store = storage.readStore();
    const session = calibration.getActiveSession();
    const profile = req.body.profile || session?.result;

    if (!profile) {
      return res.status(400).json({ error: 'No calibration profile to apply' });
    }

    const sensor = req.body.sensor || store.selected_sensor || session?.sensorEntityId;
    if (!sensor) {
      return res.status(400).json({ error: 'No sensor specified' });
    }

    const result = await ha.applyCalibration(store, sensor, profile);

    const calibrationRecord = {
      id: profile.id || uuidv4(),
      sensor,
      timestamp: new Date().toISOString(),
      gates: profile.gates,
      zones: profile.zones,
      yaml: profile.yaml,
    };
    storage.addCalibration(calibrationRecord);

    res.json({ success: true, ...result, calibration: calibrationRecord });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/calibrations', (req, res) => {
  const store = storage.readStore();
  res.json({ calibrations: store.calibrations || [] });
});

router.get('/backups', (req, res) => {
  const backups = storage.listBackupFiles();
  res.json({ backups });
});

router.post('/backups', (req, res) => {
  const store = storage.readStore();
  const session = calibration.getActiveSession();
  const profile = req.body.profile || session?.result;

  if (!profile) {
    return res.status(400).json({ error: 'No profile to backup' });
  }

  const backup = {
    id: uuidv4(),
    sensor: req.body.sensor || store.selected_sensor,
    timestamp: new Date().toISOString(),
    gates: profile.gates,
    zones: profile.zones,
    yaml: profile.yaml,
    name: req.body.name || `Backup ${new Date().toLocaleString()}`,
  };

  const saved = storage.saveBackupFile(backup);
  res.json({ backup: saved });
});

router.post('/backups/:id/restore', async (req, res) => {
  try {
    const backup = storage.readBackupFile(req.params.id);
    if (!backup) return res.status(404).json({ error: 'Backup not found' });

    const store = storage.readStore();
    const sensor = req.body.sensor || backup.sensor || store.selected_sensor;
    if (!sensor) return res.status(400).json({ error: 'No sensor specified' });

    const result = await ha.applyCalibration(store, sensor, backup);
    res.json({ success: true, backup, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/sensors/current-calibration', async (req, res) => {
  try {
    const store = storage.readStore();
    const sensor = req.query.sensor || store.selected_sensor;
    if (!sensor) return res.status(400).json({ error: 'No sensor selected' });

    const profile = await ha.fetchCurrentCalibration(store, sensor);
    if (!Object.keys(profile.gates).length && !Object.keys(profile.zones).length) {
      return res.status(404).json({
        error: 'No gate threshold entities found for this sensor in Home Assistant',
      });
    }
    res.json(profile);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/sensors/dashboard', async (req, res) => {
  try {
    const store = storage.readStore();
    const sensor = req.query.sensor || store.selected_sensor;
    if (!sensor) return res.status(400).json({ error: 'No sensor selected' });

    const registryMaps = await loadRegistryMaps(store);
    const dashboard = await ha.fetchSensorDashboard(store, sensor, registryMaps);
    res.json(dashboard);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/backups/from-current', async (req, res) => {
  try {
    const store = storage.readStore();
    const sensor = req.body.sensor || store.selected_sensor;
    if (!sensor) return res.status(400).json({ error: 'No sensor selected' });

    const profile = await ha.fetchCurrentCalibration(store, sensor);
    if (!Object.keys(profile.gates).length && !Object.keys(profile.zones).length) {
      return res.status(404).json({
        error: 'No gate threshold entities found for this sensor in Home Assistant',
      });
    }

    const backup = {
      ...profile,
      name: req.body.name || profile.name,
    };
    const saved = storage.saveBackupFile(backup);
    res.json({ backup: saved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/backups/:id/export', (req, res) => {
  const backup = storage.readBackupFile(req.params.id);
  if (!backup) return res.status(404).json({ error: 'Backup not found' });

  const filename = `ld2410-backup-${backup.id || 'export'}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(backup, null, 2));
});

router.post('/backups/import', (req, res) => {
  try {
    const store = storage.readStore();
    const data = req.body;

    if (!data || (!data.gates && !data.zones)) {
      return res.status(400).json({ error: 'Invalid calibration file: missing gates or zones' });
    }

    const backup = {
      id: uuidv4(),
      sensor: data.sensor || store.selected_sensor || '',
      timestamp: data.timestamp || new Date().toISOString(),
      gates: data.gates || {},
      zones: data.zones || {},
      yaml: data.yaml || '',
      name: data.name || `Imported ${new Date().toLocaleString()}`,
    };

    const saved = storage.saveBackupFile(backup);
    res.json({ backup: saved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/backups/:id', (req, res) => {
  storage.deleteBackupFile(req.params.id);
  res.json({ success: true });
});

module.exports = router;
