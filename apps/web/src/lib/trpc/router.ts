import { router, publicProcedure } from './server'
import { financeRouter } from '@/modules/finance/api/router'
import { billingRouter } from '@/modules/billing/api/router'
import { filesRouter } from '@/modules/files/api/router'

export const appRouter = router({
  health: router({
    check: publicProcedure.query(() => ({ ok: true, ts: new Date().toISOString() })),
  }),
  finance: financeRouter,
  billing: billingRouter,
  files: filesRouter,
})

export type AppRouter = typeof appRouter
