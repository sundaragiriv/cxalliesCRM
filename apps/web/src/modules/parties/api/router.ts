import { router } from '@/lib/trpc/server'
import { organizationRouter } from './organization'

export const partiesRouter = router({
  organization: organizationRouter,
})
