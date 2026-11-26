// Global state variables
let selectedFiles = [];
let schoolLogo = null;
let logoLoaded = false;
let recentFoldersData = [];
let recentBadgeCount = 0;
window.folderLinksData = null;
let watermarkEnabled = true;
let eventsForDeletion = [];
let currentWhatsAppData = null;
let currentDeletion = {
  type: '', // 'event' or 'class'
  eventName: '',
  className: '',
  eventIndex: -1,
  classIndex: -1
};
let currentUserAssignedClass = '';
let currentUserProfile = { username: '', fullName: '', assignedClass: '', details: '', photoUrl: '' };
let myProfilePendingPhoto = '';
let deferredInstallPrompt = null;

// Register Service Worker & handle PWA install prompt
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const installBtn = document.getElementById('installAppBtn');
  if (installBtn) installBtn.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const installBtn = document.getElementById('installAppBtn');
  if (installBtn) installBtn.style.display = 'none';
});

async function installPWA() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    deferredInstallPrompt = null;
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) installBtn.style.display = 'none';
  }
}

// Helper for API fetch calls
async function apiCall(endpoint, method = 'GET', data = null) {
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(endpoint, options);
  if (!response.ok) {
    let errorMsg = `Server error (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.message) errorMsg = errJson.message;
    } catch (e) {}
    throw new Error(errorMsg);
  }
  return await response.json();
}

// Initialize application on DOM load
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing application...');

  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('mainApp').style.display = 'none';

  checkAuthentication();

  document.getElementById('dropArea').addEventListener('click', function() {
    document.getElementById('fileInput').click();
  });

  preloadSchoolLogo();
  loadAppBranding();

  document.getElementById('password').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
      login();
    }
  });
});

// Tab switching
function switchTab(tabName) {
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });

  const activeButton = document.querySelector(`.tab-button[onclick*="${tabName}"]`);
  if (activeButton) {
    activeButton.classList.add('active');
  }

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });

  const activeTab = document.getElementById(tabName + 'Tab');
  if (activeTab) {
    activeTab.classList.add('active');
  }

  if (tabName === 'folders') {
    const folderSelect = document.getElementById('folderEventSelect');
    if (folderSelect && (folderSelect.options.length <= 2 || folderSelect.options[0].textContent.includes('Error'))) {
      initializeFolderView();
    }
    loadFolderLinks();
  } else if (tabName === 'recent') {
    loadRecentFolders();
    recentBadgeCount = 0;
    updateRecentBadge();
  } else if (tabName === 'whatsapp') {
    initializeWhatsAppTab();
  } else if (tabName === 'delete') {
    loadEventsForDeletion();
  } else if (tabName === 'users') {
    loadUsersForAdmin();
  }
}

async function checkAuthentication() {
  console.log('Checking authentication...');
  try {
    const authStatus = await apiCall('/api/auth/status');
    if (authStatus && authStatus.isAuthenticated) {
      showMainApp(
        authStatus.username,
        authStatus.googleConfigured,
        authStatus.assignedClass || '',
        authStatus.photoUrl || '',
        authStatus.fullName || '',
        !!authStatus.mustChangePassword,
        authStatus.details || ''
      );
    } else {
      showLogin();
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    showLogin();
  }
}

function showLogin() {
  currentUserAssignedClass = '';
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginOverlay').style.display = 'flex';
  const userEl = document.getElementById('loginUsername');
  if (userEl) userEl.value = '';
  document.getElementById('password').value = '';
  (userEl || document.getElementById('password')).focus();

  const statusMessage = document.getElementById('loginStatusMessage');
  if (statusMessage) statusMessage.style.display = 'none';
}

function applyAssignedClassLock() {
  const classSelect = document.getElementById('className');
  const newClassInput = document.getElementById('newClassName');
  const badge = document.getElementById('assignedClassBadge');
  if (!classSelect) return;

  if (currentUserAssignedClass) {
    let hasOption = Array.from(classSelect.options).some(opt => opt.value === currentUserAssignedClass);
    if (!hasOption) {
      const option = document.createElement('option');
      option.value = currentUserAssignedClass;
      option.textContent = currentUserAssignedClass;
      classSelect.appendChild(option);
    }
    classSelect.value = currentUserAssignedClass;
    classSelect.disabled = true;
    if (newClassInput) {
      newClassInput.style.display = 'none';
      newClassInput.value = '';
    }
    if (badge) {
      badge.textContent = `Auto: ${currentUserAssignedClass}`;
      badge.style.display = 'inline-block';
    }
  } else {
    classSelect.disabled = false;
    if (badge) badge.style.display = 'none';
  }
}

function showMainApp(username, googleConfigured, assignedClass = '', photoUrl = '', fullName = '', mustChangePassword = false, details = '') {
  currentUserAssignedClass = assignedClass || '';
  currentUserProfile = {
    username: username || '',
    fullName: fullName || '',
    assignedClass: assignedClass || '',
    details: details || '',
    photoUrl: photoUrl || ''
  };
  const displayName = fullName || username || 'Admin';
  const classNote = currentUserAssignedClass ? ` (${currentUserAssignedClass})` : '';
  document.getElementById('user-name').textContent = 'Welcome, ' + displayName + classNote;
  const headerAvatar = document.getElementById('headerUserAvatar');
  if (headerAvatar) {
    headerAvatar.innerHTML = photoUrl
      ? `<img src="${photoUrl}" alt="${username}" class="user-avatar-img">`
      : '<i class="fas fa-user-shield"></i>';
  }
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('loginOverlay').style.display = 'none';
  const usersNavBtn = document.getElementById('usersNavBtn');
  if (usersNavBtn) {
    usersNavBtn.style.display = currentUserAssignedClass ? 'none' : 'inline-flex';
  }
  applyAssignedClassLock();
  loadEvents();
  initializeFolderView();
  loadRecentFolders();

  if (mustChangePassword) {
    showForceChangePasswordModal();
  }

  if (googleConfigured === false) {
    showStatus('⚠️ Running in Local Test Mode. To upload real files & folders to Google Drive, place your <code>credentials.json</code> file in the project folder.', 'warning');
  }
}

function showForceChangePasswordModal() {
  const modal = document.getElementById('forceChangePasswordModal');
  const errEl = document.getElementById('forceChangePasswordError');
  const newEl = document.getElementById('forceNewPassword');
  const confirmEl = document.getElementById('forceConfirmPassword');
  if (errEl) errEl.style.display = 'none';
  if (newEl) newEl.value = '';
  if (confirmEl) confirmEl.value = '';
  if (modal) modal.style.display = 'flex';
  if (newEl) setTimeout(() => newEl.focus(), 100);
}

async function submitForcedPasswordChange() {
  const newEl = document.getElementById('forceNewPassword');
  const confirmEl = document.getElementById('forceConfirmPassword');
  const errEl = document.getElementById('forceChangePasswordError');
  const btn = document.getElementById('forceChangePasswordBtn');

  const newPassword = newEl ? newEl.value.trim() : '';
  const confirmPassword = confirmEl ? confirmEl.value.trim() : '';

  const showErr = (msg) => {
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
  };

  if (newPassword.length < 6) {
    return showErr('New password must be at least 6 characters.');
  }
  if (newPassword === 'Success@123') {
    return showErr('Please choose a password different from Success@123.');
  }
  if (newPassword !== confirmPassword) {
    return showErr('Passwords do not match. Please re-enter.');
  }

  if (errEl) errEl.style.display = 'none';
  if (btn) btn.disabled = true;

  try {
    const res = await apiCall('/api/auth/change-password', 'POST', { newPassword });
    if (res && res.status === 'success') {
      const modal = document.getElementById('forceChangePasswordModal');
      if (modal) modal.style.display = 'none';
      showCopyNotification('Password updated successfully!');
    } else {
      showErr((res && res.message) || 'Failed to update password.');
    }
  } catch (err) {
    showErr('Error: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function updateRecentBadge() {
  const badge = document.getElementById('recentBadge');
  if (recentBadgeCount > 0) {
    badge.textContent = recentBadgeCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

async function loadRecentFolders(showRefresh = false) {
  const container = document.getElementById('recentFoldersContainer');

  if (!showRefresh) {
    container.innerHTML = `
      <div class="loading-recent">
        <div class="spinner"></div>
        <p>Loading recent uploads...</p>
      </div>
    `;
  }

  try {
    const result = await apiCall('/api/recent');
    if (result.status === 'success') {
      displayRecentFolders(result.data);
      const recentTab = document.getElementById('recentTab');
      if (!recentTab.classList.contains('active') && result.data.length > 0) {
        recentBadgeCount = result.data.length;
        updateRecentBadge();
      }
    } else {
      showRecentFoldersError(result.message);
    }
  } catch (error) {
    showRecentFoldersError(error.message);
  }
}

function displayRecentFolders(folders) {
  const container = document.getElementById('recentFoldersContainer');

  if (!folders || folders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-folder-open"></i>
        <p>No recent uploads found</p>
        <p style="font-size: 0.875rem; color: var(--gray);">Upload some files to see them here</p>
      </div>
    `;
    return;
  }

  recentFoldersData = folders;
  let html = '<div class="recent-folders-grid">';

  folders.forEach((folder, index) => {
    const uploadTime = folder.uploadTime || 'Recently';
    const isNew = folder.isNew === true;
    const className = folder.className || 'Unknown Class';
    const eventName = folder.eventName || 'Unknown Event';
    const folderUrl = folder.folderUrl || '#';

    html += `
      <div class="recent-folder-card ${isNew ? 'new-folder' : ''}" id="recent-folder-${index}">
        <div class="recent-folder-header">
          <div class="recent-folder-info">
            <div class="recent-folder-title">${className}</div>
            <div class="recent-folder-subtitle">${eventName}</div>
          </div>
          <div class="recent-folder-time" title="Uploaded ${uploadTime}">
            <i class="far fa-clock"></i> ${uploadTime}
          </div>
        </div>
        
        <div class="recent-folder-actions">
          <div class="recent-folder-url" title="${folderUrl}">
            <i class="fas fa-link"></i> ${folderUrl}
          </div>
          <a href="${folderUrl}" target="_blank" class="recent-folder-btn">
            <i class="fas fa-external-link-alt"></i>
          </a>
          <button class="recent-folder-btn copy" onclick="copyRecentFolderLink('${folderUrl}', ${index})">
            <i class="fas fa-copy"></i>
          </button>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;

  setTimeout(() => {
    folders.forEach((folder, index) => {
      const card = document.getElementById(`recent-folder-${index}`);
      if (card) card.classList.remove('new-folder');
    });
  }, 2000);
}

function showRecentFoldersError(message) {
  const container = document.getElementById('recentFoldersContainer');
  container.innerHTML = `
    <div style="color: var(--error); padding: 2rem; text-align: center;">
      <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
      <p>${message}</p>
      <button onclick="loadRecentFolders(true)" class="refresh-btn" style="margin-top: 1rem;">
        <i class="fas fa-sync-alt"></i> Try Again
      </button>
    </div>
  `;
}

function copyRecentFolderLink(url, index) {
  navigator.clipboard.writeText(url).then(() => {
    showCopyNotification('Copied folder link!');

    const button = document.querySelector(`#recent-folder-${index} .recent-folder-btn.copy`);
    if (button) {
      const originalHtml = button.innerHTML;
      button.innerHTML = '<i class="fas fa-check"></i>';
      button.style.background = 'var(--success)';
      button.style.color = 'white';

      setTimeout(() => {
        button.innerHTML = originalHtml;
        button.style.background = '';
        button.style.color = '';
      }, 1000);
    }
  }).catch(err => {
    console.error('Failed to copy: ', err);
    showStatus('Failed to copy folder link', 'error');
  });
}

function handleLogoError() {
  const logoElement = document.getElementById('school-logo');
  const fallbackElement = document.querySelector('.logo-fallback');
  if (logoElement && fallbackElement) {
    logoElement.style.display = 'none';
    fallbackElement.style.display = 'flex';
  }
}

function handleLoginLogoError() {
  const logoElement = document.getElementById('login-school-logo');
  const fallbackElement = document.querySelector('.login-logo-fallback');
  if (logoElement && fallbackElement) {
    logoElement.style.display = 'none';
    fallbackElement.style.display = 'flex';
  }
}

function handleEnterKey(event) {
  if (event.key === 'Enter') login();
}

