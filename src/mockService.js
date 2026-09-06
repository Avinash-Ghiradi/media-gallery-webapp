/**
 * Mock Service for local testing without Google Credentials
 */

const config = require('./config');

const rootFolderUrl = `https://drive.google.com/drive/folders/${config.driveRootFolderId}`;

let mockEvents = {
  'Annual Sports Day 2026': {
    classes: {
      'Grade 5A': [
        { savedName: 'sports_1.jpg', originalName: 'photo1.jpg', url: rootFolderUrl, size: 1048576, date: new Date().toISOString() },
        { savedName: 'sports_2.jpg', originalName: 'photo2.jpg', url: rootFolderUrl, size: 2097152, date: new Date().toISOString() }
      ],
      'Grade 6B': [
        { savedName: 'sports_3.jpg', originalName: 'photo3.jpg', url: rootFolderUrl, size: 1572864, date: new Date().toISOString() }
      ]
    },
    dateCreated: new Date().toISOString()
  },
  'Science Fair 2026': {
    classes: {
      'Grade 8': [
        { savedName: 'science_1.jpg', originalName: 'exp.jpg', url: rootFolderUrl, size: 3145728, date: new Date().toISOString() }
      ]
    },
    dateCreated: new Date().toISOString()
  }
};

let recentUploadsLog = [
  {
    eventName: 'Annual Sports Day 2026',
    className: 'Grade 5A',
    folderUrl: rootFolderUrl,
    uploadTime: 'Just now',
    isNew: true
  },
  {
    eventName: 'Science Fair 2026',
    className: 'Grade 8',
    folderUrl: rootFolderUrl,
    uploadTime: 'Recently',
    isNew: false
  }
];

function getUsersFromSheet() {
  return {
    'admin': 'password123',
    'Avinash': 'Avinash123',
    'Jyoti S': 'Mahi@0412'
  };
}

function getAllFolders() {
  return Object.keys(mockEvents).sort();
}

function getSubfoldersForEvent(eventName) {
  if (mockEvents[eventName]) {
    return Object.keys(mockEvents[eventName].classes).sort();
  }
  return [];
}

function uploadFilesToDrive(filesData, eventName, className, addWatermark = true) {
  if (!filesData || !filesData.length) throw new Error('No files provided');
  if (!eventName) throw new Error('Event name is required');
  if (!className) throw new Error('Class name is required');

  if (!mockEvents[eventName]) {
    mockEvents[eventName] = { classes: {}, dateCreated: new Date().toISOString() };
  }
  if (!mockEvents[eventName].classes[className]) {
    mockEvents[eventName].classes[className] = [];
  }

  const folderUrl = rootFolderUrl;
  const fileUrls = [];

  filesData.forEach((fileData, index) => {
    const filename = fileData.filename || `file_${index + 1}.jpg`;
    const fileUrl = rootFolderUrl;

    const record = {
      savedName: filename,
      originalName: fileData.filename,
      url: fileUrl,
      size: fileData.size || 1024 * 500,
      date: new Date().toISOString()
    };

    mockEvents[eventName].classes[className].push(record);

    fileUrls.push({
      originalName: fileData.filename,
      savedName: filename,
      url: fileUrl
    });
  });

  recentUploadsLog.unshift({
    eventName: eventName.trim(),
    className: className.trim(),
    folderUrl: folderUrl,
    uploadTime: 'Just now',
    isNew: true
  });

  if (recentUploadsLog.length > 10) {
    recentUploadsLog = recentUploadsLog.slice(0, 10);
  }

  return {
    status: 'success',
    message: `${filesData.length} file(s) processed ${addWatermark ? 'WITH watermark' : 'WITHOUT watermark'} (Mock Mode)`,
    urls: fileUrls,
    folderUrl: folderUrl,
    watermarkApplied: addWatermark
  };
}

function getEventsFromSheet2() {
  return getAllFolders();
}

function getFolderLinksFromSheet2() {
  const result = [];
  for (const eventName in mockEvents) {
    const eventClasses = [];
    for (const className in mockEvents[eventName].classes) {
      eventClasses.push({
        className: className,
        folderUrl: rootFolderUrl
      });
    }
    if (eventClasses.length > 0) {
      result.push({
        eventName: eventName,
        classes: eventClasses
      });
    }
  }

  result.sort((a, b) => a.eventName.localeCompare(b.eventName));
  return {
    status: 'success',
    data: result
  };
}

