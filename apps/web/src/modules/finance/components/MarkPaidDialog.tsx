'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { markTaxEstimatePaid } from '../actions/tax-estimates'
import { formatMoney, parseMoneyToCents } from '../lib/format-money'

export interface MarkPaidEstimate {
  id: string
  taxYear: number
  taxQuarter: number
  federalEstimateCents: number
  stateEstimateCents: number
  selfEmploymentEstimateCents: number
  totalEstimateCents: number
}

export interface MarkPaidDialogProps {
  open: boolean
  estimate: MarkPaidEstimate | null
  onClose: () => void
  onSuccess: () => void | Promise<void>
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function MarkPaidDialog({
  open,
  estimate,
  onClose,
  onSuccess,
}: MarkPaidDialogProps) {
  const [paidOn, setPaidOn] = useState(todayIso())
  const [federalInput, setFederalInput] = useState('')
  const [stateInput, setStateInput] = useState('')
  const [seInput, setSeInput] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset when dialog opens with a new estimate.
  useEffect(() => {
    if (!open || !estimate) return
    setPaidOn(todayIso())
    setFederalInput((estimate.federalEstimateCents / 100).toFixed(2))
    setStateInput((estimate.stateEstimateCents / 100).toFixed(2))
    setSeInput((estimate.selfEmploymentEstimateCents / 100).toFixed(2))
    setReference('')
    setNotes('')
  }, [open, estimate])

  if (!open || !estimate) return null

  const federalCents = parseMoneyToCents(federalInput || '0')
  const stateCents = parseMoneyToCents(stateInput || '0')
  const seCents = parseMoneyToCents(seInput || '0')
  const totalCents = federalCents + stateCents + seCents

  async function handleSubmit() {
    if (!estimate) return
    if (totalCents <= 0) {
      toast.error('Total paid must be greater than 0')
      return
    }
    if (reference.trim().length === 0) {
      toast.error('Reference required (EFTPS confirmation, check #, etc.)')
      return
    }
    setSubmitting(true)
    try {
      const result = await markTaxEstimatePaid({
        id: estimate.id,
        paidOn,
        federalCents,
        stateCents,
        seCents,
        reference: reference.trim(),
        notes: notes.trim() || undefined,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Paid ${formatMoney(totalCents)} — ${result.data.journalEntryNumber}`)
      await onSuccess()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
      <div className="my-8 w-full max-w-lg rounded-lg bg-card p-5 shadow-lg">
        <h3 className="text-lg font-semibold">
          Mark {estimate.taxYear} Q{estimate.taxQuarter} paid
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Posts a journal entry: DEBIT Owner Draws (3 lines), CREDIT Cash – Operating.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="paidOn">Payment date</Label>
            <Input
              id="paidOn"
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="federal">Federal</Label>
              <Input
                id="federal"
                inputMode="decimal"
                value={federalInput}
                onChange={(e) => setFederalInput(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                inputMode="decimal"
                value={stateInput}
                onChange={(e) => setStateInput(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="se">SE</Label>
              <Input
                id="se"
                inputMode="decimal"
                value={seInput}
                onChange={(e) => setSeInput(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total to pay
            </p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(totalCents)}</p>
          </div>

          <div>
            <Label htmlFor="reference">Reference</Label>
            <Input
              id="reference"
              placeholder="EFTPS confirmation 2026Q1-12345"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Embedded in the journal entry description and audit log.
            </p>
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

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={submitting || totalCents <= 0} onClick={handleSubmit}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Record payment
          </Button>
        </div>
      </div>
    </div>
  )
}
