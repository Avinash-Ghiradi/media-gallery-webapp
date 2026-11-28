const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const SCHOOL = {
  name: 'Success School Indi',
  tagline: 'Education for Excellence',
  address: '#Bhyavanti Nagar, Indi, Karnataka',
  phone: '+91 99648 82070'
};

const DATA_FILE = path.join(__dirname, '..', 'homework_data.json');

const SUBJECT_ORDER = [
  'English', 'Kannada', 'Hindi', 'Mathematics', 'Maths',
  'Science', 'Social', 'Reasoning', 'Coaching - Maths',
  'EVS', 'Computer', 'GK'
];

const DEFAULT_CLASSES = [
  { id: 'NUR', name: 'Nursery', classTeacher: 'Jyoti D Jadhav', code: '123456' },
  { id: 'LKGA', name: 'LKG A', classTeacher: 'Minal Girish Patil', code: '123456' },
  { id: 'LKGB', name: 'LKG B', classTeacher: 'Sneha R Gayagol', code: '123456' },
  { id: 'UKG', name: 'UKG', classTeacher: 'Sreedevi G Devar', code: '123456' },
  { id: '1', name: '1st Standard', classTeacher: 'Disha S Rathod', code: '123456' },
  { id: '2', name: '2nd Standard', classTeacher: 'Roopa N Biradar', code: '123456' },
  { id: '3A', name: '3rd Standard A', classTeacher: 'Vaishali P Badiger', code: '123456' },
  { id: '3B', name: '3rd Standard B', classTeacher: 'Ujwala S Barikai', code: '123456' },
  { id: '4', name: '4th Standard', classTeacher: 'Nagma M Kazi', code: '123456' },
  { id: '5', name: '5th Standard', classTeacher: 'Vaishali P Badiger', code: '123456' },
  { id: '6', name: '6th Standard', classTeacher: 'Akash D Jalageri', code: '123456' }
];

const DEFAULT_SUBJECTS = [
  { id: 'ENG', name: 'English' },
  { id: 'KAN', name: 'Kannada' },
  { id: 'HIN', name: 'Hindi' },
  { id: 'MAT', name: 'Mathematics' },
  { id: 'SCI', name: 'Science' },
  { id: 'SOC', name: 'Social' },
  { id: 'EVS', name: 'EVS' },
  { id: 'COM', name: 'Computer' },
  { id: 'GK', name: 'GK' },
  { id: 'REA', name: 'Reasoning' },
  { id: 'CMA', name: 'Coaching - Maths' }
];

const DEFAULT_GROUPS = [
  { id: 'G1', name: '1st Standard Parents', class: '1st Standard', phone: '+919876543210', isActive: 'YES' },
  { id: 'G2', name: '2nd Standard Parents', class: '2nd Standard', phone: '+919876543211', isActive: 'YES' },
  { id: 'G3', name: '3rd Standard Parents', class: '3rd Standard A', phone: '+919876543212', isActive: 'YES' },
  { id: 'G4', name: '4th Standard Parents', class: '4th Standard', phone: '+919876543213', isActive: 'YES' },
  { id: 'G5', name: '5th Standard Parents', class: '5th Standard', phone: '+919876543214', isActive: 'YES' },
  { id: 'G6', name: '6th Standard Parents', class: '6th Standard', phone: '+919876543215', isActive: 'YES' }
];