function getFolderLinksForEvent(eventName) {
  if (!mockEvents[eventName]) {
    return { status: 'success', data: [] };
  }

  const folderLinks = [];
  for (const className in mockEvents[eventName].classes) {
    folderLinks.push({
      className: className,
      folderUrl: rootFolderUrl
    });
  }

  folderLinks.sort((a, b) => a.className.localeCompare(b.className));
  return { status: 'success', data: folderLinks };
}

function getRecentUploads() {
  return {
    status: 'success',
    data: recentUploadsLog
  };
}

function getAllEventsForDeletion() {
  const events = [];
  for (const eventName in mockEvents) {
    const eventObj = mockEvents[eventName];
    const classes = [];
    for (const className in eventObj.classes) {
      const fileList = eventObj.classes[className];
      classes.push({
        name: className,
        id: `mock_class_id_${className}`,
        url: rootFolderUrl,
        dateCreated: eventObj.dateCreated,
        fileCount: fileList.length
      });
    }
    classes.sort((a, b) => a.name.localeCompare(b.name));

    events.push({
      name: eventName,
      id: `mock_event_id_${eventName}`,
      url: rootFolderUrl,
      dateCreated: eventObj.dateCreated,
      classCount: classes.length,
      classes: classes
    });
  }

  events.sort((a, b) => a.name.localeCompare(b.name));
  return { status: 'success', data: events };
}

function deleteEventFolder(eventName) {
  if (!mockEvents[eventName]) {
    return { status: 'error', message: 'Event not found' };
  }

  let totalFiles = 0;
  for (const className in mockEvents[eventName].classes) {
    totalFiles += mockEvents[eventName].classes[className].length;
  }

  delete mockEvents[eventName];
  recentUploadsLog = recentUploadsLog.filter(item => item.eventName !== eventName);

  return {
    status: 'success',
    message: `Event "${eventName}" and all its contents (${totalFiles} files) have been deleted successfully.`,
    eventName: eventName,
    filesDeleted: totalFiles
  };
}

function deleteClassFolder(eventName, className) {
  if (!mockEvents[eventName] || !mockEvents[eventName].classes[className]) {
    return { status: 'error', message: 'Class folder not found' };
  }

  const fileCount = mockEvents[eventName].classes[className].length;
  delete mockEvents[eventName].classes[className];
  recentUploadsLog = recentUploadsLog.filter(item => !(item.eventName === eventName && item.className === className));

  return {
    status: 'success',
    message: `Class folder "${className}" and all its contents (${fileCount} files) have been deleted successfully.`,
    eventName: eventName,
    className: className,
    filesDeleted: fileCount
  };
}

function getEventsForWhatsApp() {
  return {
    status: 'success',
    data: getAllFolders()
  };
}

function getClassesForWhatsApp(eventName) {
  return getFolderLinksForEvent(eventName);
}

function getFolderInfoForWhatsApp(eventName, className) {
  if (!mockEvents[eventName] || !mockEvents[eventName].classes[className]) {
    return { status: 'error', message: 'Folder not found' };
  }

  const fileCount = mockEvents[eventName].classes[className].length;
  const folderUrl = rootFolderUrl;
  const message = generateWhatsAppMessage(eventName, className, folderUrl, fileCount);
  const whatsappLink = 'https://wa.me/?text=' + encodeURIComponent(message);

  return {
    status: 'success',
    eventName: eventName,
    className: className,
    folderUrl: folderUrl,
    fileCount: fileCount,
    whatsappLink: whatsappLink,
    formattedMessage: message
  };
}

function generateWhatsAppMessage(eventName, className, folderUrl, fileCount = 0) {
  const date = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return `*📸 SUCCESS SCHOOL INDI - Media Gallery Update* 📸

*Event:* ${eventName}
*Class:* ${className}
*Date:* ${date}

📁 *Google Drive Folder:*
${folderUrl}

${fileCount > 0 ? `📊 *Total Files:* ${fileCount}` : '📊 Files are being uploaded...'}

*📱 How to Access:* 
1️⃣ Click the link above
2️⃣ Sign in with your Google account
3️⃣ Click "Download" to save all files
4️⃣ Or click individual files to view

*💡 Tips:*
• Use Google Drive app for mobile access
• Files are organized by class
• Share with parents/students as needed

*🏫 Success School Indi*
*📧 Contact: School Administration*
*📞 Phone: School Office Number*`;
}

module.exports = {
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
  getFolderInfoForWhatsApp,
  generateWhatsAppMessage
};
