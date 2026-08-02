import express from 'express';
import { makeEvent } from '../../events/schema.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../lib/logger.js';
import { isValidClientId } from '../../lib/validateClientId.js';
import { getKofiToken } from './donationCredentials.js';

const log = logger.child({ integration: 'kofi' });

/**
 * Real donation-platform integration (the README previously listed this as a
 * known gap: `donation` events existed in the schema/test-alert button but
 * nothing produced a real one). Ko-fi's webhook posts a single
 * form-urlencoded field, `data`, containing a JSON string — see
 * https://help.ko-fi.com/hc/en-us/articles/360004162298-Does-Ko-fi-support-webhooks
 * Each client pastes their own Ko-fi "verification token" into the control
 * panel; we check it against the stored value so this endpoint can't be used
 * to inject fake donation alerts into a client's overlay from the internet.
 */
export function buildKofiWebhookRouter() {
  const router = express.Router();

  router.post('/:clientId', express.urlencoded({ extended: true }), (req, res) => {
    const { clientId } = req.params;
    if (!isValidClientId(clientId)) return res.status(400).send('invalid client');

    let payload;
    try {
      payload = JSON.parse(req.body.data);
    } catch {
      return res.status(400).send('malformed payload');
    }

    const expectedToken = getKofiToken(clientId);
    if (!expectedToken || payload.verification_token !== expectedToken) {
      log.warn({ clientId }, 'Rejected Ko-fi webhook: missing/invalid verification token');
      return res.status(401).send('invalid verification token');
    }

    const amount = [payload.currency, payload.amount].filter(Boolean).join(' ');
    eventBus.publish(
      clientId,
      makeEvent({
        type: 'donation',
        platform: 'system',
        username: payload.from_name || 'Anonymous',
        amount,
        message: payload.message || '',
      })
    );
    log.info({ clientId, amount }, 'Ko-fi donation received');
    res.status(200).send('ok');
  });

  return router;
}
