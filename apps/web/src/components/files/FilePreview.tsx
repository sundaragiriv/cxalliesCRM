'use client'

import { Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { PdfViewer } from './PdfViewer'

export interface FilePreviewProps {
  fileId: string
  className?: string
}

/**
 * Renders an image or PDF preview given a file id. Looks up a presigned R2 URL
 * via tRPC and routes to <img> for images or <PdfViewer> for PDFs.
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
    return <PdfViewer url={url} className={className} />
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
