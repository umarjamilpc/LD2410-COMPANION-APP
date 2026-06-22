import { useTheme } from '../ThemeContext';
import { COLOR_MODES, ACCENT_THEMES } from '../themes';

export default function ThemesPage() {
  const { colorMode, accent, setTheme } = useTheme();

  return (
    <div>
      <h1 className="page-title">Themes</h1>
      <p className="page-subtitle">
        Choose light or dark surfaces and an accent palette. Settings are saved to your app profile.
      </p>

      <div className="card">
        <h2>Color mode</h2>
        <div className="theme-grid">
          {COLOR_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`theme-card ${colorMode === mode.id ? 'selected' : ''}`}
              onClick={() => setTheme({ colorMode: mode.id })}
            >
              <div className={`theme-preview theme-preview-${mode.id}`}>
                <span className="theme-preview-bar" />
                <span className="theme-preview-block" />
              </div>
              <div className="theme-card-label">{mode.label}</div>
              <div className="theme-card-desc">{mode.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Accent</h2>
        <div className="theme-grid theme-grid-accents">
          {ACCENT_THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`theme-card theme-card-accent ${accent === item.id ? 'selected' : ''}`}
              onClick={() => setTheme({ accent: item.id })}
            >
              <span className="theme-swatch" style={{ background: item.swatch }} />
              <div className="theme-card-label">{item.label}</div>
              <div className="theme-card-desc">{item.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Preview</h2>
        <div className="theme-preview-panel">
          <span className="live-badge motion">
            <span className="status-dot on" />
            Presence detected
          </span>
          <span className="live-badge still">
            <span className="status-dot off" />
            Room clear
          </span>
          <button type="button" className="btn">Primary action</button>
          <button type="button" className="btn btn-secondary">Secondary</button>
        </div>
      </div>
    </div>
  );
}
