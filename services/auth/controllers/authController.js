const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const db      = require('../shared/db');

const ACCESS_SECRET   = process.env.JWT_SECRET;
const ACCESS_EXPIRES  = process.env.JWT_ACCESS_EXPIRES_IN  || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '30d';



const generateAccessToken = (userId, email) =>
  jwt.sign({ userId, email }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });

const generateRefreshToken = () =>
  crypto.randomBytes(64).toString('hex');

const hashRefreshToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const getRefreshExpiryDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
};


const signup = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const existing = await db.query(
      'SELECT user_id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await db.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING user_id, email, storage_quota, created_at`,
      [email.toLowerCase(), passwordHash]
    );
    const user = result.rows[0];

    const accessToken  = generateAccessToken(user.user_id, user.email);
    const refreshToken = generateRefreshToken();

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.user_id, hashRefreshToken(refreshToken), getRefreshExpiryDate()]
    );

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        userId:       user.user_id,
        email:        user.email,
        storageQuota: user.storage_quota,
        createdAt:    user.created_at,
      },
      tokens: { accessToken, refreshToken },
    });
  } catch (err) {
    next(err);
  }
};


const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const result = await db.query(
      'SELECT user_id, email, password_hash, storage_used, storage_quota FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Invalid email or password' });

    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Invalid email or password' });

    const accessToken  = generateAccessToken(user.user_id, user.email);
    const refreshToken = generateRefreshToken();

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.user_id, hashRefreshToken(refreshToken), getRefreshExpiryDate()]
    );

    res.json({
      message: 'Login successful',
      user: {
        userId:       user.user_id,
        email:        user.email,
        storageUsed:  user.storage_used,
        storageQuota: user.storage_quota,
      },
      tokens: { accessToken, refreshToken },
    });
  } catch (err) {
    next(err);
  }
};


const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken)
      return res.status(400).json({ error: 'Refresh token is required' });

    const tokenHash = hashRefreshToken(refreshToken);

    const result = await db.query(
      `SELECT rt.token_id, rt.user_id, rt.expires_at, u.email
       FROM refresh_tokens rt
       JOIN users u ON u.user_id = rt.user_id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Invalid refresh token' });

    const stored = result.rows[0];

    if (new Date() > new Date(stored.expires_at))
      return res.status(401).json({ error: 'Refresh token expired — please log in again' });

    await db.query('DELETE FROM refresh_tokens WHERE token_id = $1', [stored.token_id]);

    const newAccessToken  = generateAccessToken(stored.user_id, stored.email);
    const newRefreshToken = generateRefreshToken();

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [stored.user_id, hashRefreshToken(newRefreshToken), getRefreshExpiryDate()]
    );

    res.json({
      tokens: {
        accessToken:  newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
};


const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken)
      return res.status(400).json({ error: 'Refresh token is required' });

    await db.query(
      'DELETE FROM refresh_tokens WHERE token_hash = $1',
      [hashRefreshToken(refreshToken)]
    );

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};


const me = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT user_id, email, storage_used, storage_quota, created_at FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    const user = result.rows[0];
    res.json({
      userId:       user.user_id,
      email:        user.email,
      storageUsed:  user.storage_used,
      storageQuota: user.storage_quota,
      createdAt:    user.created_at,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { signup, login, refresh, logout, me };