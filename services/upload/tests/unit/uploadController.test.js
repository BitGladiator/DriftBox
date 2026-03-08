'use strict';


jest.mock('../shared/db', () => ({
  query:     jest.fn(),
  getClient: jest.fn(),
  pool:      { on: jest.fn() },
}));
jest.mock('../shared/db/redis', () => ({
  setex: jest.fn(),
  get:   jest.fn(),
  del:   jest.fn(),
  keys:  jest.fn().mockResolvedValue([]),
}));
jest.mock('../shared/storage', () => ({
  init:         jest.fn().mockResolvedValue(undefined),
  exists:       jest.fn(),
  uploadChunk:  jest.fn(),
  getSignedUrl: jest.fn(),
}));
jest.mock('../shared/rabbitmq', () => ({
  connect:  jest.fn().mockResolvedValue(undefined),
  publish:  jest.fn(),
  QUEUES:   { FILE_UPLOADED: 'file.uploaded' },
}));

const db      = require('../shared/db');
const redis   = require('../shared/db/redis');
const storage = require('../shared/storage');
const mq      = require('../shared/rabbitmq');

const {
  initUpload,
  uploadChunk,
  completeUpload,
  uploadStatus,
  downloadFile,
} = require('../../controllers/uploadController');


const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = jest.fn();

const makeReq = (overrides = {}) => ({
  body:    {},
  params:  {},
  user:    { userId: 'user-123', email: 'test@test.com' },
  file:    null,
  ...overrides,
});