const DEFAULT_TIMETABLE = [
  { class: '3rd Standard A', day: '1. Monday', periods: ['Social', 'Hindi', 'Kannada', 'Maths', 'PT', 'English', 'Science'] },
  { class: '3rd Standard A', day: '2. Tuesday', periods: ['Social', 'Hindi', 'English', 'Science', 'GK', 'Maths', 'Kannada'] },
  { class: '3rd Standard A', day: '3. Wednesday', periods: ['Social', 'Kannada', 'English', 'Maths', 'Hindi', 'GK', 'Science'] },
  { class: '3rd Standard A', day: '4. Thursday', periods: ['Social', 'Hindi', 'Science', 'PT', 'Kannada', 'Maths', 'GK'] },
  { class: '3rd Standard A', day: '5. Friday', periods: ['Social', 'Maths', 'Science', 'English', 'Maths', 'Kannada', 'Hindi'] },
  { class: '3rd Standard A', day: '6. Saturday', periods: ['March Past', 'English', 'Activity / Competition / Exam', 'Activity / Competition / Exam', '', '', ''] },
  { class: '3rd Standard B', day: '1. Monday', periods: ['Kannada', 'Social', 'Hindi', 'Science', 'English', 'PT', 'Maths'] },
  { class: '3rd Standard B', day: '2. Tuesday', periods: ['Kannada', 'Maths', 'GK', 'English', 'Social', 'Science', 'Hindi'] },
  { class: '3rd Standard B', day: '3. Wednesday', periods: ['Kannada', 'Science', 'Maths', 'Hindi', 'English', 'PT', 'Social'] },
  { class: '3rd Standard B', day: '4. Thursday', periods: ['Kannada', 'English', 'Hindi', 'Science', 'GK', 'Social', 'Maths'] },
  { class: '3rd Standard B', day: '5. Friday', periods: ['Kannada', 'English', 'Maths', 'Science', 'Hindi', 'Social', 'GK'] },
  { class: '3rd Standard B', day: '6. Saturday', periods: ['March Past', 'Maths', 'Activity / Competition / Exam', 'Activity / Competition / Exam', '', '', ''] },
  { class: '4th Standard', day: '1. Monday', periods: ['Science', 'English', 'Reasoning', 'Social', 'Maths', 'Hindi', 'Kannada'] },
  { class: '4th Standard', day: '2. Tuesday', periods: ['Science', 'Social', 'Maths', 'Hindi', 'English', 'Kannada', 'Reasoning'] },
  { class: '4th Standard', day: '3. Wednesday', periods: ['Science', 'English', 'Reasoning', 'Social', 'PT', 'Hindi', 'Maths'] },
  { class: '4th Standard', day: '4. Thursday', periods: ['Science', 'Reasoning', 'Kannada', 'English', 'Social', 'Maths', 'Hindi'] },
  { class: '4th Standard', day: '5. Friday', periods: ['Science', 'Social', 'PT', 'Kannada', 'Maths (Teacher 3)', 'Hindi', 'English'] },
  { class: '4th Standard', day: '6. Saturday', periods: ['March Past', 'Kannada', 'Activity / Competition / Exam', 'Activity / Competition / Exam', '', '', ''] },
  { class: '5th Standard', day: '1. Monday', periods: ['English', 'Reasoning', 'Social', 'Kannada', 'Hindi', 'Maths', 'Maths'] },
  { class: '5th Standard', day: '2. Tuesday', periods: ['English', 'Reasoning', 'Social', 'Kannada', 'Maths', 'Maths', 'Science'] },
  { class: '5th Standard', day: '3. Wednesday', periods: ['English', 'Reasoning', 'Science', 'Kannada', 'Maths', 'Maths', 'PT'] },
  { class: '5th Standard', day: '4. Thursday', periods: ['English', 'Science', 'Maths', 'Reasoning', 'Hindi', 'Kannada', 'Social'] },
  { class: '5th Standard', day: '5. Friday', periods: ['English', 'Science', 'Kannada', 'PT (Teacher 9)', 'Social', 'Reasoning', 'Maths'] },
  { class: '5th Standard', day: '6. Saturday', periods: ['March Past', 'Hindi', 'Activity / Competition / Exam', 'Activity / Competition / Exam', '', '', ''] },
  { class: '6th Standard', day: '1. Monday', periods: ['Maths', 'Kannada', 'Science', 'English', 'GK (Teacher 5)', 'Social', 'Hindi'] },
  { class: '6th Standard', day: '2. Tuesday', periods: ['Maths', 'English', 'Kannada', 'Social', 'Hindi (Teacher 7)', 'Computer (Teacher 15)', 'Science'] },
  { class: '6th Standard', day: '3. Wednesday', periods: ['Maths', 'Science', 'Hindi', 'English', 'Kannada', 'Social', 'Computer (Teacher 15)'] },
  { class: '6th Standard', day: '4. Thursday', periods: ['Maths', 'Science', 'Social', 'Kannada', 'English', 'Hindi', 'PT'] },
  { class: '6th Standard', day: '5. Friday', periods: ['Maths', 'Hindi', 'English', 'Science', 'Kannada', 'PT', 'Computer (Teacher 15)'] },
  { class: '6th Standard', day: '6. Saturday', periods: ['March Past', 'Social', 'Activity / Competition / Exam', 'Activity / Competition / Exam', '', '', ''] }
];

