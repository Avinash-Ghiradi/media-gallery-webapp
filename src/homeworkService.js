const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const SCHOOL_NAME = 'Success School Indi';
const FALLBACK_FILE = path.join(__dirname, '..', 'homework_data.json');

const DEFAULT_CLASSES = [
  'Nursery', 'LKG A', 'LKG B', 'UKG',
  '1st Standard', '2nd Standard', '3rd Standard A', '3rd Standard B',
  '4th Standard', '5th Standard', '6th Standard'
];

const DEFAULT_SUBJECTS = [
  'English', 'Kannada', 'Hindi', 'Mathematics', 'Science',
  'Social', 'EVS', 'Computer', 'GK', 'Reasoning', 'Coaching - Maths'
];

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

async function callGasBridge(action, payload = {}) {
  if (!config.gasWebAppUrl) return null;
  try {
    const url = new URL(config.gasWebAppUrl);
    url.searchParams.set('action', action);
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
      redirect: 'follow'
    });
    if (res.ok) {
      const text = await res.text();
      return JSON.parse(text);
    }
  } catch (err) {
    console.warn(`Homework GAS bridge failed for ${action}:`, err.message);
  }
  return null;
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

function uniqueList(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const clean = String(item || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

function todayIso() {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch (e) {
    const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return now.toISOString().slice(0, 10);
  }
}

function nowIstString() {
  try {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }) + ' IST';
  } catch (e) {
    const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return now.toISOString().replace('T', ' ').slice(0, 19) + ' IST';
  }
}

