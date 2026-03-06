'use strict';

/**
 * Integration tests — sync-service
 * Socket.io is attached to http.Server, not express app.
 * We must use the exported `server` (http.Server) for socket clients
 * and supertest, NOT `app` directly.
 */

jest.mock('./shared/rabbitmq', () => ({
  connect:  jest.fn().mockResolvedValue(undefined),
  consume:  jest.fn().mockResolvedValue(undefined),
  publish:  jest.fn(),
  QUEUES: {
    FILE_UPLOADED: 'file.uploaded',
    FILE_SYNCED:   'file.synced',
    FILE_SHARED:   'file.shared',
  },
}));
jest.mock('prom-client', () => ({
  collectDefaultMetrics: jest.fn(),
  register: { contentType: 'text/plain', metrics: jest.fn().mockResolvedValue('') },
  Counter:   jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
  Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn() })),
  Gauge:     jest.fn().mockImplementation(() => ({ set: jest.fn(), inc: jest.fn() })),
}));

const request  = require('supertest');
const jwt      = require('jsonwebtoken');
const { io: ioClient } = require('socket.io-client');

// index.js exports { app, io } — app is Express, io is Socket.io Server
// The http.Server wrapping app is what socket.io is bound to.
// We must start our OWN http server from app for tests so we control the port.
const http       = require('http');
const { app, io } = require('../../index');
const { notifyUser } = require('../../socket/syncHandler');

const SECRET    = 'sync-test-secret';
const makeToken = (userId = 'user-123', email = 'test@test.com') =>
  jwt.sign({ userId, email }, SECRET, { expiresIn: '15m' });

// We create a NEW http server and attach the same io instance to it
// so socket clients and HTTP requests use the same port
let testServer;
let serverPort;

beforeAll((done) => {
  testServer = http.createServer(app);
  // Attach the SAME io instance to our test server
  io.attach(testServer);
  testServer.listen(0, () => {
    serverPort = testServer.address().port;
    done();
  });
});

afterAll((done) => {
  io.close();
  testServer.close(done);
});

beforeEach(() => jest.clearAllMocks());

// ── Helper: connect socket client and wait for event ──────────
const connectClient = (token, waitEvent = 'connected') =>
  new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${serverPort}`, {
      auth: { token },
      transports: ['websocket'], // skip polling — faster and avoids xhr poll errors
      reconnection: false,
    });
    const timer = setTimeout(() => {
      client.disconnect();
      reject(new Error(`Timeout waiting for "${waitEvent}"`));
    }, 5000);
    client.once(waitEvent, (data) => {
      clearTimeout(timer);
      resolve({ client, data });
    });
    client.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

// ═══════════════════════════════════════════════════════════════
// HTTP — Health
// ═══════════════════════════════════════════════════════════════
describe('GET /health', () => {

  test('200 — returns ok', async () => {
    const res = await request(testServer).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('sync');
    expect(res.body).toHaveProperty('connections');
  });
});

// ═══════════════════════════════════════════════════════════════
// HTTP — 404
// ═══════════════════════════════════════════════════════════════
describe('Unknown HTTP routes', () => {

  test('404 — unknown path', async () => {
    const res = await request(testServer).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

// ═══════════════════════════════════════════════════════════════
// Socket.io — Auth
// ═══════════════════════════════════════════════════════════════
describe('Socket.io auth', () => {

  test('rejects connection with no token', (done) => {
    const client = ioClient(`http://localhost:${serverPort}`, {
      auth: {},
      transports: ['websocket'],
      reconnection: false,
    });
    client.once('connect_error', (err) => {
      expect(err.message).toMatch(/Authentication token required/);
      client.disconnect();
      done();
    });
  });

  test('rejects connection with invalid token', (done) => {
    const client = ioClient(`http://localhost:${serverPort}`, {
      auth: { token: 'totally.invalid.token' },
      transports: ['websocket'],
      reconnection: false,
    });
    client.once('connect_error', (err) => {
      expect(err.message).toMatch(/Invalid or expired token/);
      client.disconnect();
      done();
    });
  });

  test('accepts connection with valid JWT', async () => {
    const token = makeToken('user-connect');
    const { client, data } = await connectClient(token);
    expect(data.message).toBe('Sync service connected');
    expect(data.userId).toBe('user-connect');
    client.disconnect();
  });
});

