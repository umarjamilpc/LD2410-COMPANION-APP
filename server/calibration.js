const { v4: uuidv4 } = require('uuid');
const { isValidSensorValue } = require('./ld2410');

const GATE_NAMES = Array.from({ length: 9 }, (_, i) => `g${i}`);

function parseGateValue(attrs, gate) {
  const patterns = [
    gate,
    `${gate}_energy`,
    `${gate}_move_energy`,
    `${gate}_still_energy`,
    `gate_${gate.slice(1)}`,
    `gate${gate.slice(1)}`,
  ];

  for (const key of Object.keys(attrs || {})) {
    const lower = key.toLowerCase();
    for (const p of patterns) {
      if (lower === p.toLowerCase()) {
        const val = Number(attrs[key]);
        return Number.isFinite(val) ? val : null;
      }
    }
  }
  return null;
}

function parseDistance(attrs, state) {
  const distanceKeys = [
    'distance',
    'detection_distance',
    'move_distance',
    'moving_distance',
    'still_distance',
    'target_distance',
  ];

  for (const key of distanceKeys) {
    if (attrs[key] != null) {
      const val = Number(attrs[key]);
      if (Number.isFinite(val)) return val;
    }
    const found = Object.keys(attrs || {}).find(
      (k) => k.toLowerCase() === key || k.toLowerCase().includes(key)
    );
    if (found) {
      const val = Number(attrs[found]);
      if (Number.isFinite(val)) return val;
    }
  }

  const uom = attrs?.unit_of_measurement;
  if (uom === 'cm' || uom === 'm') {
    const val = Number(state);
    if (Number.isFinite(val)) return val;
  }

  return null;
}

function isMotionDetected(state, attrs) {
  const motionStates = ['on', 'detected', 'occupied', 'true', '1'];
  const s = String(state).toLowerCase();
  if (motionStates.includes(s)) return true;
  if (attrs?.target !== undefined) return Boolean(attrs.target);
  if (attrs?.occupancy !== undefined) return Boolean(attrs.occupancy);
  if (attrs?.motion !== undefined) return Boolean(attrs.motion);
  return false;
}

function buildSampleFromEntities(bundle, statesMap) {
  const primary = statesMap[bundle.primary_sensor] || statesMap[bundle.has_target];
  const attrs = primary?.attributes || {};

  let motion = false;
  if (bundle.moving_target && statesMap[bundle.moving_target]) {
    const mt = statesMap[bundle.moving_target];
    motion = isMotionDetected(mt.state, mt.attributes);
  } else if (primary) {
    motion = isMotionDetected(primary.state, attrs);
  }

  let presence = false;
  const targetEntity = bundle.has_target && statesMap[bundle.has_target]
    ? statesMap[bundle.has_target]
    : primary;
  if (targetEntity) {
    presence = isMotionDetected(targetEntity.state, targetEntity.attributes);
  }

  let distance = null;
  if (bundle.detection_distance && statesMap[bundle.detection_distance]) {
    const d = Number(statesMap[bundle.detection_distance].state);
    if (Number.isFinite(d)) distance = d;
  }
  if (distance == null && primary) {
    distance = parseDistance(attrs, primary.state);
  }

  const gates = {};
  for (const g of GATE_NAMES) {
    const gs = bundle.gate_sensors?.[g];
    if (gs) {
      const entry = {};
      if (gs.move_energy && statesMap[gs.move_energy]) {
        const v = Number(statesMap[gs.move_energy].state);
        if (isValidSensorValue(statesMap[gs.move_energy].state)) entry.move = v;
      }
      if (gs.still_energy && statesMap[gs.still_energy]) {
        const v = Number(statesMap[gs.still_energy].state);
        if (isValidSensorValue(statesMap[gs.still_energy].state)) entry.still = v;
      }
      if (gs.energy && statesMap[gs.energy]) {
        const v = Number(statesMap[gs.energy].state);
        if (isValidSensorValue(statesMap[gs.energy].state)) entry.energy = v;
      }
      if (Object.keys(entry).length) gates[g] = entry;
    }
  }

  // Fallback: gate values on primary entity attributes (legacy / other integrations)
  if (primary) {
    for (const g of GATE_NAMES) {
      if (gates[g]) continue;
      const val = parseGateValue(attrs, g);
      if (val != null) gates[g] = { energy: val };
    }
  }

  const engSw = bundle.engineering_mode_switch;
  const engineeringMode =
    engSw && statesMap[engSw.entity_id]
      ? String(statesMap[engSw.entity_id].state).toLowerCase() === 'on'
      : null;

  return {
    timestamp: Date.now(),
    state: primary?.state,
    motion,
    presence,
    distance,
    gates,
    engineering_mode: engineeringMode,
    attributes: attrs,
  };
}

