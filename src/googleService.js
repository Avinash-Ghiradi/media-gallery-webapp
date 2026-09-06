const { google } = require('googleapis');
const fs = require('fs');
const stream = require('stream');
const config = require('./config');
const mockService = require('./mockService');
const videoWatermark = require('./videoWatermark');

let authClient = null;
let isGoogleApiConfigured = false;

function initGoogleAuth() {
  if (authClient) return authClient;

  try {
    const scopes = [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets'
    ];

    let keyFilePath = config.googleCredentialsPath;
    if (fs.existsSync(keyFilePath)) {
      const stat = fs.statSync(keyFilePath);
      if (stat.isDirectory()) {
        const files = fs.readdirSync(keyFilePath).filter(f => f.endsWith('.json'));
        if (files.length > 0) {
          keyFilePath = require('path').join(keyFilePath, files[0]);
        }
      }
    }

    if (config.serviceAccountEmail && config.privateKey) {
      authClient = new google.auth.JWT(
        config.serviceAccountEmail,
        null,
        config.privateKey,
        scopes
      );
      isGoogleApiConfigured = true;
      console.log('Google APIs initialized via environment variables.');
    } else if (fs.existsSync(keyFilePath) && fs.statSync(keyFilePath).isFile()) {
      authClient = new google.auth.GoogleAuth({
        keyFile: keyFilePath,
        scopes: scopes
      });
      isGoogleApiConfigured = true;
      console.log(`Google APIs initialized via key file: ${keyFilePath}`);
    } else {
      console.warn('Google Credentials not found. Using WebApp Bridge or Mock Service mode.');
      isGoogleApiConfigured = false;
      return null;
    }
    return authClient;
  } catch (err) {
    console.error('Error initializing Google Auth:', err.message);
    isGoogleApiConfigured = false;
    return null;
  }
}

function getDriveClient() {
  const auth = initGoogleAuth();
  if (!auth) return null;
  return google.drive({ version: 'v3', auth });
}

function getSheetsClient() {
  const auth = initGoogleAuth();
  if (!auth) return null;
  return google.sheets({ version: 'v4', auth });
}

async function callGasBridge(action, payload = {}) {
  if (!config.gasWebAppUrl) return null;
  try {
    const url = new URL(config.gasWebAppUrl);
    url.searchParams.set('action', action);
    for (const k in payload) {
      if (payload[k] !== undefined && payload[k] !== null && typeof payload[k] !== 'object') {
        url.searchParams.set(k, payload[k]);
      }
    }

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, ...payload }),
      redirect: 'follow'
    });

    if (res.ok) {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        console.error(`GAS Bridge JSON parse error for ${action}:`, text.substring(0, 100));
      }
    }
  } catch (err) {
    console.error(`GAS Bridge request failed for ${action}:`, err.message);
  }
  return null;
}

async function getUsersFromSheet() {
  if (config.gasWebAppUrl) {
    try {
      const gasResult = await callGasBridge('getUsersFromSheet');
      if (gasResult && typeof gasResult === 'object' && Object.keys(gasResult).length > 0) {
        return gasResult;
      }
    } catch (e) {
      console.error('GAS getUsersFromSheet error:', e.message);
    }
  }

  const sheets = getSheetsClient();
  if (!sheets) return mockService.getUsersFromSheet();

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.usersSheetId,
      range: `${config.usersSheetName}!A:B`
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('Users sheet empty, using fallback users list');
      return mockService.getUsersFromSheet();
    }

    const startRow = rows[0][0] && rows[0][0].toString().toLowerCase() === 'username' ? 1 : 0;
    const users = {};
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] && row[1]) {
        users[row[0].toString().trim()] = row[1].toString().trim();
      }
    }
    return users;
  } catch (e) {
    console.error('Error reading users from sheet:', e.message);
    return mockService.getUsersFromSheet();
  }
}

