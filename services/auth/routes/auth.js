const express      = require('express');
const rateLimit    = require('express-rate-limit');
const authenticate = require('../middleware/authenticate');
const {
  signup,
  login,
  refresh,
  logout,
  me,
} = require('../controllers/authController');

const router = express.Router();



// Strict limit on login/signup to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
});


router.post('/signup',  authLimiter, signup);
router.post('/login',   authLimiter, login);
router.post('/refresh', refresh);
router.post('/logout',  logout);


router.get('/me', authenticate, me);

module.exports = router;