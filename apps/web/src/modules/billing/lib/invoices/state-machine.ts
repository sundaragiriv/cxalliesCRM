/**
 * Invoice state machine.
 *
 * Per conventions §3.11 — transition graph as data, not switch statements.
 * Mirrors expense-report (P1-09) and timesheet (P1-12) patterns.
 *
 *   draft          → sent              postInvoiceJournal (AR debit + revenue credits)
 *   draft          → [soft delete]
 *   sent           → partially_paid    postPaymentJournal per payment (cash debit + AR credit)
 *   sent           → paid              full payment closes it out
 *   sent           → void              reverse the invoice journal; BLOCKED if any payments exist
 *   partially_paid → paid              final payment closes it out
 *   partially_paid → void              BLOCKED — refund flow not in P1-13 scope
 *   paid           → void              BLOCKED — refund flow not in P1-13 scope
 *   void           → [terminal]
 *
 * Notes:
 *   - `overdue` is a DERIVED UI badge: `due_date < today AND status IN ('sent','partially_paid')`.
 *     We do NOT mutate status='overdue'. Avoids depending on now() in the state machine
 *     and skips a daily job in P1-13.
 *   - `canceled` enum value is reserved/unused — `void` is the user-facing action for
 *     sent+ invoices; soft-delete handles draft mistakes. Keep the enum value for
 *     forward-compat (migration cost vs zero benefit).
 *   - Unlike revenue/expense (which support material-change reverse-and-repost),
 *     invoice corrections after send go through void + new. Reasoning: multi-line
 *     invoices with per-line BL → revenue-account mappings make reverse-and-repost
 *     reconciliation non-trivial; void+new preserves audit trail with simpler code,
 *     matches QuickBooks/FreshBooks user expectation.
 */

export const INVOICE_STATUSES = [
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue', // present in DB enum; not used as a written value (derived only)
  'void',
  'canceled', // present in DB enum; reserved/unused
] as const

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

const TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  draft: ['sent'],
  sent: ['partially_paid', 'paid', 'void'],
  partially_paid: ['paid'], // void blocked here at the action layer (refund Phase 2)
  paid: [], // terminal
  overdue: [], // never written; treated as terminal if it ever appears
  void: [],
  canceled: [], // reserved/unused
}

export function nextAllowedStates(
  status: InvoiceStatus,
): readonly InvoiceStatus[] {
  return TRANSITIONS[status]
}

export function isTransitionAllowed(
  from: InvoiceStatus,
  to: InvoiceStatus,
): boolean {
  return TRANSITIONS[from].includes(to)
}

export class InvalidInvoiceTransitionError extends Error {
  constructor(
    public readonly from: InvoiceStatus,
    public readonly to: InvoiceStatus,
  ) {
    super(
      `Cannot transition invoice from '${from}' to '${to}'. ` +
        `Allowed from '${from}': [${TRANSITIONS[from].join(', ') || 'terminal'}].`,
    )
    this.name = 'InvalidInvoiceTransitionError'
  }
}

export function assertTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): void {
  if (!isTransitionAllowed(from, to)) {
    throw new InvalidInvoiceTransitionError(from, to)
  }
}

/**
 * Whether the invoice's content (lines, amounts, party, dates) can be edited
 * at the given status. Confined to draft — once sent, edits go through
 * void + new per the design rationale above.
 */
export function canEditContent(status: InvoiceStatus): boolean {
  return status === 'draft'
}

/**
 * Whether a soft-delete is allowed at the given status. Drafts can be
 * deleted freely. Sent invoices use void instead — soft-delete is reserved
 * for "remove from list view" of already-voided invoices (handled by an
 * admin-only path, not in P1-13's UI).
 */
export function canSoftDelete(status: InvoiceStatus): boolean {
  return status === 'draft' || status === 'void'
}

/**
 * Computed-overdue check for UI badges. Pure; safe to call in any context
 * with a Date that represents "today" in the org's timezone (Phase 1 uses UTC).
 */
export function isOverdue(
  status: InvoiceStatus,
  dueDateIso: string,
  today: Date = new Date(),
): boolean {
  if (status !== 'sent' && status !== 'partially_paid') return false
  const todayIso = today.toISOString().slice(0, 10)
  return dueDateIso < todayIso
}
