const db = require('../shared/db');
const mq = require('../shared/rabbitmq');


const createShareLink = async (req, res, next) => {
  try {
    const { fileId, permission = 'read', expiresInDays } = req.body;
    const userId = req.user.userId;

    if (!fileId)
      return res.status(400).json({ error: 'fileId is required' });

    if (!['read', 'write'].includes(permission))
      return res.status(400).json({ error: 'permission must be read or write' });

    // Verify the file exists and belongs to this user
    const fileResult = await db.query(
      'SELECT file_id, name FROM files WHERE file_id = $1 AND user_id = $2 AND is_deleted = FALSE',
      [fileId, userId]
    );
    if (fileResult.rows.length === 0)
      return res.status(404).json({ error: 'File not found' });

    const file = fileResult.rows[0];

    // Calculate expiry
    let expiresAt = null;
    if (expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays, 10));
    }

    const result = await db.query(
      `INSERT INTO shared_links (file_id, created_by, permission, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING link_id, file_id, permission, expires_at, created_at`,
      [fileId, userId, permission, expiresAt]
    );

    const link = result.rows[0];

   
    mq.publish(mq.QUEUES.FILE_SHARED, {
      fileId:          file.file_id,
      fileName:        file.name,
      sharedByUserId:  userId,
      sharedByEmail:   req.user.email,
      linkId:          link.link_id,
      permission:      link.permission,
      sharedAt:        new Date().toISOString(),
    });

    res.status(201).json({
      message:   'Share link created',
      link: {
        linkId:     link.link_id,
        fileId:     link.file_id,
        permission: link.permission,
        expiresAt:  link.expires_at,
        createdAt:  link.created_at,
        url:        `http://localhost:3005/share/${link.link_id}`,
      },
    });
  } catch (err) {
    next(err);
  }
};

const accessShareLink = async (req, res, next) => {
  try {
    const { linkId } = req.params;

    const result = await db.query(
      `SELECT
         sl.link_id, sl.file_id, sl.permission, sl.expires_at, sl.created_at,
         f.name, f.size, f.mime_type, f.folder_path,
         u.email AS owner_email
       FROM shared_links sl
       JOIN files f ON f.file_id = sl.file_id
       JOIN users u ON u.user_id = sl.created_by
       WHERE sl.link_id = $1 AND f.is_deleted = FALSE`,
      [linkId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Share link not found' });

    const link = result.rows[0];

    // Check expiry
    if (link.expires_at && new Date() > new Date(link.expires_at))
      return res.status(410).json({ error: 'Share link has expired' });

    res.json({
      linkId:     link.link_id,
      permission: link.permission,
      expiresAt:  link.expires_at,
      file: {
        fileId:     link.file_id,
        name:       link.name,
        size:       link.size,
        mimeType:   link.mime_type,
        folderPath: link.folder_path,
        ownerEmail: link.owner_email,
      },
    });
  } catch (err) {
    next(err);
  }
};


const revokeShareLink = async (req, res, next) => {
  try {
    const { linkId } = req.params;
    const userId = req.user.userId;

    const result = await db.query(
      `DELETE FROM shared_links
       WHERE link_id = $1 AND created_by = $2
       RETURNING link_id`,
      [linkId, userId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Share link not found or not yours to revoke' });

    res.json({ message: 'Share link revoked', linkId });
  } catch (err) {
    next(err);
  }
};


const myShareLinks = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT
         sl.link_id, sl.file_id, sl.permission, sl.expires_at, sl.created_at,
         f.name AS file_name, f.size, f.mime_type
       FROM shared_links sl
       JOIN files f ON f.file_id = sl.file_id
       WHERE sl.created_by = $1 AND f.is_deleted = FALSE
       ORDER BY sl.created_at DESC`,
      [userId]
    );

    res.json({
      links: result.rows.map(link => ({
        linkId:     link.link_id,
        fileId:     link.file_id,
        fileName:   link.file_name,
        size:       link.size,
        mimeType:   link.mime_type,
        permission: link.permission,
        expiresAt:  link.expires_at,
        createdAt:  link.created_at,
        url:        `http://localhost:3005/share/${link.link_id}`,
      })),
      total: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { createShareLink, accessShareLink, revokeShareLink, myShareLinks };