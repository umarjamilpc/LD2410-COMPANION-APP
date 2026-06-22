const { v4: uuidv4 } = require('uuid');
const PRESENCE_KEYWORDS = ['motion', 'occupancy', 'presence', 'radar', 'ld2410'];
const { discoverLd2410Bundle, discoverLd2410Devices, buildRegistryMaps, pickPrimarySensor, isPrimaryRadarTarget } = require('./ld2410');

function normalizeUrl(url) {
  return url.replace(/\/+$/, '');
}

async function haFetch(store, endpoint, options = {}) {
  const base = normalizeUrl(store.ha_url);
  const token = store.token;
  if (!base || !token) {
    throw new Error('Home Assistant URL and token must be configured');
  }

  const url = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Home Assistant API error ${res.status}: ${text || res.statusText}`);
  }

  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

async function testConnection(store) {
  await haFetch(store, '/api/');
  const config = await haFetch(store, '/api/config');
  return {
    connected: true,
    location_name: config.location_name,
    version: config.version,
  };
}

function matchesPresenceFilter(entity) {
  const id = entity.entity_id.toLowerCase();
  const domain = id.split('.')[0];
  if (domain !== 'binary_sensor' && domain !== 'sensor') return false;
  const haystack = `${id} ${entity.attributes?.friendly_name || ''} ${entity.attributes?.device_class || ''}`.toLowerCase();
  return PRESENCE_KEYWORDS.some((kw) => haystack.includes(kw));
}

async function fetchAllStates(store) {
  return haFetch(store, '/api/states');
}

async function fetchEntityRegistry(store) {
  return haFetch(store, '/api/config/entity_registry/list');
}

function buildEsphomeEntitySet(registry) {
  return new Set(
    (registry || [])
      .filter((e) => e.platform === 'esphome')
      .map((e) => e.entity_id)
  );
}

function isZoneTemplateSensor(entity) {
  const haystack = `${entity.entity_id} ${entity.attributes?.friendly_name || ''}`.toLowerCase();
  return haystack.includes('zone') && haystack.includes('occupancy');
}

function mapPresenceSensor(entity, platform) {
  return {
    entity_id: entity.entity_id,
    state: entity.state,
    friendly_name: entity.attributes?.friendly_name || entity.entity_id,
    device_class: entity.attributes?.device_class || null,
    unit_of_measurement: entity.attributes?.unit_of_measurement || null,
    platform: platform || 'esphome',
    attributes: entity.attributes,
  };
}

function isEsphomeEntity(entityId, registryMaps, registryAvailable) {
  if (!registryAvailable) return true;
  const entry = registryMaps.byEntity.get(entityId);
  return entry?.platform === 'esphome';
}

async function fetchPresenceSensors(store) {
  const states = await fetchAllStates(store);

  let registry = [];
  let registryAvailable = false;
  try {
    registry = await fetchEntityRegistry(store);
    registryAvailable = Array.isArray(registry) && registry.length > 0;
  } catch {
    registryAvailable = false;
  }

  const registryMaps = buildRegistryMaps(registry);
  const devices = discoverLd2410Devices(states, registryMaps);
  const sensors = new Map();

  for (const device of devices.values()) {
    const primary = pickPrimarySensor(device.sensors);
    if (!primary) continue;
    if (!isEsphomeEntity(primary.entity_id, registryMaps, registryAvailable)) continue;
    sensors.set(primary.entity_id, mapPresenceSensor(primary, registryAvailable ? 'esphome' : 'ld2410'));
  }

  // Fallback: scan states if engineering-switch discovery found nothing
  if (sensors.size === 0) {
    for (const entity of states) {
      if (!entity.entity_id.startsWith('binary_sensor.')) continue;
      if (!isPrimaryRadarTarget(entity)) continue;
      if (isZoneTemplateSensor(entity)) continue;
      if (!isEsphomeEntity(entity.entity_id, registryMaps, registryAvailable)) continue;

      const bundle = discoverLd2410Bundle(states, entity.entity_id, registryMaps);
      if (!bundle.engineering_mode_switch) continue;

      sensors.set(entity.entity_id, mapPresenceSensor(entity, registryAvailable ? 'esphome' : 'ld2410'));
    }
  }

  return [...sensors.values()].sort((a, b) => a.friendly_name.localeCompare(b.friendly_name));
}

async function fetchEntityState(store, entityId) {
  return haFetch(store, `/api/states/${encodeURIComponent(entityId)}`);
}

async function callService(store, domain, service, data) {
  return haFetch(store, `/api/services/${domain}/${service}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function setSwitchState(store, entityId, on) {
  await callService(store, 'switch', on ? 'turn_on' : 'turn_off', {
    entity_id: entityId,
  });
}

async function fetchEntityStates(store, entityIds) {
  const states = {};
  await Promise.all(
    entityIds.map(async (id) => {
      states[id] = await fetchEntityState(store, id);
    })
  );
  return states;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureEngineeringMode(store, bundle, options = {}) {
  const { enable = true, waitMs = 2500 } = options;
  const sw = bundle?.engineering_mode_switch;

  if (!sw) {
    return {
      supported: false,
      changed: false,
      previous_state: null,
      current_state: null,
      message: 'No Radar Engineering Mode switch found for this device',
    };
  }

  const previousOn = String(sw.state).toLowerCase() === 'on';
  const targetOn = enable;

  if (previousOn === targetOn) {
    return {
      supported: true,
      changed: false,
      previous_state: previousOn ? 'on' : 'off',
      current_state: targetOn ? 'on' : 'off',
      entity_id: sw.entity_id,
      message: targetOn ? 'Engineering mode already enabled' : 'Engineering mode already disabled',
    };
  }

  await setSwitchState(store, sw.entity_id, targetOn);
  if (waitMs > 0) await delay(waitMs);

  const updated = await fetchEntityState(store, sw.entity_id);
  const currentOn = String(updated.state).toLowerCase() === 'on';

  return {
    supported: true,
    changed: true,
    previous_state: previousOn ? 'on' : 'off',
    current_state: currentOn ? 'on' : 'off',
    entity_id: sw.entity_id,
    message: currentOn
      ? 'Engineering mode enabled — gate energy sensors active'
      : 'Engineering mode disabled',
  };
}

function extractDeviceKey(entityId) {
  const parts = entityId.split('.')[1] || '';
  const stripped = parts
    .replace(/_?(presence|motion|occupancy|target|detection_distance|moving_target|still_target).*$/i, '')
    .replace(/_?ld2410.*$/i, '');
  return stripped || parts.split('_')[0] || parts;
}

function findLd2410NumberEntities(allStates, sensorEntityId) {
  const deviceKey = extractDeviceKey(sensorEntityId).toLowerCase();
  const sensorLower = sensorEntityId.toLowerCase();

  const numbers = allStates.filter((s) => s.entity_id.startsWith('number.'));

  const related = numbers.filter((n) => {
    const id = n.entity_id.toLowerCase();
    const name = (n.attributes?.friendly_name || '').toLowerCase();
    const haystack = `${id} ${name}`;
    const isLd2410 =
      haystack.includes('ld2410') ||
      haystack.includes('g0') ||
      haystack.includes('gate') ||
      haystack.includes('move_threshold') ||
      haystack.includes('still_threshold') ||
      haystack.includes('distance');

    if (!isLd2410) return false;

    if (id.includes(deviceKey) && deviceKey.length > 2) return true;
    if (sensorLower.split('.')[1] && id.includes(sensorLower.split('.')[1].slice(0, 8))) return true;

    const sensorPrefix = sensorLower.split('.')[1]?.replace(/_.*$/, '') || '';
    if (sensorPrefix.length > 3 && id.includes(sensorPrefix)) return true;

    return haystack.includes('ld2410');
  });

  return related;
}

function classifyNumberEntity(entityId, friendlyName = '') {
  const haystack = `${entityId} ${friendlyName}`.toLowerCase();

  for (let i = 0; i <= 8; i++) {
    const gate = `g${i}`;
    if (haystack.includes(`${gate}_move`) || haystack.includes(`gate ${i}`) && haystack.includes('move')) {
      return { type: 'move_threshold', gate: i };
    }
    if (haystack.includes(`${gate}_still`) || haystack.includes(`gate ${i}`) && haystack.includes('still')) {
      return { type: 'still_threshold', gate: i };
    }
    if (haystack.match(new RegExp(`\\bg${i}\\b`)) || haystack.includes(`gate_${i}`) || haystack.includes(`gate ${i}`)) {
      if (haystack.includes('still')) return { type: 'still_threshold', gate: i };
      if (haystack.includes('move')) return { type: 'move_threshold', gate: i };
    }
  }

  if (haystack.includes('max_move_distance') || haystack.includes('max move distance')) {
    return { type: 'zone', zone: 'max_move_distance' };
  }
  if (haystack.includes('max_still_distance') || haystack.includes('max still distance')) {
    return { type: 'zone', zone: 'max_still_distance' };
  }
  if (haystack.includes('detection_gate') || haystack.includes('distance gate')) {
    return { type: 'zone', zone: 'detection_gate' };
  }

  return { type: 'unknown' };
}

async function applyCalibration(store, sensorEntityId, profile) {
  const allStates = await fetchAllStates(store);
  const numberEntities = findLd2410NumberEntities(allStates, sensorEntityId);

  const updates = [];
  const skipped = [];

  for (const entity of numberEntities) {
    const classification = classifyNumberEntity(
      entity.entity_id,
      entity.attributes?.friendly_name || ''
    );

    let value = null;
    if (classification.type === 'move_threshold' && profile.gates) {
      const gateKey = `g${classification.gate}`;
      value = profile.gates[gateKey]?.move_threshold;
    } else if (classification.type === 'still_threshold' && profile.gates) {
      const gateKey = `g${classification.gate}`;
      value = profile.gates[gateKey]?.still_threshold;
    } else if (classification.type === 'zone' && profile.zones) {
      value = profile.zones[classification.zone];
    }

    if (value == null || value === '') {
      skipped.push({ entity_id: entity.entity_id, reason: 'no matching value' });
      continue;
    }

    const min = entity.attributes?.min ?? 0;
    const max = entity.attributes?.max ?? 100;
    const clamped = Math.max(min, Math.min(max, Number(value)));

    await callService(store, 'number', 'set_value', {
      entity_id: entity.entity_id,
      value: clamped,
    });

    updates.push({
      entity_id: entity.entity_id,
      value: clamped,
      classification,
    });
  }

  return { updates, skipped, numberEntitiesFound: numberEntities.length };
}

async function fetchCurrentCalibration(store, sensorEntityId) {
  const { buildRecordName } = require('./naming');
  const { generateYaml } = require('./calibration');

  const allStates = await fetchAllStates(store);
  const numberEntities = findLd2410NumberEntities(allStates, sensorEntityId);

  const gates = {};
  const zones = {};
  const entities = [];

  for (const entity of numberEntities) {
    const friendlyName = entity.attributes?.friendly_name || '';
    const classification = classifyNumberEntity(entity.entity_id, friendlyName);
    const val = Number(entity.state);
    if (!Number.isFinite(val)) continue;

    entities.push({
      entity_id: entity.entity_id,
      friendly_name: friendlyName,
      value: val,
      classification,
    });

    if (classification.type === 'move_threshold') {
      const gateKey = `g${classification.gate}`;
      if (!gates[gateKey]) gates[gateKey] = {};
      gates[gateKey].move_threshold = val;
    } else if (classification.type === 'still_threshold') {
      const gateKey = `g${classification.gate}`;
      if (!gates[gateKey]) gates[gateKey] = {};
      gates[gateKey].still_threshold = val;
    } else if (classification.type === 'zone') {
      zones[classification.zone] = val;
    }
  }

  const timestamp = new Date().toISOString();
  return {
    id: uuidv4(),
    sensor: sensorEntityId,
    timestamp,
    kind: 'ha_snapshot',
    gates,
    zones,
    yaml: generateYaml(gates, zones),
    name: buildRecordName({ kind: 'ha_snapshot', sensor: sensorEntityId, timestamp }),
    source: 'home_assistant',
    entities,
  };
}

function mapEntityRow(stateObj) {
  if (!stateObj) return null;
  return {
    entity_id: stateObj.entity_id,
    state: stateObj.state,
    friendly_name: stateObj.attributes?.friendly_name || stateObj.entity_id,
    unit: stateObj.attributes?.unit_of_measurement || null,
    device_class: stateObj.attributes?.device_class || null,
    min: stateObj.attributes?.min ?? null,
    max: stateObj.attributes?.max ?? null,
  };
}

async function fetchSensorDashboard(store, sensorEntityId, registryMaps) {
  const { discoverLd2410Bundle, getEntityIdsToPoll } = require('./ld2410');
  const { buildSampleFromEntities } = require('./calibration');

  const allStates = await fetchAllStates(store);
  const bundle = discoverLd2410Bundle(allStates, sensorEntityId, registryMaps);
  const pollIds = getEntityIdsToPoll(bundle);
  const numberEntities = findLd2410NumberEntities(allStates, sensorEntityId);
  const numberIds = numberEntities.map((n) => n.entity_id);

  const deviceEntities = allStates.filter((s) => {
    const prefix = bundle.device_prefix;
    if (!prefix) return false;
    const slug = (s.entity_id.split('.')[1] || '').toLowerCase();
    return slug === prefix || slug.startsWith(`${prefix}_`);
  });

  const allIds = [...new Set([...pollIds, ...numberIds, ...deviceEntities.map((e) => e.entity_id)])];
  const statesMap = await fetchEntityStates(store, allIds);
  const sample = buildSampleFromEntities(bundle, statesMap);

  const grouped = {
    binary_sensor: [],
    sensor: [],
    number: [],
    switch: [],
    other: [],
  };

  for (const id of allIds.sort()) {
    const row = mapEntityRow(statesMap[id]);
    if (!row) continue;
    const domain = id.split('.')[0];
    if (grouped[domain]) grouped[domain].push(row);
    else grouped.other.push(row);
  }

  for (const n of numberEntities) {
    if (!grouped.number.find((e) => e.entity_id === n.entity_id)) {
      const row = mapEntityRow(n);
      if (row) grouped.number.push(row);
    }
  }

  return {
    sensor: sensorEntityId,
    bundle,
    sample,
    grouped,
    entities: allIds.map((id) => mapEntityRow(statesMap[id])).filter(Boolean),
    updated_at: new Date().toISOString(),
  };
}

module.exports = {
  testConnection,
  fetchPresenceSensors,
  fetchEntityState,
  fetchEntityStates,
  fetchEntityRegistry,
  fetchAllStates,
  callService,
  setSwitchState,
  ensureEngineeringMode,
  applyCalibration,
  fetchCurrentCalibration,
  fetchSensorDashboard,
  findLd2410NumberEntities,
  classifyNumberEntity,
  extractDeviceKey,
  PRESENCE_KEYWORDS,
};
