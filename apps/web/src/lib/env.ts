import { z } from 'zod'

/**
 * Per ADR-0007:
 *   - Tenant identity (sender domain, address, name, message stream) lives
 *     in the `organizations` row, not env. POSTMARK_FROM_* env vars are
 *     **optional** and consumed only by the seed script as bootstrap
 *     defaults at first install.
 *   - POSTMARK_SERVER_TOKEN is a deployment credential, not tenant identity,
 *     so it stays in env and remains required.
 *
 * Production safety: a schema-level refine forbids the magic test token
 * `POSTMARK_API_TEST` when NODE_ENV=production. It catches the realistic
 * misconfiguration where the sandbox token leaks into a prod env file.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),

    // Better Auth
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
    BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),

    // Owner seed (consumed by db:seed; not used at runtime)
    OWNER_EMAIL: z.string().email(),
    OWNER_PASSWORD: z
      .string()
      .min(12, 'OWNER_PASSWORD must be at least 12 characters'),

    // R2 / S3-compatible object storage (MinIO locally, Cloudflare R2 in prod)
    R2_ENDPOINT: z.string().url(),
    R2_REGION: z.string().default('auto'),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),

    // Postmark.
    //
    // POSTMARK_SERVER_TOKEN is a deployment credential and stays required.
    // Use 'POSTMARK_API_TEST' as the token to hit Postmark's sandbox in dev /
    // CI — emails are accepted but never delivered. The schema-level refine
    // below forbids this token in NODE_ENV=production.
    //
    // POSTMARK_FROM_ADDRESS / POSTMARK_FROM_NAME / POSTMARK_MESSAGE_STREAM are
    // bootstrap-only per ADR-0007: the seed script reads them (if set) to
    // populate the `organizations` row at first install. Runtime never reads
    // them — getEmailIdentity(tx, orgId) reads from the row instead.
    POSTMARK_SERVER_TOKEN: z.string().min(1),
    POSTMARK_FROM_ADDRESS: z.string().email().optional(),
    POSTMARK_FROM_NAME: z.string().min(1).optional(),
    POSTMARK_MESSAGE_STREAM: z.string().min(1).optional(),

    // Public-facing base URL for links rendered into outbound emails.
    // CRITICAL: localhost in dev, https://app.cxallies.com in prod. Misconfiguration
    // here silently breaks every "view in browser" link in customer inboxes.
    APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === 'production' && cfg.POSTMARK_SERVER_TOKEN === 'POSTMARK_API_TEST') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['POSTMARK_SERVER_TOKEN'],
        message:
          'POSTMARK_API_TEST is the sandbox token; it must not be used in production. ' +
          'Set the production server token from your Postmark account.',
      })
    }
  })

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('\n')
  throw new Error(
    `Invalid environment configuration:\n${issues}\n\nSee apps/web/.env.example.`,
  )
}

export const env = parsed.data
export type Env = z.infer<typeof schema>
