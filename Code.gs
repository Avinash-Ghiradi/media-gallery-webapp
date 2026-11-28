// Add these configuration variables at the top
var USERS_SHEET_ID = '14Qf8_lT3D61fbpRTGw1GRKxB2V0UccjBe2LDT0n5DME';
var USERS_SHEET_NAME = 'users';
var SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
var DEFAULT_WATERMARK = true;

// Add these configuration variables for spreadsheets
var LOG_SHEET_ID = '14Qf8_lT3D61fbpRTGw1GRKxB2V0UccjBe2LDT0n5DME';
var URL_SHEET_ID = '19BwOHx7jmTjCQlh-oiBtXHO_ugG9rpgRghly0sPqJng';
var DRIVE_ROOT_FOLDER_ID = '1bK-DO_ZtsUe2ASqMWqr0St7zoUv8UlNw';

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action) {
      var action = e.parameter.action;
      var res;
      if (action === 'getAllFolders') {
        res = getAllExistingFolders();
      } else if (action === 'getSubfoldersForEvent') {
        res = getSubfoldersForEvent(e.parameter.eventName);
      } else if (action === 'getEventsFromSheet2') {
        res = getEventsFromSheet2();
      } else if (action === 'getFolderLinksFromSheet2') {
        res = getFolderLinksFromSheet2();
      } else if (action === 'getFolderLinksForEvent') {
        res = getFolderLinksForEvent(e.parameter.eventName);
      } else if (action === 'getWithoutWatermarkFolderLinks') {
        res = getWithoutWatermarkFolderLinks(e.parameter.eventName);
      } else if (action === 'getRecentUploads') {
        res = getRecentUploads();
      } else if (action === 'getAllEventsForDeletion') {
        res = getAllEventsForDeletion();
      } else if (action === 'getEventsForWhatsApp') {
        res = getEventsForWhatsApp();
      } else if (action === 'getClassesForWhatsApp') {
        res = getClassesForWhatsApp(e.parameter.eventName);
      } else if (action === 'getFolderInfoForWhatsApp') {
        res = getFolderInfoForWhatsApp(e.parameter.eventName, e.parameter.className);
      } else if (action === 'getUsersFromSheet') {
        res = getUsersFromSheet();
      } else if (action === 'getUsersListForAdmin') {
        res = getUsersListForAdmin();
      } else if (action === 'getHomeworkBundle') {
        res = getHomeworkBundle();
      }

      if (res) {
        return ContentService.createTextOutput(JSON.stringify(res))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
  } catch (err) {}

  return ContentService.createTextOutput("Media Gallery Web App Bridge Active!")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var action = contents.action;
    var res;

    if (action === 'uploadFilesToDrive') {
      res = uploadFilesToDrive(contents.filesData, contents.eventName, contents.className, contents.addWatermark, contents.originalFilesData);
    } else if (action === 'getAllFolders') {
      res = getAllExistingFolders();
    } else if (action === 'getSubfoldersForEvent') {
      res = getSubfoldersForEvent(contents.eventName);
    } else if (action === 'getEventsFromSheet2') {
      res = getEventsFromSheet2();
    } else if (action === 'getFolderLinksFromSheet2') {
      res = getFolderLinksFromSheet2();
    } else if (action === 'getFolderLinksForEvent') {
      res = getFolderLinksForEvent(contents.eventName);
    } else if (action === 'getWithoutWatermarkFolderLinks') {
      res = getWithoutWatermarkFolderLinks(contents.eventName);
    } else if (action === 'getRecentUploads') {
      res = getRecentUploads();
    } else if (action === 'getAllEventsForDeletion') {
      res = getAllEventsForDeletion();
    } else if (action === 'deleteEventFolder') {
      res = deleteEventFolder(contents.eventName);
    } else if (action === 'deleteClassFolder') {
      res = deleteClassFolder(contents.eventName, contents.className);
    } else if (action === 'getEventsForWhatsApp') {
      res = getEventsForWhatsApp();
    } else if (action === 'getClassesForWhatsApp') {
      res = getClassesForWhatsApp(contents.eventName);
    } else if (action === 'getFolderInfoForWhatsApp') {
      res = getFolderInfoForWhatsApp(contents.eventName, contents.className);
    } else if (action === 'getUsersFromSheet') {
      res = getUsersFromSheet();
    } else if (action === 'getUsersListForAdmin') {
      res = getUsersListForAdmin();
    } else if (action === 'addOrUpdateUser') {
      res = addOrUpdateUserInSheet(contents.username, contents.password, contents.assignedClass, contents.details, contents.photoUrl, contents.originalUsername, contents.fullName);
    } else if (action === 'deleteUser') {
      res = deleteUserFromSheet(contents.username);
    } else if (action === 'changeUserPassword') {
      res = changeUserPasswordInSheet(contents.username, contents.newPassword);
    } else if (action === 'applyDefaultPasswordToNamedUsers') {
      res = applyDefaultPasswordToNamedUsersInSheet();
    } else if (action === 'getBrandingFromSheet') {
      res = getBrandingFromSheet();
    } else if (action === 'saveBrandingToSheet') {
      res = saveBrandingToSheet(contents.kind, contents.url);
    } else if (action === 'getHomeworkBundle') {
      res = getHomeworkBundle();
    } else if (action === 'saveHomeworkInSheet') {
      res = saveHomeworkInSheet(contents.record || contents);
    } else if (action === 'deleteHomeworkInSheet') {
      res = deleteHomeworkInSheet(contents.id);
    } else if (action === 'authenticateUser') {
      res = authenticateUser(contents.password);
    } else {
      res = { status: 'error', message: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Include HTML file content
 */
function ensureBrandingSheetExists() {
  var ss = SpreadsheetApp.openById(USERS_SHEET_ID);
  var sheet = ss.getSheetByName('branding');
  if (!sheet) {
    sheet = ss.insertSheet('branding');
    sheet.appendRow(['Key', 'Logo URL', 'Updated At']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
  }
  return sheet;
}

function getBrandingFromSheet() {
  try {
    var sheet = ensureBrandingSheetExists();
    var data = sheet.getDataRange().getValues();
    var appLogoUrl = '';
    var photoLogoUrl = '';
    for (var i = 1; i < data.length; i++) {
      var k = data[i][0] ? data[i][0].toString().trim() : '';
      var u = data[i][1] ? data[i][1].toString().trim() : '';
      if (k === 'app_logo' && u) appLogoUrl = u;
      if (k === 'photo_logo' && u) photoLogoUrl = u;
    }
    return { status: 'success', appLogoUrl: appLogoUrl, photoLogoUrl: photoLogoUrl };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function saveBrandingToSheet(kind, url) {
  try {
    var key = kind === 'photo' ? 'photo_logo' : 'app_logo';
    var cleanUrl = url ? url.toString().trim() : '';
    var sheet = ensureBrandingSheetExists();
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === key) {
        sheet.getRange(i + 1, 1, 1, 3).setValues([[key, cleanUrl, new Date()]]);
        return { status: 'success', key: key, url: cleanUrl };
      }
    }
    sheet.appendRow([key, cleanUrl, new Date()]);
    return { status: 'success', key: key, url: cleanUrl };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Check authentication status
 */
function checkAuthStatus() {
  var user = getCurrentUser();
  return {
    isAuthenticated: user !== null,
    username: user ? user.username : '',
    timestamp: user ? user.timestamp : null
  };
}

/**
 * Get current user info
 */
function getCurrentUser() {
  try {
    var cache = CacheService.getScriptCache();
    var session = cache.get('user_session');
    
    if (!session) {
      return null;
    }
    
    var sessionData = JSON.parse(session);
    var now = new Date().getTime();
    
    if (now - sessionData.timestamp > SESSION_TIMEOUT) {
      cache.remove('user_session');
      return null;
    }
    
    sessionData.timestamp = now;
    cache.put('user_session', JSON.stringify(sessionData), 1800);
    
    return sessionData;
  } catch (e) {
    console.error('Error getting current user:', e);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
function isUserAuthenticated() {
  return true; // Web App Bridge bypasses Apps Script UI session (Auth is managed by Node.js server)
}

function ensureUsersSheetExists() {
  var spreadsheet = SpreadsheetApp.openById(USERS_SHEET_ID);
  var sheet = spreadsheet.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(USERS_SHEET_NAME);
    sheet.getRange(1, 1, 1, 6).setValues([['Mobile / Username', 'Password', 'Class', 'Role / Details', 'Profile Photo', 'Full Name']]);
    sheet.appendRow(['admin', 'password123', '', 'Administrator', '', 'Admin']);
    sheet.appendRow(['Avinash', 'Avinash123', '', 'Administrator', '', 'Avinash']);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 6).setValues([['Mobile / Username', 'Password', 'Class', 'Role / Details', 'Profile Photo', 'Full Name']]);
  } else if (sheet.getLastColumn() < 6) {
    if (sheet.getLastColumn() < 5) sheet.getRange(1, 5).setValue('Profile Photo');
    sheet.getRange(1, 6).setValue('Full Name');
  }
  return sheet;
}

function saveProfilePhotoToDrive(username, photoDataUrl) {
  if (!photoDataUrl || photoDataUrl.indexOf('data:image/') !== 0) {
    return photoDataUrl || '';
  }
  try {
    var parts = photoDataUrl.split(',');
    var mimeMatch = parts[0].match(/data:(image\/[^;]+);/);
    var contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    var base64Data = parts[1];

    var rootFolder = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
    var profilesFolder = getOrCreateFolder(rootFolder, '_UserProfiles');
    var safeName = sanitizeFilename(username) + '_profile.jpg';

    var existing = profilesFolder.getFilesByName(safeName);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, safeName);
    var file = profilesFolder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (permErr) {}

    return 'https://lh3.googleusercontent.com/d/' + file.getId();
  } catch (e) {
    console.error('Profile photo Drive upload fallback:', e);
    return photoDataUrl;
  }
}

/**
 * Get users from Google Sheet (auto-creates users tab if missing)
 */
function getUsersFromSheet() {
  try {
    var sheet = ensureUsersSheetExists();
    var dataRange = sheet.getDataRange();
    var data = dataRange.getValues();
    
    var startRow = data[0] && data[0][0] && (data[0][0].toString().toLowerCase().indexOf('username') !== -1 || data[0][0].toString().toLowerCase().indexOf('mobile') !== -1) ? 1 : 0;
    
    var users = {};
    for (var i = startRow; i < data.length; i++) {
      var row = data[i];
      var fullName = row[5] ? row[5].toString().trim() : '';
      var pwd = row[1] ? row[1].toString().trim() : (fullName ? 'Success@123' : '');
      if (row[0] && pwd) {
        var uname = row[0].toString().trim();
        var assignedClass = row[2] ? row[2].toString().trim() : '';
        var details = row[3] ? row[3].toString().trim() : '';
        var photoUrl = row[4] ? row[4].toString().trim() : '';
        var assignedClasses = row[6] ? row[6].toString().trim() : '';
        var assignedSubjects = row[7] ? row[7].toString().trim() : '';
        users[uname] = {
          password: pwd,
          assignedClass: assignedClass,
          details: details,
          photoUrl: photoUrl,
          fullName: fullName,
          assignedClasses: assignedClasses,
          assignedSubjects: assignedSubjects
        };
      }
    }
    
    return users;
  } catch (e) {
    console.error('Error reading users from sheet:', e);
    return { 'admin': 'password123' };
  }
}

function getUsersListForAdmin() {
  try {
    var sheet = ensureUsersSheetExists();
    var data = sheet.getDataRange().getValues();
    var startRow = data[0] && data[0][0] && (data[0][0].toString().toLowerCase().indexOf('username') !== -1 || data[0][0].toString().toLowerCase().indexOf('mobile') !== -1) ? 1 : 0;
    var list = [];
    for (var i = startRow; i < data.length; i++) {
      var row = data[i];
      var fullName = row[5] ? row[5].toString().trim() : '';
      var pwd = row[1] ? row[1].toString().trim() : (fullName ? 'Success@123' : '');
      if (row[0] && pwd) {
        list.push({
          username: row[0].toString().trim(),
          password: pwd,
          assignedClass: row[2] ? row[2].toString().trim() : '',
          details: row[3] ? row[3].toString().trim() : '',
          photoUrl: row[4] ? row[4].toString().trim() : '',
          fullName: fullName
        });
      }
    }
    return { status: 'success', data: list };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function addOrUpdateUserInSheet(username, password, assignedClass, details, photoUrl, originalUsername, fullName) {
  try {
    var cleanUser = username ? username.toString().trim() : '';
    var cleanFullName = fullName ? fullName.toString().trim() : '';
    var cleanPass = password ? password.toString().trim() : (cleanFullName ? 'Success@123' : '');
    if (!cleanUser || !cleanPass) {
      return { status: 'error', message: 'Mobile number / username and password are required' };
    }
    var cleanClass = assignedClass ? assignedClass.toString().trim() : '';
    var cleanDetails = details ? details.toString().trim() : '';
    var lookupUser = (originalUsername ? originalUsername.toString().trim() : cleanUser).toLowerCase();
    var finalPhotoUrl = saveProfilePhotoToDrive(cleanUser, photoUrl ? photoUrl.toString().trim() : '');

    var sheet = ensureUsersSheetExists();
    var data = sheet.getDataRange().getValues();
    var startRow = data[0] && data[0][0] && (data[0][0].toString().toLowerCase().indexOf('username') !== -1 || data[0][0].toString().toLowerCase().indexOf('mobile') !== -1) ? 1 : 0;

    for (var i = startRow; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim().toLowerCase() === lookupUser) {
        sheet.getRange(i + 1, 1, 1, 6).setValues([[cleanUser, cleanPass, cleanClass, cleanDetails, finalPhotoUrl, cleanFullName]]);
        return { status: 'success', message: 'User "' + (cleanFullName || cleanUser) + '" updated in Google Sheet.' };
      }
    }

    sheet.appendRow([cleanUser, cleanPass, cleanClass, cleanDetails, finalPhotoUrl, cleanFullName]);
    return { status: 'success', message: 'User "' + (cleanFullName || cleanUser) + '" added to Google Sheet.' };
  } catch (e) {
    return { status: 'error', message: 'Failed to save user: ' + e.message };
  }
}

function changeUserPasswordInSheet(username, newPassword) {
  try {
    if (!username || !newPassword) {
      return { status: 'error', message: 'Username and new password are required' };
    }
    var cleanUser = username.toString().trim().toLowerCase();
    var cleanPass = newPassword.toString().trim();
    var sheet = ensureUsersSheetExists();
    var data = sheet.getDataRange().getValues();
    var startRow = data[0] && data[0][0] && (data[0][0].toString().toLowerCase().indexOf('username') !== -1 || data[0][0].toString().toLowerCase().indexOf('mobile') !== -1) ? 1 : 0;

    for (var i = startRow; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim().toLowerCase() === cleanUser) {
        sheet.getRange(i + 1, 2).setValue(cleanPass);
        return { status: 'success', message: 'Password updated successfully.' };
      }
    }
    return { status: 'error', message: 'User not found in sheet' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function applyDefaultPasswordToNamedUsersInSheet() {
  try {
    var sheet = ensureUsersSheetExists();
    var data = sheet.getDataRange().getValues();
    var startRow = data[0] && data[0][0] && (data[0][0].toString().toLowerCase().indexOf('username') !== -1 || data[0][0].toString().toLowerCase().indexOf('mobile') !== -1) ? 1 : 0;
    var updated = 0;

    for (var i = startRow; i < data.length; i++) {
      var fullName = data[i][5] ? data[i][5].toString().trim() : '';
      if (data[i][0] && fullName) {
        sheet.getRange(i + 1, 2).setValue('Success@123');
        updated++;
      }
    }
    return { status: 'success', message: 'Default password (Success@123) applied to ' + updated + ' user(s) with Full Name.' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function deleteUserFromSheet(username) {
  try {
    if (!username) return { status: 'error', message: 'Username is required' };
    var cleanUser = username.toString().trim().toLowerCase();
    var sheet = ensureUsersSheetExists();
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] && data[i][0].toString().trim().toLowerCase() === cleanUser) {
        sheet.deleteRow(i + 1);
        return { status: 'success', message: 'User "' + username + '" deleted.' };
      }
    }
    return { status: 'error', message: 'User not found' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/**
 * Authenticate user with password
 */
function authenticateUser(password) {
  try {
    var users = getUsersFromSheet();
    
    for (var username in users) {
      if (users[username] === password) {
        var cache = CacheService.getScriptCache();
        var sessionData = {
          username: username,
          timestamp: new Date().getTime()
        };
        cache.put('user_session', JSON.stringify(sessionData), 1800);
        
        return {
          status: 'success',
          username: username,
          message: 'Authentication successful'
        };
      }
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
 * Logout user
 */
function logoutUser() {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove('user_session');
    return { status: 'success', message: 'Logged out successfully' };
  } catch (e) {
    return { status: 'error', message: 'Logout failed: ' + e.message };
  }
}

function saveFileToDriveFolder(targetFolder, fileData) {
  var filename = sanitizeFilename(fileData.filename);
  var base64Data = fileData.data;
  if (base64Data.indexOf('base64,') !== -1) {
    base64Data = base64Data.split('base64,')[1];
  }
  var contentType = fileData.contentType || 'image/jpeg';

  var existingFiles = targetFolder.getFilesByName(filename);
  if (existingFiles.hasNext()) {
    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    var ext = filename.split('.').pop();
    var baseName = filename.substring(0, filename.lastIndexOf('.'));
    filename = baseName + '_' + timestamp + '.' + ext;
  }

  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    contentType,
    filename
  );
  var file = targetFolder.createFile(blob);

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (permErr) {}

  return {
    originalName: fileData.filename,
    savedName: filename,
    url: file.getUrl(),
    contentType: contentType,
    size: file.getSize()
  };
}

/**
 * Uploads files to Drive in separate "With Watermark" (WhatsApp) and "Without Watermark" folders
 */
function uploadFilesToDrive(filesData, eventName, className, addWatermark, originalFilesData) {
  if (addWatermark === undefined) addWatermark = true;
  if (!originalFilesData) originalFilesData = [];
  
  try {
    if (!filesData || !filesData.length) throw new Error('No files provided');
    if (!eventName) throw new Error('Event name is required');
    if (!className) throw new Error('Class name is required');
    
    var rootFolderId = DRIVE_ROOT_FOLDER_ID;
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    
    var spreadsheetId = LOG_SHEET_ID;
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet = spreadsheet.getSheetByName('Sheet1') || spreadsheet.getSheets()[0];
    var sheet2 = spreadsheet.getSheetByName('Sheet2') || spreadsheet.insertSheet('Sheet2');
    
    var additionalSpreadsheetId = URL_SHEET_ID;
    var additionalSpreadsheet = SpreadsheetApp.openById(additionalSpreadsheetId);
    var dataSheet = additionalSpreadsheet.getSheetByName('data');
    
    if (!dataSheet) {
      dataSheet = additionalSpreadsheet.insertSheet('data');
    }
    
    var fileUrls = [];
    
    // 1. Get or create EVENT folder & CLASS subfolder
    var eventFolder = getOrCreateFolder(rootFolder, eventName);
    var classSubfolder = getOrCreateFolder(eventFolder, className);

    // 2. Create separate "With Watermark" (for WhatsApp) and "Without Watermark" folders
    var withWatermarkFolder = addWatermark ? getOrCreateFolder(classSubfolder, 'With Watermark') : null;
    var withoutWatermarkFolder = getOrCreateFolder(classSubfolder, 'Without Watermark');
    var primaryTargetFolder = withWatermarkFolder || withoutWatermarkFolder;
    
    // 3. Save watermarked files (or unwatermarked when toggle is OFF)
    filesData.forEach(function(fileData, index) {
      try {
        var saved = saveFileToDriveFolder(primaryTargetFolder, fileData);
        fileUrls.push({
          originalName: saved.originalName,
          savedName: saved.savedName,
          url: saved.url
        });
        
        sheet.appendRow([
          eventName, 
          className, 
          saved.savedName, 
          saved.url, 
          new Date(),
          saved.contentType,
          saved.size
        ]);
      } catch (e) {
        console.error('Error uploading file #' + (index + 1) + ': ' + fileData.filename, e);
        fileUrls.push({
          originalName: fileData.filename,
          error: 'Error: ' + e.message
        });
      }
    });

    // 4. Save original unwatermarked copies into "Without Watermark" folder
    if (addWatermark && originalFilesData.length > 0) {
      originalFilesData.forEach(function(origData, index) {
        try {
          saveFileToDriveFolder(withoutWatermarkFolder, origData);
        } catch (origErr) {
          console.error('Error uploading original file #' + (index + 1) + ': ' + origData.filename, origErr);
        }
      });
    }

    var withWatermarkFolderUrl = withWatermarkFolder ? withWatermarkFolder.getUrl() : '';
    var withoutWatermarkFolderUrl = withoutWatermarkFolder.getUrl();
    var shareFolderUrl = withWatermarkFolderUrl || withoutWatermarkFolderUrl;
    
    updateSheet2(sheet2, eventName, className, shareFolderUrl, fileUrls);
    updateAdditionalSheet(dataSheet, eventName, fileUrls);
    
    return {
      status: 'success',
      message: addWatermark
        ? filesData.length + ' file(s) saved to both "With Watermark" (WhatsApp) and "Without Watermark" folders'
        : filesData.length + ' file(s) saved to "Without Watermark" folder',
      urls: fileUrls,
      folderUrl: shareFolderUrl,
      withWatermarkFolderUrl: withWatermarkFolderUrl,
      withoutWatermarkFolderUrl: withoutWatermarkFolderUrl,
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

/**
 * Gets or creates a folder
 */
function getOrCreateFolder(parentFolder, folderName) {
  if (!parentFolder) throw new Error('Parent folder not provided');
  if (!folderName) throw new Error('Folder name not provided');
  
  var safeFolderName = sanitizeFolderName(folderName);
  var folders = parentFolder.getFoldersByName(safeFolderName);
  
  var folder;
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = parentFolder.createFolder(safeFolderName);
  }
  
  try {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(e){}
  
  return folder;
}

/**
 * Gets all existing folders under the root folder and spreadsheet logs
 */
function getAllExistingFolders() {
  try {
    var folderNames = [];

    // 1. Scan Google Drive root folder only (avoid returning deleted events from old Sheet rows)
    try {
      var rootFolderId = DRIVE_ROOT_FOLDER_ID;
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var folders = rootFolder.getFolders();
      while (folders.hasNext()) {
        var folder = folders.next();
        var name = folder.getName();
        if (name !== '_UserProfiles' && folderNames.indexOf(name) === -1) {
          folderNames.push(name);
        }
      }
    } catch(dErr) {
      console.error('Drive root folder scan error:', dErr);
    }

    return folderNames.sort();
  } catch (e) {
    console.error('Error getting folders:', e);
    return [];
  }
}

/**
 * Gets all existing subfolders under a specific event folder and spreadsheet logs
 */
function getSubfoldersForEvent(eventName) {
  try {
    var subfolderNames = [];

    // 1. Scan Google Drive subfolders for event
    try {
      var rootFolderId = DRIVE_ROOT_FOLDER_ID;
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var eventFolders = rootFolder.getFoldersByName(eventName);
      if (eventFolders.hasNext()) {
        var eventFolder = eventFolders.next();
        var subfolders = eventFolder.getFolders();
        while (subfolders.hasNext()) {
          var subfolder = subfolders.next();
          var sName = subfolder.getName();
          if (subfolderNames.indexOf(sName) === -1) {
            subfolderNames.push(sName);
          }
        }
      }
    } catch(dErr) {}

    // 2. Scan Sheet1 & Sheet2 for event classes
    try {
      var spreadsheet = SpreadsheetApp.openById(LOG_SHEET_ID);
      var sheetNames = ['Sheet1', 'Sheet2'];
      sheetNames.forEach(function(sName) {
        var sheet = spreadsheet.getSheetByName(sName);
        if (sheet && sheet.getLastRow() > 1) {
          var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
          data.forEach(function(row) {
            if (row[0] && row[0].toString().trim() === eventName && row[1] && row[1].toString().trim() !== '') {
              var className = row[1].toString().trim();
              if (subfolderNames.indexOf(className) === -1) {
                subfolderNames.push(className);
              }
            }
          });
        }
      });
    } catch(sErr) {}

    return subfolderNames.sort();
  } catch (e) {
    console.error('Error getting subfolders:', e);
    return [];
  }
}

/**
 * Updates Sheet2
 */
function updateSheet2(sheet2, eventName, className, folderUrl, fileUrls) {
  try {
    if (sheet2.getLastRow() === 0) {
      var headers = ['Event Name', 'Class Name', 'Folder URL'];
      var maxImages = 10;
      for (var i = 1; i <= maxImages; i++) {
        headers.push('Image ' + i + ' URL');
      }
      sheet2.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    var dataRange = sheet2.getDataRange();
    var data = dataRange.getValues();
    
    var existingRowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === eventName && data[i][1] === className) {
        existingRowIndex = i;
        break;
      }
    }
    
    if (existingRowIndex !== -1) {
      var row = data[existingRowIndex];
      
      fileUrls.forEach(function(fileUrl) {
        if (fileUrl.url) {
          var emptyCellIndex = findFirstEmptyCell(row, 3);
          if (emptyCellIndex !== -1 && emptyCellIndex < row.length) {
            row[emptyCellIndex] = fileUrl.url;
          } else {
            row.push(fileUrl.url);
          }
        }
      });
      
      sheet2.getRange(existingRowIndex + 1, 1, 1, row.length).setValues([row]);
    } else {
      var nextRow = sheet2.getLastRow() + 1;
      var rowData = [eventName, className, folderUrl];
      
      fileUrls.forEach(function(fileUrl) {
        if (fileUrl.url) {
          rowData.push(fileUrl.url);
        }
      });
      
      sheet2.getRange(nextRow, 1, 1, rowData.length).setValues([rowData]);
    }
    
    var lastColumn = sheet2.getLastColumn();
    sheet2.autoResizeColumns(1, lastColumn);
  } catch (e) {
    console.error('Error updating Sheet2:', e);
  }
}

/**
 * Updates additional data sheet
 */
function updateAdditionalSheet(dataSheet, eventName, fileUrls) {
  try {
    if (dataSheet.getLastRow() === 0) {
      var headers = ['Event Name'];
      var maxImages = 10;
      for (var i = 1; i <= maxImages; i++) {
        headers.push('Image ' + i + ' URL');
      }
      dataSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    var dataRange = dataSheet.getDataRange();
    var data = dataRange.getValues();
    
    var existingRowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === eventName) {
        existingRowIndex = i;
        break;
      }
    }
    
    if (existingRowIndex !== -1) {
      var row = data[existingRowIndex];
      
      fileUrls.forEach(function(fileUrl) {
        if (fileUrl.url) {
          var emptyCellIndex = findFirstEmptyCell(row, 1);
          if (emptyCellIndex !== -1 && emptyCellIndex < row.length) {
            row[emptyCellIndex] = fileUrl.url;
          } else {
            row.push(fileUrl.url);
          }
        }
      });
      
      dataSheet.getRange(existingRowIndex + 1, 1, 1, row.length).setValues([row]);
    } else {
      var rowData = [eventName];
      
      fileUrls.forEach(function(fileUrl) {
        if (fileUrl.url) {
          rowData.push(fileUrl.url);
        }
      });
      
      if (dataSheet.getLastRow() >= 1) {
        dataSheet.insertRowAfter(1);
      }
      dataSheet.getRange(2, 1, 1, rowData.length).setValues([rowData]);
    }
    
    var lastColumn = dataSheet.getLastColumn();
    dataSheet.autoResizeColumns(1, lastColumn);
  } catch (e) {
    console.error('Error updating additional sheet:', e);
  }
}

/**
 * Finds the first empty cell in an array
 */
function findFirstEmptyCell(row, startIndex) {
  for (var i = startIndex; i < row.length; i++) {
    if (!row[i] || row[i] === '') {
      return i;
    }
  }
  return -1;
}

/**
 * Sanitizes folder names
 */
function sanitizeFolderName(name) {
  if (!name) return '';
  return name.replace(/[\/\\?%*:|"<>]/g, '-').trim();
}

/**
 * Sanitizes filenames
 */
function sanitizeFilename(name) {
  if (!name) return 'unnamed-file';
  return name.replace(/[\/\\?%*:|"<>]/g, '-').trim();
}

/**
 * Gets all event names from Sheet2
 */
function getEventsFromSheet2() {
  try {
    var spreadsheetId = LOG_SHEET_ID;
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet2 = spreadsheet.getSheetByName('Sheet2');
    
    if (!sheet2) {
      var sheets = spreadsheet.getSheets();
      sheet2 = sheets.length > 1 ? sheets[1] : null;
    }
    
    if (!sheet2 || sheet2.getLastRow() <= 1) {
      return [];
    }
    
    var dataRange = sheet2.getDataRange();
    var data = dataRange.getValues();
    
    var eventNames = [];
    for (var i = 1; i < data.length; i++) {
      var eventName = data[i][0];
      if (eventName && eventName.toString().trim() !== '') {
        var cleanName = eventName.toString().trim();
        if (eventNames.indexOf(cleanName) === -1) {
          eventNames.push(cleanName);
        }
      }
    }
    
    return eventNames.sort();
  } catch (e) {
    console.error('Error getting events from Sheet2:', e);
    try {
      var rootFolderId = DRIVE_ROOT_FOLDER_ID;
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var folders = rootFolder.getFolders();
      var folderNames = [];
      
      while (folders.hasNext()) {
        var folder = folders.next();
        folderNames.push(folder.getName());
      }
      
      return folderNames.sort();
    } catch (driveError) {
      console.error('Error getting folders from Drive:', driveError);
      return [];
    }
  }
}

/**
 * Get folder links from Sheet2 for all events
 */
function getFolderLinksFromSheet2() {
  try {
    var spreadsheetId = LOG_SHEET_ID;
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet2 = spreadsheet.getSheetByName('Sheet2') || spreadsheet.getSheets()[1];
    
    if (!sheet2 || sheet2.getLastRow() <= 1) {
      return { status: 'success', data: [] };
    }
    
    var dataRange = sheet2.getDataRange();
    var data = dataRange.getValues();
    var folderLinks = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var eventName = row[0] || '';
      var className = row[1] || '';
      var folderUrl = row[2] || '';
      
      if (eventName && className && folderUrl) {
        var existingEvent = folderLinks.find(function(event) {
          return event.eventName === eventName;
        });
        
        if (!existingEvent) {
          folderLinks.push({
            eventName: eventName,
            classes: [{ className: className, folderUrl: folderUrl }]
          });
        } else {
          var existingClass = existingEvent.classes.find(function(cls) {
            return cls.className === className;
          });
          
          if (!existingClass) {
            existingEvent.classes.push({ className: className, folderUrl: folderUrl });
          }
        }
      }
    }
    
    folderLinks.sort(function(a, b) {
      return a.eventName.localeCompare(b.eventName);
    });
    
    folderLinks.forEach(function(event) {
      event.classes.sort(function(a, b) {
        return a.className.localeCompare(b.className);
      });
    });
    
    return { status: 'success', data: folderLinks };
  } catch (e) {
    console.error('Error getting folder links:', e);
    return { status: 'error', message: 'Error loading folder links: ' + e.message };
  }
}

/**
 * Get all folder links for a specific event
 */
function getFolderLinksForEvent(eventName) {
  try {
    var spreadsheetId = LOG_SHEET_ID;
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet2 = spreadsheet.getSheetByName('Sheet2') || spreadsheet.getSheets()[1];
    
    if (!sheet2 || sheet2.getLastRow() <= 1) {
      return { status: 'success', data: [] };
    }
    
    var dataRange = sheet2.getDataRange();
    var data = dataRange.getValues();
    var folderLinks = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var currentEventName = row[0] || '';
      var className = row[1] || '';
      var folderUrl = row[2] || '';
      
      if (currentEventName === eventName && className && folderUrl) {
        folderLinks.push({ className: className, folderUrl: folderUrl });
      }
    }
    
    folderLinks.sort(function(a, b) {
      return a.className.localeCompare(b.className);
    });
    
    return { status: 'success', data: folderLinks };
  } catch (e) {
    console.error('Error getting folder links for event:', e);
    return { status: 'error', message: 'Error loading folder links: ' + e.message };
  }
}

function getWithoutWatermarkFolderLinks(eventName) {
  try {
    var rootFolder = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
    var isAll = !eventName || eventName === 'all';

    if (!isAll) {
      var eventFolders = rootFolder.getFoldersByName(eventName);
      if (!eventFolders.hasNext()) return { status: 'success', data: [] };
      var eventFolder = eventFolders.next();
      var classFolders = eventFolder.getFolders();
      var links = [];
      while (classFolders.hasNext()) {
        var clsFolder = classFolders.next();
        var withoutFolders = clsFolder.getFoldersByName('Without Watermark');
        if (withoutFolders.hasNext()) {
          links.push({
            className: clsFolder.getName(),
            folderUrl: withoutFolders.next().getUrl()
          });
        }
      }
      links.sort(function(a, b) { return a.className.localeCompare(b.className); });
      return { status: 'success', data: links };
    }

    var allEventFolders = rootFolder.getFolders();
    var results = [];
    while (allEventFolders.hasNext()) {
      var evFolder = allEventFolders.next();
      if (evFolder.getName() === '_UserProfiles') continue;
      var evClasses = [];
      var clsIter = evFolder.getFolders();
      while (clsIter.hasNext()) {
        var cFolder = clsIter.next();
        var wmOff = cFolder.getFoldersByName('Without Watermark');
        if (wmOff.hasNext()) {
          evClasses.push({
            className: cFolder.getName(),
            folderUrl: wmOff.next().getUrl()
          });
        }
      }
      if (evClasses.length > 0) {
        evClasses.sort(function(a, b) { return a.className.localeCompare(b.className); });
        results.push({ eventName: evFolder.getName(), classes: evClasses });
      }
    }
    results.sort(function(a, b) { return a.eventName.localeCompare(b.eventName); });
    return { status: 'success', data: results };
  } catch (e) {
    return { status: 'error', message: 'Error loading Without Watermark folders: ' + e.message };
  }
}

/**
 * Check if a folder still exists in Drive
 */
function checkIfFolderExists(eventName, className) {
  try {
    var rootFolderId = DRIVE_ROOT_FOLDER_ID;
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    
    var eventFolders = rootFolder.getFoldersByName(eventName);
    if (!eventFolders.hasNext()) {
      return false;
    }
    
    var eventFolder = eventFolders.next();
    var classFolders = eventFolder.getFoldersByName(className);
    return classFolders.hasNext();
  } catch (e) {
    console.error('Error checking folder existence:', e);
    return false;
  }
}

/**
 * Get recent uploads from Sheet2
 */
function getRecentUploads() {
  try {
    var spreadsheetId = LOG_SHEET_ID;
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet2 = spreadsheet.getSheetByName('Sheet2') || spreadsheet.getSheets()[1];
    
    if (!sheet2 || sheet2.getLastRow() <= 1) {
      return { status: 'success', data: [] };
    }
    
    var dataRange = sheet2.getDataRange();
    var data = dataRange.getValues();
    
    var recentData = [];
    var numRowsToShow = 10;
    var startFrom = Math.max(1, data.length - numRowsToShow);
    
    for (var i = data.length - 1; i >= startFrom; i--) {
      var row = data[i];
      var eventName = row[0] || '';
      var className = row[1] || '';
      var folderUrl = row[2] || '';
      
      if (eventName && className && folderUrl) {
        var rowNumber = i + 1;
        var uploadTime = getRelativeTime(rowNumber);
        
        recentData.push({
          eventName: eventName.toString().trim(),
          className: className.toString().trim(),
          folderUrl: folderUrl.toString().trim(),
          uploadTime: uploadTime,
          isNew: (data.length - i) <= 3
        });
      }
      
      if (recentData.length >= 5) break;
    }
    
    return { status: 'success', data: recentData };
  } catch (error) {
    console.error('Error getting recent uploads:', error);
    return { status: 'error', message: error.toString() };
  }
}

/**
 * Helper function to get relative time
 */
function getRelativeTime(rowNumber) {
  if (rowNumber <= 3) return 'Just now';
  if (rowNumber <= 6) return 'Recently';
  return 'A while ago';
}

/**
 * Get all events and their classes for deletion
 */
function getAllEventsForDeletion() {
  try {
    var rootFolderId = DRIVE_ROOT_FOLDER_ID;
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var eventFolders = rootFolder.getFolders();
    
    var events = [];
    
    while (eventFolders.hasNext()) {
      var eventFolder = eventFolders.next();
      var eventName = eventFolder.getName();
      var classFolders = eventFolder.getFolders();
      
      var classes = [];
      while (classFolders.hasNext()) {
        var classFolder = classFolders.next();
        classes.push({
          name: classFolder.getName(),
          id: classFolder.getId(),
          url: classFolder.getUrl(),
          dateCreated: formatDate(classFolder.getDateCreated()),
          fileCount: countFilesInFolder(classFolder)
        });
      }
      
      classes.sort(function(a, b) {
        return a.name.localeCompare(b.name);
      });
      
      events.push({
        name: eventName,
        id: eventFolder.getId(),
        url: eventFolder.getUrl(),
        dateCreated: formatDate(eventFolder.getDateCreated()),
        classCount: classes.length,
        classes: classes
      });
    }
    
    events.sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
    
    return { status: 'success', data: events };
  } catch (e) {
    console.error('Error getting events for deletion:', e);
    return getAllEventsFromSheet2ForDeletion();
  }
}

/**
 * Get all events and classes from Sheet2 as fallback
 */
function getAllEventsFromSheet2ForDeletion() {
  try {
    var spreadsheetId = LOG_SHEET_ID;
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet2 = spreadsheet.getSheetByName('Sheet2') || spreadsheet.getSheets()[1];
    
    if (!sheet2 || sheet2.getLastRow() <= 1) {
      return { status: 'success', data: [] };
    }
    
    var dataRange = sheet2.getDataRange();
    var data = dataRange.getValues();
    
    var eventsMap = {};
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var eventName = row[0] || '';
      var className = row[1] || '';
      var folderUrl = row[2] || '';
      
      if (eventName && className && folderUrl) {
        eventName = eventName.toString().trim();
        className = className.toString().trim();
        
        if (!eventsMap[eventName]) {
          eventsMap[eventName] = {
            name: eventName,
            url: '',
            dateCreated: 'Unknown date',
            classCount: 0,
            classes: []
          };
        }
        
        var classExists = false;
        for (var j = 0; j < eventsMap[eventName].classes.length; j++) {
          if (eventsMap[eventName].classes[j].name === className) {
            classExists = true;
            break;
          }
        }
        
        if (!classExists) {
          eventsMap[eventName].classes.push({
            name: className,
            url: folderUrl,
            dateCreated: 'Unknown date',
            fileCount: 0
          });
          eventsMap[eventName].classCount++;
        }
      }
    }
    
    var events = [];
    for (var eventName in eventsMap) {
      if (eventsMap.hasOwnProperty(eventName)) {
        eventsMap[eventName].classes.sort(function(a, b) {
          return a.name.localeCompare(b.name);
        });
        events.push(eventsMap[eventName]);
      }
    }
    
    events.sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
    
    return { status: 'success', data: events };
  } catch (e) {
    console.error('Error getting events from Sheet2:', e);
    return { status: 'error', message: 'Failed to load events: ' + e.message };
  }
}

/**
 * Format date for display
 */
function formatDate(date) {
  if (!date) return 'Unknown date';
  try {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  } catch (e) {
    return date.toString();
  }
}

/**
 * Count files in a folder
 */
function countFilesInFolder(folder) {
  try {
    var files = folder.getFiles();
    var count = 0;
    while (files.hasNext()) {
      files.next();
      count++;
    }
    return count;
  } catch (e) {
    console.error('Error counting files:', e);
    return 0;
  }
}

/**
 * Count all files in an event
 */
function countAllFilesInEvent(eventFolder) {
  var totalFiles = 0;
  try {
    var files = eventFolder.getFiles();
    while (files.hasNext()) {
      files.next();
      totalFiles++;
    }
    
    var classFolders = eventFolder.getFolders();
    while (classFolders.hasNext()) {
      var classFolder = classFolders.next();
      var classFiles = classFolder.getFiles();
      while (classFiles.hasNext()) {
        classFiles.next();
        totalFiles++;
      }
    }
  } catch (e) {
    console.error('Error counting files in event:', e);
  }
  return totalFiles;
}

/**
 * Remove event from Sheet2
 */
function removeEventFromSheet2(eventName) {
  try {
    var spreadsheetId = LOG_SHEET_ID;
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet2 = spreadsheet.getSheetByName('Sheet2') || spreadsheet.getSheets()[1];
    
    if (!sheet2) return;
    
    var dataRange = sheet2.getDataRange();
    var data = dataRange.getValues();
    
    var rowsToDelete = [];
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === eventName) {
        rowsToDelete.push(i + 1);
      }
    }
    
    rowsToDelete.sort(function(a, b) { return b - a; });
    rowsToDelete.forEach(function(row) {
      sheet2.deleteRow(row);
    });
  } catch (e) {
    console.error('Error removing event from Sheet2:', e);
  }
}

/**
 * Remove class from Sheet2
 */
function removeClassFromSheet2(eventName, className) {
  try {
    var spreadsheetId = LOG_SHEET_ID;
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet2 = spreadsheet.getSheetByName('Sheet2') || spreadsheet.getSheets()[1];
    
    if (!sheet2) return;
    
    var dataRange = sheet2.getDataRange();
    var data = dataRange.getValues();
    
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === eventName && data[i][1] === className) {
        sheet2.deleteRow(i + 1);
        break;
      }
    }
  } catch (e) {
    console.error('Error removing class from Sheet2:', e);
  }
}

/**
 * Remove event from additional spreadsheet
 */
function removeEventFromAdditionalSheet(eventName) {
  try {
    var additionalSpreadsheetId = URL_SHEET_ID;
    var additionalSpreadsheet = SpreadsheetApp.openById(additionalSpreadsheetId);
    var dataSheet = additionalSpreadsheet.getSheetByName('data');
    
    if (!dataSheet) return;
    
    var dataRange = dataSheet.getDataRange();
    var data = dataRange.getValues();
    
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === eventName) {
        dataSheet.deleteRow(i + 1);
      }
    }
  } catch (e) {
    console.error('Error removing event from additional sheet:', e);
  }
}

/**
 * Remove class from additional spreadsheet
 */
function removeClassFromAdditionalSheet(eventName, className) {
  try {
    var additionalSpreadsheetId = URL_SHEET_ID;
    var additionalSpreadsheet = SpreadsheetApp.openById(additionalSpreadsheetId);
    var dataSheet = additionalSpreadsheet.getSheetByName('data');
    
    if (!dataSheet) return;
    
    var dataRange = dataSheet.getDataRange();
    var data = dataRange.getValues();
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === eventName) {
        break;
      }
    }
  } catch (e) {
    console.error('Error removing class from additional sheet:', e);
  }
}

/**
 * Delete event folder and all its contents
 */
function deleteEventFolder(eventName) {
  try {
    var rootFolderId = DRIVE_ROOT_FOLDER_ID;
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var eventFolders = rootFolder.getFoldersByName(eventName);
    
    var totalFiles = 0;
    
    if (eventFolders.hasNext()) {
      var eventFolder = eventFolders.next();
      totalFiles = countAllFilesInEvent(eventFolder);
      eventFolder.setTrashed(true);
    }
    
    removeEventFromSheet2(eventName);
    removeEventFromAdditionalSheet(eventName);
    
    return {
      status: 'success',
      message: 'Event "' + eventName + '" and all its contents ' + 
               (totalFiles > 0 ? '(' + totalFiles + ' files) ' : '') + 
               'have been deleted successfully.',
      eventName: eventName,
      filesDeleted: totalFiles
    };
  } catch (e) {
    console.error('Error deleting event folder:', e);
    return {
      status: 'error',
      message: 'Error deleting event: ' + e.message
    };
  }
}

/**
 * Delete class folder within an event
 */
function deleteClassFolder(eventName, className) {
  try {
    var rootFolderId = DRIVE_ROOT_FOLDER_ID;
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var eventFolders = rootFolder.getFoldersByName(eventName);
    
    var fileCount = 0;
    
    if (eventFolders.hasNext()) {
      var eventFolder = eventFolders.next();
      var classFolders = eventFolder.getFoldersByName(className);
      
      if (classFolders.hasNext()) {
        var classFolder = classFolders.next();
        fileCount = countFilesInFolder(classFolder);
        classFolder.setTrashed(true);
      }
    }
    
    removeClassFromSheet2(eventName, className);
    removeClassFromAdditionalSheet(eventName, className);
    
    return {
      status: 'success',
      message: 'Class folder "' + className + '" and all its contents ' + 
               (fileCount > 0 ? '(' + fileCount + ' files) ' : '') + 
               'have been deleted successfully.',
      eventName: eventName,
      className: className,
      filesDeleted: fileCount
    };
  } catch (e) {
    console.error('Error deleting class folder:', e);
    return {
      status: 'error',
      message: 'Error deleting class folder: ' + e.message
    };
  }
}

/**
 * Get all event names for WhatsApp sharing
 */
function getEventsForWhatsApp() {
  try {
    var spreadsheetId = LOG_SHEET_ID;
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet2 = spreadsheet.getSheetByName('Sheet2') || spreadsheet.getSheets()[1];
    
    var eventNames = [];
    
    if (sheet2 && sheet2.getLastRow() > 1) {
      var dataRange = sheet2.getDataRange();
      var data = dataRange.getValues();
      
      for (var i = 1; i < data.length; i++) {
        var eventName = data[i][0];
        if (eventName && eventName.toString().trim() !== '') {
          var cleanName = eventName.toString().trim();
          if (eventNames.indexOf(cleanName) === -1) {
            eventNames.push(cleanName);
          }
        }
      }
    }
    
    if (eventNames.length === 0) {
      var rootFolderId = DRIVE_ROOT_FOLDER_ID;
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var folders = rootFolder.getFolders();
      
      while (folders.hasNext()) {
        var folder = folders.next();
        eventNames.push(folder.getName());
      }
    }
    
    return {
      status: 'success',
      data: eventNames.sort()
    };
  } catch (e) {
    console.error('Error getting events for WhatsApp:', e);
    return {
      status: 'error',
      message: 'Error loading events: ' + e.message
    };
  }
}

/**
 * Check if event folder exists
 */
function checkIfEventExists(eventName) {
  try {
    var rootFolderId = DRIVE_ROOT_FOLDER_ID;
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var eventFolders = rootFolder.getFoldersByName(eventName);
    return eventFolders.hasNext();
  } catch (e) {
    return false;
  }
}

/**
 * Get classes for a specific event for WhatsApp sharing
 */
function getClassesForWhatsApp(eventName) {
  try {
    var spreadsheetId = LOG_SHEET_ID;
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet2 = spreadsheet.getSheetByName('Sheet2') || spreadsheet.getSheets()[1];
    
    var classes = [];
    
    if (sheet2 && sheet2.getLastRow() > 1) {
      var dataRange = sheet2.getDataRange();
      var data = dataRange.getValues();
      
      for (var i = 1; i < data.length; i++) {
        var currentEventName = data[i][0];
        var className = data[i][1];
        var folderUrl = data[i][2];
        
        if (currentEventName === eventName && className && folderUrl) {
          var cleanClassName = className.toString().trim();
          var cleanFolderUrl = folderUrl.toString().trim();
          
          var classExists = false;
          for (var j = 0; j < classes.length; j++) {
            if (classes[j].className === cleanClassName) {
              classExists = true;
              break;
            }
          }
          
          if (!classExists) {
            classes.push({
              className: cleanClassName,
              folderUrl: cleanFolderUrl
            });
          }
        }
      }
    }
    
    if (classes.length === 0) {
      try {
        var rootFolderId = DRIVE_ROOT_FOLDER_ID;
        var rootFolder = DriveApp.getFolderById(rootFolderId);
        var eventFolders = rootFolder.getFoldersByName(eventName);
        
        if (eventFolders.hasNext()) {
          var eventFolder = eventFolders.next();
          var classFolders = eventFolder.getFolders();
          
          while (classFolders.hasNext()) {
            var classFolder = classFolders.next();
            classes.push({
              className: classFolder.getName(),
              folderUrl: classFolder.getUrl()
            });
          }
        }
      } catch (e) {
        console.error('Error getting classes from Drive:', e);
      }
    }
    
    classes.sort(function(a, b) {
      return a.className.localeCompare(b.className);
    });
    
    return {
      status: 'success',
      data: classes
    };
  } catch (e) {
    console.error('Error getting classes for WhatsApp:', e);
    return {
      status: 'error',
      message: 'Error loading classes: ' + e.message
    };
  }
}

/**
 * Get folder info for WhatsApp sharing
 */
function getFolderInfoForWhatsApp(eventName, className) {
  try {
    var folderUrl = '';
    var fileCount = 0;
    
    var spreadsheetId = LOG_SHEET_ID;
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet2 = spreadsheet.getSheetByName('Sheet2') || spreadsheet.getSheets()[1];
    
    if (sheet2 && sheet2.getLastRow() > 1) {
      var dataRange = sheet2.getDataRange();
      var data = dataRange.getValues();
      
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        var currentEventName = row[0] || '';
        var currentClassName = row[1] || '';
        var currentFolderUrl = row[2] || '';
        
        if (currentEventName === eventName && currentClassName === className) {
          folderUrl = currentFolderUrl.toString().trim();
          break;
        }
      }
    }
    
    if (!folderUrl) {
      try {
        var rootFolderId = DRIVE_ROOT_FOLDER_ID;
        var rootFolder = DriveApp.getFolderById(rootFolderId);
        var eventFolders = rootFolder.getFoldersByName(eventName);
        
        if (eventFolders.hasNext()) {
          var eventFolder = eventFolders.next();
          var classFolders = eventFolder.getFoldersByName(className);
          
          if (classFolders.hasNext()) {
            var classFolder = classFolders.next();
            folderUrl = classFolder.getUrl();
          }
        }
      } catch (e) {
        console.error('Error getting folder from Drive:', e);
      }
    }
    
    if (!folderUrl) {
      return {
        status: 'error',
        message: 'Folder not found'
      };
    }
    
    if (folderUrl.includes('lh3.google.com')) {
      var match = folderUrl.match(/\/d\/([^\/]+)/);
      if (match) {
        folderUrl = 'https://drive.google.com/drive/folders/' + match[1];
      }
    }
    
    try {
      var rootFolderId = DRIVE_ROOT_FOLDER_ID;
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var eventFolders = rootFolder.getFoldersByName(eventName);
      
      if (eventFolders.hasNext()) {
        var eventFolder = eventFolders.next();
        var classFolders = eventFolder.getFoldersByName(className);
        
        if (classFolders.hasNext()) {
          var classFolder = classFolders.next();
          fileCount = countFilesInFolder(classFolder);
        }
      }
    } catch (e) {
      console.error('Error counting files:', e);
    }
    
    var message = generateWhatsAppMessage(eventName, className, folderUrl, fileCount);
    var whatsappLink = 'https://wa.me/?text=' + encodeURIComponent(message);
    
    return {
      status: 'success',
      eventName: eventName,
      className: className,
      folderUrl: folderUrl,
      fileCount: fileCount,
      whatsappLink: whatsappLink,
      formattedMessage: message
    };
  } catch (e) {
    console.error('Error getting folder info for WhatsApp:', e);
    return {
      status: 'error',
      message: 'Error: ' + e.message
    };
  }
}

/**
 * Generate WhatsApp sharing message with folder links
 */
function generateWhatsAppMessage(eventName, className, folderUrl, fileCount) {
  if (fileCount === undefined) fileCount = 0;
  var date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMMM yyyy');
  
  var cleanUrl = folderUrl;
  if (folderUrl.includes('drive.google.com/drive/folders/')) {
  } else if (folderUrl.includes('drive.google.com/')) {
    var match = folderUrl.match(/[-\w]{25,}/);
    if (match) {
      cleanUrl = 'https://drive.google.com/drive/folders/' + match[0];
    }
  }
  
  var message = '*📸 SUCCESS SCHOOL INDI - Media Gallery Update* 📸\n\n' +
    '*Event:* ' + eventName + '\n' +
    '*Class:* ' + className + '\n' +
    '*Date:* ' + date + '\n\n' +
    '📁 *Google Drive Folder:*\n' +
    cleanUrl + '\n\n' +
    (fileCount > 0 ? '📊 *Total Files:* ' + fileCount : '📊 Files are being uploaded...') + '\n\n' +
    '*📱 How to Access:* \n' +
    '1️⃣ Click the link above\n' +
    '2️⃣ Sign in with your Google account\n' +
    '3️⃣ Click "Download" to save all files\n' +
    '4️⃣ Or click individual files to view\n\n' +
    '*💡 Tips:*\n' +
    '• Use Google Drive app for mobile access\n' +
    '• Files are organized by class\n' +
    '• Share with parents/students as needed\n\n' +
    '*🏫 Success School Indi*\n' +
    '*📧 Contact: School Administration*\n' +
    '*📞 Phone: School Office Number*';

  return message;
}

// =====================================================================
// HOMEWORK & WHATSAPP GROUPS BRIDGE (USES USERS_SHEET_ID)
// =====================================================================

var HW_DEFAULT_CLASSES = [
  'Nursery', 'LKG A', 'LKG B', 'UKG',
  '1st Standard', '2nd Standard', '3rd Standard A', '3rd Standard B',
  '4th Standard', '5th Standard', '6th Standard'
];

function formatHwDateValue(val) {
  if (val === null || val === undefined || val === '') return '';
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = val.toString().trim().replace(/^'/, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    return dmy[3] + '-' + ('0' + dmy[2]).slice(-2) + '-' + ('0' + dmy[1]).slice(-2);
  }
  return s;
}

function ensureHomeworkSheetsGAS() {
  var ss = SpreadsheetApp.openById(USERS_SHEET_ID);

  var wgSheet = ss.getSheetByName('WhatsAppGroups');
  if (!wgSheet) {
    wgSheet = ss.insertSheet('WhatsAppGroups');
  }
  if (wgSheet.getLastRow() === 0) {
    var wgRows = [['Group ID', 'Group Name', 'Class', 'PhoneOrGroupLink', 'IsActive']];
    for (var i = 0; i < HW_DEFAULT_CLASSES.length; i++) {
      var cls = HW_DEFAULT_CLASSES[i];
      wgRows.push(['G' + (i + 1), cls + ' Parents', cls, '', 'YES']);
    }
    wgSheet.getRange(1, 1, wgRows.length, 5).setValues(wgRows);
  }

  var hwSheet = ss.getSheetByName('Homework');
  if (!hwSheet) {
    hwSheet = ss.insertSheet('Homework');
  }
  if (hwSheet.getLastRow() === 0) {
    hwSheet.getRange(1, 1, 1, 8).setValues([
      ['HomeworkID', 'Date', 'Class', 'Subject', 'TeacherName', 'TeacherPhone', 'Description', 'UpdatedAt']
    ]);
  }
  hwSheet.getRange('B:B').setNumberFormat('@');
  return { ss: ss, wgSheet: wgSheet, hwSheet: hwSheet };
}

function getHomeworkBundle() {
  try {
    var sheetsObj = ensureHomeworkSheetsGAS();
    var usersSheet = ensureUsersSheetExists();
    var uData = usersSheet.getDataRange().getValues();
    var uStart = uData[0] && uData[0][0] && (uData[0][0].toString().toLowerCase().indexOf('username') !== -1 || uData[0][0].toString().toLowerCase().indexOf('mobile') !== -1) ? 1 : 0;
    var usersList = [];
    for (var i = uStart; i < uData.length; i++) {
      var r = uData[i];
      var uname = r[0] ? r[0].toString().trim() : '';
      if (!uname || uname.indexOf('__BRANDING_') === 0) continue;
      usersList.push({
        username: uname,
        classTeacher: r[2] ? r[2].toString().trim() : '',
        designation: r[3] ? r[3].toString().trim() : '',
        fullName: r[5] ? r[5].toString().trim() : '',
        classes: r[6] ? r[6].toString().trim() : '',
        subjects: r[7] ? r[7].toString().trim() : ''
      });
    }

    var wgData = sheetsObj.wgSheet.getDataRange().getValues();
    var groups = [];
    for (var g = 1; g < wgData.length; g++) {
      var gr = wgData[g];
      if (!gr[2] && !gr[1]) continue;
      groups.push({
        id: gr[0] ? gr[0].toString().trim() : '',
        name: gr[1] ? gr[1].toString().trim() : '',
        className: gr[2] ? gr[2].toString().trim() : '',
        phoneOrLink: gr[3] ? gr[3].toString().trim() : '',
        isActive: (gr[4] ? gr[4].toString().trim() : 'YES').toUpperCase()
      });
    }

    var hwData = sheetsObj.hwSheet.getDataRange().getValues();
    var homework = [];
    for (var h = 1; h < hwData.length; h++) {
      var hr = hwData[h];
      if (!hr[0] && !hr[1] && !hr[2]) continue;
      homework.push({
        id: hr[0] ? hr[0].toString().trim() : ('HW-' + (h + 1)),
        date: formatHwDateValue(hr[1]),
        className: hr[2] ? hr[2].toString().trim() : '',
        subject: hr[3] ? hr[3].toString().trim() : '',
        teacherName: hr[4] ? hr[4].toString().trim() : '',
        teacherPhone: hr[5] ? hr[5].toString().trim() : '',
        description: hr[6] ? hr[6].toString().trim() : '',
        updatedAt: hr[7] ? hr[7].toString().trim() : ''
      });
    }

    return {
      status: 'success',
      source: 'google-sheet',
      usersList: usersList,
      groups: groups,
      homework: homework
    };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

function saveHomeworkInSheet(record) {
  try {
    var sheetsObj = ensureHomeworkSheetsGAS();
    var hwSheet = sheetsObj.hwSheet;
    var data = hwSheet.getDataRange().getValues();
    var targetDate = formatHwDateValue(record.date);
    var targetClass = (record.className || '').toString().trim();
    var targetSubject = (record.subject || '').toString().trim();

    var items = [];
    var existingId = '';
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (!r[0] && !r[1] && !r[2]) continue;
      var d = formatHwDateValue(r[1]);
      var c = r[2] ? r[2].toString().trim() : '';
      var s = r[3] ? r[3].toString().trim() : '';
      if (d === targetDate && c.toLowerCase() === targetClass.toLowerCase() && s.toLowerCase() === targetSubject.toLowerCase()) {
        existingId = r[0] ? r[0].toString().trim() : '';
        continue;
      }
      items.push([
        r[0] ? r[0].toString().trim() : '',
        d,
        c,
        s,
        r[4] ? r[4].toString().trim() : '',
        r[5] ? r[5].toString().trim() : '',
        r[6] ? r[6].toString().trim() : '',
        r[7] ? r[7].toString().trim() : ''
      ]);
    }

    var finalId = existingId || record.id || ('HW-' + new Date().getTime());
    items.push([
      finalId,
      targetDate,
      targetClass,
      targetSubject,
      record.teacherName || '',
      record.teacherPhone || '',
      record.description || '',
      record.updatedAt || ''
    ]);

    // Sort datewise (newest date first, then Class, then Subject)
    items.sort(function(a, b) {
      if (a[1] !== b[1]) return b[1] > a[1] ? 1 : -1;
      var clsCmp = a[2].localeCompare(b[2]);
      if (clsCmp !== 0) return clsCmp;
      return a[3].localeCompare(b[3]);
    });

    var header = ['HomeworkID', 'Date', 'Class', 'Subject', 'TeacherName', 'TeacherPhone', 'Description', 'UpdatedAt'];
    var allRows = [header].concat(items);
    hwSheet.clearContents();
    hwSheet.getRange('B:B').setNumberFormat('@');
    hwSheet.getRange(1, 1, allRows.length, 8).setValues(allRows);

    return { status: 'success', id: finalId, message: 'Homework saved datewise to Google Sheet.' };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

function deleteHomeworkInSheet(homeworkId) {
  try {
    var sheetsObj = ensureHomeworkSheetsGAS();
    var hwSheet = sheetsObj.hwSheet;
    var data = hwSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === homeworkId) {
        hwSheet.deleteRow(i + 1);
        return { status: 'success', message: 'Homework deleted from Google Sheet.' };
      }
    }
    return { status: 'error', message: 'Homework entry not found.' };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}
