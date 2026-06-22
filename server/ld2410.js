const GATE_INDICES = Array.from({ length: 9 }, (_, i) => i);

function extractEntityPrefix(entityId) {
  const slug = (entityId.split('.')[1] || '').toLowerCase();
  const radarMatch = slug.match(/^(.+?)_radar(?:_|$)/);
  if (radarMatch) return radarMatch[1];

  const engMatch = slug.match(/^(.+?)_engineering_mode$/);
  if (engMatch) return engMatch[1].replace(/_radar$/, '');

  return slug
    .replace(/_?(radar_target|radar_moving_target|radar_still_target|radar_still|radar_moving|presence|motion|occupancy|detection_distance|engineering_mode).*$/i, '')
    .replace(/_+$/g, '');
}

function entityMatchesPrefix(entityId, prefix) {
  if (!prefix) return false;
  const slug = (entityId.split('.')[1] || '').toLowerCase();
  const p = prefix.toLowerCase();
  return slug === p || slug.startsWith(`${p}_`);
}

function buildRegistryMaps(registry) {
  const byEntity = new Map();
  const byDevice = new Map();

  for (const entry of registry || []) {
    byEntity.set(entry.entity_id, entry);
    if (entry.device_id) {
      if (!byDevice.has(entry.device_id)) byDevice.set(entry.device_id, []);
      byDevice.get(entry.device_id).push(entry.entity_id);
    }
  }

  return { byEntity, byDevice };
}

function findByDeviceOrPrefix(allStates, referenceEntityId, registryMaps = null) {
  const ref = allStates.find((s) => s.entity_id === referenceEntityId);
  const regEntry = registryMaps?.byEntity?.get(referenceEntityId);
  const deviceId = regEntry?.device_id;

  if (deviceId && registryMaps?.byDevice?.has(deviceId)) {
    const entityIds = new Set(registryMaps.byDevice.get(deviceId));
    const deviceEntities = allStates.filter((s) => entityIds.has(s.entity_id));
    if (deviceEntities.length) return deviceEntities;
  }

  const prefix = extractEntityPrefix(referenceEntityId);
  if (!prefix) return ref ? [ref] : [];

  return allStates.filter((s) => entityMatchesPrefix(s.entity_id, prefix));
}

function classifyGateEnergySensor(entityId, friendlyName = '') {
  const haystack = `${entityId} ${friendlyName}`.toLowerCase();
  const gateMatch = haystack.match(/\bg(\d)\b/);
  if (!gateMatch) return null;

  const gate = Number(gateMatch[1]);
  if (gate < 0 || gate > 8) return null;

  if (haystack.includes('move') && haystack.includes('energy')) {
    return { gate, type: 'move_energy' };
  }
  if (haystack.includes('still') && haystack.includes('energy')) {
    return { gate, type: 'still_energy' };
  }
  if (haystack.includes('energy')) {
    return { gate, type: 'energy' };
  }
  return null;
}

function findEngineeringModeSwitch(entities) {
  return entities.find((e) => {
    if (!e.entity_id.startsWith('switch.')) return false;
    const haystack = `${e.entity_id} ${e.attributes?.friendly_name || ''}`.toLowerCase();
    return haystack.includes('engineering') && (haystack.includes('radar') || haystack.includes('ld2410'));
  }) || entities.find((e) => {
    if (!e.entity_id.startsWith('switch.')) return false;
    const haystack = `${e.entity_id} ${e.attributes?.friendly_name || ''}`.toLowerCase();
    return haystack.includes('engineering_mode') || haystack.includes('engineering mode');
  });
}

function isLd2410RadarSensor(entity) {
  const domain = entity.entity_id.split('.')[0];
  if (domain !== 'binary_sensor' && domain !== 'sensor') return false;

  const haystack = `${entity.entity_id} ${entity.attributes?.friendly_name || ''}`.toLowerCase();
  if (haystack.includes('zone') && haystack.includes('occupancy')) return false;

  return (
    haystack.includes('radar') ||
    haystack.includes('ld2410') ||
    (domain === 'binary_sensor' && (
      haystack.includes('target') ||
      haystack.includes('presence') ||
      haystack.includes('motion') ||
      haystack.includes('occupancy')
    ))
  );
}

/** Main presence sensor only — excludes radar_moving_target and radar_still_target. */
function isPrimaryRadarTarget(entity) {
  if (!entity?.entity_id?.startsWith('binary_sensor.')) return false;
  if (!isLd2410RadarSensor(entity)) return false;

  const slug = (entity.entity_id.split('.')[1] || '').toLowerCase();
  const name = (entity.attributes?.friendly_name || '').toLowerCase();
  const haystack = `${slug} ${name}`;

  if (haystack.includes('moving_target') || haystack.includes('moving target')) return false;
  if (haystack.includes('still_target') || haystack.includes('still target')) return false;

  return (
    slug.endsWith('_radar_target') ||
    slug.endsWith('_has_target') ||
    (haystack.includes('radar') && haystack.includes('target'))
  );
}

function pickPrimarySensor(entities) {
  const candidates = (entities || []).filter(isPrimaryRadarTarget);
  if (!candidates.length) return null;

  const ranked = [...candidates].sort((a, b) => {
    const score = (e) => {
      const slug = (e.entity_id.split('.')[1] || '').toLowerCase();
      if (slug.endsWith('_radar_target')) return 0;
      if (slug.includes('has_target')) return 1;
      return 2;
    };
    return score(a) - score(b);
  });

  return ranked[0];
}

