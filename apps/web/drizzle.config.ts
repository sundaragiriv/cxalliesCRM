import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Load .env.local first (matches Next.js convention; gitignored), then .env as fallback.
config({ path: '.env.local' })
config()

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error(
    'DATABASE_URL is not set. Copy apps/web/.env.example to apps/web/.env.local.',
  )
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
})
