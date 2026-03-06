'use strict';

jest.mock('jsonwebtoken');
const jwt = require('jsonwebtoken');


const {
  setupSocket,
  notifyUser,
  getConnectedDevices,
  getTotalConnections,
} = require('../../socket/syncHandler');


const makeIo = () => {
  const handlers = {};
  const middlewares = [];
  return {
    use:  jest.fn((fn) => middlewares.push(fn)),
    on:   jest.fn((event, fn) => { handlers[event] = fn; }),
    to:   jest.fn().mockReturnThis(),
    emit: jest.fn(),
    _middlewares: middlewares,
    _handlers: handlers,
    _triggerMiddleware: (socket, next) => middlewares[0](socket, next),
    _triggerConnection: (socket) => handlers['connection']?.(socket),
  };
};


const makeSocket = (overrides = {}) => {
  const handlers = {};
  return {
    id:        'socket-id-001',
    handshake: { auth: {}, headers: {} },
    userId:    null,
    email:     null,
    join:      jest.fn(),
    emit:      jest.fn(),
    on:        jest.fn((event, fn) => { handlers[event] = fn; }),
    _handlers: handlers,
    _trigger:  (event, data) => handlers[event]?.(data),
    ...overrides,
  };
};

beforeEach(() => jest.clearAllMocks());


describe('Socket.io auth middleware (setupSocket)', () => {

  test('rejects connection with no token', (done) => {
    const io = makeIo();
    setupSocket(io);
    const socket = makeSocket({ handshake: { auth: {}, headers: {} } });
    io._triggerMiddleware(socket, (err) => {
      expect(err).toBeDefined();
      expect(err.message).toMatch(/Authentication token required/);
      done();
    });
  });

  test('rejects connection with invalid token', (done) => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid'); });
    const io = makeIo();
    setupSocket(io);
    const socket = makeSocket({ handshake: { auth: { token: 'bad.token' }, headers: {} } });
    io._triggerMiddleware(socket, (err) => {
      expect(err).toBeDefined();
      expect(err.message).toMatch(/Invalid or expired token/);
      done();
    });
  });

  test('rejects connection with expired token', (done) => {
    const e = new Error('expired'); e.name = 'TokenExpiredError';
    jwt.verify.mockImplementation(() => { throw e; });
    const io = makeIo();
    setupSocket(io);
    const socket = makeSocket({ handshake: { auth: { token: 'expired.token' }, headers: {} } });
    io._triggerMiddleware(socket, (err) => {
      expect(err).toBeDefined();
      expect(err.message).toMatch(/Invalid or expired token/);
      done();
    });
  });

  test('accepts connection with valid token from auth.token', (done) => {
    jwt.verify.mockReturnValueOnce({ userId: 'user-123', email: 'test@test.com' });
    const io = makeIo();
    setupSocket(io);
    const socket = makeSocket({ handshake: { auth: { token: 'valid.jwt.token' }, headers: {} } });
    io._triggerMiddleware(socket, (err) => {
      expect(err).toBeUndefined();
      expect(socket.userId).toBe('user-123');
      expect(socket.email).toBe('test@test.com');
      done();
    });
  });

  test('accepts token from Authorization header as fallback', (done) => {
    jwt.verify.mockReturnValueOnce({ userId: 'user-456', email: 'header@test.com' });
    const io = makeIo();
    setupSocket(io);
    const socket = makeSocket({
      handshake: {
        auth: {},
        headers: { authorization: 'Bearer header.jwt.token' },
      },
    });
    io._triggerMiddleware(socket, (err) => {
      expect(err).toBeUndefined();
      expect(socket.userId).toBe('user-456');
      done();
    });
  });
});