// ═══════════════════════════════════════════════════════════════
// Socket.io — Connection events
// ═══════════════════════════════════════════════════════════════
describe('Socket.io connection events', () => {

  test('client receives connected event with socketId', async () => {
    const token = makeToken('user-evt');
    const { client, data } = await connectClient(token);
    expect(data.socketId).toBeDefined();
    expect(typeof data.socketId).toBe('string');
    client.disconnect();
  });

  test('client receives sync:ack when sending sync:request', (done) => {
    const token = makeToken('user-ack-int');
    connectClient(token).then(({ client }) => {
      client.once('sync:ack', (data) => {
        expect(data.received).toBe(true);
        expect(data.timestamp).toBeDefined();
        client.disconnect();
        done();
      });
      client.emit('sync:request', { type: 'full' });
    }).catch(done);
  });
});

// ═══════════════════════════════════════════════════════════════
// Socket.io — Server-side event emission
// ═══════════════════════════════════════════════════════════════
describe('Server pushes events to clients via notifyUser', () => {

  test('client receives file:uploaded event', (done) => {
    const token = makeToken('user-push-1');
    connectClient(token).then(({ client }) => {
      client.once('file:uploaded', (data) => {
        expect(data.fileName).toBe('test.pdf');
        expect(data.message).toContain('test.pdf');
        client.disconnect();
        done();
      });
      notifyUser(io, 'user-push-1', 'file:uploaded', {
        fileId: 'f1', fileName: 'test.pdf', fileSize: 1024,
        uploadedAt: new Date().toISOString(),
        message: 'test.pdf is now available',
      });
    }).catch(done);
  });

  test('client receives file:synced event', (done) => {
    const token = makeToken('user-push-2');
    connectClient(token).then(({ client }) => {
      client.once('file:synced', (data) => {
        expect(data.fileName).toBe('backup.zip');
        expect(data.message).toContain('synced from another device');
        client.disconnect();
        done();
      });
      notifyUser(io, 'user-push-2', 'file:synced', {
        fileId: 'f2', fileName: 'backup.zip',
        syncedAt: new Date().toISOString(),
        message: 'backup.zip synced from another device',
      });
    }).catch(done);
  });

  test('client receives file:shared event', (done) => {
    const token = makeToken('user-push-3');
    connectClient(token).then(({ client }) => {
      client.once('file:shared', (data) => {
        expect(data.sharedBy).toBe('alice@test.com');
        expect(data.permission).toBe('read');
        client.disconnect();
        done();
      });
      notifyUser(io, 'user-push-3', 'file:shared', {
        fileId: 'f3', fileName: 'doc.pdf',
        sharedBy: 'alice@test.com', permission: 'read',
        message: 'alice@test.com shared "doc.pdf" with you',
      });
    }).catch(done);
  });

  test('event only received by target user — not other connected users', (done) => {
    const token1 = makeToken('user-iso-A');
    const token2 = makeToken('user-iso-B');

    Promise.all([connectClient(token1), connectClient(token2)]).then(([c1, c2]) => {
      let wrongUserReceived = false;
      c2.client.once('file:uploaded', () => { wrongUserReceived = true; });

      c1.client.once('file:uploaded', (data) => {
        // Small delay to ensure user2 didn't receive it
        setTimeout(() => {
          expect(data.fileName).toBe('private.txt');
          expect(wrongUserReceived).toBe(false);
          c1.client.disconnect();
          c2.client.disconnect();
          done();
        }, 200);
      });

      notifyUser(io, 'user-iso-A', 'file:uploaded', {
        fileId: 'f4', fileName: 'private.txt', fileSize: 512,
        uploadedAt: new Date().toISOString(),
        message: 'private.txt is now available',
      });
    }).catch(done);
  });
});