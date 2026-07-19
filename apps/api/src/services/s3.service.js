import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const publicUrl = process.env.R2_PUBLIC_URL;

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
  console.error('CRITICAL: Missing Cloudflare R2 environment variables. File upload will fail.');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing Cloudflare R2 environment variables');
  }
}
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 5000,
    requestTimeout: 10000,
  }),
});

/**
 * Uploads a file buffer to Cloudflare R2
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - File MIME type
 * @param {string} s3Key - S3 Object Key (Path)
 * @returns {Promise<string>} Public URL of the uploaded file
 */
export const uploadFile = async (buffer, mimeType, s3Key) => {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    Body: buffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  return `${process.env.R2_PUBLIC_URL}/${s3Key}`;
};

/**
 * Deletes multiple files from Cloudflare R2 (used for cleanup/rollback)
 * @param {string[]} s3Keys - Array of S3 Object Keys
 * @returns {Promise<void>}
 */
export const deleteFiles = async (s3Keys) => {
  if (!s3Keys || s3Keys.length === 0) return;

  const command = new DeleteObjectsCommand({
    Bucket: bucketName,
    Delete: {
      Objects: s3Keys.map((key) => ({ Key: key })),
      Quiet: true,
    },
  });

  await s3Client.send(command);
};
