const crypto  = require('crypto');
const db      = require('../shared/db');
const redis   = require('../shared/db/redis');
const storage = require('../shared/storage');
const mq      = require('../shared/rabbitmq');

const CHUNK_SIZE = (parseInt(process.env.CHUNK_SIZE_MB, 10) || 4) * 1024 * 1024; 
const SIGNED_URL_EXPIRY = parseInt(process.env.SIGNED_URL_EXPIRY_SECONDS, 10) || 900;



const hashBuffer = (buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

const sessionKey   = (sessionId) => `upload:session:${sessionId}`;
const progressKey  = (sessionId) => `upload:progress:${sessionId}`;
const SESSION_TTL  = 60 * 60 * 3; // 3 hours


// Client sends: { fileName, fileSize, mimeType, folderPath? }
// Server returns: { sessionId, chunkSize, totalChunks }
const initUpload = async (req, res, next) => {
  try {
    const { fileName, fileSize, mimeType, folderPath = '/' } = req.body;

    if (!fileName || !fileSize || !mimeType)
      return res.status(400).json({ error: 'fileName, fileSize, and mimeType are required' });

    if (fileSize <= 0)
      return res.status(400).json({ error: 'fileSize must be greater than 0' });

    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const sessionId   = crypto.randomUUID();

    // Store session info in Redis
    const session = {
      sessionId,
      userId:      req.user.userId,
      fileName,
      fileSize,
      mimeType,
      folderPath,
      totalChunks,
      chunkSize:   CHUNK_SIZE,
      uploadedChunks: [],  
      createdAt:   Date.now(),
    };

    await redis.setex(sessionKey(sessionId), SESSION_TTL, JSON.stringify(session));
    await redis.setex(progressKey(sessionId), SESSION_TTL, '0');

    res.status(201).json({
      sessionId,
      chunkSize:   CHUNK_SIZE,
      totalChunks,
      message:     `Ready to receive ${totalChunks} chunk(s)`,
    });
  } catch (err) {
    next(err);
  }
};


// Client sends: multipart form with fields: sessionId, chunkIndex + file buffer
const uploadChunk = async (req, res, next) => {
  try {
    const { sessionId, chunkIndex } = req.body;

    if (!sessionId || chunkIndex === undefined)
      return res.status(400).json({ error: 'sessionId and chunkIndex are required' });

    if (!req.file)
      return res.status(400).json({ error: 'Chunk file is required' });

   
    const raw = await redis.get(sessionKey(sessionId));
    if (!raw)
      return res.status(404).json({ error: 'Upload session not found or expired' });

    const session = JSON.parse(raw);

   
    if (session.userId !== req.user.userId)
      return res.status(403).json({ error: 'Forbidden' });

    const index = parseInt(chunkIndex, 10);
    if (index < 0 || index >= session.totalChunks)
      return res.status(400).json({ error: `chunkIndex must be between 0 and ${session.totalChunks - 1}` });

  
    const chunkBuffer = req.file.buffer;
    const chunkHash   = hashBuffer(chunkBuffer);
    const objectName  = `chunks/${chunkHash}`; 

  
    const alreadyExists = await storage.exists(objectName);

    if (!alreadyExists) {
      await storage.uploadChunk(objectName, chunkBuffer, chunkBuffer.length);
    }

   
    let chunkRow = await db.query(
      'SELECT chunk_id FROM chunks WHERE hash = $1',
      [chunkHash]
    );

    if (chunkRow.rows.length === 0) {
      chunkRow = await db.query(
        `INSERT INTO chunks (hash, size, storage_path)
         VALUES ($1, $2, $3)
         RETURNING chunk_id`,
        [chunkHash, chunkBuffer.length, objectName]
      );
    }

    const chunkId = chunkRow.rows[0].chunk_id;

   
    session.uploadedChunks[index] = chunkId;
    await redis.setex(sessionKey(sessionId), SESSION_TTL, JSON.stringify(session));

    
    const uploaded = session.uploadedChunks.filter(Boolean).length;
    await redis.setex(progressKey(sessionId), SESSION_TTL, String(uploaded));

    res.json({
      chunkIndex: index,
      chunkId,
      deduped:    alreadyExists,
      uploaded,
      total:      session.totalChunks,
    });
  } catch (err) {
    next(err);
  }
};



const completeUpload = async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId)
      return res.status(400).json({ error: 'sessionId is required' });

    const raw = await redis.get(sessionKey(sessionId));
    if (!raw)
      return res.status(404).json({ error: 'Upload session not found or expired' });

    const session = JSON.parse(raw);

    if (session.userId !== req.user.userId)
      return res.status(403).json({ error: 'Forbidden' });

   
    const uploadedCount = session.uploadedChunks.filter(Boolean).length;
    if (uploadedCount !== session.totalChunks)
      return res.status(400).json({
        error: `Upload incomplete — ${uploadedCount}/${session.totalChunks} chunks received`,
      });

    const chunkIds = session.uploadedChunks; 

   
    const client = await db.getClient();
    let file;
    try {
      await client.query('BEGIN');

      
      const fileResult = await client.query(
        `INSERT INTO files (user_id, name, folder_path, size, mime_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING file_id, name, folder_path, size, mime_type, created_at`,
        [session.userId, session.fileName, session.folderPath, session.fileSize, session.mimeType]
      );
      file = fileResult.rows[0];

     
      await client.query(
        `INSERT INTO file_versions (file_id, version_num, chunk_ids, size)
         VALUES ($1, 1, $2, $3)`,
        [file.file_id, chunkIds, session.fileSize]
      );

    
      await client.query(
        'UPDATE users SET storage_used = storage_used + $1 WHERE user_id = $2',
        [session.fileSize, session.userId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

   
    await redis.del(sessionKey(sessionId));
    await redis.del(progressKey(sessionId));

   
    mq.publish(mq.QUEUES.FILE_UPLOADED, {
      fileId:   file.file_id,
      userId:   session.userId,
      fileName: session.fileName,
      fileSize: session.fileSize,
      uploadedAt: new Date().toISOString(),
    });

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        fileId:     file.file_id,
        name:       file.name,
        folderPath: file.folder_path,
        size:       file.size,
        mimeType:   file.mime_type,
        createdAt:  file.created_at,
        version:    1,
      },
    });
  } catch (err) {
    next(err);
  }
};