function normalizeDateStr(val) {
  const s = String(val || '').trim().replace(/^'/, '');
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return s;
}

function formatDateFriendly(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${m[3]} ${months[parseInt(m[2], 10) - 1] || m[2]} ${m[1]}`;
}

function formatDateWithWeekday(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(dateStr || '');
  const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]}, ${parseInt(m[3], 10)} ${months[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

function getNextSchoolDayName(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  d.setUTCDate(d.getUTCDate() + 1);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); // Skip Sunday -> Monday
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[d.getUTCDay()];
}

function readFallbackData() {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      return JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8'));
    }
  } catch (e) {}
  return {
    users: [
      { username: '9900944375', classTeacher: '', designation: 'Administrator', fullName: 'Mr Avinash Ghiradi', classes: '', subjects: '' },
      { username: '9964882070', classTeacher: '', designation: 'Administrator', fullName: 'Mr Siddappa Kamble', classes: '', subjects: '' },
      { username: '9901583738', classTeacher: '', designation: 'Administrator', fullName: 'Mrs. Jyoti Sanath', classes: '1st Standard, 2nd Standard', subjects: 'Mathematics' },
      { username: '9980352950', classTeacher: '', designation: 'Principal', fullName: 'Mrs. Trupti R Chabukswar', classes: '3rd Standard A, 3rd Standard B, 6th Standard', subjects: 'Mathematics, Science, GK' },
      { username: '7259731118', classTeacher: 'Nursery', designation: 'Ass. Teacher', fullName: 'Mrs. Jyoti Jadava', classes: 'Nursery, LKG A, LKG B, UKG', subjects: 'Kannada' },
      { username: '8431889115', classTeacher: 'LKG A', designation: 'Ass. Teacher', fullName: 'Ms. Sneha G', classes: 'Nursery, LKG A, LKG B, UKG, 6th Standard', subjects: 'EVS, Computer' },
      { username: '8668878802', classTeacher: 'LKG B', designation: 'Ass. Teacher', fullName: 'Mrs. Minal Patil', classes: 'Nursery, LKG A, LKG B, UKG', subjects: 'Mathematics' },
      { username: '9566267696', classTeacher: 'UKG', designation: 'Ass. Teacher', fullName: 'Mrs. Sridevi Devar', classes: 'Nursery, LKG A, LKG B, UKG', subjects: 'English' },
      { username: '6361999247', classTeacher: '1st Standard', designation: 'Ass. Teacher', fullName: 'Ms.Disha S Rathod', classes: '1st Standard, 2nd Standard', subjects: 'English, Hindi' },
      { username: '9901583738', classTeacher: '2nd Standard', designation: 'Ass. Teacher', fullName: 'Ms. Chandrikha Pattar', classes: '1st Standard, 2nd Standard', subjects: 'Kannada, EVS' },
      { username: '9823996329', classTeacher: '3rd Standard A', designation: 'Ass. Teacher', fullName: 'Ms. Vaishali P Badiger', classes: '3rd Standard A, 3rd Standard B, 4th Standard, 5th Standard, 6th Standard', subjects: 'Social' },
      { username: '7204017903', classTeacher: '3rd Standard B', designation: 'Ass. Teacher', fullName: 'Mrs. Ujwala S Barikai', classes: '3rd Standard A, 3rd Standard B, 4th Standard, 5th Standard, 6th Standard', subjects: 'Kannada' },
      { username: '9449540726', classTeacher: '4th Standard', designation: 'Ass. Teacher', fullName: 'Ms. Nagma M Kazi', classes: '3rd Standard A, 3rd Standard B, 4th Standard, 5th Standard, 6th Standard', subjects: 'Science' },
      { username: '8830471427', classTeacher: '5th Standard', designation: 'Ass. Teacher', fullName: 'Mrs. Rekha Kolekar', classes: '3rd Standard A, 3rd Standard B, 4th Standard, 5th Standard, 6th Standard', subjects: 'English' },
      { username: '9380260297', classTeacher: '6th Standard', designation: 'Ass. Teacher', fullName: 'Mr. Akash Jalageri', classes: '4th Standard, 5th Standard, 6th Standard', subjects: 'Mathematics, Reasoning, Coaching - Maths' },
      { username: '8073323445', classTeacher: '', designation: 'Ass. Teacher', fullName: 'Ms. Sonali S Paradeshi', classes: '3rd Standard A, 3rd Standard B, 4th Standard, 5th Standard, 6th Standard', subjects: 'Hindi' }
    ],
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
      const requiredTabs = ['WhatsAppGroups', 'Homework'];
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

      const seedSpecs = [
        {
          tab: 'WhatsAppGroups',
          headers: ['Group ID', 'Group Name', 'Class', 'PhoneOrGroupLink', 'IsActive'],
          rows: DEFAULT_CLASSES.map((c, idx) => [`G${idx + 1}`, `${c} Parents`, c, '', 'YES'])
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
  if (config.gasWebAppUrl) {
    const gasBundle = await callGasBridge('getHomeworkBundle');
    if (gasBundle && gasBundle.status === 'success') {
      const usersList = gasBundle.usersList || [];
      return {
        usersList,
        allClasses: uniqueList([
          ...DEFAULT_CLASSES,
          ...usersList.flatMap(u => [...splitCsv(u.classTeacher), ...splitCsv(u.classes)])
        ]),
        allSubjects: uniqueList([
          ...DEFAULT_SUBJECTS,
          ...usersList.flatMap(u => splitCsv(u.subjects))
        ]),
        groups: gasBundle.groups || [],
        source: 'google-sheet'
      };
    }
  }

  const [usersTab, groupsTab] = await Promise.all([
    readSheetTab(config.usersSheetName || 'users'),
    readSheetTab('WhatsAppGroups')
  ]);

  const fallback = readFallbackData();

  const usersList = usersTab && usersTab.items.length > 0
    ? usersTab.items
        .filter(r => (r.username || r.mobile) && !(r.username || '').startsWith('__BRANDING_'))
        .map(r => ({
          username: r.username || r.mobile || '',
          classTeacher: r.classteacher || r.assignedclass || '',
          designation: r.designation || r.details || '',
          fullName: r.fullname || r.name || '',
          classes: r.classes || '',
          subjects: r.subjects || ''
        }))
    : fallback.users;

  const allClasses = uniqueList([
    ...DEFAULT_CLASSES,
    ...usersList.flatMap(u => [...splitCsv(u.classTeacher), ...splitCsv(u.classes)])
  ]);

  const allSubjects = uniqueList([
    ...DEFAULT_SUBJECTS,
    ...usersList.flatMap(u => splitCsv(u.subjects))
  ]);

  const groups = groupsTab && groupsTab.items.length > 0
    ? groupsTab.items.map(r => ({
        id: r.groupid || r.id || '',
        name: r.groupname || r.name || '',
        className: r.class || r.classname || '',
        phoneOrLink: r.phoneorgrouplink || r.phone || r.grouplink || r.link || r.whatsapp || '',
        isActive: (r.isactive || 'YES').toUpperCase()
      }))
    : fallback.groups;

  return {
    usersList,
    allClasses,
    allSubjects,
    groups,
    source: usersTab ? 'google-sheet' : 'fallback'
  };
}

function isAdminDesignation(designation) {
  const d = String(designation || '').trim().toLowerCase();
  return d === 'administrator' || d === 'admin' || d === 'principal';
}

function isAdminUser(sessionUser, matchedRow) {
  if (!sessionUser) return false;
  const uname = String(sessionUser.username || '').trim().toLowerCase();
  const aClass = String(sessionUser.assignedClass || '').trim().toUpperCase();
  if (uname === 'admin' || aClass === 'ALL') return true;
  if (isAdminDesignation(sessionUser.details)) return true;
  if (matchedRow && isAdminDesignation(matchedRow.designation)) return true;
  return false;
}

async function resolveTeacherProfile(sessionUser) {
  const meta = await loadMetadata();

  const userPhone = normalizePhone(sessionUser && sessionUser.username);
  const userNameNorm = normalizeName(sessionUser && (sessionUser.fullName || sessionUser.username));

  let matchedUser = null;
  if (sessionUser) {
    matchedUser = meta.usersList.find(u => {
      const uPhone = normalizePhone(u.username);
      const uName = normalizeName(u.fullName);
      if (userPhone && uPhone && userPhone === uPhone) {
        if (userNameNorm && uName && userNameNorm !== uName) {
          // If two rows share a phone number, prefer exact name match
          return false;
        }
        return true;
      }
      return false;
    }) || meta.usersList.find(u => {
      const uPhone = normalizePhone(u.username);
      const uName = normalizeName(u.fullName);
      if (userPhone && uPhone && userPhone === uPhone) return true;
      if (userNameNorm && uName && (userNameNorm === uName || uName.includes(userNameNorm) || userNameNorm.includes(uName))) return true;
      return false;
    }) || null;
  }

  const admin = isAdminUser(sessionUser, matchedUser);

  const rowClasses = splitCsv((matchedUser && matchedUser.classes) || (sessionUser && sessionUser.assignedClasses) || '');
  const rowSubjects = splitCsv((matchedUser && matchedUser.subjects) || (sessionUser && sessionUser.assignedSubjects) || '');
  const rowClassTeacher = splitCsv((matchedUser && matchedUser.classTeacher) || (sessionUser && sessionUser.assignedClass) || '')
    .filter(c => c.toUpperCase() !== 'ALL');

  const assignedClasses = admin
    ? meta.allClasses
    : (rowClasses.length > 0 ? rowClasses : rowClassTeacher);

  const assignedSubjects = admin
    ? meta.allSubjects
    : (rowSubjects.length > 0 ? rowSubjects : meta.allSubjects);

  const classTeacherOf = admin ? meta.allClasses : rowClassTeacher;

  return {
    status: 'success',
    source: meta.source,
    isAdmin: admin,
    teacherName: (matchedUser && matchedUser.fullName) || (sessionUser && (sessionUser.fullName || sessionUser.username)) || 'Teacher',
    teacherPhone: (matchedUser && matchedUser.username) || (sessionUser && sessionUser.username) || '',
    designation: (matchedUser && matchedUser.designation) || (sessionUser && sessionUser.details) || '',
    assignedClasses,
    assignedSubjects,
    isClassTeacher: classTeacherOf.length > 0 || admin,
    classTeacherOf,
    allClasses: meta.allClasses,
    allSubjects: meta.allSubjects,
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

  const defaultHeaders = ['HomeworkID', 'Date', 'Class', 'Subject', 'TeacherName', 'TeacherPhone', 'Description', 'UpdatedAt', 'HomeworkType', 'VideoLink', 'TeacherNote', 'AttachmentUrl', 'PdfNotesUrl'];
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
    date: normalizeDateStr(r.date || r.homeworkdate || ''),
    className: r.class || r.classname || '',
    subject: r.subject || r.subjectname || '',
    homeworkType: r.homeworktype || r.type || 'Writing',
    teacherName: r.teachername || r.teacher || r.createdby || '',
    teacherPhone: r.teacherphone || r.phone || '',
    description: r.description || r.homework || r.details || r.content || r.task || '',
    videoLink: r.videolink || r.video || '',
    teacherNote: r.teachernote || r.note || '',
    attachmentUrl: r.attachmenturl || r.attachment || '',
    pdfNotesUrl: r.pdfnotesurl || r.pdfnotes || '',
    updatedAt: r.updatedat || r.createdat || r.timestamp || '',
    _rowIndex: r._rowIndex
  };
}

async function readAllHomework() {
  if (config.gasWebAppUrl) {
    const gasBundle = await callGasBridge('getHomeworkBundle');
    if (gasBundle && gasBundle.status === 'success') {
      return {
        source: 'google-sheet',
        headers: [],
        items: (gasBundle.homework || []).map(x => ({ ...x, date: normalizeDateStr(x.date) }))
      };
    }
  }
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
  const targetDate = normalizeDateStr(date || todayIso());
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
    if (key === 'date' || key === 'homeworkdate') return record.date;
    if (key === 'class' || key === 'classname') return record.className;
    if (key === 'subject' || key === 'subjectname') return record.subject;
    if (key === 'homeworktype' || key === 'type') return record.homeworkType || 'Writing';
    if (key === 'teachername' || key === 'teacher' || key === 'createdby') return record.teacherName;
    if (key === 'teacherphone' || key === 'phone') return record.teacherPhone;
    if (key === 'description' || key === 'homework' || key === 'details' || key === 'content' || key === 'task') return record.description;
    if (key === 'videolink' || key === 'video') return record.videoLink || '';
    if (key === 'teachernote' || key === 'note') return record.teacherNote || '';
    if (key === 'attachmenturl' || key === 'attachment') return record.attachmentUrl || '';
    if (key === 'pdfnotesurl' || key === 'pdfnotes') return record.pdfNotesUrl || '';
    if (key === 'updatedat' || key === 'createdat' || key === 'timestamp') return record.updatedAt;
    if (key === 'status') return 'ACTIVE';
    return '';
  });
}

async function saveHomework(sessionUser, payload) {
  const profile = await resolveTeacherProfile(sessionUser);
  const date = normalizeDateStr(payload.date || todayIso());
  const className = (payload.className || '').trim();
  const subject = (payload.subject || '').trim();
  const homeworkType = (payload.homeworkType || 'Writing').trim();
  const description = (payload.description || '').trim();
  const videoLink = (payload.videoLink || '').trim();
  const teacherNote = (payload.teacherNote || '').trim();
  const attachmentUrl = (payload.attachmentUrl || '').trim();
  const pdfNotesUrl = (payload.pdfNotesUrl || '').trim();

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

  const nowStr = nowIstString();
  const record = {
    id: payload.id || `HW-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    date,
    className,
    subject,
    homeworkType,
    teacherName: profile.teacherName,
    teacherPhone: profile.teacherPhone,
    description,
    videoLink,
    teacherNote,
    attachmentUrl,
    pdfNotesUrl,
    updatedAt: nowStr
  };

  if (config.gasWebAppUrl) {
    const gasRes = await callGasBridge('saveHomeworkInSheet', { record });
    if (gasRes && gasRes.status === 'success') {
      record.id = gasRes.id || record.id;
      return { status: 'success', source: 'google-sheet', item: record, message: gasRes.message || 'Homework saved datewise to Google Sheet.' };
    }
    if (gasRes && gasRes.status === 'error') {
      console.warn('GAS saveHomeworkInSheet error:', gasRes.message);
    }
  }

  const sheets = getSheetsClient();
  if (sheets && config.homeworkSheetId) {
    try {
      await ensureHomeworkSheets();
      const headers = await ensureHomeworkHeaders(sheets);
      const { items } = await readAllHomework();

      const updatedItems = items.filter(
        x => !(x.date === date &&
          x.className.toLowerCase() === className.toLowerCase() &&
          x.subject.toLowerCase() === subject.toLowerCase())
      );

      const existing = items.find(
        x => x.date === date &&
          x.className.toLowerCase() === className.toLowerCase() &&
          x.subject.toLowerCase() === subject.toLowerCase()
      );
      if (existing) record.id = existing.id;

      updatedItems.push(record);

      // Sort datewise (newest date first, then class, then subject)
      updatedItems.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        const clsCmp = a.className.localeCompare(b.className);
        if (clsCmp !== 0) return clsCmp;
        return a.subject.localeCompare(b.subject);
      });

      const allRows = [headers, ...updatedItems.map(item => buildRowFromHeaders(headers, item))];

      await sheets.spreadsheets.values.clear({
        spreadsheetId: config.homeworkSheetId,
        range: 'Homework!A:Z'
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: config.homeworkSheetId,
        range: 'Homework!A1',
        valueInputOption: 'RAW',
        requestBody: { values: allRows }
      });

      return { status: 'success', source: 'google-sheet', item: record, message: 'Homework saved datewise to Google Sheet.' };
    } catch (err) {
      console.error('Google Sheet homework save failed:', err.message);
      return { status: 'error', message: `Failed to save homework to Google Sheet: ${err.message}` };
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

  if (config.gasWebAppUrl) {
    const gasRes = await callGasBridge('deleteHomeworkInSheet', { id: homeworkId });
    if (gasRes && gasRes.status === 'success') {
      return { status: 'success', message: gasRes.message || 'Homework deleted from Google Sheet.' };
    }
  }

  const fallback = readFallbackData();
  fallback.homework = (fallback.homework || []).filter(x => x.id !== homeworkId);
  writeFallbackData(fallback);
  return { status: 'success', message: 'Homework deleted.' };
}

