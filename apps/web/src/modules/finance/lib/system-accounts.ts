import { and, eq } from 'drizzle-orm'
import { chartOfAccounts } from '../schema'
import { active } from '@/lib/db/active'
import type { FinanceTx } from '@/lib/audit/with-audit'

/**
 * Closed list of system-account roles. Each role tags exactly one CoA row
 * per organization (enforced by the partial unique index on
 * (organization_id, system_role) WHERE system_role IS NOT NULL).
 *
 * The journal helpers find their debit/credit accounts via
 * `findSystemAccount(tx, orgId, role)` — never by hardcoded account_number,
 * per conventions §3.11.
 *
 * Add a role here AND tag at least one chart_of_accounts_template_lines row
 * with the same value (so newly onboarded orgs get the account on
 * materialization). For existing orgs, ship a backfill migration that sets
 * system_role on the appropriate row.
 *
 * Phase 1: cash + AR. P1-09 + P1-13 + P1-19 will extend (expense_clearing,
 * payment_processor_holding, retained_earnings, ...).
 */
export const SYSTEM_ROLES = ['cash_operating', 'ar_default'] as const
export type SystemRole = (typeof SYSTEM_ROLES)[number]

export class MissingSystemAccountError extends Error {
  constructor(
    public readonly role: SystemRole,
    public readonly organizationId: string,
  ) {
    super(
      `No chart_of_accounts row tagged system_role='${role}' for organization ${organizationId}. Tag the appropriate account in Settings → Finance.`,
    )
    this.name = 'MissingSystemAccountError'
  }
}

export async function findSystemAccount(
  tx: FinanceTx,
  organizationId: string,
  role: SystemRole,
): Promise<string> {
  const [row] = await tx
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.organizationId, organizationId),
        eq(chartOfAccounts.systemRole, role),
        active(chartOfAccounts),
      ),
    )
    .limit(1)

  if (!row) throw new MissingSystemAccountError(role, organizationId)
  return row.id
}
