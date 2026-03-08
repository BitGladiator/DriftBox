'use strict';



jest.mock('./shared/db', () => ({
  query:       jest.fn(),
  getClient:   jest.fn(),
  healthCheck: jest.fn(),
  pool:        { on: jest.fn() },
}));
jest.mock('./shared/db/redis', () => ({
  get:   jest.fn(),
  setex: jest.fn(),
  del:   jest.fn(),
  keys:  jest.fn().mockResolvedValue([]),
}));
jest.mock('prom-client', () => ({
  collectDefaultMetrics: jest.fn(),
  register: { contentType: 'text/plain', metrics: jest.fn().mockResolvedValue('') },
  Counter:   jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
  Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn() })),
  Gauge:     jest.fn().mockImplementation(() => ({ set: jest.fn() })),
}));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../../index');
const db      = require('./shared/db');
const redis   = require('./shared/db/redis');

const SECRET    = 'metadata-test-secret';
const makeToken = (userId = 'user-123', email = 'test@test.com') =>
  jwt.sign({ userId, email }, SECRET, { expiresIn: '15m' });

const makeFileRow = (overrides = {}) => ({
  file_id:     'file-001',
  user_id:     'user-123',
  name:        'document.pdf',
  folder_path: '/',
  size:        1024,
  mime_type:   'application/pdf',
  is_deleted:  false,
  created_at:  new Date().toISOString(),
  updated_at:  new Date().toISOString(),
  ...overrides,
});

let server;
beforeAll((done) => { server = app.listen(0, done); });
afterAll((done)  => { server.close(done); });
beforeEach(() => jest.clearAllMocks());


describe('GET /health', () => {

  test('200 — ok when DB reachable', async () => {
    db.healthCheck.mockResolvedValueOnce(true);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('metadata');
  });

  test('503 — error when DB down', async () => {
    db.healthCheck.mockRejectedValueOnce(new Error('down'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
  });
});


describe('Auth guard', () => {
  const routes = [
    { method: 'get',    path: '/files' },
    { method: 'get',    path: '/files/search?q=test' },
    { method: 'get',    path: '/files/file-001' },
    { method: 'delete', path: '/files/file-001' },
    { method: 'get',    path: '/files/file-001/versions' },
    { method: 'post',   path: '/files/file-001/restore/v1' },
  ];

  routes.forEach(({ method, path }) => {
    test(`401 — ${method.toUpperCase()} ${path} with no token`, async () => {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    });
  });
});


describe('GET /files', () => {
  const token = makeToken();

  test('200 — returns files list from DB on cache miss', async () => {
    redis.get.mockResolvedValueOnce(null);
    redis.setex.mockResolvedValue('OK');
    db.query
      .mockResolvedValueOnce({ rows: [makeFileRow()] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res = await request(app)
      .get('/files')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.files).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
  });

  test('200 — returns cached response without hitting DB', async () => {
    const cached = { files: [makeFileRow()], total: 1, page: 1, limit: 20, folderPath: '/' };
    redis.get.mockResolvedValueOnce(JSON.stringify(cached));

    const res = await request(app)
      .get('/files')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('respects page and limit query params', async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const res = await request(app)
      .get('/files?page=2&limit=5')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(5);
  });
});

describe('GET /files/search', () => {
  const token = makeToken();

  test('400 — missing q param', async () => {
    const res = await request(app)
      .get('/files/search')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Search query is required/);
  });

  test('200 — returns matching files', async () => {
    db.query.mockResolvedValueOnce({ rows: [makeFileRow({ name: 'invoice.pdf' })] });

    const res = await request(app)
      .get('/files/search?q=invoice')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.query).toBe('invoice');
    expect(res.body.results).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  test('200 — empty results for no match', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/files/search?q=zzznomatch')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });
});


describe('GET /files/:id', () => {
  const token = makeToken();

  test('404 — file not found', async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/files/missing-file')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(404);
  });

  test('403 — file belongs to different user', async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: [makeFileRow({ user_id: 'other-user' })] });

    const res = await request(app)
      .get('/files/file-001')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(403);
  });

  test('200 — returns file metadata', async () => {
    redis.get.mockResolvedValueOnce(null);
    redis.setex.mockResolvedValue('OK');
    db.query.mockResolvedValueOnce({ rows: [makeFileRow()] });

    const res = await request(app)
      .get('/files/file-001')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.file_id).toBe('file-001');
    expect(res.body.name).toBe('document.pdf');
  });

  test('200 — serves from cache without DB call', async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify(makeFileRow({ user_id: 'user-123' })));

    const res = await request(app)
      .get('/files/file-001')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(db.query).not.toHaveBeenCalled();
  });
});


describe('DELETE /files/:id', () => {
  const token = makeToken();

  test('404 — file not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete('/files/missing-file')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(404);
  });

  test('200 — soft deletes file and clears cache', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001', size: 2048 }] })
      .mockResolvedValueOnce({ rows: [] });
    redis.del.mockResolvedValue(1);

    const res = await request(app)
      .delete('/files/file-001')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('File deleted');
    expect(res.body.fileId).toBe('file-001');
  });
});


describe('GET /files/:id/versions', () => {
  const token = makeToken();

  test('404 — file not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/files/bad-file/versions')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(404);
  });

  test('200 — returns version list', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001' }] })
      .mockResolvedValueOnce({ rows: [
        { version_id: 'v2', version_num: 2, size: 2000, created_at: new Date().toISOString() },
        { version_id: 'v1', version_num: 1, size: 1000, created_at: new Date().toISOString() },
      ] });

    const res = await request(app)
      .get('/files/file-001/versions')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.versions).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.fileId).toBe('file-001');
  });
});


describe('POST /files/:id/restore/:versionId', () => {
  const token = makeToken();

  test('404 — file not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/files/bad-file/restore/v1')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(404);
  });

  test('404 — version not found', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001', size: 1000 }] })
      .mockResolvedValueOnce({ rows: [] }); // version missing

    const res = await request(app)
      .post('/files/file-001/restore/bad-version')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(404);
  });

  test('200 — restores version successfully', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001', size: 2000 }] })
      .mockResolvedValueOnce({ rows: [{ version_id: 'v1', version_num: 1, chunk_ids: ['c1'], size: 1000 }] })
      .mockResolvedValueOnce({ rows: [{ max_version: 2 }] });

    const mockClient = { query: jest.fn(), release: jest.fn() };
    mockClient.query.mockResolvedValue(undefined);
    db.getClient.mockResolvedValueOnce(mockClient);
    redis.del.mockResolvedValue(1);

    const res = await request(app)
      .post('/files/file-001/restore/v1')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Version restored successfully');
    expect(res.body.newVersionNum).toBe(3);
    expect(res.body.restoredFrom).toBe('v1');
  });
});


describe('Unknown routes', () => {
  test('404 — returns not found', async () => {
    const res = await request(app).get('/completely-unknown');
    expect(res.status).toBe(404);
  });
});