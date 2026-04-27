import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { businessLines } from '@/modules/parties/schema'
import { applyChartOfAccountsTemplate } from '@/modules/finance/lib/apply-template'

/**
 * Materializes the 'multi-line-operator' template into Varahi's chart_of_accounts.
 * The seed builds the (business_line slug → id) map and passes it in so the
 * apply function stays finance-only.
 */
export async function seedChartOfAccounts(organizationId: string): Promise<void> {
  const blRows = await db
    .select({ id: businessLines.id, slug: businessLines.slug })
    .from(businessLines)
    .where(eq(businessLines.organizationId, organizationId))

  const businessLineIdBySlug = Object.fromEntries(blRows.map((b) => [b.slug, b.id]))

  const result = await applyChartOfAccountsTemplate(organizationId, 'multi-line-operator', {
    businessLineIdBySlug,
  })

  console.log(
    `    inserted ${result.inserted}, skipped ${result.skipped}, total ${result.total}`,
  )
}
