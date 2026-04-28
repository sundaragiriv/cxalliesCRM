import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  dealStageTemplates,
  dealStageTemplateLines,
  type DealStageTemplate,
} from '@/modules/crm/schema'

type TemplateSeed = {
  slug: string
  name: string
  description: string
  targetPersona: string
}

type LineSeed = {
  slug: string
  name: string
  displayOrder: number
  kind: 'open' | 'won' | 'lost'
  defaultProbability: number
}

/**
 * Per conventions §3.11 — sales pipelines vary by business model. Ship
 * templates as system-managed reference data; tenants materialize per
 * (org × business_line) at onboarding via applyDealStageTemplate.
 *
 * Initial set covers the two most common SMB shapes. Add more here as
 * customer feedback clarifies what's missing (e.g., e-commerce funnel,
 * RFP-driven pipeline, recruiting pipeline).
 */
const CONSULTING_PIPELINE: TemplateSeed = {
  slug: 'consulting-pipeline',
  name: 'Consulting / Services',
  description:
    'Standard 4-stage open-to-close pipeline used by services firms. Probability defaults reflect typical close-rate at each stage.',
  targetPersona: 'Services / consulting / agency',
}

const CONSULTING_LINES: LineSeed[] = [
  { slug: 'lead', name: 'Lead', displayOrder: 1, kind: 'open', defaultProbability: 10 },
  { slug: 'qualified', name: 'Qualified', displayOrder: 2, kind: 'open', defaultProbability: 25 },
  { slug: 'proposal-sent', name: 'Proposal Sent', displayOrder: 3, kind: 'open', defaultProbability: 50 },
  { slug: 'negotiation', name: 'Negotiation', displayOrder: 4, kind: 'open', defaultProbability: 75 },
  { slug: 'won', name: 'Won', displayOrder: 5, kind: 'won', defaultProbability: 100 },
  { slug: 'lost', name: 'Lost', displayOrder: 6, kind: 'lost', defaultProbability: 0 },
]

const SUBSCRIPTION_PIPELINE: TemplateSeed = {
  slug: 'subscription-pipeline',
  name: 'Subscription / SaaS',
  description:
    'Lightweight pipeline for self-serve subscription products. Trial converts to Active or Churned; no proposal/negotiation needed.',
  targetPersona: 'SaaS / subscription product',
}

const SUBSCRIPTION_LINES: LineSeed[] = [
  { slug: 'trial', name: 'Trial', displayOrder: 1, kind: 'open', defaultProbability: 40 },
  { slug: 'active', name: 'Active', displayOrder: 2, kind: 'won', defaultProbability: 100 },
  { slug: 'churned', name: 'Churned', displayOrder: 3, kind: 'lost', defaultProbability: 0 },
]

async function upsertTemplate(seed: TemplateSeed): Promise<DealStageTemplate> {
  const [existing] = await db
    .select()
    .from(dealStageTemplates)
    .where(eq(dealStageTemplates.slug, seed.slug))
    .limit(1)
  if (existing) return existing

  const [inserted] = await db
    .insert(dealStageTemplates)
    .values(seed)
    .returning()
  if (!inserted) {
    throw new Error(`Failed to insert deal stage template ${seed.slug}`)
  }
  return inserted
}

async function upsertTemplateLines(
  templateId: string,
  lines: LineSeed[],
): Promise<void> {
  await db
    .insert(dealStageTemplateLines)
    .values(
      lines.map((line) => ({
        templateId,
        slug: line.slug,
        name: line.name,
        displayOrder: line.displayOrder,
        kind: line.kind,
        defaultProbability: line.defaultProbability,
      })),
    )
    .onConflictDoNothing({
      target: [dealStageTemplateLines.templateId, dealStageTemplateLines.slug],
    })
}

export async function seedDealStageTemplates(): Promise<void> {
  const consulting = await upsertTemplate(CONSULTING_PIPELINE)
  await upsertTemplateLines(consulting.id, CONSULTING_LINES)

  const subscription = await upsertTemplate(SUBSCRIPTION_PIPELINE)
  await upsertTemplateLines(subscription.id, SUBSCRIPTION_LINES)
}
