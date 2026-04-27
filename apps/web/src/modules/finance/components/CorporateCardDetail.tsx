'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc/client'
import { CorporateCardForm } from './CorporateCardForm'
import { softDeleteCorporateCard } from '../actions/corporate-cards'
import type {
  CardOwnership,
  CardType,
} from '../actions/corporate-cards-schema'

export function CorporateCardDetail({ cardId }: { cardId: string }) {
  const router = useRouter()
  const query = trpc.finance.corporateCards.get.useQuery({ id: cardId })
  const [deleting, setDeleting] = useState(false)

  if (query.isLoading) return <Skeleton className="h-96 w-full" />
  if (!query.data) return <p className="text-sm text-muted-foreground">Card not found.</p>

  const card = query.data

  async function handleDelete() {
    if (!confirm('Remove this card?')) return
    setDeleting(true)
    try {
      const result = await softDeleteCorporateCard({ id: cardId })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Card removed')
      router.push('/finance/cards')
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/finance/cards"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to cards
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {card.nickname}{' '}
            <span className="font-mono text-xl text-muted-foreground">
              ****{card.lastFour}
            </span>
          </h1>
        </div>
        <Button
          variant="outline"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Remove
        </Button>
      </div>

      <CorporateCardForm
        mode="edit"
        existing={{
          id: card.id,
          nickname: card.nickname,
          lastFour: card.lastFour,
          cardType: card.cardType as CardType,
          ownership: card.ownership as CardOwnership,
          isActive: card.isActive,
          notes: card.notes,
        }}
      />
    </div>
  )
}
