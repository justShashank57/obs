import { isValidClientId } from '../lib/validateClientId.js';
import { verifyClientPassword } from '../auth/credentialsStore.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'auth' });

/** Any authenticated session (client or admin) — use for routes that don't
 * touch a specific client's data (e.g. checking session status). */
export function requireAuth(req, res, next) {
  if (req.session?.authed) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

/** Authenticated AND authorized for the specific :clientId in the route.
 * This is the fix for the previous design, where any authenticated session
 * (i.e. anyone who knew the one shared password) could edit ANY client's
 * config/goal/label/countdown just by typing a different clientId. */
export function requireClientAccess(req, res, next) {
  const targetClientId = req.params.clientId;
  if (!req.session?.authed) return res.status(401).json({ error: 'Not authenticated' });
  if (!isValidClientId(targetClientId)) return res.status(400).json({ error: 'Invalid client id' });
  if (req.session.isAdmin) return next();
  if (req.session.clientId === targetClientId) return next();
  log.warn(
    { sessionClient: req.session.clientId, targetClientId },
    'Blocked cross-tenant access attempt'
  );
  return res.status(403).json({ error: 'Not authorized for this client' });
}

export function requireAdmin(req, res, next) {
  if (req.session?.authed && req.session.isAdmin) return next();
  return res.status(403).json({ error: 'Admin only' });
}

export async function loginHandler(req, res) {
  const { clientId, password } = req.body || {};

  // No clientId supplied -> admin login against a single operator password.
  if (!clientId) {
    if (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
      req.session.authed = true;
      req.session.isAdmin = true;
      req.session.clientId = null;
      return res.json({ ok: true, isAdmin: true });
    }
    return res.status(401).json({ ok: false, error: 'Invalid admin password' });
  }

  if (!isValidClientId(clientId)) {
    return res.status(400).json({ ok: false, error: 'Invalid client id' });
  }

  const valid = await verifyClientPassword(clientId, password);
  if (!valid) {
    return res.status(401).json({ ok: false, error: 'Invalid client credentials' });
  }
  req.session.authed = true;
  req.session.isAdmin = false;
  req.session.clientId = clientId;
  res.json({ ok: true, isAdmin: false, clientId });
}

export function logoutHandler(req, res) {
  req.session = null;
  res.json({ ok: true });
}

export function sessionStatus(req, res) {
  res.json({
    authed: !!req.session?.authed,
    isAdmin: !!req.session?.isAdmin,
    clientId: req.session?.clientId || null,
  });
}