async function login() {
  const usernameEl = document.getElementById('loginUsername');
  const username = usernameEl ? usernameEl.value.trim() : '';
  const password = document.getElementById('password').value.trim();
  const loginBtn = document.getElementById('loginBtn');
  const loading = document.getElementById('loginLoading');
  const statusMessage = document.getElementById('loginStatusMessage');

  if (!password) {
    showLoginStatus('Please enter a password', 'error');
    return;
  }

  loginBtn.disabled = true;
  if (loading) loading.style.display = 'block';
  if (statusMessage) statusMessage.style.display = 'none';

  try {
    const result = await apiCall('/api/auth/login', 'POST', { username, password });
    if (loading) loading.style.display = 'none';
    if (loginBtn) loginBtn.disabled = false;

    if (result && result.status === 'success') {
      showLoginStatus('Login successful! Loading application...', 'success');
      setTimeout(() => checkAuthentication(), 1000);
    } else {
      showLoginStatus(result.message || 'Invalid password', 'error');
    }
  } catch (error) {
    if (loading) loading.style.display = 'none';
    if (loginBtn) loginBtn.disabled = false;
    showLoginStatus('Login failed: ' + error.message, 'error');
  }
}

function showLoginStatus(message, type) {
  const statusMessage = document.getElementById('loginStatusMessage');
  if (statusMessage) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message login-status-${type}`;
    statusMessage.style.display = 'block';
  }
}

async function logout() {
  if (confirm('Are you sure you want to logout?')) {
    try {
      await apiCall('/api/auth/logout', 'POST');
    } catch (e) {}
    window.location.reload();
  }
  return false;
}

function showCopyNotification(text) {
  const existingNotification = document.querySelector('.copy-notification');
  if (existingNotification) existingNotification.remove();

  const notification = document.createElement('div');
  notification.className = 'copy-notification';
  notification.innerHTML = `<i class="fas fa-check-circle"></i><span>${text}</span>`;
  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentNode) notification.remove();
  }, 2000);
}

function preloadSchoolLogo(customUrl = '') {
  schoolLogo = new Image();
  schoolLogo.crossOrigin = "anonymous";
  schoolLogo.onload = function() {
    logoLoaded = true;
    console.log("School logo loaded successfully");
  };
  schoolLogo.onerror = function() {
    console.warn("School logo failed to load, will use text-only watermark");
    logoLoaded = false;
  };
  schoolLogo.src = customUrl || "https://lh3.googleusercontent.com/d/1stbNALlpjg5CCGlXXX84l29UoolnvrbN";
}

function applyBrandingLogoUrl(logoUrl) {
  if (!logoUrl) return;
  const loginLogo = document.getElementById('login-school-logo');
  const headerLogo = document.getElementById('school-logo');
  const adminLogo = document.getElementById('appLogoAdminImg');
  if (loginLogo) loginLogo.src = logoUrl;
  if (headerLogo) headerLogo.src = logoUrl;
  if (adminLogo) adminLogo.src = logoUrl;
  preloadSchoolLogo(logoUrl);
}

async function loadAppBranding() {
  try {
    const res = await apiCall('/api/branding');
    if (res && res.logoUrl) {
      applyBrandingLogoUrl(res.logoUrl);
    }
  } catch (e) {
    console.warn('Could not load custom branding:', e.message);
  }
}

function handleAppLogoUpload() {
  const input = document.getElementById('appLogoInput');
  const btn = document.getElementById('uploadAppLogoBtn');
  if (!input || !input.files || !input.files[0]) return;

  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = async function() {
      const maxDim = 512;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const logoDataUrl = canvas.toDataURL('image/png');
      if (btn) btn.disabled = true;
      try {
        const res = await apiCall('/api/branding/logo', 'POST', { logoDataUrl });
        if (res && res.status === 'success') {
          applyBrandingLogoUrl(res.logoUrl);
          showCopyNotification(res.message || 'App logo updated!');
        } else {
          showNoticePopup((res && res.message) || 'Failed to upload logo', '', 'Error');
        }
      } catch (err) {
        showNoticePopup('Error uploading logo: ' + err.message, '', 'Error');
      } finally {
        if (btn) btn.disabled = false;
        input.value = '';
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function handleClassSelectChange() {
  const classSelect = document.getElementById('className');
  const newClassInput = document.getElementById('newClassName');

  if (classSelect && newClassInput) {
    if (classSelect.value === 'new') {
      newClassInput.style.display = 'block';
    } else {
      newClassInput.style.display = 'none';
      newClassInput.value = '';
    }
  }
}

async function loadClassFolders(preserveClass = '') {
  const eventSelect = document.getElementById('eventName');
  const eventName = eventSelect ? eventSelect.value : '';

  const newEventInput = document.getElementById('newEventName');
  if (newEventInput) {
    newEventInput.style.display = eventName === 'new' ? 'block' : 'none';
    if (eventName !== 'new') newEventInput.value = '';
  }

  if (eventName && eventName !== 'new') {
    try {
      const folders = await apiCall(`/api/events/${encodeURIComponent(eventName)}/classes`);
      const classSelect = document.getElementById('className');
      if (classSelect) {
        classSelect.innerHTML = '<option value="">-- Select Class --</option><option value="new">+ Create New Class</option>';

        if (folders && folders.length > 0) {
          folders.forEach(function(folder) {
            const option = document.createElement('option');
            option.value = folder;
            option.textContent = folder;
            classSelect.appendChild(option);
          });
          if (preserveClass && folders.includes(preserveClass)) {
            classSelect.value = preserveClass;
            handleClassSelectChange();
          }
        } else {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'No classes found for this event';
          option.disabled = true;
          classSelect.appendChild(option);
        }
      }
    } catch (error) {
      showStatus('Error loading classes: ' + error.message, 'error');
    } finally {
      applyAssignedClassLock();
    }
  } else {
    const classSelect = document.getElementById('className');
    if (classSelect) {
      classSelect.innerHTML = '<option value="">-- Select Class --</option><option value="new">+ Create New Class</option>';
    }
    applyAssignedClassLock();
  }
}

async function loadEvents(options = {}) {
  const { silent = false, preserveEvent = '', preserveClass = '' } = options;
  if (!silent) {
    showStatus('Loading events...', 'warning');
  }
  try {
    const folders = await apiCall('/api/events');
    const select = document.getElementById('eventName');
    if (select) {
      select.innerHTML = '<option value="">-- Select Event --</option><option value="new">+ Create New Event</option>';

      if (folders && folders.length > 0) {
        folders.forEach(function(folder) {
          const option = document.createElement('option');
          option.value = folder;
          option.textContent = folder;
          select.appendChild(option);
        });
        if (preserveEvent && folders.includes(preserveEvent)) {
          select.value = preserveEvent;
          await loadClassFolders(preserveClass);
        }
        if (!silent) {
          showStatus('Events loaded successfully', 'success');
        }
      } else {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No events found';
        option.disabled = true;
        select.appendChild(option);
        if (!silent) {
          showStatus('No events found. Create a new one.', 'warning');
        }
      }
    }
  } catch (error) {
    if (!silent) {
      showStatus('Error loading events: ' + error.message, 'error');
    }
  }
}

async function initializeFolderView() {
  const select = document.getElementById('folderEventSelect');
  if (select) {
    select.innerHTML = '<option value="">-- Loading Events --</option>';
    select.disabled = true;
  }

  try {
    const eventNames = await apiCall('/api/events/sheet2');
    if (select) {
      select.innerHTML = '<option value="">-- Select Event to View Folders --</option><option value="all">All Events</option>';
      select.disabled = false;

      if (eventNames && eventNames.length > 0) {
        eventNames.forEach(eventName => {
          const option = document.createElement('option');
          option.value = eventName;
          option.textContent = eventName;
          select.appendChild(option);
        });
      } else {
        select.innerHTML = '<option value="">-- No Events Found --</option>';
      }
    }
  } catch (error) {
    console.error('Error loading folder view events:', error);
    if (select) {
      select.innerHTML = '<option value="">-- Error Loading Events --</option>';
      select.disabled = false;
    }
  }
}

function loadFolderLinks() {
  const eventSelect = document.getElementById('folderEventSelect');
  const eventName = eventSelect ? eventSelect.value : '';

  if (!eventName) {
    showNoticePopup('Please select an event to view folder links', 'folderEventSelect');
    return;
  }

  const container = document.getElementById('folderLinksContainer');
  const linksDiv = document.getElementById('folderLinks');
  const title = document.getElementById('foldersTitle');

  if (linksDiv) {
    linksDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><div class="spinner" style="width: 2rem; height: 2rem; margin-bottom: 1rem;"></div><p>Loading folder links...</p></div>';
  }
  if (container) container.style.display = 'block';

  if (eventName === 'all') {
    if (title) title.textContent = 'All Folder Links (With Watermark)';
    loadAllFolderLinks();
  } else {
    if (title) title.textContent = `Folder Links for: ${eventName}`;
    loadEventFolderLinks(eventName);
  }
}

async function loadWithoutWatermarkFolders() {
  const eventSelect = document.getElementById('folderEventSelect');
  const eventName = eventSelect ? eventSelect.value : '';

  if (!eventName) {
    showNoticePopup('Please select an event (or All Events) to get Without Watermark photos', 'folderEventSelect');
    return;
  }

  const container = document.getElementById('folderLinksContainer');
  const linksDiv = document.getElementById('folderLinks');
  const title = document.getElementById('foldersTitle');

  if (linksDiv) {
    linksDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><div class="spinner" style="width: 2rem; height: 2rem; margin-bottom: 1rem;"></div><p>Loading Without Watermark folders...</p></div>';
  }
  if (container) container.style.display = 'block';

  try {
    if (eventName === 'all') {
      if (title) title.textContent = 'Without Watermark Photos — All Events';
      const result = await apiCall('/api/folders/without-watermark');
      if (result.status === 'success') {
        displayAllFolderLinks(result.data);
      } else {
        showFolderLinksError(result.message);
      }
    } else {
      if (title) title.textContent = `Without Watermark Photos — ${eventName}`;
      const result = await apiCall(`/api/folders/without-watermark/${encodeURIComponent(eventName)}`);
      if (result.status === 'success') {
        displayEventFolderLinks(eventName, result.data);
      } else {
        showFolderLinksError(result.message);
      }
    }
  } catch (error) {
    showFolderLinksError(error.message);
  }
}

async function loadAllFolderLinks() {
  try {
    const result = await apiCall('/api/folders/links');
    if (result.status === 'success') {
      displayAllFolderLinks(result.data);
    } else {
      showFolderLinksError(result.message);
    }
  } catch (error) {
    showFolderLinksError(error.message);
  }
}

async function loadEventFolderLinks(eventName) {
  try {
    const result = await apiCall(`/api/folders/links/${encodeURIComponent(eventName)}`);
    if (result.status === 'success') {
      displayEventFolderLinks(eventName, result.data);
    } else {
      showFolderLinksError(result.message);
    }
  } catch (error) {
    showFolderLinksError(error.message);
  }
}

function displayAllFolderLinks(folderData) {
  const linksDiv = document.getElementById('folderLinks');
  if (!linksDiv) return;

  if (!folderData || folderData.length === 0) {
    showEmptyFolderLinksState('No folder links found. Please upload files first.');
    return;
  }

  window.folderLinksData = folderData;
  let html = '<div style="display: grid; gap: 1.5rem;">';

  folderData.forEach((event, eventIndex) => {
    const eventName = event.eventName || 'Unknown Event';
    const classes = event.classes || [];

    if (classes.length === 0) return;

    html += `<div class="event-header">
      <span>${eventName}</span>
      <button class="event-copy-btn" onclick="copyEventFolderLinks(${eventIndex})">
        <i class="fas fa-copy"></i> Copy All
      </button>
    </div>`;

    classes.forEach((cls) => {
      const className = cls.className || 'Unknown Class';
      const folderUrl = cls.folderUrl || '#';

      html += `<div class="folder-card">
        <div class="folder-header">
          <div class="folder-title">
            <h4>${className}</h4>
            <div class="folder-subtitle">${eventName}</div>
          </div>
          <div class="folder-actions">
            <a href="${folderUrl}" target="_blank" class="copy-folder-btn">
              <i class="fas fa-external-link-alt"></i> Open
            </a>
            <button class="copy-folder-btn" onclick="copyFolderLink('${folderUrl}', '${eventName} - ${className}')">
              <i class="fas fa-copy"></i> Copy
            </button>
          </div>
        </div>
        <div class="link-item">
          <div class="link-item-content">
            <div class="link-header">Folder URL</div>
            <div class="link-url" style="word-break: break-all;">${folderUrl}</div>
          </div>
          <div class="link-actions">
            <a href="${folderUrl}" target="_blank" class="link-action-btn">
              <i class="fas fa-external-link-alt"></i>
            </a>
            <button onclick="copyFolderLink('${folderUrl}', '${eventName} - ${className}')" class="link-action-btn link-copy-btn">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
      </div>`;
    });
  });

  html += '</div>';
  linksDiv.innerHTML = html;
}

function displayEventFolderLinks(eventName, folderData) {
  const linksDiv = document.getElementById('folderLinks');
  if (!linksDiv) return;

  if (!folderData || folderData.length === 0) {
    linksDiv.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--gray);">
      <i class="fas fa-folder-open" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
      <p>No folder links found for ${eventName}</p>
    </div>`;
    return;
  }

  window.folderLinksData = { eventName: eventName, classes: folderData };

  let html = `<div class="event-header" style="margin-bottom: 1.5rem;">
    <span>${eventName}</span>
    <button class="event-copy-btn" onclick="copyAllEventFolderLinks()">
      <i class="fas fa-copy"></i> Copy All
    </button>
  </div>`;

  html += '<div style="display: grid; gap: 1rem;">';

  folderData.forEach((cls) => {
    const className = cls.className || 'Unknown Class';
    const folderUrl = cls.folderUrl || '#';

    html += `<div class="folder-card">
      <div class="folder-header">
        <div class="folder-title">
          <h4>${className}</h4>
          <div class="folder-subtitle">${eventName}</div>
        </div>
        <div class="folder-actions">
          <a href="${folderUrl}" target="_blank" class="copy-folder-btn">
            <i class="fas fa-external-link-alt"></i> Open
          </a>
          <button class="copy-folder-btn" onclick="copyFolderLink('${folderUrl}', '${eventName} - ${className}')">
            <i class="fas fa-copy"></i> Copy
          </button>
        </div>
      </div>
      <div class="link-item">
        <div class="link-item-content">
          <div class="link-header">Folder URL</div>
          <div class="link-url">${folderUrl}</div>
        </div>
        <div class="link-actions">
          <a href="${folderUrl}" target="_blank" class="link-action-btn">
            <i class="fas fa-external-link-alt"></i>
          </a>
          <button onclick="copyFolderLink('${folderUrl}', '${className}')" class="link-action-btn link-copy-btn">
            <i class="fas fa-copy"></i>
          </button>
        </div>
      </div>
    </div>`;
  });

  html += '</div>';
  linksDiv.innerHTML = html;
}

