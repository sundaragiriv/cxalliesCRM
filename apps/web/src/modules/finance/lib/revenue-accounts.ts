import { and, asc, eq } from 'drizzle-orm'
import { chartOfAccounts } from '../schema'
import { active } from '@/lib/db/active'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Thrown when a journal helper can't find a revenue account for a given
 * (org, business_line). Mirrors MissingSystemAccountError shape so the UI
 * banner pattern from P1-08 ("Set rate on Project / Override per entry")
 * applies cleanly: "Tag a revenue account for this BL in CoA settings, or
 * pick a chart_of_accounts_id on the invoice line."
 */
export class MissingRevenueAccountError extends Error {
  readonly fieldErrors: Record<string, string>
  constructor(
    public readonly organizationId: string,
    public readonly businessLineId: string,
  ) {
    super(
      `No revenue account found in CoA for organization ${organizationId}, business_line ${businessLineId}. ` +
        `Tag a revenue account for this business line in Settings → Finance, or set chart_of_accounts_id on the invoice line.`,
    )
    this.fieldErrors = { chartOfAccountsId: 'Revenue account required' }
    this.name = 'MissingRevenueAccountError'
  }
}

/**
 * Find the first active revenue account in the CoA for a given
 * (organization, business_line). Returns the row id.
 *
 * Resolution rule for invoice line journal posting (P1-13):
 *   1. invoice_line.chart_of_accounts_id (user override) — handled by caller
 *   2. lookup via this helper using the line's project's business_line_id
 *   3. Else throw MissingRevenueAccountError
 *
 * Selection within a BL: ORDER BY account_number ASC, LIMIT 1. Tenants who
 * have multiple revenue accounts per BL (e.g., "Consulting Revenue" +
 * "Consulting Bonus Revenue") should override per-line at invoice generation
 * via the chart_of_accounts_id column.
 */
export async function findRevenueAccountForBusinessLine(
  tx: FinanceTx,
  organizationId: string,
  businessLineId: string,
): Promise<string> {
  const [row] = await tx
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.organizationId, organizationId),
        eq(chartOfAccounts.businessLineId, businessLineId),
        eq(chartOfAccounts.accountType, 'revenue'),
        eq(chartOfAccounts.isActive, true),
        active(chartOfAccounts),
      ),
    )
    .orderBy(asc(chartOfAccounts.accountNumber))
    .limit(1)

  if (!row) throw new MissingRevenueAccountError(organizationId, businessLineId)
  return row.id
}
