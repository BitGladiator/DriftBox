const express      = require('express');
const multer       = require('multer');
const authenticate = require('../middleware/authenticate');
const {
  initUpload,
  uploadChunk,
  completeUpload,
  uploadStatus,
  downloadFile,
} = require('../controllers/uploadController');

const router = express.Router();


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// All upload routes require a valid JWT
router.use(authenticate);


router.post('/init',                      initUpload);
router.post('/chunk', upload.single('chunk'), uploadChunk);
router.post('/complete',                  completeUpload);
router.get('/status/:sessionId',          uploadStatus);


router.get('/download/:fileId',           downloadFile);

module.exports = router;