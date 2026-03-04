'use strict';


jest.mock('../shared/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  healthCheck: jest.fn(),
  pool: { on: jest.fn() },
}));
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

const db      = require('../shared/db');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { signup, login, refresh, logout, me } = require('../../controllers/authController');


const mockReq = (body = {}, user = null, headers = {}) => ({ body, user, headers });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = jest.fn();


beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
});

describe('signup()', () => {

  test('400 — missing email', async () => {
    const req = mockReq({ password: 'password123' });
    const res = mockRes();
    await signup(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
  });

  test('400 — missing password', async () => {
    const req = mockReq({ email: 'test@test.com' });
    const res = mockRes();
    await signup(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
  });

  test('400 — password too short', async () => {
    const req = mockReq({ email: 'test@test.com', password: 'short' });
    const res = mockRes();
    await signup(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Password must be at least 8 characters' });
  });

  test('409 — email already registered', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: '123' }] });
    const req = mockReq({ email: 'existing@test.com', password: 'password123' });
    const res = mockRes();
    await signup(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email already registered' });
  });

  test('201 — successful signup', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })                                          // no existing user
      .mockResolvedValueOnce({ rows: [{ user_id: 'abc-123', email: 'new@test.com', storage_quota: 5368709120, created_at: new Date() }] }) // insert user
      .mockResolvedValueOnce({ rows: [] });                                          // insert refresh token

    bcrypt.hash.mockResolvedValueOnce('hashed_password');
    jwt.sign.mockReturnValueOnce('mock_access_token');

    const req = mockReq({ email: 'New@Test.com', password: 'securepassword' });
    const res = mockRes();
    await signup(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Account created successfully');
    expect(body.user.email).toBe('new@test.com');
    expect(body.tokens.accessToken).toBe('mock_access_token');
    expect(body.tokens.refreshToken).toBeDefined();
  });

  test('lowercases email before saving', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'abc', email: 'upper@test.com', storage_quota: 1000, created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [] });

    bcrypt.hash.mockResolvedValueOnce('hashed');
    jwt.sign.mockReturnValueOnce('token');

    const req = mockReq({ email: 'UPPER@TEST.COM', password: 'password123' });
    const res = mockRes();
    await signup(req, res, mockNext);

  
    expect(db.query.mock.calls[0][1][0]).toBe('upper@test.com');
  });

  test('calls next(err) on db error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB connection failed'));
    const req = mockReq({ email: 'test@test.com', password: 'password123' });
    const res = mockRes();
    await signup(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});


describe('login()', () => {

  test('400 — missing email', async () => {
    const req = mockReq({ password: 'password123' });
    const res = mockRes();
    await login(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
  });

  test('400 — missing password', async () => {
    const req = mockReq({ email: 'test@test.com' });
    const res = mockRes();
    await login(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('401 — user not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = mockReq({ email: 'nobody@test.com', password: 'password123' });
    const res = mockRes();
    await login(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email or password' });
  });

  test('401 — wrong password', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: '123', email: 'test@test.com', password_hash: 'hash', storage_used: 0, storage_quota: 1000 }] });
    bcrypt.compare.mockResolvedValueOnce(false);
    const req = mockReq({ email: 'test@test.com', password: 'wrongpassword' });
    const res = mockRes();
    await login(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email or password' });
  });

  test('200 — successful login returns tokens', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'abc-123', email: 'test@test.com', password_hash: 'hash', storage_used: 0, storage_quota: 5368709120 }] })
      .mockResolvedValueOnce({ rows: [] }); 

    bcrypt.compare.mockResolvedValueOnce(true);
    jwt.sign.mockReturnValueOnce('mock_access_token');

    const req = mockReq({ email: 'test@test.com', password: 'password123' });
    const res = mockRes();
    await login(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Login successful');
    expect(body.tokens.accessToken).toBe('mock_access_token');
    expect(body.tokens.refreshToken).toBeDefined();
    expect(body.user.email).toBe('test@test.com');
  });

  test('calls next(err) on db error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({ email: 'test@test.com', password: 'password123' });
    const res = mockRes();
    await login(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('refresh()', () => {

  test('400 — missing refresh token', async () => {
    const req = mockReq({});
    const res = mockRes();
    await refresh(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Refresh token is required' });
  });

  test('401 — token not found in db', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = mockReq({ refreshToken: 'fake-token' });
    const res = mockRes();
    await refresh(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid refresh token' });
  });

  test('401 — expired refresh token', async () => {
    const pastDate = new Date(Date.now() - 1000);
    db.query.mockResolvedValueOnce({ rows: [{ token_id: '1', user_id: 'abc', email: 'test@test.com', expires_at: pastDate }] });
    const req = mockReq({ refreshToken: 'expired-token' });
    const res = mockRes();
    await refresh(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Refresh token expired — please log in again' });
  });

  test('200 — returns new token pair', async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    db.query
      .mockResolvedValueOnce({ rows: [{ token_id: '1', user_id: 'abc', email: 'test@test.com', expires_at: futureDate }] })
      .mockResolvedValueOnce({ rows: [] }) 
      .mockResolvedValueOnce({ rows: [] }); 

    jwt.sign.mockReturnValueOnce('new_access_token');

    const req = mockReq({ refreshToken: 'valid-refresh-token' });
    const res = mockRes();
    await refresh(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.tokens.accessToken).toBe('new_access_token');
    expect(body.tokens.refreshToken).toBeDefined();
  });

  test('rotates token — deletes old before inserting new', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    db.query
      .mockResolvedValueOnce({ rows: [{ token_id: 'old-id', user_id: 'abc', email: 'test@test.com', expires_at: futureDate }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    jwt.sign.mockReturnValueOnce('token');
    const req = mockReq({ refreshToken: 'some-token' });
    const res = mockRes();
    await refresh(req, res, mockNext);

    
    expect(db.query.mock.calls[1][0]).toContain('DELETE');
    
    expect(db.query.mock.calls[2][0]).toContain('INSERT');
  });
});


describe('logout()', () => {

  test('400 — missing refresh token', async () => {
    const req = mockReq({});
    const res = mockRes();
    await logout(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Refresh token is required' });
  });

  test('200 — deletes token and returns success', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = mockReq({ refreshToken: 'some-token' });
    const res = mockRes();
    await logout(req, res, mockNext);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM refresh_tokens'),
      expect.any(Array)
    );
    expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
  });

  test('calls next(err) on db error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({ refreshToken: 'token' });
    const res = mockRes();
    await logout(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('me()', () => {

  test('404 — user not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const req = mockReq({}, { userId: 'ghost-id' });
    const res = mockRes();
    await me(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
  });

  test('200 — returns user profile', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ user_id: 'abc', email: 'test@test.com', storage_used: 1024, storage_quota: 5368709120, created_at: new Date() }],
    });
    const req = mockReq({}, { userId: 'abc' });
    const res = mockRes();
    await me(req, res, mockNext);
    const body = res.json.mock.calls[0][0];
    expect(body.email).toBe('test@test.com');
    expect(body.storageUsed).toBe(1024);
    expect(body.userId).toBe('abc');
  });

  test('calls next(err) on db error', async () => {
    db.query.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({}, { userId: 'abc' });
    const res = mockRes();
    await me(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});