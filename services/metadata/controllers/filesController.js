const db    = require('../shared/db');
const redis = require('../shared/db/redis');

const CACHE_TTL = 60;

const listFiles = async (req, res, next) => {
  try {
    const { folderPath = '/', page = 1, limit = 20 } = req.query;
    const userId = req.user.userId;

    const parsedLimit  = Math.min(parseInt(limit, 10) || 20, 100);
    const parsedOffset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * parsedLimit;

    const cacheKey = `files:${userId}:${folderPath}:${page}:${limit}`;
    const cached   = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const result = await db.query(
      `SELECT
         file_id, name, folder_path, size, mime_type, created_at, updated_at
       FROM files
       WHERE user_id = $1
         AND folder_path = $2
         AND is_deleted = FALSE
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, folderPath, parsedLimit, parsedOffset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) FROM files
       WHERE user_id = $1 AND folder_path = $2 AND is_deleted = FALSE`,
      [userId, folderPath]
    );

    const response = {
      files:      result.rows,
      total:      parseInt(countResult.rows[0].count, 10),
      page:       parseInt(page, 10),
      limit:      parsedLimit,
      folderPath,
    };

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(response));

    res.json(response);
  } catch (err) {
    next(err);
  }
};


const getFile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId  = req.user.userId;

    const cacheKey = `file:${id}`;
    const cached   = await redis.get(cacheKey);
    if (cached) {
      const file = JSON.parse(cached);
      if (file.user_id !== userId)
        return res.status(403).json({ error: 'Forbidden' });
      return res.json(file);
    }

    const result = await db.query(
      `SELECT file_id, user_id, name, folder_path, size, mime_type, is_deleted, created_at, updated_at
       FROM files
       WHERE file_id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'File not found' });

    const file = result.rows[0];

    if (file.user_id !== userId)
      return res.status(403).json({ error: 'Forbidden' });

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(file));

    res.json(file);
  } catch (err) {
    next(err);
  }
};


const deleteFile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId  = req.user.userId;

    const result = await db.query(
      `UPDATE files
       SET is_deleted = TRUE, updated_at = NOW()
       WHERE file_id = $1 AND user_id = $2 AND is_deleted = FALSE
       RETURNING file_id, size`,
      [id, userId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'File not found or already deleted' });


    await db.query(
      'UPDATE users SET storage_used = storage_used - $1 WHERE user_id = $2',
      [result.rows[0].size, userId]
    );

   
    await redis.del(`file:${id}`);

    res.json({ message: 'File deleted', fileId: id });
  } catch (err) {
    next(err);
  }
};


const listVersions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId  = req.user.userId;

    
    const fileResult = await db.query(
      'SELECT file_id FROM files WHERE file_id = $1 AND user_id = $2 AND is_deleted = FALSE',
      [id, userId]
    );
    if (fileResult.rows.length === 0)
      return res.status(404).json({ error: 'File not found' });

    const result = await db.query(
      `SELECT version_id, version_num, size, created_at
       FROM file_versions
       WHERE file_id = $1
       ORDER BY version_num DESC`,
      [id]
    );

    res.json({
      fileId:   id,
      versions: result.rows,
      total:    result.rows.length,
    });
  } catch (err) {
    next(err);
  }
};


const restoreVersion = async (req, res, next) => {
  try {
    const { id, versionId } = req.params;
    const userId = req.user.userId;

   
    const fileResult = await db.query(
      'SELECT file_id, size FROM files WHERE file_id = $1 AND user_id = $2 AND is_deleted = FALSE',
      [id, userId]
    );
    if (fileResult.rows.length === 0)
      return res.status(404).json({ error: 'File not found' });

  
    const versionResult = await db.query(
      'SELECT * FROM file_versions WHERE version_id = $1 AND file_id = $2',
      [versionId, id]
    );
    if (versionResult.rows.length === 0)
      return res.status(404).json({ error: 'Version not found' });

    const versionToRestore = versionResult.rows[0];

    
    const maxVersionResult = await db.query(
      'SELECT MAX(version_num) as max_version FROM file_versions WHERE file_id = $1',
      [id]
    );
    const newVersionNum = maxVersionResult.rows[0].max_version + 1;

    const dbClient = await db.getClient();
    try {
      await dbClient.query('BEGIN');

    
      await dbClient.query(
        `INSERT INTO file_versions (file_id, version_num, chunk_ids, size)
         VALUES ($1, $2, $3, $4)`,
        [id, newVersionNum, versionToRestore.chunk_ids, versionToRestore.size]
      );

      
      await dbClient.query(
        `UPDATE files SET size = $1, updated_at = NOW() WHERE file_id = $2`,
        [versionToRestore.size, id]
      );

      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }


    await redis.del(`file:${id}`);

    res.json({
      message:        'Version restored successfully',
      fileId:         id,
      restoredFrom:   versionId,
      newVersionNum,
    });
  } catch (err) {
    next(err);
  }
};


const searchFiles = async (req, res, next) => {
  try {
    const { q } = req.query;
    const userId = req.user.userId;

    if (!q || q.trim().length < 1)
      return res.status(400).json({ error: 'Search query is required' });

    const result = await db.query(
      `SELECT file_id, name, folder_path, size, mime_type, created_at
       FROM files
       WHERE user_id = $1
         AND is_deleted = FALSE
         AND name ILIKE $2
       ORDER BY updated_at DESC
       LIMIT 50`,
      [userId, `%${q.trim()}%`]
    );

    res.json({
      query:   q,
      results: result.rows,
      total:   result.rows.length,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { listFiles, getFile, deleteFile, listVersions, restoreVersion, searchFiles };