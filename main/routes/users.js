const express = require('express');
const usersController = require('../controllers/usersController');
const {
  requireActor,
  requireStaff,
  requireStaffOrInternalApiKey,
} = require('../lib/user-roles');

const router = express.Router();

router.post('/login', usersController.authenticateCredentialsUser);
router.post('/oauth', usersController.upsertOAuthUser);
router.get('/', requireStaffOrInternalApiKey, usersController.listUsers);
router.get('/:userId/appointments', requireActor, usersController.getUserDashboardAppointments);
router.patch('/:userId/role', requireActor, requireStaff, usersController.updateUserRole);
router.get('/:userId', requireActor, usersController.getUserById);
router.patch('/:userId', requireActor, usersController.updateUser);

module.exports = router;