async function getConsolidatedHomework(sessionUser, date, className, pdfUrl = '') {
  const targetDate = normalizeDateStr(date || todayIso());
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

  let timetableRows = [];
  let hwItems = [];
  let source = 'fallback';

  if (config.gasWebAppUrl) {
    const gasBundle = await callGasBridge('getHomeworkBundle');
    if (gasBundle && gasBundle.status === 'success') {
      source = 'google-sheet';
      hwItems = (gasBundle.homework || []).map(x => ({ ...x, date: normalizeDateStr(x.date) }));
      timetableRows = gasBundle.timetable || [];
    }
  }

  if (source !== 'google-sheet') {
    const res = await readAllHomework();
    source = res.source;
    hwItems = res.items || [];
  }

  const classItems = hwItems.filter(
    x => x.date === targetDate && x.className.toLowerCase() === selectedClass.toLowerCase()
  );

  // Find tomorrow's timetable for this class
  const tomorrowDayName = getNextSchoolDayName(targetDate);
  const ttMatch = timetableRows.find(t =>
    t.className.toLowerCase() === selectedClass.toLowerCase() &&
    t.day.toLowerCase().includes(tomorrowDayName.toLowerCase())
  );
  const tomorrowPeriods = ttMatch ? (ttMatch.periods || []) : [];

  const friendlyDate = formatDateWithWeekday(targetDate);

  // Auto-generate PDF in Google Drive immediately when homework items exist
  let finalPdfUrl = pdfUrl;
  let pdfFileName = '';
  if (!finalPdfUrl && classItems.length > 0 && config.gasWebAppUrl) {
    const pdfRes = await callGasBridge('generateHomeworkPdf', {
      date: targetDate,
      friendlyDate,
      className: selectedClass,
      classTeacher: profile.teacherName,
      items: classItems,
      tomorrowPeriods,
      tomorrowDayLabel: tomorrowDayName ? `Tomorrow's Timetable (${tomorrowDayName})` : "Tomorrow's Timetable"
    });
    if (pdfRes && pdfRes.status === 'success' && pdfRes.pdfUrl) {
      finalPdfUrl = pdfRes.pdfUrl;
      pdfFileName = pdfRes.fileName || '';
    }
  }

  const bar = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
  const lines = [
    `*${SCHOOL_NAME.toUpperCase()}*`,
    '_Education for Excellence_',
    bar,
    '*📋 Daily Homework Notice*',
    '',
    `*🏫 Class:* ${selectedClass}`,
    `*📅 Date:* ${friendlyDate}`,
    `*📝 Subjects Today:* ${classItems.length}`,
    bar,
    ''
  ];

  if (classItems.length === 0) {
    lines.push('_No subject homework submitted yet for this date._');
    lines.push('');
  } else {
    classItems.forEach((item, idx) => {
      const hwType = item.homeworkType || 'Writing';
      lines.push(`*${idx + 1}. ${item.subject}*`);
      lines.push(`   📝 *Type:* ${hwType}`);
      lines.push(`   📝 ${item.description}`);
      if (item.teacherNote) {
        lines.push(`   📌 *Note:* ${item.teacherNote}`);
      }
      if (item.videoLink) {
        lines.push(`   🎥 *Video:* ${item.videoLink}`);
      }
      if (item.attachmentUrl) {
        lines.push(`   🖼️ *Image:* ${item.attachmentUrl}`);
      }
      if (item.pdfNotesUrl) {
        lines.push(`   📄 *PDF Notes:* ${item.pdfNotesUrl}`);
      }
      if (item.teacherName) {
        lines.push(`   👨‍🏫 *Teacher:* ${item.teacherName}`);
      }
      lines.push('');
    });
  }

  if (tomorrowPeriods.length > 0) {
    const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    lines.push('');
    lines.push(`📅 *Tomorrow's Timetable*`);
    lines.push(bar);
    tomorrowPeriods.forEach((p, idx) => {
      const label = `${ordinals[idx] || `${idx + 1}th`} Period`;
      lines.push(`*${label}:* ${p}`);
    });
    lines.push(bar);
  }

  lines.push(bar);
  lines.push('#Bhyavanti Nagar, Indi, Karnataka');
  lines.push('📞 +91 99648 82070');
  lines.push(bar);
  lines.push('');
  lines.push('📱 *Thank you*');
  lines.push('──────────────────────────────────────────────────');

  if (finalPdfUrl) {
    lines.push('');
    lines.push(`📎 *PDF Attachment:* ${finalPdfUrl}`);
  }

  const formattedMessage = lines.join('\n').trim();

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
    friendlyDate,
    className: selectedClass,
    items: classItems,
    tomorrowPeriods,
    tomorrowDayLabel: tomorrowDayName ? `Tomorrow's Timetable (${tomorrowDayName})` : "Tomorrow's Timetable",
    pdfUrl: finalPdfUrl,
    pdfFileName,
    formattedMessage,
    whatsappGroup: group,
    groupInviteUrl: isInviteLink ? rawTarget : '',
    whatsappLink
  };
}

