const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const SCHOOL_NAME = 'Success School Indi';
const FALLBACK_FILE = path.join(__dirname, '..', 'homework_data.json');

let sheetsClient = null;
let ensureSheetsPromise = null;
let sheetsEnsured = false;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  try {
    const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
    let auth = null;
    if (config.serviceAccountEmail && config.privateKey) {
      auth = new google.auth.JWT(
        config.serviceAccountEmail,
        null,
        config.privateKey,
        scopes
      );
    } else if (fs.existsSync(config.googleCredentialsPath)) {
      let keyFilePath = config.googleCredentialsPath;
      if (fs.statSync(keyFilePath).isDirectory()) {
        const files = fs.readdirSync(keyFilePath).filter(f => f.endsWith('.json'));
        if (files.length > 0) keyFilePath = path.join(keyFilePath, files[0]);
      }
      if (fs.statSync(keyFilePath).isFile()) {
        auth = new google.auth.GoogleAuth({ keyFile: keyFilePath, scopes });
      }
    }
    if (!auth) return null;
    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (err) {
    console.warn('Homework Sheets client init failed:', err.message);
    return null;
  }
}

function normalizePhone(val) {
  const digits = String(val || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeName(val) {
  return String(val || '')
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|dr|prof)\.?\s*/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function splitCsv(val) {
  return String(val || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateFriendly(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${m[3]} ${months[parseInt(m[2], 10) - 1] || m[2]} ${m[1]}`;
}

function readFallbackData() {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      return JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8'));
    }
  } catch (e) {}
  return {
    teachers: [
      { id: 'T1', name: 'Mr. Akash Jalageri', phone: '919380260297', classes: '4th Standard, 5th Standard, 6th Standard', subjects: 'Mathematics, Reasoning, Coaching - Maths', isClassTeacher: 'YES' },
      { id: 'T2', name: 'Ms. Disha S Rathod', phone: '916361999247', classes: '1st Standard, 2nd Standard', subjects: 'English, Hindi', isClassTeacher: 'YES' },
      { id: 'T3', name: 'Mrs. Jyoti Jadava', phone: '917259731118', classes: 'Nursery, LKG A, LKG B, UKG', subjects: 'Kannada', isClassTeacher: 'YES' },
      { id: 'T4', name: 'Mrs. Jyoti Sanath', phone: '919901583738', classes: '1st Standard, 2nd Standard', subjects: 'Mathematics', isClassTeacher: 'YES' },
      { id: 'T5', name: 'Mrs. Minal Patil', phone: '918668878802', classes: 'Nursery, LKG A, LKG B, UKG', subjects: 'Mathematics', isClassTeacher: 'YES' },
      { id: 'T6', name: 'Ms. Nagma M Kazi', phone: '919449540726', classes: '3rd Standard A, 3rd Standard B, 4th Standard, 5th Standard, 6th Standard', subjects: 'Science', isClassTeacher: 'YES' },
      { id: 'T7', name: 'Mrs. Rekha Kolekar', phone: '918830471427', classes: '3rd Standard A, 3rd Standard B, 4th Standard, 5th Standard, 6th Standard', subjects: 'English', isClassTeacher: 'YES' },
      { id: 'T8', name: 'Ms. Chandrikha Pattar', phone: '919901583739', classes: '1st Standard, 2nd Standard', subjects: 'Kannada, EVS', isClassTeacher: 'YES' },
      { id: 'T10', name: 'Ms. Sneha G', phone: '918431889115', classes: 'Nursery, LKG A, LKG B, UKG, 6th Standard', subjects: 'EVS, Computer', isClassTeacher: 'YES' },
      { id: 'T11', name: 'Ms. Sonali S Paradeshi', phone: '918073323445', classes: '3rd Standard A, 3rd Standard B, 4th Standard, 5th Standard, 6th Standard', subjects: 'Hindi', isClassTeacher: 'YES' },
      { id: 'T12', name: 'Mrs. Sridevi Devar', phone: '919566267696', classes: 'Nursery, LKG A, LKG B, UKG', subjects: 'English', isClassTeacher: 'YES' },
      { id: 'T13', name: 'Mrs. Trupti R Chabukswar', phone: '919980352950', classes: '3rd Standard A, 3rd Standard B, 6th Standard', subjects: 'Mathematics, Science, GK', isClassTeacher: 'YES' },
      { id: 'T14', name: 'Mrs. Ujwala S Barikai', phone: '917204017903', classes: '3rd Standard A, 3rd Standard B, 4th Standard, 5th Standard, 6th Standard', subjects: 'Kannada', isClassTeacher: 'YES' },
      { id: 'T15', name: 'Ms. Vaishali P Badiger', phone: '919823996329', classes: '3rd Standard A, 3rd Standard B, 4th Standard, 5th Standard, 6th Standard', subjects: 'Social', isClassTeacher: 'YES' }
    ],
    classes: [
      { id: 'NUR', name: 'Nursery', classTeacher: 'Mrs. Jyoti Jadava' },
      { id: 'LKGA', name: 'LKG A', classTeacher: 'Mrs. Minal Patil' },
      { id: 'LKGB', name: 'LKG B', classTeacher: 'Ms. Sneha G' },
      { id: 'UKG', name: 'UKG', classTeacher: 'Mrs. Sridevi Devar' },
      { id: '1', name: '1st Standard', classTeacher: 'Ms. Disha S Rathod' },
      { id: '2', name: '2nd Standard', classTeacher: 'Mrs. Jyoti Sanath' },
      { id: '3A', name: '3rd Standard A', classTeacher: 'Ms. Vaishali P Badiger' },
      { id: '3B', name: '3rd Standard B', classTeacher: 'Mrs. Ujwala S Barikai' },
      { id: '4', name: '4th Standard', classTeacher: 'Ms. Nagma M Kazi' },
      { id: '5', name: '5th Standard', classTeacher: 'Ms. Vaishali P Badiger' },
      { id: '6', name: '6th Standard', classTeacher: 'Mr. Akash Jalageri' }
    ],
    subjects: ['English', 'Kannada', 'Hindi', 'Mathematics', 'Science', 'Social', 'EVS', 'Computer', 'GK', 'Reasoning', 'Coaching - Maths'],
    groups: [],
    homework: []
  };
}

function writeFallbackData(data) {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2));
  } catch (e) {}
}

function mapRowsByHeaders(rows) {
  if (!rows || rows.length < 2) return { headers: rows && rows[0] ? rows[0] : [], items: [] };
  const headers = rows[0].map(h => String(h || '').trim());
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !String(c || '').trim())) continue;
    const obj = { _rowIndex: i + 1 };
    headers.forEach((h, idx) => {
      const key = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      obj[key] = row[idx] !== undefined ? String(row[idx]).trim() : '';
    });
    items.push(obj);
  }
  return { headers, items };
}

async function ensureHomeworkSheets() {
  if (sheetsEnsured) return true;
  if (ensureSheetsPromise) return ensureSheetsPromise;

  ensureSheetsPromise = (async () => {
    const sheets = getSheetsClient();
    if (!sheets || !config.homeworkSheetId) return false;
    try {
      const ss = await sheets.spreadsheets.get({ spreadsheetId: config.homeworkSheetId });
      const existingTitles = new Set((ss.data.sheets || []).map(s => s.properties.title));
      const requiredTabs = ['Teachers', 'Classes', 'Subjects', 'WhatsAppGroups', 'Homework'];
      const missingTabs = requiredTabs.filter(t => !existingTitles.has(t));

      if (missingTabs.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.homeworkSheetId,
          requestBody: {
            requests: missingTabs.map(title => ({ addSheet: { properties: { title } } }))
          }
        });
        console.log('Created homework tabs in Media Gallery Google Sheet:', missingTabs.join(', '));
      }

      const fallback = readFallbackData();
      const seedSpecs = [
        {
          tab: 'Teachers',
          headers: ['Teacher ID', 'Name', 'Phone', 'Classes', 'Subjects', 'IsClassTeacher'],
          rows: fallback.teachers.map(t => [t.id, t.name, t.phone, t.classes, t.subjects, t.isClassTeacher])
        },
        {
          tab: 'Classes',
          headers: ['Class ID', 'Class Name', 'ClassTeacher'],
          rows: fallback.classes.map(c => [c.id, c.name, c.classTeacher])
        },
        {
          tab: 'Subjects',
          headers: ['Subject ID', 'Subject Name'],
          rows: fallback.subjects.map((s, idx) => [`SUB${idx + 1}`, s])
        },
        {
          tab: 'WhatsAppGroups',
          headers: ['Group ID', 'Group Name', 'Class', 'PhoneOrGroupLink', 'IsActive'],
          rows: fallback.classes.map((c, idx) => [`G${idx + 1}`, `${c.name} Parents`, c.name, '', 'YES'])
        },
        {
          tab: 'Homework',
          headers: ['HomeworkID', 'Date', 'Class', 'Subject', 'TeacherName', 'TeacherPhone', 'Description', 'UpdatedAt'],
          rows: []
        }
      ];

      for (const spec of seedSpecs) {
        const existing = await sheets.spreadsheets.values.get({
          spreadsheetId: config.homeworkSheetId,
          range: `${spec.tab}!A1:Z2`
        });
        const values = existing.data.values || [];
        if (values.length === 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: config.homeworkSheetId,
            range: `${spec.tab}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [spec.headers, ...spec.rows] }
          });
        }
      }

      sheetsEnsured = true;
      return true;
    } catch (err) {
      console.warn('ensureHomeworkSheets failed:', err.message);
      return false;
    } finally {
      ensureSheetsPromise = null;
    }
  })();

  return ensureSheetsPromise;
}