const CLASS_SCHEDULES = {
  prePrimary: [
    { periodNum: 1, start: '10:00', end: '10:45' },
    { periodNum: 2, start: '10:45', end: '11:30' },
    { isBreak: true, label: '🍱 Lunch Break', start: '11:30', end: '12:00' },
    { periodNum: 3, start: '12:00', end: '12:45' },
    { periodNum: 4, start: '12:45', end: '13:30' }
  ],
  lowerPrimary: [
    { periodNum: 1, start: '10:00', end: '11:00' },
    { periodNum: 2, start: '11:00', end: '11:55' },
    { isBreak: true, label: '☕ Short Break', start: '11:55', end: '12:05' },
    { periodNum: 3, start: '12:05', end: '13:00' },
    { isBreak: true, label: '🍱 Lunch Break', start: '13:00', end: '13:30' },
    { periodNum: 4, start: '13:30', end: '14:25' },
    { periodNum: 5, start: '14:25', end: '15:10' },
    { isBreak: true, label: '☕ Short Break', start: '15:10', end: '15:20' },
    { periodNum: 6, start: '15:20', end: '16:15' }
  ],
  primary: [
    { periodNum: 1, start: '10:00', end: '11:00' },
    { periodNum: 2, start: '11:00', end: '11:45' },
    { isBreak: true, label: '☕ Short Break', start: '11:45', end: '12:00' },
    { periodNum: 3, start: '12:00', end: '12:45' },
    { periodNum: 4, start: '12:45', end: '13:30' },
    { isBreak: true, label: '🍱 Lunch Break', start: '13:30', end: '14:00' },
    { periodNum: 5, start: '14:00', end: '14:45' },
    { periodNum: 6, start: '14:45', end: '15:30' },
    { periodNum: 7, start: '15:30', end: '16:15' }
  ]
};

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return {
        classes: parsed.classes || DEFAULT_CLASSES,
        subjects: parsed.subjects || DEFAULT_SUBJECTS,
        groups: parsed.groups || DEFAULT_GROUPS,
        timetable: parsed.timetable || DEFAULT_TIMETABLE,
        homework: Array.isArray(parsed.homework) ? parsed.homework : [],
        batches: Array.isArray(parsed.batches) ? parsed.batches : [],
        examPapers: Array.isArray(parsed.examPapers) ? parsed.examPapers : []
      };
    }
  } catch (e) {}
  return {
    classes: DEFAULT_CLASSES,
    subjects: DEFAULT_SUBJECTS,
    groups: DEFAULT_GROUPS,
    timetable: DEFAULT_TIMETABLE,
    homework: [],
    batches: [],
    examPapers: []
  };
}

function saveStore(store) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.warn('Could not persist homework_data.json:', e.message);
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeStr() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function getScheduleForClass(classname) {
  const name = (classname || '').toLowerCase();
  if (name.includes('nursery') || name.includes('lkg') || name.includes('ukg')) return CLASS_SCHEDULES.prePrimary;
  if (name.includes('1st standard') || name.includes('2nd standard')) return CLASS_SCHEDULES.lowerPrimary;
  return CLASS_SCHEDULES.primary;
}