const makeSession = (overrides = {}) => ({
  sessionId:      'sess-abc',
  userId:         'user-123',
  fileName:       'test.pdf',
  fileSize:       8 * 1024 * 1024, 
  mimeType:       'application/pdf',
  folderPath:     '/',
  totalChunks:    2,
  chunkSize:      4 * 1024 * 1024,
  uploadedChunks: [],
  createdAt:      Date.now(),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());


describe('initUpload()', () => {

  test('400 — missing fileName', async () => {
    const req = makeReq({ body: { fileSize: 1024, mimeType: 'image/png' } });
    const res = mockRes();
    await initUpload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'fileName, fileSize, and mimeType are required' });
  });

  test('400 — missing fileSize', async () => {
    const req = makeReq({ body: { fileName: 'a.png', mimeType: 'image/png' } });
    const res = mockRes();
    await initUpload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('400 — missing mimeType', async () => {
    const req = makeReq({ body: { fileName: 'a.png', fileSize: 1024 } });
    const res = mockRes();
    await initUpload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('400 — fileSize is 0 or negative', async () => {
    // Note: fileSize=0 triggers !fileSize check ("required"), so use -1 to hit the >0 branch
    const req = makeReq({ body: { fileName: 'a.png', fileSize: -1, mimeType: 'image/png' } });
    const res = mockRes();
    await initUpload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'fileSize must be greater than 0' });
  });

  test('201 — creates session in Redis and returns sessionId', async () => {
    redis.setex.mockResolvedValue('OK');
    const req = makeReq({ body: { fileName: 'big.zip', fileSize: 8 * 1024 * 1024, mimeType: 'application/zip' } });
    const res = mockRes();
    await initUpload(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.sessionId).toBeDefined();
    expect(body.totalChunks).toBe(2);        
    expect(body.chunkSize).toBe(4 * 1024 * 1024);
    expect(redis.setex).toHaveBeenCalledTimes(2); 
  });

  test('201 — single chunk for small file', async () => {
    redis.setex.mockResolvedValue('OK');
    const req = makeReq({ body: { fileName: 'small.txt', fileSize: 1024, mimeType: 'text/plain' } });
    const res = mockRes();
    await initUpload(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.totalChunks).toBe(1);
  });

  test('201 — stores userId from req.user in session', async () => {
    redis.setex.mockResolvedValue('OK');
    const req = makeReq({ body: { fileName: 'f.png', fileSize: 1024, mimeType: 'image/png' }, user: { userId: 'specific-user-id' } });
    const res = mockRes();
    await initUpload(req, res, mockNext);

    const sessionJson = redis.setex.mock.calls[0][2];
    const session = JSON.parse(sessionJson);
    expect(session.userId).toBe('specific-user-id');
  });

  test('calls next(err) on Redis error', async () => {
    redis.setex.mockRejectedValueOnce(new Error('Redis down'));
    const req = makeReq({ body: { fileName: 'f.png', fileSize: 1024, mimeType: 'image/png' } });
    const res = mockRes();
    await initUpload(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});


describe('uploadChunk()', () => {

  test('400 — missing sessionId', async () => {
    const req = makeReq({ body: { chunkIndex: 0 }, file: { buffer: Buffer.from('data') } });
    const res = mockRes();
    await uploadChunk(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'sessionId and chunkIndex are required' });
  });

  test('400 — missing chunkIndex', async () => {
    const req = makeReq({ body: { sessionId: 'sess-1' }, file: { buffer: Buffer.from('data') } });
    const res = mockRes();
    await uploadChunk(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('400 — missing file', async () => {
    const req = makeReq({ body: { sessionId: 'sess-1', chunkIndex: '0' }, file: null });
    const res = mockRes();
    await uploadChunk(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Chunk file is required' });
  });

  test('404 — session not found in Redis', async () => {
    redis.get.mockResolvedValueOnce(null);
    const req = makeReq({ body: { sessionId: 'bad-sess', chunkIndex: '0' }, file: { buffer: Buffer.from('data') } });
    const res = mockRes();
    await uploadChunk(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Upload session not found or expired' });
  });

  test('403 — session belongs to different user', async () => {
    const session = makeSession({ userId: 'other-user' });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    const req = makeReq({ body: { sessionId: 'sess-abc', chunkIndex: '0' }, file: { buffer: Buffer.from('data') } });
    const res = mockRes();
    await uploadChunk(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  test('400 — chunkIndex out of range', async () => {
    const session = makeSession({ totalChunks: 2 });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    const req = makeReq({ body: { sessionId: 'sess-abc', chunkIndex: '5' }, file: { buffer: Buffer.from('data') } });
    const res = mockRes();
    await uploadChunk(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/chunkIndex must be between/);
  });

  test('200 — uploads new chunk, stores in db and Redis', async () => {
    const session = makeSession();
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    redis.setex.mockResolvedValue('OK');
    storage.exists.mockResolvedValueOnce(false);
    storage.uploadChunk.mockResolvedValueOnce(undefined);
    db.query.mockResolvedValueOnce({ rows: [] });
    db.query.mockResolvedValueOnce({ rows: [{ chunk_id: 'chunk-001' }] });

    const req = makeReq({
      body: { sessionId: 'sess-abc', chunkIndex: '0' },
      file: { buffer: Buffer.alloc(1024, 'x') },
    });
    const res = mockRes();
    await uploadChunk(req, res, mockNext);

    expect(storage.uploadChunk).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.chunkIndex).toBe(0);
    expect(body.chunkId).toBe('chunk-001');
    expect(body.deduped).toBe(false);
  });

  test('200 — deduplication: skips upload if chunk already exists in storage', async () => {
    const session = makeSession();
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    redis.setex.mockResolvedValue('OK');
    storage.exists.mockResolvedValueOnce(true); 
    db.query.mockResolvedValueOnce({ rows: [{ chunk_id: 'existing-chunk' }] }); 

    const req = makeReq({
      body: { sessionId: 'sess-abc', chunkIndex: '0' },
      file: { buffer: Buffer.alloc(512, 'y') },
    });
    const res = mockRes();
    await uploadChunk(req, res, mockNext);

    expect(storage.uploadChunk).not.toHaveBeenCalled(); 
    const body = res.json.mock.calls[0][0];
    expect(body.deduped).toBe(true);
    expect(body.chunkId).toBe('existing-chunk');
  });

  test('calls next(err) on storage error', async () => {
    const session = makeSession();
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    storage.exists.mockRejectedValueOnce(new Error('MinIO down'));
    const req = makeReq({
      body: { sessionId: 'sess-abc', chunkIndex: '0' },
      file: { buffer: Buffer.alloc(512) },
    });
    const res = mockRes();
    await uploadChunk(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});


describe('completeUpload()', () => {

  test('400 — missing sessionId', async () => {
    const req = makeReq({ body: {} });
    const res = mockRes();
    await completeUpload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'sessionId is required' });
  });

  test('404 — session not in Redis', async () => {
    redis.get.mockResolvedValueOnce(null);
    const req = makeReq({ body: { sessionId: 'expired-sess' } });
    const res = mockRes();
    await completeUpload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('403 — session belongs to different user', async () => {
    const session = makeSession({ userId: 'other-user', uploadedChunks: ['c1', 'c2'] });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    const req = makeReq({ body: { sessionId: 'sess-abc' } });
    const res = mockRes();
    await completeUpload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('400 — not all chunks uploaded', async () => {
    
    const session = makeSession({ totalChunks: 2, uploadedChunks: ['chunk-1'] });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    const req = makeReq({ body: { sessionId: 'sess-abc' } });
    const res = mockRes();
    await completeUpload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/incomplete/);
  });

  test('201 — successful completion runs db transaction and publishes event', async () => {
    const session = makeSession({
      totalChunks: 2,
      uploadedChunks: ['chunk-1', 'chunk-2'],
    });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    redis.del.mockResolvedValue(1);

   
    const mockClient = {
      query:   jest.fn(),
      release: jest.fn(),
    };
    mockClient.query
      .mockResolvedValueOnce(undefined) 
      .mockResolvedValueOnce({ rows: [{ 
        file_id: 'file-xyz', name: 'test.pdf',
        folder_path: '/', size: 8388608,
        mime_type: 'application/pdf', created_at: new Date().toISOString(),
      }] })
      .mockResolvedValueOnce(undefined) 
      .mockResolvedValueOnce(undefined) 
      .mockResolvedValueOnce(undefined); 

    db.getClient.mockResolvedValueOnce(mockClient);

    const req = makeReq({ body: { sessionId: 'sess-abc' } });
    const res = mockRes();
    await completeUpload(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('File uploaded successfully');
    expect(body.file.fileId).toBe('file-xyz');
    expect(body.file.version).toBe(1);

 
    expect(redis.del).toHaveBeenCalledTimes(2);

  
    expect(mq.publish).toHaveBeenCalledWith(
      'file.uploaded',
      expect.objectContaining({ fileId: 'file-xyz', userId: 'user-123' })
    );
  });

  test('rolls back transaction on db error', async () => {
    const session = makeSession({ totalChunks: 1, uploadedChunks: ['chunk-1'] });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));

    const mockClient = {
      query:   jest.fn(),
      release: jest.fn(),
    };
    mockClient.query
      .mockResolvedValueOnce(undefined)         
      .mockRejectedValueOnce(new Error('DB error')); 

    db.getClient.mockResolvedValueOnce(mockClient);

    const req = makeReq({ body: { sessionId: 'sess-abc' } });
    const res = mockRes();
    await completeUpload(req, res, mockNext);

  
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');

    expect(mockClient.release).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('uploadStatus()', () => {

  test('404 — session not in Redis', async () => {
    redis.get.mockResolvedValueOnce(null);
    const req = makeReq({ params: { sessionId: 'gone-sess' } });
    const res = mockRes();
    await uploadStatus(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('403 — session belongs to different user', async () => {
    const session = makeSession({ userId: 'someone-else' });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    const req = makeReq({ params: { sessionId: 'sess-abc' } });
    const res = mockRes();
    await uploadStatus(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('200 — returns correct progress for partial upload', async () => {
    const session = makeSession({ totalChunks: 4, uploadedChunks: ['c1', 'c2', null, null] });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    const req = makeReq({ params: { sessionId: 'sess-abc' } });
    const res = mockRes();
    await uploadStatus(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.uploaded).toBe(2);
    expect(body.percent).toBe(50);
    expect(body.complete).toBe(false);
    expect(body.totalChunks).toBe(4);
  });

  test('200 — returns complete=true when all chunks uploaded', async () => {
    const session = makeSession({ totalChunks: 2, uploadedChunks: ['c1', 'c2'] });
    redis.get.mockResolvedValueOnce(JSON.stringify(session));
    const req = makeReq({ params: { sessionId: 'sess-abc' } });
    const res = mockRes();
    await uploadStatus(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.complete).toBe(true);
    expect(body.percent).toBe(100);
  });
});


describe('downloadFile()', () => {

  test('404 — file not found or not owned by user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ params: { fileId: 'file-999' } });
    const res = mockRes();
    await downloadFile(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'File not found' });
  });

  test('404 — file found but no version exists', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'f1', name: 'doc.pdf', size: 1024, mime_type: 'application/pdf' }] })
      .mockResolvedValueOnce({ rows: [] }); 

    const req = makeReq({ params: { fileId: 'f1' } });
    const res = mockRes();
    await downloadFile(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'No version found for this file' });
  });

  test('200 — returns signed URLs for each chunk', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'f1', name: 'doc.pdf', size: 8388608, mime_type: 'application/pdf' }] })
      .mockResolvedValueOnce({ rows: [{ chunk_ids: ['c1', 'c2'] }] }) 
      .mockResolvedValueOnce({ rows: [                                 
        { chunk_id: 'c1', hash: 'hash1', size: 4194304, storage_path: 'chunks/hash1' },
        { chunk_id: 'c2', hash: 'hash2', size: 4194304, storage_path: 'chunks/hash2' },
      ] });

    storage.getSignedUrl
      .mockResolvedValueOnce('https://minio/chunks/hash1?sig=abc')
      .mockResolvedValueOnce('https://minio/chunks/hash2?sig=def');

    const req = makeReq({ params: { fileId: 'f1' } });
    const res = mockRes();
    await downloadFile(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.file.name).toBe('doc.pdf');
    expect(body.chunks).toHaveLength(2);
    expect(body.chunks[0].url).toContain('hash1');
    expect(body.chunks[1].url).toContain('hash2');
    expect(body.expiresInSeconds).toBe(900);
    expect(storage.getSignedUrl).toHaveBeenCalledTimes(2);
  });

  test('calls next(err) on db error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));
    const req = makeReq({ params: { fileId: 'f1' } });
    const res = mockRes();
    await downloadFile(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});