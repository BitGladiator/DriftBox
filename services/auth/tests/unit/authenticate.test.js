'use strict';

jest.mock('jsonwebtoken');
const jwt          = require('jsonwebtoken');
const authenticate = require('../../middleware/authenticate');

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

describe('authenticate middleware', () => {

  test('401 — no authorization header', () => {
    const req = { headers: {} };
    const res = mockRes();
    authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authorization header missing or malformed' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('401 — header does not start with Bearer', () => {
    const req = { headers: { authorization: 'Basic sometoken' } };
    const res = mockRes();
    authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('401 — expired token', () => {
    jwt.verify.mockImplementation(() => { const e = new Error(); e.name = 'TokenExpiredError'; throw e; });
    const req = { headers: { authorization: 'Bearer expired.token.here' } };
    const res = mockRes();
    authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Access token expired' });
  });

  test('401 — invalid token', () => {
    jwt.verify.mockImplementation(() => { const e = new Error(); e.name = 'JsonWebTokenError'; throw e; });
    const req = { headers: { authorization: 'Bearer invalid.token' } };
    const res = mockRes();
    authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid access token' });
  });

  test('passes — valid token sets req.user and calls next', () => {
    jwt.verify.mockReturnValueOnce({ userId: 'abc-123', email: 'test@test.com' });
    const req = { headers: { authorization: 'Bearer valid.token.here' } };
    const res = mockRes();
    authenticate(req, res, mockNext);
    expect(req.user).toEqual({ userId: 'abc-123', email: 'test@test.com' });
    expect(mockNext).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('calls next(err) on unexpected error', () => {
    jwt.verify.mockImplementation(() => { throw new Error('Unexpected'); });
    const req = { headers: { authorization: 'Bearer some.token' } };
    const res = mockRes();
    authenticate(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});