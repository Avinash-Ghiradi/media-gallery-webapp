const crypto = require('crypto');
const googleService = require('./googleService');
const config = require('./config');

const SIGNED_COOKIE_NAME = 'sg_auth';

function signPayload(payloadB64) {
  return crypto
    .createHmac('sha256', config.sessionSecret)
    .update(payloadB64)
    .digest('base64url');
}

function setSignedSessionCookie(res, user) {
  if (!res || !user) return;
  try {
    const payloadB64 = Buffer.from(JSON.stringify(user), 'utf8').toString('base64url');
    const sig = signPayload(payloadB64);
    res.cookie(SIGNED_COOKIE_NAME, `${payloadB64}.${sig}`, {
      maxAge: config.sessionTimeoutMs,
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/'
    });
  } catch (e) {}
}

function clearSignedSessionCookie(res) {
  if (!res) return;
  res.clearCookie(SIGNED_COOKIE_NAME, { path: '/' });
}

function readSignedSessionCookie(req) {
  try {
    const rawCookie = req && req.headers && req.headers.cookie;
    if (!rawCookie) return null;
    const parts = rawCookie.split(';');
    let token = '';
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const name = part.slice(0, idx).trim();
      if (name === SIGNED_COOKIE_NAME) {
        token = decodeURIComponent(part.slice(idx + 1).trim());
        break;
      }
    }
    if (!token || !token.includes('.')) return null;
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return null;
    const expectedSig = signPayload(payloadB64);
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!parsed || !parsed.username || !parsed.timestamp) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

/**
 * Check session status (restores from signed cookie if server MemoryStore restarted)
 */
function checkAuthStatus(req) {
  let user = req.session && req.session.user ? req.session.user : null;
  if (!user) {
    const restored = readSignedSessionCookie(req);
    if (restored) {
      user = restored;
      if (req.session) req.session.user = restored;
    }
  }

  if (user) {
    const now = Date.now();
    if (now - user.timestamp > config.sessionTimeoutMs) {
      if (req.session) req.session.destroy();
      return { isAuthenticated: false, username: '', assignedClass: '', timestamp: null };
    }
    // Update timestamp to extend session
    user.timestamp = now;
    return {
      isAuthenticated: true,
      username: user.username,
      fullName: user.fullName || '',
      assignedClass: user.assignedClass || '',
      assignedClasses: user.assignedClasses || '',
      assignedSubjects: user.assignedSubjects || '',
      photoUrl: user.photoUrl || '',
      details: user.details || '',
      mustChangePassword: !!user.mustChangePassword,
      timestamp: now
    };
  }
  return { isAuthenticated: false, username: '', fullName: '', assignedClass: '', assignedClasses: '', assignedSubjects: '', photoUrl: '', details: '', mustChangePassword: false, timestamp: null };
}

/**
 * Normalize user record from either { password, assignedClass, photoUrl, details, fullName, assignedClasses, assignedSubjects } or legacy string password
 */
function parseUserRecord(entry) {
  if (entry && typeof entry === 'object') {
    return {
      password: entry.password || '',
      assignedClass: entry.assignedClass || '',
      assignedClasses: entry.assignedClasses || '',
      assignedSubjects: entry.assignedSubjects || '',
      photoUrl: entry.photoUrl || '',
      details: entry.details || '',
      fullName: entry.fullName || ''
    };
  }
  return { password: entry || '', assignedClass: '', assignedClasses: '', assignedSubjects: '', photoUrl: '', details: '', fullName: '' };
}

/**
 * Authenticate user with optional mobile/username and password
 */
async function authenticateUser(req, password, inputUsername = '') {
  try {
    const users = await googleService.getUsersFromSheet();
    const cleanInputUser = (inputUsername || '').trim().toLowerCase();

    for (const username in users) {
      if (username.startsWith('__BRANDING_')) continue;
      const record = parseUserRecord(users[username]);
      const userMatches = !cleanInputUser || username.toLowerCase() === cleanInputUser;
      if (userMatches && record.password === password) {
        const mustChangePassword = record.password === 'Success@123';
        req.session.user = {
          username: username,
          fullName: record.fullName,
          assignedClass: record.assignedClass,
          assignedClasses: record.assignedClasses,
          assignedSubjects: record.assignedSubjects,
          photoUrl: record.photoUrl,
          details: record.details,
          mustChangePassword: mustChangePassword,
          timestamp: Date.now()
        };

        return {
          status: 'success',
          username: username,
          fullName: record.fullName,
          assignedClass: record.assignedClass,
          assignedClasses: record.assignedClasses,
          assignedSubjects: record.assignedSubjects,
          photoUrl: record.photoUrl,
          details: record.details,
          mustChangePassword: mustChangePassword,
          message: 'Authentication successful'
        };
      }
    }

    // Support standard fallback accounts
    const fallbackAccounts = [
      { username: 'admin', password: 'password123', assignedClass: '' },
      { username: 'admin', password: 'admin', assignedClass: '' },
      { username: 'Avinash', password: 'Avinash123', assignedClass: '' },
      { username: 'Jyoti S', password: 'Mahi@0412', assignedClass: '' }
    ];

    const matchedFallback = fallbackAccounts.find((acc) => {
      const userMatches = !cleanInputUser || acc.username.toLowerCase() === cleanInputUser;
      return userMatches && acc.password === password;
    });

    if (matchedFallback) {
      req.session.user = {
        username: matchedFallback.username,
        assignedClass: matchedFallback.assignedClass,
        timestamp: Date.now()
      };
      return {
        status: 'success',
        username: matchedFallback.username,
        assignedClass: matchedFallback.assignedClass,
        message: 'Authentication successful'
      };
    }

    return {
      status: 'error',
      message: cleanInputUser ? 'Invalid username or password' : 'Invalid password'
    };
  } catch (e) {
    console.error('Authentication error:', e);
    return {
      status: 'error',
      message: 'Authentication failed: ' + e.message
    };
  }
}

/**
 * Logout user session
 */
function logoutUser(req) {
  return new Promise((resolve) => {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          resolve({ status: 'error', message: 'Logout failed: ' + err.message });
        } else {
          resolve({ status: 'success', message: 'Logged out successfully' });
        }
      });
    } else {
      resolve({ status: 'success', message: 'Logged out successfully' });
    }
  });
}

/**
 * Express Middleware to protect routes
 */
function requireAuth(req, res, next) {
  const auth = checkAuthStatus(req);
  if (!auth.isAuthenticated) {
    clearSignedSessionCookie(res);
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required. Please login again.'
    });
  }
  if (req.session && req.session.user) {
    setSignedSessionCookie(res, req.session.user);
  }
  next();
}

function requireAdmin(req, res, next) {
  const auth = checkAuthStatus(req);
  if (!auth.isAuthenticated) {
    clearSignedSessionCookie(res);
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required. Please login again.'
    });
  }
  if (auth.assignedClass) {
    return res.status(403).json({
      status: 'error',
      message: 'Admin access required.'
    });
  }
  if (req.session && req.session.user) {
    setSignedSessionCookie(res, req.session.user);
  }
  next();
}

module.exports = {
  checkAuthStatus,
  authenticateUser,
  logoutUser,
  requireAuth,
  requireAdmin,
  setSignedSessionCookie,
  clearSignedSessionCookie
};
