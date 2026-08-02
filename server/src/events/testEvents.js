import { makeEvent } from './schema.js';
import { eventBus } from './eventBus.js';
import { ALERT_TYPE_META } from '../shared/alertTypes.js';

const PLATFORM_BY_TYPE = {
  follow: 'twitch',
  sub: 'twitch',
  giftsub: 'twitch',
  cheer: 'twitch',
  raid: 'twitch',
  donation: 'system',
  superchat: 'youtube',
  membership: 'youtube',
};

const SAMPLE_OVERRIDES = {
  giftsub: { amount: 5, tier: '1000' },
  cheer: { amount: 500, message: 'Test cheer!' },
  donation: { amount: 25, currency: 'USD' },
  raid: { amount: 42 },
  superchat: { amount: '$10.00', message: 'Test superchat!' },
  sub: { tier: '1000', months: 3 },
};

/**
 * Powers the control panel's "trigger test alert" buttons. Lives next to the
 * shared event schema/registry rather than inside the Twitch integration
 * module, since test alerts apply to every platform's alert types, not just
 * Twitch's.
 */
export function fireTestEvent(clientId, type, overrides = {}) {
  if (!ALERT_TYPE_META[type]) {
    throw new Error(`Unknown test event type: ${type}`);
  }
  const base = {
    type,
    platform: PLATFORM_BY_TYPE[type] || 'system',
    username: 'test_user',
    ...(SAMPLE_OVERRIDES[type] || {}),
  };
  eventBus.publish(clientId, makeEvent({ ...base, ...overrides }));
}