function showFolderLinksError(message) {
  const linksDiv = document.getElementById('folderLinks');
  const container = document.getElementById('folderLinksContainer');

  if (linksDiv) {
    linksDiv.innerHTML = `<div style="color: var(--error); padding: 2rem; text-align: center;">
      <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
      <h4>Error Loading Folder Links</h4>
      <p>${message}</p>
      <div style="margin-top: 1rem;">
        <button onclick="loadFolderLinks()" class="refresh-btn" style="margin-right: 0.5rem;">
          <i class="fas fa-sync-alt"></i> Try Again
        </button>
        <button onclick="initializeFolderView()" class="btn-secondary">
          <i class="fas fa-redo"></i> Reload Events
        </button>
      </div>
    </div>`;
  }
  if (container) container.style.display = 'block';
}

function showEmptyFolderLinksState(message) {
  const linksDiv = document.getElementById('folderLinks');
  if (linksDiv) {
    linksDiv.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--gray);">
      <i class="fas fa-folder-open" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
      <h4 style="margin-bottom: 0.5rem; color: var(--dark);">No Folder Links Found</h4>
      <p>${message}</p>
      <div style="margin-top: 1.5rem;">
        <button onclick="switchTab('upload')" class="btn-primary">
          <i class="fas fa-cloud-upload-alt"></i> Upload Files First
        </button>
      </div>
    </div>`;
  }
}

function copyFolderLink(url, label) {
  navigator.clipboard.writeText(url).then(() => {
    showCopyNotification('Copied the link!');
    showStatus(`Folder link for ${label} copied to clipboard!`, 'success');
  }).catch(err => {
    console.error('Failed to copy: ', err);
    showStatus('Failed to copy folder link', 'error');
  });
}

function copyEventFolderLinks(eventIndex) {
  if (!window.folderLinksData || !window.folderLinksData[eventIndex]) {
    showStatus('No data available to copy', 'error');
    return;
  }

  const event = window.folderLinksData[eventIndex];
  let textToCopy = `Event: ${event.eventName}\n` + '='.repeat(50) + '\n\n';

  event.classes.forEach((cls, index) => {
    textToCopy += `${index + 1}. ${cls.className}\n   Folder: ${cls.folderUrl}\n\n`;
  });

  navigator.clipboard.writeText(textToCopy).then(() => {
    showCopyNotification('Copied all links for ' + event.eventName);
    showStatus(`Copied all folder links for ${event.eventName} to clipboard!`, 'success');
  }).catch(err => {
    console.error('Failed to copy: ', err);
    showStatus('Failed to copy folder links', 'error');
  });
}

function copyAllEventFolderLinks() {
  if (!window.folderLinksData || !window.folderLinksData.classes) {
    showStatus('No data available to copy', 'error');
    return;
  }

  const eventName = window.folderLinksData.eventName;
  const classes = window.folderLinksData.classes;

  let textToCopy = `Event: ${eventName}\n` + '='.repeat(50) + '\n\n';
  classes.forEach((cls, index) => {
    textToCopy += `${index + 1}. ${cls.className}\n   Folder: ${cls.folderUrl}\n\n`;
  });

  navigator.clipboard.writeText(textToCopy).then(() => {
    showCopyNotification('Copied all links for ' + eventName);
    showStatus(`Copied all folder links for ${eventName} to clipboard!`, 'success');
  }).catch(err => {
    console.error('Failed to copy: ', err);
    showStatus('Failed to copy folder links', 'error');
  });
}

function copyAllFolderLinks() {
  if (!window.folderLinksData) {
    showStatus('No data available to copy', 'error');
    return;
  }

  let textToCopy = 'ALL FOLDER LINKS\n' + '='.repeat(50) + '\n\n';
  let totalCount = 0;

  window.folderLinksData.forEach((event, eventIndex) => {
    textToCopy += `EVENT: ${event.eventName}\n` + '-'.repeat(50) + '\n';
    event.classes.forEach((cls, classIndex) => {
      totalCount++;
      textToCopy += `${classIndex + 1}. ${cls.className}\n   Folder: ${cls.folderUrl}\n\n`;
    });
    if (eventIndex < window.folderLinksData.length - 1) textToCopy += '\n';
  });

  textToCopy += `\nTotal: ${totalCount} folder links`;

  navigator.clipboard.writeText(textToCopy).then(() => {
    showCopyNotification('Copied all ' + totalCount + ' links!');
    showStatus(`Copied ${totalCount} folder links to clipboard!`, 'success');
  }).catch(err => {
    console.error('Failed to copy: ', err);
    showStatus('Failed to copy folder links', 'error');
  });
}

// High-quality smart photo compression (caps longest side at 2560px with 88% JPEG quality)
function compressPhotoHighQuality(file, maxDim = 2560, quality = 0.88) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/gif') {
      return resolve({ blob: file, filename: file.name });
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const longest = Math.max(img.width, img.height);
        // If already reasonably sized and small, keep original bytes untouched
        if (longest <= maxDim && file.size <= 900 * 1024) {
          return resolve({ blob: file, filename: file.name });
        }
        const scale = Math.min(1, maxDim / longest);
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        canvas.toBlob((blob) => {
          if (!blob) return resolve({ blob: file, filename: file.name });
          // Ensure .jpg extension when re-encoded as JPEG
          const outName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
          resolve({ blob, filename: outName });
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve({ blob: file, filename: file.name });
      img.src = e.target.result;
    };
    reader.onerror = () => resolve({ blob: file, filename: file.name });
    reader.readAsDataURL(file);
  });
}

// Client-side HTML5 Canvas Watermarking (with high-quality compression)
function addWatermarkToImage(file, eventName, className, callback) {
  if (!watermarkEnabled) {
    readFileAsDataURL(file).then(result => callback(result));
    return;
  }

  const schoolName = "SUCCESS SCHOOL INDI";
  const currentDate = new Date().toLocaleDateString('en-IN');
  const safeEventName = typeof eventName === 'string' ? eventName : 'Event';
  const watermarkText = `${schoolName} | ${safeEventName} | ${currentDate}`;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const maxDim = 1920;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = targetW;
      canvas.height = targetH;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const borderMargin = Math.max(12, Math.min(targetW, targetH) * 0.025);
      const borderWidth = Math.max(4, Math.min(targetW, targetH) * 0.004);
      const cornerRadius = Math.max(10, Math.min(targetW, targetH) * 0.012);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = borderWidth;

      ctx.beginPath();
      ctx.moveTo(borderMargin + cornerRadius, borderMargin);
      ctx.lineTo(canvas.width - borderMargin - cornerRadius, borderMargin);
      ctx.quadraticCurveTo(canvas.width - borderMargin, borderMargin, canvas.width - borderMargin, borderMargin + cornerRadius);
      ctx.lineTo(canvas.width - borderMargin, canvas.height - borderMargin - cornerRadius);
      ctx.quadraticCurveTo(canvas.width - borderMargin, canvas.height - borderMargin, canvas.width - borderMargin - cornerRadius, canvas.height - borderMargin);
      ctx.lineTo(borderMargin + cornerRadius, canvas.height - borderMargin);
      ctx.quadraticCurveTo(borderMargin, canvas.height - borderMargin, borderMargin, canvas.height - borderMargin - cornerRadius);
      ctx.lineTo(borderMargin, borderMargin + cornerRadius);
      ctx.quadraticCurveTo(borderMargin, borderMargin, borderMargin + cornerRadius, borderMargin);
      ctx.closePath();
      ctx.stroke();

      const fontSize = Math.max(22, Math.min(targetW, targetH) * 0.028);
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      const textMetrics = ctx.measureText(watermarkText);
      const textWidth = textMetrics.width;
      const textHeight = fontSize;

      const x = canvas.width / 2;
      const y = canvas.height - borderMargin - 15;
      const padding = 15;
      const textCornerRadius = 8;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.beginPath();
      ctx.moveTo(x - textWidth/2 - padding + textCornerRadius, y - textHeight - padding/2);
      ctx.lineTo(x + textWidth/2 + padding - textCornerRadius, y - textHeight - padding/2);
      ctx.quadraticCurveTo(x + textWidth/2 + padding, y - textHeight - padding/2, x + textWidth/2 + padding, y - textHeight - padding/2 + textCornerRadius);
      ctx.lineTo(x + textWidth/2 + padding, y + padding/2 - textCornerRadius);
      ctx.quadraticCurveTo(x + textWidth/2 + padding, y + padding/2, x + textWidth/2 + padding - textCornerRadius, y + padding/2);
      ctx.lineTo(x - textWidth/2 - padding + textCornerRadius, y + padding/2);
      ctx.quadraticCurveTo(x - textWidth/2 - padding, y + padding/2, x - textWidth/2 - padding, y + padding/2 - textCornerRadius);
      ctx.lineTo(x - textWidth/2 - padding, y - textHeight - padding/2 + textCornerRadius);
      ctx.quadraticCurveTo(x - textWidth/2 - padding, y - textHeight - padding/2, x - textWidth/2 - padding + textCornerRadius, y - textHeight - padding/2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillText(watermarkText, x, y);

      if (logoLoaded && schoolLogo && schoolLogo.complete) {
        const logoWidth = targetW * 0.4;
        const logoAspectRatio = schoolLogo.naturalWidth / schoolLogo.naturalHeight;
        const logoHeight = logoWidth / logoAspectRatio;
        const logoX = canvas.width - logoWidth - borderMargin - 15;
        const logoY = borderMargin + 15;

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(schoolLogo, logoX, logoY, logoWidth, logoHeight);
        ctx.restore();
      }

      canvas.toBlob(function(blob) {
        const reader = new FileReader();
        reader.onload = function(e) {
          const base64 = e.target.result.split(',')[1];
          const outName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
          callback({
            filename: outName,
            data: base64,
            contentType: 'image/jpeg',
            size: blob.size
          });
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.84);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

let noticeFocusTargetId = '';

function showNoticePopup(message, focusElementId = '', title = 'Action Required') {
  const modal = document.getElementById('noticeModal');
  const titleEl = document.getElementById('noticeModalTitle');
  const msgEl = document.getElementById('noticeModalMessage');
  if (!modal || !msgEl) {
    alert(message);
    return;
  }
  noticeFocusTargetId = focusElementId;
  if (titleEl) titleEl.textContent = title;
  msgEl.textContent = message;
  modal.style.display = 'flex';
}

function closeNoticeModal() {
  const modal = document.getElementById('noticeModal');
  if (modal) modal.style.display = 'none';
  if (noticeFocusTargetId) {
    const el = document.getElementById(noticeFocusTargetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
    noticeFocusTargetId = '';
  }
}

// Validate and return selected event and class names
function getSelectedEventAndClass() {
  const eventSelect = document.getElementById('eventName');
  const eventNameInput = document.getElementById('newEventName');
  const eventName = eventSelect && eventSelect.value === 'new' ? eventNameInput.value.trim() : (eventSelect ? eventSelect.value : '');

  const classSelect = document.getElementById('className');
  const classNameInput = document.getElementById('newClassName');
  const className = classSelect && classSelect.value === 'new' ? classNameInput.value.trim() : (classSelect ? classSelect.value : '');

  if (!eventName) {
    showNoticePopup('Please select or enter an event name first', 'eventName');
    return null;
  }
  if (eventSelect && eventSelect.value === 'new' && eventName.length < 3) {
    showNoticePopup('Event name must be at least 3 characters', 'newEventName');
    return null;
  }
  if (!className) {
    showNoticePopup('Please select or enter a class name first', 'className');
    return null;
  }
  if (classSelect && classSelect.value === 'new' && className.length < 2) {
    showNoticePopup('Class name must be at least 2 characters', 'newClassName');
    return null;
  }

  return { eventName, className };
}

let liveCameraStream = null;
let liveCameraFacing = 'environment';
let liveCameraSelection = null;
let livePendingReviewFile = null;
let livePendingReviewUrl = '';
let uploadWakeLock = null;

// Screen Wake Lock helper to keep uploads running reliably on mobile
async function requestUploadWakeLock() {
  try {
    if ('wakeLock' in navigator && !uploadWakeLock) {
      uploadWakeLock = await navigator.wakeLock.request('screen');
      uploadWakeLock.addEventListener('release', () => {
        uploadWakeLock = null;
      });
    }
  } catch (e) {}
}

function releaseUploadWakeLock() {
  try {
    if (uploadWakeLock) {
      uploadWakeLock.release();
      uploadWakeLock = null;
    }
  } catch (e) {}
}

// Persistent IndexedDB Queue (survives app minimize, screen off, sleep & tab close)
const IDB_NAME = 'SuccessGalleryUploadDB';
const IDB_STORE = 'pendingUploads';

function openClientUploadDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutUpload(item) {
  const db = await openClientUploadDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAllUploads() {
  const db = await openClientUploadDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbDeleteUpload(id) {
  const db = await openClientUploadDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function registerBackgroundSyncIfSupported() {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && 'sync' in reg) {
        await reg.sync.register('upload-pending-photos');
      } else if (reg && reg.active) {
        reg.active.postMessage({ type: 'TRIGGER_BG_UPLOAD' });
      }
    }
  } catch (e) {}
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'BG_UPLOAD_DONE') {
      instantCompletedCount++;
      updateCameraQueueUI();
      loadEvents({ silent: true, preserveEvent: event.data.eventName, preserveClass: event.data.className });
      loadRecentFolders();
    }
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    registerBackgroundSyncIfSupported();
  } else if (document.visibilityState === 'visible') {
    processInstantCameraQueue();
  }
});

window.addEventListener('online', () => {
  processInstantCameraQueue();
});

window.addEventListener('load', () => {
  setTimeout(() => processInstantCameraQueue(), 1200);
  const splash = document.getElementById('appSplashOverlay');
  if (splash) {
    setTimeout(() => {
      splash.classList.add('fade-out');
      setTimeout(() => { splash.style.display = 'none'; }, 500);
    }, 900);
  }
});

// Open in-app continuous camera viewfinder (falls back to native file input if unavailable)
async function triggerDirectCamera() {
  const selection = getSelectedEventAndClass();
  if (!selection) return;

  liveCameraSelection = selection;
  const continuousToggle = document.getElementById('continuousCameraToggle');
  const useLiveCamera = (!continuousToggle || continuousToggle.checked) &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function';

  if (useLiveCamera) {
    const opened = await openLiveCamera(selection);
    if (opened) return;
  }

  const cameraInput = document.getElementById('cameraInput');
  if (cameraInput) {
    cameraInput.value = '';
    cameraInput.click();
  }
}

let liveFlashEnabled = false;
let livePhysicalRotationDeg = 0;
let liveMotionListenerActive = false;
let liveAspectRatio = '4:3';

function updateLiveViewportAspect() {
  const viewport = document.getElementById('liveCameraViewport');
  const stage = document.querySelector('.live-camera-stage');
  const btn = document.getElementById('liveAspectBtn');
  if (btn) btn.textContent = liveAspectRatio;
  if (!viewport || !stage) return;

  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const isPortraitScreen = rect.height >= rect.width;
  const baseRatio = liveAspectRatio === '16:9' ? (16 / 9) : (4 / 3);
  const targetRatio = isPortraitScreen ? (1 / baseRatio) : baseRatio;

  let w = rect.width;
  let h = w / targetRatio;
  if (h > rect.height) {
    h = rect.height;
    w = h * targetRatio;
  }
  viewport.style.width = `${Math.round(w)}px`;
  viewport.style.height = `${Math.round(h)}px`;
}

function toggleLiveAspectRatio() {
  liveAspectRatio = liveAspectRatio === '4:3' ? '16:9' : '4:3';
  updateLiveViewportAspect();
}

window.addEventListener('resize', () => {
  const modal = document.getElementById('liveCameraModal');
  if (modal && modal.style.display !== 'none') {
    updateLiveViewportAspect();
  }
});

function updateLiveLevelUI(ax, ay, az) {
  const levelEl = document.getElementById('liveCameraLevel');
  const lineEl = document.getElementById('liveLevelLine');
  const degEl = document.getElementById('liveLevelDeg');
  if (!levelEl || !lineEl || !degEl) return;

  // When phone is held flat (e.g. shooting down at a document), show level as Flat
  if (typeof az === 'number' && Math.abs(az) > 8.6 && Math.hypot(ax, ay) < 3.5) {
    levelEl.classList.add('is-level');
    lineEl.style.transform = 'rotate(0deg)';
    degEl.textContent = '0°';
    return;
  }

  let tiltDeg = 0;
  if (Math.abs(ax) > Math.abs(ay)) {
    // Physical landscape
    tiltDeg = Math.atan2(ay, Math.abs(ax)) * (180 / Math.PI);
  } else {
    // Physical portrait
    tiltDeg = Math.atan2(ax, Math.abs(ay)) * (180 / Math.PI);
  }
  const rounded = Math.round(tiltDeg);
  const isLevel = Math.abs(tiltDeg) <= 1.5;
  levelEl.classList.toggle('is-level', isLevel);
  lineEl.style.transform = `rotate(${(-tiltDeg).toFixed(1)}deg)`;
  degEl.textContent = `${Math.abs(rounded)}°`;
}

function handleLiveDeviceMotion(e) {
  const g = e && e.accelerationIncludingGravity;
  if (!g || typeof g.x !== 'number' || typeof g.y !== 'number') return;
  const ax = g.x;
  const ay = g.y;
  const az = typeof g.z === 'number' ? g.z : 0;
  // Detect physical landscape tilt even when OS Auto-Rotate is disabled
  if (Math.abs(ax) > Math.abs(ay) * 1.35 && Math.abs(ax) > 4.5) {
    livePhysicalRotationDeg = ax > 0 ? -90 : 90;
  } else if (Math.abs(ay) > Math.abs(ax) * 1.35 && Math.abs(ay) > 4.5) {
    livePhysicalRotationDeg = 0;
  }
  updateLiveLevelUI(ax, ay, az);
}

function startLiveOrientationSensor() {
  livePhysicalRotationDeg = 0;
  if (!liveMotionListenerActive && typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
    window.addEventListener('devicemotion', handleLiveDeviceMotion);
    liveMotionListenerActive = true;
  }
}

function stopLiveOrientationSensor() {
  if (liveMotionListenerActive) {
    window.removeEventListener('devicemotion', handleLiveDeviceMotion);
    liveMotionListenerActive = false;
  }
  livePhysicalRotationDeg = 0;
}

function updateLiveFlashButtonState() {
  const btn = document.getElementById('liveFlashBtn');
  if (!btn) return;
  const track = liveCameraStream && liveCameraStream.getVideoTracks()[0];
  const caps = track && typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
  const supported = Boolean(caps && caps.torch);
  btn.classList.toggle('flash-unsupported', !supported);
  btn.classList.toggle('flash-on', Boolean(supported && liveFlashEnabled));
  btn.title = supported
    ? (liveFlashEnabled ? 'Flash Light: ON (Tap to turn off)' : 'Flash Light: OFF (Tap to turn on)')
    : 'Flash Light not supported on this camera';
}

async function toggleLiveCameraFlash() {
  const track = liveCameraStream && liveCameraStream.getVideoTracks()[0];
  if (!track) return;
  const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
  if (!caps || !caps.torch) {
    showNoticePopup('Flash light is not supported on this camera (try switching to the rear camera).', '', 'Flash Unavailable');
    liveFlashEnabled = false;
    updateLiveFlashButtonState();
    return;
  }
  const nextState = !liveFlashEnabled;
  try {
    await track.applyConstraints({ advanced: [{ torch: nextState }] });
    liveFlashEnabled = nextState;
  } catch (err) {
    console.warn('Torch toggle failed:', err.message);
    liveFlashEnabled = false;
  }
  updateLiveFlashButtonState();
}

async function openLiveCamera(selection) {
  const modal = document.getElementById('liveCameraModal');
  const video = document.getElementById('liveCameraVideo');
  const destLabel = document.getElementById('liveCameraDestLabel');
  if (!modal || !video) return false;

  if (destLabel && selection) {
    destLabel.textContent = `${selection.eventName} > ${selection.className}`;
  }
  cancelLiveCapturedPhoto();
  updateCameraQueueUI();
  requestUploadWakeLock();
  startLiveOrientationSensor();

  try {
    stopLiveCameraStream();
    startLiveOrientationSensor();
    liveCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: liveCameraFacing },
        width: { ideal: 4096 },
        height: { ideal: 3072 },
        focusMode: { ideal: 'continuous' }
      },
      audio: false
    });
    video.srcObject = liveCameraStream;
    await video.play();
    liveFlashEnabled = false;
    updateLiveFlashButtonState();
    modal.style.display = 'flex';
    requestAnimationFrame(() => updateLiveViewportAspect());
    return true;
  } catch (err) {
    console.warn('Live camera unavailable, falling back to system camera:', err.message);
    stopLiveOrientationSensor();
    return false;
  }
}

function stopLiveCameraStream() {
  if (liveCameraStream) {
    liveCameraStream.getTracks().forEach((t) => {
      if (liveFlashEnabled && typeof t.applyConstraints === 'function') {
        t.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      }
      t.stop();
    });
    liveCameraStream = null;
  }
  liveFlashEnabled = false;
  updateLiveFlashButtonState();
  stopLiveOrientationSensor();
  const video = document.getElementById('liveCameraVideo');
  if (video) video.srcObject = null;
}

function closeLiveCamera() {
  cancelLiveCapturedPhoto();
  stopLiveCameraStream();
  const modal = document.getElementById('liveCameraModal');
  if (modal) modal.style.display = 'none';
  if (instantUploadingCount === 0) {
    releaseUploadWakeLock();
  }
}

async function switchLiveCameraFacing() {
  liveCameraFacing = liveCameraFacing === 'environment' ? 'user' : 'environment';
  if (liveCameraSelection) {
    await openLiveCamera(liveCameraSelection);
  }
}

function showLiveReviewOverlay(file) {
  cancelLiveCapturedPhoto();
  livePendingReviewFile = file;
  livePendingReviewUrl = URL.createObjectURL(file);
  const img = document.getElementById('liveCameraReviewImg');
  const overlay = document.getElementById('liveCameraReviewOverlay');
  if (img) img.src = livePendingReviewUrl;
  if (overlay) overlay.style.display = 'flex';
}

function cancelLiveCapturedPhoto() {
  const overlay = document.getElementById('liveCameraReviewOverlay');
  const img = document.getElementById('liveCameraReviewImg');
  if (overlay) overlay.style.display = 'none';
  if (img) img.src = '';
  if (livePendingReviewUrl) {
    URL.revokeObjectURL(livePendingReviewUrl);
    livePendingReviewUrl = '';
  }
  livePendingReviewFile = null;
}

async function confirmLiveCapturedPhoto() {
  if (!livePendingReviewFile || !liveCameraSelection) {
    cancelLiveCapturedPhoto();
    return;
  }
  const file = livePendingReviewFile;
  const selection = { ...liveCameraSelection };
  cancelLiveCapturedPhoto();
  await enqueuePhotoForBackgroundUpload(file, selection.eventName, selection.className);
}

function getBlobDimensions(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function rotateImageBlob(blob, degrees, quality = 0.92) {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 0) return Promise.resolve(blob);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const swap = normalized === 90 || normalized === 270;
      const canvas = document.createElement('canvas');
      canvas.width = swap ? h : w;
      canvas.height = swap ? w : h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((normalized * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((outBlob) => {
        resolve(outBlob || blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}

function cropImageToAspectRatio(blob, targetRatio, quality = 0.84) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const isLandscape = w >= h;
      const desiredAspect = isLandscape ? targetRatio : (1 / targetRatio);
      const currentAspect = w / h;

      if (Math.abs(currentAspect - desiredAspect) <= 0.02) {
        URL.revokeObjectURL(url);
        return resolve(blob);
      }

      let sx = 0, sy = 0, sw = w, sh = h;
      if (currentAspect > desiredAspect) {
        sw = Math.round(h * desiredAspect);
        sx = Math.round((w - sw) / 2);
      } else {
        sh = Math.round(w / desiredAspect);
        sy = Math.round((h - sh) / 2);
      }

      const maxDim = 1920;
      const scale = Math.min(1, maxDim / Math.max(sw, sh));
      const outW = Math.max(1, Math.round(sw * scale));
      const outH = Math.max(1, Math.round(sh * scale));

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      URL.revokeObjectURL(url);
      canvas.toBlob((outBlob) => resolve(outBlob || blob), 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}

async function rotateLiveCapturedPhoto() {
  if (!livePendingReviewFile) return;
  const rotatedBlob = await rotateImageBlob(livePendingReviewFile, 90, 0.92);
  const rotatedFile = new File([rotatedBlob], livePendingReviewFile.name, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });
  showLiveReviewOverlay(rotatedFile);
}

async function captureLiveCameraPhoto() {
  const video = document.getElementById('liveCameraVideo');
  const flash = document.getElementById('liveCameraFlash');
  const shutterBtn = document.getElementById('liveShutterBtn');
  if (!video || !liveCameraSelection) return;

  if (flash) {
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 140);
  }
  if (shutterBtn) shutterBtn.disabled = true;

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const uniqueSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const fileName = `photo_${timestamp}_${uniqueSuffix}.jpg`;
    const videoHasSize = video.videoWidth > 0 && video.videoHeight > 0;
    const videoIsLandscape = videoHasSize ? (video.videoWidth >= video.videoHeight) : null;
    // If OS Auto-Rotate is off so video stays portrait while phone is held sideways,
    // rotate the captured photo into true landscape using the gravity sensor angle.
    const extraRotateDeg = (videoIsLandscape === false && livePhysicalRotationDeg !== 0)
      ? livePhysicalRotationDeg
      : 0;

    // Prefer full-resolution ImageCapture API for crisp, clear camera photos
    const track = liveCameraStream && liveCameraStream.getVideoTracks()[0];
    if (track && typeof ImageCapture === 'function') {
      try {
        const imageCapture = new ImageCapture(track);
        const rawBlob = await imageCapture.takePhoto();
        const dims = await getBlobDimensions(rawBlob);
        const photoIsLandscape = dims ? (dims.width >= dims.height) : null;

        // Guard against Android ImageCapture.takePhoto() orientation bug where
        // takePhoto() returns portrait for a landscape viewfinder (or vice versa)
        if (!dims || videoIsLandscape === null || photoIsLandscape === videoIsLandscape) {
          const rawFile = new File([rawBlob], fileName, { type: rawBlob.type || 'image/jpeg', lastModified: Date.now() });
          const compressed = await compressPhotoHighQuality(rawFile, 1920, 0.84);
          const orientedBlob = extraRotateDeg ? await rotateImageBlob(compressed.blob, extraRotateDeg, 0.84) : compressed.blob;
          const targetRatio = liveAspectRatio === '16:9' ? (16 / 9) : (4 / 3);
          const croppedBlob = await cropImageToAspectRatio(orientedBlob, targetRatio, 0.84);
          const finalFile = new File([croppedBlob], fileName, { type: 'image/jpeg', lastModified: Date.now() });
          showLiveReviewOverlay(finalFile);
          return;
        } else {
          console.warn(`ImageCapture orientation mismatch (photo ${dims.width}x${dims.height} vs video ${video.videoWidth}x${video.videoHeight}), using video frame`);
        }
      } catch (icErr) {
        console.warn('ImageCapture fallback to video frame:', icErr.message);
      }
    }

    if (!video.videoWidth || !video.videoHeight) return;
    const maxDim = 1920;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, w, h);

    await new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (blob) {
          const orientedBlob = extraRotateDeg ? await rotateImageBlob(blob, extraRotateDeg, 0.84) : blob;
          const targetRatio = liveAspectRatio === '16:9' ? (16 / 9) : (4 / 3);
          const croppedBlob = await cropImageToAspectRatio(orientedBlob, targetRatio, 0.84);
          const capturedFile = new File([croppedBlob], fileName, { type: 'image/jpeg', lastModified: Date.now() });
          showLiveReviewOverlay(capturedFile);
        }
        resolve();
      }, 'image/jpeg', 0.84);
    });
  } finally {
    if (shutterBtn) shutterBtn.disabled = false;
  }
}

let instantCameraQueue = [];
let instantUploadingCount = 0;
let instantCompletedCount = 0;
let instantFailedCount = 0;

async function updateCameraQueueUI() {
  const box = document.getElementById('cameraQueueStatus');
  const liveText = document.getElementById('liveCameraQueueText');
  let idbPending = 0;
  try {
    const items = await idbGetAllUploads();
    idbPending = items.length;
  } catch (e) {}
  const pending = Math.max(idbPending, instantCameraQueue.length + instantUploadingCount);
  const parts = [];
  if (pending > 0) parts.push(`<i class="fas fa-spinner fa-spin"></i> Uploading ${pending} photo(s)...`);
  if (instantCompletedCount > 0) parts.push(`<span style="color: var(--success);">✅ ${instantCompletedCount} uploaded</span>`);
  if (instantFailedCount > 0) parts.push(`<span style="color: var(--error);">⚠️ ${instantFailedCount} failed</span>`);

  if (liveText) {
    liveText.innerHTML = parts.length > 0 ? parts.join(' • ') : 'Ready to capture';
  }

  if (!box) return;
  if (pending === 0 && instantCompletedCount === 0 && instantFailedCount === 0) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  box.innerHTML = parts.join(' &nbsp;•&nbsp; ');
}

async function enqueuePhotoForBackgroundUpload(file, eventName, className) {
  requestUploadWakeLock();
  const id = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const compressedOriginal = await compressPhotoHighQuality(file, 1920, 0.84);
    const files = [];
    const originalFiles = [];

    if (watermarkEnabled) {
      const watermarked = await new Promise((resolve) => {
        addWatermarkToImage(file, eventName, className, resolve);
      });
      const wmBlob = base64ToBlob(watermarked.data, watermarked.contentType);
      files.push({ blob: wmBlob, filename: watermarked.filename });
      originalFiles.push({ blob: compressedOriginal.blob, filename: compressedOriginal.filename });
    } else {
      files.push({ blob: compressedOriginal.blob, filename: compressedOriginal.filename });
    }

    await idbPutUpload({
      id,
      eventName,
      className,
      addWatermark: watermarkEnabled,
      files,
      originalFiles,
      status: 'pending',
      createdAt: Date.now()
    });
    if (document.visibilityState === 'hidden' || !navigator.onLine) {
      await registerBackgroundSyncIfSupported();
    }
    updateCameraQueueUI();
    processInstantCameraQueue();
  } catch (err) {
    instantFailedCount++;
    updateCameraQueueUI();
    showStatus('Error queueing photo: ' + err.message, 'error');
  }
}

// Immediately queue captured photo for background compression & upload without blocking next shot
function handleDirectCameraCapture() {
  const cameraInput = document.getElementById('cameraInput');
  if (!cameraInput || !cameraInput.files || cameraInput.files.length === 0) return;

  const selection = getSelectedEventAndClass();
  if (!selection) return;

  const file = cameraInput.files[0];
  if (file.size > 500 * 1024 * 1024) {
    showNoticePopup('Captured photo exceeds 500MB limit and cannot be uploaded', '', 'File Too Large');
    cameraInput.value = '';
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const uniqueSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'jpg';
  const renamedFile = new File([file], `photo_${timestamp}_${uniqueSuffix}.${ext}`, {
    type: file.type || 'image/jpeg',
    lastModified: file.lastModified
  });

  enqueuePhotoForBackgroundUpload(renamedFile, selection.eventName, selection.className);
  cameraInput.value = '';
}

async function processInstantCameraQueue() {
  if (instantUploadingCount > 0) return;

  const runQueueStep = async () => {
    let items = [];
    try {
      items = await idbGetAllUploads();
    } catch (e) {
      return false;
    }
    if (!items.length) {
      if (!liveCameraStream) releaseUploadWakeLock();
      updateCameraQueueUI();
      return false;
    }

    const now = Date.now();
    const item = items.find((it) => it.status !== 'uploading' || !it.startedAt || (now - it.startedAt) >= 120000);
    if (!item) return false;

    instantUploadingCount++;
    requestUploadWakeLock();
    item.status = 'uploading';
    item.startedAt = Date.now();
    await idbPutUpload(item);
    updateCameraQueueUI();

    try {
      const formData = new FormData();
      formData.append('eventName', item.eventName);
      formData.append('className', item.className);
      formData.append('addWatermark', item.addWatermark ? 'true' : 'false');
      (item.files || []).forEach((f) => formData.append('files', f.blob, f.filename));
      (item.originalFiles || []).forEach((f) => formData.append('originalFiles', f.blob, f.filename));

      const res = await fetch('/api/upload-multipart', {
        method: 'POST',
        body: formData
      });
      const result = await res.json();

      if (res.ok && result && result.status === 'success') {
        await idbDeleteUpload(item.id);
        instantCompletedCount++;
        loadEvents({ silent: true, preserveEvent: item.eventName, preserveClass: item.className });
        loadRecentFolders();
      } else {
        item.status = 'pending';
        await idbPutUpload(item);
        instantFailedCount++;
        showStatus(`Instant upload failed: ${(result && result.message) || res.status}`, 'error');
      }
    } catch (err) {
      item.status = 'pending';
      await idbPutUpload(item);
      await registerBackgroundSyncIfSupported();
      instantFailedCount++;
    } finally {
      instantUploadingCount--;
      updateCameraQueueUI();
    }
    return true;
  };

  let hadMore = false;
  if (navigator.locks && typeof navigator.locks.request === 'function') {
    hadMore = await navigator.locks.request('sg_upload_queue_lock', async () => runQueueStep());
  } else {
    hadMore = await runQueueStep();
  }
  if (hadMore) {
    setTimeout(() => processInstantCameraQueue(), 150);
  }
}

// Upload Files Action
function uploadFiles() {
  const selection = getSelectedEventAndClass();
  if (!selection) return;
  if (selectedFiles.length === 0) return showNoticePopup('Please select at least one file');

  if (!watermarkEnabled) {
    if (!confirm('Watermark is turned OFF. Images will be uploaded without watermark or border.\n\nClick OK to continue or Cancel to turn watermark ON.')) {
      document.getElementById('watermarkToggle').checked = true;
      toggleWatermark();
      return;
    }
  }

  processAndUploadFiles(selectedFiles, selection.eventName, selection.className, false);
}

// Convert base64 string to Blob for multipart upload
function base64ToBlob(base64, contentType) {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 8192) {
    const slice = byteCharacters.slice(offset, offset + 8192);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: contentType || 'application/octet-stream' });
}

// Shared processing & upload pipeline for both manual and instant camera uploads
function processAndUploadFiles(filesToUpload, eventName, className, isInstantCamera = false) {
  const loading = document.getElementById('loading');
  const progressContainer = document.getElementById('progressContainer');
  const takePhotoBtn = document.getElementById('takePhotoBtn');
  if (loading) loading.style.display = 'block';
  if (progressContainer) progressContainer.style.display = 'block';
  if (takePhotoBtn) takePhotoBtn.disabled = true;

  updateProgress(0);
  showStatus(
    isInstantCamera
      ? `Photo captured! ${watermarkEnabled ? 'Applying watermark & ' : ''}uploading immediately...`
      : `Preparing files ${watermarkEnabled ? 'with watermark' : 'without watermark'}...`,
    'success'
  );

  const preparedBlobs = [];
  const originalBlobs = [];
  let processedCount = 0;

  filesToUpload.forEach((file, index) => {
    if (file.type.startsWith('image/') && watermarkEnabled) {
      compressPhotoHighQuality(file).then((compressedOrig) => {
        originalBlobs[index] = compressedOrig;
        addWatermarkToImage(file, eventName, className, function(watermarkedFile) {
          preparedBlobs[index] = {
            blob: base64ToBlob(watermarkedFile.data, watermarkedFile.contentType),
            filename: watermarkedFile.filename
          };
          processedCount++;
          updateProgress((processedCount / filesToUpload.length) * 30);

          if (processedCount === filesToUpload.length) {
            uploadToDrive(preparedBlobs, eventName, className, originalBlobs);
          }
        });
      });
    } else if (file.type.startsWith('image/')) {
      compressPhotoHighQuality(file).then((compressedOrig) => {
        preparedBlobs[index] = compressedOrig;
        processedCount++;
        updateProgress((processedCount / filesToUpload.length) * 30);

        if (processedCount === filesToUpload.length) {
          uploadToDrive(preparedBlobs, eventName, className, originalBlobs);
        }
      });
    } else {
      preparedBlobs[index] = {
        blob: file,
        filename: file.name
      };
      processedCount++;
      updateProgress((processedCount / filesToUpload.length) * 30);

      if (processedCount === filesToUpload.length) {
        uploadToDrive(preparedBlobs, eventName, className, originalBlobs);
      }
    }
  });
}

function uploadMultipartWithProgress(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload-multipart', true);

    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable) {
        const uploadPct = 30 + (e.loaded / e.total) * 70;
        updateProgress(uploadPct);
      }
    };

    xhr.onload = function() {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json);
        } else {
          reject(new Error((json && json.message) || `Server error (${xhr.status})`));
        }
      } catch (err) {
        reject(new Error(`Server error (${xhr.status})`));
      }
    };

    xhr.onerror = function() {
      reject(new Error('Network error during upload. Please check your connection.'));
    };

    xhr.send(formData);
  });
}

async function uploadToDrive(preparedBlobs, eventName, className, originalBlobs = []) {
  const validItems = preparedBlobs.filter(item => item !== undefined);
  const validOriginals = (originalBlobs || []).filter(item => item !== undefined);
  const takePhotoBtn = document.getElementById('takePhotoBtn');

  try {
    const formData = new FormData();
    formData.append('eventName', eventName);
    formData.append('className', className);
    formData.append('addWatermark', watermarkEnabled ? 'true' : 'false');
    validItems.forEach((item) => {
      formData.append('files', item.blob, item.filename);
    });
    validOriginals.forEach((item) => {
      formData.append('originalFiles', item.blob, item.filename);
    });

    const result = await uploadMultipartWithProgress(formData);

    const loading = document.getElementById('loading');
    const progressContainer = document.getElementById('progressContainer');
    if (loading) loading.style.display = 'none';
    if (progressContainer) progressContainer.style.display = 'none';
    if (takePhotoBtn) takePhotoBtn.disabled = false;

    if (result.status === 'success') {
      let message = `<strong>Upload successful!</strong><br>`;
      message += `${result.urls.length} file${result.urls.length !== 1 ? 's' : ''} saved `;
      if (result.withWatermarkFolderUrl && result.withoutWatermarkFolderUrl) {
        message += `into separate folders for <strong>${eventName} &gt; ${className}</strong>:<br>`;
        message += `<div style="margin: 8px 0; display: flex; flex-wrap: wrap; gap: 8px;">`;
        message += `<a href="${result.withWatermarkFolderUrl}" target="_blank" style="font-weight: 600;"><i class="fab fa-whatsapp"></i> With Watermark (WhatsApp)</a>`;
        message += `<a href="${result.withoutWatermarkFolderUrl}" target="_blank" style="font-weight: 600;"><i class="fas fa-folder-open"></i> Without Watermark (Original)</a>`;
        message += `</div>`;
      } else {
        message += result.watermarkApplied ? '<strong>WITH watermark</strong> ' : '<strong>WITHOUT watermark</strong> ';
        message += `to <a href="${result.folderUrl}" target="_blank">${eventName} &gt; ${className}</a><br><br>`;
      }

      message += '<strong>Uploaded files:</strong><ul>';
      result.urls.forEach(function(file) {
        if (file.url) {
          message += `<li><a href="${file.url}" target="_blank">${file.savedName}</a></li>`;
        } else {
          message += `<li>${file.originalName} - <span style="color: var(--error);">${file.error}</span></li>`;
        }
      });
      message += '</ul>';

      showStatus(message, 'success');
      clearSelection(false);

      loadEvents({ silent: true, preserveEvent: eventName, preserveClass: className });
      initializeFolderView();
      loadRecentFolders();
    } else {
      showStatus('Error: ' + result.message, 'error');
    }
  } catch (error) {
    const loading = document.getElementById('loading');
    const progressContainer = document.getElementById('progressContainer');
    if (loading) loading.style.display = 'none';
    if (progressContainer) progressContainer.style.display = 'none';
    if (takePhotoBtn) takePhotoBtn.disabled = false;
    showStatus('Upload Error: ' + error.message, 'error');
  }
}

function readFileAsDataURL(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const data = e.target.result.split(',')[1];
      resolve({
        filename: file.name,
        data: data,
        contentType: file.type,
        size: file.size
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropArea = document.getElementById('dropArea');
  if (dropArea) dropArea.classList.add('active');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropArea = document.getElementById('dropArea');
  if (dropArea) dropArea.classList.remove('active');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropArea = document.getElementById('dropArea');
  if (dropArea) dropArea.classList.remove('active');

  const files = e.dataTransfer.files;
  if (files.length) processFiles(files);
}

function handleFileSelect() {
  const fileInput = document.getElementById('fileInput');
  if (fileInput && fileInput.files.length) {
    processFiles(fileInput.files);
  }
}

function processFiles(files) {
  const supportedFiles = Array.from(files).filter(file =>
    file.type.match('image.*') ||
    file.type.match('video.*') ||
    file.name.toLowerCase().endsWith('.pdf')
  );

  if (supportedFiles.length === 0) {
    showStatus('Please select only supported files (images, videos, PDFs)', 'error');
    return;
  }

  const oversizedFiles = supportedFiles.filter(file => file.size > 500 * 1024 * 1024);
  if (oversizedFiles.length > 0) {
    showStatus(`Some files exceed 500MB limit and won't be uploaded: ${oversizedFiles.map(f => f.name).join(', ')}`, 'warning');
  }

  const validFiles = supportedFiles.filter(file => file.size <= 500 * 1024 * 1024);
  validFiles.forEach(file => {
    if (!selectedFiles.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
      selectedFiles.push(file);
    }
  });

  updateFilePreview();
  updateFileCount();
}

