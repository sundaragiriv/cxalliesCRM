import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { brands, businessLines } from '@/modules/parties/schema'

type BusinessLineSeed = {
  slug: string
  name: string
  brandSlug: string
  kind: 'services' | 'subscription' | 'ad_revenue' | 'product' | 'other'
  displayOrder: number
}

const BUSINESS_LINE_SEEDS: ReadonlyArray<BusinessLineSeed> = [
  { slug: 'consulting', name: 'SAP/AI Consulting', brandSlug: 'varahi-systems', kind: 'services', displayOrder: 0 },
  { slug: 'matrimony', name: 'Pravara Matrimony', brandSlug: 'pravara-ai', kind: 'subscription', displayOrder: 1 },
  { slug: 'cxallies', name: 'CXAllies Product', brandSlug: 'cxallies', kind: 'subscription', displayOrder: 2 },
  { slug: 'moonking-yt', name: 'Moonking YouTube', brandSlug: 'moonking-studios', kind: 'ad_revenue', displayOrder: 3 },
]

export async function seedBusinessLines(organizationId: string): Promise<void> {
  const requiredBrandSlugs = BUSINESS_LINE_SEEDS.map((b) => b.brandSlug)
  const brandRows = await db
    .select({ id: brands.id, slug: brands.slug })
    .from(brands)
    .where(and(eq(brands.organizationId, organizationId), inArray(brands.slug, requiredBrandSlugs)))

  const brandIdBySlug = new Map(brandRows.map((b) => [b.slug, b.id]))

  const values = BUSINESS_LINE_SEEDS.map((bl) => {
    const brandId = brandIdBySlug.get(bl.brandSlug)
    if (!brandId) {
      throw new Error(`Brand "${bl.brandSlug}" not found; seed brands before business_lines`)
    }
    return {
      organizationId,
      brandId,
      slug: bl.slug,
      name: bl.name,
      kind: bl.kind,
      displayOrder: bl.displayOrder,
    }
  })

  await db
    .insert(businessLines)
    .values(values)
    .onConflictDoNothing({ target: [businessLines.organizationId, businessLines.slug] })
}
