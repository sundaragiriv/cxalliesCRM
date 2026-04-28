import { router } from '@/lib/trpc/server'
import { timeEntriesRouter } from './time-entries'
import { timesheetsRouter } from './timesheets'

export const billingRouter = router({
  timeEntries: timeEntriesRouter,
  timesheets: timesheetsRouter,
})