async function readSheetTab(tabName) {
  const sheets = getSheetsClient();
  if (!sheets || !config.homeworkSheetId) return null;
  if (!sheetsEnsured) {
    await ensureHomeworkSheets();
  }
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.homeworkSheetId,
      range: `${tabName}!A:Z`
    });
    return mapRowsByHeaders(res.data.values || []);
  } catch (err) {
    console.warn(`Could not read sheet tab "${tabName}":`, err.message);
    return null;
  }
}

async function loadMetadata() {
  const [teachersTab, classesTab, subjectsTab, groupsTab] = await Promise.all([
    readSheetTab('Teachers'),
    readSheetTab('Classes'),
    readSheetTab('Subjects'),
    readSheetTab('WhatsAppGroups')
  ]);

  const fallback = readFallbackData();

  const teachers = teachersTab && teachersTab.items.length > 0
    ? teachersTab.items.map(r => ({
        id: r.teacherid || r.id || '',
        name: r.name || r.teachername || '',
        phone: r.phone || r.mobile || '',
        classes: r.classes || r.assignedclasses || '',
        subjects: r.subjects || r.assignedsubjects || '',
        isClassTeacher: (r.isclassteacher || '').toUpperCase()
      }))
    : fallback.teachers;

  const classes = classesTab && classesTab.items.length > 0
    ? classesTab.items.map(r => ({
        id: r.classid || r.id || '',
        name: r.classname || r.name || r.class || '',
        classTeacher: r.classteacher || r.teacher || ''
      })).filter(c => c.name)
    : fallback.classes;

  const subjects = subjectsTab && subjectsTab.items.length > 0
    ? subjectsTab.items.map(r => r.subjectname || r.name || r.subject || '').filter(Boolean)
    : fallback.subjects;

  const groups = groupsTab && groupsTab.items.length > 0
    ? groupsTab.items.map(r => ({
        id: r.groupid || r.id || '',
        name: r.groupname || r.name || '',
        className: r.class || r.classname || '',
        phoneOrLink: r.phone || r.grouplink || r.link || r.whatsapp || '',
        isActive: (r.isactive || 'YES').toUpperCase()
      }))
    : fallback.groups;

  return {
    teachers,
    classes,
    subjects,
    groups,
    source: teachersTab ? 'google-sheet' : 'fallback'
  };
}

