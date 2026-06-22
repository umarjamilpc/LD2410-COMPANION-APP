const KIND_LABELS = {
  session: 'Empty room calibration',
  ha_snapshot: 'HA gate snapshot',
  imported: 'Imported profile',
  applied: 'Applied to HA',
};

export function sensorShort(entityId) {
  if (!entityId) return 'unknown sensor';
  const part = entityId.split('.')[1] || entityId;
  return part.replace(/_/g, ' ');
}

export function formatLocalDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function recordDisplayName(record) {
  if (record?.name) return record.name;
  const label = KIND_LABELS[record?.kind] || 'Backup';
  return `${label} · ${sensorShort(record?.sensor)}`;
}

export function recordMetaLine(record) {
  const parts = [sensorShort(record?.sensor), formatLocalDateTime(record?.timestamp)];
  if (record?.kind) {
    parts.unshift(KIND_LABELS[record.kind] || record.kind);
  }
  return parts.filter(Boolean).join(' · ');
}

export function buildExportFilename(record) {
  const slug = (record?.sensor || 'sensor').split('.')[1] || 'sensor';
  const d = new Date(record?.timestamp || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  const when = Number.isNaN(d.getTime())
    ? 'unknown'
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const kind = record?.kind || 'backup';
  const shortId = (record?.id || 'export').slice(0, 8);
  return `ld2410-${kind}-${slug}-${when}-${shortId}.json`;
}
