/* ============================================
   CADENCE - Counselling Cadence Form Logic
   Counselling form with sheet data → Apps Script Web App
   ============================================ */

// ============ CONFIGURATION ============
const FORM_CONFIG = {
    // Web App URL (deployed sheet-form-submit.gs)
    WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbyCL_Sh0wjtmSLy1aun02yuVD1TljUE65lty3aJKcFFgx_G8NMvDPA6NUiVL43B-HRA/exec',
};

// ============ STATE ============
let currentFormType = null;  // '1-1 & Training' or 'Audits'
let session = null;
let orgData = null;
let sheetRows = null;

// Expose functions globally so inline onclick works
window.selectFormType = selectFormType;
window.submitForm = submitForm;
window.resetForm = resetForm;

// ============ INIT ============
document.addEventListener('DOMContentLoaded', initForm);
if (document.readyState !== 'loading') initForm();

async function initForm() {
    // Guard: only run if counselling form elements exist on this page
    if (!document.getElementById('meetingRegion') && !document.getElementById('auditRegion')) return;
    
    // Prevent double-init
    if (window.__cadenceFormInit) return;
    window.__cadenceFormInit = true;

    // Check session
    const sessionData = JSON.parse(localStorage.getItem('cadence-session') || '{}');
    if (!sessionData.email) {
        window.location.href = 'login.html';
        return;
    }
    session = sessionData;

    // Show user label
    const userLabel = document.getElementById('formUserLabel');
    if (userLabel) {
        userLabel.textContent = session.email;
    }

    try {
        // Load sheet data — use cached if available
        const cached = localStorage.getItem('cadence-sheet-data');
        if (cached) {
            sheetRows = JSON.parse(cached);
            orgData = buildFormOrgData(sheetRows);
        } else {
            sheetRows = await fetchSheetData();
            orgData = buildFormOrgData(sheetRows);
        }

        // Populate region dropdowns
        populateRegionSelect('meetingRegion');
        populateRegionSelect('auditRegion');

        // Set today's date
        const today = new Date().toISOString().split('T')[0];
        const meetingDateEl = document.getElementById('meetingDate');
        const auditDateEl = document.getElementById('auditDate');
        if (meetingDateEl) meetingDateEl.value = today;
        if (auditDateEl) auditDateEl.value = today;

        // Pre-fill region based on user role
        prefillUserData();

        // Enable submit button
        const submitBtn = document.getElementById('counselSubmitBtn') || document.getElementById('submitBtn');
        if (submitBtn) submitBtn.disabled = false;

        // Select default form type
        selectFormType('1-1 & Training');

    } catch (error) {
        console.error('Form init error:', error);
        showToast('Failed to load form data: ' + error.message, 'error');
    }

    // ===== EVENT LISTENERS =====
    const meetingRegion = document.getElementById('meetingRegion');
    const auditRegion = document.getElementById('auditRegion');
    if (meetingRegion) {
        meetingRegion.addEventListener('change', function() {
            populateCenterSelect('meetingCenter', 'meetingRegion');
        });
    }
    if (auditRegion) {
        auditRegion.addEventListener('change', function() {
            populateCenterSelect('auditCenter', 'auditRegion');
        });
    }
}