function isAdminUser(sessionUser) {
  if (!sessionUser) return false;
  const uname = String(sessionUser.username || '').trim().toLowerCase();
  const aClass = String(sessionUser.assignedClass || '').trim().toUpperCase();
  return uname === 'admin' || aClass === 'ALL';
}

async function resolveTeacherProfile(sessionUser) {
  const meta = await loadMetadata();
  const admin = isAdminUser(sessionUser);

  const userPhone = normalizePhone(sessionUser && sessionUser.username);
  const userNameNorm = normalizeName(sessionUser && (sessionUser.fullName || sessionUser.username));
  const userAssignedClass = String((sessionUser && sessionUser.assignedClass) || '').trim();

  let matchedTeacher = null;
  if (!admin && sessionUser) {
    matchedTeacher = meta.teachers.find(t => {
      const tPhone = normalizePhone(t.phone);
      const tName = normalizeName(t.name);
      if (userPhone && tPhone && userPhone === tPhone) return true;
      if (userNameNorm && tName && (userNameNorm === tName || tName.includes(userNameNorm) || userNameNorm.includes(tName))) return true;
      return false;
    }) || null;
  }

  const allClassNames = meta.classes.map(c => c.name);
  let assignedClasses = [];
  let assignedSubjects = [];

  if (admin) {
    assignedClasses = allClassNames;
    assignedSubjects = meta.subjects;
  } else if (matchedTeacher) {
    assignedClasses = splitCsv(matchedTeacher.classes);
    assignedSubjects = splitCsv(matchedTeacher.subjects);
  } else if (userAssignedClass && userAssignedClass.toUpperCase() !== 'ALL') {
    assignedClasses = [userAssignedClass];
    assignedSubjects = meta.subjects;
  }

  // Determine which class(es) this user is the Class Teacher of
  let classTeacherOf = [];
  if (admin) {
    classTeacherOf = allClassNames;
  } else {
    const teacherNameNorm = matchedTeacher ? normalizeName(matchedTeacher.name) : userNameNorm;
    classTeacherOf = meta.classes
      .filter(c => {
        const ctNorm = normalizeName(c.classTeacher);
        return ctNorm && teacherNameNorm && (ctNorm === teacherNameNorm || ctNorm.includes(teacherNameNorm) || teacherNameNorm.includes(ctNorm));
      })
      .map(c => c.name);

    // Fallback: if Classes sheet didn't match by name, but teacher is marked IsClassTeacher=YES and has an assignedClass
    if (classTeacherOf.length === 0 && matchedTeacher && matchedTeacher.isClassTeacher === 'YES' && userAssignedClass) {
      classTeacherOf = [userAssignedClass];
    }
  }

  return {
    status: 'success',
    source: meta.source,
    isAdmin: admin,
    teacherName: matchedTeacher ? matchedTeacher.name : (sessionUser.fullName || sessionUser.username || 'Teacher'),
    teacherId: matchedTeacher ? matchedTeacher.id : '',
    teacherPhone: matchedTeacher ? matchedTeacher.phone : (sessionUser.username || ''),
    assignedClasses,
    assignedSubjects,
    isClassTeacher: classTeacherOf.length > 0 || admin,
    classTeacherOf,
    allClasses: allClassNames,
    allSubjects: meta.subjects,
    groups: meta.groups
  };
}

