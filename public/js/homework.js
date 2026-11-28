/* ==========================================================================
   DAILY HOMEWORK & CLASS TEACHER WHATSAPP CONSOLIDATION
   ========================================================================== */

let hwProfile = null;
let hwListCache = [];
let hwConsolidatedData = null;
let hwPendingImageFile = null;
let hwPendingPdfFile = null;
let hwExistingAttachmentUrl = '';
let hwExistingPdfNotesUrl = '';

function getTodayIsoDate() {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch (e) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

function escapeHwHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let hwActiveSubTab = 'add';

function switchHomeworkSubTab(subTab) {
  hwActiveSubTab = subTab || 'add';
  document.querySelectorAll('#homeworkSubNav .hw-tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-hw-tab') === hwActiveSubTab);
  });

  const addSec = document.getElementById('hwSectionAdd');
  const subSec = document.getElementById('hwSectionSubmitted');
  const sendSec = document.getElementById('hwSectionSend');

  if (addSec) addSec.style.display = hwActiveSubTab === 'add' ? 'block' : 'none';
  if (subSec) subSec.style.display = hwActiveSubTab === 'submitted' ? 'block' : 'none';
  if (sendSec) sendSec.style.display = hwActiveSubTab === 'send' ? 'block' : 'none';

  if (hwActiveSubTab === 'submitted') {
    const d1 = document.getElementById('hwDate');
    const d2 = document.getElementById('hwSubmittedDate');
    if (d1 && d2 && d1.value) d2.value = d1.value;
    loadMyHomeworkList();
  } else if (hwActiveSubTab === 'send') {
    loadConsolidatedHomework();
  }
}

function syncHomeworkDate(val) {
  const d1 = document.getElementById('hwDate');
  const d2 = document.getElementById('hwSubmittedDate');
  if (d1 && val) d1.value = val;
  if (d2 && val) d2.value = val;
  loadMyHomeworkList();
}

async function initializeHomeworkTab() {
  const dateInput = document.getElementById('hwDate');
  const subDateInput = document.getElementById('hwSubmittedDate');
  const ctDateInput = document.getElementById('hwCtDate');
  const today = getTodayIsoDate();
  if (dateInput && !dateInput.value) dateInput.value = today;
  if (subDateInput && !subDateInput.value) subDateInput.value = today;
  if (ctDateInput && !ctDateInput.value) ctDateInput.value = today;

  switchHomeworkSubTab(hwActiveSubTab || 'add');
  await loadHomeworkProfile();
}

async function loadHomeworkProfile() {
  const infoBox = document.getElementById('hwTeacherProfileBox');
  if (infoBox) {
    infoBox.innerHTML = '<div class="loading-recent"><div class="spinner"></div><p>Loading your classes &amp; subjects...</p></div>';
  }

  try {
    const res = await apiCall('/api/homework/profile');
    if (!res || res.status !== 'success') {
      if (infoBox) infoBox.innerHTML = `<div class="status-message status-error">${escapeHwHtml((res && res.message) || 'Could not load teacher profile.')}</div>`;
      return;
    }

    hwProfile = res;
    renderTeacherProfileBox(res);
    populateTeacherDropdowns(res);
    setupClassTeacherSection(res);
    await loadMyHomeworkList();
  } catch (err) {
    console.error('loadHomeworkProfile error:', err);
    if (infoBox) infoBox.innerHTML = '<div class="status-message status-error">Failed to load teacher profile.</div>';
  }
}

