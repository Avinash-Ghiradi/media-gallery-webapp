let academicBootstrap = null;

async function ensureAcademicBootstrap() {
  if (academicBootstrap) return academicBootstrap;
  const res = await apiCall('/api/academic/bootstrap');
  if (res && res.status === 'success') {
    academicBootstrap = res;
    populateAcademicSelects(res);
  }
  return academicBootstrap;
}

function populateAcademicSelects(data) {
  const classes = data.classes || [];
  const subjects = data.subjects || [];
  const groups = data.groups || [];

  ['hwClass', 'batchClass', 'examClassSelect', 'timetableClassFilter'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = id === 'timetableClassFilter'
      ? '<option value="">-- All Classes --</option>'
      : '<option value="">-- Select Class --</option>';
    classes.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = `${c.name}${c.classTeacher ? ` (${c.classTeacher})` : ''}`;
      el.appendChild(opt);
    });
    if (prev) el.value = prev;
  });

  ['hwSubject', 'examSubjectSelect'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<option value="">-- Select Subject --</option>';
    subjects.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.name;
      el.appendChild(opt);
    });
  });

  const grpEl = document.getElementById('batchGroupSelect');
  if (grpEl) {
    grpEl.innerHTML = '<option value="">-- Direct WhatsApp (Choose Group in App) --</option>';
    groups.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g.phone;
      opt.textContent = `${g.name} (${g.phone})`;
      grpEl.appendChild(opt);
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const hwDate = document.getElementById('hwDate');
  const batchDate = document.getElementById('batchDate');
  const examDate = document.getElementById('examDateInput');
  if (hwDate && !hwDate.value) hwDate.value = today;
  if (batchDate && !batchDate.value) batchDate.value = today;
  if (examDate && !examDate.value) examDate.value = today;

  const patternBox = document.getElementById('examPatternRows');
  if (patternBox && patternBox.children.length === 0) {
    addExamPatternRow('Multiple Choice (MCQ)', 5, 1);
    addExamPatternRow('Short Answer', 5, 2);
    addExamPatternRow('Long Answer', 2, 5);
  }
}

async function loadHomeworkModule() {
  await ensureAcademicBootstrap();
  const container = document.getElementById('homeworkListContainer');
  if (!container) return;
  container.innerHTML = '<div class="loading-recent"><div class="spinner"></div><p>Loading homework...</p></div>';
  try {
    const res = await apiCall('/api/academic/homework');
    if (!res || res.status !== 'success') {
      container.innerHTML = '<p style="color:var(--error);">Could not load homework.</p>';
      return;
    }
    const items = res.data || [];
    const batches = res.batches || [];
    let html = '';

    if (batches.length > 0) {
      html += '<div style="margin-bottom:1rem;"><strong style="font-size:0.9rem;">Sent Batches</strong><div class="recent-folders-grid" style="margin-top:0.5rem;">';
      batches.slice(0, 6).forEach((b) => {
        html += `
          <div class="recent-folder-card">
            <div class="recent-folder-header">
              <div class="recent-folder-info">
                <div class="recent-folder-title">${b.class} (${b.subjectCount} subj)</div>
                <div class="recent-folder-subtitle">${b.date} • By ${b.createdBy}</div>
              </div>
              <button type="button" class="btn-secondary" style="width:auto; padding:0.35rem 0.7rem; font-size:0.75rem;" onclick="revertAcademicBatch('${b.batchId}')">
                Revert
              </button>
            </div>
          </div>`;
      });
      html += '</div></div>';
    }

    if (items.length === 0) {
      html += '<div class="empty-state"><i class="fas fa-book"></i><p>No homework saved yet</p></div>';
    } else {
      html += '<div class="recent-folders-grid">';
      items.slice(0, 30).forEach((h) => {
        const badgeColor = h.status === 'Sent' ? 'var(--success)' : 'var(--primary)';
        html += `
          <div class="recent-folder-card">
            <div class="recent-folder-header">
              <div class="recent-folder-info">
                <div class="recent-folder-title">${h.class} — ${h.subject}</div>
                <div class="recent-folder-subtitle">${h.date} • ${h.homeworkType} • <span style="color:${badgeColor}; font-weight:700;">${h.status}</span></div>
              </div>
              <button type="button" class="btn-secondary" style="width:auto; padding:0.35rem 0.65rem; font-size:0.75rem; color:var(--error);" onclick="deleteAcademicHomework('${h.id}')">
                <i class="fas fa-trash"></i>
              </button>
            </div>
            <div style="font-size:0.85rem; color:var(--dark); margin-top:0.35rem; white-space:pre-wrap;">${h.assignment}</div>
          </div>`;
      });
      html += '</div>';
    }
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--error);">${err.message}</p>`;
  }
}

