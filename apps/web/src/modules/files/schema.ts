import { sql } from 'drizzle-orm'
import { pgTable, text, uuid, bigint, index, check } from 'drizzle-orm/pg-core'
import { id, organizationId, standardLifecycle } from '@/db/shared'
import { fileKindEnum } from '@/db/enums'
import { users, authOauthTokens } from '@/modules/auth/schema'
import { organizations } from '@/modules/parties/schema'

/**
 * Unified file metadata. Per ADR-0004 — R2 for system files, Drive for linked references.
 * Exactly one of (r2_key, drive_file_id) is non-null per row, enforced by CHECK.
 */
export const files = pgTable(
  'files',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    kind: fileKindEnum('kind').notNull(),
    r2Key: text('r2_key'),
    r2Bucket: text('r2_bucket'),
    driveFileId: text('drive_file_id'),
    driveAccountId: uuid('drive_account_id').references(() => authOauthTokens.id),
    driveWebViewLink: text('drive_web_view_link'),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    checksumSha256: text('checksum_sha256'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id),
    ...standardLifecycle,
  },
  (t) => ({
    orgCreatedIdx: index('files_org_created_idx').on(t.organizationId, t.createdAt),
    uploaderIdx: index('files_uploader_idx').on(t.uploadedByUserId),
    kindIdx: index('files_kind_idx').on(t.kind),
    backendCheck: check(
      'files_backend_xor',
      sql`(${t.kind} = 'r2_owned' AND ${t.r2Key} IS NOT NULL AND ${t.driveFileId} IS NULL) OR (${t.kind} = 'drive_linked' AND ${t.driveFileId} IS NOT NULL AND ${t.r2Key} IS NULL)`,
    ),
  }),
)

export type FileRecord = typeof files.$inferSelect
export type NewFileRecord = typeof files.$inferInsert