function renderTeacherProfileBox(profile) {
  const infoBox = document.getElementById('hwTeacherProfileBox');
  if (!infoBox) return;

  const classesHtml = (profile.assignedClasses || []).length > 0
    ? profile.assignedClasses.map(c => `<span class="assigned-class-badge" style="margin: 2px 4px 2px 0; display: inline-block;">${escapeHwHtml(c)}</span>`).join('')
    : '<span style="color: var(--text-muted, #64748b);">No classes assigned</span>';

  const subjectsHtml = (profile.assignedSubjects || []).length > 0
    ? profile.assignedSubjects.map(s => `<span class="assigned-class-badge" style="background: rgba(16,185,129,0.12); color: #047857; margin: 2px 4px 2px 0; display: inline-block;">${escapeHwHtml(s)}</span>`).join('')
    : '<span style="color: var(--text-muted, #64748b);">No subjects assigned</span>';

  const ctHtml = (profile.classTeacherOf || []).length > 0
    ? `<div style="margin-top: 8px; font-size: 0.9rem; color: #4338ca; font-weight: 600;">
         <i class="fas fa-chalkboard-teacher"></i> Class Teacher of: ${profile.classTeacherOf.map(escapeHwHtml).join(', ')}
       </div>`
    : '';

  infoBox.innerHTML = `
    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 12px;">
      <div>
        <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary, #0f172a);">
          <i class="fas fa-user-tie" style="color: var(--primary, #4f46e5);"></i> ${escapeHwHtml(profile.teacherName)}
          ${profile.isAdmin ? '<span class="assigned-class-badge" style="margin-left: 8px;">Admin / All Access</span>' : ''}
        </div>
        ${ctHtml}
      </div>
      <div style="font-size: 0.78rem; color: #64748b;">
        <i class="fas fa-table"></i> Source: ${profile.source === 'google-sheet' ? 'Google Sheet (Live)' : 'Local Cache'}
      </div>
    </div>
    <div style="margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;">
      <div>
        <div style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 4px;">Your Classes</div>
        <div>${classesHtml}</div>
      </div>
      <div>
        <div style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 4px;">Your Subjects</div>
        <div>${subjectsHtml}</div>
      </div>
    </div>
  `;
}

function populateTeacherDropdowns(profile) {
  const classSel = document.getElementById('hwClassSelect');
  const subjSel = document.getElementById('hwSubjectSelect');
  if (!classSel || !subjSel) return;

  const prevClass = classSel.value;
  const prevSubj = subjSel.value;

  classSel.innerHTML = '<option value="">-- Select Class --</option>';
  (profile.assignedClasses || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    classSel.appendChild(opt);
  });
  if (prevClass && profile.assignedClasses.includes(prevClass)) {
    classSel.value = prevClass;
  } else if (profile.assignedClasses.length === 1) {
    classSel.value = profile.assignedClasses[0];
  }

  subjSel.innerHTML = '<option value="">-- Select Subject --</option>';
  (profile.assignedSubjects || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    subjSel.appendChild(opt);
  });
  if (prevSubj && profile.assignedSubjects.includes(prevSubj)) {
    subjSel.value = prevSubj;
  } else if (profile.assignedSubjects.length === 1) {
    subjSel.value = profile.assignedSubjects[0];
  }
}

