'use strict';

jest.mock('../shared/db', () => ({
  query:       jest.fn(),
  healthCheck: jest.fn(),
  pool:        { on: jest.fn() },
}));
jest.mock('../shared/rabbitmq', () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn(),
  QUEUES:  { FILE_SHARED: 'file.shared' },
}));

const db = require('../shared/db');
const mq = require('../shared/rabbitmq');
const { createShareLink, accessShareLink, revokeShareLink, myShareLinks } =
  require('../../controllers/shareController');


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
  user:   { userId: 'user-123', email: 'owner@test.com' },
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());


describe('createShareLink()', () => {

  test('400 — missing fileId', async () => {
    const req = makeReq({ body: {} });
    const res = mockRes();
    await createShareLink(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'fileId is required' });
  });

  test('400 — invalid permission value', async () => {
    const req = makeReq({ body: { fileId: 'f1', permission: 'admin' } });
    const res = mockRes();
    await createShareLink(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'permission must be read or write' });
  });

  test('404 — file not found or not owned by user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ body: { fileId: 'missing-file' } });
    const res = mockRes();
    await createShareLink(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'File not found' });
  });

  test('201 — creates link with default read permission', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'f1', name: 'doc.pdf' }] })
      .mockResolvedValueOnce({ rows: [{
        link_id: 'link-abc', file_id: 'f1',
        permission: 'read', expires_at: null, created_at: new Date().toISOString(),
      }] });

    const req = makeReq({ body: { fileId: 'f1' } }); // no permission = defaults to 'read'
    const res = mockRes();
    await createShareLink(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Share link created');
    expect(body.link.linkId).toBe('link-abc');
    expect(body.link.permission).toBe('read');
    expect(body.link.url).toContain('link-abc');
  });

  test('201 — creates link with write permission', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'f1', name: 'doc.pdf' }] })
      .mockResolvedValueOnce({ rows: [{
        link_id: 'link-xyz', file_id: 'f1',
        permission: 'write', expires_at: null, created_at: new Date().toISOString(),
      }] });

    const req = makeReq({ body: { fileId: 'f1', permission: 'write' } });
    const res = mockRes();
    await createShareLink(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.link.permission).toBe('write');
  });

  test('201 — sets expiresAt when expiresInDays provided', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'f1', name: 'doc.pdf' }] })
      .mockResolvedValueOnce({ rows: [{
        link_id: 'link-exp', file_id: 'f1',
        permission: 'read',
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        created_at: new Date().toISOString(),
      }] });

    const req = makeReq({ body: { fileId: 'f1', expiresInDays: 7 } });
    const res = mockRes();
    await createShareLink(req, res, mockNext);

   
    const insertArgs = db.query.mock.calls[1][1];
    expect(insertArgs[3]).not.toBeNull(); 
    const body = res.json.mock.calls[0][0];
    expect(body.link.expiresAt).not.toBeNull();
  });

  test('201 — null expiresAt when expiresInDays not provided', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'f1', name: 'doc.pdf' }] })
      .mockResolvedValueOnce({ rows: [{
        link_id: 'link-nexp', file_id: 'f1',
        permission: 'read', expires_at: null, created_at: new Date().toISOString(),
      }] });

    const req = makeReq({ body: { fileId: 'f1' } });
    const res = mockRes();
    await createShareLink(req, res, mockNext);

    const insertArgs = db.query.mock.calls[1][1];
    expect(insertArgs[3]).toBeNull(); 
  });

  test('201 — publishes FILE_SHARED event to RabbitMQ', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'f1', name: 'report.xlsx' }] })
      .mockResolvedValueOnce({ rows: [{
        link_id: 'link-mq', file_id: 'f1',
        permission: 'read', expires_at: null, created_at: new Date().toISOString(),
      }] });

    const req = makeReq({ body: { fileId: 'f1' }, user: { userId: 'user-123', email: 'owner@test.com' } });
    const res = mockRes();
    await createShareLink(req, res, mockNext);

    expect(mq.publish).toHaveBeenCalledWith(
      'file.shared',
      expect.objectContaining({
        fileId:         'f1',
        fileName:       'report.xlsx',
        sharedByUserId: 'user-123',
        sharedByEmail:  'owner@test.com',
        linkId:         'link-mq',
      })
    );
  });

  test('calls next(err) on db error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));
    const req = makeReq({ body: { fileId: 'f1' } });
    const res = mockRes();
    await createShareLink(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});


