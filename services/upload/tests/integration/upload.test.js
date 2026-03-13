'use strict';


jest.mock('./shared/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { on: jest.fn() },
}));
jest.mock('./shared/db/redis', () => ({
  setex: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  keys: jest.fn().mockResolvedValue([]),
}));
jest.mock('./shared/storage', () => ({
  init: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn(),
  uploadChunk: jest.fn(),
  getSignedUrl: jest.fn(),
}));
jest.mock('./shared/rabbitmq', () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn(),
  QUEUES: { FILE_UPLOADED: 'file.uploaded' },
}));
jest.mock('prom-client', () => ({
  collectDefaultMetrics: jest.fn(),
  register: { contentType: 'text/plain', metrics: jest.fn().mockResolvedValue('') },
  Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
  Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn() })),
  Gauge: jest.fn().mockImplementation(() => ({ set: jest.fn() })),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../index');
const db = require('./shared/db');
const redis = require('./shared/db/redis');
const storage = require('./shared/storage');
const mq = require('./shared/rabbitmq');

const SECRET = 'upload-test-secret';

const makeToken = (userId = 'user-123', email = 'test@test.com') =>
  jwt.sign({ userId, email }, SECRET, { expiresIn: '15m' });

const makeSession = (overrides = {}) => ({
  sessionId: 'sess-abc',
  userId: 'user-123',
  fileName: 'test.pdf',
  fileSize: 8 * 1024 * 1024,
  mimeType: 'application/pdf',
  folderPath: '/',
  totalChunks: 2,
  chunkSize: 4 * 1024 * 1024,
  uploadedChunks: [],
  createdAt: Date.now(),
  ...overrides,
});

let server;
beforeAll((done) => { server = app.listen(0, done); });
afterAll((done) => { server.close(done); });
beforeEach(() => jest.clearAllMocks());


describe('GET /health', () => {
  test('200 — returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('upload');
  });
});


describe('Auth guard', () => {
  test('401 — no token on POST /upload/init', async () => {
    const res = await request(app).post('/upload/init').send({});
    expect(res.status).toBe(401);
  });

  test('401 — no token on POST /upload/chunk', async () => {
    const res = await request(app).post('/upload/chunk');
    expect(res.status).toBe(401);
  });

  test('401 — no token on POST /upload/complete', async () => {
    const res = await request(app).post('/upload/complete').send({});
    expect(res.status).toBe(401);
  });

  test('401 — no token on GET /upload/download/:fileId', async () => {
    const res = await request(app).get('/upload/download/some-file-id');
    expect(res.status).toBe(401);
  });
});


describe('POST /upload/init', () => {
  const token = makeToken();

  test('400 — missing required fields', async () => {
    const res = await request(app)
      .post('/upload/init')
      .set('Authorization', 'Bearer ' + token)
      .send({ fileName: 'test.png' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  test('400 — fileSize is negative', async () => {

    const res = await request(app)
      .post('/upload/init')
      .set('Authorization', 'Bearer ' + token)
      .send({ fileName: 'test.png', fileSize: -1, mimeType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/greater than 0/);
  });

  test('201 — creates session and returns sessionId + totalChunks', async () => {
    redis.setex.mockResolvedValue('OK');

    const res = await request(app)
      .post('/upload/init')
      .set('Authorization', 'Bearer ' + token)
      .send({ fileName: 'video.mp4', fileSize: 12 * 1024 * 1024, mimeType: 'video/mp4' });

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.totalChunks).toBe(3);
    expect(res.body.chunkSize).toBe(4 * 1024 * 1024);
    expect(redis.setex).toHaveBeenCalledTimes(2);
  });

  test('201 — uses default folderPath of / when not provided', async () => {
    redis.setex.mockResolvedValue('OK');

    await request(app)
      .post('/upload/init')
      .set('Authorization', 'Bearer ' + token)
      .send({ fileName: 'doc.pdf', fileSize: 1024, mimeType: 'application/pdf' });

    const sessionStored = JSON.parse(redis.setex.mock.calls[0][2]);
    expect(sessionStored.folderPath).toBe('/');
  });
});


describe('POST /upload/chunk', () => {
  const token = makeToken();

  test('400 — missing sessionId in form', async () => {
    const res = await request(app)
      .post('/upload/chunk')
      .set('Authorization', 'Bearer ' + token)
      .attach('chunk', Buffer.from('data'), 'chunk');
    expect(res.status).toBe(400);
  });

  test('400 — missing chunk file', async () => {
    const res = await request(app)
      .post('/upload/chunk')
      .set('Authorization', 'Bearer ' + token)
      .field('sessionId', 'some-session')
      .field('chunkIndex', '0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Chunk file is required/);
  });

  test('404 — session not found', async () => {
    redis.get.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/upload/chunk')
      .set('Authorization', 'Bearer ' + token)
      .field('sessionId', 'nonexistent-session')
      .field('chunkIndex', '0')
      .attach('chunk', Buffer.alloc(1024), 'chunk');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/);
  });

  test('200 — successfully uploads a chunk', async () => {
    const session = makeSession();
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    redis.setex.mockResolvedValue('OK');
    storage.exists.mockResolvedValueOnce(false);
    storage.uploadChunk.mockResolvedValueOnce(undefined);
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ chunk_id: 'chunk-new' }] });

    const res = await request(app)
      .post('/upload/chunk')
      .set('Authorization', 'Bearer ' + token)
      .field('sessionId', 'sess-abc')
      .field('chunkIndex', '0')
      .attach('chunk', Buffer.alloc(4 * 1024 * 1024), 'chunk');

    expect(res.status).toBe(200);
    expect(res.body.chunkIndex).toBe(0);
    expect(res.body.chunkId).toBe('chunk-new');
    expect(res.body.deduped).toBe(false);
  });
});


