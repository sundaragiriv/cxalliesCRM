'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { trpc } from '@/lib/trpc/client'
import { useFormWithAction } from '@/lib/forms/use-form-with-action'
import {
  createProject,
  updateProject,
} from '../actions/projects'

const formSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(200),
  businessLineId: z.string().uuid('Pick a business line'),
  endClientPartyId: z.string().uuid().nullable(),
  vendorPartyId: z.string().uuid().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').nullable(),
  status: z.enum(['planned', 'active', 'on_hold', 'completed', 'canceled']),
  rateInput: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid rate'),
  currencyCode: z.string().length(3),
  budgetHours: z.string(),
  description: z.string(),
})

type FormValues = z.infer<typeof formSchema>

export interface ProjectFormProps {
  mode: 'create' | 'edit'
  existing?: {
    id: string
    name: string
    businessLineId: string
    endClientPartyId: string | null
    vendorPartyId: string | null
    startDate: string | null
    endDate: string | null
    status: 'planned' | 'active' | 'on_hold' | 'completed' | 'canceled'
    defaultBillableRateCents: number
    currencyCode: string
    budgetHours: string | null
    description: string | null
  }
}

export function ProjectForm({ mode, existing }: ProjectFormProps) {
  const router = useRouter()
  const blQuery = trpc.finance.pickerOptions.businessLines.useQuery()
  const [endClientQuery, setEndClientQuery] = useState('')
  const endClientResults = trpc.finance.pickerOptions.searchPayers.useQuery({
    query: endClientQuery,
    limit: 10,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existing
      ? {
          name: existing.name,
          businessLineId: existing.businessLineId,
          endClientPartyId: existing.endClientPartyId,
          vendorPartyId: existing.vendorPartyId,
          startDate: existing.startDate,
          endDate: existing.endDate,
          status: existing.status,
          rateInput: (existing.defaultBillableRateCents / 100).toFixed(2),
          currencyCode: existing.currencyCode,
          budgetHours: existing.budgetHours ?? '',
          description: existing.description ?? '',
        }
      : {
          name: '',
          businessLineId: '',
          endClientPartyId: null,
          vendorPartyId: null,
          startDate: null,
          endDate: null,
          status: 'planned',
          rateInput: '',
          currencyCode: 'USD',
          budgetHours: '',
          description: '',
        },
  })

  const { submit, submitting } = useFormWithAction({
    form,
    action: async (values) => {
      const rateCents = Math.round(parseFloat(values.rateInput) * 100)
      const payload = {
        name: values.name,
        businessLineId: values.businessLineId,
        endClientPartyId: values.endClientPartyId,
        vendorPartyId: values.vendorPartyId,
        startDate: values.startDate || null,
        endDate: values.endDate || null,
        status: values.status,
        defaultBillableRateCents: rateCents,
        currencyCode: values.currencyCode,
        budgetHours: values.budgetHours || null,
        description: values.description || null,
      }
      if (mode === 'edit' && existing) {
        return updateProject({ id: existing.id, ...payload })
      }
      return createProject(payload)
    },
    successMessage: mode === 'create' ? 'Project created' : 'Project updated',
    onSuccess: (data) => {
      router.push(`/billing/projects/${'id' in data ? data.id : existing?.id}`)
      router.refresh()
    },
  })

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
      <div>
        <Label htmlFor="name">Project name</Label>
        <Input id="name" placeholder="Apex SAP rollout" {...form.register('name')} />
        {form.formState.errors.name && (
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="businessLineId">Business line</Label>
        <Select
          value={form.watch('businessLineId') || undefined}
          onValueChange={(v) => form.setValue('businessLineId', v, { shouldValidate: true })}
        >
          <SelectTrigger id="businessLineId">
            <SelectValue placeholder="Pick a business line" />
          </SelectTrigger>
          <SelectContent>
            {(blQuery.data ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.businessLineId && (
          <p className="mt-1 text-xs text-red-600">
            {form.formState.errors.businessLineId.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="endClient">End client (optional)</Label>
        <Input
          id="endClient"
          placeholder="Type to search…"
          value={endClientQuery}
          onChange={(e) => setEndClientQuery(e.target.value)}
        />
        {(endClientResults.data ?? []).length > 0 && (
          <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover">
            {(endClientResults.data ?? []).map((p) => {
              const isSelected = form.watch('endClientPartyId') === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    form.setValue('endClientPartyId', p.id, {
                      shouldValidate: false,
                    })
                    setEndClientQuery(p.displayName)
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    isSelected ? 'bg-accent' : ''
                  }`}
                >
                  <div className="font-medium">{p.displayName}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="startDate">Start date</Label>
          <Input
            id="startDate"
            type="date"
            value={form.watch('startDate') ?? ''}
            onChange={(e) => form.setValue('startDate', e.target.value || null)}
          />
        </div>
        <div>
          <Label htmlFor="endDate">End date</Label>
          <Input
            id="endDate"
            type="date"
            value={form.watch('endDate') ?? ''}
            onChange={(e) => form.setValue('endDate', e.target.value || null)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="status">Status</Label>
        <Select
          value={form.watch('status')}
          onValueChange={(v) =>
            form.setValue('status', v as FormValues['status'], {
              shouldValidate: false,
            })
          }
        >
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On hold</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="rateInput">Default billable rate ($/hour)</Label>
          <Input
            id="rateInput"
            inputMode="decimal"
            placeholder="200.00"
            {...form.register('rateInput')}
          />
          {form.formState.errors.rateInput && (
            <p className="mt-1 text-xs text-red-600">
              {form.formState.errors.rateInput.message}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Snapshots into time entries at log time (§3.13). Per-entry overrides supported on the time grid.
          </p>
        </div>
        <div>
          <Label htmlFor="budgetHours">Budget hours (optional)</Label>
          <Input
            id="budgetHours"
            inputMode="decimal"
            placeholder="160.00"
            {...form.register('budgetHours')}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea id="description" rows={3} {...form.register('description')} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {mode === 'create' ? 'Creating…' : 'Updating…'}
            </>
          ) : mode === 'create' ? (
            'Create project'
          ) : (
            'Update project'
          )}
        </Button>
      </div>
    </form>
  )
}
