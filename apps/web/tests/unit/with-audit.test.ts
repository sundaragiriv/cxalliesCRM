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

const insertValuesMock = vi.fn<(row: Record<string, unknown>) => Promise<void>>(
  async () => undefined,
)
const insertMock = vi.fn(() => ({ values: insertValuesMock }))
vi.mock('@/db/client', () => ({
  db: { insert: insertMock },
}))

vi.mock('@/db/shared-tables', () => ({
  auditLog: { __isAuditLog: true },
}))

const { withAudit } = await import('@/lib/audit/with-audit')

describe('withAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    headersMock.mockResolvedValue(
      new Headers({ 'user-agent': 'vitest', 'x-forwarded-for': '127.0.0.1' }),
    )
    getSessionMock.mockResolvedValue({
      user: { id: 'user-123', organizationId: 'org-abc' },
      session: { id: 's', userId: 'user-123' },
    })
  })

  it('writes an audit_log row with action, table, recordId, and actor', async () => {
    const wrapped = withAudit('finance_expense_entries', 'insert', async () => ({
      recordId: 'expense-1',
      after: { id: 'expense-1', amountCents: 5000 },
    }))

    const result = await wrapped({ note: 'lunch' })

    expect(result).toEqual({ recordId: 'expense-1' })
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertValuesMock).toHaveBeenCalledTimes(1)

    const insertedRow = insertValuesMock.mock.calls[0]?.[0]
    expect(insertedRow).toMatchObject({
      organizationId: 'org-abc',
      action: 'insert',
      tableName: 'finance_expense_entries',
      recordId: 'expense-1',
      actorUserId: 'user-123',
      after: { id: 'expense-1', amountCents: 5000 },
    })
  })

  it('throws if no organizationId is on the session user', async () => {
    getSessionMock.mockResolvedValueOnce({
      user: { id: 'user-123' },
      session: { id: 's' },
    })

    const wrapped = withAudit('parties', 'update', async () => ({
      recordId: 'p-1',
      before: { id: 'p-1', displayName: 'Old' },
      after: { id: 'p-1', displayName: 'New' },
    }))

    await expect(wrapped({})).rejects.toThrow(/organization_id/)
  })

  it('passes the input to the wrapped function unchanged', async () => {
    const inner = vi.fn(async () => ({ recordId: 'x' }))
    const wrapped = withAudit('parties', 'insert', inner)
    await wrapped({ kind: 'person', displayName: 'Test' })
    expect(inner).toHaveBeenCalledWith({ kind: 'person', displayName: 'Test' })
  })
})
