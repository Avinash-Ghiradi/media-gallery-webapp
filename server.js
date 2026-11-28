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
const homeworkService = require('./src/homeworkService');
const videoWatermark = require('./src/videoWatermark');

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB per file
const upload = multer({
  dest: path.join(os.tmpdir(), 'media-gallery-uploads'),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1000
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
  rolling: true,
  saveUninitialized: false,
  cookie: {
    maxAge: config.sessionTimeoutMs,
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  }
}));

// Dynamic PWA manifest (so updated app logo icon URLs bust browser cache)
const CUSTOM_PUBLIC_LOGO = path.join(__dirname, 'public', 'custom-logo.png');
app.get('/manifest.json', async (req, res) => {
  await ensurePersistentAppLogoLoaded();
  let version = '1';
  if (fs.existsSync(CUSTOM_PUBLIC_LOGO)) {
    version = String(Math.floor(fs.statSync(CUSTOM_PUBLIC_LOGO).mtimeMs));
  }
  res.json({
    name: 'Success Gallery',
    short_name: 'Success Gallery',
    description: 'Success Gallery — Digital Media Gallery for Success School Indi',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    orientation: 'any',
    icons: [
      {
        src: `/icons/icon-192.png?v=${version}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: `/icons/icon-512.png?v=${version}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ]
  });
});

// Restore custom logos from persistent storage if requested directly on a fresh container
app.get('/custom-logo.png', async (req, res, next) => {
  await ensurePersistentAppLogoLoaded();
  if (fs.existsSync(CUSTOM_PUBLIC_LOGO)) {
    return res.sendFile(CUSTOM_PUBLIC_LOGO);
  }
  next();
});

app.get('/custom-photo-logo.png', async (req, res, next) => {
  await ensurePersistentAppLogoLoaded();
  if (fs.existsSync(CUSTOM_PHOTO_LOGO)) {
    return res.sendFile(CUSTOM_PHOTO_LOGO);
  }
  next();
});

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
    auth.setSignedSessionCookie(res, req.session.user);
    return req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      res.json(result);
    });
  }
  res.json(result);
});

app.post('/api/auth/logout', async (req, res) => {
  const result = await auth.logoutUser(req);
  auth.clearSignedSessionCookie(res);
  res.json(result);
});

