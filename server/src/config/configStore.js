import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { isValidClientId } from '../lib/validateClientId.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'configStore' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIGS_DIR = path.resolve(__dirname, '../../../configs');
const DATA_DIR = path.resolve(__dirname, '../data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function assertValidClientId(clientId) {
  // Defense in depth: even if a caller forgets to validate at the route
  // layer, this is the choke point that actually builds filesystem paths
  // from clientId, so it refuses unsafe values unconditionally.
  if (!isValidClientId(clientId)) {
    throw Object.assign(new Error(`Invalid clientId: ${clientId}`), { statusCode: 400 });
  }
}

function configPath(clientId) {
  return path.join(CONFIGS_DIR, `${clientId}.json`);
}

function runtimePath(clientId) {
  return path.join(DATA_DIR, `${clientId}.runtime.json`);
}

const DEFAULT_CONFIG = JSON.parse(
  fs.readFileSync(path.join(CONFIGS_DIR, 'default.json'), 'utf-8')
);

const DEFAULT_RUNTIME = {
  goal: { type: 'sub', label: 'Sub Goal', start: 0, current: 0, target: 100 },
  streamLabel: { text: 'Welcome to the stream!', mode: 'static' },
  countdown: { title: 'Starting Soon', targetTimestamp: null, message: '' },
};

// In-memory caches so a hot path (every socket (re)connect reads config) does
// not hit the disk synchronously/redundantly on every request. Invalidated
// on save. This is process-local — see README's scaling notes for what
// changes if config needs to be shared across more than one process/host.
const configCache = new Map();
const runtimeCache = new Map();
// Per-client promise chain so concurrent saveRuntime() calls (e.g. a control
// panel edit racing a test-alert-triggered update) serialize instead of
// racing a read-modify-write and losing one of the writes.
const runtimeWriteQueues = new Map();

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override || {})) {
    if (
      typeof override[key] === 'object' &&
      override[key] !== null &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object'
    ) {
      out[key] = deepMerge(base[key], override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

export async function getConfig(clientId) {
  assertValidClientId(clientId);
  if (configCache.has(clientId)) return configCache.get(clientId);

  let merged = DEFAULT_CONFIG;
  try {
    const raw = await fsp.readFile(configPath(clientId), 'utf-8');
    merged = deepMerge(DEFAULT_CONFIG, JSON.parse(raw));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      log.error({ clientId, err: err.message }, 'Failed to read/parse client config, using default');
    }
  }
  configCache.set(clientId, merged);
  return merged;
}

export async function saveConfig(clientId, config) {
  assertValidClientId(clientId);
  await fsp.writeFile(configPath(clientId), JSON.stringify(config, null, 2));
  configCache.delete(clientId);
  return getConfig(clientId);
}

export async function listClients() {
  const files = await fsp.readdir(CONFIGS_DIR);
  return files
    .filter((f) => f.endsWith('.json') && f !== 'default.json')
    .map((f) => f.replace(/\.json$/, ''));
}

export async function getRuntime(clientId) {
  assertValidClientId(clientId);
  if (runtimeCache.has(clientId)) return runtimeCache.get(clientId);

  let value = structuredClone(DEFAULT_RUNTIME);
  try {
    const raw = await fsp.readFile(runtimePath(clientId), 'utf-8');
    value = { ...DEFAULT_RUNTIME, ...JSON.parse(raw) };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      log.error({ clientId, err: err.message }, 'Failed to read/parse client runtime, using default');
    }
  }
  runtimeCache.set(clientId, value);
  return value;
}

export async function saveRuntime(clientId, patch) {
  assertValidClientId(clientId);
  const previous = runtimeWriteQueues.get(clientId) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const current = await getRuntime(clientId);
    const merged = { ...current, ...patch };
    await fsp.writeFile(runtimePath(clientId), JSON.stringify(merged, null, 2));
    runtimeCache.set(clientId, merged);
    return merged;
  });
  runtimeWriteQueues.set(clientId, next);
  return next;
}
