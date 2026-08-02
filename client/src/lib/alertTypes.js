import alertTypeMeta from '../../../shared/alertTypes.json';

export const ALERT_TYPE_META = alertTypeMeta;
export const ALERT_TYPES = Object.keys(alertTypeMeta);

export function iconFor(type) {
  return ALERT_TYPE_META[type]?.icon || '✨';
}

export function labelFor(type) {
  return ALERT_TYPE_META[type]?.label || type;
}

export function formatAlertMessage(template, event) {
  if (!template) return event.username || 'Someone';
  return template
    .replace('{username}', event.username || 'Someone')
    .replace('{amount}', event.amount ?? '')
    .replace('{tier}', event.tier ?? '');
}
