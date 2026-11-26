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
      range: `${config.usersSheetName}!A:F`
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('Users sheet empty, using fallback users list');
      return mockService.getUsersFromSheet();
    }

    const headerCell = rows[0][0] ? rows[0][0].toString().toLowerCase() : '';
    const startRow = (headerCell.includes('username') || headerCell.includes('mobile')) ? 1 : 0;
    const users = {};
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      const fullName = row[5] ? row[5].toString().trim() : '';
      const pwd = row[1] ? row[1].toString().trim() : (fullName ? 'Success@123' : '');
      if (row[0] && pwd) {
        const uname = row[0].toString().trim();
        const assignedClass = row[2] ? row[2].toString().trim() : '';
        const details = row[3] ? row[3].toString().trim() : '';
        const photoUrl = row[4] ? row[4].toString().trim() : '';
        users[uname] = { password: pwd, assignedClass, details, photoUrl, fullName };
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

async function uploadSingleFileToDriveFolder(drive, targetFolderId, fileData) {
  let filename = sanitizeFilename(fileData.filename);
  const contentType = fileData.contentType || 'image/jpeg';
  const buffer = Buffer.from(fileData.data, 'base64');

  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const uploadedFile = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [targetFolderId]
    },
    media: {
      mimeType: contentType,
      body: bufferStream
    },
    supportsAllDrives: true,
    fields: 'id, name, webViewLink'
  });

  await drive.permissions.create({
    fileId: uploadedFile.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true
  });

  return {
    name: filename,
    savedName: filename,
    url: uploadedFile.data.webViewLink
  };
}