function updateFilePreview() {
  const preview = document.getElementById('preview');
  if (!preview) return;

  preview.innerHTML = '';
  if (selectedFiles.length === 0) {
    preview.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--gray); padding: 2rem;">No files selected</p>';
    return;
  }

  selectedFiles.forEach((file, index) => {
    const previewItem = document.createElement('div');
    previewItem.className = 'preview-item';

    const isImage = file.type.includes('image');
    const isVideo = file.type.includes('video');
    const isPDF = file.name.toLowerCase().endsWith('.pdf');

    let thumbnailContent = '';
    if (isImage) {
      const objectUrl = URL.createObjectURL(file);
      thumbnailContent = `<img src="${objectUrl}" alt="${file.name}" data-index="${index}">`;
    } else if (isVideo) {
      thumbnailContent = `<div style="display: flex; align-items: center; justify-content: center; height: 140px; background-color: var(--light-gray);"><i class="fas fa-play-circle" style="font-size: 2rem; color: var(--primary);"></i></div>`;
    } else if (isPDF) {
      thumbnailContent = `<div style="display: flex; align-items: center; justify-content: center; height: 140px; background-color: var(--error-light);"><i class="fas fa-file-pdf" style="font-size: 2rem; color: var(--error);"></i></div>`;
    }

    previewItem.innerHTML = `
      ${thumbnailContent}
      <button class="remove-btn" onclick="removeFile(${index})"><i class="fas fa-times"></i></button>
      <div class="file-info">
        <div class="file-name" title="${file.name}">${file.name}</div>
        <div class="file-size">${formatFileSize(file.size)}</div>
      </div>
    `;

    preview.appendChild(previewItem);
  });
}

