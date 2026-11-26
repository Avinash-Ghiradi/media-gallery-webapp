const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const config = require('./src/config');
const auth = require('./src/auth');
const googleService = require('./src/googleService');

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB per file
const upload = multer({
  dest: path.join(os.tmpdir(), 'media-gallery-uploads'),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 50
  }
});

const app = express();

// Trust reverse proxy (required for Railway / Render / Heroku / Cloudflare)
app.set('trust proxy', 1);

// Enable CORS
app.use(cors());

// Body parsers with 500MB limit for large media uploads
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Express Session configuration
app.use(session({
  secret: config.sessionSecret,
  resave: true,
  saveUninitialized: false,
  cookie: {
    maxAge: config.sessionTimeoutMs,
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  }
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

/* ==========================================================================
   AUTHENTICATION ROUTES
   ========================================================================== */

app.get('/api/auth/status', (req, res) => {
  const status = auth.checkAuthStatus(req);
  status.googleConfigured = googleService.isConfigured();
  res.json(status);
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!password) {
    return res.status(400).json({ status: 'error', message: 'Password is required' });
  }
  const result = await auth.authenticateUser(req, password, username);
  if (result.status === 'success') {
    return req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      res.json(result);
    });
  }
  res.json(result);
});

app.post('/api/auth/logout', async (req, res) => {
  const result = await auth.logoutUser(req);
  res.json(result);
});

/* ==========================================================================
   UPLOAD & DRIVE ROUTES (Protected)
   ========================================================================== */

app.get('/api/events', auth.requireAuth, async (req, res) => {
  try {
    const folders = await googleService.getAllFolders();
    res.json(folders);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/events/:eventName/classes', auth.requireAuth, async (req, res) => {
  try {
    const { eventName } = req.params;
    const subfolders = await googleService.getSubfoldersForEvent(eventName);
    res.json(subfolders);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/upload', auth.requireAuth, async (req, res) => {
  try {
    const { filesData, eventName, className, addWatermark } = req.body;
    const result = await googleService.uploadFilesToDrive(filesData, eventName, className, addWatermark);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Multipart streaming upload route supporting files up to 500MB
app.post('/api/upload-multipart', auth.requireAuth, (req, res) => {
  upload.array('files', 50)(req, res, async (uploadErr) => {
    if (uploadErr) {
      const msg = uploadErr.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 500MB maximum size limit.'
        : uploadErr.message;
      return res.status(400).json({ status: 'error', message: msg });
    }

    const uploadedFiles = req.files || [];
    try {
      const { eventName, className } = req.body;
      const addWatermark = req.body.addWatermark !== 'false';

      if (uploadedFiles.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No files provided' });
      }

      const filesData = uploadedFiles.map((f) => ({
        filename: f.originalname,
        contentType: f.mimetype,
        size: f.size,
        data: fs.readFileSync(f.path).toString('base64')
      }));

      const result = await googleService.uploadFilesToDrive(filesData, eventName, className, addWatermark);
      res.json(result);
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    } finally {
      uploadedFiles.forEach((f) => {
        try {
          if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
        } catch (e) {}
      });
    }
  });
});

/* ==========================================================================
   FOLDER LINKS & RECENT ROUTES (Protected)
   ========================================================================== */

app.get('/api/events/sheet2', auth.requireAuth, async (req, res) => {
  try {
    const events = await googleService.getEventsFromSheet2();
    res.json(events);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/folders/links', auth.requireAuth, async (req, res) => {
  try {
    const result = await googleService.getFolderLinksFromSheet2();
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/folders/links/:eventName', auth.requireAuth, async (req, res) => {
  try {
    const { eventName } = req.params;
    const result = await googleService.getFolderLinksForEvent(eventName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/recent', auth.requireAuth, async (req, res) => {
  try {
    const result = await googleService.getRecentUploads();
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/* ==========================================================================
   WHATSAPP SHARE ROUTES (Protected)
   ========================================================================== */

app.get('/api/whatsapp/events', auth.requireAuth, async (req, res) => {
  try {
    const result = await googleService.getEventsForWhatsApp();
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/whatsapp/classes/:eventName', auth.requireAuth, async (req, res) => {
  try {
    const { eventName } = req.params;
    const result = await googleService.getClassesForWhatsApp(eventName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/whatsapp/info/:eventName/:className', auth.requireAuth, async (req, res) => {
  try {
    const { eventName, className } = req.params;
    const result = await googleService.getFolderInfoForWhatsApp(eventName, className);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/* ==========================================================================
   MANAGE & DELETE ROUTES (Protected)
   ========================================================================== */

app.get('/api/manage/events', auth.requireAuth, async (req, res) => {
  try {
    const result = await googleService.getAllEventsForDeletion();
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.delete('/api/manage/event/:eventName', auth.requireAuth, async (req, res) => {
  try {
    const { eventName } = req.params;
    const result = await googleService.deleteEventFolder(eventName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.delete('/api/manage/class/:eventName/:className', auth.requireAuth, async (req, res) => {
  try {
    const { eventName, className } = req.params;
    const result = await googleService.deleteClassFolder(eventName, className);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/* ==========================================================================
   ADMIN USER MANAGEMENT ROUTES (Admin Only)
   ========================================================================== */

app.get('/api/users', auth.requireAdmin, async (req, res) => {
  try {
    const result = await googleService.getUsersListForAdmin();
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/users', auth.requireAdmin, async (req, res) => {
  try {
    const { username, password, assignedClass, details, photoUrl, originalUsername } = req.body;
    if (!username || !password) {
      return res.status(400).json({ status: 'error', message: 'Username and password are required' });
    }
    const result = await googleService.addOrUpdateUser(username, password, assignedClass, details, photoUrl, originalUsername);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.delete('/api/users/:username', auth.requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const result = await googleService.deleteUser(username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Fallback index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const server = app.listen(config.port, () => {
  console.log(`=================================================`);
  console.log(` Media Gallery Web App Server Running!`);
  console.log(` URL: http://localhost:${config.port}`);
  console.log(` Mode: ${googleService.isConfigured() ? 'Google Cloud Service Account' : 'Mock Service (Local Testing)'}`);
  console.log(`=================================================`);
});

// Allow up to 30 minutes for large (up to 500MB) uploads over mobile networks
server.requestTimeout = 30 * 60 * 1000;
server.headersTimeout = 30 * 60 * 1000;
