import tmi from 'tmi.js';
import { makeEvent } from '../../events/schema.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../lib/logger.js';
import { setStatus } from '../../lib/integrationStatus.js';

const log = logger.child({ integration: 'twitch-chat' });

/**
 * Read-only Twitch chat feed for the Chat Overlay widget. Uses tmi.js in
 * anonymous mode (no OAuth needed to *read* public chat), so this can run
 * independently of the EventSub credentials used for alerts.
 * Set TWITCH_CHANNEL_NAME (the channel login, e.g. "shroud") to enable it.
 */
export function startTwitchChat(clientId) {
  const channel = process.env.TWITCH_CHANNEL_NAME;
  if (!channel) {
    return startMockTwitchChat(clientId);
  }

  const client = new tmi.Client({ channels: [channel] });

  client.connect().catch((err) => {
    log.error({ clientId, err: err.message }, 'Twitch chat connection failed, falling back to mock');
    startMockTwitchChat(clientId);
  });

  client.on('connected', () => setStatus(clientId, 'twitchChat', { mode: 'real', connected: true, lastError: null }));
  client.on('disconnected', (reason) => setStatus(clientId, 'twitchChat', { connected: false, lastError: reason }));

  client.on('message', (_channel, tags, message, self) => {
    if (self) return;
    eventBus.publishChat(
      clientId,
      makeEvent({
        type: 'chat',
        platform: 'twitch',
        username: tags['display-name'] || tags.username,
        message,
        avatar: '',
      })
    );
    setStatus(clientId, 'twitchChat', { lastEventAt: Date.now() });
  });

  return function stop() {
    client.disconnect().catch(() => {});
  };
}

function startMockTwitchChat(clientId) {
  const names = ['clip_goblin', 'emote_enjoyer', 'ttv_regular', 'firstchat_fan'];
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  log.info({ clientId }, 'No TWITCH_CHANNEL_NAME set, running Twitch chat in MOCK mode');
  setStatus(clientId, 'twitchChat', { mode: 'mock', connected: true, lastError: null });

  const timer = setInterval(() => {
    eventBus.publishChat(
      clientId,
      makeEvent({
        type: 'chat',
        platform: 'twitch',
        username: rand(names),
        message: rand(['LUL', 'nice play', 'W', 'chat is this real', 'gg']),
      })
    );
    setStatus(clientId, 'twitchChat', { lastEventAt: Date.now() });
  }, 7000);

  return function stop() {
    clearInterval(timer);
  };
}
