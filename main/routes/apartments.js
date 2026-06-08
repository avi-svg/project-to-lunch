const express = require('express');
const apartmentsController = require('../controllers/apartmentsController');
const { requireActor, requireStaff, requireInternalApiKey } = require('../lib/user-roles');

const router = express.Router();

// GET /apartments — readable via internal API key (server-to-server) or by staff
router.get('/', requireInternalApiKey, apartmentsController.listApartments);

// Staff-only mutations
router.post('/',         requireActor, requireStaff, apartmentsController.createApartment);
router.patch('/:id',    requireActor, requireStaff, apartmentsController.updateApartment);
router.delete('/:id',   requireActor, requireStaff, apartmentsController.deleteApartment);

module.exports = router;
