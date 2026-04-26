import { router, publicProcedure } from './server'

/**
 * Root router. Modules contribute sub-routers in their tickets (P1-06+).
 * The `health.check` query is a placeholder so the tRPC handler has at least
 * one procedure to serve.
 */
export const appRouter = router({
  health: router({
    check: publicProcedure.query(() => ({ ok: true, ts: new Date().toISOString() })),
  }),
})

export type AppRouter = typeof appRouter
