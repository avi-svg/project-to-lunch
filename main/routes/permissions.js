const express = require('express');
const permissionsController = require('../controllers/permissionsController');
const { requireActor, requireStaff } = require('../lib/user-roles');

const router = express.Router();

router.get('/', requireActor, requireStaff, permissionsController.getPermissionsStatus);
router.get('/check', requireActor, requireStaff, permissionsController.checkMyPermission);
router.post('/bootstrap', requireActor, requireStaff, permissionsController.bootstrapPermissions);
router.post('/', requireActor, requireStaff, permissionsController.grantPermission);
router.delete('/:targetUserId', requireActor, requireStaff, permissionsController.revokePermission);

module.exports = router;
