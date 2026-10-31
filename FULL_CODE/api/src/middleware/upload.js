const multer = require('multer');
const path = require('path');
const config = require('../config');

// Store file in memory buffer to process as stream safely
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.csv', '.xlsx', '.json', '.txt'];
  const allowedMimes = [
    'text/csv',
    'text/plain',
    'application/json',
    'application/vnd.ms-excel', // some browsers label .csv files this way
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ];

  if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type '${file.mimetype}'. Supported formats are CSV (.csv), Excel (.xlsx) and JSON (.json).`
      )
    );
  }
}

const upload = multer({
  storage,
  limits: {
    fileSize: (config.maxFileSizeMb || 25) * 1024 * 1024,
  },
  fileFilter,
});

module.exports = upload;
