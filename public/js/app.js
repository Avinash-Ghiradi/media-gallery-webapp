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

  initializeFolderView();

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
    loadFolderLinks();
  } else if (tabName === 'recent') {
    loadRecentFolders();
    recentBadgeCount = 0;
    updateRecentBadge();
  } else if (tabName === 'whatsapp') {
    initializeWhatsAppTab();
  } else if (tabName === 'delete') {
    loadEventsForDeletion();
  }
}

async function checkAuthentication() {
  console.log('Checking authentication...');
  try {
    const authStatus = await apiCall('/api/auth/status');
    if (authStatus && authStatus.isAuthenticated) {
      showMainApp(authStatus.username, authStatus.googleConfigured);
    } else {
      showLogin();
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    showLogin();
  }
}

function showLogin() {
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('password').value = '';
  document.getElementById('password').focus();

  const statusMessage = document.getElementById('loginStatusMessage');
  if (statusMessage) statusMessage.style.display = 'none';
}

function showMainApp(username, googleConfigured) {
  document.getElementById('user-name').textContent = 'Welcome, ' + (username || 'Admin');
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('loginOverlay').style.display = 'none';
  loadEvents();
  loadRecentFolders();

  if (googleConfigured === false) {
    showStatus('⚠️ Running in Local Test Mode. To upload real files & folders to Google Drive, place your <code>credentials.json</code> file in the project folder.', 'warning');
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
    const result = await apiCall('/api/auth/login', 'POST', { password });
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

function preloadSchoolLogo() {
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
  schoolLogo.src = "https://lh3.googleusercontent.com/d/1stbNALlpjg5CCGlXXX84l29UoolnvrbN";
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

async function loadClassFolders() {
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
    }
  } else {
    const classSelect = document.getElementById('className');
    if (classSelect) {
      classSelect.innerHTML = '<option value="">-- Select Class --</option><option value="new">+ Create New Class</option>';
    }
  }
}

async function loadEvents() {
  showStatus('Loading events...', 'warning');
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
        showStatus('Events loaded successfully', 'success');
      } else {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No events found';
        option.disabled = true;
        select.appendChild(option);
        showStatus('No events found. Create a new one.', 'warning');
      }
    }
  } catch (error) {
    showStatus('Error loading events: ' + error.message, 'error');
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
    showStatus('Please select an event to view folder links', 'error');
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
    if (title) title.textContent = 'All Folder Links';
    loadAllFolderLinks();
  } else {
    if (title) title.textContent = `Folder Links for: ${eventName}`;
    loadEventFolderLinks(eventName);
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

// Client-side HTML5 Canvas Watermarking
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
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const borderMargin = Math.max(12, Math.min(img.width, img.height) * 0.025);
      const borderWidth = Math.max(4, Math.min(img.width, img.height) * 0.004);
      const cornerRadius = Math.max(10, Math.min(img.width, img.height) * 0.012);

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

      const fontSize = Math.max(22, Math.min(img.width, img.height) * 0.028);
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
        const logoWidth = img.width * 0.4;
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
          callback({
            filename: file.name,
            data: base64,
            contentType: file.type,
            size: blob.size
          });
        };
        reader.readAsDataURL(blob);
      }, file.type, 0.9);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Upload Files Action
function uploadFiles() {
  const eventSelect = document.getElementById('eventName');
  const eventNameInput = document.getElementById('newEventName');
  let eventName = eventSelect && eventSelect.value === 'new' ? eventNameInput.value.trim() : (eventSelect ? eventSelect.value : '');

  const classSelect = document.getElementById('className');
  const classNameInput = document.getElementById('newClassName');
  let className = classSelect && classSelect.value === 'new' ? classNameInput.value.trim() : (classSelect ? classSelect.value : '');

  if (!eventName) return showStatus('Please select or enter an event name', 'error');
  if (eventSelect && eventSelect.value === 'new' && eventName.length < 3) return showStatus('Event name must be at least 3 characters', 'error');
  if (!className) return showStatus('Please select or enter a class name', 'error');
  if (classSelect && classSelect.value === 'new' && className.length < 2) return showStatus('Class name must be at least 2 characters', 'error');
  if (selectedFiles.length === 0) return showStatus('Please select at least one file', 'error');

  if (!watermarkEnabled) {
    if (!confirm('Watermark is turned OFF. Images will be uploaded without watermark or border.\n\nClick OK to continue or Cancel to turn watermark ON.')) {
      document.getElementById('watermarkToggle').checked = true;
      toggleWatermark();
      return;
    }
  }

  const loading = document.getElementById('loading');
  const progressContainer = document.getElementById('progressContainer');
  if (loading) loading.style.display = 'block';
  if (progressContainer) progressContainer.style.display = 'block';

  updateProgress(0);
  showStatus(`Preparing files ${watermarkEnabled ? 'with watermark' : 'without watermark'}...`, 'success');

  const processedFiles = [];
  let processedCount = 0;

  selectedFiles.forEach((file, index) => {
    if (file.type.startsWith('image/') && watermarkEnabled) {
      addWatermarkToImage(file, eventName, className, function(watermarkedFile) {
        processedFiles[index] = watermarkedFile;
        processedCount++;
        updateProgress((processedCount / selectedFiles.length) * 100);

        if (processedCount === selectedFiles.length) {
          uploadToDrive(processedFiles, eventName, className);
        }
      });
    } else {
      readFileAsDataURL(file).then(result => {
        processedFiles[index] = result;
        processedCount++;
        updateProgress((processedCount / selectedFiles.length) * 100);

        if (processedCount === selectedFiles.length) {
          uploadToDrive(processedFiles, eventName, className);
        }
      });
    }
  });
}

async function uploadToDrive(filesData, eventName, className) {
  const validFilesData = filesData.filter(file => file !== undefined);

  try {
    const result = await apiCall('/api/upload', 'POST', {
      filesData: validFilesData,
      eventName: eventName,
      className: className,
      addWatermark: watermarkEnabled
    });

    const loading = document.getElementById('loading');
    const progressContainer = document.getElementById('progressContainer');
    if (loading) loading.style.display = 'none';
    if (progressContainer) progressContainer.style.display = 'none';

    if (result.status === 'success') {
      let message = `<strong>Upload successful!</strong><br>`;
      message += `${result.urls.length} file${result.urls.length !== 1 ? 's' : ''} uploaded `;
      message += result.watermarkApplied ? '<strong>WITH watermark</strong> ' : '<strong>WITHOUT watermark</strong> ';
      message += `to <a href="${result.folderUrl}" target="_blank">${eventName} > ${className}</a><br><br>`;

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

      loadEvents();
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

  const oversizedFiles = supportedFiles.filter(file => file.size > 50 * 1024 * 1024);
  if (oversizedFiles.length > 0) {
    showStatus(`Some files exceed 50MB limit and won't be uploaded: ${oversizedFiles.map(f => f.name).join(', ')}`, 'warning');
  }

  const validFiles = supportedFiles.filter(file => file.size <= 50 * 1024 * 1024);
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