function formatTime12(hhmm) {
  const [hStr, m] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

function getBootstrapData() {
  const store = loadStore();
  return {
    status: 'success',
    school: SCHOOL,
    classes: store.classes,
    subjects: store.subjects,
    groups: store.groups
  };
}

function getHomeworkList(filters = {}) {
  const store = loadStore();
  let items = [...store.homework];
  if (filters.class) items = items.filter((h) => h.class === filters.class);
  if (filters.subject) items = items.filter((h) => h.subject === filters.subject);
  if (filters.teacher) items = items.filter((h) => h.teacher.toLowerCase().includes(filters.teacher.toLowerCase()));
  if (filters.date) items = items.filter((h) => h.date === filters.date);
  items.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  const stats = {
    total: store.homework.length,
    saved: store.homework.filter((h) => h.status !== 'Sent').length,
    sent: store.homework.filter((h) => h.status === 'Sent').length
  };
  return { status: 'success', data: items, batches: store.batches, stats };
}

function saveHomework(payload, currentUser) {
  const store = loadStore();
  if (!payload.class || !payload.subject || !payload.assignment) {
    return { status: 'error', message: 'Class, Subject, and Assignment are required.' };
  }
  const item = {
    id: crypto.randomUUID(),
    date: payload.date || todayISO(),
    class: payload.class.trim(),
    subject: payload.subject.trim(),
    teacher: (payload.teacher || currentUser.fullName || currentUser.username || '').trim(),
    assignment: payload.assignment.trim(),
    homeworkType: payload.homeworkType || 'Writing',
    videoLink: (payload.videoLink || '').trim(),
    classTeacherNote: (payload.classTeacherNote || '').trim(),
    status: 'Saved',
    batchId: '',
    timestamp: nowTimeStr()
  };
  store.homework.push(item);
  saveStore(store);
  return { status: 'success', message: 'Homework saved successfully!', data: item };
}

function deleteHomework(id) {
  const store = loadStore();
  const idx = store.homework.findIndex((h) => h.id === id);
  if (idx === -1) return { status: 'error', message: 'Homework item not found' };
  store.homework.splice(idx, 1);
  saveStore(store);
  return { status: 'success', message: 'Homework deleted' };
}

function sortBySubjectOrder(items) {
  const orderMap = {};
  SUBJECT_ORDER.forEach((s, idx) => { orderMap[s.toLowerCase()] = idx; });
  return [...items].sort((a, b) => {
    const ai = orderMap[(a.subject || '').toLowerCase()] ?? 999;
    const bi = orderMap[(b.subject || '').toLowerCase()] ?? 999;
    return ai - bi;
  });
}

function buildHomeworkWhatsAppMessage(classname, dateStr, items, noticeMessage, store) {
  const sorted = sortBySubjectOrder(items);
  let msg = `*${SCHOOL.name.toUpperCase()}*\n`;
  msg += `_${SCHOOL.tagline}_\n`;
  msg += `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n`;
  msg += `*📋 Daily Homework Notice*\n\n`;
  msg += `*🏫 Class:* ${classname}\n`;
  msg += `*📅 Date:* ${dateStr}\n`;
  msg += `*📝 Subjects Today:* ${sorted.length}\n`;
  msg += `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;

  sorted.forEach((item, idx) => {
    const icon = item.homeworkType === 'Reading' ? '📖' : (item.homeworkType === 'Exam Syllabus & Pattern' ? '📋' : '📝');
    msg += `*${idx + 1}. ${item.subject}*\n`;
    msg += `   ${icon} *Type:* ${item.homeworkType || 'Writing'}\n`;
    msg += `   📝 ${item.assignment}\n`;
    if (item.videoLink) msg += `   🎥 *Video:* ${item.videoLink}\n`;
    if (item.teacher) msg += `   👨‍🏫 *Teacher:* ${item.teacher}\n`;
    if (item.classTeacherNote) msg += `   📌 *Note:* ${item.classTeacherNote}\n`;
    if (idx < sorted.length - 1) msg += '\n';
  });

  // Next day timetable
  const nowDay = new Date().getDay();
  const nextDayNum = nowDay >= 6 || nowDay === 0 ? 1 : nowDay + 1;
  const nextRow = (store.timetable || []).find((r) => {
    if (r.class !== classname) return false;
    const m = (r.day || '').match(/^(\d+)\./);
    return m && parseInt(m[1], 10) === nextDayNum;
  });
  if (nextRow) {
    const labels = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
    const nonEmpty = (nextRow.periods || []).map((p, i) => ({ label: labels[i], value: p })).filter((p) => p.value);
    if (nonEmpty.length > 0) {
      msg += `\n\n📅 *Tomorrow's Timetable*\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n`;
      nonEmpty.forEach((p) => { msg += `*${p.label} Period:* ${p.value}\n`; });
      msg += `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`;
    }
  }

  if (noticeMessage && noticeMessage.trim()) {
    const isPrincipal = noticeMessage.toLowerCase().includes('principal');
    msg += `\n\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n`;
    msg += `*${isPrincipal ? "👑 PRINCIPAL'S NOTICE" : '📢 CLASS TEACHER NOTICE'}*\n`;
    msg += `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n${noticeMessage.trim()}\n`;
  }

  msg += `\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n${SCHOOL.address}\n📞 ${SCHOOL.phone}\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n📱 *Thank you*`;
  return msg;
}

