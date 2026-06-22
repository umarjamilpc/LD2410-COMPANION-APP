import { NavLink, Routes, Route } from 'react-router-dom';
import { useAppConfig } from './AppConfigContext';
import { useSensor } from './SensorContext';
import SetupPage from './pages/SetupPage';
import SensorsPage from './pages/SensorsPage';
import DashboardPage from './pages/DashboardPage';
import CalibrationPage from './pages/CalibrationPage';
import ResultsPage from './pages/ResultsPage';
import BackupPage from './pages/BackupPage';
import ThemesPage from './pages/ThemesPage';

const NAV = [
  { to: '/', label: 'Home Assistant', end: true },
  { to: '/sensors', label: 'Sensors' },
  { to: '/dashboard', label: 'Live Monitor' },
  { to: '/calibration', label: 'Calibration' },
  { to: '/results', label: 'Thresholds' },
  { to: '/backup', label: 'Backups' },
  { to: '/themes', label: 'Themes' },
];

export default function App() {
  const { config, connectionStatus } = useAppConfig();
  const { selectedSensor } = useSensor();

  const connected = connectionStatus?.connected;
  const configured = config?.ha_url && config?.token_set;

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

        <nav>
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<SetupPage />} />
          <Route path="/sensors" element={<SensorsPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/calibration" element={<CalibrationPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="/themes" element={<ThemesPage />} />
        </Routes>
      </main>
    </div>
  );
}