async function getOrCreateFolder(drive, parentFolderId, folderName) {
  const safeName = sanitizeFolderName(folderName);

  const query = `'${parentFolderId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({
    q: query,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id, name, webViewLink)'
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0];
  }

  const fileMetadata = {
    name: safeName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentFolderId]
  };

  const folder = await drive.files.create({
    requestBody: fileMetadata,
    supportsAllDrives: true,
    fields: 'id, name, webViewLink'
  });

  return folder.data;
}

async function uploadFilesToDrive(filesData, eventName, className, addWatermark = true) {
  if (addWatermark && filesData && filesData.length > 0) {
    for (let i = 0; i < filesData.length; i++) {
      const fileData = filesData[i];
      if (fileData.contentType && fileData.contentType.startsWith('video/')) {
        console.log(`Processing FFmpeg watermark for video: ${fileData.filename}`);
        try {
          const inputBuffer = Buffer.from(fileData.data, 'base64');
          const watermarkedBuffer = await videoWatermark.watermarkVideo(
            inputBuffer,
            eventName,
            className,
            fileData.filename
          );
          fileData.data = watermarkedBuffer.toString('base64');
          console.log(`Finished video watermark for: ${fileData.filename}`);
        } catch (vErr) {
          console.error(`Error watermarking video ${fileData.filename}:`, vErr.message);
        }
      }
    }
  }

  if (config.gasWebAppUrl) {
    try {
      console.log('Forwarding upload to Google Apps Script Web App URL:', config.gasWebAppUrl);
      const res = await callGasBridge('uploadFilesToDrive', {
        filesData: filesData,
        eventName: eventName,
        className: className,
        addWatermark: addWatermark
      });
      if (res) return res;
    } catch (e) {
      console.error('Error forwarding to GAS WebApp URL:', e.message);
    }
  }

  const drive = getDriveClient();
  const sheets = getSheetsClient();

  if (!drive || !sheets) {
    return mockService.uploadFilesToDrive(filesData, eventName, className, addWatermark);
  }

  try {
    if (!filesData || !filesData.length) throw new Error('No files provided');
    if (!eventName) throw new Error('Event name is required');
    if (!className) throw new Error('Class name is required');

    const rootFolderId = config.driveRootFolderId;
    const eventFolder = await getOrCreateFolder(drive, rootFolderId, eventName);
    const classSubfolder = await getOrCreateFolder(drive, eventFolder.id, className);

    const fileUrls = [];

    for (let i = 0; i < filesData.length; i++) {
      const fileData = filesData[i];
      try {
        let filename = sanitizeFilename(fileData.filename);
        const contentType = fileData.contentType || 'image/jpeg';
        const buffer = Buffer.from(fileData.data, 'base64');

        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);

        const fileMetadata = {
          name: filename,
          parents: [classSubfolder.id]
        };

        const media = {
          mimeType: contentType,
          body: bufferStream
        };

        const uploadedFile = await drive.files.create({
          requestBody: fileMetadata,
          media: media,
          supportsAllDrives: true,
          fields: 'id, name, webViewLink'
        });

        await drive.permissions.create({
          fileId: uploadedFile.data.id,
          requestBody: {
            role: 'reader',
            type: 'anyone'
          },
          supportsAllDrives: true
        });

        fileUrls.push({
          name: filename,
          url: uploadedFile.data.webViewLink
        });
      } catch (fErr) {
        console.error(`Failed to upload file ${fileData.filename}:`, fErr.message);
      }
    }

    const folderUrl = classSubfolder.webViewLink || `https://drive.google.com/drive/folders/${classSubfolder.id}`;

    await updateSheet2(sheets, eventName, className, folderUrl, fileUrls);
    await updateAdditionalSheet(sheets, eventName, fileUrls);

    return {
      status: 'success',
      message: `${filesData.length} file(s) processed ${addWatermark ? 'WITH watermark' : 'WITHOUT watermark'}`,
      urls: fileUrls,
      folderUrl: folderUrl,
      watermarkApplied: addWatermark
    };

  } catch (e) {
    console.error('Error in uploadFilesToDrive:', e);
    return {
      status: 'error',
      message: e.message
    };
  }
}

