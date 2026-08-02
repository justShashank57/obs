import { makeEvent } from '../../events/schema.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../lib/logger.js';
import { setStatus } from '../../lib/integrationStatus.js';

const log = logger.child({ integration: 'youtube-poller' });

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * YouTube has no "follow" concept and no full real-time push equivalent to Twitch
 * EventSub for chat/superchats — the Live Chat API is poll-based, and responses
 * include a `pollingIntervalMillis` hint that MUST be respected to stay within quota.
 * https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list
 */
export function normalizeChatMessage(item) {
  const snippet = item.snippet;
  const author = item.authorDetails;

  if (snippet.type === 'superChatEvent' || snippet.superChatDetails) {
    const details = snippet.superChatDetails;
    return makeEvent({
      type: 'superchat',
      platform: 'youtube',
      username: author.displayName,
      amount: details.amountDisplayString,
      currency: details.currency,
      message: details.userComment,
      avatar: author.profileImageUrl,
    });
  }

  if (snippet.type === 'newSponsorEvent' || snippet.type === 'memberMilestoneChatEvent') {
    return makeEvent({
      type: 'membership',
      platform: 'youtube',
      username: author.displayName,
      message: snippet.memberMilestoneChatDetails?.userComment,
      avatar: author.profileImageUrl,
    });
  }

  if (snippet.type === 'textMessageEvent') {
    return makeEvent({
      type: 'chat',
      platform: 'youtube',
      username: author.displayName,
      message: snippet.displayMessage,
      avatar: author.profileImageUrl,
    });
  }

  return null;
}

async function pollOnce(liveChatId, apiKey, pageToken) {
  const url = new URL(`${YT_API_BASE}/liveChat/messages`);
  url.searchParams.set('liveChatId', liveChatId);
  url.searchParams.set('part', 'snippet,authorDetails');
  url.searchParams.set('key', apiKey);
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube liveChat poll failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function hasRealCredentials() {
  return process.env.YOUTUBE_API_KEY && process.env.YOUTUBE_LIVE_CHAT_ID;
}

function connectRealPoller(clientId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const liveChatId = process.env.YOUTUBE_LIVE_CHAT_ID;
  let pageToken;
  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    try {
      const data = await pollOnce(liveChatId, apiKey, pageToken);
      pageToken = data.nextPageToken;
      for (const item of data.items || []) {
        const normalized = normalizeChatMessage(item);
        if (!normalized) continue;
        if (normalized.type === 'chat') {
          eventBus.publishChat(clientId, normalized);
        } else {
          eventBus.publish(clientId, normalized);
        }
      }
      setStatus(clientId, 'youtube', { mode: 'real', connected: true, lastError: null, lastPollAt: Date.now() });
      // Respect YouTube's suggested polling interval to stay within API quota.
      const interval = Math.max(
        data.pollingIntervalMillis || 10000,
        Number(process.env.YOUTUBE_POLL_INTERVAL_MS) || 10000
      );
      timer = setTimeout(tick, interval);
    } catch (err) {
      log.error({ clientId, err: err.message }, 'YouTube poll error, retrying in 15s');
      setStatus(clientId, 'youtube', { connected: false, lastError: err.message });
      timer = setTimeout(tick, 15000);
    }
  }

  tick();

  return function stop() {
    stopped = true;
    clearTimeout(timer);
  };
}

/** Demo/mock mode mirrors the real poller's output shape. */
function connectMockPoller(clientId) {
  const names = ['yt_viewer_1', 'chatchamp', 'stream_fan22', 'quietlurker'];
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

  log.info({ clientId }, 'No YouTube credentials found, running poller in MOCK mode');
  setStatus(clientId, 'youtube', { mode: 'mock', connected: true, lastError: null });

  const chatTimer = setInterval(() => {
    eventBus.publishChat(
      clientId,
      makeEvent({
        type: 'chat',
        platform: 'youtube',
        username: rand(names),
        message: rand(['hyped for this!', 'lol', 'pog', 'W stream', 'first time here, loving it']),
      })
    );
  }, 8000);

  const eventTimer = setInterval(() => {
    const evt = rand([
      () =>
        makeEvent({
          type: 'superchat',
          platform: 'youtube',
          username: rand(names),
          amount: rand(['$2.00', '$5.00', '$10.00', '$20.00']),
          currency: 'USD',
          message: 'Keep it up!',
        }),
      () => makeEvent({ type: 'membership', platform: 'youtube', username: rand(names) }),
    ])();
    eventBus.publish(clientId, evt);
    setStatus(clientId, 'youtube', { lastEventAt: Date.now() });
  }, 60000);

  return function stop() {
    clearInterval(chatTimer);
    clearInterval(eventTimer);
  };
}

export function startYoutubeIntegration(clientId) {
  if (hasRealCredentials()) {
    return connectRealPoller(clientId);
  }
  return connectMockPoller(clientId);
}