// ============ BUILD FORM DATA FROM SHEET ============
function buildFormOrgData(rows) {
    const regions = {};
    const users = {};
    // Track which centers each user manages
    // managerEmail -> [centerName, ...]
    const userCenters = {};

    // First pass: create users from mail_id rows
    rows.forEach(row => {
        const email = row.mail_id ? row.mail_id.toLowerCase().trim() : '';
        if (!email) return;
        
        const region = row.Region || 'Unknown';
        const center = row.Center || '';
        const rbhEmail = (row.RBH || '').toLowerCase().trim();
        const rclEmail = (row.RCL || '').toLowerCase().trim();
        const bhEmail = (row.BH || '').toLowerCase().trim();

        users[email] = {
            email,
            role: (row.employee_type || 'CL').toLowerCase(),
            region,
            center,
            rcl: rclEmail,
            bh: bhEmail,
            rbh: rbhEmail
        };
    });

    // Second pass: create users from hierarchy columns (BH, RCL, RBH) if not already in users
    rows.forEach(row => {
        const rbhEmail = (row.RBH || '').toLowerCase().trim();
        const rclEmail = (row.RCL || '').toLowerCase().trim();
        const bhEmail = (row.BH || '').toLowerCase().trim();
        const region = row.Region || 'Unknown';
        const center = row.Center || '';

        // Helper to create hierarchy user if not exists
        const ensureUser = (email, role) => {
            if (!email || email === '-' || users[email]) return;
            users[email] = {
                email,
                role,
                region,
                center: '',
                rcl: '',
                bh: '',
                rbh: ''
            };
        };

        ensureUser(bhEmail, 'bh');
        ensureUser(rclEmail, 'rcl');
        ensureUser(rbhEmail, 'rbh');
    });

    // ---- ADMIN OVERRIDE ----
    // employee_type = ADMIN in the sheet OR email in ADMIN_EMAILS -> role 'admin'
    rows.forEach(row => {
        const email = row.mail_id ? row.mail_id.toLowerCase().trim() : '';
        if (email && users[email] && (row.employee_type || '').toUpperCase() === 'ADMIN') {
            users[email].role = 'admin';
        }
    });
    if (typeof ADMIN_EMAILS !== 'undefined') {
        ADMIN_EMAILS.forEach(email => {
            const normalized = email.toLowerCase().trim();
            if (!normalized) return;
            if (!users[normalized]) {
                const name = normalized.split('@')[0]
                    .replace(/[._]/g, ' ')
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                users[normalized] = {
                    email: normalized,
                    role: 'admin',
                    region: '',
                    center: '',
                    rcl: '',
                    bh: '',
                    rbh: ''
                };
            } else {
                users[normalized].role = 'admin';
            }
        });
    }

    // Third pass: track center ownership
    rows.forEach(row => {
        const email = row.mail_id ? row.mail_id.toLowerCase().trim() : '';
        const center = row.Center || '';
        const rbhEmail = (row.RBH || '').toLowerCase().trim();
        const rclEmail = (row.RCL || '').toLowerCase().trim();
        const bhEmail = (row.BH || '').toLowerCase().trim();
        const region = row.Region || 'Unknown';

        if (center && center !== '-') {
            // BH manages this center
            if (bhEmail && bhEmail !== '-') {
                if (!userCenters[bhEmail]) userCenters[bhEmail] = [];
                if (!userCenters[bhEmail].includes(center)) userCenters[bhEmail].push(center);
            }
            // RCL manages this center (via their BHs)
            if (rclEmail && rclEmail !== '-') {
                if (!userCenters[rclEmail]) userCenters[rclEmail] = [];
                if (!userCenters[rclEmail].includes(center)) userCenters[rclEmail].push(center);
            }
            // RBH manages this center (via their chain)
            if (rbhEmail && rbhEmail !== '-') {
                if (!userCenters[rbhEmail]) userCenters[rbhEmail] = [];
                if (!userCenters[rbhEmail].includes(center)) userCenters[rbhEmail].push(center);
            }
            // CL/CM — their own center
            if (email) {
                if (!userCenters[email]) userCenters[email] = [];
                if (!userCenters[email].includes(center)) userCenters[email].push(center);
            }

            // Collect unique centers per region (for all-users reference)
            const regionId = region.toLowerCase().replace(/[^a-z0-9]/g, '-');
            if (!regions[regionId]) {
                regions[regionId] = { id: regionId, name: region, centers: [] };
            }
            if (!regions[regionId].centers.includes(center)) {
                regions[regionId].centers.push(center);
            }
        }

        // Also collect region from row even if no center
        if (region && region !== 'Unknown') {
            const regionId = region.toLowerCase().replace(/[^a-z0-9]/g, '-');
            if (!regions[regionId]) {
                regions[regionId] = { id: regionId, name: region, centers: [] };
            }
        }
    });

    // Attach userCenters to each user
    Object.entries(users).forEach(([email, user]) => {
        user.accessibleCenters = userCenters[email] || [];
    });

    // Sort centers alphabetically
    Object.values(regions).forEach(r => {
        r.centers.sort((a, b) => a.localeCompare(b));
    });
    Object.values(userCenters).forEach(c => c.sort((a, b) => a.localeCompare(b)));

    // Sort regions alphabetically
    const sortedRegions = Object.values(regions).sort((a, b) => a.name.localeCompare(b.name));

    return { regions: sortedRegions, users };
}

