import { describe, it, expect } from 'vitest';
import { normalizeTwitchNotification } from './eventsub.js';

describe('normalizeTwitchNotification', () => {
  it('maps channel.follow to a follow event', () => {
    const evt = normalizeTwitchNotification('channel.follow', { user_name: 'alice' });
    expect(evt).toMatchObject({ type: 'follow', platform: 'twitch', username: 'alice' });
  });

  it('maps channel.subscription.gift to a giftsub event with amount/tier', () => {
    const evt = normalizeTwitchNotification('channel.subscription.gift', {
      user_name: 'bob',
      total: 5,
      tier: '1000',
      is_anonymous: false,
    });
    expect(evt).toMatchObject({ type: 'giftsub', platform: 'twitch', username: 'bob', amount: 5, tier: '1000' });
  });

  it('anonymizes anonymous cheers/gifts', () => {
    const evt = normalizeTwitchNotification('channel.cheer', {
      is_anonymous: true,
      user_name: 'should-not-appear',
      bits: 100,
      message: 'hi',
    });
    expect(evt.username).toBe('Anonymous');
  });

  it('maps channel.raid to a raid event with viewer count as amount', () => {
    const evt = normalizeTwitchNotification('channel.raid', {
      from_broadcaster_user_name: 'raider',
      viewers: 42,
    });
    expect(evt).toMatchObject({ type: 'raid', platform: 'twitch', username: 'raider', amount: 42 });
  });

  it('returns null for unrecognized subscription types', () => {
    expect(normalizeTwitchNotification('channel.unknown.thing', {})).toBeNull();
  });
});