async function getAllFolders() {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getAllFolders');
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      if (res && Array.isArray(res.folders)) return res.folders;
    } catch (e) {
      console.error('GAS getAllFolders error:', e.message);
    }
  }

  const drive = getDriveClient();
  if (!drive) return mockService.getAllFolders();

  try {
    const res = await drive.files.list({
      q: `'${config.driveRootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(name)'
    });

    const names = (res.data.files || []).map(f => f.name);
    return names.sort();
  } catch (e) {
    console.error('Error getting folders from Drive:', e.message);
    return mockService.getAllFolders();
  }
}

async function getSubfoldersForEvent(eventName) {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getSubfoldersForEvent', { eventName });
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      if (res && Array.isArray(res.subfolders)) return res.subfolders;
    } catch (e) {
      console.error('GAS getSubfoldersForEvent error:', e.message);
    }
  }

  const drive = getDriveClient();
  if (!drive) return mockService.getSubfoldersForEvent(eventName);

  try {
    const safeName = sanitizeFolderName(eventName);
    const eventRes = await drive.files.list({
      q: `'${config.driveRootFolderId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(id)'
    });

    if (!eventRes.data.files || eventRes.data.files.length === 0) {
      return [];
    }

    const eventFolderId = eventRes.data.files[0].id;
    const subRes = await drive.files.list({
      q: `'${eventFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(name)'
    });

    const subfolderNames = (subRes.data.files || []).map(f => f.name);
    return subfolderNames.sort();
  } catch (e) {
    console.error('Error getting subfolders:', e.message);
    return mockService.getSubfoldersForEvent(eventName);
  }
}

async function updateSheet2(sheets, eventName, className, folderUrl, fileUrls) {
  try {
    const range = 'Sheet2!A:Z';
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.logSheetId,
      range: range
    });

    let rows = res.data.values || [];

    if (rows.length === 0) {
      const headers = ['Event Name', 'Class Name', 'Folder URL'];
      for (let i = 1; i <= 10; i++) headers.push(`Image ${i} URL`);
      rows = [headers];
    }

    let existingRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === eventName && rows[i][1] === className) {
        existingRowIndex = i;
        break;
      }
    }

    if (existingRowIndex !== -1) {
      const row = rows[existingRowIndex];
      fileUrls.forEach(fileUrl => {
        if (fileUrl.url) {
          const emptyCellIndex = findFirstEmptyCell(row, 3);
          if (emptyCellIndex !== -1) {
            row[emptyCellIndex] = fileUrl.url;
          } else {
            row.push(fileUrl.url);
          }
        }
      });
      rows[existingRowIndex] = row;
    } else {
      const rowData = [eventName, className, folderUrl];
      fileUrls.forEach(fileUrl => {
        if (fileUrl.url) rowData.push(fileUrl.url);
      });
      rows.push(rowData);
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.logSheetId,
      range: `Sheet2!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rows }
    });
  } catch (e) {
    console.error('Error updating Sheet2:', e.message);
  }
}

async function updateAdditionalSheet(sheets, eventName, fileUrls) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.urlSheetId,
      range: 'data!A:Z'
    });

    let rows = res.data.values || [];
    if (rows.length === 0) {
      const headers = ['Event Name'];
      for (let i = 1; i <= 10; i++) headers.push(`Image ${i} URL`);
      rows = [headers];
    }

    let existingRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === eventName) {
        existingRowIndex = i;
        break;
      }
    }

    if (existingRowIndex !== -1) {
      const row = rows[existingRowIndex];
      fileUrls.forEach(fileUrl => {
        if (fileUrl.url) {
          const emptyCellIndex = findFirstEmptyCell(row, 1);
          if (emptyCellIndex !== -1) {
            row[emptyCellIndex] = fileUrl.url;
          } else {
            row.push(fileUrl.url);
          }
        }
      });
      rows[existingRowIndex] = row;
    } else {
      const rowData = [eventName];
      fileUrls.forEach(fileUrl => {
        if (fileUrl.url) rowData.push(fileUrl.url);
      });
      rows.push(rowData);
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.urlSheetId,
      range: 'data!A1',
      valueInputOption: 'USER_ENTERED',
      resource: { values: rows }
    });
  } catch (e) {
    console.error('Error updating additional sheet:', e.message);
  }
}

function findFirstEmptyCell(row, startIndex) {
  for (let i = startIndex; i < row.length; i++) {
    if (!row[i] || row[i] === '') return i;
  }
  return row.length;
}

async function getEventsFromSheet2() {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getEventsFromSheet2');
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
    } catch (e) {
      console.error('GAS getEventsFromSheet2 error:', e.message);
    }
  }

  const sheets = getSheetsClient();
  if (!sheets) return mockService.getEventsFromSheet2();

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.logSheetId,
      range: 'Sheet2!A:A'
    });

    const rows = res.data.values || [];
    const eventNames = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].toString().trim() !== '') {
        const cleanName = rows[i][0].toString().trim();
        if (!eventNames.includes(cleanName)) {
          eventNames.push(cleanName);
        }
      }
    }
    return eventNames.sort();
  } catch (e) {
    console.error('Error getting events from Sheet2:', e.message);
    return getAllFolders();
  }
}

