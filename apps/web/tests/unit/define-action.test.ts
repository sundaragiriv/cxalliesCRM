import { describe, it, expect, vi, beforeEach } from 'vitest'

const headersMock = vi.fn<() => Promise<Headers>>(async () =>
  new Headers({ 'user-agent': 'vitest', 'x-forwarded-for': '127.0.0.1' }),
)
vi.mock('next/headers', () => ({ headers: headersMock }))

type MockSession = {
  user: { id: string; organizationId?: string }
  session: { id: string; userId?: string }
}

const getSessionMock = vi.fn<() => Promise<MockSession>>(async () => ({
  user: { id: 'user-123', organizationId: 'org-abc' },
  session: { id: 's', userId: 'user-123' },
}))
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: getSessionMock } },
}))

const requirePermissionMock = vi.fn(async () => true)
vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: requirePermissionMock,
}))

// Capture every insert via the mocked tx so we can assert atomicity.
type InsertCall = { table: unknown; values: Record<string, unknown> }
const insertCalls: InsertCall[] = []

const txMock = {
  insert: (table: unknown) => ({
    values: async (values: Record<string, unknown>) => {
      insertCalls.push({ table, values })
      return [{ id: 'inserted-id' }]
    },
  }),
}

const transactionMock = vi.fn(
  async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
)
const dbMock = { transaction: transactionMock }

vi.mock('@/db/client', () => ({ db: dbMock }))
vi.mock('@/db/shared-tables', () => ({ auditLog: { __isAuditLog: true } }))

const { defineAction } = await import('@/lib/actions/define-action')
const { z } = await import('zod')

describe('defineAction (tx-threaded)', () => {
  beforeEach(() => {
    insertCalls.length = 0
    headersMock.mockResolvedValue(
      new Headers({ 'user-agent': 'vitest', 'x-forwarded-for': '127.0.0.1' }),
    )
    getSessionMock.mockResolvedValue({
      user: { id: 'user-123', organizationId: 'org-abc' },
      session: { id: 's', userId: 'user-123' },
    })
    requirePermissionMock.mockResolvedValue(true)
    transactionMock.mockClear()
  })

  it('opens a tx, passes it to the handler, and audits via the same tx', async () => {
    const action = defineAction({
      permission: { module: 'finance', action: 'write' },
      audit: { table: 'finance_expense_entries', action: 'insert' },
      schema: z.object({ x: z.number() }),
      handler: async (input, ctx) => {
        // Simulate a write inside the handler using ctx.tx.
        await (ctx.tx as unknown as typeof txMock)
          .insert({ __table: 'expenses' })
          .values({ x: input.x, label: 'inner' })
        return {
          result: { id: 'expense-1' },
          recordId: 'expense-1',
          after: { id: 'expense-1', x: input.x },
        }
      },
    })

    const result = await action({ x: 7 })

    expect(result).toEqual({ success: true, data: { id: 'expense-1' } })
    expect(transactionMock).toHaveBeenCalledTimes(1)
    expect(insertCalls).toHaveLength(2)
    expect(insertCalls[0]?.values).toMatchObject({ x: 7, label: 'inner' })
    expect(insertCalls[1]?.values).toMatchObject({
      action: 'insert',
      tableName: 'finance_expense_entries',
      recordId: 'expense-1',
      organizationId: 'org-abc',
    })
  })

  it('returns { success: false } with fieldErrors on zod validation failure', async () => {
    const action = defineAction({
      permission: { module: 'finance', action: 'write' },
      audit: { table: 'finance_expense_entries', action: 'insert' },
      schema: z.object({ amount: z.number().positive('Must be > 0') }),
      handler: async () => ({ result: {}, recordId: 'never' }),
    })

    const result = await action({ amount: -1 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fieldErrors).toEqual({ amount: 'Must be > 0' })
    }
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('rolls back when the handler throws (no audit row written)', async () => {
    const action = defineAction({
      permission: { module: 'finance', action: 'write' },
      audit: { table: 'finance_expense_entries', action: 'insert' },
      schema: z.object({}),
      handler: async (_input, ctx) => {
        await (ctx.tx as unknown as typeof txMock)
          .insert({ __table: 'expenses' })
          .values({ amount: 100 })
        throw new Error('Handler intentionally aborted')
      },
    })

    const result = await action({})

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/aborted/)
    // Handler insert was attempted via the mocked tx, but the audit insert
    // never ran because the handler threw before defineAction's audit step.
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0]?.values).toMatchObject({ amount: 100 })
  })

  it('returns "Not signed in" when there is no session', async () => {
    getSessionMock.mockResolvedValueOnce(null as unknown as MockSession)
    const action = defineAction({
      permission: { module: 'finance', action: 'write' },
      audit: { table: 'finance_expense_entries', action: 'insert' },
      schema: z.object({}),
      handler: async () => ({ result: {}, recordId: 'x' }),
    })
    const result = await action({})
    expect(result).toEqual({ success: false, error: 'Not signed in' })
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('returns FORBIDDEN when permission is denied', async () => {
    requirePermissionMock.mockResolvedValueOnce(false)
    const action = defineAction({
      permission: { module: 'finance', action: 'delete' },
      audit: { table: 'finance_expense_entries', action: 'soft_delete' },
      schema: z.object({}),
      handler: async () => ({ result: {}, recordId: 'x' }),
    })
    const result = await action({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/Missing permission/)
    expect(transactionMock).not.toHaveBeenCalled()
  })
})
