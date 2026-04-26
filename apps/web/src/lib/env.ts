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