async function ensureHomeworkHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.homeworkSheetId,
    range: 'Homework!A1:Z1'
  });
  const firstRow = (res.data.values && res.data.values[0]) || [];
  if (firstRow.length > 0) return firstRow.map(h => String(h || '').trim());

  const defaultHeaders = ['HomeworkID', 'Date', 'Class', 'Subject', 'TeacherName', 'TeacherPhone', 'Description', 'UpdatedAt'];
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.homeworkSheetId,
    range: 'Homework!A1:H1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [defaultHeaders] }
  });
  return defaultHeaders;
}

function normalizeHwRow(r) {
  return {
    id: r.homeworkid || r.id || `HW-${r._rowIndex || ''}`,
    date: r.date || r.homeworkdate || '',
    className: r.class || r.classname || '',
    subject: r.subject || r.subjectname || '',
    teacherName: r.teachername || r.teacher || r.createdby || '',
    teacherPhone: r.teacherphone || r.phone || '',
    description: r.description || r.homework || r.details || r.content || r.task || '',
    updatedAt: r.updatedat || r.createdat || r.timestamp || '',
    _rowIndex: r._rowIndex
  };
}

async function readAllHomework() {
  const tab = await readSheetTab('Homework');
  if (tab) {
    return {
      source: 'google-sheet',
      headers: tab.headers,
      items: tab.items.map(normalizeHwRow).filter(x => x.date || x.className || x.subject)
    };
  }
  const fallback = readFallbackData();
  return { source: 'fallback', headers: [], items: fallback.homework || [] };
}

