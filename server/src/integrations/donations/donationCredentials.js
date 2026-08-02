import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_PATH = path.join(DATA_DIR, 'donations.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readAll() {
  if (!fs.existsSync(STORE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeAll(all) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(all, null, 2));
}

/** The Ko-fi "verification token" is set by the streamer in their own Ko-fi
 * dashboard (Settings -> Webhooks) and pasted into our control panel — it's
 * not something we generate, so it's stored separately from our own
 * generated control-panel passwords in credentialsStore.js. */
export function getKofiToken(clientId) {
  return readAll()[clientId]?.kofiVerificationToken || null;
}

export function setKofiToken(clientId, token) {
  const all = readAll();
  all[clientId] = { ...all[clientId], kofiVerificationToken: token };
  writeAll(all);
}
