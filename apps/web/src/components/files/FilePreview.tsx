'use client'

import { ExternalLink, FileText, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

export interface FilePreviewProps {
  fileId: string
  className?: string
}

/**
 * Renders a preview given a file id. Looks up a presigned R2 URL via tRPC
 * and dispatches:
 *   - image/* → inline <img>
 *   - application/pdf → "Open PDF" link to the browser's native PDF viewer
 *     (per ADR-0006 §3.2 — no JS-based viewer, native browser is better)
 *   - everything else → "Download" link
 */
export function FilePreview({ fileId, className }: FilePreviewProps) {
  const query = trpc.files.getDownloadUrl.useQuery({ fileId })

  if (query.isLoading) {
    return (
      <div className={className}>
        <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (query.error || !query.data) {
    return (
      <div className={className}>
        <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-destructive/40 text-sm text-destructive">
          Failed to load file
        </div>
      </div>
    )
  }

  const { url, mimeType, filename } = query.data

  if (mimeType === 'application/pdf') {
    return (
      <div className={className}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <FileText className="h-4 w-4 text-muted-foreground" />
          {filename}
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
      </div>
    )
  }

  if (mimeType.startsWith('image/')) {
    return (
      <div className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={filename}
          className="max-h-[80vh] w-auto max-w-full rounded-md border border-border bg-white shadow-sm"
        />
      </div>
    )
  }

  return (
    <div className={className}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary underline"
      >
        Download {filename}
      </a>
    </div>
  )
}