describe('accessShareLink()', () => {

  test('404 — link not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ params: { linkId: 'bad-link' } });
    const res = mockRes();
    await accessShareLink(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Share link not found' });
  });

  test('410 — link has expired', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      link_id: 'link-old', file_id: 'f1', permission: 'read',
      expires_at: new Date(Date.now() - 1000).toISOString(), // past
      created_at: new Date().toISOString(),
      name: 'doc.pdf', size: 1024, mime_type: 'application/pdf',
      folder_path: '/', owner_email: 'owner@test.com',
    }] });

    const req = makeReq({ params: { linkId: 'link-old' } });
    const res = mockRes();
    await accessShareLink(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith({ error: 'Share link has expired' });
  });

  test('200 — returns file info for valid link with no expiry', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      link_id: 'link-ok', file_id: 'f1', permission: 'read',
      expires_at: null,
      created_at: new Date().toISOString(),
      name: 'photo.jpg', size: 204800, mime_type: 'image/jpeg',
      folder_path: '/photos', owner_email: 'owner@test.com',
    }] });

    const req = makeReq({ params: { linkId: 'link-ok' } });
    const res = mockRes();
    await accessShareLink(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.linkId).toBe('link-ok');
    expect(body.permission).toBe('read');
    expect(body.file.name).toBe('photo.jpg');
    expect(body.file.ownerEmail).toBe('owner@test.com');
  });

  test('200 — returns file info for valid link with future expiry', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      link_id: 'link-future', file_id: 'f1', permission: 'write',
      expires_at: new Date(Date.now() + 86400000).toISOString(), // 1 day future
      created_at: new Date().toISOString(),
      name: 'sheet.xlsx', size: 51200, mime_type: 'application/vnd.ms-excel',
      folder_path: '/', owner_email: 'owner@test.com',
    }] });

    const req = makeReq({ params: { linkId: 'link-future' } });
    const res = mockRes();
    await accessShareLink(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.permission).toBe('write');
    expect(body.file.mimeType).toBe('application/vnd.ms-excel');
  });

  test('calls next(err) on db error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));
    const req = makeReq({ params: { linkId: 'any-link' } });
    const res = mockRes();
    await accessShareLink(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});


describe('revokeShareLink()', () => {

  test('404 — link not found or belongs to different user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); 
    const req = makeReq({ params: { linkId: 'not-mine' } });
    const res = mockRes();
    await revokeShareLink(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Share link not found or not yours to revoke' });
  });

  test('200 — successfully revokes own link', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ link_id: 'link-del' }] });
    const req = makeReq({ params: { linkId: 'link-del' } });
    const res = mockRes();
    await revokeShareLink(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Share link revoked');
    expect(body.linkId).toBe('link-del');
  });

  test('DELETE query uses both linkId and userId for safety', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ link_id: 'link-del' }] });
    const req = makeReq({ params: { linkId: 'link-del' }, user: { userId: 'user-123' } });
    const res = mockRes();
    await revokeShareLink(req, res, mockNext);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('DELETE FROM shared_links');
    expect(params).toContain('link-del');
    expect(params).toContain('user-123');
  });

  test('calls next(err) on db error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));
    const req = makeReq({ params: { linkId: 'link-del' } });
    const res = mockRes();
    await revokeShareLink(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});


describe('myShareLinks()', () => {

  test('200 — returns empty array when no links exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq();
    const res = mockRes();
    await myShareLinks(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.links).toEqual([]);
    expect(body.total).toBe(0);
  });

  test('200 — returns all links for the user', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      { link_id: 'l1', file_id: 'f1', file_name: 'a.pdf', size: 1024, mime_type: 'application/pdf', permission: 'read',  expires_at: null, created_at: new Date().toISOString() },
      { link_id: 'l2', file_id: 'f2', file_name: 'b.png', size: 2048, mime_type: 'image/png',       permission: 'write', expires_at: null, created_at: new Date().toISOString() },
    ] });

    const req = makeReq();
    const res = mockRes();
    await myShareLinks(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.total).toBe(2);
    expect(body.links).toHaveLength(2);
    expect(body.links[0].linkId).toBe('l1');
    expect(body.links[1].linkId).toBe('l2');
  });

  test('200 — each link has a url field', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      { link_id: 'l1', file_id: 'f1', file_name: 'x.pdf', size: 100, mime_type: 'application/pdf', permission: 'read', expires_at: null, created_at: new Date().toISOString() },
    ] });

    const req = makeReq();
    const res = mockRes();
    await myShareLinks(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.links[0].url).toContain('l1');
  });

  test('query filters by userId', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ user: { userId: 'specific-user', email: 'x@x.com' } });
    const res = mockRes();
    await myShareLinks(req, res, mockNext);

    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('specific-user');
  });

  test('calls next(err) on db error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));
    const req = makeReq();
    const res = mockRes();
    await myShareLinks(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});