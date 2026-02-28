const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ error: 'Authorization header missing or malformed' });

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      userId: decoded.userId,
      email:  decoded.email,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Access token expired' });
    if (err.name === 'JsonWebTokenError')
      return res.status(401).json({ error: 'Invalid access token' });
    next(err);
  }
};

module.exports = authenticate;