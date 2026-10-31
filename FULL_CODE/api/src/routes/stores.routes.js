const express = require('express');
const router = express.Router();
const storeController = require('../controllers/store.controller');

router.get('/', storeController.list);
router.post('/', storeController.create);
router.get('/:id', storeController.getById);

module.exports = router;
