const googleService = require('./googleService');
const config = require('./config');

/**
 * Check session status
 */
function checkAuthStatus(req) {
  if (req.session && req.session.user) {
    const now = Date.now();
    if (now - req.session.user.timestamp > config.sessionTimeoutMs) {
      req.session.destroy();
      return { isAuthenticated: false, username: '', assignedClass: '', timestamp: null };
    }
    // Update timestamp to extend session
    req.session.user.timestamp = now;
    return {
      isAuthenticated: true,
      username: req.session.user.username,
      assignedClass: req.session.user.assignedClass || '',
      timestamp: now
    };
  }
  return { isAuthenticated: false, username: '', assignedClass: '', timestamp: null };
}

/**
 * Normalize user record from either { password, assignedClass } or legacy string password
 */
function parseUserRecord(entry) {
  if (entry && typeof entry === 'object') {
    return {
      password: entry.password || '',
      assignedClass: entry.assignedClass || ''
    };
  }
  return { password: entry || '', assignedClass: '' };
}

/**
 * Authenticate user with optional username and password
 */
async function authenticateUser(req, password, inputUsername = '') {
  try {
    const users = await googleService.getUsersFromSheet();
    const cleanInputUser = (inputUsername || '').trim().toLowerCase();

    for (const username in users) {
      const record = parseUserRecord(users[username]);
      const userMatches = !cleanInputUser || username.toLowerCase() === cleanInputUser;
      if (userMatches && record.password === password) {
        req.session.user = {
          username: username,
          assignedClass: record.assignedClass,
          timestamp: Date.now()
        };

        return {
          status: 'success',
          username: username,
          assignedClass: record.assignedClass,
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
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required. Please login again.'
    });
  }
  next();
}

module.exports = {
  checkAuthStatus,
  authenticateUser,
  logoutUser,
  requireAuth
};