app.post('/api/auth/change-password', auth.requireAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const cleanNew = (newPassword || '').trim();
    if (!cleanNew || cleanNew.length < 6) {
      return res.status(400).json({ status: 'error', message: 'New password must be at least 6 characters.' });
    }
    if (cleanNew === 'Success@123') {
      return res.status(400).json({ status: 'error', message: 'Please choose a new password different from the default password (Success@123).' });
    }
    const result = await googleService.changeUserPassword(req.session.user.username, cleanNew);
    if (result && result.status === 'success') {
      req.session.user.mustChangePassword = false;
      auth.setSignedSessionCookie(res, req.session.user);
      return req.session.save(() => res.json(result));
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Self-service profile update for any logged-in user
app.post('/api/auth/profile', auth.requireAuth, async (req, res) => {
  try {
    const currentUsername = req.session.user.username;
    const assignedClass = req.session.user.assignedClass || '';
    const { fullName, details, photoUrl, newPassword } = req.body;

    const cleanFullName = (fullName !== undefined ? fullName : (req.session.user.fullName || '')).toString().trim();
    const cleanDetails = (details !== undefined ? details : (req.session.user.details || '')).toString().trim();
    const cleanPhotoUrl = (photoUrl !== undefined ? photoUrl : (req.session.user.photoUrl || '')).toString().trim();
    const cleanNewPass = (newPassword || '').toString().trim();

    if (cleanNewPass) {
      if (cleanNewPass.length < 6) {
        return res.status(400).json({ status: 'error', message: 'New password must be at least 6 characters.' });
      }
      if (cleanNewPass === 'Success@123') {
        return res.status(400).json({ status: 'error', message: 'Please choose a password different from Success@123.' });
      }
    }

    let finalPassword = cleanNewPass;
    if (!finalPassword) {
      const users = await googleService.getUsersFromSheet();
      const entry = users[currentUsername];
      finalPassword = (entry && typeof entry === 'object') ? entry.password : entry;
      if (!finalPassword) {
        return res.status(400).json({ status: 'error', message: 'Could not verify current password. Please enter a new password.' });
      }
    }

    const result = await googleService.addOrUpdateUser(
      currentUsername,
      finalPassword,
      assignedClass,
      cleanDetails,
      cleanPhotoUrl,
      currentUsername,
      cleanFullName
    );

    if (result && result.status === 'success') {
      req.session.user.fullName = cleanFullName;
      req.session.user.details = cleanDetails;
      req.session.user.photoUrl = cleanPhotoUrl;
      if (cleanNewPass) req.session.user.mustChangePassword = false;

      // Refresh photoUrl if Drive returned a hosted URL
      const users = await googleService.getUsersFromSheet();
      const updated = users[currentUsername];
      if (updated && typeof updated === 'object' && updated.photoUrl) {
        req.session.user.photoUrl = updated.photoUrl;
      }

      auth.setSignedSessionCookie(res, req.session.user);
      return req.session.save(() => {
        res.json({
          status: 'success',
          message: 'Profile updated successfully!',
          user: {
            username: currentUsername,
            fullName: req.session.user.fullName,
            assignedClass: req.session.user.assignedClass,
            details: req.session.user.details,
            photoUrl: req.session.user.photoUrl
          }
        });
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
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
    const { filesData, eventName, className, addWatermark, originalFilesData } = req.body;
    const result = await googleService.uploadFilesToDrive(filesData, eventName, className, addWatermark, originalFilesData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Multipart streaming upload route supporting files up to 500MB
const uploadMultipartFields = upload.fields([
  { name: 'files', maxCount: 500 },
  { name: 'originalFiles', maxCount: 500 }
]);

app.post('/api/upload-multipart', auth.requireAuth, (req, res) => {
  uploadMultipartFields(req, res, async (uploadErr) => {
    if (uploadErr) {
      const msg = uploadErr.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 500MB maximum size limit.'
        : uploadErr.message;
      return res.status(400).json({ status: 'error', message: msg });
    }

    const filesMap = req.files || {};
    const uploadedFiles = filesMap.files || [];
    const uploadedOriginals = filesMap.originalFiles || [];
    try {
      const { eventName, className } = req.body;
      const addWatermark = req.body.addWatermark !== 'false';

      if (uploadedFiles.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No files provided' });
      }

      const toFileData = (f) => ({
        filename: f.originalname,
        contentType: f.mimetype,
        size: f.size,
        data: fs.readFileSync(f.path).toString('base64')
      });

      const filesData = uploadedFiles.map(toFileData);
      const originalFilesData = uploadedOriginals.map(toFileData);

      const result = await googleService.uploadFilesToDrive(filesData, eventName, className, addWatermark, originalFilesData);
      res.json(result);
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    } finally {
      [...uploadedFiles, ...uploadedOriginals].forEach((f) => {
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

app.get('/api/folders/without-watermark', auth.requireAuth, async (req, res) => {
  try {
    const result = await googleService.getWithoutWatermarkFolderLinks('all');
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/folders/without-watermark/:eventName', auth.requireAuth, async (req, res) => {
  try {
    const { eventName } = req.params;
    const result = await googleService.getWithoutWatermarkFolderLinks(eventName);
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
   HOMEWORK & CLASS TEACHER CONSOLIDATION ROUTES (Protected)
   ========================================================================== */

app.get('/api/homework/profile', auth.requireAuth, async (req, res) => {
  try {
    const result = await homeworkService.resolveTeacherProfile(req.session.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/homework/list', auth.requireAuth, async (req, res) => {
  try {
    const { date, className } = req.query;
    const result = await homeworkService.listHomework(req.session.user, date, className);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/homework/history', auth.requireAuth, async (req, res) => {
  try {
    const { fromDate, toDate, className, subject, search } = req.query;
    const result = await homeworkService.getHomeworkHistory(req.session.user, {
      fromDate,
      toDate,
      className,
      subject,
      search
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/homework/save', auth.requireAuth, async (req, res) => {
  try {
    const result = await homeworkService.saveHomework(req.session.user, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.delete('/api/homework/:id', auth.requireAuth, async (req, res) => {
  try {
    const result = await homeworkService.deleteHomework(req.session.user, req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/homework/consolidated', auth.requireAuth, async (req, res) => {
  try {
    const { date, className } = req.query;
    const result = await homeworkService.getConsolidatedHomework(req.session.user, date, className);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/homework/pdf', auth.requireAuth, async (req, res) => {
  try {
    const result = await homeworkService.generateHomeworkPdf(req.session.user, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/homework/upload', auth.requireAuth, async (req, res) => {
  try {
    const result = await homeworkService.uploadHomeworkAttachment(req.body || {});
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
    const { username, password, assignedClass, details, photoUrl, originalUsername, fullName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ status: 'error', message: 'Mobile number / username and password are required' });
    }
    const result = await googleService.addOrUpdateUser(username, password, assignedClass, details, photoUrl, originalUsername, fullName);
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

app.post('/api/users/apply-default-password', auth.requireAdmin, async (req, res) => {
  try {
    const result = await googleService.applyDefaultPasswordToNamedUsers();
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/* ==========================================================================
   APP BRANDING & LOGO ROUTES
   ========================================================================== */

const DEFAULT_LOGO_URL = 'https://lh3.googleusercontent.com/d/1stbNALlpjg5CCGlXXX84l29UoolnvrbN';
const CUSTOM_PHOTO_LOGO = path.join(__dirname, 'public', 'custom-photo-logo.png');
const SERVER_WATERMARK_LOGO = path.join(__dirname, 'src', 'school_logo.png');
let logoRestorePromise = null;

let persistedBrandingUrls = { appLogoUrl: '', photoLogoUrl: '' };

async function ensurePersistentAppLogoLoaded() {
  if (fs.existsSync(CUSTOM_PUBLIC_LOGO) && fs.existsSync(CUSTOM_PHOTO_LOGO)) return true;
  if (!logoRestorePromise) {
    logoRestorePromise = (async () => {
      try {
        persistedBrandingUrls = await googleService.getPersistedBrandingUrls();
        const [appBuf, photoBuf] = await Promise.all([
          fs.existsSync(CUSTOM_PUBLIC_LOGO) ? Promise.resolve(null) : googleService.loadAppLogoFromDrive('app'),
          fs.existsSync(CUSTOM_PHOTO_LOGO) ? Promise.resolve(null) : googleService.loadAppLogoFromDrive('photo')
        ]);
        if (appBuf && appBuf.length > 0) {
          fs.writeFileSync(CUSTOM_PUBLIC_LOGO, appBuf);
          await regeneratePwaIconsFromBuffer(appBuf);
        }
        if (photoBuf && photoBuf.length > 0) {
          fs.writeFileSync(CUSTOM_PHOTO_LOGO, photoBuf);
          fs.writeFileSync(SERVER_WATERMARK_LOGO, photoBuf);
          videoWatermark.reloadLogo();
        }
        return true;
      } catch (e) {
        console.warn('Logo restore skipped:', e.message);
      }
      return false;
    })();
  }
  return logoRestorePromise;
}

app.get('/api/branding', async (req, res) => {
  await ensurePersistentAppLogoLoaded();
  if (!persistedBrandingUrls.appLogoUrl && !persistedBrandingUrls.photoLogoUrl) {
    persistedBrandingUrls = await googleService.getPersistedBrandingUrls();
  }
  let logoUrl = persistedBrandingUrls.appLogoUrl || DEFAULT_LOGO_URL;
  if (fs.existsSync(CUSTOM_PUBLIC_LOGO)) {
    const stat = fs.statSync(CUSTOM_PUBLIC_LOGO);
    logoUrl = `/custom-logo.png?v=${Math.floor(stat.mtimeMs)}`;
  }
  let photoLogoUrl = persistedBrandingUrls.photoLogoUrl || logoUrl;
  if (fs.existsSync(CUSTOM_PHOTO_LOGO)) {
    const pStat = fs.statSync(CUSTOM_PHOTO_LOGO);
    photoLogoUrl = `/custom-photo-logo.png?v=${Math.floor(pStat.mtimeMs)}`;
  }
  res.json({
    status: 'success',
    appName: 'Success Gallery',
    logoUrl,
    photoLogoUrl,
    savedAppLogoLink: persistedBrandingUrls.appLogoUrl || '',
    savedPhotoLogoLink: persistedBrandingUrls.photoLogoUrl || ''
  });
});

async function regeneratePwaIconsFromBuffer(buf) {
  try {
    const { createCanvas, loadImage } = require('canvas');
    const iconsDir = path.join(__dirname, 'public', 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });
    const img = await loadImage(buf);
    for (const size of [192, 512]) {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      const pad = Math.round(size * 0.1);
      const maxBox = size - pad * 2;
      const scale = Math.min(maxBox / img.width, maxBox / img.height);
      const drawW = Math.max(1, Math.round(img.width * scale));
      const drawH = Math.max(1, Math.round(img.height * scale));
      const x = Math.round((size - drawW) / 2);
      const y = Math.round((size - drawH) / 2);
      ctx.drawImage(img, x, y, drawW, drawH);
      fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), canvas.toBuffer('image/png'));
    }
  } catch (e) {
    console.warn('Could not regenerate PWA icons:', e.message);
  }
}

app.post('/api/branding/logo', auth.requireAdmin, async (req, res) => {
  try {
    const { logoDataUrl, logoLink } = req.body;
    if (logoLink && typeof logoLink === 'string' && logoLink.trim().startsWith('http')) {
      const cleanLink = googleService.extractDriveDirectImageUrl(logoLink.trim());
      const resp = await fetch(cleanLink);
      const ctype = (resp.headers.get('content-type') || '').toLowerCase();
      if (!resp.ok || !ctype.startsWith('image/')) {
        return res.status(400).json({ status: 'error', message: 'Could not download an image from that link. Make sure the Drive file is shared as Anyone with the link.' });
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(CUSTOM_PUBLIC_LOGO, buf);
      await regeneratePwaIconsFromBuffer(buf);
      await googleService.saveBrandingUrlToSheet('app', cleanLink);
      persistedBrandingUrls.appLogoUrl = cleanLink;
      logoRestorePromise = Promise.resolve(true);
      return res.json({
        status: 'success',
        message: 'App logo link saved & applied!',
        logoUrl: `/custom-logo.png?v=${Date.now()}`,
        savedAppLogoLink: cleanLink
      });
    }
    if (!logoDataUrl || typeof logoDataUrl !== 'string' || !logoDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ status: 'error', message: 'Valid image file or link is required' });
    }
    const base64 = logoDataUrl.split(',')[1];
    if (!base64) {
      return res.status(400).json({ status: 'error', message: 'Invalid image data' });
    }
    const buf = Buffer.from(base64, 'base64');
    fs.writeFileSync(CUSTOM_PUBLIC_LOGO, buf);
    await regeneratePwaIconsFromBuffer(buf);
    const savedLink = await googleService.saveAppLogoToDrive(buf, 'app');
    if (typeof savedLink === 'string' && savedLink.startsWith('http')) {
      persistedBrandingUrls.appLogoUrl = savedLink;
    }
    logoRestorePromise = Promise.resolve(true);

    const logoUrl = `/custom-logo.png?v=${Date.now()}`;
    res.json({
      status: 'success',
      message: 'App logo & install icon updated and saved!',
      logoUrl,
      savedAppLogoLink: persistedBrandingUrls.appLogoUrl || ''
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to save logo: ' + err.message });
  }
});

app.post('/api/branding/photo-logo', auth.requireAdmin, async (req, res) => {
  try {
    const { logoDataUrl, logoLink } = req.body;
    if (logoLink && typeof logoLink === 'string' && logoLink.trim().startsWith('http')) {
      const cleanLink = googleService.extractDriveDirectImageUrl(logoLink.trim());
      const resp = await fetch(cleanLink);
      const ctype = (resp.headers.get('content-type') || '').toLowerCase();
      if (!resp.ok || !ctype.startsWith('image/')) {
        return res.status(400).json({ status: 'error', message: 'Could not download an image from that link. Make sure the Drive file is shared as Anyone with the link.' });
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(CUSTOM_PHOTO_LOGO, buf);
      fs.writeFileSync(SERVER_WATERMARK_LOGO, buf);
      videoWatermark.reloadLogo();
      await googleService.saveBrandingUrlToSheet('photo', cleanLink);
      persistedBrandingUrls.photoLogoUrl = cleanLink;
      logoRestorePromise = Promise.resolve(true);
      return res.json({
        status: 'success',
        message: 'Photo & Video watermark logo link saved & applied!',
        photoLogoUrl: `/custom-photo-logo.png?v=${Date.now()}`,
        savedPhotoLogoLink: cleanLink
      });
    }
    if (!logoDataUrl || typeof logoDataUrl !== 'string' || !logoDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ status: 'error', message: 'Valid image file or link is required' });
    }
    const base64 = logoDataUrl.split(',')[1];
    if (!base64) {
      return res.status(400).json({ status: 'error', message: 'Invalid image data' });
    }
    const buf = Buffer.from(base64, 'base64');
    fs.writeFileSync(CUSTOM_PHOTO_LOGO, buf);
    fs.writeFileSync(SERVER_WATERMARK_LOGO, buf);
    videoWatermark.reloadLogo();
    const savedLink = await googleService.saveAppLogoToDrive(buf, 'photo');
    if (typeof savedLink === 'string' && savedLink.startsWith('http')) {
      persistedBrandingUrls.photoLogoUrl = savedLink;
    }
    logoRestorePromise = Promise.resolve(true);

    const photoLogoUrl = `/custom-photo-logo.png?v=${Date.now()}`;
    res.json({
      status: 'success',
      message: 'Photo & Video watermark logo updated and saved!',
      photoLogoUrl,
      savedPhotoLogoLink: persistedBrandingUrls.photoLogoUrl || ''
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to save photo logo: ' + err.message });
  }
});

// Regenerate white-background PWA icons on startup if a custom logo exists, or restore from Google Drive
if (fs.existsSync(CUSTOM_PUBLIC_LOGO)) {
  regeneratePwaIconsFromBuffer(fs.readFileSync(CUSTOM_PUBLIC_LOGO));
} else {
  ensurePersistentAppLogoLoaded();
}

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
