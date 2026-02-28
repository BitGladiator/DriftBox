const Minio = require('minio');

const client = new Minio.Client({
  endPoint:  process.env.MINIO_ENDPOINT  || 'localhost',
  port:      parseInt(process.env.MINIO_PORT, 10) || 9000,
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const BUCKET = process.env.MINIO_BUCKET || 'driftbox-chunks';


const init = async () => {
  const exists = await client.bucketExists(BUCKET);
  if (!exists) {
    await client.makeBucket(BUCKET);
    console.log(`[MinIO] Bucket "${BUCKET}" created`);
  } else {
    console.log(`[MinIO] Bucket "${BUCKET}" ready`);
  }
};


const uploadChunk = (objectName, buffer, size) =>
  client.putObject(BUCKET, objectName, buffer, size);

const getSignedUrl = (objectName, expirySeconds) =>
  client.presignedGetObject(BUCKET, objectName, expirySeconds);


const exists = async (objectName) => {
  try {
    await client.statObject(BUCKET, objectName);
    return true;
  } catch {
    return false;
  }
};


const remove = (objectName) =>
  client.removeObject(BUCKET, objectName);

module.exports = { init, uploadChunk, getSignedUrl, exists, remove, client, BUCKET };