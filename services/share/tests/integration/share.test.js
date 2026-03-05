'use strict';

/**
 * Integration tests — share-service
 * Key routing note: GET /share/:linkId is PUBLIC (no auth).
 * POST /share, DELETE /share/:linkId, GET /share all require JWT.
 */

jest.mock('./shared/db', () => ({
  query:       jest.fn(),
  healthCheck: jest.fn(),
  pool:        { on: jest.fn() },
}));
jest.mock('./shared/rabbitmq', () => ({
  connect:  jest.fn().mockResolvedValue(undefined),
  publish:  jest.fn(),
  QUEUES:   { FILE_SHARED: 'file.shared' },
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
const mq      = require('./shared/rabbitmq');

const SECRET = 'share-test-secret';
const makeToken = (userId = 'user-123', email = 'owner@test.com') =>
  jwt.sign({ userId, email }, SECRET, { expiresIn: '15m' });

let server;
beforeAll((done) => { server = app.listen(0, done); });
afterAll((done)  => { server.close(done); });
beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════
describe('GET /health', () => {

  test('200 — ok when db reachable', async () => {
    db.healthCheck.mockResolvedValueOnce(true);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('share');
  });

  test('503 — error when db down', async () => {
    db.healthCheck.mockRejectedValueOnce(new Error('down'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /share/:linkId  — PUBLIC route (no auth needed)
// ═══════════════════════════════════════════════════════════════
describe('GET /share/:linkId (public)', () => {

  test('404 — link does not exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/share/nonexistent-link');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/);
  });

  test('410 — link is expired', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      link_id: 'l1', file_id: 'f1', permission: 'read',
      expires_at: new Date(Date.now() - 1000).toISOString(),
      created_at: new Date().toISOString(),
      name: 'doc.pdf', size: 1024, mime_type: 'application/pdf',
      folder_path: '/', owner_email: 'owner@test.com',
    }] });
    const res = await request(app).get('/share/l1');
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/expired/);
  });

  test('200 — no auth required for valid link', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      link_id: 'l1', file_id: 'f1', permission: 'read',
      expires_at: null,
      created_at: new Date().toISOString(),
      name: 'photo.jpg', size: 2048, mime_type: 'image/jpeg',
      folder_path: '/', owner_email: 'owner@test.com',
    }] });
    // No Authorization header — should still work
    const res = await request(app).get('/share/l1');
    expect(res.status).toBe(200);
    expect(res.body.file.name).toBe('photo.jpg');
    expect(res.body.permission).toBe('read');
  });

  test('200 — valid link with future expiry returns file info', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      link_id: 'l2', file_id: 'f2', permission: 'write',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
      name: 'video.mp4', size: 104857600, mime_type: 'video/mp4',
      folder_path: '/videos', owner_email: 'owner@test.com',
    }] });
    const res = await request(app).get('/share/l2');
    expect(res.status).toBe(200);
    expect(res.body.file.mimeType).toBe('video/mp4');
    expect(res.body.file.folderPath).toBe('/videos');
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /share  — requires auth
// ═══════════════════════════════════════════════════════════════
describe('POST /share', () => {
  const token = makeToken();

  test('401 — no token', async () => {
    const res = await request(app).post('/share').send({ fileId: 'f1' });
    expect(res.status).toBe(401);
  });

  test('400 — missing fileId', async () => {
    const res = await request(app)
      .post('/share')
      .set('Authorization', 'Bearer ' + token)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fileId is required/);
  });

  test('400 — invalid permission', async () => {
    const res = await request(app)
      .post('/share')
      .set('Authorization', 'Bearer ' + token)
      .send({ fileId: 'f1', permission: 'superadmin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/permission must be read or write/);
  });

  test('404 — file not found or not owned by user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/share')
      .set('Authorization', 'Bearer ' + token)
      .send({ fileId: 'ghost-file' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/File not found/);
  });

  test('201 — creates share link with default read permission', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'f1', name: 'report.pdf' }] })
      .mockResolvedValueOnce({ rows: [{
        link_id: 'new-link', file_id: 'f1',
        permission: 'read', expires_at: null,
        created_at: new Date().toISOString(),
      }] });

    const res = await request(app)
      .post('/share')
      .set('Authorization', 'Bearer ' + token)
      .send({ fileId: 'f1' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Share link created');
    expect(res.body.link.linkId).toBe('new-link');
    expect(res.body.link.url).toContain('new-link');
    expect(mq.publish).toHaveBeenCalledWith(
      'file.shared',
      expect.objectContaining({ fileId: 'f1', fileName: 'report.pdf' })
    );
  });

  test('201 — creates link with expiry date when expiresInDays set', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ file_id: 'f1', name: 'doc.pdf' }] })
      .mockResolvedValueOnce({ rows: [{
        link_id: 'exp-link', file_id: 'f1', permission: 'read',
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        created_at: new Date().toISOString(),
      }] });

    const res = await request(app)
      .post('/share')
      .set('Authorization', 'Bearer ' + token)
      .send({ fileId: 'f1', expiresInDays: 7 });

    expect(res.status).toBe(201);
    expect(res.body.link.expiresAt).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// DELETE /share/:linkId  — requires auth
// ═══════════════════════════════════════════════════════════════
describe('DELETE /share/:linkId', () => {
  const token = makeToken();

  test('401 — no token', async () => {
    const res = await request(app).delete('/share/some-link');
    expect(res.status).toBe(401);
  });

  test('404 — link not found or not owned by requester', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/share/not-mine')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found or not yours/);
  });

  test('200 — successfully revokes own link', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ link_id: 'my-link' }] });
    const res = await request(app)
      .delete('/share/my-link')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Share link revoked');
    expect(res.body.linkId).toBe('my-link');
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /share  — requires auth (list my links)
// ═══════════════════════════════════════════════════════════════
describe('GET /share (my links)', () => {
  const token = makeToken();

  test('401 — no token', async () => {
    // Note: GET /share/:linkId is public but GET /share (exact) requires auth
    const res = await request(app).get('/share');
    expect(res.status).toBe(401);
  });

  test('200 — returns empty list when no links', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/share')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body.links).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('200 — returns list of links with url field', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      { link_id: 'l1', file_id: 'f1', file_name: 'a.pdf', size: 100, mime_type: 'application/pdf', permission: 'read',  expires_at: null, created_at: new Date().toISOString() },
      { link_id: 'l2', file_id: 'f2', file_name: 'b.mp4', size: 200, mime_type: 'video/mp4',       permission: 'write', expires_at: null, created_at: new Date().toISOString() },
    ] });

    const res = await request(app)
      .get('/share')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.links[0].url).toContain('l1');
    expect(res.body.links[1].permission).toBe('write');
  });
});

// ═══════════════════════════════════════════════════════════════
// Unknown routes
// ═══════════════════════════════════════════════════════════════
describe('Unknown routes', () => {
  test('404 — returns not found for unknown paths', async () => {
    const res = await request(app).get('/completely-unknown');
    expect(res.status).toBe(404);
  });
});