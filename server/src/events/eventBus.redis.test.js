import { describe, it, expect, vi } from 'vitest';

// Substitute the real ioredis client with ioredis-mock so this test verifies
// the actual bridging *logic* in EventBus.enableRedis() (publish -> subscribe
// -> local re-emit) without needing a real Redis server — this is the
// horizontal-scaling readiness check from the engineering review: two
// EventBus instances (standing in for two separate Node processes) must
// both receive an event published by only one of them.
vi.mock('ioredis', async () => {
  const IORedisMock = (await import('ioredis-mock')).default;
  return { default: IORedisMock };
});

const { EventBus } = await import('./eventBus.js');

describe('EventBus Redis bridge (simulating two server processes)', () => {
  it('delivers an event published on instance A to a listener on instance B', async () => {
    const processA = new EventBus();
    const processB = new EventBus();
    processA.enableRedis('redis://localhost:6379/0');
    processB.enableRedis('redis://localhost:6379/0');

    const receivedOnB = [];
    processB.on('event', (payload) => receivedOnB.push(payload));

    processA.publish('demo', { type: 'follow', username: 'cross-process-user' });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedOnB).toHaveLength(1);
    expect(receivedOnB[0]).toMatchObject({ clientId: 'demo', event: { type: 'follow', username: 'cross-process-user' } });
  });

  it('does not create an infinite echo loop between the two instances', async () => {
    const processA = new EventBus();
    const processB = new EventBus();
    processA.enableRedis('redis://localhost:6379/1');
    processB.enableRedis('redis://localhost:6379/1');

    let countOnA = 0;
    processA.on('goal', () => {
      countOnA += 1;
    });

    processB.publishGoalUpdate('demo', { current: 5 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should be delivered exactly once locally (from B's own in-process
    // emit) — if the bridge re-published what it received, this would grow
    // without bound.
    expect(countOnA).toBe(1);
  });
});
