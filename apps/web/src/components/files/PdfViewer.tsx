'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'

// react-pdf needs a worker. We point at the unpkg CDN matching the bundled
// pdfjs-dist version. P1-26 will switch to a self-hosted worker for production.
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export interface PdfViewerProps {
  url: string
  width?: number
  className?: string
}

function PdfViewerInner({ url, width = 600, className }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [containerWidth, setContainerWidth] = useState(width)

  useEffect(() => {
    function update() {
      if (typeof window === 'undefined') return
      // Cap at viewport - 32px gutter on small screens.
      setContainerWidth(Math.min(width, window.innerWidth - 32))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [width])

  return (
    <div className={className}>
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i}
            pageNumber={i + 1}
            width={containerWidth}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            className="mb-2 rounded border border-border bg-white shadow-sm"
          />
        ))}
      </Document>
    </div>
  )
}

// Dynamic import disables SSR — pdfjs's worker is browser-only.
export const PdfViewer = dynamic(() => Promise.resolve(PdfViewerInner), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
})
