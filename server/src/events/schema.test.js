import { describe, it, expect } from 'vitest';
import { makeEvent } from './schema.js';

describe('makeEvent', () => {
  it('assigns a unique id and a timestamp to every event', () => {
    const a = makeEvent({ type: 'follow', platform: 'twitch', username: 'x' });
    const b = makeEvent({ type: 'follow', platform: 'twitch', username: 'x' });
    expect(a.id).not.toBe(b.id);
    expect(typeof a.timestamp).toBe('number');
    expect(a.timestamp).toBeGreaterThan(0);
  });

  it('preserves all fields passed in', () => {
    const evt = makeEvent({ type: 'cheer', platform: 'twitch', username: 'x', amount: 500 });
    expect(evt).toMatchObject({ type: 'cheer', platform: 'twitch', username: 'x', amount: 500 });
  });
});
