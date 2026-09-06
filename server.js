const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const config = require('./src/config');
const auth = require('./src/auth');
const googleService = require('./src/googleService');

const app = express();

// Enable CORS
app.use(cors());

// Body parsers with 100MB limit for high-res base64 media uploads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Express Session
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: config.sessionTimeoutMs,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
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
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ status: 'error', message: 'Password is required' });
  }
  const result = await auth.authenticateUser(req, password);
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

// Fallback index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(config.port, () => {
  console.log(`=================================================`);
  console.log(` Media Gallery Web App Server Running!`);
  console.log(` URL: http://localhost:${config.port}`);
  console.log(` Mode: ${googleService.isConfigured() ? 'Google Cloud Service Account' : 'Mock Service (Local Testing)'}`);
  console.log(`=================================================`);
});
