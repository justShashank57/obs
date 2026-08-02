import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'eventBus' });
const CHANNEL = 'overlay:bus';

/**
 * Central pub/sub. By default this is purely in-process (an EventEmitter),
 * which is fine for a single Node process but means: (a) running more than
 * one server process for redundancy/load causes each process to open its own
 * duplicate Twitch/YouTube connections per client, and (b) a socket that
 * lands on process B never hears about an event published by process A's
 * integration. Call enableRedis() (wired up in index.js when REDIS_URL is
 * set) to bridge every publish/subscribe across processes via Redis, and pair
 * it with INTEGRATIONS_ENABLED=false on all but one process so integrations
 * aren't started redundantly. See README's horizontal-scaling section.
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.redisPub = null;
    this.redisSub = null;
  }

  enableRedis(url) {
    this.redisPub = new Redis(url);
    this.redisSub = new Redis(url);
    this.redisSub.subscribe(CHANNEL);
    this.redisSub.on('message', (_channel, raw) => {
      try {
        const { kind, data } = JSON.parse(raw);
        super.emit(kind, data); // local delivery only — do not re-publish (avoids echo loop)
      } catch (err) {
        log.error({ err: err.message }, 'Bad message on Redis event bus channel');
      }
    });
    this.redisPub.on('error', (err) => log.error({ err: err.message }, 'Redis pub client error'));
    this.redisSub.on('error', (err) => log.error({ err: err.message }, 'Redis sub client error'));
    log.info('Redis event bus bridge enabled — safe to run multiple server processes');
  }

  _broadcast(kind, data) {
    this.emit(kind, data);
    if (this.redisPub) {
      this.redisPub
        .publish(CHANNEL, JSON.stringify({ kind, data }))
        .catch((err) => log.error({ err: err.message }, 'Redis publish failed'));
    }
  }

  publish(clientId, event) {
    this._broadcast('event', { clientId, event });
  }

  publishChat(clientId, message) {
    this._broadcast('chat', { clientId, message });
  }

  publishLabelUpdate(clientId, label) {
    this._broadcast('label', { clientId, label });
  }

  publishGoalUpdate(clientId, goal) {
    this._broadcast('goal', { clientId, goal });
  }

  publishCountdownUpdate(clientId, countdown) {
    this._broadcast('countdown', { clientId, countdown });
  }
}

export const eventBus = new EventBus();
export { EventBus };