function extractSample(entityState) {
  const attrs = entityState.attributes || {};
  const gates = {};

  for (const g of GATE_NAMES) {
    const val = parseGateValue(attrs, g);
    if (val != null) gates[g] = val;
  }

  for (const key of Object.keys(attrs)) {
    const match = key.match(/^g(\d)$/i);
    if (match) {
      const g = `g${match[1]}`;
      const val = Number(attrs[key]);
      if (Number.isFinite(val)) gates[g] = val;
    }
    const match2 = key.match(/gate[_\s]?(\d)/i);
    if (match2) {
      const g = `g${match2[1]}`;
      const val = Number(attrs[key]);
      if (Number.isFinite(val)) gates[g] = val;
    }
  }

  return {
    timestamp: Date.now(),
    state: entityState.state,
    motion: isMotionDetected(entityState.state, attrs),
    distance: parseDistance(attrs, entityState.state),
    gates,
    attributes: attrs,
  };
}

function stats(values) {
  if (!values.length) return { avg: 0, min: 0, max: 0, count: 0, p95: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  const sorted = [...values].sort((a, b) => a - b);
  const p95idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    avg: sum / values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[p95idx],
    count: values.length,
  };
}

const DEFAULT_THRESHOLD_BUFFER_PCT = 5;

function clampThreshold(n) {
  return Math.max(1, Math.min(100, Math.ceil(n)));
}

/** LD2410: 0 = most sensitive, 100 = least sensitive (effectively off). */
function thresholdFromPeak(peak, bufferPct = 5) {
  const pct = Number.isFinite(bufferPct) ? bufferPct : 5;
  return clampThreshold(peak * (1 + pct / 100));
}

function suggestMaxThreshold(stillValues, moveValues, bufferPct = 5) {
  if (!stillValues.length && !moveValues.length) {
    return { still_threshold: 50, move_threshold: 55 };
  }

  const stillMax = stillValues.length ? Math.max(...stillValues) : null;
  const moveMax = moveValues.length ? Math.max(...moveValues) : null;

  if (stillMax != null && moveMax != null) {
    return {
      still_threshold: thresholdFromPeak(stillMax, bufferPct),
      move_threshold: thresholdFromPeak(moveMax, bufferPct),
    };
  }

  const peak = stillMax ?? moveMax;
  const th = thresholdFromPeak(peak, bufferPct);
  return {
    still_threshold: th,
    move_threshold: th,
  };
}

function filterWarmupSamples(samples, warmupSec = 5) {
  if (!samples.length || warmupSec <= 0) return samples;
  const start = samples[0].timestamp;
  return samples.filter((s) => s.timestamp - start >= warmupSec * 1000);
}

