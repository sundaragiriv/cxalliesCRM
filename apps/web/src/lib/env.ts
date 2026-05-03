import { z } from 'zod'

const schema = z.object({
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

  // Postmark transactional email (sandbox token in dev, prod token at P1-26 deploy).
  // Use 'POSTMARK_API_TEST' as the server token to hit Postmark's test mode without
  // a real account — emails are accepted but never delivered.
  POSTMARK_SERVER_TOKEN: z.string().min(1),
  POSTMARK_FROM_ADDRESS: z.string().email(),
  POSTMARK_FROM_NAME: z.string().min(1).default('CXAllies'),
  // Postmark message stream — 'outbound' is the default transactional stream.
  POSTMARK_MESSAGE_STREAM: z.string().min(1).default('outbound'),

  // Public-facing base URL for links rendered into outbound emails.
  // CRITICAL: localhost in dev, https://app.cxallies.com in prod. Misconfiguration
  // here silently breaks every "view in browser" link in customer inboxes.
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const fieldErrors = parsed.error.flatten().fieldErrors
  const summary = Object.entries(fieldErrors)
    .map(([key, msgs]) => `  - ${key}: ${(msgs ?? []).join(', ')}`)
    .join('\n')
  throw new Error(
    `Invalid environment configuration:\n${summary}\n\nSee apps/web/.env.example.`,
  )
}

export const env = parsed.data
export type Env = z.infer<typeof schema>
