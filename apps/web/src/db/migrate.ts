// drizzle-kit 0.30.x swallows errors on migrate; this gives readable failures.
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const client = postgres(url, { max: 1 })
  const db = drizzle(client)

  console.log('Applying migrations from ./drizzle ...')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Done.')

  await client.end()
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