function computeProfile(samples, options = {}) {
  const {
    warmupSec = 5,
    thresholdBufferPct = DEFAULT_THRESHOLD_BUFFER_PCT,
  } = options;

  const afterWarmup = filterWarmupSamples(samples, warmupSec);
  const contaminated = afterWarmup.filter((s) => s.presence || s.motion);
  const clean = afterWarmup.filter((s) => !s.presence && !s.motion);

  const analysisSamples = clean.length >= Math.max(10, afterWarmup.length * 0.25)
    ? clean
    : afterWarmup;
  const stillSamples = analysisSamples;
  const motionSamples = analysisSamples;

  const gates = {};
  const allGateKeys = new Set();
  samples.forEach((s) => Object.keys(s.gates).forEach((g) => allGateKeys.add(g)));
  GATE_NAMES.forEach((g) => allGateKeys.add(g));

  for (const gate of allGateKeys) {
    const stillGate = analysisSamples
      .map((s) => s.gates[gate]?.still ?? s.gates[gate]?.energy)
      .filter((v) => v != null);
    const motionGate = analysisSamples
      .map((s) => s.gates[gate]?.move ?? s.gates[gate]?.energy)
      .filter((v) => v != null);
    const stillGateStats = stillSamples
      .map((s) => s.gates[gate]?.still ?? s.gates[gate]?.energy)
      .filter((v) => v != null);
    const motionGateStats = motionSamples
      .map((s) => s.gates[gate]?.move ?? s.gates[gate]?.energy)
      .filter((v) => v != null);
    const allGate = samples
      .map((s) => {
        const g = s.gates[gate];
        if (!g) return null;
        return g.move ?? g.still ?? g.energy ?? null;
      })
      .filter((v) => v != null);

    const thresholds = suggestMaxThreshold(stillGate, motionGate, thresholdBufferPct);

    gates[gate] = {
      still: stats(stillGateStats),
      motion: stats(motionGateStats),
      overall: stats(allGate),
      still_threshold: thresholds.still_threshold,
      move_threshold: thresholds.move_threshold,
    };
  }

  const distances = analysisSamples.map((s) => s.distance).filter((v) => v != null && v > 0);
  const stillDist = stillSamples.map((s) => s.distance).filter((v) => v != null && v > 0);
  const motionDist = motionSamples.map((s) => s.distance).filter((v) => v != null && v > 0);

  const zones = {
    max_still_distance: stillDist.length
      ? Math.ceil(stats(stillDist).max)
      : distances.length
        ? Math.ceil(stats(distances).max)
        : null,
    max_move_distance: motionDist.length
      ? Math.ceil(stats(motionDist).max)
      : distances.length
        ? Math.ceil(stats(distances).max)
        : null,
    detection_gate: distances.length ? Math.ceil(stats(distances).max) : null,
  };

  const motionCount = afterWarmup.filter((s) => s.motion || s.presence).length;
  const stillCount = afterWarmup.length - motionCount;
  const contaminationPct = afterWarmup.length
    ? Math.round((contaminated.length / afterWarmup.length) * 100)
    : 0;

  return {
    id: uuidv4(),
    gates,
    zones,
    summary: {
      mode: 'empty_room',
      threshold_buffer_pct: thresholdBufferPct,
      total_samples: samples.length,
      analysis_samples: analysisSamples.length,
      clean_samples: clean.length,
      contaminated_samples: contaminated.length,
      contamination_pct: contaminationPct,
      motion_samples: motionCount,
      still_samples: stillCount,
      warmup_sec: warmupSec,
      duration_ms: samples.length > 1 ? samples[samples.length - 1].timestamp - samples[0].timestamp : 0,
      quality:
        contaminationPct > 20
          ? 'poor'
          : contaminationPct > 5
            ? 'fair'
            : 'good',
    },
    yaml: generateYaml(gates, zones),
  };
}

function generateYaml(gates, zones) {
  const lines = ['# LD2410 calibration profile', ''];

  const moveGates = GATE_NAMES.filter((g) => gates[g]?.move_threshold != null);
  if (moveGates.length) {
    lines.push('move_threshold:');
    for (const g of moveGates) {
      lines.push(`  ${g}: ${gates[g].move_threshold}`);
    }
    lines.push('');
  }

  const stillGates = GATE_NAMES.filter((g) => gates[g]?.still_threshold != null);
  if (stillGates.length) {
    lines.push('still_threshold:');
    for (const g of stillGates) {
      lines.push(`  ${g}: ${gates[g].still_threshold}`);
    }
    lines.push('');
  }

  if (zones.max_move_distance != null) {
    lines.push(`max_move_distance: ${zones.max_move_distance}`);
  }
  if (zones.max_still_distance != null) {
    lines.push(`max_still_distance: ${zones.max_still_distance}`);
  }
  if (zones.detection_gate != null) {
    lines.push(`detection_gate: ${zones.detection_gate}`);
  }

  return lines.join('\n');
}

class CalibrationSession {
  constructor(sensorEntityId, durationSec, options = {}) {
    this.id = uuidv4();
    this.sensorEntityId = sensorEntityId;
    this.durationSec = durationSec;
    this.thresholdBufferPct = options.thresholdBufferPct ?? DEFAULT_THRESHOLD_BUFFER_PCT;
    this.turnOffEngineeringAfter = options.turnOffEngineeringAfter !== false;
    this.bundle = options.bundle || null;
    this.engineeringModeMeta = options.engineeringModeMeta || null;
    this.samples = [];
    this.status = 'idle';
    this.startedAt = null;
    this.endsAt = null;
    this.result = null;
    this.error = null;
    this._interval = null;
    this._timeout = null;
    this._pollEntities = null;
    this._onStop = null;
    this._broadcast = null;
  }

