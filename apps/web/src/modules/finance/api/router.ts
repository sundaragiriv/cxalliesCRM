import { router } from '@/lib/trpc/server'
import { expensesRouter } from './expenses'
import { revenueRouter } from './revenue'
import { expenseReportsRouter } from './expense-reports'
import { corporateCardsRouter } from './corporate-cards'
import { taxEstimatesRouter } from './tax-estimates'
import { pickerOptionsRouter } from './picker-options'

export const financeRouter = router({
  expenses: expensesRouter,
  revenue: revenueRouter,
  expenseReports: expenseReportsRouter,
  corporateCards: corporateCardsRouter,
  taxEstimates: taxEstimatesRouter,
  pickerOptions: pickerOptionsRouter,
})