async function loadMyHomeworkList() {
  const date = (document.getElementById('hwDate') || {}).value || getTodayIsoDate();
  const listEl = document.getElementById('hwMyListContainer');
  if (!listEl) return;

  listEl.innerHTML = '<div class="loading-recent"><div class="spinner"></div><p>Loading homework...</p></div>';
  try {
    const res = await apiCall(`/api/homework/list?date=${encodeURIComponent(date)}`);
    if (!res || res.status !== 'success') {
      listEl.innerHTML = `<p style="color: #ef4444;">${escapeHwHtml((res && res.message) || 'Failed to load homework.')}</p>`;
      return;
    }

    hwListCache = res.items || [];
    if (hwListCache.length === 0) {
      listEl.innerHTML = '<p style="color: #64748b; padding: 8px 0;">No homework added for this date yet.</p>';
      return;
    }

    listEl.innerHTML = hwListCache.map(item => `
      <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
          <div>
            <span class="assigned-class-badge">${escapeHwHtml(item.className)}</span>
            <strong style="margin-left: 6px; color: #0f172a;">${escapeHwHtml(item.subject)}</strong>
            <span class="assigned-class-badge" style="background: rgba(79,70,229,0.1); color: #4338ca; margin-left: 6px;">${escapeHwHtml(item.homeworkType || 'Writing')}</span>
            <span style="font-size: 0.8rem; color: #64748b; margin-left: 8px;">by ${escapeHwHtml(item.teacherName)}</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="editHomeworkItem('${escapeHwHtml(item.id)}')">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button type="button" class="btn-secondary" style="padding: 4px 10px; font-size: 0.8rem; color: #dc2626;" onclick="deleteHomeworkItem('${escapeHwHtml(item.id)}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div style="margin-top: 8px; white-space: pre-wrap; color: #334155; font-size: 0.94rem;">${escapeHwHtml(item.description)}</div>
        ${item.teacherNote ? `<div style="margin-top: 6px; font-size: 0.85rem; color: #475569;"><i class="fas fa-sticky-note"></i> <strong>Note:</strong> ${escapeHwHtml(item.teacherNote)}</div>` : ''}
        <div style="margin-top: 6px; display: flex; gap: 10px; flex-wrap: wrap; font-size: 0.82rem;">
          ${item.videoLink ? `<a href="${escapeHwHtml(item.videoLink)}" target="_blank" rel="noopener noreferrer" style="color: #dc2626;"><i class="fab fa-youtube"></i> Video Link</a>` : ''}
          ${item.attachmentUrl ? `<a href="${escapeHwHtml(item.attachmentUrl)}" target="_blank" rel="noopener noreferrer" style="color: #2563eb;"><i class="fas fa-image"></i> Image Attachment</a>` : ''}
          ${item.pdfNotesUrl ? `<a href="${escapeHwHtml(item.pdfNotesUrl)}" target="_blank" rel="noopener noreferrer" style="color: #7c3aed;"><i class="fas fa-file-pdf"></i> PDF Notes</a>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('loadMyHomeworkList error:', err);
    listEl.innerHTML = '<p style="color: #ef4444;">Error loading homework list.</p>';
  }
}

function addHomeworkItemRow(initialValue = '') {
  const container = document.getElementById('hwItemsList');
  if (!container) return;
  const count = container.querySelectorAll('.hw-item-row').length + 1;
  const row = document.createElement('div');
  row.className = 'hw-item-row';
  row.style.cssText = 'display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;';
  row.innerHTML = `
    <span class="hw-item-num" style="font-weight: 700; padding-top: 10px; min-width: 20px; color: #334155;">${count}.</span>
    <textarea class="hw-item-input" rows="2" placeholder="Enter homework ${count}..." style="flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-family: inherit; font-size: 0.95rem;"></textarea>
    <button type="button" onclick="removeHomeworkItemRow(this)" title="Remove" style="width: 32px; height: 32px; min-width: 32px; flex-shrink: 0; border-radius: 8px; border: 1px solid #fecaca; background: #fef2f2; color: #dc2626; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; margin-top: 4px; font-size: 0.85rem;">
      <i class="fas fa-times"></i>
    </button>
  `;
  row.querySelector('.hw-item-input').value = initialValue;
  container.appendChild(row);
  renumberHomeworkRows();
}

function removeHomeworkItemRow(btn) {
  const row = btn.closest('.hw-item-row');
  if (row) row.remove();
  renumberHomeworkRows();
}

function renumberHomeworkRows() {
  const container = document.getElementById('hwItemsList');
  if (!container) return;
  const rows = container.querySelectorAll('.hw-item-row');
  rows.forEach((r, idx) => {
    const numEl = r.querySelector('.hw-item-num');
    const ta = r.querySelector('.hw-item-input');
    if (numEl) numEl.textContent = `${idx + 1}.`;
    if (ta) ta.placeholder = `Enter homework ${idx + 1}...`;
  });
}

function setHomeworkItemValues(values) {
  const container = document.getElementById('hwItemsList');
  if (!container) return;
  const list = values && values.length > 0 ? values : [''];
  container.innerHTML = '';
  list.forEach((val, idx) => {
    if (idx === 0) {
      const row = document.createElement('div');
      row.className = 'hw-item-row';
      row.style.cssText = 'display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;';
      row.innerHTML = `
        <span class="hw-item-num" style="font-weight: 700; padding-top: 10px; min-width: 20px; color: #334155;">1.</span>
        <textarea class="hw-item-input" rows="2" placeholder="Enter homework 1..." style="flex: 1; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-family: inherit; font-size: 0.95rem;"></textarea>
      `;
      row.querySelector('.hw-item-input').value = val;
      container.appendChild(row);
    } else {
      addHomeworkItemRow(val);
    }
  });
}

function getCombinedHomeworkDescription() {
  const inputs = Array.from(document.querySelectorAll('#hwItemsList .hw-item-input'))
    .map(el => el.value.trim())
    .filter(Boolean);
  if (inputs.length === 0) return '';
  if (inputs.length === 1) return inputs[0];
  return inputs.map((txt, idx) => `${idx + 1}. ${txt}`).join('\n');
}

function handleHomeworkImageSelect(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  hwPendingImageFile = file;
  hwExistingAttachmentUrl = '';
  const box = document.getElementById('hwImagePreviewBox');
  if (box) {
    const reader = new FileReader();
    reader.onload = (e) => {
      box.style.display = 'block';
      box.innerHTML = `
        <div style="display: inline-flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 10px;">
          <img src="${e.target.result}" alt="Preview" style="width: 48px; height: 48px; object-fit: cover; border-radius: 6px;">
          <span style="font-size: 0.85rem; color: #334155;">${escapeHwHtml(file.name)}</span>
          <button type="button" onclick="clearHomeworkImage()" style="width: 28px; height: 28px; min-width: 28px; flex-shrink: 0; border-radius: 6px; border: 1px solid #fecaca; background: #fef2f2; color: #dc2626; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;"><i class="fas fa-times"></i></button>
        </div>
      `;
    };
    reader.readAsDataURL(file);
  }
}

function clearHomeworkImage() {
  hwPendingImageFile = null;
  hwExistingAttachmentUrl = '';
  const cam = document.getElementById('hwCameraInput');
  const gal = document.getElementById('hwGalleryInput');
  const box = document.getElementById('hwImagePreviewBox');
  if (cam) cam.value = '';
  if (gal) gal.value = '';
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

function handleHomeworkPdfSelect(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showStatus('PDF file must be 10MB or smaller.', 'error');
    input.value = '';
    return;
  }
  hwPendingPdfFile = file;
  hwExistingPdfNotesUrl = '';
  const box = document.getElementById('hwPdfPreviewBox');
  if (box) {
    box.style.display = 'block';
    box.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 10px;">
        <i class="fas fa-file-pdf" style="color: #dc2626;"></i>
        <span style="font-size: 0.85rem; color: #334155;">${escapeHwHtml(file.name)}</span>
        <button type="button" onclick="clearHomeworkPdf()" style="width: 28px; height: 28px; min-width: 28px; flex-shrink: 0; border-radius: 6px; border: 1px solid #fecaca; background: #fef2f2; color: #dc2626; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;"><i class="fas fa-times"></i></button>
      </div>
    `;
  }
}

function clearHomeworkPdf() {
  hwPendingPdfFile = null;
  hwExistingPdfNotesUrl = '';
  const inp = document.getElementById('hwPdfInput');
  const box = document.getElementById('hwPdfPreviewBox');
  if (inp) inp.value = '';
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resetHomeworkForm() {
  setHomeworkItemValues(['']);
  const videoEl = document.getElementById('hwVideoLink');
  const noteEl = document.getElementById('hwTeacherNote');
  const typeEl = document.getElementById('hwTypeSelect');
  if (videoEl) videoEl.value = '';
  if (noteEl) noteEl.value = '';
  if (typeEl) typeEl.value = 'Writing';
  clearHomeworkImage();
  clearHomeworkPdf();
}

function editHomeworkItem(id) {
  const item = hwListCache.find(x => x.id === id);
  if (!item) return;
  const dateEl = document.getElementById('hwDate');
  const classEl = document.getElementById('hwClassSelect');
  const subjEl = document.getElementById('hwSubjectSelect');
  const typeEl = document.getElementById('hwTypeSelect');
  const videoEl = document.getElementById('hwVideoLink');
  const noteEl = document.getElementById('hwTeacherNote');

  if (dateEl) dateEl.value = item.date;
  if (classEl) classEl.value = item.className;
  if (subjEl) subjEl.value = item.subject;
  if (typeEl) typeEl.value = item.homeworkType || 'Writing';
  if (videoEl) videoEl.value = item.videoLink || '';
  if (noteEl) noteEl.value = item.teacherNote || '';

  const lines = String(item.description || '').split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
  setHomeworkItemValues(lines);

  clearHomeworkImage();
  clearHomeworkPdf();
  hwExistingAttachmentUrl = item.attachmentUrl || '';
  hwExistingPdfNotesUrl = item.pdfNotesUrl || '';

  if (hwExistingAttachmentUrl) {
    const box = document.getElementById('hwImagePreviewBox');
    if (box) {
      box.style.display = 'block';
      box.innerHTML = `<div style="display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid #cbd5e1;padding:6px 10px;border-radius:8px;"><a href="${escapeHwHtml(hwExistingAttachmentUrl)}" target="_blank">Existing Image Attachment</a><button type="button" class="btn-secondary" style="padding:2px 6px;color:#dc2626;" onclick="clearHomeworkImage()"><i class="fas fa-times"></i></button></div>`;
    }
  }
  if (hwExistingPdfNotesUrl) {
    const box = document.getElementById('hwPdfPreviewBox');
    if (box) {
      box.style.display = 'block';
      box.innerHTML = `<div style="display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid #cbd5e1;padding:6px 10px;border-radius:8px;"><a href="${escapeHwHtml(hwExistingPdfNotesUrl)}" target="_blank">Existing PDF Notes</a><button type="button" class="btn-secondary" style="padding:2px 6px;color:#dc2626;" onclick="clearHomeworkPdf()"><i class="fas fa-times"></i></button></div>`;
    }
  }

  switchHomeworkSubTab('add');
  showStatus(`Loaded ${item.className} - ${item.subject} for editing`, 'info');
}

async function saveTeacherHomework() {
  const date = (document.getElementById('hwDate') || {}).value || getTodayIsoDate();
  const className = (document.getElementById('hwClassSelect') || {}).value || '';
  const subject = (document.getElementById('hwSubjectSelect') || {}).value || '';
  const homeworkType = (document.getElementById('hwTypeSelect') || {}).value || 'Writing';
  const description = getCombinedHomeworkDescription();
  const videoLink = ((document.getElementById('hwVideoLink') || {}).value || '').trim();
  const teacherNote = ((document.getElementById('hwTeacherNote') || {}).value || '').trim();
  const btn = document.getElementById('hwSaveBtn');

  if (!className || !subject || !description) {
    showStatus('Please select Class, Subject, and enter at least one Homework item.', 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  }

  try {
    let attachmentUrl = hwExistingAttachmentUrl;
    if (hwPendingImageFile) {
      const base64Data = await fileToBase64(hwPendingImageFile);
      const upRes = await apiCall('/api/homework/upload', 'POST', {
        fileName: hwPendingImageFile.name,
        contentType: hwPendingImageFile.type || 'image/jpeg',
        base64Data
      });
      if (!upRes || upRes.status !== 'success') {
        showStatus((upRes && upRes.message) || 'Image upload failed.', 'error');
        return;
      }
      attachmentUrl = upRes.url;
    }

    let pdfNotesUrl = hwExistingPdfNotesUrl;
    if (hwPendingPdfFile) {
      const base64Data = await fileToBase64(hwPendingPdfFile);
      const upRes = await apiCall('/api/homework/upload', 'POST', {
        fileName: hwPendingPdfFile.name,
        contentType: 'application/pdf',
        base64Data
      });
      if (!upRes || upRes.status !== 'success') {
        showStatus((upRes && upRes.message) || 'PDF upload failed.', 'error');
        return;
      }
      pdfNotesUrl = upRes.url;
    }

    const res = await apiCall('/api/homework/save', 'POST', {
      date, className, subject, homeworkType, description, videoLink, teacherNote, attachmentUrl, pdfNotesUrl
    });

    if (res && res.status === 'success') {
      showStatus(res.message || 'Homework saved!', 'success');
      resetHomeworkForm();
      await loadMyHomeworkList();
      if (hwProfile && hwProfile.isClassTeacher) {
        await loadConsolidatedHomework();
      }
    } else {
      showStatus((res && res.message) || 'Failed to save homework.', 'error');
    }
  } catch (err) {
    console.error('saveTeacherHomework error:', err);
    showStatus('Error saving homework.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save Homework';
    }
  }
}

async function deleteHomeworkItem(id) {
  if (!confirm('Delete this homework entry?')) return;
  try {
    const res = await apiCall(`/api/homework/${encodeURIComponent(id)}`, 'DELETE');
    if (res && res.status === 'success') {
      showStatus(res.message || 'Homework deleted.', 'success');
      await loadMyHomeworkList();
      if (hwProfile && hwProfile.isClassTeacher) {
        await loadConsolidatedHomework();
      }
    } else {
      showStatus((res && res.message) || 'Could not delete homework.', 'error');
    }
  } catch (err) {
    showStatus('Error deleting homework.', 'error');
  }
}

function setupClassTeacherSection(profile) {
  const navBtn = document.getElementById('hwClassTeacherNavBtn');
  const ctClassSel = document.getElementById('hwCtClassSelect');
  if (!ctClassSel) return;

  if (!profile.isClassTeacher || (profile.classTeacherOf || []).length === 0) {
    if (navBtn) navBtn.style.display = 'none';
    if (hwActiveSubTab === 'send') switchHomeworkSubTab('add');
    return;
  }

  if (navBtn) navBtn.style.display = '';
  ctClassSel.innerHTML = '';
  profile.classTeacherOf.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    ctClassSel.appendChild(opt);
  });

  if (profile.classTeacherOf.length > 0) {
    ctClassSel.value = profile.classTeacherOf[0];
    if (hwActiveSubTab === 'send') {
      loadConsolidatedHomework();
    }
  }
}

async function loadConsolidatedHomework() {
  const date = (document.getElementById('hwCtDate') || {}).value || getTodayIsoDate();
  const className = (document.getElementById('hwCtClassSelect') || {}).value || '';
  const previewEl = document.getElementById('hwConsolidatedPreview');
  const groupInfoEl = document.getElementById('hwCtGroupInfo');
  const countEl = document.getElementById('hwCtSubjectCount');

  if (!className || !previewEl) return;

  previewEl.value = 'Generating PDF & loading consolidated homework...';
  try {
    const res = await apiCall(`/api/homework/consolidated?date=${encodeURIComponent(date)}&className=${encodeURIComponent(className)}`);
    if (!res || res.status !== 'success') {
      previewEl.value = (res && res.message) || 'Could not load consolidated homework.';
      hwConsolidatedData = null;
      return;
    }

    hwConsolidatedData = res;
    previewEl.value = res.formattedMessage || '';

    if (countEl) {
      const n = (res.items || []).length;
      countEl.textContent = `${n} subject${n === 1 ? '' : 's'} submitted`;
    }

    if (groupInfoEl) {
      const pdfBadge = res.pdfUrl
        ? `<span style="margin-left: 10px; color: #4338ca;"><i class="fas fa-file-pdf"></i> PDF Attached</span>`
        : '';
      if (res.whatsappGroup) {
        groupInfoEl.innerHTML = `<i class="fab fa-whatsapp" style="color: #16a34a;"></i> Target Group: <strong>${escapeHwHtml(res.whatsappGroup.name || res.className)}</strong>${pdfBadge}`;
      } else {
        groupInfoEl.innerHTML = `<i class="fas fa-info-circle" style="color: #64748b;"></i> Click "Send to WhatsApp" to open WhatsApp with the message pre-filled, then select your ${escapeHwHtml(res.className)} group.${pdfBadge}`;
      }
    }
  } catch (err) {
    console.error('loadConsolidatedHomework error:', err);
    previewEl.value = 'Error loading consolidated homework.';
  }
}

function copyConsolidatedHomework() {
  const previewEl = document.getElementById('hwConsolidatedPreview');
  const text = previewEl ? previewEl.value.trim() : '';
  if (!text) return showStatus('No consolidated homework message to copy.', 'error');

  navigator.clipboard.writeText(text)
    .then(() => {
      if (typeof showCopyNotification === 'function') {
        showCopyNotification('Consolidated homework copied!');
      }
      showStatus('Consolidated homework copied to clipboard!', 'success');
    })
    .catch(() => showStatus('Failed to copy message.', 'error'));
}

function sendConsolidatedToWhatsApp() {
  const previewEl = document.getElementById('hwConsolidatedPreview');
  const text = previewEl ? previewEl.value.trim() : '';
  if (!text) return showStatus('No consolidated homework message to send.', 'error');

  const rawTarget = hwConsolidatedData && hwConsolidatedData.whatsappGroup && hwConsolidatedData.whatsappGroup.phoneOrLink
    ? String(hwConsolidatedData.whatsappGroup.phoneOrLink).trim()
    : '';
  const isInviteLink = /^https?:\/\//i.test(rawTarget);
  const phoneDigits = !isInviteLink ? rawTarget.replace(/\D/g, '') : '';

  const waUrl = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  window.open(waUrl, '_blank', 'noopener,noreferrer');
}
