import { useMemo, useState } from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { useAppConfig } from './AppConfigContext';
import {
  DEFAULT_NAV,
  DEFAULT_NAV_ORDER,
  LEGACY_ROUTE_MAP,
  ROUTES,
  orderNavItems,
} from './navConfig';
import { APP_VERSION } from './version';
import SetupPage from './pages/SetupPage';
import SensorsPage from './pages/SensorsPage';
import DashboardPage from './pages/DashboardPage';
import CalibrationPage from './pages/CalibrationPage';
import ResultsPage from './pages/ResultsPage';
import BackupPage from './pages/BackupPage';
import ComparisonPage from './pages/ComparisonPage';
import ThemesPage from './pages/ThemesPage';

export default function App() {
  const { config, savePreferences } = useAppConfig();
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const navItems = useMemo(
    () => orderNavItems(DEFAULT_NAV, config?.preferences?.nav_order),
    [config?.preferences?.nav_order]
  );

  function reorderNav(from, to) {
    if (from === null || from === to) return;
    const next = [...navItems];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    savePreferences({ nav_order: next.map((entry) => entry.to) }).catch(() => {});
  }

  function resetNavOrder() {
    savePreferences({ nav_order: DEFAULT_NAV_ORDER }).catch(() => {});
  }

  function clearDrag() {
    setDragFrom(null);
    setDragOver(null);
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h1>LD2410 Companion</h1>

        <div className="sidebar-nav-header">
          <span>Menu</span>
          <button type="button" className="sidebar-nav-reset" onClick={resetNavOrder} title="Reset menu order">
            Reset order
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item, index) => (
            <div
              key={item.to}
              className={[
                'sidebar-nav-row',
                dragFrom === index ? 'dragging' : '',
                dragOver === index && dragFrom !== index ? 'drag-over' : '',
              ].filter(Boolean).join(' ')}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragFrom !== index) setDragOver(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                reorderNav(dragFrom, index);
                clearDrag();
              }}
            >
              <span
                className="sidebar-drag-handle"
                draggable
                onDragStart={(e) => {
                  setDragFrom(index);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(index));
                }}
                onDragEnd={clearDrag}
                aria-label={`Drag to reorder ${item.label}`}
                title="Drag to reorder"
              >
                ⠿
              </span>
              <NavLink to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                {item.label}
              </NavLink>
            </div>
          ))}
        </nav>

        <div className="sidebar-version">v{APP_VERSION}</div>
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
