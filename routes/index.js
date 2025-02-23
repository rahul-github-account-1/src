const express = require('express');
const multer = require('multer');
const router = express.Router();
const upload = multer();
const { uploadCSV } = require('../controllers/uploadController');
const { getStatus } = require('../controllers/statusController');
const {getOutputData}=require('../controllers/outputController')

router.post('/upload', upload.single('csv'), uploadCSV);
router.get('/status/:requestId', getStatus);
router.get('/output/:requestId', getOutputData);

module.exports = router;
