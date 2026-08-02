import WebSocket from 'ws';
import { makeEvent } from '../../events/schema.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../lib/logger.js';
import { setStatus } from '../../lib/integrationStatus.js';
import { getAccessToken, initTokenManager, refreshAccessToken } from '../../lib/twitchTokenManager.js';

const log = logger.child({ integration: 'twitch-eventsub' });

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const HELIX_BASE = 'https://api.twitch.tv/helix';

const BASE_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 60000;

/**
 * Maps a raw Twitch EventSub notification into the shared internal event schema.
 * Keeping this isolated means the rest of the app never has to know Twitch's payload shapes.
 */
export function normalizeTwitchNotification(subType, event) {
  switch (subType) {
    case 'channel.follow':
      return makeEvent({ type: 'follow', platform: 'twitch', username: event.user_name });
    case 'channel.subscribe':
      return makeEvent({
        type: 'sub',
        platform: 'twitch',
        username: event.user_name,
        tier: event.tier,
        months: 1,
      });
    case 'channel.subscription.message':
      return makeEvent({
        type: 'sub',
        platform: 'twitch',
        username: event.user_name,
        tier: event.tier,
        months: event.cumulative_months,
        message: event.message?.text,
      });
    case 'channel.subscription.gift':
      return makeEvent({
        type: 'giftsub',
        platform: 'twitch',
        username: event.is_anonymous ? 'Anonymous' : event.user_name,
        amount: event.total,
        tier: event.tier,
      });
    case 'channel.cheer':
      return makeEvent({
        type: 'cheer',
        platform: 'twitch',
        username: event.is_anonymous ? 'Anonymous' : event.user_name,
        amount: event.bits,
        message: event.message,
      });
    case 'channel.raid':
      return makeEvent({
        type: 'raid',
        platform: 'twitch',
        username: event.from_broadcaster_user_name,
        amount: event.viewers,
      });
    default:
      return null;
  }
}

/**
 * List of subscription types this overlay cares about. `channel.follow` requires
 * version 2 + moderator:read:followers scope + a moderator_user_id (Twitch changed
 * this in 2023 to curb follow-botting alerts) — confirm current requirements at
 * https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/ before going live,
 * since Twitch has revised follow-event access more than once.
 */
function subscriptionDefs(broadcasterId, moderatorId) {
  return [
    {
      type: 'channel.follow',
      version: '2',
      condition: { broadcaster_user_id: broadcasterId, moderator_user_id: moderatorId },
    },
    { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: broadcasterId } },
    {
      type: 'channel.subscription.message',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId },
    },
    {
      type: 'channel.subscription.gift',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId },
    },
    { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: broadcasterId } },
    { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: broadcasterId } },
  ];
}