function discoverLd2410Devices(allStates, registryMaps = null) {
  const devices = new Map();

  const engSwitches = allStates.filter((e) => {
    if (!e.entity_id.startsWith('switch.')) return false;
    const haystack = `${e.entity_id} ${e.attributes?.friendly_name || ''}`.toLowerCase();
    return haystack.includes('engineering');
  });

  for (const sw of engSwitches) {
    const entities = findByDeviceOrPrefix(allStates, sw.entity_id, registryMaps);
    const bundle = discoverLd2410Bundle(allStates, sw.entity_id, registryMaps);
    if (!bundle.engineering_mode_switch) continue;

    const sensors = entities.filter((e) => e.entity_id.startsWith('binary_sensor.') && isLd2410RadarSensor(e));

    devices.set(bundle.device_prefix || sw.entity_id, {
      prefix: bundle.device_prefix,
      engineering_mode_switch: bundle.engineering_mode_switch,
      sensors,
      bundle,
    });
  }

  return devices;
}

function findEntityByPattern(entities, patterns) {
  return entities.find((e) => {
    const haystack = `${e.entity_id} ${e.attributes?.friendly_name || ''}`.toLowerCase();
    return patterns.some((p) => haystack.includes(p));
  });
}

function isValidSensorValue(state) {
  if (state == null) return false;
  const s = String(state).toLowerCase();
  if (['unknown', 'unavailable', 'none', ''].includes(s)) return false;
  return Number.isFinite(Number(state));
}

function discoverLd2410Bundle(allStates, sensorEntityId, registryMaps = null) {
  const entities = findByDeviceOrPrefix(allStates, sensorEntityId, registryMaps);
  const prefix = extractEntityPrefix(sensorEntityId);

  const engineeringSwitch = findEngineeringModeSwitch(entities);

  const gateSensors = {};
  for (const entity of entities) {
    if (!entity.entity_id.startsWith('sensor.')) continue;
    const classified = classifyGateEnergySensor(
      entity.entity_id,
      entity.attributes?.friendly_name || ''
    );
    if (!classified) continue;

    const gateKey = `g${classified.gate}`;
    if (!gateSensors[gateKey]) gateSensors[gateKey] = {};

    if (classified.type === 'move_energy') {
      gateSensors[gateKey].move_energy = entity.entity_id;
    } else if (classified.type === 'still_energy') {
      gateSensors[gateKey].still_energy = entity.entity_id;
    } else if (classified.type === 'energy') {
      gateSensors[gateKey].energy = entity.entity_id;
    }
  }

  const detectionDistance = findEntityByPattern(entities, [
    'detection_distance',
    'radar detection distance',
  ]);

  const movingTarget = findEntityByPattern(entities, [
    'moving_target',
    'radar moving target',
    'has_moving_target',
  ]);

  const stillTarget = findEntityByPattern(entities, [
    'still_target',
    'radar still target',
    'has_still_target',
  ]);

  const hasTarget = findEntityByPattern(entities, [
    'radar_target',
    'has_target',
  ]) || entities.find((e) => e.entity_id === sensorEntityId);

  let gateDataAvailable = false;
  for (const gateKey of Object.keys(gateSensors)) {
    const gs = gateSensors[gateKey];
    const ids = [gs.move_energy, gs.still_energy, gs.energy].filter(Boolean);
    for (const id of ids) {
      const ent = entities.find((e) => e.entity_id === id);
      if (ent && isValidSensorValue(ent.state)) {
        gateDataAvailable = true;
        break;
      }
    }
    if (gateDataAvailable) break;
  }

  const engineeringOn = engineeringSwitch
    ? String(engineeringSwitch.state).toLowerCase() === 'on'
    : null;

  return {
    device_prefix: prefix,
    primary_sensor: sensorEntityId,
    engineering_mode_switch: engineeringSwitch
      ? {
          entity_id: engineeringSwitch.entity_id,
          friendly_name: engineeringSwitch.attributes?.friendly_name,
          state: engineeringSwitch.state,
        }
      : null,
    engineering_mode_on: engineeringOn,
    gate_sensors: gateSensors,
    gate_data_available: gateDataAvailable,
    detection_distance: detectionDistance?.entity_id || null,
    moving_target: movingTarget?.entity_id || null,
    still_target: stillTarget?.entity_id || null,
    has_target: hasTarget?.entity_id || sensorEntityId,
    entity_count: entities.length,
  };
}

function getEntityIdsToPoll(bundle) {
  const ids = new Set([bundle.primary_sensor, bundle.has_target]);

  if (bundle.detection_distance) ids.add(bundle.detection_distance);
  if (bundle.moving_target) ids.add(bundle.moving_target);
  if (bundle.still_target) ids.add(bundle.still_target);
  if (bundle.engineering_mode_switch) ids.add(bundle.engineering_mode_switch.entity_id);

  for (const gateKey of Object.keys(bundle.gate_sensors || {})) {
    const gs = bundle.gate_sensors[gateKey];
    if (gs.move_energy) ids.add(gs.move_energy);
    if (gs.still_energy) ids.add(gs.still_energy);
    if (gs.energy) ids.add(gs.energy);
  }

  return [...ids].filter(Boolean);
}

module.exports = {
  discoverLd2410Bundle,
  discoverLd2410Devices,
  getEntityIdsToPoll,
  buildRegistryMaps,
  findByDeviceOrPrefix,
  isLd2410RadarSensor,
  isPrimaryRadarTarget,
  pickPrimarySensor,
  extractEntityPrefix,
  classifyGateEnergySensor,
  isValidSensorValue,
  GATE_INDICES,
};
