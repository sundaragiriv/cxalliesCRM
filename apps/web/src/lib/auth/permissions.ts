/**
 * RBAC permission matrix per architecture §7.2.
 *
 * Phase 1 covers 11 business modules (auth itself is the gating layer, not in the matrix).
 * Only the Owner role is wired end-to-end and enforced. The other 4 roles are seeded and
 * have matrix entries here, but their flows aren't covered by tests beyond the matrix itself
 * — Phase 2 ADR will document and enforce the full matrix.
 *
 * Record-level filtering ("sales sees only own deals") is out of scope for Phase 1. The
 * matrix is purely (role, module, action).
 */

export const MODULES = [
  'parties',
  'files',
  'finance',
  'billing',
  'crm',
  'support',
  'marketing',
  'payroll',
  'hr',
  'reporting',
  'ai',
] as const
export type ModuleName = (typeof MODULES)[number]

export const ACTIONS = ['read', 'write', 'delete', 'admin'] as const
export type ModuleAction = (typeof ACTIONS)[number]

export const ROLE_IDS = ['owner', 'admin', 'bookkeeper', 'sales', 'support_agent'] as const
export type RoleId = (typeof ROLE_IDS)[number]

type RoleAccess = Partial<Record<ModuleName, ReadonlyArray<ModuleAction>>>

const ALL_ACTIONS: ReadonlyArray<ModuleAction> = ACTIONS

/**
 * Owner: full access on every module.
 * Admin: full access except delete; equivalent to read/write/admin everywhere.
 * Bookkeeper: r/w/d/a on finance + billing (they manage CoA, cards, etc.); read on parties/CRM/support.
 * Sales: r/w/d/a on CRM + marketing; read on finance (broad — record-level filtering deferred to Phase 2).
 * Support agent: r/w/d/a on support; read on CRM.
 */
export const PERMISSIONS_BY_ROLE: Record<RoleId, RoleAccess> = {
  owner: Object.fromEntries(MODULES.map((m) => [m, ALL_ACTIONS])) as RoleAccess,

  admin: Object.fromEntries(
    MODULES.map((m) => [m, ['read', 'write', 'admin'] as ReadonlyArray<ModuleAction>]),
  ) as RoleAccess,

  bookkeeper: {
    parties: ['read'],
    files: ['read', 'write'],
    finance: ['read', 'write', 'delete', 'admin'],
    billing: ['read', 'write', 'delete', 'admin'],
    crm: ['read'],
    support: ['read'],
    payroll: ['read', 'write'],
    hr: ['read'],
    reporting: ['read'],
    ai: ['read'],
  },

  sales: {
    parties: ['read', 'write'],
    files: ['read', 'write'],
    finance: ['read'],
    crm: ['read', 'write', 'delete', 'admin'],
    marketing: ['read', 'write', 'delete', 'admin'],
    hr: ['read'],
    reporting: ['read'],
    ai: ['read'],
  },

  support_agent: {
    parties: ['read'],
    files: ['read', 'write'],
    crm: ['read'],
    support: ['read', 'write', 'delete', 'admin'],
    reporting: ['read'],
    ai: ['read'],
  },
}

/**
 * Pure check: does any role in `roleIds` grant `(module, action)`?
 * No DB access. Use `requirePermission()` for the user-facing variant that loads roles.
 */
export function checkPermission(
  roleIds: ReadonlyArray<string>,
  module: ModuleName,
  action: ModuleAction,
): boolean {
  for (const roleId of roleIds) {
    const role = PERMISSIONS_BY_ROLE[roleId as RoleId]
    if (!role) continue
    const allowed = role[module]
    if (allowed?.includes(action)) {
      return true
    }
  }
  return false
}