  start(pollEntitiesFn, onStopFn, broadcastFn) {
    this._pollEntities = pollEntitiesFn;
    this._onStop = onStopFn;
    this._broadcast = broadcastFn;
    this.status = 'running';
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + this.durationSec * 1000;
    this.samples = [];

    if (this.engineeringModeMeta) {
      this._broadcast({
        type: 'engineering_mode',
        sessionId: this.id,
        ...this.engineeringModeMeta,
      });
    }

    this._poll();
    this._interval = setInterval(() => this._poll(), 500);
    this._timeout = setTimeout(() => this.stop(), this.durationSec * 1000);
  }

  async _poll() {
    if (this.status !== 'running') return;
    try {
      const statesMap = await this._pollEntities();
      const sample = this.bundle
        ? buildSampleFromEntities(this.bundle, statesMap)
        : extractSample(statesMap[this.sensorEntityId] || Object.values(statesMap)[0]);

      this.samples.push(sample);

      const elapsed = Date.now() - this.startedAt;
      const remaining = Math.max(0, this.endsAt - Date.now());

      this._broadcast({
        type: 'sample',
        sessionId: this.id,
        sample,
        progress: Math.min(100, (elapsed / (this.durationSec * 1000)) * 100),
        remaining_ms: remaining,
        sample_count: this.samples.length,
        engineering_mode: sample.engineering_mode,
        gates_available: Object.keys(sample.gates || {}).length,
      });
    } catch (err) {
      this.error = err.message;
      this._broadcast({
        type: 'error',
        sessionId: this.id,
        error: err.message,
      });
    }
  }

  async stop() {
    if (this._interval) clearInterval(this._interval);
    if (this._timeout) clearTimeout(this._timeout);
    this._interval = null;
    this._timeout = null;

    if (this.status === 'running' || this.status === 'idle') {
      this.status = 'completed';
      this.result = computeProfile(this.samples, {
        warmupSec: 5,
        thresholdBufferPct: this.thresholdBufferPct,
      });

      let engineeringRestore = null;
      if (this._onStop) {
        try {
          engineeringRestore = await this._onStop(this);
        } catch (err) {
          engineeringRestore = { error: err.message };
        }
      }

      if (this._broadcast) {
        this._broadcast({
          type: 'completed',
          sessionId: this.id,
          result: this.result,
          samples: this.samples,
          engineering_mode_restore: engineeringRestore,
        });
      }
    }
  }

  getStatus() {
    const elapsed = this.startedAt ? Date.now() - this.startedAt : 0;
    const latest = this.samples[this.samples.length - 1] || null;
    return {
      id: this.id,
      sensor: this.sensorEntityId,
      status: this.status,
      durationSec: this.durationSec,
      thresholdBufferPct: this.thresholdBufferPct,
      turnOffEngineeringAfter: this.turnOffEngineeringAfter,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      elapsed_ms: elapsed,
      remaining_ms: this.endsAt ? Math.max(0, this.endsAt - Date.now()) : this.durationSec * 1000,
      sample_count: this.samples.length,
      error: this.error,
      latest_sample: latest,
      engineering_mode: latest?.engineering_mode ?? this.engineeringModeMeta?.current_state === 'on',
      engineering_mode_meta: this.engineeringModeMeta,
      bundle: this.bundle
        ? {
            gate_sensors: Object.keys(this.bundle.gate_sensors || {}).length,
            engineering_mode_switch: this.bundle.engineering_mode_switch?.entity_id,
            gate_data_available: this.bundle.gate_data_available,
          }
        : null,
      gates_available: latest ? Object.keys(latest.gates || {}).length : 0,
    };
  }
}

let activeSession = null;

function getActiveSession() {
  return activeSession;
}

async function startSession(sensorEntityId, durationSec, options, pollEntitiesFn, onStopFn, broadcastFn) {
  if (activeSession && activeSession.status === 'running') {
    throw new Error('A calibration session is already running');
  }
  activeSession = new CalibrationSession(sensorEntityId, durationSec, options);
  activeSession.start(pollEntitiesFn, onStopFn, broadcastFn);
  return activeSession;
}

async function stopSession() {
  if (!activeSession) return null;
  const session = activeSession;
  await session.stop();
  return session;
}

module.exports = {
  CalibrationSession,
  extractSample,
  buildSampleFromEntities,
  computeProfile,
  generateYaml,
  getActiveSession,
  startSession,
  stopSession,
  GATE_NAMES,
};