// ============ POPULATE REGION DROPDOWN ============
function populateRegionSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    // Keep the first option (placeholder)
    const placeholder = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(placeholder);

    orgData.regions.forEach(region => {
        const opt = document.createElement('option');
        opt.value = region.id;
        opt.textContent = region.name;
        sel.appendChild(opt);
    });
}

// ============ POPULATE CENTER DROPDOWN (from region or user's accessible centers) ============
function populateCenterSelect(centerSelectId, regionSelectId, restrictedCenters) {
    const sel = document.getElementById(centerSelectId);
    const regionId = document.getElementById(regionSelectId).value;

    const placeholder = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(placeholder);

    if (restrictedCenters && restrictedCenters.length > 0) {
        // Use user's restricted centers (role-based)
        restrictedCenters.forEach(center => {
            const opt = document.createElement('option');
            opt.value = center;
            opt.textContent = center;
            sel.appendChild(opt);
        });
        return;
    }

    if (!regionId) return;

    const region = orgData.regions.find(r => r.id === regionId);
    if (!region) return;

    region.centers.forEach(center => {
        const opt = document.createElement('option');
        opt.value = center;
        opt.textContent = center;
        sel.appendChild(opt);
    });
}

// ============ PRE-FILL USER DATA ============
function prefillUserData() {
    if (!session || !orgData) return;

    // Find user's org data
    const userEmail = session.email;
    const user = orgData.users[userEmail];
    if (!user) return;

    const userRegion = user.region;
    const userCenter = user.center;
    const accessibleCenters = user.accessibleCenters || [];

    // Determine which regions the user can see based on role
    let allowedRegions = [];

    switch (user.role) {
        case 'rbh':
        case 'rcl':
        case 'bh':
        case 'cl':
            // Restrict to their own region
            if (userRegion) {
                const regionId = userRegion.toLowerCase().replace(/[^a-z0-9]/g, '-');
                allowedRegions.push(regionId);
            }
            break;
        default:
            // Admin — all regions
            allowedRegions = orgData.regions.map(r => r.id);
    }

    // Pre-fill region and center for both form sections
    ['meetingRegion', 'auditRegion'].forEach(regionSelId => {
        const regionSel = document.getElementById(regionSelId);
        if (!regionSel) return;

        if (allowedRegions.length === 1) {
            regionSel.value = allowedRegions[0];
            regionSel.disabled = true; // Fixed — user can't change
        }

        // Determine which centers to show: user's accessible centers
        const centersToShow = accessibleCenters.length > 0 ? accessibleCenters : null;
        const centerSelId = regionSelId === 'meetingRegion' ? 'meetingCenter' : 'auditCenter';

        if (centersToShow) {
            populateCenterSelect(centerSelId, regionSelId, centersToShow);
        } else {
            populateCenterSelect(centerSelId, regionSelId);
        }

        // Auto-select center
        const centerSel = document.getElementById(centerSelId);
        if (centerSel) {
            if (accessibleCenters.length === 1) {
                // Only one center — auto-select and disable
                centerSel.value = accessibleCenters[0];
                centerSel.disabled = true;
            } else if (accessibleCenters.includes(userCenter)) {
                // User's own center is in the list — pre-select it
                centerSel.value = userCenter;
            }
        }
    });
}

