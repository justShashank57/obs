import pino from 'pino';

/**
 * Structured logging replacing scattered console.log/console.error calls.
 * Every log call should include a `clientId` (and `integration` where
 * relevant) so multi-tenant log output can actually be filtered/searched —
 * plain console.log gives an operator serving many resold clients no way to
 * isolate "what happened for client X" without grepping free-text strings.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
});

export function childLogger(bindings) {
  return logger.child(bindings);
}
