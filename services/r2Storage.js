// Cloudflare R2 Storage Service - San Martín Digital
// S3-compatible object storage for justification documents, profile photos, etc.
// Falls back to local storage if R2 is not configured.

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
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

  const publicUrl = process.env.R2_PUBLIC_URL
    ? `${process.env.R2_PUBLIC_URL}/${uniqueName}`
    : `https://${process.env.R2_BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${uniqueName}`;

  return {
    key: uniqueName,
    url: publicUrl,
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
 * Get a file URL
 * @param {string} key - The object key
 */
const getFileUrl = (key) => {
  if (!key) return null;
  if (key.startsWith('http')) return key; // Already a full URL
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  }
  return `/uploads/${key}`;
};

module.exports = {
  uploadFile,
  uploadMulterFile,
  deleteFile,
  getFileUrl,
  isR2Configured,
};
