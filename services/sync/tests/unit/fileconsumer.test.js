'use strict';

jest.mock('../shared/rabbitmq', () => ({
  connect:  jest.fn().mockResolvedValue(undefined),
  consume:  jest.fn(),
  publish:  jest.fn(),
  QUEUES: {
    FILE_UPLOADED: 'file.uploaded',
    FILE_SYNCED:   'file.synced',
    FILE_SHARED:   'file.shared',
  },
}));

jest.mock('../../socket/syncHandler', () => ({
  notifyUser: jest.fn(),
}));

const mq            = require('../shared/rabbitmq');
const { notifyUser} = require('../../socket/syncHandler');
const { startConsumers } = require('../../consumer/fileConsumer');

// ── Helper: capture the consumer callback registered for a queue ──
// mq.consume is called as: mq.consume(QUEUE_NAME, async (payload) => {...})
// We grab the callback and call it directly to test its logic.
const getConsumerFor = (queueName) => {
  const call = mq.consume.mock.calls.find(([q]) => q === queueName);
  if (!call) throw new Error(`No consumer registered for queue: ${queueName}`);
  return call[1]; // the async callback
};

// Fake io instance
const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════
// startConsumers — wiring
// ═══════════════════════════════════════════════════════════════
describe('startConsumers()', () => {

  test('registers a consumer for each queue', async () => {
    await startConsumers(mockIo);
    const registeredQueues = mq.consume.mock.calls.map(([q]) => q);
    expect(registeredQueues).toContain('file.uploaded');
    expect(registeredQueues).toContain('file.synced');
    expect(registeredQueues).toContain('file.shared');
  });

  test('registers exactly 3 consumers', async () => {
    await startConsumers(mockIo);
    expect(mq.consume).toHaveBeenCalledTimes(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// file.uploaded consumer
// ═══════════════════════════════════════════════════════════════
describe('file.uploaded consumer', () => {

  beforeEach(async () => { await startConsumers(mockIo); });

  test('calls notifyUser with file:uploaded event', async () => {
    const consumer = getConsumerFor('file.uploaded');
    const payload = {
      fileId: 'f1', userId: 'user-123', fileName: 'photo.jpg',
      fileSize: 204800, uploadedAt: '2024-01-01T00:00:00.000Z',
    };
    await consumer(payload);

    expect(notifyUser).toHaveBeenCalledWith(
      mockIo,
      'user-123',
      'file:uploaded',
      expect.objectContaining({
        fileId:     'f1',
        fileName:   'photo.jpg',
        fileSize:   204800,
        uploadedAt: '2024-01-01T00:00:00.000Z',
        message:    'photo.jpg is now available',
      })
    );
  });

  test('notifies the correct userId', async () => {
    const consumer = getConsumerFor('file.uploaded');
    await consumer({ fileId: 'f1', userId: 'specific-user', fileName: 'x.png', fileSize: 100, uploadedAt: new Date().toISOString() });
    expect(notifyUser.mock.calls[0][1]).toBe('specific-user');
  });

  test('message includes the file name', async () => {
    const consumer = getConsumerFor('file.uploaded');
    await consumer({ fileId: 'f1', userId: 'u1', fileName: 'report.pdf', fileSize: 1024, uploadedAt: new Date().toISOString() });
    const sentPayload = notifyUser.mock.calls[0][3];
    expect(sentPayload.message).toContain('report.pdf');
  });
});

// ═══════════════════════════════════════════════════════════════
// file.synced consumer
// ═══════════════════════════════════════════════════════════════
describe('file.synced consumer', () => {

  beforeEach(async () => { await startConsumers(mockIo); });

  test('calls notifyUser with file:synced event', async () => {
    const consumer = getConsumerFor('file.synced');
    const payload = {
      fileId: 'f2', userId: 'user-456', fileName: 'notes.txt',
      syncedAt: '2024-06-01T10:00:00.000Z',
    };
    await consumer(payload);

    expect(notifyUser).toHaveBeenCalledWith(
      mockIo,
      'user-456',
      'file:synced',
      expect.objectContaining({
        fileId:   'f2',
        fileName: 'notes.txt',
        syncedAt: '2024-06-01T10:00:00.000Z',
        message:  'notes.txt synced from another device',
      })
    );
  });

  test('message says "synced from another device"', async () => {
    const consumer = getConsumerFor('file.synced');
    await consumer({ fileId: 'f2', userId: 'u1', fileName: 'backup.zip', syncedAt: new Date().toISOString() });
    const sentPayload = notifyUser.mock.calls[0][3];
    expect(sentPayload.message).toContain('synced from another device');
  });
});

// ═══════════════════════════════════════════════════════════════
// file.shared consumer
// ═══════════════════════════════════════════════════════════════
describe('file.shared consumer', () => {

  beforeEach(async () => { await startConsumers(mockIo); });

  test('calls notifyUser with file:shared event', async () => {
    const consumer = getConsumerFor('file.shared');
    const payload = {
      fileId: 'f3', fileName: 'budget.xlsx',
      sharedWithUserId: 'user-789', sharedByEmail: 'alice@test.com',
      permission: 'read',
    };
    await consumer(payload);

    expect(notifyUser).toHaveBeenCalledWith(
      mockIo,
      'user-789',
      'file:shared',
      expect.objectContaining({
        fileId:     'f3',
        fileName:   'budget.xlsx',
        sharedBy:   'alice@test.com',
        permission: 'read',
        message:    'alice@test.com shared "budget.xlsx" with you',
      })
    );
  });

  test('notifies sharedWithUserId not sharedByUserId', async () => {
    const consumer = getConsumerFor('file.shared');
    await consumer({
      fileId: 'f3', fileName: 'doc.pdf',
      sharedWithUserId: 'recipient-user',
      sharedByEmail: 'sender@test.com',
      permission: 'read',
    });
    // Second arg to notifyUser is the target userId
    expect(notifyUser.mock.calls[0][1]).toBe('recipient-user');
  });

  test('message includes sharedBy email and file name', async () => {
    const consumer = getConsumerFor('file.shared');
    await consumer({
      fileId: 'f3', fileName: 'design.fig',
      sharedWithUserId: 'u789', sharedByEmail: 'bob@test.com', permission: 'write',
    });
    const sentPayload = notifyUser.mock.calls[0][3];
    expect(sentPayload.message).toContain('bob@test.com');
    expect(sentPayload.message).toContain('design.fig');
  });

  test('passes permission to the notification payload', async () => {
    const consumer = getConsumerFor('file.shared');
    await consumer({
      fileId: 'f3', fileName: 'x.pdf', sharedWithUserId: 'u1',
      sharedByEmail: 'c@c.com', permission: 'write',
    });
    expect(notifyUser.mock.calls[0][3].permission).toBe('write');
  });
});