function createAndSendBatch({ className, date, teacherCode, noticeMessage, groupPhone }) {
  const store = loadStore();
  if (!className) return { status: 'error', message: 'Class is required' };
  const targetDate = date || todayISO();

  const cls = store.classes.find((c) => c.name === className);
  const code = (teacherCode || '').trim();
  const isPrincipal = code === config.principalCode;
  if (!isPrincipal && (!cls || cls.code !== code)) {
    return { status: 'error', message: 'Invalid Class Teacher Code or Principal Code.' };
  }

  const unsent = store.homework.filter((h) => h.class === className && h.date === targetDate && h.status !== 'Sent');
  if (unsent.length === 0) {
    return { status: 'error', message: `No unsent homework found for ${className} on ${targetDate}.` };
  }

  const batchId = 'BATCH_' + crypto.randomUUID().slice(0, 8);
  const message = buildHomeworkWhatsAppMessage(className, targetDate, unsent, noticeMessage, store);
  const cleanPhone = (groupPhone || '').replace(/[\s\-()]/g, '');
  const whatsappUrl = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  unsent.forEach((h) => {
    h.status = 'Sent';
    h.batchId = batchId;
    h.sentDate = nowTimeStr();
  });

  const batch = {
    batchId,
    class: className,
    date: targetDate,
    subjectCount: unsent.length,
    createdBy: isPrincipal ? 'Principal' : (cls ? cls.classTeacher : 'Teacher'),
    noticeMessage: (noticeMessage || '').trim(),
    status: 'Sent',
    createdDate: nowTimeStr(),
    message
  };
  store.batches.unshift(batch);
  saveStore(store);

  return { status: 'success', batch, whatsappUrl, messageText: message };
}

function revertBatch(batchId) {
  const store = loadStore();
  let count = 0;
  store.homework.forEach((h) => {
    if (h.batchId === batchId) {
      h.status = 'Saved';
      h.batchId = '';
      h.sentDate = '';
      count++;
    }
  });
  store.batches = store.batches.filter((b) => b.batchId !== batchId);
  saveStore(store);
  return { status: 'success', message: `Reverted ${count} homework item(s) to Saved.` };
}

function getExamPapers(filters = {}) {
  const store = loadStore();
  let items = [...store.examPapers];
  if (filters.class) items = items.filter((e) => e.class === filters.class);
  if (filters.subject) items = items.filter((e) => e.subject === filters.subject);
  if (filters.examName) items = items.filter((e) => e.examName === filters.examName);
  items.sort((a, b) => (b.examDate || '').localeCompare(a.examDate || ''));
  return { status: 'success', data: items };
}

