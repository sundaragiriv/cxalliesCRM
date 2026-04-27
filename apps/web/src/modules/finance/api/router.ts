import { router } from '@/lib/trpc/server'
import { expensesRouter } from './expenses'
import { pickerOptionsRouter } from './picker-options'

export const financeRouter = router({
  expenses: expensesRouter,
  pickerOptions: pickerOptionsRouter,
})
