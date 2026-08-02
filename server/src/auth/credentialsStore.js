import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'credentials' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const CREDENTIALS_PATH = path.join(DATA_DIR, 'credentials.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readAll() {
  if (!fs.existsSync(CREDENTIALS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeAll(all) {
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(all, null, 2));
}

function generatePassword() {
  return crypto.randomBytes(9).toString('base64url'); // 12-char URL-safe password
}

/**
 * Replaces the single shared CONTROL_PANEL_PASSWORD with one password per
 * client, so client A logging in can never see or edit client B's overlay —
 * the previous design's `requireAuth` checked only a boolean session flag,
 * with no tie to which clientId was being acted on at all.
 *
 * Called once per known client at server boot. If a client has no stored
 * credentials yet, generates one, hashes it, persists the hash, and logs the
 * plaintext ONCE so the operator can hand it to that client.
 */
export function ensureClientCredentials(clientId) {
  const all = readAll();
  if (all[clientId]) return null;
  const plaintext = generatePassword();
  all[clientId] = { passwordHash: bcrypt.hashSync(plaintext, 10) };
  writeAll(all);
  log.info({ clientId, password: plaintext }, 'Generated control panel password for new client — save this now, it will not be shown again');
  return plaintext;
}

export async function verifyClientPassword(clientId, password) {
  const all = readAll();
  const entry = all[clientId];
  if (!entry || typeof password !== 'string') return false;
  return bcrypt.compare(password, entry.passwordHash);
}

export function setClientPassword(clientId, newPassword) {
  const all = readAll();
  all[clientId] = { passwordHash: bcrypt.hashSync(newPassword, 10) };
  writeAll(all);
}

export function hasCredentials(clientId) {
  const all = readAll();
  return !!all[clientId];
}
