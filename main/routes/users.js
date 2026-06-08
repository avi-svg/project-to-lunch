const express = require('express');
const usersController = require('../controllers/usersController');
const {
  requireActor,
  requireStaff,
  requireStaffOrInternalApiKey,
} = require('../lib/user-roles');

const router = express.Router();

router.post('/login', usersController.authenticateCredentialsUser);
router.post('/verify-password', requireActor, usersController.verifyOwnPassword);
router.post('/oauth', usersController.upsertOAuthUser);
router.post('/', requireActor, requireStaff, usersController.createUser);
router.get('/', requireStaffOrInternalApiKey, usersController.listUsers);
router.get('/:userId/birthday-greetings', requireActor, usersController.listBirthdayGreetings);
router.post('/:userId/birthday-greetings', requireActor, usersController.createBirthdayGreeting);
router.get('/:userId/appointments', requireActor, usersController.getUserDashboardAppointments);
router.patch('/:userId/role', requireActor, requireStaff, usersController.updateUserRole);
router.get('/:userId', requireActor, usersController.getUserById);
router.patch('/:userId', requireActor, usersController.updateUser);

module.exports = router;
