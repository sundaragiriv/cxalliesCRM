'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadFileToR2 } from '@/modules/files/actions/upload-to-r2'

export interface FilePickerProps {
  module: string
  entity: string
  /** Called when a file is uploaded successfully. Receives the new file id. */
  onUploaded: (fileId: string, meta: { filename: string; mimeType: string }) => void
  /** Called when the user clears the picker (file id should be set to null). */
  onCleared?: () => void
  /** When the form already has a file attached, render its filename. */
  attached?: { filename: string; mimeType: string } | null
  /** Trigger the camera input by default on mobile. Defaults to true on phones. */
  preferCamera?: boolean
  className?: string
}

export function FilePicker({
  module,
  entity,
  onUploaded,
  onCleared,
  attached,
  preferCamera = true,
  className,
}: FilePickerProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('module', module)
      fd.append('entity', entity)
      const result = await uploadFileToR2(fd)
      if (!result.success) {
        setError(result.error)
        return
      }
      onUploaded(result.data.fileId, {
        filename: result.data.filename,
        mimeType: result.data.mimeType,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={className}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = ''
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = ''
        }}
      />

      {attached ? (
        <div className="flex items-center gap-2 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 truncate">{attached.filename}</span>
          {onCleared && (
            <button
              type="button"
              onClick={onCleared}
              aria-label="Remove file"
              className="rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          {preferCamera && (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Camera className="mr-2 h-5 w-5" />
              )}
              Photo
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Paperclip className="mr-2 h-5 w-5" />
            Upload
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
