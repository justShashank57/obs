import express from 'express';
import { getConfig, saveConfig, listClients, getRuntime, saveRuntime } from '../config/configStore.js';
import {
  requireAuth,
  requireClientAccess,
  requireAdmin,
  loginHandler,
  logoutHandler,
  sessionStatus,
} from '../middleware/auth.js';
import { fireTestEvent } from '../events/testEvents.js';
import { eventBus } from '../events/eventBus.js';
import { getStatus, getAllStatus } from '../lib/integrationStatus.js';
import { setClientPassword } from '../auth/credentialsStore.js';
import { setKofiToken, getKofiToken } from '../integrations/donations/donationCredentials.js';
import { isValidClientId } from '../lib/validateClientId.js';
import {
  configSchema,
  goalSchema,
  labelSchema,
  countdownSchema,
  testEventSchema,
  validateBody,
} from '../config/schemas.js';

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function buildApiRouter() {
  const router = express.Router();

  // --- Auth ---
  router.post('/auth/login', asyncHandler(loginHandler));
  router.post('/auth/logout', logoutHandler);
  router.get('/auth/status', sessionStatus);

  // --- Admin ---
  router.get('/clients', requireAdmin, asyncHandler(async (req, res) => {
    res.json({ clients: await listClients() });
  }));

  router.post('/admin/reset-password/:clientId', requireAdmin, (req, res) => {
    if (!isValidClientId(req.params.clientId)) return res.status(400).json({ error: 'Invalid client id' });
    const { password } = req.body || {};
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    setClientPassword(req.params.clientId, password);
    res.json({ ok: true });
  });

  // --- Config (theming) ---
  router.get('/config/:clientId', asyncHandler(async (req, res) => {
    if (!isValidClientId(req.params.clientId)) return res.status(400).json({ error: 'Invalid client id' });
    res.json(await getConfig(req.params.clientId));
  }));

  router.put(
    '/config/:clientId',
    requireClientAccess,
    validateBody(configSchema),
    asyncHandler(async (req, res) => {
      const updated = await saveConfig(req.params.clientId, req.body);
      res.json(updated);
    })
  );

  // --- Runtime state: goal / label / countdown ---
  router.get('/runtime/:clientId', asyncHandler(async (req, res) => {
    if (!isValidClientId(req.params.clientId)) return res.status(400).json({ error: 'Invalid client id' });
    res.json(await getRuntime(req.params.clientId));
  }));

  router.put(
    '/runtime/:clientId/goal',
    requireClientAccess,
    validateBody(goalSchema),
    asyncHandler(async (req, res) => {
      const runtime = await saveRuntime(req.params.clientId, { goal: req.body });
      eventBus.publishGoalUpdate(req.params.clientId, runtime.goal);
      res.json(runtime.goal);
    })
  );

  router.put(
    '/runtime/:clientId/label',
    requireClientAccess,
    validateBody(labelSchema),
    asyncHandler(async (req, res) => {
      const runtime = await saveRuntime(req.params.clientId, { streamLabel: req.body });
      eventBus.publishLabelUpdate(req.params.clientId, runtime.streamLabel);
      res.json(runtime.streamLabel);
    })
  );

  router.put(
    '/runtime/:clientId/countdown',
    requireClientAccess,
    validateBody(countdownSchema),
    asyncHandler(async (req, res) => {
      const runtime = await saveRuntime(req.params.clientId, { countdown: req.body });
      eventBus.emit('countdown', { clientId: req.params.clientId, countdown: runtime.countdown });
      res.json(runtime.countdown);
    })
  );

  // --- Test alerts (control panel "trigger test alert" buttons) ---
  router.post(
    '/test-event/:clientId',
    requireClientAccess,
    validateBody(testEventSchema),
    (req, res) => {
      try {
        fireTestEvent(req.params.clientId, req.body.type, req.body.overrides || {});
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
      }
    }
  );

  // --- Donation platform integration (Ko-fi webhook token) ---
  router.get('/integrations/:clientId/kofi-token', requireClientAccess, (req, res) => {
    const token = getKofiToken(req.params.clientId);
    res.json({ configured: !!token, tokenPreview: token ? `${token.slice(0, 4)}...` : null });
  });

  router.put('/integrations/:clientId/kofi-token', requireClientAccess, (req, res) => {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string' || token.length < 4) {
      return res.status(400).json({ error: 'Token looks invalid' });
    }
    setKofiToken(req.params.clientId, token);
    res.json({ ok: true });
  });

  // --- Integration health/status (mock vs real, last event, last error) ---
  router.get('/status/:clientId', requireClientAccess, (req, res) => {
    res.json(getStatus(req.params.clientId));
  });

  router.get('/status', requireAdmin, (req, res) => {
    res.json(getAllStatus());
  });

  return router;
}
