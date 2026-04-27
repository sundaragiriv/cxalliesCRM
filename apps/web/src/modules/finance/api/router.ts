import { router } from '@/lib/trpc/server'
import { expensesRouter } from './expenses'
import { revenueRouter } from './revenue'
import { pickerOptionsRouter } from './picker-options'

export const financeRouter = router({
  expenses: expensesRouter,
  revenue: revenueRouter,
  pickerOptions: pickerOptionsRouter,
})
