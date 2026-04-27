import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  chartOfAccountsTemplates,
  chartOfAccountsTemplateLines,
  type ChartOfAccountsTemplate,
} from '@/modules/finance/schema'

type TemplateLineSeed = {
  accountNumber: string
  accountName: string
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cogs'
  accountSubtype: string
  parentAccountNumber?: string
  description?: string
  suggestedBusinessLineMatch?: string
  /** Carried over to chart_of_accounts.system_role at materialization. */
  systemRole?: string
}

const MULTI_LINE_OPERATOR_TEMPLATE = {
  slug: 'multi-line-operator',
  name: 'Multi-Line Operator',
  description:
    'Starter chart of accounts for an owner-operator running multiple business lines (services + subscription + ad revenue).',
  targetPersona: 'Solo founder running services + SaaS + content',
} as const

const MULTI_LINE_OPERATOR_LINES: ReadonlyArray<TemplateLineSeed> = [
  // 1xxx Assets
  { accountNumber: '1000', accountName: 'Cash – Operating', accountType: 'asset', accountSubtype: 'current_asset', systemRole: 'cash_operating' },
  { accountNumber: '1010', accountName: 'Cash – Savings', accountType: 'asset', accountSubtype: 'current_asset' },
  { accountNumber: '1100', accountName: 'Accounts Receivable', accountType: 'asset', accountSubtype: 'current_asset', systemRole: 'ar_default' },
  { accountNumber: '1200', accountName: 'Prepaid Expenses', accountType: 'asset', accountSubtype: 'current_asset' },
  { accountNumber: '1500', accountName: 'Computers & Equipment', accountType: 'asset', accountSubtype: 'fixed_asset' },

  // 2xxx Liabilities
  { accountNumber: '2000', accountName: 'Accounts Payable', accountType: 'liability', accountSubtype: 'current_liability' },
  { accountNumber: '2100', accountName: 'Sales Tax Payable', accountType: 'liability', accountSubtype: 'current_liability' },
  { accountNumber: '2200', accountName: 'Federal Income Tax Payable', accountType: 'liability', accountSubtype: 'current_liability' },
  { accountNumber: '2210', accountName: 'NC State Income Tax Payable', accountType: 'liability', accountSubtype: 'current_liability' },
  { accountNumber: '2220', accountName: 'Self-Employment Tax Payable', accountType: 'liability', accountSubtype: 'current_liability' },
  { accountNumber: '2300', accountName: 'Employee Reimbursements Payable', accountType: 'liability', accountSubtype: 'current_liability', systemRole: 'employee_payable' },

  // 3xxx Equity
  { accountNumber: '3000', accountName: "Owner's Equity", accountType: 'equity', accountSubtype: 'equity' },
  { accountNumber: '3100', accountName: 'Retained Earnings', accountType: 'equity', accountSubtype: 'equity' },
  { accountNumber: '3200', accountName: 'Owner Draws', accountType: 'equity', accountSubtype: 'equity' },

  // 4xxx Revenue (linked to business lines via slug match)
  {
    accountNumber: '4000',
    accountName: 'Consulting Revenue',
    accountType: 'revenue',
    accountSubtype: 'operating_revenue',
    suggestedBusinessLineMatch: 'consulting',
  },
  {
    accountNumber: '4100',
    accountName: 'Pravara Matrimony Subscriptions',
    accountType: 'revenue',
    accountSubtype: 'operating_revenue',
    suggestedBusinessLineMatch: 'matrimony',
  },
  {
    accountNumber: '4200',
    accountName: 'CXAllies Product Revenue',
    accountType: 'revenue',
    accountSubtype: 'operating_revenue',
    suggestedBusinessLineMatch: 'cxallies',
  },
  {
    accountNumber: '4300',
    accountName: 'YouTube Ad Revenue',
    accountType: 'revenue',
    accountSubtype: 'operating_revenue',
    suggestedBusinessLineMatch: 'moonking-yt',
  },

  // 5xxx Expenses
  { accountNumber: '5000', accountName: 'Travel', accountType: 'expense', accountSubtype: 'operating_expense' },
  { accountNumber: '5100', accountName: 'Software & Subscriptions', accountType: 'expense', accountSubtype: 'operating_expense' },
  { accountNumber: '5200', accountName: 'Professional Services', accountType: 'expense', accountSubtype: 'operating_expense' },
  { accountNumber: '5300', accountName: 'Marketing & Advertising', accountType: 'expense', accountSubtype: 'operating_expense' },
  { accountNumber: '5400', accountName: 'Office Supplies', accountType: 'expense', accountSubtype: 'operating_expense' },
  { accountNumber: '5500', accountName: 'Payroll Expense', accountType: 'expense', accountSubtype: 'payroll_expense' },
  { accountNumber: '5600', accountName: 'Contractor Payments (1099)', accountType: 'expense', accountSubtype: 'operating_expense' },
  { accountNumber: '5700', accountName: 'Bank & Payment Processing Fees', accountType: 'expense', accountSubtype: 'operating_expense' },
  { accountNumber: '5800', accountName: 'Meals & Entertainment', accountType: 'expense', accountSubtype: 'operating_expense' },
]

/**
 * Seeds the system-managed CoA templates that ship with the product.
 * Idempotent on (slug) for templates and (template_id, account_number) for lines.
 */
export async function seedChartOfAccountsTemplates(): Promise<void> {
  // Upsert the template row.
  let template: ChartOfAccountsTemplate | undefined
  const [existing] = await db
    .select()
    .from(chartOfAccountsTemplates)
    .where(eq(chartOfAccountsTemplates.slug, MULTI_LINE_OPERATOR_TEMPLATE.slug))
    .limit(1)

  if (existing) {
    template = existing
  } else {
    const [inserted] = await db
      .insert(chartOfAccountsTemplates)
      .values(MULTI_LINE_OPERATOR_TEMPLATE)
      .returning()
    if (!inserted) throw new Error('Failed to insert CoA template')
    template = inserted
  }

  // Insert any missing template lines.
  await db
    .insert(chartOfAccountsTemplateLines)
    .values(
      MULTI_LINE_OPERATOR_LINES.map((line, idx) => ({
        templateId: template!.id,
        accountNumber: line.accountNumber,
        accountName: line.accountName,
        accountType: line.accountType,
        accountSubtype: line.accountSubtype,
        parentAccountNumber: line.parentAccountNumber ?? null,
        description: line.description ?? null,
        suggestedBusinessLineMatch: line.suggestedBusinessLineMatch ?? null,
        systemRole: line.systemRole ?? null,
        displayOrder: idx,
      })),
    )
    .onConflictDoNothing({
      target: [chartOfAccountsTemplateLines.templateId, chartOfAccountsTemplateLines.accountNumber],
    })
}