async function uploadFilesToDrive(filesData, eventName, className, addWatermark = true, originalFilesData = []) {
  const originalsList = Array.isArray(originalFilesData) ? [...originalFilesData] : [];

  if (addWatermark && filesData && filesData.length > 0) {
    for (let i = 0; i < filesData.length; i++) {
      const fileData = filesData[i];
      if (fileData.contentType && fileData.contentType.startsWith('video/')) {
        // Preserve original unwatermarked video for the "Without Watermark" folder
        originalsList.push({
          filename: fileData.filename,
          contentType: fileData.contentType,
          size: fileData.size,
          data: fileData.data
        });

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

const knownCreatedFolders = new Set();

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function runWithConcurrency(tasks, limit = 6) {
  const results = new Array(tasks.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (idx < tasks.length) {
      const current = idx++;
      results[current] = await tasks[current]();
    }
  });
  await Promise.all(workers);
  return results;
}

  if (config.gasWebAppUrl) {
    try {
      console.log('Forwarding upload to Google Apps Script Web App URL:', config.gasWebAppUrl);
      const folderKey = `${eventName}::${className}`;
      const CHUNK_SIZE = 4;
      let firstWmRes = null;
      let remainingFiles = filesData;

      // Ensure event/class/watermark folders exist once before fanning out parallel chunks
      if (!knownCreatedFolders.has(folderKey) && filesData.length > 0) {
        firstWmRes = await callGasBridge('uploadFilesToDrive', {
          filesData: [filesData[0]],
          originalFilesData: [],
          eventName: eventName,
          className: className,
          addWatermark: addWatermark
        });
        if (firstWmRes && firstWmRes.status === 'success') {
          knownCreatedFolders.add(folderKey);
          remainingFiles = filesData.slice(1);
        } else if (firstWmRes) {
          return firstWmRes;
        }
      }

      const wmChunks = chunkArray(remainingFiles, CHUNK_SIZE);
      const origChunks = (addWatermark && originalsList.length > 0)
        ? chunkArray(originalsList, CHUNK_SIZE)
        : [];

      const tasks = [
        ...wmChunks.map((chunk) => () =>
          callGasBridge('uploadFilesToDrive', {
            filesData: chunk,
            originalFilesData: [],
            eventName: eventName,
            className: className,
            addWatermark: addWatermark
          })
        ),
        ...origChunks.map((chunk) => () =>
          callGasBridge('uploadFilesToDrive', {
            filesData: chunk,
            originalFilesData: [],
            eventName: eventName,
            className: className,
            addWatermark: false
          })
        )
      ];

      const parallelResults = tasks.length > 0 ? await runWithConcurrency(tasks, 6) : [];
      const wmResults = [
        ...(firstWmRes ? [firstWmRes] : []),
        ...parallelResults.slice(0, wmChunks.length)
      ].filter(Boolean);

      const primaryRes = wmResults.find((r) => r && r.status === 'success') || firstWmRes || parallelResults[0];
      if (primaryRes) {
        const mergedUrls = wmResults.flatMap((r) => (Array.isArray(r.urls) ? r.urls : []));
        return {
          ...primaryRes,
          urls: mergedUrls.length > 0 ? mergedUrls : (primaryRes.urls || []),
          message: addWatermark
            ? `${filesData.length} file(s) saved to both "With Watermark" (WhatsApp) and "Without Watermark" folders`
            : `${filesData.length} file(s) saved to "Without Watermark" folder`
        };
      }
    } catch (e) {
      console.error('Error forwarding to GAS WebApp URL:', e.message);
    }
  }

  const drive = getDriveClient();
  const sheets = getSheetsClient();

  if (!drive || !sheets) {
    return mockService.uploadFilesToDrive(filesData, eventName, className, addWatermark, originalsList);
  }

  try {
    if (!filesData || !filesData.length) throw new Error('No files provided');
    if (!eventName) throw new Error('Event name is required');
    if (!className) throw new Error('Class name is required');

    const rootFolderId = config.driveRootFolderId;
    const eventFolder = await getOrCreateFolder(drive, rootFolderId, eventName);
    const classSubfolder = await getOrCreateFolder(drive, eventFolder.id, className);

    const [withWatermarkFolder, withoutWatermarkFolder] = await Promise.all([
      addWatermark
        ? getOrCreateFolder(drive, classSubfolder.id, 'With Watermark')
        : Promise.resolve(null),
      getOrCreateFolder(drive, classSubfolder.id, 'Without Watermark')
    ]);

    const primaryTargetFolderId = withWatermarkFolder ? withWatermarkFolder.id : withoutWatermarkFolder.id;

    // Upload watermarked & unwatermarked copies to Drive in parallel
    const primaryUploadsPromise = Promise.all(
      filesData.map(async (f) => {
        try {
          return await uploadSingleFileToDriveFolder(drive, primaryTargetFolderId, f);
        } catch (fErr) {
          console.error(`Failed to upload file ${f.filename}:`, fErr.message);
          return null;
        }
      })
    );

    const originalUploadsPromise = (addWatermark && originalsList.length > 0)
      ? Promise.all(
          originalsList.map(async (orig) => {
            try {
              await uploadSingleFileToDriveFolder(drive, withoutWatermarkFolder.id, orig);
            } catch (origErr) {
              console.error(`Failed to upload original file ${orig.filename}:`, origErr.message);
            }
          })
        )
      : Promise.resolve([]);

    const [uploadedResults] = await Promise.all([primaryUploadsPromise, originalUploadsPromise]);
    const fileUrls = uploadedResults.filter(Boolean);

    const withWatermarkFolderUrl = withWatermarkFolder
      ? (withWatermarkFolder.webViewLink || `https://drive.google.com/drive/folders/${withWatermarkFolder.id}`)
      : '';
    const withoutWatermarkFolderUrl = withoutWatermarkFolder.webViewLink || `https://drive.google.com/drive/folders/${withoutWatermarkFolder.id}`;
    const folderUrl = withWatermarkFolderUrl || withoutWatermarkFolderUrl;

    await Promise.all([
      updateSheet2(sheets, eventName, className, folderUrl, fileUrls),
      updateAdditionalSheet(sheets, eventName, fileUrls)
    ]);

    return {
      status: 'success',
      message: addWatermark
        ? `${filesData.length} file(s) saved to both "With Watermark" (WhatsApp) and "Without Watermark" folders`
        : `${filesData.length} file(s) saved to "Without Watermark" folder`,
      urls: fileUrls,
      folderUrl: folderUrl,
      withWatermarkFolderUrl,
      withoutWatermarkFolderUrl,
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

let cachedEventFolders = null;
let cachedEventFoldersAt = 0;
let liveFolderSyncInFlight = false;

function refreshLiveFoldersInBackground() {
  if (liveFolderSyncInFlight || !config.gasWebAppUrl) return;
  liveFolderSyncInFlight = true;
  callGasBridge('getAllEventsForDeletion')
    .then((liveRes) => {
      if (liveRes && Array.isArray(liveRes.data)) {
        cachedEventFolders = liveRes.data
          .map((ev) => ev && ev.name)
          .filter((name) => name && name !== '_UserProfiles')
          .sort();
        cachedEventFoldersAt = Date.now();
      }
    })
    .catch(() => {})
    .finally(() => {
      liveFolderSyncInFlight = false;
    });
}

async function getAllFolders() {
  if (cachedEventFolders && (Date.now() - cachedEventFoldersAt) < 60000) {
    return cachedEventFolders;
  }

  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getAllFolders');
      let list = null;
      if (Array.isArray(res)) list = res;
      else if (res && Array.isArray(res.data)) list = res.data;
      else if (res && Array.isArray(res.folders)) list = res.folders;

      if (list) {
        const cleaned = list.filter((n) => n && n !== '_UserProfiles').sort();
        cachedEventFolders = cleaned;
        cachedEventFoldersAt = Date.now();
        // Refresh exact live Drive-only folders in background without blocking dropdown
        refreshLiveFoldersInBackground();
        return cleaned;
      }
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
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 200,
      fields: 'files(id, name, webViewLink, createdTime)'
    });

    const eventFolders = (eventRes.data.files || []).filter((f) => f.name !== '_UserProfiles');

    const events = await Promise.all(
      eventFolders.map(async (eventFolder) => {
        const classRes = await drive.files.list({
          q: `'${eventFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          pageSize: 200,
          fields: 'files(id, name, webViewLink, createdTime)'
        });

        const classFolders = classRes.data.files || [];
        const classes = await Promise.all(
          classFolders.map(async (classFolder) => {
            const fileRes = await drive.files.list({
              q: `'${classFolder.id}' in parents and trashed = false`,
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
              pageSize: 500,
              fields: 'files(id)'
            });
            return {
              name: classFolder.name,
              id: classFolder.id,
              url: classFolder.webViewLink,
              dateCreated: classFolder.createdTime,
              fileCount: (fileRes.data.files || []).length
            };
          })
        );

        classes.sort((a, b) => a.name.localeCompare(b.name));

        return {
          name: eventFolder.name,
          id: eventFolder.id,
          url: eventFolder.webViewLink,
          dateCreated: eventFolder.createdTime,
          classCount: classes.length,
          classes: classes
        };
      })
    );

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

async function getWithoutWatermarkFolderLinks(eventName = 'all') {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getWithoutWatermarkFolderLinks', { eventName: eventName || 'all' });
      if (res && res.status === 'success') return res;
    } catch (e) {
      console.error('GAS getWithoutWatermarkFolderLinks error:', e.message);
    }
  }

  const drive = getDriveClient();
  if (!drive) return mockService.getWithoutWatermarkFolderLinks(eventName);

  try {
    const isAll = !eventName || eventName === 'all';
    const findSubfolders = async (parentId, extraQ = '') => {
      const res = await drive.files.list({
        q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false ${extraQ}`,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: 'files(id, name, webViewLink)'
      });
      return res.data.files || [];
    };

    if (!isAll) {
      const safeEvent = sanitizeFolderName(eventName);
      const evFolders = await findSubfolders(config.driveRootFolderId, `and name = '${safeEvent}'`);
      if (!evFolders.length) return { status: 'success', data: [] };
      const classFolders = await findSubfolders(evFolders[0].id);
      const links = [];
      for (const cls of classFolders) {
        const wmOff = await findSubfolders(cls.id, `and name = 'Without Watermark'`);
        if (wmOff.length) {
          links.push({
            className: cls.name,
            folderUrl: wmOff[0].webViewLink || `https://drive.google.com/drive/folders/${wmOff[0].id}`
          });
        }
      }
      links.sort((a, b) => a.className.localeCompare(b.className));
      return { status: 'success', data: links };
    }

    const evFolders = await findSubfolders(config.driveRootFolderId);
    const results = [];
    for (const ev of evFolders) {
      if (ev.name === '_UserProfiles') continue;
      const classFolders = await findSubfolders(ev.id);
      const evClasses = [];
      for (const cls of classFolders) {
        const wmOff = await findSubfolders(cls.id, `and name = 'Without Watermark'`);
        if (wmOff.length) {
          evClasses.push({
            className: cls.name,
            folderUrl: wmOff[0].webViewLink || `https://drive.google.com/drive/folders/${wmOff[0].id}`
          });
        }
      }
      if (evClasses.length) {
        evClasses.sort((a, b) => a.className.localeCompare(b.className));
        results.push({ eventName: ev.name, classes: evClasses });
      }
    }
    results.sort((a, b) => a.eventName.localeCompare(b.eventName));
    return { status: 'success', data: results };
  } catch (e) {
    return { status: 'error', message: 'Error loading Without Watermark folders: ' + e.message };
  }
}

async function ensureUsersSheetExists(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: config.usersSheetId });
  const exists = (meta.data.sheets || []).some(
    (s) => s.properties && s.properties.title === config.usersSheetName
  );
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.usersSheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: config.usersSheetName } } }]
      }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.usersSheetId,
      range: `${config.usersSheetName}!A1:F3`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [
          ['Mobile / Username', 'Password', 'Class', 'Role / Details', 'Profile Photo', 'Full Name'],
          ['admin', 'password123', '', 'Administrator', '', 'Admin'],
          ['Avinash', 'Avinash123', '', 'Administrator', '', 'Avinash']
        ]
      }
    });
  }
}

