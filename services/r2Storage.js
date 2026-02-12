// Cloudflare R2 Storage Service - San Martín Digital
// S3-compatible object storage for justification documents, profile photos, etc.
// Falls back to local storage if R2 is not configured.

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const crypto = require('crypto');

const isR2Configured = () => {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
};

let s3Client = null;

const getS3Client = () => {
  if (!s3Client && isR2Configured()) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
};

/**
 * Upload a file buffer to R2
 * @param {Buffer} buffer - File content
 * @param {string} originalName - Original filename
 * @param {string} mimetype - MIME type
 * @param {string} folder - Folder path in bucket (e.g., 'justifications')
 * @returns {Object} { key, url, filename, size }
 */
const uploadFile = async (buffer, originalName, mimetype, folder = 'uploads') => {
  const ext = path.extname(originalName);
  const uniqueName = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

  const client = getS3Client();
  if (!client) {
    // Fallback: return a local placeholder (files are already saved by multer)
    return {
      key: uniqueName,
      url: `/uploads/${folder}/${originalName}`,
      filename: originalName,
      size: buffer.length,
      storage: 'local',
    };
  }

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: uniqueName,
    Body: buffer,
    ContentType: mimetype,
  });

  await client.send(command);

  // Don't store the S3 API endpoint as URL — it requires auth.
  // Instead, store the key and generate presigned URLs on demand.
  // Only use R2_PUBLIC_URL if a custom domain/R2.dev is configured.
  return {
    key: uniqueName,
    url: null, // Always use proxy endpoint, never direct R2 URLs
    filename: originalName,
    size: buffer.length,
    storage: 'r2',
  };
};

/**
 * Upload from multer file object
 * @param {Object} file - Multer file object (has buffer if using memoryStorage, or path if diskStorage)
 * @param {string} folder - Folder in bucket
 */
const uploadMulterFile = async (file, folder = 'uploads') => {
  const fs = require('fs');
  let buffer;

  if (file.buffer) {
    buffer = file.buffer;
  } else if (file.path) {
    buffer = fs.readFileSync(file.path);
    // Clean up local file after upload to R2
    if (isR2Configured()) {
      try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
    }
  } else {
    throw new Error('File has no buffer or path');
  }

  return uploadFile(buffer, file.originalname, file.mimetype, folder);
};

/**
 * Delete a file from R2
 * @param {string} key - The object key
 */
const deleteFile = async (key) => {
  const client = getS3Client();
  if (!client) return;

  const command = new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });

  await client.send(command);
};

/**
 * Get a file URL — generates presigned URL for R2, or local path
 * @param {string} key - The object key
 * @returns {string|null}
 */
const getFileUrl = (key) => {
  if (!key) return null;
  // If it's a direct R2/S3 URL, extract the key and route through proxy
  if (key.startsWith('http')) {
    const r2Match = key.match(/r2\.cloudflarestorage\.com\/(.+)/);
    if (r2Match) {
      key = decodeURIComponent(r2Match[1]);
    } else {
      return key; // Non-R2 URL, return as-is
    }
  }
  // Always use proxy endpoint for R2 files (direct R2 URLs require auth)
  if (isR2Configured() && !key.startsWith('/')) {
    return `/api/uploads/r2/${key}`;
  }
  return `/uploads/${key}`;
};

/**
 * Generate a presigned URL for a file in R2
 * @param {string} key - The object key
 * @param {number} expiresIn - URL expiry in seconds (default 1 hour)
 * @returns {string|null}
 */
const getPresignedUrl = async (key, expiresIn = 3600) => {
  const client = getS3Client();
  if (!client || !key) return null;

  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
};

/**
 * Stream a file from R2
 * @param {string} key - The object key
 * @returns {{ stream, contentType, contentLength }}
 */
const getFileStream = async (key) => {
  const client = getS3Client();
  if (!client || !key) return null;

  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });

  const response = await client.send(command);
  return {
    stream: response.Body,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
  };
};

module.exports = {
  uploadFile,
  uploadMulterFile,
  deleteFile,
  getFileUrl,
  getPresignedUrl,
  getFileStream,
  isR2Configured,
};
