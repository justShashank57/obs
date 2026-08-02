import { logger } from './logger.js';

const log = logger.child({ module: 'twitch-token' });

let accessToken = process.env.TWITCH_ACCESS_TOKEN || '';
let refreshTimer = null;
let initialized = false;

function hasRefreshCapability() {
  return !!(
    process.env.TWITCH_CLIENT_ID &&
    process.env.TWITCH_CLIENT_SECRET &&
    process.env.TWITCH_REFRESH_TOKEN
  );
}

export function getAccessToken() {
  return accessToken;
}

export async function validateToken() {
  if (!accessToken) return null;
  const res = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json(); // { expires_in, scopes, ... }
}

/**
 * Twitch user access tokens expire in a matter of hours. The original
 * implementation read TWITCH_ACCESS_TOKEN once at boot and never renewed it,
 * meaning every real integration would silently start failing partway
 * through a multi-hour stream. This refreshes proactively (scheduled ahead
 * of expiry) and reactively (called again on a 401 from any Helix request).
 */
export async function refreshAccessToken() {
  if (!hasRefreshCapability()) {
    log.warn(
      'Cannot refresh Twitch token: set TWITCH_CLIENT_SECRET + TWITCH_REFRESH_TOKEN to enable auto-refresh'
    );
    return false;
  }
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: process.env.TWITCH_REFRESH_TOKEN,
    client_id: process.env.TWITCH_CLIENT_ID,
    client_secret: process.env.TWITCH_CLIENT_SECRET,
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params.toString()}`, { method: 'POST' });
  if (!res.ok) {
    log.error({ status: res.status, body: await res.text() }, 'Twitch token refresh failed');
    return false;
  }
  const data = await res.json();
  accessToken = data.access_token;
  if (data.refresh_token) {
    // Twitch rotates refresh tokens on every use; keep the process env in sync
    // for the lifetime of this process (a restart still needs the latest one
    // persisted externally — see README for the operational note on this).
    process.env.TWITCH_REFRESH_TOKEN = data.refresh_token;
  }
  log.info('Twitch access token refreshed');
  scheduleNextRefresh(data.expires_in || 3600);
  return true;
}

function scheduleNextRefresh(expiresInSeconds) {
  clearTimeout(refreshTimer);
  const bufferMs = 10 * 60 * 1000; // refresh 10 minutes before expiry
  const delay = Math.max(expiresInSeconds * 1000 - bufferMs, 60 * 1000);
  refreshTimer = setTimeout(() => {
    refreshAccessToken().catch((err) => log.error({ err }, 'Scheduled Twitch token refresh threw'));
  }, delay);
  refreshTimer.unref?.();
}

export async function initTokenManager() {
  if (initialized || !accessToken) return;
  initialized = true;
  const validation = await validateToken();
  if (validation) {
    log.info({ expiresIn: validation.expires_in }, 'Twitch access token validated');
    scheduleNextRefresh(validation.expires_in);
  } else {
    log.warn('Twitch access token invalid/expired at startup, attempting refresh');
    await refreshAccessToken();
  }
}

export function stopTokenManager() {
  clearTimeout(refreshTimer);
}