async function getFolderLinksFromSheet2() {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getFolderLinksFromSheet2');
      if (res && res.status === 'success') return res;
      if (res && Array.isArray(res.data)) return { status: 'success', data: res.data };
    } catch (e) {
      console.error('GAS getFolderLinksFromSheet2 error:', e.message);
    }
  }

  const sheets = getSheetsClient();
  if (!sheets) return mockService.getFolderLinksFromSheet2();

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.logSheetId,
      range: 'Sheet2!A:C'
    });

    const rows = res.data.values || [];
    const folderLinks = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const eventName = row[0] || '';
      const className = row[1] || '';
      const folderUrl = row[2] || '';

      if (eventName && className && folderUrl) {
        let existingEvent = folderLinks.find(e => e.eventName === eventName);
        if (!existingEvent) {
          existingEvent = { eventName: eventName, classes: [] };
          folderLinks.push(existingEvent);
        }
        if (!existingEvent.classes.some(c => c.className === className)) {
          existingEvent.classes.push({ className: className, folderUrl: folderUrl });
        }
      }
    }

    folderLinks.sort((a, b) => a.eventName.localeCompare(b.eventName));
    folderLinks.forEach(e => e.classes.sort((a, b) => a.className.localeCompare(b.className)));

    return { status: 'success', data: folderLinks };
  } catch (e) {
    console.error('Error getting folder links:', e.message);
    return { status: 'error', message: 'Error loading folder links: ' + e.message };
  }
}

async function getFolderLinksForEvent(eventName) {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getFolderLinksForEvent', { eventName: eventName });
      if (res && res.status === 'success') return res;
      if (res && Array.isArray(res.data)) return { status: 'success', data: res.data };
    } catch (e) {
      console.error('GAS getFolderLinksForEvent error:', e.message);
    }
  }

  const sheets = getSheetsClient();
  if (!sheets) return mockService.getFolderLinksForEvent(eventName);

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.logSheetId,
      range: 'Sheet2!A:C'
    });

    const rows = res.data.values || [];
    const folderLinks = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const currentEventName = row[0] || '';
      const className = row[1] || '';
      const folderUrl = row[2] || '';

      if (currentEventName === eventName && className && folderUrl) {
        folderLinks.push({ className: className, folderUrl: folderUrl });
      }
    }

    folderLinks.sort((a, b) => a.className.localeCompare(b.className));
    return { status: 'success', data: folderLinks };
  } catch (e) {
    console.error('Error getting folder links for event:', e.message);
    return { status: 'error', message: 'Error loading folder links: ' + e.message };
  }
}

async function getRecentUploads() {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getRecentUploads');
      if (res && res.status === 'success') return res;
      if (res && Array.isArray(res.data)) return { status: 'success', data: res.data };
    } catch (e) {
      console.error('GAS getRecentUploads error:', e.message);
    }
  }

  const sheets = getSheetsClient();
  if (!sheets) return mockService.getRecentUploads();

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.logSheetId,
      range: 'Sheet2!A:C'
    });

    const rows = res.data.values || [];
    const recentData = [];

    const numRowsToShow = 10;
    const startFrom = Math.max(1, rows.length - numRowsToShow);

    for (let i = rows.length - 1; i >= startFrom; i--) {
      const row = rows[i];
      const eventName = row[0] || '';
      const className = row[1] || '';
      const folderUrl = row[2] || '';

      if (eventName && className && folderUrl) {
        const uploadTime = i >= rows.length - 3 ? 'Just now' : (i >= rows.length - 6 ? 'Recently' : 'A while ago');
        recentData.push({
          eventName: eventName.toString().trim(),
          className: className.toString().trim(),
          folderUrl: folderUrl.toString().trim(),
          uploadTime: uploadTime,
          isNew: (rows.length - i) <= 3
        });
      }

      if (recentData.length >= 5) break;
    }

    return { status: 'success', data: recentData };
  } catch (e) {
    console.error('Error getting recent uploads:', e.message);
    return { status: 'error', message: e.message };
  }
}

