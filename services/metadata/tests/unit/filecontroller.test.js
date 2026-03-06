'use strict';

jest.mock('../shared/db', () => ({
  query:     jest.fn(),
  getClient: jest.fn(),
  pool:      { on: jest.fn() },
}));
jest.mock('../shared/db/redis', () => ({
  get:   jest.fn(),
  setex: jest.fn(),
  del:   jest.fn(),
}));

const db    = require('../shared/db');
const redis = require('../shared/db/redis');
const {
  listFiles,
  getFile,
  deleteFile,
  listVersions,
  restoreVersion,
  searchFiles,
} = require('../../controllers/filesController');

// ── Helpers ───────────────────────────────────────────────────
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = jest.fn();

const makeReq = (overrides = {}) => ({
  body:   {},
  params: {},
  query:  {},
  user:   { userId: 'user-123', email: 'test@test.com' },
  ...overrides,
});

// Reusable file row shape
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

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════
// listFiles
// ═══════════════════════════════════════════════════════════════
describe('listFiles()', () => {

  test('returns cached response if Redis hit', async () => {
    const cached = { files: [makeFileRow()], total: 1, page: 1, limit: 20, folderPath: '/' };
    redis.get.mockResolvedValueOnce(JSON.stringify(cached));

    const req = makeReq({ query: { folderPath: '/', page: '1', limit: '20' } });
    const res = mockRes();
    await listFiles(req, res, mockNext);

    expect(db.query).not.toHaveBeenCalled(); // DB never touched
    expect(res.json).toHaveBeenCalledWith(cached);
  });

  test('queries DB on cache miss and caches the result', async () => {
    redis.get.mockResolvedValueOnce(null); // cache miss
    redis.setex.mockResolvedValue('OK');

    const fileRow = makeFileRow();
    db.query
      .mockResolvedValueOnce({ rows: [fileRow] })          // SELECT files
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });  // COUNT

    const req = makeReq({ query: {} });
    const res = mockRes();
    await listFiles(req, res, mockNext);

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(redis.setex).toHaveBeenCalledTimes(1); // result cached
    const body = res.json.mock.calls[0][0];
    expect(body.files).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  test('defaults to page=1, limit=20, folderPath=/', async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const req = makeReq({ query: {} }); // no query params
    const res = mockRes();
    await listFiles(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.folderPath).toBe('/');
  });

  test('caps limit at 100 regardless of query param', async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const req = makeReq({ query: { limit: '9999' } });
    const res = mockRes();
    await listFiles(req, res, mockNext);

    // 3rd arg to SELECT query is the LIMIT value
    const limitArg = db.query.mock.calls[0][1][2];
    expect(limitArg).toBe(100);
  });

  test('calculates correct OFFSET for page 3 with limit 10', async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const req = makeReq({ query: { page: '3', limit: '10' } });
    const res = mockRes();
    await listFiles(req, res, mockNext);

    // OFFSET = (page - 1) * limit = (3-1) * 10 = 20
    const offsetArg = db.query.mock.calls[0][1][3];
    expect(offsetArg).toBe(20);
  });

  test('returns empty files array when folder is empty', async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const req = makeReq({ query: { folderPath: '/empty-folder' } });
    const res = mockRes();
    await listFiles(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.files).toEqual([]);
    expect(body.total).toBe(0);
  });

  test('cache key includes userId, folderPath, page, limit', async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const req = makeReq({ query: { folderPath: '/docs', page: '2', limit: '10' }, user: { userId: 'user-xyz' } });
    const res = mockRes();
    await listFiles(req, res, mockNext);

    const cacheKey = redis.get.mock.calls[0][0];
    expect(cacheKey).toContain('user-xyz');
    expect(cacheKey).toContain('/docs');
    expect(cacheKey).toContain('2');
    expect(cacheKey).toContain('10');
  });

  test('calls next(err) on DB error', async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query.mockRejectedValueOnce(new Error('DB down'));

    const req = makeReq({ query: {} });
    const res = mockRes();
    await listFiles(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ═══════════════════════════════════════════════════════════════
// getFile
// ═══════════════════════════════════════════════════════════════
describe('getFile()', () => {

  test('returns cached file if Redis hit and userId matches', async () => {
    const file = makeFileRow({ user_id: 'user-123' });
    redis.get.mockResolvedValueOnce(JSON.stringify(file));

    const req = makeReq({ params: { id: 'file-001' } });
    const res = mockRes();
    await getFile(req, res, mockNext);

    expect(db.query).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(file);
  });

  test('403 from cache if cached file belongs to different user', async () => {
    const file = makeFileRow({ user_id: 'other-user' });
    redis.get.mockResolvedValueOnce(JSON.stringify(file));

    const req = makeReq({ params: { id: 'file-001' } }); // req.user.userId = 'user-123'
    const res = mockRes();
    await getFile(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.query).not.toHaveBeenCalled(); // stops before hitting DB
  });

  test('404 when file not in cache and not in DB', async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ params: { id: 'missing-file' } });
    const res = mockRes();
    await getFile(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'File not found' });
  });

  test('403 when file in DB belongs to different user', async () => {
    redis.get.mockResolvedValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: [makeFileRow({ user_id: 'other-user' })] });

    const req = makeReq({ params: { id: 'file-001' } });
    const res = mockRes();
    await getFile(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('200 — returns file and caches it on DB hit', async () => {
    redis.get.mockResolvedValueOnce(null);
    redis.setex.mockResolvedValue('OK');
    const file = makeFileRow({ user_id: 'user-123' });
    db.query.mockResolvedValueOnce({ rows: [file] });

    const req = makeReq({ params: { id: 'file-001' } });
    const res = mockRes();
    await getFile(req, res, mockNext);

    expect(redis.setex).toHaveBeenCalledWith('file:file-001', 60, JSON.stringify(file));
    expect(res.json).toHaveBeenCalledWith(file);
  });

  test('calls next(err) on Redis error', async () => {
    redis.get.mockRejectedValueOnce(new Error('Redis down'));

    const req = makeReq({ params: { id: 'file-001' } });
    const res = mockRes();
    await getFile(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ═══════════════════════════════════════════════════════════════
// deleteFile
// ═══════════════════════════════════════════════════════════════
describe('deleteFile()', () => {

  test('404 — file not found or already deleted', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // UPDATE returned nothing

    const req = makeReq({ params: { id: 'file-gone' } });
    const res = mockRes();
    await deleteFile(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'File not found or already deleted' });
  });

  test('200 — soft deletes file, decrements storage, clears cache', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001', size: 2048 }] }) // UPDATE files
      .mockResolvedValueOnce({ rows: [] }); // UPDATE users storage_used
    redis.del.mockResolvedValue(1);

    const req = makeReq({ params: { id: 'file-001' } });
    const res = mockRes();
    await deleteFile(req, res, mockNext);

    expect(res.json).toHaveBeenCalledWith({ message: 'File deleted', fileId: 'file-001' });
    expect(redis.del).toHaveBeenCalledWith('file:file-001');
  });

  test('decrements storage_used by the correct file size', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001', size: 5000 }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ params: { id: 'file-001' }, user: { userId: 'user-123' } });
    const res = mockRes();
    await deleteFile(req, res, mockNext);

    const [, params] = db.query.mock.calls[1]; // second query = UPDATE users
    expect(params[0]).toBe(5000); // decrements by file size
    expect(params[1]).toBe('user-123');
  });

  test('UPDATE query uses both fileId and userId — cannot delete others files', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ file_id: 'file-001', size: 100 }] })
             .mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ params: { id: 'file-001' }, user: { userId: 'user-123' } });
    const res = mockRes();
    await deleteFile(req, res, mockNext);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('user_id = $2');
    expect(params).toContain('user-123');
    expect(params).toContain('file-001');
  });

  test('calls next(err) on DB error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));
    const req = makeReq({ params: { id: 'file-001' } });
    const res = mockRes();
    await deleteFile(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ═══════════════════════════════════════════════════════════════
// listVersions
// ═══════════════════════════════════════════════════════════════
describe('listVersions()', () => {

  test('404 — file not found or not owned by user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // ownership check

    const req = makeReq({ params: { id: 'bad-file' } });
    const res = mockRes();
    await listVersions(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'File not found' });
  });

  test('200 — returns all versions ordered by version_num DESC', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001' }] }) // ownership check
      .mockResolvedValueOnce({ rows: [
        { version_id: 'v3', version_num: 3, size: 3000, created_at: new Date().toISOString() },
        { version_id: 'v2', version_num: 2, size: 2000, created_at: new Date().toISOString() },
        { version_id: 'v1', version_num: 1, size: 1000, created_at: new Date().toISOString() },
      ] });

    const req = makeReq({ params: { id: 'file-001' } });
    const res = mockRes();
    await listVersions(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.fileId).toBe('file-001');
    expect(body.versions).toHaveLength(3);
    expect(body.total).toBe(3);
    expect(body.versions[0].version_num).toBe(3); // newest first
  });

  test('200 — returns empty versions array for new file', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ params: { id: 'file-001' } });
    const res = mockRes();
    await listVersions(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.versions).toEqual([]);
    expect(body.total).toBe(0);
  });

  test('calls next(err) on DB error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));
    const req = makeReq({ params: { id: 'file-001' } });
    const res = mockRes();
    await listVersions(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ═══════════════════════════════════════════════════════════════
// restoreVersion
// ═══════════════════════════════════════════════════════════════
describe('restoreVersion()', () => {

  const makeClient = (queryResults = []) => {
    const client = { query: jest.fn(), release: jest.fn() };
    queryResults.forEach(result => client.query.mockResolvedValueOnce(result));
    return client;
  };

  test('404 — file not found or not owned by user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // file ownership check

    const req = makeReq({ params: { id: 'bad-file', versionId: 'v1' } });
    const res = mockRes();
    await restoreVersion(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'File not found' });
  });

  test('404 — version not found for this file', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001', size: 1000 }] }) // file found
      .mockResolvedValueOnce({ rows: [] }); // version not found

    const req = makeReq({ params: { id: 'file-001', versionId: 'bad-version' } });
    const res = mockRes();
    await restoreVersion(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Version not found' });
  });

  test('200 — restores version, creates new version entry, updates file size', async () => {
    const versionToRestore = { version_id: 'v1', version_num: 1, chunk_ids: ['c1', 'c2'], size: 999 };

    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001', size: 2000 }] })    // file check
      .mockResolvedValueOnce({ rows: [versionToRestore] })                        // version check
      .mockResolvedValueOnce({ rows: [{ max_version: 3 }] });                     // MAX(version_num)

    const mockClient = makeClient([
      undefined,   // BEGIN
      undefined,   // INSERT new version
      undefined,   // UPDATE files size
      undefined,   // COMMIT
    ]);
    db.getClient.mockResolvedValueOnce(mockClient);
    redis.del.mockResolvedValue(1);

    const req = makeReq({ params: { id: 'file-001', versionId: 'v1' } });
    const res = mockRes();
    await restoreVersion(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Version restored successfully');
    expect(body.fileId).toBe('file-001');
    expect(body.restoredFrom).toBe('v1');
    expect(body.newVersionNum).toBe(4); // max was 3, new is 4
  });

  test('new version num = max_version + 1', async () => {
    const version = { version_id: 'v2', version_num: 2, chunk_ids: ['c1'], size: 500 };
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001', size: 500 }] })
      .mockResolvedValueOnce({ rows: [version] })
      .mockResolvedValueOnce({ rows: [{ max_version: 7 }] }); // currently at v7

    const mockClient = makeClient([undefined, undefined, undefined, undefined]);
    db.getClient.mockResolvedValueOnce(mockClient);
    redis.del.mockResolvedValue(1);

    const req = makeReq({ params: { id: 'file-001', versionId: 'v2' } });
    const res = mockRes();
    await restoreVersion(req, res, mockNext);

    expect(res.json.mock.calls[0][0].newVersionNum).toBe(8);
  });

  test('clears file cache after restore', async () => {
    const version = { version_id: 'v1', version_num: 1, chunk_ids: [], size: 100 };
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001', size: 100 }] })
      .mockResolvedValueOnce({ rows: [version] })
      .mockResolvedValueOnce({ rows: [{ max_version: 1 }] });

    const mockClient = makeClient([undefined, undefined, undefined, undefined]);
    db.getClient.mockResolvedValueOnce(mockClient);
    redis.del.mockResolvedValue(1);

    const req = makeReq({ params: { id: 'file-001', versionId: 'v1' } });
    const res = mockRes();
    await restoreVersion(req, res, mockNext);

    expect(redis.del).toHaveBeenCalledWith('file:file-001');
  });

  test('rolls back and releases client on transaction error', async () => {
    const version = { version_id: 'v1', version_num: 1, chunk_ids: [], size: 100 };
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'file-001', size: 100 }] })
      .mockResolvedValueOnce({ rows: [version] })
      .mockResolvedValueOnce({ rows: [{ max_version: 2 }] });

    const mockClient = { query: jest.fn(), release: jest.fn() };
    mockClient.query
      .mockResolvedValueOnce(undefined)          // BEGIN
      .mockRejectedValueOnce(new Error('INSERT failed')); // INSERT blows up
    db.getClient.mockResolvedValueOnce(mockClient);

    const req = makeReq({ params: { id: 'file-001', versionId: 'v1' } });
    const res = mockRes();
    await restoreVersion(req, res, mockNext);

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ═══════════════════════════════════════════════════════════════
// searchFiles
// ═══════════════════════════════════════════════════════════════
describe('searchFiles()', () => {

  test('400 — missing query param', async () => {
    const req = makeReq({ query: {} });
    const res = mockRes();
    await searchFiles(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Search query is required' });
  });

  test('400 — empty string query', async () => {
    const req = makeReq({ query: { q: '   ' } }); // whitespace only
    const res = mockRes();
    await searchFiles(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('200 — returns matching files', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      makeFileRow({ name: 'invoice_2024.pdf' }),
      makeFileRow({ file_id: 'f2', name: 'invoice_2023.pdf' }),
    ] });

    const req = makeReq({ query: { q: 'invoice' } });
    const res = mockRes();
    await searchFiles(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.query).toBe('invoice');
    expect(body.results).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  test('200 — returns empty results when no files match', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ query: { q: 'nothingmatchesthis' } });
    const res = mockRes();
    await searchFiles(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.results).toEqual([]);
    expect(body.total).toBe(0);
  });

  test('uses ILIKE with wildcard wrapping for case-insensitive search', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ query: { q: 'Report' } });
    const res = mockRes();
    await searchFiles(req, res, mockNext);

    const [, params] = db.query.mock.calls[0];
    expect(params[1]).toBe('%Report%'); // wrapped in wildcards
  });

  test('trims whitespace from query before searching', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ query: { q: '  budget  ' } });
    const res = mockRes();
    await searchFiles(req, res, mockNext);

    const [, params] = db.query.mock.calls[0];
    expect(params[1]).toBe('%budget%'); // trimmed
  });

  test('only searches files belonging to the requesting user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ query: { q: 'test' }, user: { userId: 'user-abc' } });
    const res = mockRes();
    await searchFiles(req, res, mockNext);

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe('user-abc');
  });

  test('calls next(err) on DB error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB down'));
    const req = makeReq({ query: { q: 'test' } });
    const res = mockRes();
    await searchFiles(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});