async function submitHomeworkForm() {
  const payload = {
    class: document.getElementById('hwClass')?.value || '',
    subject: document.getElementById('hwSubject')?.value || '',
    homeworkType: document.getElementById('hwType')?.value || 'Writing',
    date: document.getElementById('hwDate')?.value || '',
    assignment: document.getElementById('hwAssignment')?.value || '',
    videoLink: document.getElementById('hwVideoLink')?.value || '',
    classTeacherNote: document.getElementById('hwTeacherNote')?.value || ''
  };
  const res = await apiCall('/api/academic/homework', 'POST', payload);
  if (res && res.status === 'success') {
    document.getElementById('hwAssignment').value = '';
    document.getElementById('hwVideoLink').value = '';
    document.getElementById('hwTeacherNote').value = '';
    showCopyNotification('Homework saved!');
    loadHomeworkModule();
  } else {
    showNoticePopup((res && res.message) || 'Failed to save homework', '', 'Error');
  }
}

async function deleteAcademicHomework(id) {
  const res = await apiCall(`/api/academic/homework/${encodeURIComponent(id)}`, 'DELETE');
  if (res && res.status === 'success') loadHomeworkModule();
}

async function submitCreateAndSendBatch() {
  const payload = {
    className: document.getElementById('batchClass')?.value || '',
    date: document.getElementById('batchDate')?.value || '',
    teacherCode: document.getElementById('batchTeacherCode')?.value || '',
    groupPhone: document.getElementById('batchGroupSelect')?.value || '',
    noticeMessage: document.getElementById('batchNotice')?.value || ''
  };
  const res = await apiCall('/api/academic/homework/batch', 'POST', payload);
  if (res && res.status === 'success') {
    const box = document.getElementById('batchPreviewBox');
    const txt = document.getElementById('batchPreviewText');
    if (box && txt) {
      txt.value = res.messageText || '';
      box.style.display = 'block';
    }
    if (res.whatsappUrl) window.open(res.whatsappUrl, '_blank');
    loadHomeworkModule();
  } else {
    showNoticePopup((res && res.message) || 'Could not create batch', '', 'Batch Error');
  }
}

function copyBatchPreviewMessage() {
  const txt = document.getElementById('batchPreviewText');
  if (txt && txt.value) {
    navigator.clipboard.writeText(txt.value);
    showCopyNotification('WhatsApp homework message copied!');
  }
}

async function revertAcademicBatch(batchId) {
  const res = await apiCall(`/api/academic/homework/batch/${encodeURIComponent(batchId)}/revert`, 'POST');
  if (res && res.status === 'success') {
    showCopyNotification(res.message);
    loadHomeworkModule();
  }
}

function addExamPatternRow(typeVal = 'Short Answer', qCount = 5, marks = 2) {
  const box = document.getElementById('examPatternRows');
  if (!box) return;
  const row = document.createElement('div');
  row.className = 'exam-pattern-row';
  row.style.cssText = 'display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;';
  row.innerHTML = `
    <input type="text" class="ep-type" value="${typeVal}" placeholder="Question Type" style="flex:2; min-width:140px;">
    <input type="number" class="ep-count" value="${qCount}" min="1" placeholder="Qs" style="width:72px;">
    <input type="number" class="ep-marks" value="${marks}" min="1" placeholder="Marks" style="width:78px;">
    <button type="button" class="btn-secondary" style="width:auto; padding:0.4rem 0.7rem;" onclick="this.parentElement.remove()">✕</button>
  `;
  box.appendChild(row);
}