async function getAllEventsForDeletion() {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getAllEventsForDeletion');
      if (res && res.status === 'success') return res;
      if (res && Array.isArray(res.data)) return { status: 'success', data: res.data };
    } catch (e) {
      console.error('GAS getAllEventsForDeletion error:', e.message);
    }
  }

  const drive = getDriveClient();
  if (!drive) return mockService.getAllEventsForDeletion();

  try {
    const eventRes = await drive.files.list({
      q: `'${config.driveRootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, webViewLink, createdTime)'
    });

    const eventFolders = eventRes.data.files || [];
    const events = [];

    for (const eventFolder of eventFolders) {
      const classRes = await drive.files.list({
        q: `'${eventFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name, webViewLink, createdTime)'
      });

      const classFolders = classRes.data.files || [];
      const classes = [];

      for (const classFolder of classFolders) {
        const fileRes = await drive.files.list({
          q: `'${classFolder.id}' in parents and trashed = false`,
          fields: 'files(id)'
        });
        const fileCount = (fileRes.data.files || []).length;

        classes.push({
          name: classFolder.name,
          id: classFolder.id,
          url: classFolder.webViewLink,
          dateCreated: classFolder.createdTime,
          fileCount: fileCount
        });
      }

      classes.sort((a, b) => a.name.localeCompare(b.name));

      events.push({
        name: eventFolder.name,
        id: eventFolder.id,
        url: eventFolder.webViewLink,
        dateCreated: eventFolder.createdTime,
        classCount: classes.length,
        classes: classes
      });
    }

    events.sort((a, b) => a.name.localeCompare(b.name));
    return { status: 'success', data: events };
  } catch (e) {
    console.error('Error getting events for deletion:', e.message);
    return mockService.getAllEventsForDeletion();
  }
}

