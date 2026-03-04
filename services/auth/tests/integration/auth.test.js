'use strict';

/**
 * Integration tests — auth-service
 * Fires real HTTP requests via supertest.
 * Only the DB layer is mocked (no real Postgres needed).
 * JWT_SECRET and other env vars are set in tests/setup.js via jest setupFiles.
 */

jest.mock('./shared/db', () => ({
  query:       jest.fn(),
  getClient:   jest.fn(),
  healthCheck: jest.fn(),
  pool:        { on: jest.fn() },
}));

jest.mock('prom-client', () => ({
  collectDefaultMetrics: jest.fn(),
  register: { contentType: 'text/plain', metrics: jest.fn().mockResolvedValue('') },
  Counter:   jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
  Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn() })),
  Gauge:     jest.fn().mockImplementation(() => ({ set: jest.fn() })),
}));

const request = require('supertest');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');


const app = require('../../index');
const db  = require('./shared/db');

const SECRET = 'integration-test-secret';

const makeToken = (userId, email) =>
  jwt.sign({ userId, email }, SECRET, { expiresIn: '15m' });


let server;
beforeAll((done) => { server = app.listen(0, done); });
afterAll((done)  => { server.close(done); });

beforeEach(() => {
  jest.clearAllMocks();
});


describe('GET /health', () => {

  test('200 — ok when db is reachable', async () => {
    db.healthCheck.mockResolvedValueOnce(true);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('auth');
  });

  test('503 — error when db is down', async () => {
    db.healthCheck.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
  });
});


describe('POST /auth/signup', () => {

  test('400 — missing password', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('400 — password too short', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'test@test.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/);
  });

  test('409 — duplicate email', async () => {
   
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 'existing-id' }] });

    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'taken@test.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/);
  });

  test('201 — creates user and returns tokens', async () => {
    
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        user_id: 'new-id',
        email: 'new@test.com',
        storage_quota: 5368709120,
        created_at: new Date().toISOString(),
      }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'new@test.com', password: 'securepassword1' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Account created successfully');
    expect(res.body.user.email).toBe('new@test.com');
    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.tokens.refreshToken).toBeDefined();
  });

  test('201 — response has correct shape', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        user_id: 'id-1',
        email: 'shape@test.com',
        storage_quota: 1000,
        created_at: new Date().toISOString(),
      }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'shape@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('tokens');
    expect(res.body.user).toHaveProperty('userId');
    expect(res.body.user).toHaveProperty('email');
    expect(res.body.tokens).toHaveProperty('accessToken');
    expect(res.body.tokens).toHaveProperty('refreshToken');
  });
});


describe('POST /auth/login', () => {

  test('400 — missing credentials', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('401 — user does not exist', async () => {
    
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'ghost@test.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid email or password/);
  });

  test('401 — wrong password', async () => {
    
    const hash = await bcrypt.hash('correctpassword', 1);
    db.query.mockResolvedValueOnce({ rows: [{
      user_id: 'id',
      email: 'test@test.com',
      password_hash: hash,
      storage_used: 0,
      storage_quota: 1000,
    }] });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@test.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid email or password/);
  });

  test('200 — valid credentials return tokens', async () => {
    const hash = await bcrypt.hash('mypassword123', 1);
  
    db.query
      .mockResolvedValueOnce({ rows: [{
        user_id: 'id-2',
        email: 'login@test.com',
        password_hash: hash,
        storage_used: 0,
        storage_quota: 5368709120,
      }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@test.com', password: 'mypassword123' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Login successful');
    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.tokens.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe('login@test.com');
  });
});


describe('POST /auth/refresh', () => {

  test('400 — missing refresh token', async () => {
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  test('401 — token not in db', async () => {
   
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'completely-fake-token-xyz' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid refresh token/);
  });

  test('401 — expired token', async () => {
    
    db.query.mockResolvedValueOnce({ rows: [{
      token_id: '1',
      user_id: 'id',
      email: 'test@test.com',
      expires_at: new Date(Date.now() - 60000), 
    }] });

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'some-expired-token-xyz' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/);
  });

  test('200 — valid token returns new access + refresh pair', async () => {
    
    db.query
      .mockResolvedValueOnce({ rows: [{
        token_id: 'tok-1',
        user_id: 'user-1',
        email: 'refresh@test.com',
        expires_at: new Date(Date.now() + 86400000), 
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token-abc' });

    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.tokens.refreshToken).toBeDefined();
    
    expect(res.body.tokens.refreshToken).not.toBe('valid-refresh-token-abc');
  });
});


describe('POST /auth/logout', () => {

  test('400 — missing refresh token', async () => {
    const res = await request(app).post('/auth/logout').send({});
    expect(res.status).toBe(400);
  });

  test('200 — logs out successfully', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/auth/logout')
      .send({ refreshToken: 'some-valid-token' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out successfully');
  });
});


describe('GET /auth/me', () => {

  test('401 — no authorization header', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('401 — malformed/invalid token', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer totally.invalid.token');
    expect(res.status).toBe(401);
  });

  test('200 — valid token returns user profile', async () => {
    const token = makeToken('abc-123', 'me@test.com');

    db.query.mockResolvedValueOnce({ rows: [{
      user_id: 'abc-123',
      email: 'me@test.com',
      storage_used: 2048,
      storage_quota: 5368709120,
      created_at: new Date().toISOString(),
    }] });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@test.com');
    expect(res.body.userId).toBe('abc-123');
    expect(res.body.storageUsed).toBe(2048);
  });

  test('404 — valid token but user deleted from db', async () => {
    const token = makeToken('deleted-id', 'gone@test.com');
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(404);
  });
});


describe('Unknown routes', () => {
  test('404 — returns not found for unknown routes', async () => {
    const res = await request(app).get('/auth/doesnotexist');
    expect(res.status).toBe(404);
  });
});