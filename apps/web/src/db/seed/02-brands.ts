import { db } from '@/db/client'
import { brands } from '@/modules/parties/schema'

type BrandSeed = {
  slug: string
  name: string
  displayName: string
  domain: string | null
}

const BRAND_SEEDS: ReadonlyArray<BrandSeed> = [
  { slug: 'varahi-systems', name: 'Varahi Systems', displayName: 'Varahi Systems', domain: null },
  { slug: 'pravara-ai', name: 'Pravara.ai', displayName: 'Pravara.ai', domain: 'pravara.ai' },
  { slug: 'cxallies', name: 'CXAllies', displayName: 'CXAllies', domain: 'cxallies.com' },
  { slug: 'moonking-studios', name: 'Moonking Studios', displayName: 'Moonking Studios', domain: null },
]

/**
 * Idempotent on (organization_id, slug) per conventions §3.2.
 * Drizzle's onConflictDoNothing references the brands_org_slug_unique constraint.
 */
export async function seedBrands(organizationId: string): Promise<void> {
  await db
    .insert(brands)
    .values(BRAND_SEEDS.map((b) => ({ organizationId, ...b })))
    .onConflictDoNothing({ target: [brands.organizationId, brands.slug] })
}
