import { initTRPC, TRPCError } from '@trpc/server'
import { auth } from '@/lib/auth'
import superjson from 'superjson'

export type TrpcContext = {
  session: Awaited<ReturnType<typeof auth.api.getSession>>
  headers: Headers
}

export async function createContext({ headers }: { headers: Headers }): Promise<TrpcContext> {
  const session = await auth.api.getSession({ headers })
  return { session, headers }
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
})

export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware

export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      user: ctx.session.user,
    },
  })
})
