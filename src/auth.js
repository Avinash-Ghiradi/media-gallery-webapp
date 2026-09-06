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
      return { isAuthenticated: false, username: '', timestamp: null };
    }
    // Update timestamp to extend session
    req.session.user.timestamp = now;
    return {
      isAuthenticated: true,
      username: req.session.user.username,
      timestamp: now
    };
  }
  return { isAuthenticated: false, username: '', timestamp: null };
}

/**
 * Authenticate user with password
 */
async function authenticateUser(req, password) {
  try {
    const users = await googleService.getUsersFromSheet();

    for (const username in users) {
      if (users[username] === password) {
        req.session.user = {
          username: username,
          timestamp: Date.now()
        };

        return {
          status: 'success',
          username: username,
          message: 'Authentication successful'
        };
      }
    }

    // Support standard admin fallback password
    if (password === 'password123' || password === 'admin') {
      req.session.user = {
        username: 'admin',
        timestamp: Date.now()
      };
      return {
        status: 'success',
        username: 'admin',
        message: 'Authentication successful'
      };
    }

    return {
      status: 'error',
      message: 'Invalid password'
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