const uploadStatus = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const raw = await redis.get(sessionKey(sessionId));
    if (!raw)
      return res.status(404).json({ error: 'Session not found or expired' });

    const session = JSON.parse(raw);

    if (session.userId !== req.user.userId)
      return res.status(403).json({ error: 'Forbidden' });

    const uploaded = session.uploadedChunks.filter(Boolean).length;

    res.json({
      sessionId,
      fileName:   session.fileName,
      fileSize:   session.fileSize,
      totalChunks: session.totalChunks,
      uploaded,
      percent:    Math.round((uploaded / session.totalChunks) * 100),
      complete:   uploaded === session.totalChunks,
    });
  } catch (err) {
    next(err);
  }
};


const downloadFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;

   
    const fileResult = await db.query(
      'SELECT * FROM files WHERE file_id = $1 AND user_id = $2 AND is_deleted = FALSE',
      [fileId, req.user.userId]
    );

    if (fileResult.rows.length === 0)
      return res.status(404).json({ error: 'File not found' });

    const file = fileResult.rows[0];

    
    const versionResult = await db.query(
      `SELECT chunk_ids FROM file_versions
       WHERE file_id = $1
       ORDER BY version_num DESC
       LIMIT 1`,
      [fileId]
    );

    if (versionResult.rows.length === 0)
      return res.status(404).json({ error: 'No version found for this file' });

    const chunkIds = versionResult.rows[0].chunk_ids;

   
    const placeholders = chunkIds.map((_, i) => `$${i + 1}`).join(', ');
    const chunksResult = await db.query(
      `SELECT chunk_id, hash, size, storage_path FROM chunks WHERE chunk_id IN (${placeholders})`,
      chunkIds
    );

  
    const chunkMap = {};
    chunksResult.rows.forEach(c => { chunkMap[c.chunk_id] = c; });

    
    const chunks = await Promise.all(
      chunkIds.map(async (id, index) => {
        const chunk = chunkMap[id];
        const signedUrl = await storage.getSignedUrl(chunk.storage_path, SIGNED_URL_EXPIRY);
        return { index, chunkId: id, size: chunk.size, url: signedUrl };
      })
    );

    res.json({
      file: {
        fileId:   file.file_id,
        name:     file.name,
        size:     file.size,
        mimeType: file.mime_type,
      },
      chunks,
      expiresInSeconds: SIGNED_URL_EXPIRY,
      instructions: 'Download chunks in order by index and reassemble into the original file',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { initUpload, uploadChunk, completeUpload, uploadStatus, downloadFile };