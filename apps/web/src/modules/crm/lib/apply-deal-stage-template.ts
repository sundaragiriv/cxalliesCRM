import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  dealStages,
  dealStageTemplateLines,
  dealStageTemplates,
} from '../schema'

/**
 * Maps a business_line.kind value to the deal-stage-template slug it should
 * materialize from. Returns null when no pipeline applies (e.g., automated
 * revenue sources like YouTube ads have no sales pipeline to manage).
 *
 * Per conventions §3.11 — sales pipelines vary by business model; ship
 * templates and let tenants customize. The mapping below picks the sensible
 * default for each BL kind; tenants can swap by calling this helper with
 * a different templateSlug after onboarding.
 */
export const TEMPLATE_BY_BL_KIND: Record<string, string | null> = {
  services: 'consulting-pipeline',
  subscription: 'subscription-pipeline',
  ad_revenue: null, // automated revenue — no pipeline to manage
  product: null, // TBD when product BL kind has a real pipeline shape
  other: 'consulting-pipeline', // sensible fallback for arbitrary deal-driven lines
}

export interface ApplyDealStageTemplateOptions {
  organizationId: string
  businessLineId: string
  templateSlug: string
}

export interface ApplyDealStageTemplateResult {
  inserted: number
  skipped: number
  total: number
}

/**
 * Materializes a deal-stage template into per-org `crm_deal_stages` rows for
 * a given business_line.
 *
 * Idempotent: rows already present (matched by `(org, business_line, slug)`)
 * are skipped. Safe to re-run; safe against an already-customized BL (only
 * missing stages are inserted).
 *
 * Doc note for callers: when iterating org's business_lines and the BL kind
 * resolves to `null` in TEMPLATE_BY_BL_KIND (e.g., ad_revenue), skip the call
 * — there's no pipeline to materialize. Don't force-seed mismatched
 * workflows; tenants who later need stages for an ad_revenue line apply a
 * template manually via UI in Phase 2.
 */
export async function applyDealStageTemplate(
  options: ApplyDealStageTemplateOptions,
): Promise<ApplyDealStageTemplateResult> {
  const { organizationId, businessLineId, templateSlug } = options

  const [template] = await db
    .select({ id: dealStageTemplates.id })
    .from(dealStageTemplates)
    .where(eq(dealStageTemplates.slug, templateSlug))
    .limit(1)

  if (!template) {
    throw new Error(`Deal stage template not found: ${templateSlug}`)
  }

  const lines = await db
    .select()
    .from(dealStageTemplateLines)
    .where(eq(dealStageTemplateLines.templateId, template.id))
    .orderBy(dealStageTemplateLines.displayOrder)

  // Snapshot existing per-(org, BL) stages so we skip rather than duplicate.
  const existing = await db
    .select({ slug: dealStages.slug })
    .from(dealStages)
    .where(
      and(
        eq(dealStages.organizationId, organizationId),
        eq(dealStages.businessLineId, businessLineId),
      ),
    )
  const existingSlugs = new Set(existing.map((r) => r.slug))

  let inserted = 0
  let skipped = 0
  for (const line of lines) {
    if (existingSlugs.has(line.slug)) {
      skipped += 1
      continue
    }
    await db.insert(dealStages).values({
      organizationId,
      businessLineId,
      name: line.name,
      slug: line.slug,
      displayOrder: line.displayOrder,
      kind: line.kind,
      defaultProbability: line.defaultProbability,
    })
    inserted += 1
  }

  return { inserted, skipped, total: lines.length }
}
