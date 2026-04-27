'use server'

import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/db/client'
import { files } from '@/modules/files/schema'
import { buildR2Key, uploadToR2 as uploadBytesToR2 } from '@/modules/files/lib/r2'
import { requirePermission } from '@/lib/auth/require-permission'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
])

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

const moduleSchema = z.string().regex(/^[a-z][a-z0-9-]*$/)
const entitySchema = z.string().regex(/^[a-z][a-z0-9-]*$/)

export type UploadResult =
  | { success: true; data: { fileId: string; filename: string; mimeType: string; sizeBytes: number } }
  | { success: false; error: string }

/**
 * Server Action that accepts FormData with `file` (Blob), `module` (string),
 * `entity` (string). Uploads bytes to R2 and creates a `files` row. Returns
 * the file id which the caller links to its entity (e.g.,
 * `expense_entries.receipt_file_id`).
 *
 * Permission: `files.write`. The caller's existing module permission gates
 * the entity-level write (e.g., `finance.write` on expense create).
 */
export async function uploadFileToR2(formData: FormData): Promise<UploadResult> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return { success: false, error: 'Not signed in' }
  }
  const orgId = (session.user as { organizationId?: string }).organizationId
  if (!orgId) {
    return { success: false, error: 'Missing organization context' }
  }

  const allowed = await requirePermission(session.user.id, 'files', 'write')
  if (!allowed) {
    return { success: false, error: 'Missing permission: files.write' }
  }

  const fileEntry = formData.get('file')
  const moduleEntry = formData.get('module')
  const entityEntry = formData.get('entity')

  if (!(fileEntry instanceof File)) {
    return { success: false, error: 'Missing file' }
  }
  const moduleParse = moduleSchema.safeParse(moduleEntry)
  const entityParse = entitySchema.safeParse(entityEntry)
  if (!moduleParse.success || !entityParse.success) {
    return { success: false, error: 'Invalid module or entity' }
  }

  if (fileEntry.size === 0) {
    return { success: false, error: 'Empty file' }
  }
  if (fileEntry.size > MAX_BYTES) {
    return { success: false, error: `File exceeds ${MAX_BYTES / 1024 / 1024} MB limit` }
  }
  if (!ALLOWED_MIME.has(fileEntry.type)) {
    return { success: false, error: `Unsupported file type: ${fileEntry.type}` }
  }

  const fileId = randomUUID()
  const r2Key = buildR2Key({
    organizationId: orgId,
    module: moduleParse.data,
    entity: entityParse.data,
    fileId,
    filename: fileEntry.name,
  })

  const bytes = Buffer.from(await fileEntry.arrayBuffer())

  await uploadBytesToR2(r2Key, bytes, fileEntry.type)

  const [row] = await db
    .insert(files)
    .values({
      id: fileId,
      organizationId: orgId,
      kind: 'r2_owned',
      r2Key,
      r2Bucket: process.env.R2_BUCKET ?? 'cxallies-dev',
      filename: fileEntry.name,
      mimeType: fileEntry.type,
      sizeBytes: fileEntry.size,
      uploadedByUserId: session.user.id,
    })
    .returning({
      id: files.id,
      filename: files.filename,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
    })

  if (!row) {
    return { success: false, error: 'Failed to record uploaded file' }
  }

  return {
    success: true,
    data: {
      fileId: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    },
  }
}
