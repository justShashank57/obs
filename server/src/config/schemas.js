import { z } from 'zod';

/**
 * Validates config/runtime payloads before they're written to disk. The
 * previous version accepted and persisted whatever JSON body it received —
 * a malformed save (wrong type on a known field) would silently break an
 * overlay with no error surfaced anywhere. `.passthrough()` at the object
 * level keeps the "add a new theme field without code changes" flexibility
 * for genuinely new/unknown keys, while still catching wrong-typed known
 * fields immediately, with a field-level error the control panel can show.
 */
export const themeSchema = z
  .object({
    colors: z.record(z.string()).optional(),
    fonts: z.record(z.string()).optional(),
    borderRadius: z.number().optional(),
    logoUrl: z.string().optional(),
  })
  .partial()
  .passthrough();

export const configSchema = z
  .object({
    displayName: z.string().optional(),
    theme: themeSchema.optional(),
    sound: z
      .object({
        enabled: z.boolean().optional(),
        volume: z.number().min(0).max(1).optional(),
        perEventType: z.record(z.boolean()).optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    alerts: z
      .object({
        durationMs: z.number().positive().optional(),
        animation: z.enum(['pop-glow', 'slide', 'particle-burst']).optional(),
        replayGraceMs: z.number().nonnegative().optional(),
        sounds: z.record(z.string()).optional(),
        messages: z.record(z.string()).optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    ticker: z
      .object({
        maxItems: z.number().int().positive().max(50).optional(),
        itemDurationMs: z.number().positive().optional(),
        style: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    goalBarDefault: z
      .object({
        type: z.string().optional(),
        label: z.string().optional(),
        start: z.number().optional(),
        target: z.number().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    webcamFrame: z
      .object({
        style: z.string().optional(),
        borderWidth: z.number().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    chatOverlay: z
      .object({
        maxMessages: z.number().int().positive().max(200).optional(),
        showPlatformBadge: z.boolean().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    countdown: z
      .object({
        backgroundUrl: z.string().optional(),
        backgroundGradient: z.string().optional(),
        showMilliseconds: z.boolean().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
  })
  .passthrough();

export const goalSchema = z.object({
  type: z.string().optional(),
  label: z.string().max(100).optional(),
  start: z.number(),
  current: z.number(),
  target: z.number(),
});

export const labelSchema = z.object({
  text: z.string().max(500),
  mode: z.enum(['static', 'ticker']).optional(),
});

export const countdownSchema = z.object({
  title: z.string().max(200).optional(),
  targetTimestamp: z.number().nullable().optional(),
  message: z.string().max(500).optional(),
});

export const testEventSchema = z.object({
  type: z.string(),
  overrides: z.record(z.any()).optional(),
});

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ ok: false, errors: result.error.flatten() });
    }
    req.body = result.data;
    next();
  };
}
