const express = require('express');
const shiftsController = require('../controllers/shiftsController');

const router = express.Router();

router.use(shiftsController.requireActor);

router.get('/week', shiftsController.listWeekShifts);
router.get('/mine', shiftsController.listMyRegisteredShifts);
router.get('/:id', shiftsController.getShiftById);
router.get('/:id/assignment-pools', shiftsController.listShiftAssignmentPools);
router.post('/', shiftsController.createShift);
router.patch('/:id', shiftsController.updateShift);
router.put('/:id/assignments', shiftsController.replaceShiftAssignments);
router.post('/:id/register', shiftsController.registerForShift);
router.patch(
  '/:id/registrations/:registrationId/confirm',
  shiftsController.confirmOwnRegistration
);
router.patch(
  '/:id/registrations/:registrationId/approve',
  shiftsController.approveRegistration
);
router.patch(
  '/:id/registrations/:registrationId/reject',
  shiftsController.rejectRegistration
);
router.patch(
  '/:id/registrations/:registrationId/cancel',
  shiftsController.cancelRegistration
);

module.exports = router;
