import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { businessLines } from '@/modules/parties/schema'
import {
  applyDealStageTemplate,
  TEMPLATE_BY_BL_KIND,
} from '@/modules/crm/lib/apply-deal-stage-template'

/**
 * Materializes deal_stages per (org × business_line). Looks up the
 * template by the BL's `kind` via TEMPLATE_BY_BL_KIND. Skips when no
 * pipeline applies (ad_revenue, product) — see helper docs.
 */
export async function seedDealStages(organizationId: string): Promise<void> {
  const lines = await db
    .select({
      id: businessLines.id,
      slug: businessLines.slug,
      kind: businessLines.kind,
    })
    .from(businessLines)
    .where(eq(businessLines.organizationId, organizationId))

  let materialized = 0
  let skipped = 0
  let stageCount = 0

  for (const bl of lines) {
    const templateSlug = TEMPLATE_BY_BL_KIND[bl.kind] ?? null
    if (!templateSlug) {
      console.log(
        `    ⊘ business_line "${bl.slug}" (kind=${bl.kind}) has no pipeline; skipping`,
      )
      skipped += 1
      continue
    }
    const result = await applyDealStageTemplate({
      organizationId,
      businessLineId: bl.id,
      templateSlug,
    })
    materialized += 1
    stageCount += result.inserted
  }

  console.log(
    `    materialized ${materialized} pipeline${materialized === 1 ? '' : 's'} (${stageCount} stages), skipped ${skipped}`,
  )
}
