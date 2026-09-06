const path = require('path');
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'media-gallery-secret-key-change-me',
  sessionTimeoutMs: (parseInt(process.env.SESSION_TIMEOUT_MINUTES, 10) || 30) * 60 * 1000,

  // Google Sheets & Drive IDs from environment or defaults
  usersSheetId: process.env.USERS_SHEET_ID || '14Qf8_lT3D61fbpRTGw1GRKxB2V0UccjBe2LDT0n5DME',
  usersSheetName: process.env.USERS_SHEET_NAME || 'users',
  logSheetId: process.env.LOG_SHEET_ID || '14Qf8_lT3D61fbpRTGw1GRKxB2V0UccjBe2LDT0n5DME',
  urlSheetId: process.env.URL_SHEET_ID || '19BwOHx7jmTjCQlh-oiBtXHO_ugG9rpgRghly0sPqJng',
  driveRootFolderId: process.env.DRIVE_ROOT_FOLDER_ID || '1bK-DO_ZtsUe2ASqMWqr0St7zoUv8UlNw',

  // Google Cloud Credentials
  googleCredentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '..', 'credentials.json'),
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  privateKey: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,

  // Google Apps Script Web App Bridge URL (with built-in fallback)
  gasWebAppUrl: process.env.GAS_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbwbR9za-b4cKtq2XjdEMxjnum0HuNMm_6cBuUYpaRt1_LN5oBRYDk2Vl_OtX9QoXV4gvg/exec',

  defaultWatermark: process.env.DEFAULT_WATERMARK !== 'false'
};
