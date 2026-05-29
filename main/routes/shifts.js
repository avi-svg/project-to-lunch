const express = require('express');
const shiftsController = require('../controllers/shiftsController');

const router = express.Router();

router.use(shiftsController.requireActor);

router.get('/week', shiftsController.listWeekShifts);
router.get('/mine', shiftsController.listMyRegisteredShifts);
router.get('/attendance', shiftsController.listShiftAttendance);
router.get('/swap-requests', shiftsController.listSwapRequests);
router.patch(
  '/swap-requests/:requestId',
  shiftsController.updateSwapRequestStatus
);
router.post(
  '/swap-requests/:requestId/volunteers',
  shiftsController.createSwapVolunteerOffer
);
router.patch(
  '/swap-requests/:requestId/volunteers/:offerId',
  shiftsController.updateSwapVolunteerOfferStatus
);
router.get('/:id', shiftsController.getShiftById);
router.get('/:id/assignment-pools', shiftsController.listShiftAssignmentPools);
router.post('/:id/swap-requests', shiftsController.createSwapRequest);
router.post('/', shiftsController.createShift);
router.patch('/:id', shiftsController.updateShift);
router.delete('/:id', shiftsController.deleteShift);
router.put('/:id/assignments', shiftsController.replaceShiftAssignments);
router.post('/:id/register', shiftsController.registerForShift);
router.post('/:id/attendance', shiftsController.reportAttendance);
router.post(
  '/:id/registrations/:registrationId/attendance/manual',
  shiftsController.reportAttendanceManually
);
router.patch(
  '/:id/attendance/:attendanceId/approve',
  shiftsController.approveAttendance
);
router.patch(
  '/:id/attendance/:attendanceId/reject',
  shiftsController.rejectAttendance
);
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
