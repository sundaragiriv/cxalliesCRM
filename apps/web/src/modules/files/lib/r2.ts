import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/lib/env'

let _client: S3Client | null = null

function getClient(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    endpoint: env.R2_ENDPOINT,
    region: env.R2_REGION,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    // forcePathStyle is required for MinIO and harmless for Cloudflare R2.
    forcePathStyle: true,
  })
  return _client
}

/**
 * R2 key pattern per ADR-0004 §4.3.
 * Example: `<org-id>/finance/expense-receipts/<file-id>/<filename>`.
 */
export function buildR2Key(parts: {
  organizationId: string
  module: string
  entity: string
  fileId: string
  filename: string
}): string {
  const safeFilename = parts.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${parts.organizationId}/${parts.module}/${parts.entity}/${parts.fileId}/${safeFilename}`
}

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const client = getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function presignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const client = getClient()
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  )
}
