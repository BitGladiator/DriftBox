const express      = require('express');
const authenticate = require('../middleware/authenticate');
const {
  createShareLink,
  accessShareLink,
  revokeShareLink,
  myShareLinks,
} = require('../controllers/shareController');

const router = express.Router();


router.get('/:linkId', accessShareLink);

router.use(authenticate);

router.post('/',             createShareLink);
router.delete('/:linkId',    revokeShareLink);
router.get('/',              myShareLinks);

module.exports = router;