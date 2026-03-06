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
beforeEach(() => jest.clearAllMocks());

describe('authenticate middleware', () => {

  test('401 — no authorization header', () => {
    authenticate({ headers: {} }, mockRes(), mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('401 — header missing Bearer prefix', () => {
    const res = mockRes();
    authenticate({ headers: { authorization: 'Token abc' } }, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('401 — expired token', () => {
    jwt.verify.mockImplementation(() => { const e = new Error(); e.name = 'TokenExpiredError'; throw e; });
    const res = mockRes();
    authenticate({ headers: { authorization: 'Bearer expired.token' } }, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Access token expired' });
  });

  test('401 — invalid token', () => {
    jwt.verify.mockImplementation(() => { const e = new Error(); e.name = 'JsonWebTokenError'; throw e; });
    const res = mockRes();
    authenticate({ headers: { authorization: 'Bearer bad.token' } }, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid access token' });
  });

  test('passes — valid token sets req.user and calls next', () => {
    jwt.verify.mockReturnValueOnce({ userId: 'u1', email: 'test@test.com' });
    const req = { headers: { authorization: 'Bearer valid.token' } };
    authenticate(req, mockRes(), mockNext);
    expect(req.user).toEqual({ userId: 'u1', email: 'test@test.com' });
    expect(mockNext).toHaveBeenCalledWith();
  });

  test('calls next(err) on unexpected error', () => {
    jwt.verify.mockImplementation(() => { throw new Error('unexpected'); });
    authenticate({ headers: { authorization: 'Bearer x.y.z' } }, mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});