describe('POST /upload/complete', () => {
  const token = makeToken();

  test('400 — missing sessionId', async () => {
    const res = await request(app)
      .post('/upload/complete')
      .set('Authorization', 'Bearer ' + token)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sessionId is required/);
  });

  test('404 — session not in Redis', async () => {
    redis.get.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/upload/complete')
      .set('Authorization', 'Bearer ' + token)
      .send({ sessionId: 'ghost-session' });
    expect(res.status).toBe(404);
  });

  test('400 — incomplete upload (not all chunks received)', async () => {
    const session = makeSession({ totalChunks: 3, uploadedChunks: ['c1', 'c2'] });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));

    const res = await request(app)
      .post('/upload/complete')
      .set('Authorization', 'Bearer ' + token)
      .send({ sessionId: 'sess-abc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/incomplete/);
  });

  test('201 — completes upload, inserts file, publishes event', async () => {
    const session = makeSession({ totalChunks: 2, uploadedChunks: ['c1', 'c2'] });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    redis.del.mockResolvedValue(1);

    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{
          file_id: 'new-file-id', name: 'test.pdf',
          folder_path: '/', size: 8388608,
          mime_type: 'application/pdf', created_at: new Date().toISOString(),
        }]
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    db.getClient.mockResolvedValueOnce(mockClient);

    const res = await request(app)
      .post('/upload/complete')
      .set('Authorization', 'Bearer ' + token)
      .send({ sessionId: 'sess-abc' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('File uploaded successfully');
    expect(res.body.file.fileId).toBe('new-file-id');
    expect(mq.publish).toHaveBeenCalledWith('file.uploaded', expect.objectContaining({ fileId: 'new-file-id' }));
  });
});


describe('GET /upload/status/:sessionId', () => {
  const token = makeToken();

  test('404 — session not found', async () => {
    redis.get.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/upload/status/missing-sess')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(404);
  });

  test('200 — returns upload progress', async () => {
    const session = makeSession({ totalChunks: 4, uploadedChunks: ['c1', 'c2', null, null] });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));

    const res = await request(app)
      .get('/upload/status/sess-abc')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.uploaded).toBe(2);
    expect(res.body.percent).toBe(50);
    expect(res.body.complete).toBe(false);
  });
});


describe('GET /upload/download/:fileId', () => {
  const token = makeToken();

  test('404 — file not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/upload/download/bad-file-id')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(404);
  });

  test('200 — returns signed chunk URLs', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'f1', name: 'photo.jpg', size: 2048, mime_type: 'image/jpeg' }] })
      .mockResolvedValueOnce({ rows: [{ chunk_ids: ['c1'] }] })
      .mockResolvedValueOnce({ rows: [{ chunk_id: 'c1', hash: 'abc', size: 2048, storage_path: 'chunks/abc' }] });

    storage.getSignedUrl.mockResolvedValueOnce('https://minio/chunks/abc?signed=1');

    const res = await request(app)
      .get('/upload/download/f1')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.file.name).toBe('photo.jpg');
    expect(res.body.chunks).toHaveLength(1);
    expect(res.body.chunks[0].url).toContain('/upload/chunk/c1');
  });
});


describe('Unknown routes', () => {
  test('404 — returns not found for non-upload routes', async () => {
    const res = await request(app).get('/nonexistent-path');
    expect(res.status).toBe(404);
  });
});