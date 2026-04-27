'use client'

import Link from 'next/link'
import { Plus, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { trpc } from '@/lib/trpc/client'

const CARD_TYPE_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  other: 'Other',
}

export function CorporateCardList() {
  const query = trpc.finance.corporateCards.list.useQuery({ includeInactive: true })
  const items = query.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Corporate cards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track which cards are business-owned vs. personal-with-business-use.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/finance/cards/new">
            <Plus className="mr-2 h-5 w-5" />
            Add card
          </Link>
        </Button>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No cards yet"
          description="Add the cards you use for business so expenses can be associated with them."
          action={
            <Button asChild size="lg">
              <Link href="/finance/cards/new">
                <Plus className="mr-2 h-5 w-5" />
                Add card
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nickname</TableHead>
                <TableHead>Last 4</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Ownership</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((card) => (
                <TableRow key={card.id}>
                  <TableCell>
                    <Link
                      href={`/finance/cards/${card.id}`}
                      className="font-medium hover:underline"
                    >
                      {card.nickname}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">****{card.lastFour}</TableCell>
                  <TableCell className="text-sm">
                    {CARD_TYPE_LABELS[card.cardType] ?? card.cardType}
                  </TableCell>
                  <TableCell className="text-sm">
                    {card.ownership === 'business_owned'
                      ? 'Business-owned'
                      : 'Personal (business use)'}
                  </TableCell>
                  <TableCell>
                    {card.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
