import { router } from '@/lib/trpc/server'
import { timeEntriesRouter } from './time-entries'
import { timesheetsRouter } from './timesheets'
import { projectsRouter } from './projects'
import { invoicesRouter, paymentsRouter } from './invoices'

export const billingRouter = router({
  timeEntries: timeEntriesRouter,
  timesheets: timesheetsRouter,
  projects: projectsRouter,
  invoices: invoicesRouter,
  payments: paymentsRouter,
})
