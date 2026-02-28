const mq                 = require('../shared/rabbitmq');
const { notifyUser }     = require('../socket/syncHandler');


const startConsumers = async (io) => {

  
  await mq.consume(mq.QUEUES.FILE_UPLOADED, async (payload) => {
    console.log('[sync] file.uploaded received:', payload.fileName);

    notifyUser(io, payload.userId, 'file:uploaded', {
      fileId:     payload.fileId,
      fileName:   payload.fileName,
      fileSize:   payload.fileSize,
      uploadedAt: payload.uploadedAt,
      message:    `${payload.fileName} is now available`,
    });
  });

  
  await mq.consume(mq.QUEUES.FILE_SYNCED, async (payload) => {
    console.log('[sync] file.synced received:', payload.fileName);

    notifyUser(io, payload.userId, 'file:synced', {
      fileId:   payload.fileId,
      fileName: payload.fileName,
      syncedAt: payload.syncedAt,
      message:  `${payload.fileName} synced from another device`,
    });
  });

  
  await mq.consume(mq.QUEUES.FILE_SHARED, async (payload) => {
    console.log('[sync] file.shared received:', payload.fileName);


    notifyUser(io, payload.sharedWithUserId, 'file:shared', {
      fileId:      payload.fileId,
      fileName:    payload.fileName,
      sharedBy:    payload.sharedByEmail,
      permission:  payload.permission,
      message:     `${payload.sharedByEmail} shared "${payload.fileName}" with you`,
    });
  });

  console.log('[sync] All consumers started');
};

module.exports = { startConsumers };