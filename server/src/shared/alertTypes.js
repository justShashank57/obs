import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALERT_TYPES_PATH = path.resolve(__dirname, '../../../shared/alertTypes.json');

/**
 * Single source of truth for every alert type's icon/default message/default
 * sound/tier. Both the server (test-alert defaults, config defaults) and the
 * client (icons, ticker summaries) read from this one file instead of each
 * maintaining their own copy.
 */
export const ALERT_TYPE_META = JSON.parse(fs.readFileSync(ALERT_TYPES_PATH, 'utf-8'));
export const ALERT_TYPES = Object.keys(ALERT_TYPE_META);

export function formatAlertMessage(template, event) {
  if (!template) return event.username || 'Someone';
  return template
    .replace('{username}', event.username || 'Someone')
    .replace('{amount}', event.amount ?? '')
    .replace('{tier}', event.tier ?? '');
}
