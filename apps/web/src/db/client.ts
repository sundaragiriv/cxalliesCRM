import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy apps/web/.env.example to apps/web/.env.local.',
  )
}

const queryClient = postgres(connectionString, { max: 10 })

export const db = drizzle(queryClient)

export type Db = typeof db