async function deleteEventFolder(eventName) {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('deleteEventFolder', { eventName: eventName });
      if (res) return res;
    } catch (e) {
      console.error('GAS deleteEventFolder error:', e.message);
    }
  }

  const drive = getDriveClient();
  const sheets = getSheetsClient();
  if (!drive || !sheets) return mockService.deleteEventFolder(eventName);

  try {
    const safeName = sanitizeFolderName(eventName);
    const res = await drive.files.list({
      q: `'${config.driveRootFolderId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)'
    });

    if (res.data.files && res.data.files.length > 0) {
      const folderId = res.data.files[0].id;
      await drive.files.update({
        fileId: folderId,
        requestBody: { trashed: true }
      });
    }

    await removeEventFromSheet2(sheets, eventName);
    await removeEventFromAdditionalSheet(sheets, eventName);

    return {
      status: 'success',
      message: `Event "${eventName}" has been deleted successfully.`,
      eventName: eventName
    };
  } catch (e) {
    console.error('Error deleting event folder:', e.message);
    return { status: 'error', message: 'Error deleting event: ' + e.message };
  }
}

async function deleteClassFolder(eventName, className) {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('deleteClassFolder', { eventName: eventName, className: className });
      if (res) return res;
    } catch (e) {
      console.error('GAS deleteClassFolder error:', e.message);
    }
  }

  const drive = getDriveClient();
  const sheets = getSheetsClient();
  if (!drive || !sheets) return mockService.deleteClassFolder(eventName, className);

  try {
    const safeEventName = sanitizeFolderName(eventName);
    const safeClassName = sanitizeFolderName(className);

    const eventRes = await drive.files.list({
      q: `'${config.driveRootFolderId}' in parents and name = '${safeEventName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)'
    });

    if (eventRes.data.files && eventRes.data.files.length > 0) {
      const eventFolderId = eventRes.data.files[0].id;
      const classRes = await drive.files.list({
        q: `'${eventFolderId}' in parents and name = '${safeClassName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)'
      });

      if (classRes.data.files && classRes.data.files.length > 0) {
        await drive.files.update({
          fileId: classRes.data.files[0].id,
          requestBody: { trashed: true }
        });
      }
    }

    await removeClassFromSheet2(sheets, eventName, className);

    return {
      status: 'success',
      message: `Class folder "${className}" has been deleted successfully.`,
      eventName: eventName,
      className: className
    };
  } catch (e) {
    console.error('Error deleting class folder:', e.message);
    return { status: 'error', message: 'Error deleting class folder: ' + e.message };
  }
}

async function removeEventFromSheet2(sheets, eventName) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.logSheetId,
      range: 'Sheet2!A:Z'
    });
    const rows = res.data.values || [];
    const filteredRows = rows.filter((row, index) => index === 0 || row[0] !== eventName);

    await sheets.spreadsheets.values.clear({ spreadsheetId: config.logSheetId, range: 'Sheet2!A:Z' });
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.logSheetId,
      range: 'Sheet2!A1',
      valueInputOption: 'USER_ENTERED',
      resource: { values: filteredRows }
    });
  } catch (e) {
    console.error('Error removing event from Sheet2:', e.message);
  }
}

async function removeClassFromSheet2(sheets, eventName, className) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.logSheetId,
      range: 'Sheet2!A:Z'
    });
    const rows = res.data.values || [];
    const filteredRows = rows.filter((row, index) => index === 0 || !(row[0] === eventName && row[1] === className));

    await sheets.spreadsheets.values.clear({ spreadsheetId: config.logSheetId, range: 'Sheet2!A:Z' });
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.logSheetId,
      range: 'Sheet2!A1',
      valueInputOption: 'USER_ENTERED',
      resource: { values: filteredRows }
    });
  } catch (e) {
    console.error('Error removing class from Sheet2:', e.message);
  }
}

async function removeEventFromAdditionalSheet(sheets, eventName) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.urlSheetId,
      range: 'data!A:Z'
    });
    const rows = res.data.values || [];
    const filteredRows = rows.filter((row, index) => index === 0 || row[0] !== eventName);

    await sheets.spreadsheets.values.clear({ spreadsheetId: config.urlSheetId, range: 'data!A:Z' });
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.urlSheetId,
      range: 'data!A1',
      valueInputOption: 'USER_ENTERED',
      resource: { values: filteredRows }
    });
  } catch (e) {
    console.error('Error removing event from additional sheet:', e.message);
  }
}

async function getEventsForWhatsApp() {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getEventsForWhatsApp');
      if (res) return res;
    } catch (e) {
      console.error('GAS getEventsForWhatsApp error:', e.message);
    }
  }

  const events = await getEventsFromSheet2();
  return { status: 'success', data: events };
}

async function getClassesForWhatsApp(eventName) {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getClassesForWhatsApp', { eventName: eventName });
      if (res) return res;
    } catch (e) {
      console.error('GAS getClassesForWhatsApp error:', e.message);
    }
  }

  return await getFolderLinksForEvent(eventName);
}

async function getFolderInfoForWhatsApp(eventName, className) {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getFolderInfoForWhatsApp', { eventName: eventName, className: className });
      if (res) return res;
    } catch (e) {
      console.error('GAS getFolderInfoForWhatsApp error:', e.message);
    }
  }

  try {
    const linksRes = await getFolderLinksForEvent(eventName);
    if (linksRes.status !== 'success') return linksRes;

    const classObj = (linksRes.data || []).find(c => c.className === className);
    if (!classObj || !classObj.folderUrl) {
      return { status: 'error', message: 'Folder not found' };
    }

    const folderUrl = classObj.folderUrl;
    const message = mockService.generateWhatsAppMessage(eventName, className, folderUrl, 0);
    const whatsappLink = 'https://wa.me/?text=' + encodeURIComponent(message);

    return {
      status: 'success',
      eventName: eventName,
      className: className,
      folderUrl: folderUrl,
      fileCount: 0,
      whatsappLink: whatsappLink,
      formattedMessage: message
    };
  } catch (e) {
    console.error('Error getting folder info for WhatsApp:', e.message);
    return { status: 'error', message: 'Error: ' + e.message };
  }
}

function sanitizeFolderName(name) {
  if (!name) return '';
  return name.replace(/[\/\\?%*:|"<>]/g, '-').trim();
}

function sanitizeFilename(name) {
  if (!name) return 'unnamed-file';
  return name.replace(/[\/\\?%*:|"<>]/g, '-').trim();
}

module.exports = {
  isConfigured: () => {
    initGoogleAuth();
    return isGoogleApiConfigured || !!config.gasWebAppUrl;
  },
  getUsersFromSheet,
  getAllFolders,
  getSubfoldersForEvent,
  uploadFilesToDrive,
  getEventsFromSheet2,
  getFolderLinksFromSheet2,
  getFolderLinksForEvent,
  getRecentUploads,
  getAllEventsForDeletion,
  deleteEventFolder,
  deleteClassFolder,
  getEventsForWhatsApp,
  getClassesForWhatsApp,
  getFolderInfoForWhatsApp
};