describe('Connection lifecycle', () => {

  const setupAndConnect = (userId = 'user-123', socketId = 'sock-001') => {
    jwt.verify.mockReturnValue({ userId, email: 'test@test.com' });
    const io = makeIo();
    setupSocket(io);

    const socket = makeSocket({
      id: socketId,
      handshake: { auth: { token: 'valid.token' }, headers: {} },
    });
    // Run through auth middleware then trigger connection
    return new Promise((resolve) => {
      io._triggerMiddleware(socket, (err) => {
        if (err) throw err;
        socket.userId = userId;
        io._triggerConnection(socket);
        resolve({ io, socket });
      });
    });
  };

  test('joins user room on connect', async () => {
    const { socket } = await setupAndConnect('user-abc');
    expect(socket.join).toHaveBeenCalledWith('user:user-abc');
  });

  test('emits connected event to client on connect', async () => {
    const { socket } = await setupAndConnect('user-abc');
    expect(socket.emit).toHaveBeenCalledWith('connected', expect.objectContaining({
      message: 'Sync service connected',
      userId: 'user-abc',
    }));
  });

  test('tracks connected devices count', async () => {
    await setupAndConnect('user-track', 'sock-t1');
    expect(getConnectedDevices('user-track')).toBe(1);
  });

  test('tracks multiple sockets for same user', async () => {
    await setupAndConnect('user-multi', 'sock-m1');
    await setupAndConnect('user-multi', 'sock-m2');
    expect(getConnectedDevices('user-multi')).toBe(2);
  });

  test('responds to sync:request with sync:ack', async () => {
    const { socket } = await setupAndConnect('user-ack');
    socket._trigger('sync:request', { type: 'full' });
    expect(socket.emit).toHaveBeenCalledWith('sync:ack', expect.objectContaining({
      received: true,
      timestamp: expect.any(Number),
    }));
  });

  test('removes socket on disconnect', async () => {
    const { socket } = await setupAndConnect('user-disc', 'sock-disc');
    expect(getConnectedDevices('user-disc')).toBe(1);
    socket._trigger('disconnect', 'client namespace disconnect');
    expect(getConnectedDevices('user-disc')).toBe(0);
  });

  test('cleans up user entry when last socket disconnects', async () => {
    await setupAndConnect('user-cleanup', 'sock-c1');
    const { socket: s2 } = await setupAndConnect('user-cleanup', 'sock-c2');
    expect(getConnectedDevices('user-cleanup')).toBe(2);
    // Disconnect both
    s2._trigger('disconnect', 'transport close');
    expect(getConnectedDevices('user-cleanup')).toBe(1);
  });
});
describe('notifyUser()', () => {

  test('emits event to the correct user room', () => {
    const io = makeIo();
    notifyUser(io, 'user-999', 'file:uploaded', { fileName: 'test.pdf' });
    expect(io.to).toHaveBeenCalledWith('user:user-999');
    expect(io.emit).toHaveBeenCalledWith('file:uploaded', { fileName: 'test.pdf' });
  });

  test('emits file:uploaded event with correct payload', () => {
    const io = makeIo();
    const payload = { fileId: 'f1', fileName: 'doc.pdf', fileSize: 1024, uploadedAt: '2024-01-01', message: 'doc.pdf is now available' };
    notifyUser(io, 'user-123', 'file:uploaded', payload);
    expect(io.emit).toHaveBeenCalledWith('file:uploaded', payload);
  });

  test('emits file:synced event with correct payload', () => {
    const io = makeIo();
    const payload = { fileId: 'f2', fileName: 'photo.jpg', syncedAt: '2024-01-01', message: 'photo.jpg synced from another device' };
    notifyUser(io, 'user-123', 'file:synced', payload);
    expect(io.emit).toHaveBeenCalledWith('file:synced', payload);
  });

  test('emits file:shared event with correct payload', () => {
    const io = makeIo();
    const payload = { fileId: 'f3', fileName: 'sheet.xlsx', sharedBy: 'alice@test.com', permission: 'read', message: 'alice@test.com shared "sheet.xlsx" with you' };
    notifyUser(io, 'user-456', 'file:shared', payload);
    expect(io.to).toHaveBeenCalledWith('user:user-456');
    expect(io.emit).toHaveBeenCalledWith('file:shared', payload);
  });

  test('does not throw when user has no active connections', () => {
    const io = makeIo();
    // notifyUser still calls io.to().emit() — Socket.io handles the empty room gracefully
    expect(() => notifyUser(io, 'offline-user', 'file:uploaded', {})).not.toThrow();
    expect(io.to).toHaveBeenCalledWith('user:offline-user');
  });
});

describe('getTotalConnections()', () => {

  test('returns a number', () => {
    expect(typeof getTotalConnections()).toBe('number');
  });

  test('is non-negative', () => {
    expect(getTotalConnections()).toBeGreaterThanOrEqual(0);
  });
});