// ============ SELECT FORM TYPE ============
function selectFormType(type) {
    currentFormType = type;

    // Update UI
    document.querySelectorAll('.form-type-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.type === type);
    });

    // Show/hide sections
    document.getElementById('section11').classList.toggle('active', type === '1-1 & Training');
    document.getElementById('sectionAudit').classList.toggle('active', type === 'Audits');

    // Show/hide form actions
    const formActions = document.getElementById('formActions');
    if (formActions) formActions.style.display = 'block';
    const successEl = document.getElementById('counselSuccess') || document.getElementById('submitSuccess');
    if (successEl) successEl.classList.remove('show');
}

// ============ SUBMIT FORM ============
async function submitForm() {
    const btn = document.getElementById('counselSubmitBtn') || document.getElementById('submitBtn');

    if (!currentFormType) {
        showToast('Please select a form type (1-1 & Training or Audits).', 'error');
        return;
    }

    // Validate form
    let formData;
    if (currentFormType === '1-1 & Training') {
        formData = collectForm11();
    } else {
        formData = collectFormAudit();
    }

    if (!formData) return; // Validation failed

    // Show loading
    btn.classList.add('loading');
    btn.disabled = true;

    try {
        const result = await sendFormData(formData);

        if (result.success) {
            showToast('Response submitted successfully!', 'success');
            // Hide form actions, show success
            const formActions = document.getElementById('formActions');
            if (formActions) formActions.style.display = 'none';
            const successEl = document.getElementById('counselSuccess') || document.getElementById('submitSuccess');
            if (successEl) successEl.classList.add('show');
            document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.form-type-option').forEach(el => el.classList.remove('selected'));
            currentFormType = null;
        } else {
            showToast('Submission failed: ' + (result.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Submit error:', error);
        showToast('Submission failed. Check console for details.', 'error');
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

// ============ DATE HELPER (UPDATED FOR IST) ============
function formatDateToDMY(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // dd/mm/yyyy
}

function getISTTimestamp() {
    const now = new Date();
    // Offset standard UTC time by 5 hours and 30 minutes to match IST accurately
    const istOffset = 5.5 * 60 * 60 * 1000; 
    const istTime = new Date(now.getTime() + istOffset);
    // Replace the 'Z' with explicit +05:30 offset
    return istTime.toISOString().replace('Z', '+05:30');
}

// ============ COLLECT 1-1 FORM DATA ============
function collectForm11() {
    const region = document.getElementById('meetingRegion').value;
    const center = document.getElementById('meetingCenter').value;
    const date = document.getElementById('meetingDate').value;
    const type = document.getElementById('meetingType').value;
    const attendees = document.getElementById('meetingAttendees').value.trim();
    const summary = document.getElementById('meetingSummary').value.trim();
    const recording = document.getElementById('meetingRecording').value.trim();

    // Validate
    if (!region) { showToast('Please select Region.', 'error'); return null; }
    if (!center) { showToast('Please select Center.', 'error'); return null; }
    if (!date) { showToast('Please select Meeting Date.', 'error'); return null; }
    if (!type) { showToast('Please select Meeting Type.', 'error'); return null; }
    if (!attendees) { showToast('Please enter Meeting Attendees (email IDs).', 'error'); return null; }
    if (!isValidEmailList(attendees)) { showToast('Please enter valid comma-separated email IDs in Meeting Attendees.', 'error'); return null; }
    if (!summary) { showToast('Please enter Discussion Summary / MOM.', 'error'); return null; }
    if (!recording) { showToast('Please enter the Meeting Recording Link.', 'error'); return null; }

    const regionName = orgData.regions.find(r => r.id === region)?.name || region;

    return {
        formType: '1-1 & Training',
        meetingRegion: regionName,
        meetingCenter: center,
        meetingDate: formatDateToDMY(date),
        meetingType: type,
        meetingAttendees: attendees,
        meetingSummary: summary,
        meetingRecording: recording,
        submittedBy: session.email,
        submittedAt: getISTTimestamp() // Updated to perfectly inject IST
    };
}

// ============ COLLECT AUDIT FORM DATA ============
function collectFormAudit() {
    const region = document.getElementById('auditRegion').value;
    const center = document.getElementById('auditCenter').value;
    const date = document.getElementById('auditDate').value;
    const leadLink = document.getElementById('auditLeadLink').value.trim();
    const counsellor = document.getElementById('auditCounsellor').value.trim();
    const remarks = document.getElementById('auditRemarks').value.trim();
    const score = document.getElementById('auditScore').value;

    // Validate
    if (!region) { showToast('Please select Region.', 'error'); return null; }
    if (!center) { showToast('Please select Center.', 'error'); return null; }
    if (!date) { showToast('Please select Audit Date.', 'error'); return null; }
    if (!leadLink) { showToast('Please enter the Lead Link.', 'error'); return null; }
    if (!counsellor) { showToast('Please enter Counsellor Email.', 'error'); return null; }
    if (!isValidEmailList(counsellor)) { showToast('Please enter a valid Counsellor Email ID.', 'error'); return null; }
    if (!remarks) { showToast('Please enter Audit Remarks.', 'error'); return null; }
    if (!score) { showToast('Please select Audit Score.', 'error'); return null; }

    const regionName = orgData.regions.find(r => r.id === region)?.name || region;

    return {
        formType: 'Audits',
        auditRegion: regionName,
        auditCenter: center,
        auditDate: formatDateToDMY(date),
        auditLeadLink: leadLink,
        auditCounsellor: counsellor,
        auditRemarks: remarks,
        auditScore: score,
        submittedBy: session.email,
        submittedAt: getISTTimestamp() // Updated to perfectly inject IST
    };
}

// ============ EMAIL LIST VALIDATION ============
function isValidEmailList(str) {
    if (!str || !str.trim()) return false;
    const emails = str.split(',').map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emails.every(e => emailRegex.test(e));
}

// ============ SEND FORM DATA ============
async function sendFormData(data) {
    return await sendToWebApp(data);
}

// ============ SEND TO WEB APP (sheet-form-submit.gs) ============
async function sendToWebApp(data) {
    try {
        // Use cors mode with text/plain content type to avoid preflight OPTIONS.
        // Google Apps Script web apps redirect the first request (302),
        // and the preflight (OPTIONS) fails on the redirect URL.
        // text/plain is a "simple" content type — no preflight needed.
        const response = await fetch(FORM_CONFIG.WEBAPP_URL, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Try to parse response as JSON
        const text = await response.text();
        try {
            const result = JSON.parse(text);
            return result;
        } catch (e) {
            // Response isn't JSON — assume success
            console.log('Web app response (non-JSON):', text.substring(0, 200));
            return { success: true };
        }

    } catch (error) {
        console.error('Web app POST error:', error);
        return { success: false, error: error.message };
    }
}

// ============ RESET FORM ============
function resetForm() {
    // Reset selections
    document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.form-type-option').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
    document.querySelectorAll('input[type="text"], input[type="url"], input[type="email"], textarea').forEach(el => el.value = '');
    const formActions = document.getElementById('formActions');
    if (formActions) formActions.style.display = 'block';
    const successEl = document.getElementById('counselSuccess') || document.getElementById('submitSuccess');
    if (successEl) successEl.classList.remove('show');
    currentFormType = null;

    // Re-prefill if orgData exists
    if (orgData) prefillUserData();
    const today = new Date().toISOString().split('T')[0];
    const meetingDateEl = document.getElementById('meetingDate');
    const auditDateEl = document.getElementById('auditDate');
    if (meetingDateEl) meetingDateEl.value = today;
    if (auditDateEl) auditDateEl.value = today;
}

// ============ TOAST NOTIFICATIONS ============
function showToast(message, type) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
    `;
    container.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
