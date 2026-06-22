import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAppConfig } from './AppConfigContext';
import { DEFAULT_THEME } from './themes';

const ThemeContext = createContext(null);

function applyThemeToDocument(colorMode, accent) {
  const root = document.documentElement;
  root.setAttribute('data-color-mode', colorMode || DEFAULT_THEME.colorMode);
  root.setAttribute('data-accent', accent || DEFAULT_THEME.accent);
}

export function ThemeProvider({ children }) {
  const { config, savePreferences, loading } = useAppConfig();
  const [colorMode, setColorMode] = useState(DEFAULT_THEME.colorMode);
  const [accent, setAccent] = useState(DEFAULT_THEME.accent);

  useEffect(() => {
    if (!config?.preferences) return;
    const p = config.preferences;
    const nextColor = p.theme_color_mode || DEFAULT_THEME.colorMode;
    const nextAccent = p.theme_accent || DEFAULT_THEME.accent;
    setColorMode(nextColor);
    setAccent(nextAccent);
    applyThemeToDocument(nextColor, nextAccent);
  }, [config?.preferences]);

  useEffect(() => {
    if (!loading) {
      applyThemeToDocument(colorMode, accent);
    }
  }, [colorMode, accent, loading]);

  const setTheme = useCallback(
    async (partial) => {
      const nextColor = partial.colorMode ?? colorMode;
      const nextAccent = partial.accent ?? accent;
      setColorMode(nextColor);
      setAccent(nextAccent);
      applyThemeToDocument(nextColor, nextAccent);
      await savePreferences({
        theme_color_mode: nextColor,
        theme_accent: nextAccent,
      });
    },
    [colorMode, accent, savePreferences]
  );

  return (
    <ThemeContext.Provider value={{ colorMode, accent, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