function updateFileCount() {
  const countElement = document.getElementById('fileCount');
  if (!countElement) return;

  const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  if (selectedFiles.length === 0) {
    countElement.textContent = '0 files selected';
  } else {
    countElement.textContent = `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''} selected • ${formatFileSize(totalSize)}`;
  }
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  updateFilePreview();
  updateFileCount();
}

function clearSelection(askConfirmation = true) {
  if (selectedFiles.length === 0) return;
  if (askConfirmation && !confirm('Are you sure you want to clear all selected files?')) {
    return;
  }
  selectedFiles = [];
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = '';
  updateFilePreview();
  updateFileCount();
  if (askConfirmation) {
    showStatus('Selection cleared', 'success');
  }
}

function updateProgress(percent) {
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    progressBar.style.width = Math.round(percent) + '%';
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  if (statusDiv) {
    statusDiv.className = `status-${type}`;
    statusDiv.innerHTML = message;
    statusDiv.style.display = 'block';

    if (type === 'success') {
      setTimeout(() => {
        if (statusDiv.className === `status-${type}`) {
          statusDiv.style.display = 'none';
        }
      }, 5000);
    }
  }
}

function toggleWatermark() {
  const toggle = document.getElementById('watermarkToggle');
  const statusText = document.getElementById('watermarkStatusText');

  watermarkEnabled = toggle.checked;
  if (watermarkEnabled) {
    statusText.textContent = 'ON';
    statusText.className = 'watermark-status watermark-on';
    showStatus('Watermark and border will be applied to images', 'success');
  } else {
    statusText.textContent = 'OFF';
    statusText.className = 'watermark-status watermark-off';
    showStatus('Watermark and border will NOT be applied to images', 'warning');
  }
}

