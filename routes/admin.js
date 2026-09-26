const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/adminController');
const upload  = require('../middlewares/upload');
const { requireAdmin } = require('../middlewares/auth');

router.use(requireAdmin);

router.get('/dashboard',             ctrl.dashboard);
router.get('/candidates',            ctrl.listCandidates);
router.get('/candidates/add',        ctrl.showAddCandidate);
router.post('/candidates/add',       upload.single('foto'), ctrl.doAddCandidate);
router.get('/candidates/:id/edit',   ctrl.showEditCandidate);
router.post('/candidates/:id/edit',  upload.single('foto'), ctrl.doEditCandidate);
router.post('/candidates/:id/delete',ctrl.doDeleteCandidate);

router.post('/session/toggle',  ctrl.toggleSession);
router.get('/audit-log',        ctrl.auditLog);
router.get('/quick-count',      ctrl.quickCount);
router.get('/api/quick-count',  ctrl.apiQuickCount);
router.get('/voters',           ctrl.listVoters);
router.post('/voters/add',          ctrl.doAddVoter);
router.post('/voters/:id/reset',    ctrl.resetVoter);
router.post('/voters/:id/delete',   ctrl.doDeleteVoter);

router.get('/panitia',              ctrl.listPanitia);
router.post('/panitia/add',         ctrl.doAddPanitia);
router.post('/panitia/:id/delete',  ctrl.doDeletePanitia);

module.exports = router;
