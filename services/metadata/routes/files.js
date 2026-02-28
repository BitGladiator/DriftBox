const express      = require('express');
const authenticate = require('../middleware/authenticate');
const {
  listFiles,
  getFile,
  deleteFile,
  listVersions,
  restoreVersion,
  searchFiles,
} = require('../controllers/filesController');

const router = express.Router();

// All routes require auth
router.use(authenticate);


router.get('/search',                    searchFiles);
router.get('/',                          listFiles);
router.get('/:id',                       getFile);
router.delete('/:id',                    deleteFile);
router.get('/:id/versions',              listVersions);
router.post('/:id/restore/:versionId',   restoreVersion);

module.exports = router;