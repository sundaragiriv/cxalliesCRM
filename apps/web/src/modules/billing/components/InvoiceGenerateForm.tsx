'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { trpc } from '@/lib/trpc/client'
import { generateInvoiceFromProject } from '../actions/invoices'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function InvoiceGenerateForm() {
  const router = useRouter()
  const projectsQuery = trpc.billing.projects.pickerOptions.useQuery()

  const [projectId, setProjectId] = useState<string>('')
  const [periodStart, setPeriodStart] = useState<string>(addDays(todayIso(), -30))
  const [periodEnd, setPeriodEnd] = useState<string>(todayIso())
  const [issueDate, setIssueDate] = useState<string>(todayIso())
  const [dueDate, setDueDate] = useState<string>(addDays(todayIso(), 30))
  const [terms, setTerms] = useState<string>('Net 30')
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const previewQuery = trpc.billing.invoices.previewFromProject.useQuery(
    { projectId, periodStart, periodEnd },
    { enabled: !!projectId && !!periodStart && !!periodEnd },
  )

  const previewSubtotal = useMemo(() => {
    if (!previewQuery.data) return 0
    const timeTotal = previewQuery.data.sourceTimes.reduce(
      (sum, t) =>
        sum + Math.round(parseFloat(t.hours) * 100 * t.billableRateCents) / 100,
      0,
    )
    const expenseTotal = previewQuery.data.sourceExpenses.reduce(
      (sum, e) => sum + e.amountCents,
      0,
    )
    return Math.round(timeTotal + expenseTotal)
  }, [previewQuery.data])

  async function handleGenerate() {
    if (!projectId) {
      toast.error('Pick a project')
      return
    }
    setSubmitting(true)
    try {
      const result = await generateInvoiceFromProject({
        projectId,
        periodStart,
        periodEnd,
        issueDate,
        dueDate,
        terms: terms || undefined,
        notes: notes || undefined,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Invoice ${result.data.invoiceNumber} created`)
      router.push(`/billing/invoices/${result.data.id}`)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <div>
          <Label htmlFor="project">Project</Label>
          <Select value={projectId || undefined} onValueChange={setProjectId}>
            <SelectTrigger id="project">
              <SelectValue placeholder="Pick a project" />
            </SelectTrigger>
            <SelectContent>
              {(projectsQuery.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.projectNumber} — {p.name} ({p.businessLineName})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="periodStart">Period start</Label>
            <Input
              id="periodStart"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="periodEnd">Period end</Label>
            <Input
              id="periodEnd"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="issueDate">Issue date</Label>
            <Input
              id="issueDate"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="dueDate">Due date</Label>
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="terms">Terms (optional)</Label>
          <Input
            id="terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Preview */}
      {projectId && previewQuery.data && (
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-medium">
              Preview ({previewQuery.data.sourceTimes.length} time entries +{' '}
              {previewQuery.data.sourceExpenses.length} expenses)
            </p>
            <p className="text-lg font-bold tabular-nums">
              {formatMoney(previewSubtotal, previewQuery.data.project.currencyCode)}
            </p>
          </div>
          {previewQuery.data.sourceTimes.length === 0 &&
          previewQuery.data.sourceExpenses.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No approved time entries or billable expenses found in this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewQuery.data.sourceTimes.map((t) => {
                  const amount = Math.round(
                    (parseFloat(t.hours) * 100 * t.billableRateCents) / 100,
                  )
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.entryDate}</TableCell>
                      <TableCell>{t.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.hours}h</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {formatMoney(t.billableRateCents, t.currencyCode)}/h
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(amount, t.currencyCode)}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {previewQuery.data.sourceExpenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.entryDate}</TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell className="text-right tabular-nums">1</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {formatMoney(e.amountCents, e.currencyCode)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(e.amountCents, e.currencyCode)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button
          disabled={
            !projectId ||
            submitting ||
            !previewQuery.data ||
            (previewQuery.data.sourceTimes.length === 0 &&
              previewQuery.data.sourceExpenses.length === 0)
          }
          onClick={handleGenerate}
        >
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Generate draft invoice
        </Button>
      </div>
    </div>
  )
}