async function loadExamsModule() {
  await ensureAcademicBootstrap();
  const container = document.getElementById('examsListContainer');
  if (!container) return;
  container.innerHTML = '<div class="loading-recent"><div class="spinner"></div><p>Loading exam blueprints...</p></div>';
  try {
    const res = await apiCall('/api/academic/exams');
    const items = (res && res.data) || [];
    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-file-alt"></i><p>No exam blueprints saved yet</p></div>';
      return;
    }
    let html = '<div class="recent-folders-grid">';
    items.forEach((ex) => {
      html += `
        <div class="recent-folder-card">
          <div class="recent-folder-header">
            <div class="recent-folder-info">
              <div class="recent-folder-title">${ex.examName} — ${ex.class} (${ex.subject})</div>
              <div class="recent-folder-subtitle">${ex.examDate} • ${ex.totalQuestions} Qs • ${ex.totalMarks}/${ex.maximumMarks} Marks</div>
            </div>
            <button type="button" class="btn-secondary" style="width:auto; padding:0.35rem 0.65rem; font-size:0.75rem; color:var(--error);" onclick="deleteAcademicExam('${ex.examId}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--error);">${err.message}</p>`;
  }
}

async function submitExamBlueprint() {
  const rows = Array.from(document.querySelectorAll('#examPatternRows .exam-pattern-row')).map((r) => ({
    questionType: r.querySelector('.ep-type')?.value || 'Question',
    numQuestions: Number(r.querySelector('.ep-count')?.value) || 0,
    marksPerQuestion: Number(r.querySelector('.ep-marks')?.value) || 0
  }));
  const payload = {
    examName: document.getElementById('examTitleInput')?.value || '',
    class: document.getElementById('examClassSelect')?.value || '',
    subject: document.getElementById('examSubjectSelect')?.value || '',
    examDate: document.getElementById('examDateInput')?.value || '',
    maximumMarks: Number(document.getElementById('examMaxMarks')?.value) || 0,
    duration: document.getElementById('examDuration')?.value || '',
    syllabus: document.getElementById('examSyllabus')?.value || '',
    questionPattern: rows
  };
  const res = await apiCall('/api/academic/exams', 'POST', payload);
  if (res && res.status === 'success') {
    showCopyNotification('Exam blueprint saved!');
    if (res.whatsappMessage) {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(res.whatsappMessage)}`, '_blank');
    }
    loadExamsModule();
  } else {
    showNoticePopup((res && res.message) || 'Failed to save exam blueprint', '', 'Error');
  }
}

async function deleteAcademicExam(examId) {
  const res = await apiCall(`/api/academic/exams/${encodeURIComponent(examId)}`, 'DELETE');
  if (res && res.status === 'success') loadExamsModule();
}

async function loadTimetableModule() {
  await ensureAcademicBootstrap();
  const clsFilter = document.getElementById('timetableClassFilter')?.value || '';
  const liveGrid = document.getElementById('liveSchoolStatusGrid');
  const tableBox = document.getElementById('weeklyTimetableContainer');
  if (liveGrid) liveGrid.innerHTML = '<div class="loading-recent"><div class="spinner"></div><p>Loading live status...</p></div>';
  try {
    const res = await apiCall(`/api/academic/timetable?class=${encodeURIComponent(clsFilter)}`);
    if (!res || res.status !== 'success') return;

    if (liveGrid) {
      liveGrid.innerHTML = (res.liveStatuses || []).map((st) => `
        <div class="recent-folder-card">
          <div class="recent-folder-title">${st.className}</div>
          <div class="recent-folder-subtitle">${st.classTeacher || ''}</div>
          <div style="margin-top:0.4rem; font-size:0.82rem; font-weight:700; color:var(--primary);">${st.statusLabel}</div>
          ${st.currentSubject ? `<div style="font-size:0.8rem; color:var(--dark);">📘 ${st.currentSubject}</div>` : ''}
        </div>
      `).join('');
    }

    if (tableBox) {
      const rows = res.timetable || [];
      if (rows.length === 0) {
        tableBox.innerHTML = '<p style="color:var(--gray);">No timetable entries for this class.</p>';
        return;
      }
      let tbl = '<table style="width:100%; border-collapse:collapse; font-size:0.82rem;"><thead><tr style="background:#eef2ff; text-align:left;"><th style="padding:8px;">Class</th><th style="padding:8px;">Day</th><th style="padding:8px;">P1</th><th style="padding:8px;">P2</th><th style="padding:8px;">P3</th><th style="padding:8px;">P4</th><th style="padding:8px;">P5</th><th style="padding:8px;">P6</th><th style="padding:8px;">P7</th></tr></thead><tbody>';
      rows.forEach((r) => {
        const p = r.periods || [];
        tbl += `<tr style="border-bottom:1px solid var(--border-light);"><td style="padding:8px; font-weight:600;">${r.class}</td><td style="padding:8px;">${r.day}</td>${[0,1,2,3,4,5,6].map(i => `<td style="padding:8px;">${p[i] || '—'}</td>`).join('')}</tr>`;
      });
      tbl += '</tbody></table>';
      tableBox.innerHTML = tbl;
    }
  } catch (err) {
    if (liveGrid) liveGrid.innerHTML = `<p style="color:var(--error);">${err.message}</p>`;
  }
}