async function callHelix(path, options, retryOn401 = true) {
  const res = await fetch(`${HELIX_BASE}${path}`, {
    ...options,
    headers: {
      'Client-Id': process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (res.status === 401 && retryOn401) {
    log.warn('Helix call got 401, attempting token refresh and one retry');
    const refreshed = await refreshAccessToken();
    if (refreshed) return callHelix(path, options, false);
  }
  return res;
}

async function createSubscription(def, sessionId, clientId) {
  const res = await callHelix('/eventsub/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      type: def.type,
      version: def.version,
      condition: def.condition,
      transport: { method: 'websocket', session_id: sessionId },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    log.error({ subType: def.type, status: res.status, body }, 'Failed to create EventSub subscription');
    setStatus(clientId, 'twitch', { lastError: `subscribe ${def.type}: ${res.status}` });
  } else {
    log.info({ subType: def.type }, 'Subscribed to EventSub type');
  }
}

function hasRealCredentials() {
  return (
    process.env.TWITCH_CLIENT_ID &&
    process.env.TWITCH_ACCESS_TOKEN &&
    process.env.TWITCH_BROADCASTER_USER_ID
  );
}

function connectRealEventSub(clientId) {
  let ws;
  let keepaliveTimer;
  let reconnectTimer;
  let attempt = 0;
  let stopped = false;

  function scheduleReconnect() {
    if (stopped) return;
    const backoff = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
    const jitter = backoff * (0.5 + Math.random() * 0.5); // 50-100% of backoff
    attempt += 1;
    log.warn({ delayMs: Math.round(jitter), attempt }, 'EventSub WS closed, reconnecting with backoff');
    reconnectTimer = setTimeout(connect, jitter);
  }

  function connect() {
    if (stopped) return;
    ws = new WebSocket(EVENTSUB_WS_URL);

    ws.on('open', () => log.info('EventSub WS connected'));

    ws.on('message', async (raw) => {
      const msg = JSON.parse(raw.toString());
      const type = msg.metadata?.message_type;

      if (type === 'session_welcome') {
        attempt = 0; // reset backoff on a fully successful (re)connect
        const sessionId = msg.payload.session.id;
        log.info({ sessionId }, 'EventSub session established');
        setStatus(clientId, 'twitch', { mode: 'real', connected: true, lastError: null });
        const defs = subscriptionDefs(
          process.env.TWITCH_BROADCASTER_USER_ID,
          process.env.TWITCH_MODERATOR_USER_ID || process.env.TWITCH_BROADCASTER_USER_ID
        );
        for (const def of defs) await createSubscription(def, sessionId, clientId);
      }

      if (type === 'session_keepalive') {
        clearTimeout(keepaliveTimer);
        keepaliveTimer = setTimeout(() => {
          log.warn('EventSub keepalive timeout, reconnecting');
          ws.terminate();
        }, 15000);
      }

      if (type === 'session_reconnect') {
        const reconnectUrl = msg.payload.session.reconnect_url;
        ws.close();
        ws = new WebSocket(reconnectUrl);
      }

      if (type === 'notification') {
        const subType = msg.payload.subscription.type;
        const normalized = normalizeTwitchNotification(subType, msg.payload.event);
        if (normalized) {
          eventBus.publish(clientId, normalized);
          setStatus(clientId, 'twitch', { lastEventAt: Date.now() });
        }
      }
    });

    ws.on('close', () => {
      setStatus(clientId, 'twitch', { connected: false });
      clearTimeout(keepaliveTimer);
      scheduleReconnect();
    });

    ws.on('error', (err) => log.error({ err: err.message }, 'EventSub WS error'));
  }

  initTokenManager().finally(connect);

  return function stop() {
    stopped = true;
    clearTimeout(keepaliveTimer);
    clearTimeout(reconnectTimer);
    ws?.removeAllListeners();
    ws?.terminate();
  };
}

/** Demo/mock mode: emits realistic sample events on an interval so widgets can be
 * built and demoed before real Twitch credentials are wired up. Same output shape
 * as the real path, so swapping in credentials later requires zero widget changes. */
function connectMockEventSub(clientId) {
  const sampleUsernames = ['pixelfox', 'nova_streams', 'lurk_lord', 'byte_sized', 'glitchgremlin'];
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const generators = [
    () => makeEvent({ type: 'follow', platform: 'twitch', username: rand(sampleUsernames) }),
    () =>
      makeEvent({
        type: 'sub',
        platform: 'twitch',
        username: rand(sampleUsernames),
        tier: '1000',
        months: Math.ceil(Math.random() * 12),
      }),
    () =>
      makeEvent({
        type: 'giftsub',
        platform: 'twitch',
        username: rand(sampleUsernames),
        amount: Math.ceil(Math.random() * 5),
        tier: '1000',
      }),
    () =>
      makeEvent({
        type: 'cheer',
        platform: 'twitch',
        username: rand(sampleUsernames),
        amount: [100, 250, 500, 1000][Math.floor(Math.random() * 4)],
        message: 'Great stream!',
      }),
    () =>
      makeEvent({
        type: 'raid',
        platform: 'twitch',
        username: rand(sampleUsernames),
        amount: Math.ceil(Math.random() * 200),
      }),
  ];

  log.info({ clientId }, 'No Twitch credentials found, running EventSub in MOCK mode');
  setStatus(clientId, 'twitch', { mode: 'mock', connected: true, lastError: null });
  const interval = setInterval(() => {
    const evt = rand(generators)();
    eventBus.publish(clientId, evt);
    setStatus(clientId, 'twitch', { lastEventAt: Date.now() });
  }, 45000);

  return function stop() {
    clearInterval(interval);
  };
}

/** Returns a stop() function so the process can cleanly tear down every
 * client's connections/timers on SIGTERM instead of just being killed. */
export function startTwitchIntegration(clientId) {
  if (hasRealCredentials()) {
    return connectRealEventSub(clientId);
  }
  return connectMockEventSub(clientId);
}
