import { useEffect, useState } from 'react';
import { getSocket, getClientId } from './socket.js';

/**
 * Fetches the per-client JSON config (theme/fonts/sounds/durations), applies theme
 * colors/fonts as CSS custom properties on <html>, and keeps the config live-updated
 * if the control panel pushes a change over the socket.
 */
export function useConfig() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    const clientId = getClientId();
    fetch(`/api/config/${clientId}`)
      .then((r) => r.json())
      .then((cfg) => {
        applyTheme(cfg);
        setConfig(cfg);
      })
      .catch((err) => console.error('Failed to load config', err));

    const socket = getSocket();
    const onConfig = (cfg) => {
      applyTheme(cfg);
      setConfig(cfg);
    };
    socket.on('config', onConfig);
    return () => socket.off('config', onConfig);
  }, []);

  return config;
}

function applyTheme(cfg) {
  if (!cfg?.theme) return;
  const root = document.documentElement;
  const { colors = {}, fonts = {}, borderRadius } = cfg.theme;
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value);
  });
  Object.entries(fonts).forEach(([key, value]) => {
    root.style.setProperty(`--font-${key}`, value);
  });
  if (borderRadius !== undefined) {
    root.style.setProperty('--border-radius', `${borderRadius}px`);
  }
}
