/**
 * Per-client, per-integration health tracker. Exists because the previous
 * design decided mock-vs-real mode once at boot and never surfaced what
 * happened after that — a client's real Twitch integration could fail
 * silently hours into a stream with nothing but a console log to notice it.
 * This gives the control panel (and any future alerting) something to poll.
 */
const status = new Map(); // clientId -> { [integration]: {...} }

function bucketFor(clientId) {
  if (!status.has(clientId)) status.set(clientId, {});
  return status.get(clientId);
}

export function setStatus(clientId, integration, patch) {
  const bucket = bucketFor(clientId);
  bucket[integration] = {
    ...bucket[integration],
    ...patch,
    updatedAt: Date.now(),
  };
}

export function getStatus(clientId) {
  return bucketFor(clientId);
}

export function getAllStatus() {
  return Object.fromEntries(status.entries());
}
