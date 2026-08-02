import { describe, it, expect } from 'vitest';
import { normalizeChatMessage } from './poller.js';

function item(snippet, authorDetails = { displayName: 'viewer1', profileImageUrl: 'http://x' }) {
  return { snippet, authorDetails };
}

describe('normalizeChatMessage', () => {
  it('maps a superChatEvent to a superchat event', () => {
    const evt = normalizeChatMessage(
      item({
        type: 'superChatEvent',
        superChatDetails: { amountDisplayString: '$10.00', currency: 'USD', userComment: 'nice' },
      })
    );
    expect(evt).toMatchObject({ type: 'superchat', platform: 'youtube', amount: '$10.00', currency: 'USD' });
  });

  it('maps a newSponsorEvent to a membership event', () => {
    const evt = normalizeChatMessage(item({ type: 'newSponsorEvent' }));
    expect(evt).toMatchObject({ type: 'membership', platform: 'youtube' });
  });

  it('maps a textMessageEvent to a chat event', () => {
    const evt = normalizeChatMessage(item({ type: 'textMessageEvent', displayMessage: 'hello chat' }));
    expect(evt).toMatchObject({ type: 'chat', platform: 'youtube', message: 'hello chat' });
  });

  it('returns null for unrecognized snippet types', () => {
    expect(normalizeChatMessage(item({ type: 'somethingElse' }))).toBeNull();
  });
});
