import { db } from '@/db/client'
import { timezones } from '@/modules/finance/schema'

/**
 * Seeds the full IANA Time Zone Database via Node's built-in
 * Intl.supportedValuesOf('timeZone'). Idempotent on the IANA id (PK).
 *
 * Display name is the IANA id with underscores → spaces ("America/New_York"
 * → "America / New York"). UTC offset is computed at seed time using
 * Intl.DateTimeFormat's timeZoneName='shortOffset' formatter.
 */
function utcOffsetText(zone: string, atDate: Date): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    })
    const parts = fmt.formatToParts(atDate)
    const tzPart = parts.find((p) => p.type === 'timeZoneName')
    return tzPart?.value ?? 'UTC'
  } catch {
    return 'UTC'
  }
}

function displayName(zone: string): string {
  return zone.replace(/_/g, ' ').replace(/\//g, ' / ')
}

export async function seedTimezones(): Promise<void> {
  const ids = Intl.supportedValuesOf('timeZone')
  const now = new Date()

  const rows = ids.map((id) => ({
    id,
    displayName: displayName(id),
    utcOffsetText: utcOffsetText(id, now),
    isActive: true,
  }))

  // Insert in chunks to keep the parameter count reasonable for Postgres.
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(timezones)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing({ target: timezones.id })
  }
}
