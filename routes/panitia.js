const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/panitiaController');
const { requirePanitia } = require('../middlewares/auth');

router.use(requirePanitia);

router.get('/dashboard',           ctrl.dashboard);
router.get('/voters',              ctrl.listVoters);
router.post('/voters/add',          ctrl.doAddVoter);
router.post('/voters/verifikasi',  ctrl.verifikasiVoter);
router.post('/voters/:id/token',   ctrl.generateToken);
router.get('/quick-count',         ctrl.quickCount);
router.get('/berita-acara',        ctrl.beritaAcara);

module.exports = router;
