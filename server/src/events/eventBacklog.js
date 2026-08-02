const MAX_EVENTS = 25;
const MAX_CHAT = 30;

const buckets = new Map(); // clientId -> { events: [], chat: [] }

function bucketFor(clientId) {
  if (!buckets.has(clientId)) buckets.set(clientId, { events: [], chat: [] });
  return buckets.get(clientId);
}

/**
 * Rolling in-memory backlog per client so a browser source that reconnects
 * (OBS commonly unloads inactive-scene sources and reloads them fresh) can
 * catch up on what it missed, instead of silently losing every event that
 * fired while it was disconnected. This is intentionally small and
 * process-local — see README's horizontal-scaling notes for what changes if
 * this needs to survive a multi-process deployment.
 */
export function recordEvent(clientId, event) {
  const bucket = bucketFor(clientId);
  bucket.events.push(event);
  if (bucket.events.length > MAX_EVENTS) bucket.events.shift();
}

export function recordChat(clientId, message) {
  const bucket = bucketFor(clientId);
  bucket.chat.push(message);
  if (bucket.chat.length > MAX_CHAT) bucket.chat.shift();
}

export function getBacklog(clientId) {
  const bucket = bucketFor(clientId);
  return { events: [...bucket.events], chat: [...bucket.chat] };
}