async function getUsersListForAdmin() {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('getUsersListForAdmin');
      if (res && res.status === 'success') return res;
    } catch (e) {
      console.error('GAS getUsersListForAdmin error:', e.message);
    }
  }

  const sheets = getSheetsClient();
  if (!sheets) return mockService.getUsersListForAdmin();

  try {
    await ensureUsersSheetExists(sheets);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.usersSheetId,
      range: `${config.usersSheetName}!A:F`
    });
    const rows = response.data.values || [];
    const headerCell = rows[0] && rows[0][0] ? rows[0][0].toString().toLowerCase() : '';
    const startRow = (headerCell.includes('username') || headerCell.includes('mobile')) ? 1 : 0;
    const list = [];
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] && row[1]) {
        list.push({
          username: row[0].toString().trim(),
          password: row[1].toString().trim(),
          assignedClass: row[2] ? row[2].toString().trim() : '',
          details: row[3] ? row[3].toString().trim() : '',
          photoUrl: row[4] ? row[4].toString().trim() : '',
          fullName: row[5] ? row[5].toString().trim() : ''
        });
      }
    }
    return { status: 'success', data: list };
  } catch (e) {
    console.error('Error getting users list:', e.message);
    return mockService.getUsersListForAdmin();
  }
}

async function addOrUpdateUser(username, password, assignedClass = '', details = '', photoUrl = '', originalUsername = '', fullName = '') {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('addOrUpdateUser', {
        username,
        password,
        assignedClass,
        details,
        photoUrl,
        originalUsername,
        fullName
      });
      if (res && res.status) return res;
    } catch (e) {
      console.error('GAS addOrUpdateUser error:', e.message);
    }
  }

  const sheets = getSheetsClient();
  if (!sheets) return mockService.addOrUpdateUser(username, password, assignedClass, details, photoUrl, originalUsername, fullName);

  try {
    await ensureUsersSheetExists(sheets);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.usersSheetId,
      range: `${config.usersSheetName}!A:F`
    });
    const rows = response.data.values || [];
    const cleanUser = username.toString().trim();
    const cleanPass = password.toString().trim();
    const cleanClass = (assignedClass || '').toString().trim();
    const cleanDetails = (details || '').toString().trim();
    const cleanPhoto = (photoUrl || '').toString().trim();
    const cleanFullName = (fullName || '').toString().trim();
    const lookup = (originalUsername || cleanUser).toString().trim().toLowerCase();

    let matchRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].toString().trim().toLowerCase() === lookup) {
        matchRow = i + 1;
        break;
      }
    }

    if (matchRow !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.usersSheetId,
        range: `${config.usersSheetName}!A${matchRow}:F${matchRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[cleanUser, cleanPass, cleanClass, cleanDetails, cleanPhoto, cleanFullName]] }
      });
      return { status: 'success', message: `User "${cleanFullName || cleanUser}" updated in Google Sheet.` };
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: config.usersSheetId,
      range: `${config.usersSheetName}!A:F`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[cleanUser, cleanPass, cleanClass, cleanDetails, cleanPhoto, cleanFullName]] }
    });
    return { status: 'success', message: `User "${cleanFullName || cleanUser}" added to Google Sheet.` };
  } catch (e) {
    return { status: 'error', message: 'Failed to save user: ' + e.message };
  }
}

async function deleteUser(username) {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('deleteUser', { username });
      if (res && res.status) return res;
    } catch (e) {
      console.error('GAS deleteUser error:', e.message);
    }
  }

  const sheets = getSheetsClient();
  if (!sheets) return mockService.deleteUser(username);

  try {
    await ensureUsersSheetExists(sheets);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.usersSheetId,
      range: `${config.usersSheetName}!A:D`
    });
    const rows = response.data.values || [];
    const cleanUser = username.toString().trim().toLowerCase();
    const filtered = rows.filter((row, idx) => idx === 0 || !(row[0] && row[0].toString().trim().toLowerCase() === cleanUser));
    await sheets.spreadsheets.values.clear({
      spreadsheetId: config.usersSheetId,
      range: `${config.usersSheetName}!A:D`
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.usersSheetId,
      range: `${config.usersSheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: filtered }
    });
    return { status: 'success', message: `User "${username}" deleted.` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function changeUserPassword(username, newPassword) {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('changeUserPassword', { username, newPassword });
      if (res && res.status) return res;
    } catch (e) {
      console.error('GAS changeUserPassword error:', e.message);
    }
  }

  const sheets = getSheetsClient();
  if (!sheets) return mockService.changeUserPassword(username, newPassword);

  try {
    await ensureUsersSheetExists(sheets);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.usersSheetId,
      range: `${config.usersSheetName}!A:F`
    });
    const rows = response.data.values || [];
    const cleanUser = username.toString().trim().toLowerCase();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].toString().trim().toLowerCase() === cleanUser) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: config.usersSheetId,
          range: `${config.usersSheetName}!B${i + 1}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[newPassword.toString().trim()]] }
        });
        return { status: 'success', message: 'Password updated successfully.' };
      }
    }
    return { status: 'error', message: 'User not found' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function applyDefaultPasswordToNamedUsers() {
  if (config.gasWebAppUrl) {
    try {
      const res = await callGasBridge('applyDefaultPasswordToNamedUsers');
      if (res && res.status) return res;
    } catch (e) {
      console.error('GAS applyDefaultPasswordToNamedUsers error:', e.message);
    }
  }

  const sheets = getSheetsClient();
  if (!sheets) return mockService.applyDefaultPasswordToNamedUsers();

  try {
    await ensureUsersSheetExists(sheets);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.usersSheetId,
      range: `${config.usersSheetName}!A:F`
    });
    const rows = response.data.values || [];
    let updated = 0;
    for (let i = 1; i < rows.length; i++) {
      const fullName = rows[i][5] ? rows[i][5].toString().trim() : '';
      if (rows[i][0] && fullName) {
        rows[i][1] = 'Success@123';
        updated++;
      }
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.usersSheetId,
      range: `${config.usersSheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rows }
    });
    return { status: 'success', message: `Default password (Success@123) applied to ${updated} user(s) with Full Name.` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

const APP_BRANDING_LOGO_NAME = 'app_branding_logo.png';

async function saveAppLogoToDrive(buffer) {
  const drive = getDriveClient();
  if (!drive || !config.driveRootFolderId || !buffer) return null;
  try {
    const query = `name = '${APP_BRANDING_LOGO_NAME}' and '${config.driveRootFolderId}' in parents and trashed = false`;
    const listRes = await drive.files.list({
      q: query,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(id)'
    });
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    if (listRes.data.files && listRes.data.files.length > 0) {
      const fileId = listRes.data.files[0].id;
      await drive.files.update({
        fileId,
        media: { mimeType: 'image/png', body: bufferStream },
        supportsAllDrives: true
      });
      return fileId;
    }

    const created = await drive.files.create({
      requestBody: {
        name: APP_BRANDING_LOGO_NAME,
        parents: [config.driveRootFolderId]
      },
      media: { mimeType: 'image/png', body: bufferStream },
      supportsAllDrives: true,
      fields: 'id'
    });
    return created.data.id;
  } catch (err) {
    console.warn('Could not persist app logo to Google Drive:', err.message);
    return null;
  }
}

async function loadAppLogoFromDrive() {
  const drive = getDriveClient();
  if (!drive || !config.driveRootFolderId) return null;
  try {
    const query = `name = '${APP_BRANDING_LOGO_NAME}' and '${config.driveRootFolderId}' in parents and trashed = false`;
    const listRes = await drive.files.list({
      q: query,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(id)'
    });
    if (!listRes.data.files || listRes.data.files.length === 0) return null;
    const fileId = listRes.data.files[0].id;
    const fileRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(fileRes.data);
  } catch (err) {
    console.warn('Could not load persisted app logo from Google Drive:', err.message);
    return null;
  }
}

module.exports = {
  isConfigured: () => {
    initGoogleAuth();
    return isGoogleApiConfigured || !!config.gasWebAppUrl;
  },
  getUsersFromSheet,
  getUsersListForAdmin,
  addOrUpdateUser,
  deleteUser,
  changeUserPassword,
  applyDefaultPasswordToNamedUsers,
  getAllFolders,
  getSubfoldersForEvent,
  uploadFilesToDrive,
  getEventsFromSheet2,
  getFolderLinksFromSheet2,
  getFolderLinksForEvent,
  getWithoutWatermarkFolderLinks,
  getRecentUploads,
  getAllEventsForDeletion,
  deleteEventFolder,
  deleteClassFolder,
  getEventsForWhatsApp,
  getClassesForWhatsApp,
  getFolderInfoForWhatsApp,
  saveAppLogoToDrive,
  loadAppLogoFromDrive
};