async function listHomework(sessionUser, date, className) {
  const targetDate = date || todayIso();
  const profile = await resolveTeacherProfile(sessionUser);
  const { items, source } = await readAllHomework();

  const filtered = items.filter(item => {
    if (item.date !== targetDate) return false;
    if (className && item.className.toLowerCase() !== className.toLowerCase()) return false;
    if (!profile.isAdmin) {
      const inAssignedClass = profile.assignedClasses.some(c => c.toLowerCase() === item.className.toLowerCase());
      const isClassTeacherClass = profile.classTeacherOf.some(c => c.toLowerCase() === item.className.toLowerCase());
      if (!inAssignedClass && !isClassTeacherClass) return false;
    }
    return true;
  });

  return { status: 'success', source, date: targetDate, items: filtered };
}

function buildRowFromHeaders(headers, record) {
  return headers.map(h => {
    const key = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key === 'homeworkid' || key === 'id') return record.id;
    if (key === 'date' || key === 'homeworkdate') return `'${record.date}`;
    if (key === 'class' || key === 'classname') return record.className;
    if (key === 'subject' || key === 'subjectname') return record.subject;
    if (key === 'teachername' || key === 'teacher' || key === 'createdby') return record.teacherName;
    if (key === 'teacherphone' || key === 'phone') return record.teacherPhone;
    if (key === 'description' || key === 'homework' || key === 'details' || key === 'content' || key === 'task') return record.description;
    if (key === 'updatedat' || key === 'createdat' || key === 'timestamp') return record.updatedAt;
    if (key === 'status') return 'ACTIVE';
    return '';
  });
}

async function saveHomework(sessionUser, payload) {
  const profile = await resolveTeacherProfile(sessionUser);
  const date = (payload.date || todayIso()).trim();
  const className = (payload.className || '').trim();
  const subject = (payload.subject || '').trim();
  const description = (payload.description || '').trim();

  if (!className || !subject || !description) {
    return { status: 'error', message: 'Class, Subject, and Homework description are required.' };
  }

  if (!profile.isAdmin) {
    const hasClass = profile.assignedClasses.some(c => c.toLowerCase() === className.toLowerCase());
    const hasSubject = profile.assignedSubjects.some(s => s.toLowerCase() === subject.toLowerCase());
    if (!hasClass || !hasSubject) {
      return { status: 'error', message: 'You can only add homework for your assigned classes and subjects.' };
    }
  }

  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const record = {
    id: payload.id || `HW-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    date,
    className,
    subject,
    teacherName: profile.teacherName,
    teacherPhone: profile.teacherPhone,
    description,
    updatedAt: nowStr
  };

  const sheets = getSheetsClient();
  if (sheets && config.homeworkSheetId) {
    try {
      const headers = await ensureHomeworkHeaders(sheets);
      const { items } = await readAllHomework();
      const existing = items.find(
        x => x.date === date &&
          x.className.toLowerCase() === className.toLowerCase() &&
          x.subject.toLowerCase() === subject.toLowerCase()
      );

      if (existing && existing._rowIndex) {
        record.id = existing.id;
        const rowValues = buildRowFromHeaders(headers, record);
        await sheets.spreadsheets.values.update({
          spreadsheetId: config.homeworkSheetId,
          range: `Homework!A${existing._rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowValues] }
        });
      } else {
        const rowValues = buildRowFromHeaders(headers, record);
        await sheets.spreadsheets.values.append({
          spreadsheetId: config.homeworkSheetId,
          range: 'Homework!A:Z',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [rowValues] }
        });
      }
      return { status: 'success', source: 'google-sheet', item: record, message: 'Homework saved to Google Sheet.' };
    } catch (err) {
      console.warn('Google Sheet homework save failed, using fallback:', err.message);
    }
  }

  const fallback = readFallbackData();
  const idx = (fallback.homework || []).findIndex(
    x => x.date === date &&
      x.className.toLowerCase() === className.toLowerCase() &&
      x.subject.toLowerCase() === subject.toLowerCase()
  );
  if (idx >= 0) {
    record.id = fallback.homework[idx].id;
    fallback.homework[idx] = record;
  } else {
    fallback.homework = fallback.homework || [];
    fallback.homework.push(record);
  }
  writeFallbackData(fallback);
  return { status: 'success', source: 'fallback', item: record, message: 'Homework saved.' };
}

