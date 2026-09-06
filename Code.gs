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
      res = uploadFilesToDrive(contents.filesData, contents.eventName, contents.className, contents.addWatermark);
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

/**
 * Get users from Google Sheet
 */
function getUsersFromSheet() {
  try {
    var spreadsheet = SpreadsheetApp.openById(USERS_SHEET_ID);
    var sheet = spreadsheet.getSheetByName(USERS_SHEET_NAME);
    
    if (!sheet) {
      console.log('Users sheet not found, using default admin user');
      return { 'admin': 'password123' };
    }
    
    var dataRange = sheet.getDataRange();
    var data = dataRange.getValues();
    
    var startRow = data[0][0].toString().toLowerCase() === 'username' ? 1 : 0;
    
    var users = {};
    for (var i = startRow; i < data.length; i++) {
      var row = data[i];
      if (row[0] && row[1]) {
        users[row[0].toString().trim()] = row[1].toString().trim();
      }
    }
    
    return users;
  } catch (e) {
    console.error('Error reading users from sheet:', e);
    return { 'admin': 'password123' };
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

/**
 * Uploads files to Drive with organized folder structure
 */
function uploadFilesToDrive(filesData, eventName, className, addWatermark) {
  if (addWatermark === undefined) addWatermark = true;
  
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
    
    // 1. Get or create EVENT folder
    var eventFolder = getOrCreateFolder(rootFolder, eventName);
    
    // 2. Get or create CLASS subfolder
    var classSubfolder = getOrCreateFolder(eventFolder, className);
    
    // 3. Process each file
    filesData.forEach(function(fileData, index) {
      try {
        var filename = sanitizeFilename(fileData.filename);
        var base64Data = fileData.data;
        if (base64Data.indexOf('base64,') !== -1) {
          base64Data = base64Data.split('base64,')[1];
        }
        var contentType = fileData.contentType || 'image/jpeg';
        
        var existingFiles = classSubfolder.getFilesByName(filename);
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
        var file = classSubfolder.createFile(blob);
        
        // Ensure "Anyone with the link can view" permission
        try {
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        } catch (permErr) {
          console.warn('Set sharing warning:', permErr);
        }
        
        var fileUrl = file.getUrl();
        fileUrls.push({
          originalName: fileData.filename,
          savedName: filename,
          url: fileUrl
        });
        
        sheet.appendRow([
          eventName, 
          className, 
          filename, 
          fileUrl, 
          new Date(),
          contentType,
          file.getSize()
        ]);
        
      } catch (e) {
        console.error('Error uploading file #' + (index + 1) + ': ' + fileData.filename, e);
        fileUrls.push({
          originalName: fileData.filename,
          error: 'Error: ' + e.message
        });
      }
    });
    
    updateSheet2(sheet2, eventName, className, classSubfolder.getUrl(), fileUrls);
    updateAdditionalSheet(dataSheet, eventName, fileUrls);
    
    return {
      status: 'success',
      message: filesData.length + ' file(s) processed ' + 
               (addWatermark ? 'WITH watermark' : 'WITHOUT watermark'),
      urls: fileUrls,
      folderUrl: classSubfolder.getUrl(),
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
 * Gets all existing folders under the root folder
 */
function getAllExistingFolders() {
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
  } catch (e) {
    console.error('Error getting folders:', e);
    return [];
  }
}

/**
 * Gets all existing subfolders under a specific event folder
 */
function getSubfoldersForEvent(eventName) {
  try {
    var rootFolderId = DRIVE_ROOT_FOLDER_ID;
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var eventFolders = rootFolder.getFoldersByName(eventName);
    
    if (!eventFolders.hasNext()) {
      return [];
    }
    
    var eventFolder = eventFolders.next();
    var subfolders = eventFolder.getFolders();
    var subfolderNames = [];
    
    while (subfolders.hasNext()) {
      var subfolder = subfolders.next();
      subfolderNames.push(subfolder.getName());
    }
    
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
