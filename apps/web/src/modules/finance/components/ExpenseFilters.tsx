'use client'

import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { trpc } from '@/lib/trpc/client'

export interface ExpenseFilterState {
  search?: string
  businessLineId?: string
  fromDate?: string
  toDate?: string
  isBillable?: boolean
  isReimbursable?: boolean
}

export interface ExpenseFiltersProps {
  value: ExpenseFilterState
  onChange: (next: ExpenseFilterState) => void
}

export function ExpenseFilters({ value, onChange }: ExpenseFiltersProps) {
  const businessLinesQuery = trpc.finance.pickerOptions.businessLines.useQuery()
  const [searchInput, setSearchInput] = useState(value.search ?? '')

  function commitSearch() {
    onChange({ ...value, search: searchInput.trim() || undefined })
  }

  function clearAll() {
    setSearchInput('')
    onChange({})
  }

  const hasFilters =
    !!value.search ||
    !!value.businessLineId ||
    !!value.fromDate ||
    !!value.toDate ||
    value.isBillable !== undefined ||
    value.isReimbursable !== undefined

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Label htmlFor="search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitSearch()
                }
              }}
              onBlur={commitSearch}
              placeholder="Description, payee, notes…"
              className="pl-9"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="businessLine">Business line</Label>
          <Select
            value={value.businessLineId ?? 'all'}
            onValueChange={(v) =>
              onChange({ ...value, businessLineId: v === 'all' ? undefined : v })
            }
          >
            <SelectTrigger id="businessLine">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(businessLinesQuery.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="fromDate">From</Label>
            <Input
              id="fromDate"
              type="date"
              value={value.fromDate ?? ''}
              onChange={(e) => onChange({ ...value, fromDate: e.target.value || undefined })}
            />
          </div>
          <div>
            <Label htmlFor="toDate">To</Label>
            <Input
              id="toDate"
              type="date"
              value={value.toDate ?? ''}
              onChange={(e) => onChange({ ...value, toDate: e.target.value || undefined })}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value.isBillable === true}
            onCheckedChange={(v) =>
              onChange({ ...value, isBillable: v === true ? true : undefined })
            }
          />
          Billable only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value.isReimbursable === true}
            onCheckedChange={(v) =>
              onChange({ ...value, isReimbursable: v === true ? true : undefined })
            }
          />
          Reimbursable only
        </label>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="ml-auto">
            <X className="mr-1 h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}
