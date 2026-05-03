import { randomUUID } from 'node:crypto'
import { files } from '@/modules/files/schema'
import { uploadToR2 } from '@/modules/files/lib/r2'
import type { FinanceTx } from '@/lib/audit/with-audit'
import { env } from '@/lib/env'

export type UploadBytesInput = {
  organizationId: string
  uploadedByUserId: string
  /** Pre-computed R2 key — the caller controls the path shape (e.g. versioned). */
  r2Key: string
  filename: string
  mimeType: string
  bytes: Buffer
}

export type UploadBytesResult = {
  fileId: string
  r2Key: string
  r2Bucket: string
  filename: string
  mimeType: string
  sizeBytes: number
}

/**
 * Server-side helper for uploading bytes generated *by* the system
 * (PDFs, exports, AI-generated artifacts) — distinct from the user-driven
 * `uploadFileToR2` Server Action, which accepts a Web `File` from FormData.
 *
 * Runs inside the caller's transaction so the `files` row commits atomically
 * with whatever the caller is doing. The R2 PUT itself is *not* transactional
 * (R2 has no two-phase commit), so on tx rollback the bytes orphan in R2;
 * the soft-delete sweeper picks up orphaned files in P5+.
 */
export async function uploadBytesAsFile(
  tx: FinanceTx,
  input: UploadBytesInput,
): Promise<UploadBytesResult> {
  const fileId = randomUUID()

  await uploadToR2(input.r2Key, input.bytes, input.mimeType)

  const [row] = await tx
    .insert(files)
    .values({
      id: fileId,
      organizationId: input.organizationId,
      kind: 'r2_owned',
      r2Key: input.r2Key,
      r2Bucket: env.R2_BUCKET,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      uploadedByUserId: input.uploadedByUserId,
    })
    .returning({
      id: files.id,
      r2Key: files.r2Key,
      r2Bucket: files.r2Bucket,
      filename: files.filename,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
    })

  if (!row) throw new Error('Failed to record uploaded bytes')

  return {
    fileId: row.id,
    r2Key: row.r2Key ?? input.r2Key,
    r2Bucket: row.r2Bucket ?? env.R2_BUCKET,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
  }
}