// Delete Tab logic
async function loadEventsForDeletion(showRefresh = false) {
  const container = document.getElementById('deleteEventsContainer');
  if (!showRefresh) {
    container.innerHTML = `<div class="loading-delete"><div class="spinner"></div><p>Loading events and classes...</p></div>`;
  }

  try {
    const result = await apiCall('/api/manage/events');
    if (result.status === 'success') {
      displayEventsForDeletion(result.data);
    } else {
      showDeleteTabError(result.message);
    }
  } catch (error) {
    showDeleteTabError(error.message);
  }
}

function displayEventsForDeletion(events) {
  const container = document.getElementById('deleteEventsContainer');

  if (!events || events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-folder-open"></i>
        <h3>No events found</h3>
        <p>No events have been created yet. Upload some files to create events.</p>
        <button class="btn-primary" onclick="switchTab('upload')" style="margin-top: 1rem;">
          <i class="fas fa-cloud-upload-alt"></i> Go to Upload
        </button>
      </div>
    `;
    return;
  }

  eventsForDeletion = events;
  let html = '<div class="events-container">';

  events.forEach((event, eventIndex) => {
    const eventName = event.name || 'Unknown Event';
    const classCount = event.classCount || 0;
    const dateCreated = event.dateCreated ? new Date(event.dateCreated).toLocaleDateString('en-IN') : 'Unknown date';

    html += `
      <div class="event-card" id="event-${eventIndex}">
        <div class="event-header">
          <div>
            <div class="event-title">${eventName}</div>
            <div class="event-info">
              <span class="event-info-item"><i class="fas fa-folder"></i> ${classCount} class${classCount !== 1 ? 'es' : ''}</span>
              <span class="event-info-item"><i class="fas fa-calendar-alt"></i> Created: ${dateCreated}</span>
            </div>
          </div>
          <div class="event-actions">
            <a href="${event.url}" target="_blank" class="view-class-btn"><i class="fas fa-external-link-alt"></i> Open</a>
            <button class="delete-event-btn" onclick="showDeleteEventConfirmation('${eventName}', ${eventIndex})"><i class="fas fa-trash-alt"></i> Delete Event</button>
          </div>
        </div>
        <div class="event-details">
          <h4 style="margin-bottom: 1rem; color: var(--gray); font-size: 0.875rem;"><i class="fas fa-users"></i> Classes in this event</h4>
          <div class="classes-list">
    `;

    const classes = event.classes || [];
    if (classes.length === 0) {
      html += `<div style="text-align: center; padding: 1rem; color: var(--gray);"><i class="fas fa-info-circle"></i> No classes in this event</div>`;
    } else {
      classes.forEach((cls, classIndex) => {
        const className = cls.name || 'Unknown Class';
        const fileCount = cls.fileCount || 0;
        const clsDate = cls.dateCreated ? new Date(cls.dateCreated).toLocaleDateString('en-IN') : 'Unknown date';

        html += `
          <div class="class-item" id="class-${eventIndex}-${classIndex}">
            <div class="class-info">
              <div class="class-icon"><i class="fas fa-folder"></i></div>
              <div class="class-details">
                <div class="class-name">${className}</div>
                <div class="class-stats">
                  <span><i class="fas fa-file"></i> ${fileCount} files</span>
                  <span><i class="fas fa-calendar-alt"></i> ${clsDate}</span>
                </div>
              </div>
            </div>
            <div class="class-actions">
              <a href="${cls.url}" target="_blank" class="view-class-btn"><i class="fas fa-external-link-alt"></i> Open</a>
              <button class="delete-class-btn" onclick="showDeleteClassConfirmation('${eventName}', '${className}', ${eventIndex}, ${classIndex})"><i class="fas fa-trash-alt"></i> Delete</button>
            </div>
          </div>
        `;
      });
    }

    html += `</div></div></div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

function showDeleteTabError(message) {
  const container = document.getElementById('deleteEventsContainer');
  container.innerHTML = `
    <div style="color: var(--error); padding: 2rem; text-align: center;">
      <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
      <p>${message}</p>
      <button onclick="loadEventsForDeletion(true)" class="refresh-btn" style="margin-top: 1rem;">
        <i class="fas fa-sync-alt"></i> Try Again
      </button>
    </div>
  `;
}

function showDeleteEventConfirmation(eventName, eventIndex) {
  currentDeletion = { type: 'event', eventName, eventIndex, className: '', classIndex: -1 };
  const modal = document.getElementById('confirmationModal');
  document.getElementById('modalTitle').textContent = `Delete Event: ${eventName}`;
  document.getElementById('modalMessage').innerHTML = `
    <strong>⚠️ WARNING: This action cannot be undone!</strong><br><br>
    You are about to delete the entire event <strong>"${eventName}"</strong>.<br><br>
    This will delete:
    <ul>
      <li>All class folders within this event</li>
      <li>All files within those class folders</li>
      <li>The event folder itself</li>
    </ul>
    <strong>Are you absolutely sure you want to proceed?</strong>
  `;
  document.getElementById('confirmDeleteBtn').innerHTML = '<i class="fas fa-trash-alt"></i> Delete Entire Event';
  modal.style.display = 'flex';
}

function showDeleteClassConfirmation(eventName, className, eventIndex, classIndex) {
  currentDeletion = { type: 'class', eventName, className, eventIndex, classIndex };
  const modal = document.getElementById('confirmationModal');
  document.getElementById('modalTitle').textContent = `Delete Class: ${className}`;
  document.getElementById('modalMessage').innerHTML = `
    <strong>⚠️ WARNING: This action cannot be undone!</strong><br><br>
    You are about to delete class folder <strong>"${className}"</strong> from event <strong>"${eventName}"</strong>.
  `;
  document.getElementById('confirmDeleteBtn').innerHTML = '<i class="fas fa-trash-alt"></i> Delete Class Folder';
  modal.style.display = 'flex';
}

function cancelDeletion() {
  document.getElementById('confirmationModal').style.display = 'none';
  currentDeletion = { type: '', eventName: '', className: '', eventIndex: -1, classIndex: -1 };
}

function confirmDeletion() {
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
  }

  if (currentDeletion.type === 'event') {
    deleteEvent();
  } else if (currentDeletion.type === 'class') {
    deleteClass();
  }
}

async function deleteEvent() {
  try {
    const result = await apiCall(`/api/manage/event/${encodeURIComponent(currentDeletion.eventName)}`, 'DELETE');
    document.getElementById('confirmationModal').style.display = 'none';

    if (result.status === 'success') {
      showStatus(result.message, 'success');
      const eventCard = document.getElementById(`event-${currentDeletion.eventIndex}`);
      if (eventCard) eventCard.style.display = 'none';

      loadEvents();
      initializeFolderView();
      loadRecentFolders();
    } else {
      showStatus('Error: ' + result.message, 'error');
    }
  } catch (error) {
    document.getElementById('confirmationModal').style.display = 'none';
    showStatus('Deletion Error: ' + error.message, 'error');
  }
}

async function deleteClass() {
  try {
    const result = await apiCall(`/api/manage/class/${encodeURIComponent(currentDeletion.eventName)}/${encodeURIComponent(currentDeletion.className)}`, 'DELETE');
    document.getElementById('confirmationModal').style.display = 'none';

    if (result.status === 'success') {
      showStatus(result.message, 'success');
      const classItem = document.getElementById(`class-${currentDeletion.eventIndex}-${currentDeletion.classIndex}`);
      if (classItem) classItem.style.display = 'none';

      loadEvents();
      initializeFolderView();
      loadRecentFolders();
    } else {
      showStatus('Error: ' + result.message, 'error');
    }
  } catch (error) {
    document.getElementById('confirmationModal').style.display = 'none';
    showStatus('Deletion Error: ' + error.message, 'error');
  }
}

// WhatsApp tab functionality
function initializeWhatsAppTab() {
  loadWhatsAppEvents();
}

async function loadWhatsAppEvents() {
  const select = document.getElementById('whatsappEventSelect');
  if (select) {
    select.innerHTML = '<option value="">-- Loading Events --</option>';
    select.disabled = true;
  }

  try {
    const result = await apiCall('/api/whatsapp/events');
    if (result.status === 'success' && select) {
      select.innerHTML = '<option value="">-- Select Event --</option>';
      select.disabled = false;

      if (result.data && result.data.length > 0) {
        result.data.forEach(eventName => {
          const option = document.createElement('option');
          option.value = eventName;
          option.textContent = eventName;
          select.appendChild(option);
        });

        select.onchange = function() {
          const eventName = this.value;
          if (eventName) {
            loadWhatsAppClasses(eventName);
          } else {
            const classSelect = document.getElementById('whatsappClassSelect');
            if (classSelect) {
              classSelect.innerHTML = '<option value="">-- Select Class --</option>';
              classSelect.disabled = true;
            }
            document.getElementById('whatsappPreview').textContent = 'Select a folder to preview the WhatsApp message...';
            currentWhatsAppData = null;
            updateWhatsAppButtons(false);
          }
        };
      } else {
        select.innerHTML = '<option value="">-- No Events Found --</option>';
      }
    }
  } catch (error) {
    showStatus('Error loading WhatsApp events: ' + error.message, 'error');
  }
}

async function loadWhatsAppClasses(eventName) {
  const classSelect = document.getElementById('whatsappClassSelect');
  if (classSelect) {
    classSelect.innerHTML = '<option value="">-- Loading Classes --</option>';
    classSelect.disabled = true;
  }

  const preview = document.getElementById('whatsappPreview');
  if (preview) preview.textContent = 'Loading class information...';

  currentWhatsAppData = null;
  updateWhatsAppButtons(false);

  try {
    const result = await apiCall(`/api/whatsapp/classes/${encodeURIComponent(eventName)}`);
    if (result.status === 'success' && classSelect) {
      classSelect.innerHTML = '<option value="">-- Select Class --</option>';
      classSelect.disabled = false;

      if (result.data && result.data.length > 0) {
        result.data.forEach(classInfo => {
          const option = document.createElement('option');
          option.value = classInfo.className;
          option.textContent = classInfo.className;
          option.dataset.url = classInfo.folderUrl;
          classSelect.appendChild(option);
        });

        classSelect.onchange = function() {
          const selectedOption = this.options[this.selectedIndex];
          if (selectedOption.value) {
            const eventSelect = document.getElementById('whatsappEventSelect');
            loadWhatsAppPreview(eventSelect.value, selectedOption.value);
          } else {
            if (preview) preview.textContent = 'Select a folder to preview the WhatsApp message...';
            currentWhatsAppData = null;
            updateWhatsAppButtons(false);
          }
        };
      } else {
        classSelect.innerHTML = '<option value="">-- No Classes Found --</option>';
      }
    }
  } catch (error) {
    showStatus('Error loading classes: ' + error.message, 'error');
  }
}

async function loadWhatsAppPreview(eventName, className) {
  const preview = document.getElementById('whatsappPreview');
  if (preview) preview.textContent = 'Loading preview...';

  updateWhatsAppButtons(false);

  try {
    const result = await apiCall(`/api/whatsapp/info/${encodeURIComponent(eventName)}/${encodeURIComponent(className)}`);
    if (result.status === 'success') {
      currentWhatsAppData = result;
      if (preview) {
        preview.textContent = result.formattedMessage.replace(/\*\*/g, '').replace(/\*/g, '• ');
      }
      updateWhatsAppButtons(true);
      showStatus(`Loaded folder: ${eventName} > ${className}`, 'success');
    } else {
      if (preview) preview.textContent = 'Error: ' + result.message;
      updateWhatsAppButtons(false);
    }
  } catch (error) {
    if (preview) preview.textContent = 'Error: ' + error.message;
    updateWhatsAppButtons(false);
  }
}

function updateWhatsAppButtons(enabled) {
  const copyBtn = document.getElementById('copyWhatsAppBtn');
  const whatsappBtn = document.getElementById('openWhatsAppBtn');

  if (copyBtn) copyBtn.disabled = !enabled;
  if (whatsappBtn) {
    whatsappBtn.disabled = !enabled;
    if (enabled && currentWhatsAppData) {
      whatsappBtn.onclick = function() {
        window.open(currentWhatsAppData.whatsappLink, '_blank', 'noopener,noreferrer');
      };
    }
  }
}

function copyWhatsAppMessage() {
  if (!currentWhatsAppData) return showStatus('Please select a folder first', 'error');

  navigator.clipboard.writeText(currentWhatsAppData.formattedMessage)
    .then(() => {
      showCopyNotification('WhatsApp message copied to clipboard!');
      showStatus('Message copied. You can now paste it in WhatsApp Web or mobile app.', 'success');
    })
    .catch(err => {
      console.error('Failed to copy:', err);
      showStatus('Failed to copy message. Please try again.', 'error');
    });
}

function openWhatsApp() {
  if (!currentWhatsAppData) return showStatus('Please select a folder first', 'error');
  window.open(currentWhatsAppData.whatsappLink, '_blank', 'noopener,noreferrer');
}

/* ==========================================================================
   ADMIN USER MANAGEMENT
   ========================================================================== */

let adminUsersCache = [];
let editingOriginalUsername = '';
let pendingUserPhotoData = '';

function updateUserPhotoPreview(src) {
  const preview = document.getElementById('userPhotoPreview');
  const removeBtn = document.getElementById('removeUserPhotoBtn');
  if (!preview) return;

  if (src) {
    preview.innerHTML = `<img src="${src}" alt="Profile Photo">`;
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    preview.innerHTML = '<i class="fas fa-user"></i>';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

function clearUserPhoto() {
  pendingUserPhotoData = '';
  const input = document.getElementById('newUserPhotoInput');
  if (input) input.value = '';
  updateUserPhotoPreview('');
}

function handleUserPhotoSelect() {
  const input = document.getElementById('newUserPhotoInput');
  if (!input || !input.files || !input.files[0]) return;

  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      const minSide = Math.min(img.width, img.height);
      const sx = (img.width - minSide) / 2;
      const sy = (img.height - minSide) / 2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

      pendingUserPhotoData = canvas.toDataURL('image/jpeg', 0.8);
      updateUserPhotoPreview(pendingUserPhotoData);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function handleAdminClassSelectChange() {
  const select = document.getElementById('newUserClass');
  const customInput = document.getElementById('newUserClassCustom');
  if (select && customInput) {
    customInput.style.display = select.value === '__custom__' ? 'block' : 'none';
    if (select.value !== '__custom__') customInput.value = '';
  }
}

function handleAdminRoleSelectChange() {
  const select = document.getElementById('newUserDetails');
  const customInput = document.getElementById('newUserDetailsCustom');
  if (select && customInput) {
    customInput.style.display = select.value === '__custom__' ? 'block' : 'none';
    if (select.value !== '__custom__') customInput.value = '';
  }
}

function setSelectOrCustomValue(selectId, customInputId, value) {
  const select = document.getElementById(selectId);
  const customInput = document.getElementById(customInputId);
  if (!select) return;

  const cleanVal = (value || '').trim();
  if (!cleanVal) {
    select.value = '';
    if (customInput) {
      customInput.style.display = 'none';
      customInput.value = '';
    }
    return;
  }

  const hasOption = Array.from(select.options).some(opt => opt.value === cleanVal && opt.value !== '__custom__');
  if (hasOption) {
    select.value = cleanVal;
    if (customInput) {
      customInput.style.display = 'none';
      customInput.value = '';
    }
  } else {
    select.value = '__custom__';
    if (customInput) {
      customInput.style.display = 'block';
      customInput.value = cleanVal;
    }
  }
}

function editUserFromAdmin(index) {
  const user = adminUsersCache[index];
  if (!user) return;

  editingOriginalUsername = user.username;
  pendingUserPhotoData = user.photoUrl || '';

  const titleEl = document.getElementById('userFormTitle');
  const cancelBtn = document.getElementById('cancelEditUserBtn');
  if (titleEl) titleEl.textContent = `Edit User: ${user.fullName || user.username}`;
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';

  document.getElementById('newUserUsername').value = user.username;
  const fullNameEl = document.getElementById('newUserFullName');
  if (fullNameEl) fullNameEl.value = user.fullName || '';
  document.getElementById('newUserPassword').value = user.password;
  setSelectOrCustomValue('newUserClass', 'newUserClassCustom', user.assignedClass || '');
  setSelectOrCustomValue('newUserDetails', 'newUserDetailsCustom', user.details || '');
  updateUserPhotoPreview(pendingUserPhotoData);

  const card = document.getElementById('userEditorCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetUserForm() {
  editingOriginalUsername = '';
  pendingUserPhotoData = '';
  const titleEl = document.getElementById('userFormTitle');
  const cancelBtn = document.getElementById('cancelEditUserBtn');
  if (titleEl) titleEl.textContent = 'Add or Update User';
  if (cancelBtn) cancelBtn.style.display = 'none';

  document.getElementById('newUserUsername').value = '';
  const fullNameEl = document.getElementById('newUserFullName');
  if (fullNameEl) fullNameEl.value = '';
  document.getElementById('newUserPassword').value = 'Success@123';
  setSelectOrCustomValue('newUserClass', 'newUserClassCustom', '');
  setSelectOrCustomValue('newUserDetails', 'newUserDetailsCustom', '');
  clearUserPhoto();
}

async function loadUsersForAdmin() {
  const container = document.getElementById('usersListContainer');
  if (!container) return;

  container.innerHTML = `<div class="loading-recent"><div class="spinner"></div><p>Loading users from Google Sheet...</p></div>`;

  try {
    const res = await apiCall('/api/users');
    if (res && res.status === 'success') {
      const users = res.data || [];
      adminUsersCache = users;
      if (users.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No users found in sheet.</p></div>';
        return;
      }

      let html = '<div class="users-list">';
      users.forEach((u, index) => {
        const badgeText = u.assignedClass ? `Class: ${u.assignedClass}` : 'Admin (All Classes)';
        const safeUser = u.username.replace(/'/g, "\\'");
        const displayName = u.fullName ? `${u.fullName}` : u.username;
        const avatarHtml = u.photoUrl
          ? `<img src="${u.photoUrl}" alt="${displayName}">`
          : '<i class="fas fa-user"></i>';

        html += `
          <div class="user-row-card">
            <div class="user-row-left">
              <div class="user-list-avatar">${avatarHtml}</div>
              <div class="user-row-info">
                <div class="user-row-name">
                  <span>${displayName}</span>
                  <span class="assigned-class-badge">${badgeText}</span>
                </div>
                <div class="user-row-meta">
                  Mobile/ID: <strong>${u.username}</strong> • Password: <strong>${u.password}</strong>${u.details ? ` • ${u.details}` : ''}
                </div>
              </div>
            </div>
            <div class="user-row-actions">
              <button type="button" class="edit-user-btn" onclick="editUserFromAdmin(${index})">
                <i class="fas fa-edit"></i> Edit
              </button>
              <button type="button" class="delete-class-btn" onclick="deleteUserFromAdmin('${safeUser}')">
                <i class="fas fa-trash-alt"></i> Remove
              </button>
            </div>
          </div>
        `;
      });
      html += '</div>';
      container.innerHTML = html;
    } else {
      container.innerHTML = `<div class="empty-state"><p>${(res && res.message) || 'Failed to load users'}</p></div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
  }
}

async function saveUserFromAdmin() {
  const usernameEl = document.getElementById('newUserUsername');
  const fullNameEl = document.getElementById('newUserFullName');
  const passwordEl = document.getElementById('newUserPassword');
  const classEl = document.getElementById('newUserClass');
  const classCustomEl = document.getElementById('newUserClassCustom');
  const detailsEl = document.getElementById('newUserDetails');
  const detailsCustomEl = document.getElementById('newUserDetailsCustom');
  const saveBtn = document.getElementById('saveUserBtn');

  const username = usernameEl ? usernameEl.value.trim() : '';
  const fullName = fullNameEl ? fullNameEl.value.trim() : '';
  const password = (passwordEl ? passwordEl.value.trim() : '') || (fullName ? 'Success@123' : '');
  const assignedClass = classEl
    ? (classEl.value === '__custom__' ? (classCustomEl ? classCustomEl.value.trim() : '') : classEl.value.trim())
    : '';
  const details = detailsEl
    ? (detailsEl.value === '__custom__' ? (detailsCustomEl ? detailsCustomEl.value.trim() : '') : detailsEl.value.trim())
    : '';

  if (!username) {
    showNoticePopup('Please enter a mobile number or username', 'newUserUsername');
    return;
  }
  if (!password) {
    showNoticePopup('Please enter a password', 'newUserPassword');
    return;
  }

  if (saveBtn) saveBtn.disabled = true;
  try {
    const res = await apiCall('/api/users', 'POST', {
      username,
      fullName,
      password,
      assignedClass,
      details,
      photoUrl: pendingUserPhotoData,
      originalUsername: editingOriginalUsername
    });
    if (res && res.status === 'success') {
      showCopyNotification(res.message || 'User saved!');
      resetUserForm();
      loadUsersForAdmin();
    } else {
      showNoticePopup((res && res.message) || 'Failed to save user', '', 'Error');
    }
  } catch (err) {
    showNoticePopup('Error saving user: ' + err.message, '', 'Error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function deleteUserFromAdmin(username) {
  if (!confirm(`Remove user "${username}" from Google Sheet?`)) return;
  try {
    const res = await apiCall(`/api/users/${encodeURIComponent(username)}`, 'DELETE');
    if (res && res.status === 'success') {
      showCopyNotification(res.message || 'User removed');
      loadUsersForAdmin();
    } else {
      showNoticePopup((res && res.message) || 'Failed to remove user', '', 'Error');
    }
  } catch (err) {
    showNoticePopup('Error removing user: ' + err.message, '', 'Error');
  }
}

async function applyDefaultPasswordToAllNamedUsers() {
  if (!confirm('Set default password "Success@123" for all users who have a Full Name in the sheet? They will be required to change it on their next login.')) {
    return;
  }
  try {
    const res = await apiCall('/api/users/apply-default-password', 'POST');
    if (res && res.status === 'success') {
      showCopyNotification(res.message || 'Default password applied!');
      loadUsersForAdmin();
    } else {
      showNoticePopup((res && res.message) || 'Failed to apply default password', '', 'Error');
    }
  } catch (err) {
    showNoticePopup('Error: ' + err.message, '', 'Error');
  }
}

/* ==========================================================================
   MY PROFILE (SELF-SERVICE FOR ALL USERS)
   ========================================================================== */

function updateMyProfilePhotoPreview(src) {
  const preview = document.getElementById('myProfilePhotoPreview');
  const removeBtn = document.getElementById('removeMyProfilePhotoBtn');
  if (!preview) return;
  if (src) {
    preview.innerHTML = `<img src="${src}" alt="My Profile Photo">`;
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    preview.innerHTML = '<i class="fas fa-user"></i>';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

function clearMyProfilePhoto() {
  myProfilePendingPhoto = '';
  const input = document.getElementById('myProfilePhotoInput');
  if (input) input.value = '';
  updateMyProfilePhotoPreview('');
}

function handleMyProfilePhotoSelect() {
  const input = document.getElementById('myProfilePhotoInput');
  if (!input || !input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const minSide = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - minSide) / 2, (img.height - minSide) / 2, minSide, minSide, 0, 0, size, size);
      myProfilePendingPhoto = canvas.toDataURL('image/jpeg', 0.8);
      updateMyProfilePhotoPreview(myProfilePendingPhoto);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(input.files[0]);
}

function openMyProfileModal() {
  const modal = document.getElementById('myProfileModal');
  const errEl = document.getElementById('myProfileError');
  if (errEl) errEl.style.display = 'none';

  document.getElementById('myProfileUsername').value = currentUserProfile.username || '';
  document.getElementById('myProfileClass').value = currentUserProfile.assignedClass || 'Admin (All Classes)';
  document.getElementById('myProfileFullName').value = currentUserProfile.fullName || '';
  document.getElementById('myProfileDetails').value = currentUserProfile.details || '';
  document.getElementById('myProfileNewPassword').value = '';

  myProfilePendingPhoto = currentUserProfile.photoUrl || '';
  updateMyProfilePhotoPreview(myProfilePendingPhoto);

  if (modal) modal.style.display = 'flex';
}

function closeMyProfileModal() {
  const modal = document.getElementById('myProfileModal');
  if (modal) modal.style.display = 'none';
}

async function saveMyProfile() {
  const fullName = document.getElementById('myProfileFullName').value.trim();
  const details = document.getElementById('myProfileDetails').value.trim();
  const newPassword = document.getElementById('myProfileNewPassword').value.trim();
  const errEl = document.getElementById('myProfileError');
  const btn = document.getElementById('saveMyProfileBtn');

  if (newPassword && newPassword.length < 6) {
    if (errEl) {
      errEl.textContent = 'New password must be at least 6 characters.';
      errEl.style.display = 'block';
    }
    return;
  }
  if (newPassword === 'Success@123') {
    if (errEl) {
      errEl.textContent = 'Please choose a password different from Success@123.';
      errEl.style.display = 'block';
    }
    return;
  }

  if (errEl) errEl.style.display = 'none';
  if (btn) btn.disabled = true;

  try {
    const res = await apiCall('/api/auth/profile', 'POST', {
      fullName,
      details,
      photoUrl: myProfilePendingPhoto,
      newPassword
    });
    if (res && res.status === 'success') {
      const updated = res.user || {};
      currentUserProfile.fullName = updated.fullName !== undefined ? updated.fullName : fullName;
      currentUserProfile.details = updated.details !== undefined ? updated.details : details;
      currentUserProfile.photoUrl = updated.photoUrl !== undefined ? updated.photoUrl : myProfilePendingPhoto;

      const displayName = currentUserProfile.fullName || currentUserProfile.username || 'Admin';
      const classNote = currentUserProfile.assignedClass ? ` (${currentUserProfile.assignedClass})` : '';
      document.getElementById('user-name').textContent = 'Welcome, ' + displayName + classNote;

      const headerAvatar = document.getElementById('headerUserAvatar');
      if (headerAvatar) {
        headerAvatar.innerHTML = currentUserProfile.photoUrl
          ? `<img src="${currentUserProfile.photoUrl}" alt="${displayName}" class="user-avatar-img">`
          : '<i class="fas fa-user-shield"></i>';
      }

      closeMyProfileModal();
      showCopyNotification(res.message || 'Profile updated!');
    } else if (errEl) {
      errEl.textContent = (res && res.message) || 'Failed to update profile';
      errEl.style.display = 'block';
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = 'Error: ' + err.message;
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}
