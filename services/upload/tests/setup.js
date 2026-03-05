// Runs before any module loads — sets all required env vars
process.env.JWT_SECRET             = 'upload-test-secret';
process.env.JWT_ACCESS_EXPIRES_IN  = '15m';
process.env.CHUNK_SIZE_MB          = '4';
process.env.SIGNED_URL_EXPIRY_SECONDS = '900';
process.env.DATABASE_URL           = 'postgresql://fake:fake@localhost:5432/fake';
process.env.REDIS_HOST             = 'localhost';
process.env.REDIS_PORT             = '6379';
process.env.MINIO_ENDPOINT         = 'localhost';
process.env.MINIO_PORT             = '9000';
process.env.MINIO_ACCESS_KEY       = 'minioadmin';
process.env.MINIO_SECRET_KEY       = 'minioadmin';
process.env.MINIO_BUCKET           = 'driftbox';
process.env.RABBITMQ_URL           = 'amqp://localhost';
process.env.PORT                   = '3098';