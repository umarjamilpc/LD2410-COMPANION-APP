import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';

const AppConfigContext = createContext(null);

export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshConfig = useCallback(async () => {
    const cfg = await api.getConfig();
    setConfig(cfg);
    return cfg;
  }, []);

  const checkConnection = useCallback(async () => {
    try {
      const status = await api.getConnectionStatus();
      setConnectionStatus(status);
      return status;
    } catch (err) {
      setConnectionStatus({ connected: false, error: err.message });
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await refreshConfig();
        if (cfg.ha_url && cfg.token_set) {
          await checkConnection();
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshConfig, checkConnection]);

  async function saveConfig(body) {
    const cfg = await api.saveConfig(body);
    setConfig(cfg);
    if (cfg.ha_url && cfg.token_set) {
      await checkConnection();
    }
    return cfg;
  }

  async function savePreferences(prefs) {
    const { preferences } = await api.savePreferences(prefs);
    setConfig((prev) => ({ ...prev, preferences }));
    return preferences;
  }

  return (
    <AppConfigContext.Provider
      value={{
        config,
        connectionStatus,
        loading,
        refreshConfig,
        checkConnection,
        saveConfig,
        savePreferences,
      }}
    >
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error('useAppConfig must be used within AppConfigProvider');
  return ctx;
}
