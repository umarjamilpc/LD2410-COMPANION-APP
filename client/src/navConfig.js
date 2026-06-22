export const ROUTES = {
  homeAssistant: '/home-assistant',
  sensors: '/sensors',
  liveMonitor: '/live-monitor',
  manualTweaking: '/manual-tweaking',
  calibration: '/calibration',
  thresholds: '/thresholds',
  backups: '/backups',
  themes: '/themes',
};

/** Old bookmark / saved nav_order paths → current routes */
export const LEGACY_ROUTE_MAP = {
  '/': ROUTES.homeAssistant,
  '/dashboard': ROUTES.liveMonitor,
  '/comparison': ROUTES.manualTweaking,
  '/results': ROUTES.thresholds,
  '/backup': ROUTES.backups,
};

export function normalizeRoute(path) {
  return LEGACY_ROUTE_MAP[path] || path;
}

export function migrateNavOrder(order) {
  if (!Array.isArray(order)) return null;
  const seen = new Set();
  return order
    .map((path) => normalizeRoute(path))
    .filter((path) => {
      if (seen.has(path)) return false;
      seen.add(path);
      return true;
    });
}

export const DEFAULT_NAV = [
  { id: 'setup', to: ROUTES.homeAssistant, label: 'Home Assistant' },
  { id: 'sensors', to: ROUTES.sensors, label: 'Sensors' },
  { id: 'liveMonitor', to: ROUTES.liveMonitor, label: 'Live Monitor' },
  { id: 'manualTweaking', to: ROUTES.manualTweaking, label: 'Manual Tweaking' },
  { id: 'calibration', to: ROUTES.calibration, label: 'Calibration' },
  { id: 'thresholds', to: ROUTES.thresholds, label: 'Thresholds' },
  { id: 'backups', to: ROUTES.backups, label: 'Backups' },
  { id: 'themes', to: ROUTES.themes, label: 'Themes' },
];

export const DEFAULT_NAV_ORDER = DEFAULT_NAV.map((item) => item.to);

export function orderNavItems(items, order) {
  const migrated = migrateNavOrder(order);
  if (!migrated?.length) return items;
  const byPath = new Map(items.map((item) => [item.to, item]));
  const ordered = migrated.map((to) => byPath.get(to)).filter(Boolean);
  const remaining = items.filter((item) => !migrated.includes(item.to));
  return [...ordered, ...remaining];
}