function saveExamPaper(payload, currentUser) {
  const store = loadStore();
  if (!payload.examName || !payload.class || !payload.subject || !payload.examDate) {
    return { status: 'error', message: 'Exam Name, Class, Subject, and Exam Date are required.' };
  }
  const pattern = Array.isArray(payload.questionPattern) ? payload.questionPattern : [];
  let totalQuestions = 0;
  let totalMarks = 0;
  pattern.forEach((r) => {
    const q = Number(r.numQuestions) || 0;
    const m = Number(r.marksPerQuestion) || 0;
    totalQuestions += q;
    totalMarks += q * m;
  });
  const maxMarks = Number(payload.maximumMarks) || 0;
  if (maxMarks > 0 && totalMarks > maxMarks) {
    return { status: 'error', message: `Total marks (${totalMarks}) exceed Maximum Marks (${maxMarks}).` };
  }

  const exam = {
    examId: 'EXAM_' + crypto.randomUUID().slice(0, 8),
    academicYear: payload.academicYear || '2026-27',
    examName: payload.examName.trim(),
    class: payload.class.trim(),
    subject: payload.subject.trim(),
    teacher: (payload.teacher || currentUser.fullName || currentUser.username || '').trim(),
    examDate: payload.examDate,
    duration: (payload.duration || '').trim(),
    maximumMarks: maxMarks,
    instructions: (payload.instructions || '').trim(),
    syllabus: (payload.syllabus || '').trim(),
    questionPattern: pattern,
    totalQuestions,
    totalMarks,
    createdDate: nowTimeStr()
  };
  store.examPapers.unshift(exam);
  saveStore(store);

  let whatsappMsg = `*${SCHOOL.name.toUpperCase()}*\n_${SCHOOL.tagline}_\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n*📝 Examination Notice*\n\n`;
  whatsappMsg += `*📚 Exam:* ${exam.examName}\n*🏫 Class:* ${exam.class}\n*📘 Subject:* ${exam.subject}\n*📅 Date:* ${exam.examDate}\n*📊 Max Marks:* ${exam.maximumMarks}\n`;
  if (exam.duration) whatsappMsg += `*⏱️ Duration:* ${exam.duration}\n`;
  if (exam.syllabus) whatsappMsg += `\n*📖 Syllabus:*\n${exam.syllabus}\n`;
  if (pattern.length) {
    whatsappMsg += `\n*🧩 Question Pattern:*\n`;
    pattern.forEach((q, i) => {
      const qn = Number(q.numQuestions) || 0;
      const mk = Number(q.marksPerQuestion) || 0;
      whatsappMsg += `${i + 1}. ${q.questionType}: ${qn} × ${mk} = ${qn * mk}\n`;
    });
  }
  whatsappMsg += `\n📱 *All the best!*`;

  return { status: 'success', data: exam, whatsappMessage: whatsappMsg };
}

function deleteExamPaper(examId) {
  const store = loadStore();
  store.examPapers = store.examPapers.filter((e) => e.examId !== examId);
  saveStore(store);
  return { status: 'success', message: 'Exam paper deleted' };
}

function getTimetableData(classname = '') {
  const store = loadStore();
  const rows = classname ? store.timetable.filter((r) => r.class === classname) : store.timetable;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dayNum = now.getDay();

  const liveStatuses = store.classes.map((cls) => {
    const schedule = getScheduleForClass(cls.name);
    const todayRow = dayNum === 0 ? null : store.timetable.find((r) => {
      if (r.class !== cls.name) return false;
      const m = (r.day || '').match(/^(\d+)\./);
      return m && parseInt(m[1], 10) === dayNum;
    });
    let statusLabel = '⏳ Outside School Hours';
    let currentSubject = '';
    if (dayNum === 0) {
      statusLabel = '🏖️ Sunday Holiday';
    } else {
      for (const seg of schedule) {
        if (hhmm >= seg.start && hhmm < seg.end) {
          if (seg.isBreak) {
            statusLabel = `${seg.label} (${formatTime12(seg.start)} - ${formatTime12(seg.end)})`;
          } else {
            const subj = todayRow && todayRow.periods ? (todayRow.periods[seg.periodNum - 1] || '') : '';
            statusLabel = `Period ${seg.periodNum} (${formatTime12(seg.start)} - ${formatTime12(seg.end)})`;
            currentSubject = subj || 'Scheduled';
          }
          break;
        }
      }
    }
    return {
      className: cls.name,
      classTeacher: cls.classTeacher,
      statusLabel,
      currentSubject
    };
  });

  return { status: 'success', timetable: rows, liveStatuses };
}

module.exports = {
  getBootstrapData,
  getHomeworkList,
  saveHomework,
  deleteHomework,
  createAndSendBatch,
  revertBatch,
  getExamPapers,
  saveExamPaper,
  deleteExamPaper,
  getTimetableData
};
