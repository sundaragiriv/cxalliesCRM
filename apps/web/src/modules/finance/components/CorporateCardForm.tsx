'use client'

import { useRouter } from 'next/navigation'
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
import { Checkbox } from '@/components/ui/checkbox'
import { useFormWithAction } from '@/lib/forms/use-form-with-action'
import {
  createCorporateCard,
  updateCorporateCard,
} from '../actions/corporate-cards'
import type {
  CardOwnership,
  CardType,
} from '../actions/corporate-cards-schema'

const formSchema = z.object({
  nickname: z.string().trim().min(1, 'Required').max(100),
  lastFour: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
  cardType: z.enum(['visa', 'mastercard', 'amex', 'discover', 'other']),
  ownership: z.enum(['business_owned', 'personal_with_business_use']),
  isActive: z.boolean(),
  notes: z.string().trim().max(2000),
})

type FormValues = z.infer<typeof formSchema>

const CARD_TYPES: ReadonlyArray<{ value: CardType; label: string }> = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'Amex' },
  { value: 'discover', label: 'Discover' },
  { value: 'other', label: 'Other' },
]

const OWNERSHIPS: ReadonlyArray<{ value: CardOwnership; label: string; helper: string }> = [
  {
    value: 'business_owned',
    label: 'Business-owned',
    helper: 'Card is in the business name. Expenses are direct business spend.',
  },
  {
    value: 'personal_with_business_use',
    label: 'Personal (business use)',
    helper: 'Personal card used for some business spend. Expenses default to reimbursable.',
  },
]

export interface CorporateCardFormProps {
  mode: 'create' | 'edit'
  existing?: {
    id: string
    nickname: string
    lastFour: string
    cardType: CardType
    ownership: CardOwnership
    isActive: boolean
    notes: string | null
  }
}

export function CorporateCardForm({ mode, existing }: CorporateCardFormProps) {
  const router = useRouter()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existing
      ? {
          nickname: existing.nickname,
          lastFour: existing.lastFour,
          cardType: existing.cardType,
          ownership: existing.ownership,
          isActive: existing.isActive,
          notes: existing.notes ?? '',
        }
      : {
          nickname: '',
          lastFour: '',
          cardType: 'visa',
          ownership: 'business_owned',
          isActive: true,
          notes: '',
        },
  })

  const { submit, submitting } = useFormWithAction({
    form,
    action: async (values) => {
      const payload = {
        nickname: values.nickname,
        lastFour: values.lastFour,
        cardType: values.cardType,
        ownership: values.ownership,
        isActive: values.isActive,
        notes: values.notes || null,
      }
      if (mode === 'edit' && existing) {
        return updateCorporateCard({ id: existing.id, ...payload })
      }
      return createCorporateCard(payload)
    },
    successMessage: mode === 'create' ? 'Card added' : 'Card updated',
    onSuccess: () => {
      router.push('/finance/cards')
      router.refresh()
    },
  })

  const selectedOwnership = OWNERSHIPS.find((o) => o.value === form.watch('ownership'))

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
      <div>
        <Label htmlFor="nickname">Nickname</Label>
        <Input
          id="nickname"
          placeholder="Chase Sapphire — Business"
          {...form.register('nickname')}
        />
        {form.formState.errors.nickname && (
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.nickname.message}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="lastFour">Last 4 digits</Label>
          <Input
            id="lastFour"
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
            {...form.register('lastFour')}
          />
          {form.formState.errors.lastFour && (
            <p className="mt-1 text-xs text-red-600">{form.formState.errors.lastFour.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="cardType">Network</Label>
          <Select
            value={form.watch('cardType')}
            onValueChange={(v) =>
              form.setValue('cardType', v as FormValues['cardType'], {
                shouldValidate: false,
              })
            }
          >
            <SelectTrigger id="cardType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CARD_TYPES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="ownership">Ownership</Label>
        <Select
          value={form.watch('ownership')}
          onValueChange={(v) =>
            form.setValue('ownership', v as FormValues['ownership'], {
              shouldValidate: false,
            })
          }
        >
          <SelectTrigger id="ownership">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OWNERSHIPS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedOwnership && (
          <p className="mt-1 text-xs text-muted-foreground">{selectedOwnership.helper}</p>
        )}
      </div>

      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" rows={3} {...form.register('notes')} />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="isActive"
          checked={form.watch('isActive')}
          onCheckedChange={(c) => form.setValue('isActive', c === true)}
        />
        <Label htmlFor="isActive" className="cursor-pointer">
          Active
        </Label>
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
              {mode === 'create' ? 'Saving…' : 'Updating…'}
            </>
          ) : mode === 'create' ? (
            'Add card'
          ) : (
            'Update card'
          )}
        </Button>
      </div>
    </form>
  )
}
