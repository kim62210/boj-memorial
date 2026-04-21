import { z } from 'zod';

const nonEmptyTrimmed = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, { message: 'must not be empty after trim' });

const optionalDeviceToken = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .optional()
  .nullable();

const optionalQueryValue = (schema: z.ZodTypeAny) =>
  z.preprocess((value) => (value === null || value === '' ? undefined : value), schema);

export const createCommentSchema = z.object({
  nickname: z.string().trim().max(30).optional().default(''),
  // Primary field per issue spec; legacy socket event used `message`.
  content: nonEmptyTrimmed.pipe(z.string().max(500)).optional(),
  message: nonEmptyTrimmed.pipe(z.string().max(500)).optional(),
  deviceToken: optionalDeviceToken,
}).refine(
  (data) => Boolean(data.content || data.message),
  { path: ['content'], message: 'content is required' },
);

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const listCommentsQuerySchema = z.object({
  page: optionalQueryValue(z.coerce.number().int().nonnegative().default(0)),
  limit: optionalQueryValue(z.coerce.number().int().positive().max(100).default(50)),
});

export const listHistoryQuerySchema = z.object({
  page: optionalQueryValue(z.coerce.number().int().nonnegative().default(0)),
  limit: optionalQueryValue(z.coerce.number().int().positive().max(30).default(30)),
});

export const createFlowerSchema = z.object({
  nickname: z.string().trim().max(30).optional().default(''),
  position: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      z: z.number().finite(),
    })
    .optional(),
  deviceToken: optionalDeviceToken,
});

export type CreateFlowerInput = z.infer<typeof createFlowerSchema>;

export const createIncenseSchema = z.object({
  count: z
    .union([z.literal(1), z.literal(3), z.literal(5)])
    .optional()
    .default(1),
  deviceToken: optionalDeviceToken,
});

export type CreateIncenseInput = z.infer<typeof createIncenseSchema>;

export const createReportSchema = z.object({
  // Accept both the new spec field (snake_case) and the legacy camelCase.
  target_comment_id: z.coerce.number().int().positive().optional(),
  commentId: z.coerce.number().int().positive().optional(),
  reason: nonEmptyTrimmed.pipe(z.string().max(500)),
  deviceToken: optionalDeviceToken,
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
