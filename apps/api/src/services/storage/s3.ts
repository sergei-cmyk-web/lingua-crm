import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

// Универсальный S3-совместимый клиент (Yandex Object Storage / R2 / MinIO / AWS) —
// не завязан на конкретного провайдера, конфиг целиком из env.
function getClient(): S3Client | null {
  const { S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env
  if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null

  return new S3Client({
    endpoint: S3_ENDPOINT || undefined,
    region: S3_REGION || 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  })
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET
  if (!bucket) throw new Error('S3_BUCKET не задан — хранилище вложений не настроено')
  return bucket
}

export function isStorageConfigured(): boolean {
  return Boolean(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_BUCKET)
}

export async function uploadObject(buffer: Buffer, mimeType: string, filenameHint?: string): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('S3-хранилище не настроено (S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_BUCKET)')

  const key = `email-attachments/${randomUUID()}${filenameHint ? '-' + filenameHint.replace(/[^\w.\-]+/g, '_') : ''}`
  await client.send(
    new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: buffer, ContentType: mimeType })
  )
  return key
}

export async function getSignedDownloadUrl(storageKey: string, expiresSec = 300): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('S3-хранилище не настроено')

  const command = new GetObjectCommand({ Bucket: getBucket(), Key: storageKey })
  return getSignedUrl(client, command, { expiresIn: expiresSec })
}
