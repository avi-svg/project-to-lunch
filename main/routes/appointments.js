const express = require('express');
const appointmentsController = require('../controllers/appointmentsController');
const appointmentVerificationController = require('../controllers/appointmentVerificationController');

const router = express.Router();

router.post(
  '/verification/request',
  appointmentVerificationController.requestAppointmentVerification
);
router.get(
  '/verification/:id',
  appointmentVerificationController.getPendingVerification
);
router.post(
  '/verification/resend',
  appointmentVerificationController.resendAppointmentVerification
);
router.post(
  '/verification/confirm',
  appointmentVerificationController.confirmAppointmentVerification
);
router.get('/', appointmentsController.listAppointments);
router.get('/:id', appointmentsController.getAppointmentById);
router.post('/', appointmentsController.createAppointment);
router.patch('/:id/cancel', appointmentsController.cancelAppointment);
router.put('/:id', appointmentsController.updateAppointment);
router.delete('/:id', appointmentsController.cancelAppointment);

module.exports = router;
