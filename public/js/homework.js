/* ==========================================================================
   DAILY HOMEWORK & CLASS TEACHER WHATSAPP CONSOLIDATION
   ========================================================================== */

let hwProfile = null;
let hwListCache = [];
let hwConsolidatedData = null;

function getTodayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHwHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function initializeHomeworkTab() {
  const dateInput = document.getElementById('hwDate');
  const ctDateInput = document.getElementById('hwCtDate');
  const today = getTodayIsoDate();
  if (dateInput && !dateInput.value) dateInput.value = today;
  if (ctDateInput && !ctDateInput.value) ctDateInput.value = today;

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
      </div>
    `).join('');
  } catch (err) {
    console.error('loadMyHomeworkList error:', err);
    listEl.innerHTML = '<p style="color: #ef4444;">Error loading homework list.</p>';
  }
}

function editHomeworkItem(id) {
  const item = hwListCache.find(x => x.id === id);
  if (!item) return;
  const dateEl = document.getElementById('hwDate');
  const classEl = document.getElementById('hwClassSelect');
  const subjEl = document.getElementById('hwSubjectSelect');
  const descEl = document.getElementById('hwDescription');

  if (dateEl) dateEl.value = item.date;
  if (classEl) classEl.value = item.className;
  if (subjEl) subjEl.value = item.subject;
  if (descEl) {
    descEl.value = item.description;
    descEl.focus();
  }
  showStatus(`Loaded ${item.className} - ${item.subject} for editing`, 'info');
}

async function saveTeacherHomework() {
  const date = (document.getElementById('hwDate') || {}).value || getTodayIsoDate();
  const className = (document.getElementById('hwClassSelect') || {}).value || '';
  const subject = (document.getElementById('hwSubjectSelect') || {}).value || '';
  const description = ((document.getElementById('hwDescription') || {}).value || '').trim();
  const btn = document.getElementById('hwSaveBtn');

  if (!className || !subject || !description) {
    showStatus('Please select Class, Subject, and enter the Homework details.', 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  }

  try {
    const res = await apiCall('/api/homework/save', 'POST', { date, className, subject, description });

    if (res && res.status === 'success') {
      showStatus(res.message || 'Homework saved!', 'success');
      const descEl = document.getElementById('hwDescription');
      if (descEl) descEl.value = '';
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
  const card = document.getElementById('hwClassTeacherCard');
  const ctClassSel = document.getElementById('hwCtClassSelect');
  if (!card || !ctClassSel) return;

  if (!profile.isClassTeacher || (profile.classTeacherOf || []).length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  ctClassSel.innerHTML = '';
  profile.classTeacherOf.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    ctClassSel.appendChild(opt);
  });

  if (profile.classTeacherOf.length > 0) {
    ctClassSel.value = profile.classTeacherOf[0];
    loadConsolidatedHomework();
  }
}

async function loadConsolidatedHomework() {
  const date = (document.getElementById('hwCtDate') || {}).value || getTodayIsoDate();
  const className = (document.getElementById('hwCtClassSelect') || {}).value || '';
  const previewEl = document.getElementById('hwConsolidatedPreview');
  const groupInfoEl = document.getElementById('hwCtGroupInfo');
  const countEl = document.getElementById('hwCtSubjectCount');

  if (!className || !previewEl) return;

  previewEl.value = 'Loading consolidated homework...';
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
      if (res.whatsappGroup) {
        groupInfoEl.innerHTML = `<i class="fab fa-whatsapp" style="color: #16a34a;"></i> Target Group: <strong>${escapeHwHtml(res.whatsappGroup.name || res.className)}</strong>`;
      } else {
        groupInfoEl.innerHTML = `<i class="fas fa-info-circle" style="color: #64748b;"></i> No WhatsApp group linked for ${escapeHwHtml(res.className)} in WhatsAppGroups sheet (WhatsApp share will still open with message).`;
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

  // Copy to clipboard so if a WhatsApp group invite link opens, teacher can paste right away
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  if (hwConsolidatedData && hwConsolidatedData.groupInviteUrl) {
    showStatus('Message copied! Opening your class WhatsApp group — paste and send.', 'success');
    window.open(hwConsolidatedData.groupInviteUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const phoneDigits = hwConsolidatedData && hwConsolidatedData.whatsappGroup && hwConsolidatedData.whatsappGroup.phoneOrLink
    ? String(hwConsolidatedData.whatsappGroup.phoneOrLink).replace(/\D/g, '')
    : '';

  const waUrl = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  window.open(waUrl, '_blank', 'noopener,noreferrer');
}
