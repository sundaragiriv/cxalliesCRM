'use client'

import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ErrorStateProps {
  title?: string
  description?: string
  error?: Error & { digest?: string }
  reset?: () => void
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'The page failed to render. Try again, or reach out if it keeps happening.',
  error,
  reset,
  className,
}: ErrorStateProps) {
  const showStack =
    process.env.NODE_ENV === 'development' && error?.stack ? error.stack : null

  return (
    <div
      className={cn(
        'flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center',
        className,
      )}
    >
      <div className="rounded-full bg-destructive/10 p-3 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {error?.digest && (
        <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      {reset && (
        <Button variant="outline" onClick={reset} className="mt-2">
          <RotateCcw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      )}
      {showStack && (
        <pre className="mt-4 max-h-64 w-full max-w-2xl overflow-auto rounded bg-muted p-3 text-left text-xs">
          {showStack}
        </pre>
      )}
    </div>
  )
}
