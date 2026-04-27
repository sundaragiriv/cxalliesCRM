import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router } from '@/lib/trpc/server'
import { procedureWithAuth } from '@/lib/trpc/middleware'
import { db } from '@/db/client'
import { files } from '@/modules/files/schema'
import { presignedDownloadUrl } from '@/modules/files/lib/r2'

export const filesRouter = router({
  getDownloadUrl: procedureWithAuth({ module: 'files', action: 'read' })
    .input(z.object({ fileId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const orgId = (ctx.user as { organizationId?: string }).organizationId
      if (!orgId) throw new TRPCError({ code: 'UNAUTHORIZED' })

      const [row] = await db
        .select({
          id: files.id,
          kind: files.kind,
          r2Key: files.r2Key,
          driveWebViewLink: files.driveWebViewLink,
          mimeType: files.mimeType,
          filename: files.filename,
        })
        .from(files)
        .where(
          and(
            eq(files.id, input.fileId),
            eq(files.organizationId, orgId),
            isNull(files.deletedAt),
          ),
        )
        .limit(1)

      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      if (row.kind === 'drive_linked') {
        if (!row.driveWebViewLink) throw new TRPCError({ code: 'NOT_FOUND' })
        return { url: row.driveWebViewLink, mimeType: row.mimeType, filename: row.filename }
      }

      if (!row.r2Key) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'R2 file missing key' })
      }

      const url = await presignedDownloadUrl(row.r2Key)
      return { url, mimeType: row.mimeType, filename: row.filename }
    }),
})
