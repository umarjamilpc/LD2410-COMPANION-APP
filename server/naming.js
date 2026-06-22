const KIND_LABELS = {
  session: 'Empty room calibration',
  ha_snapshot: 'HA gate snapshot',
  imported: 'Imported profile',
  applied: 'Applied to HA',
};

function sensorShort(entityId) {
  if (!entityId) return 'unknown sensor';
  const part = entityId.split('.')[1] || entityId;
  return part.replace(/_/g, '-');
}

function formatFilenameTimestamp(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return 'unknown-date';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z`;
}

function buildRecordName({ kind, sensor, timestamp, customName }) {
  if (customName && String(customName).trim()) return String(customName).trim();
  const label = KIND_LABELS[kind] || kind || 'Backup';
  return `${label} · ${sensorShort(sensor)} · ${formatFilenameTimestamp(timestamp)}`;
}

function buildExportFilename({ kind, sensor, timestamp, id }) {
  const slug = sensorShort(sensor);
  const when = formatFilenameTimestamp(timestamp);
  const shortId = (id || 'export').slice(0, 8);
  return `ld2410-${kind || 'backup'}-${slug}-${when}-${shortId}.json`;
}

module.exports = {
  KIND_LABELS,
  sensorShort,
  formatFilenameTimestamp,
  buildRecordName,
  buildExportFilename,
};
