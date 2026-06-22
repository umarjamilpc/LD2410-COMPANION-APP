import { useMemo } from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { useAppConfig } from './AppConfigContext';
import { useSensor } from './SensorContext';
import {
  DEFAULT_NAV,
  DEFAULT_NAV_ORDER,
  LEGACY_ROUTE_MAP,
  ROUTES,
  orderNavItems,
} from './navConfig';
import SetupPage from './pages/SetupPage';
import SensorsPage from './pages/SensorsPage';
import DashboardPage from './pages/DashboardPage';
import CalibrationPage from './pages/CalibrationPage';
import ResultsPage from './pages/ResultsPage';
import BackupPage from './pages/BackupPage';
import ComparisonPage from './pages/ComparisonPage';
import ThemesPage from './pages/ThemesPage';

export default function App() {
  const { config, connectionStatus, savePreferences } = useAppConfig();
  const { selectedSensor } = useSensor();

  const connected = connectionStatus?.connected;
  const configured = config?.ha_url && config?.token_set;

  const navItems = useMemo(
    () => orderNavItems(DEFAULT_NAV, config?.preferences?.nav_order),
    [config?.preferences?.nav_order]
  );

  function moveNavItem(index, direction) {
    const next = [...navItems];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    savePreferences({ nav_order: next.map((item) => item.to) }).catch(() => {});
  }

  function resetNavOrder() {
    savePreferences({ nav_order: DEFAULT_NAV_ORDER }).catch(() => {});
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h1>LD2410 Companion</h1>

        <div className="sidebar-status">
          {!configured ? (
            <span className="sidebar-status-pill idle">Not configured</span>
          ) : connected ? (
            <span className="sidebar-status-pill online">
              {connectionStatus.location_name || 'Connected'}
            </span>
          ) : (
            <span className="sidebar-status-pill offline">HA unreachable</span>
          )}
          {selectedSensor && (
            <div className="sidebar-sensor" title={selectedSensor}>
              Session: {selectedSensor.split('.')[1] || selectedSensor}
            </div>
          )}
        </div>

        <div className="sidebar-nav-header">
          <span>Menu</span>
          <button type="button" className="sidebar-nav-reset" onClick={resetNavOrder} title="Reset menu order">
            Reset order
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item, index) => (
            <div key={item.to} className="sidebar-nav-row">
              <NavLink to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                {item.label}
              </NavLink>
              <div className="sidebar-nav-move">
                <button
                  type="button"
                  className="sidebar-nav-btn"
                  onClick={() => moveNavItem(index, -1)}
                  disabled={index === 0}
                  title="Move up"
                  aria-label={`Move ${item.label} up`}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="sidebar-nav-btn"
                  onClick={() => moveNavItem(index, 1)}
                  disabled={index === navItems.length - 1}
                  title="Move down"
                  aria-label={`Move ${item.label} down`}
                >
                  ▼
                </button>
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to={ROUTES.homeAssistant} replace />} />
          <Route path={ROUTES.homeAssistant} element={<SetupPage />} />
          <Route path={ROUTES.sensors} element={<SensorsPage />} />
          <Route path={ROUTES.liveMonitor} element={<DashboardPage />} />
          <Route path={ROUTES.manualTweaking} element={<ComparisonPage />} />
          <Route path={ROUTES.calibration} element={<CalibrationPage />} />
          <Route path={ROUTES.thresholds} element={<ResultsPage />} />
          <Route path={ROUTES.backups} element={<BackupPage />} />
          <Route path={ROUTES.themes} element={<ThemesPage />} />
          {Object.entries(LEGACY_ROUTE_MAP).map(([legacy, current]) =>
            legacy === '/' ? null : (
              <Route key={legacy} path={legacy} element={<Navigate to={current} replace />} />
            )
          )}
        </Routes>
      </main>
    </div>
  );
}
