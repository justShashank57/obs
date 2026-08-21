import './loadEnv.js';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import cookieSession from 'cookie-session';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

import { buildApiRouter } from './routes/api.js';
import { buildKofiWebhookRouter } from './integrations/donations/kofi.js';
import { eventBus } from './events/eventBus.js';
import { recordEvent, recordChat, getBacklog } from './events/eventBacklog.js';
import { listClients, getConfig } from './config/configStore.js';
import { startTwitchIntegration } from './integrations/twitch/eventsub.js';
import { startTwitchChat } from './integrations/twitch/chat.js';
import { startYoutubeIntegration } from './integrations/youtube/poller.js';
import { ensureClientCredentials } from './auth/credentialsStore.js';
import { isValidClientId } from './lib/validateClientId.js';
import { logger } from './lib/logger.js';

const log = logger.child({ module: 'server' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
const isProduction = process.env.NODE_ENV === 'production';

// --- SESSION_SECRET: the previous default ('dev-secret-change-me') is now
// public in this codebase, so any deployment that forgot to set it could
// have its "authed" session cookie forged trivially. In production we refuse
// to start rather than silently fall back; in dev we generate a random
// ephemeral secret each boot (sessions just won't survive a restart, which is
// an acceptable dev-only tradeoff) instead of using a known string. ---
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProduction) {
    log.fatal('SESSION_SECRET is not set. Refusing to start in production with an unset session secret.');
    process.exit(1);
  }
  sessionSecret = crypto.randomBytes(32).toString('hex');
  log.warn('SESSION_SECRET not set — using a random ephemeral secret for this dev process only.');
}

// --- CORS: reflecting any origin with credentials enabled is effectively no
// CORS policy at all for a cookie-authenticated app. Restrict to an explicit
// allowlist (CORS_ORIGIN, comma-separated); default to same-origin only. ---
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function corsOriginCheck(origin, callback) {
  if (!origin) return callback(null, true); // same-origin / server-to-server / curl
  if (allowedOrigins.length === 0) return callback(null, false);
  return callback(null, allowedOrigins.includes(origin));
}

const app = express();
app.use(cors({ origin: corsOriginCheck, credentials: true }));
app.use(express.json());
app.use(
  cookieSession({
    name: 'overlay-session',
    secret: sessionSecret,
    maxAge: 12 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
  })
);

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use('/api', buildApiRouter());
app.use('/webhooks/kofi', buildKofiWebhookRouter());

// Serve the built React app (overlay pages + control panel) in production.
app.use(express.static(CLIENT_DIST));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhooks')) return next();
  res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
    if (err) res.status(200).send('Client not built yet. Run `npm run build:client`.');
  });
});

// Centralized error handler so a thrown/rejected route (e.g. configStore's
// assertValidClientId) returns a clean JSON error instead of an HTML stack trace.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  log.error({ err: err.message, path: req.path }, 'Unhandled request error');
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
});

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: corsOriginCheck, credentials: true },
});

if (process.env.REDIS_URL) {
  eventBus.enableRedis(process.env.REDIS_URL);
  const pubClient = new Redis(process.env.REDIS_URL);
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));
  log.info('Socket.io Redis adapter enabled — sockets on any process now receive emits from any process');
}

io.on('connection', async (socket) => {
  const clientId = socket.handshake.query.client || 'demo';
  if (!isValidClientId(clientId)) {
    log.warn({ clientId }, 'Rejected socket connection with invalid client id');
    socket.disconnect(true);
    return;
  }
  socket.join(clientId);
  log.info({ clientId, socketId: socket.id }, 'Browser source connected');

  socket.emit('config', await getConfig(clientId));
  // Replay recent events/chat so a reconnecting browser source (OBS commonly
  // unloads inactive-scene sources and reloads them fresh) can catch up on
  // what it missed instead of silently losing it.
  socket.emit('backlog', getBacklog(clientId));

  socket.on('disconnect', () => {
    log.info({ clientId, socketId: socket.id }, 'Browser source disconnected');
  });
});

// Fan out normalized events from the bus to whichever client's room they
// belong to, recording each into the backlog buffer for future reconnects.
eventBus.on('event', ({ clientId, event }) => {
  recordEvent(clientId, event);
  io.to(clientId).emit('event', event);
});
eventBus.on('chat', ({ clientId, message }) => {
  recordChat(clientId, message);
  io.to(clientId).emit('chat', message);
});
eventBus.on('label', ({ clientId, label }) => io.to(clientId).emit('label', label));
eventBus.on('goal', ({ clientId, goal }) => io.to(clientId).emit('goal', goal));
eventBus.on('countdown', ({ clientId, countdown }) => io.to(clientId).emit('countdown', countdown));

const stopHandles = [];

async function boot() {
  const clients = await listClients();
  const activeClients = clients.length ? clients : ['demo'];

  // Provision a per-client control panel password for any client that
  // doesn't have one yet. Logged once at INFO so the operator can hand it to
  // that client — replaces the single shared CONTROL_PANEL_PASSWORD, which
  // let any authenticated session edit any client's settings.
  for (const clientId of activeClients) {
    ensureClientCredentials(clientId);
  }

  // INTEGRATIONS_ENABLED=false lets a process serve only sockets/API while
  // relying on a separate process (sharing REDIS_URL) to run the actual
  // Twitch/YouTube/chat connections — running integrations on every process
  // in a horizontally-scaled deployment would open duplicate upstream
  // connections per client.
  const integrationsEnabled = process.env.INTEGRATIONS_ENABLED !== 'false';
  if (integrationsEnabled) {
    for (const clientId of activeClients) {
      stopHandles.push(startTwitchIntegration(clientId));
      stopHandles.push(startYoutubeIntegration(clientId));
      stopHandles.push(startTwitchChat(clientId));
    }
  } else {
    log.info('INTEGRATIONS_ENABLED=false — this process serves sockets/API only');
  }

  httpServer.listen(PORT, () => {
    log.info({ port: PORT, clients: activeClients }, 'Overlay server listening');
  });
}

boot().catch((err) => {
  log.fatal({ err: err.message }, 'Failed to start server');
  process.exit(1);
});

function shutdown(signal) {
  log.info({ signal }, 'Shutting down gracefully');
  for (const stop of stopHandles) {
    try {
      stop?.();
    } catch (err) {
      log.error({ err: err.message }, 'Error stopping an integration during shutdown');
    }
  }
  io.close();
  httpServer.close(() => {
    log.info('Server closed');
    process.exit(0);
  });
  // Force-exit if something's still hanging after 5s.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