async function deleteHomework(sessionUser, homeworkId) {
  const profile = await resolveTeacherProfile(sessionUser);
  const { items } = await readAllHomework();
  const target = items.find(x => x.id === homeworkId);
  if (!target) return { status: 'error', message: 'Homework entry not found.' };

  if (!profile.isAdmin) {
    const isOwner = normalizeName(target.teacherName) === normalizeName(profile.teacherName);
    const isCt = profile.classTeacherOf.some(c => c.toLowerCase() === target.className.toLowerCase());
    if (!isOwner && !isCt) {
      return { status: 'error', message: 'You can only delete your own homework or your class homework.' };
    }
  }

  const sheets = getSheetsClient();
  if (sheets && config.homeworkSheetId && target._rowIndex) {
    try {
      const ss = await sheets.spreadsheets.get({ spreadsheetId: config.homeworkSheetId });
      const hwSheet = (ss.data.sheets || []).find(s => s.properties.title === 'Homework');
      if (hwSheet) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.homeworkSheetId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: hwSheet.properties.sheetId,
                  dimension: 'ROWS',
                  startIndex: target._rowIndex - 1,
                  endIndex: target._rowIndex
                }
              }
            }]
          }
        });
        return { status: 'success', message: 'Homework deleted from Google Sheet.' };
      }
    } catch (err) {
      console.warn('Google Sheet homework delete failed:', err.message);
    }
  }

  const fallback = readFallbackData();
  fallback.homework = (fallback.homework || []).filter(x => x.id !== homeworkId);
  writeFallbackData(fallback);
  return { status: 'success', message: 'Homework deleted.' };
}

async function getConsolidatedHomework(sessionUser, date, className) {
  const targetDate = date || todayIso();
  const profile = await resolveTeacherProfile(sessionUser);

  if (!profile.isAdmin && !profile.isClassTeacher) {
    return { status: 'error', message: 'Only Class Teachers or Admins can send consolidated class homework.' };
  }

  const selectedClass = className || profile.classTeacherOf[0] || '';
  if (!selectedClass) {
    return { status: 'error', message: 'No class selected or assigned as Class Teacher.' };
  }

  if (!profile.isAdmin && !profile.classTeacherOf.some(c => c.toLowerCase() === selectedClass.toLowerCase())) {
    return { status: 'error', message: `You are not the Class Teacher for ${selectedClass}.` };
  }

  const { items, source } = await readAllHomework();
  const classItems = items.filter(
    x => x.date === targetDate && x.className.toLowerCase() === selectedClass.toLowerCase()
  );

  // Build consolidated WhatsApp message
  const friendlyDate = formatDateFriendly(targetDate);
  const lines = [
    `📚 *${SCHOOL_NAME}*`,
    `*Daily Homework — ${selectedClass}*`,
    `📅 Date: ${friendlyDate}`,
    ''
  ];

  if (classItems.length === 0) {
    lines.push('_No subject homework submitted yet for this date._');
  } else {
    classItems.forEach((item, idx) => {
      lines.push(`*${idx + 1}. ${item.subject}:*`);
      lines.push(item.description);
      if (item.teacherName) {
        lines.push(`_(${item.teacherName})_`);
      }
      lines.push('');
    });
  }

  lines.push(`_Class Teacher: ${profile.teacherName}_`);
  const formattedMessage = lines.join('\n').trim();

  // Match WhatsApp group for this class
  const group = profile.groups.find(
    g => g.isActive !== 'NO' && g.className.toLowerCase() === selectedClass.toLowerCase()
  ) || null;

  const rawTarget = group ? String(group.phoneOrLink || '').trim() : '';
  const isInviteLink = /^https?:\/\//i.test(rawTarget);
  const phoneDigits = !isInviteLink ? rawTarget.replace(/\D/g, '') : '';

  const whatsappLink = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(formattedMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(formattedMessage)}`;

  return {
    status: 'success',
    source,
    date: targetDate,
    className: selectedClass,
    items: classItems,
    formattedMessage,
    whatsappGroup: group,
    groupInviteUrl: isInviteLink ? rawTarget : '',
    whatsappLink
  };
}

module.exports = {
  ensureHomeworkSheets,
  resolveTeacherProfile,
  listHomework,
  saveHomework,
  deleteHomework,
  getConsolidatedHomework
};