async function generateHomeworkPdf(sessionUser, payload) {
  const date = normalizeDateStr(payload.date || todayIso());
  const className = (payload.className || '').trim();
  const profile = await resolveTeacherProfile(sessionUser);
  const consolidated = await getConsolidatedHomework(sessionUser, date, className);
  if (consolidated.status !== 'success') return consolidated;

  if (!config.gasWebAppUrl) {
    return { status: 'error', message: 'GAS WebApp URL is required to generate PDF in Google Drive.' };
  }

  const pdfRes = await callGasBridge('generateHomeworkPdf', {
    date: consolidated.date,
    friendlyDate: consolidated.friendlyDate,
    className: consolidated.className,
    classTeacher: profile.teacherName,
    items: consolidated.items,
    tomorrowPeriods: consolidated.tomorrowPeriods,
    tomorrowDayLabel: consolidated.tomorrowDayLabel
  });

  if (!pdfRes || pdfRes.status !== 'success') {
    return { status: 'error', message: (pdfRes && pdfRes.message) || 'Failed to generate PDF in Google Drive.' };
  }

  const updated = await getConsolidatedHomework(sessionUser, date, className, pdfRes.pdfUrl);
  return {
    ...updated,
    pdfFileName: pdfRes.fileName
  };
}

async function uploadHomeworkAttachment(payload) {
  if (!payload || !payload.base64Data) {
    return { status: 'error', message: 'No file data provided.' };
  }
  if (!config.gasWebAppUrl) {
    return { status: 'error', message: 'GAS WebApp URL is required for file uploads.' };
  }
  const gasRes = await callGasBridge('uploadHomeworkFile', {
    fileName: payload.fileName || `homework_${Date.now()}`,
    contentType: payload.contentType || 'application/octet-stream',
    base64Data: payload.base64Data
  });
  if (gasRes && gasRes.status === 'success') {
    return gasRes;
  }
  return { status: 'error', message: (gasRes && gasRes.message) || 'Failed to upload homework file.' };
}

module.exports = {
  ensureHomeworkSheets,
  resolveTeacherProfile,
  listHomework,
  saveHomework,
  deleteHomework,
  getConsolidatedHomework,
  generateHomeworkPdf,
  uploadHomeworkAttachment
};
