/* ============================================
   CADENCE SETTINGS - Settings Page Logic
   Theme Switcher + Profile + Notifications
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ========== SESSION CHECK ==========
    const session = JSON.parse(localStorage.getItem('cadence-session') || '{}');
    if (!session.email) {
        window.location.href = 'login.html';
        return;
    }

    // ========== ROLE LABELS ==========
    const ROLE_LABELS = {
        admin: 'Administrator',
        rbh: 'Regional Branch Head',
        rcl: 'Regional Center Lead',
        bh: 'Branch Head',
        cl: 'Center Lead'
    };

    // ========== TOAST SYSTEM ==========
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const icons = { success: 'fas fa-check-circle', error: 'fas fa-exclamation-circle', info: 'fas fa-info-circle' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="${icons[type] || icons.info} toast-icon"></i><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // ========== INIT USER INFO ==========
    const initials = session.name ? session.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';

    document.getElementById('userName').textContent = session.name || 'User';
    document.getElementById('userAvatar').innerHTML = `<span style="font-size:0.8rem;font-weight:600">${initials}</span>`;
    document.getElementById('profileAvatar').innerHTML = `<span style="font-size:1.6rem;font-weight:600">${initials}</span><div class="avatar-overlay"><i class="fas fa-camera"></i></div>`;
    document.getElementById('profileName').textContent = session.name || 'User';
    document.getElementById('profileRole').textContent = ROLE_LABELS[session.role] || 'User';

    // Profile form
    const nameParts = (session.name || '').split(' ');
    document.getElementById('firstName').value = nameParts[0] || '';
    document.getElementById('lastName').value = nameParts.slice(1).join(' ') || '';
    document.getElementById('profileEmail').value = session.email || '';

    // ========== THEME SYSTEM ==========
    const THEMES = ['dark', 'light', 'blue', 'green', 'purple'];
    let currentTheme = localStorage.getItem('cadence-theme') || 'dark';

    function setTheme(theme, save = true) {
        currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        if (save) localStorage.setItem('cadence-theme', theme);

        const icon = document.getElementById('themeIcon');
        if (icon) icon.className = (theme === 'light') ? 'fas fa-sun' : 'fas fa-moon';

        // Update theme cards
        document.querySelectorAll('.theme-card').forEach(card => {
            card.classList.toggle('active', card.dataset.theme === theme);
        });
    }

    // Theme card clicks
    document.querySelectorAll('.theme-card').forEach(card => {
        card.addEventListener('click', () => {
            setTheme(card.dataset.theme);
            showToast(`Theme changed to ${card.dataset.theme.charAt(0).toUpperCase() + card.dataset.theme.slice(1)}`, 'success');
        });
    });

    // Theme toggle button (cycles)
    document.getElementById('themeToggle')?.addEventListener('click', () => {
        const idx = THEMES.indexOf(currentTheme);
        const next = THEMES[(idx + 1) % THEMES.length];
        setTheme(next);
        showToast(`Theme: ${next.charAt(0).toUpperCase() + next.slice(1)}`, 'info');
    });

    setTheme(currentTheme, false);

    // ========== SIDEBAR NAVIGATION ==========
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.dataset.section;

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(`section-${sectionId}`)?.classList.add('active');
        });
    });

    // ========== SIDEBAR COLLAPSE TOGGLE ==========
    const sidebarToggle = document.getElementById('sidebarCollapsed');
    sidebarToggle.checked = localStorage.getItem('cadence-sidebar-collapsed') === 'true';
    sidebarToggle?.addEventListener('change', () => {
        localStorage.setItem('cadence-sidebar-collapsed', sidebarToggle.checked);
        showToast(sidebarToggle.checked ? 'Sidebar will be collapsed by default' : 'Sidebar will be expanded by default', 'info');
    });

    // ========== ANIMATIONS TOGGLE ==========
    const animToggle = document.getElementById('animationsEnabled');
    animToggle.checked = localStorage.getItem('cadence-animations') !== 'disabled';
    animToggle?.addEventListener('change', () => {
        localStorage.setItem('cadence-animations', animToggle.checked ? 'enabled' : 'disabled');
        document.body.classList.toggle('no-animations', !animToggle.checked);
    });

    // ========== NOTIFICATION TOGGLES ==========
    const notifKeys = ['notifSubmissions', 'notifAlerts', 'notifDigest', 'notifSystem', 'notifToast', 'notifSound'];
    notifKeys.forEach(key => {
        const el = document.getElementById(key);
        if (!el) return;
        const saved = localStorage.getItem(`cadence-${key}`);
        el.checked = saved !== null ? saved === 'true' : el.checked;
        el.addEventListener('change', () => {
            localStorage.setItem(`cadence-${key}`, el.checked);
        });
    });

    // Quiet Hours
    const quietToggle = document.getElementById('quietHours');
    const quietRange = document.getElementById('quietHoursRange');
    quietToggle.checked = localStorage.getItem('cadence-quietHours') === 'true';
    quietRange.style.display = quietToggle.checked ? 'grid' : 'none';
    quietToggle?.addEventListener('change', () => {
        localStorage.setItem('cadence-quietHours', quietToggle.checked);
        quietRange.style.display = quietToggle.checked ? 'grid' : 'none';
    });

    document.getElementById('quietFrom')?.addEventListener('change', (e) => {
        localStorage.setItem('cadence-quietFrom', e.target.value);
    });
    document.getElementById('quietTo')?.addEventListener('change', (e) => {
        localStorage.setItem('cadence-quietTo', e.target.value);
    });

    // Load saved values
    document.getElementById('quietFrom').value = localStorage.getItem('cadence-quietFrom') || '22:00';
    document.getElementById('quietTo').value = localStorage.getItem('cadence-quietTo') || '07:00';

    // ========== PROFILE SAVE ==========
    document.getElementById('saveProfileBtn')?.addEventListener('click', () => {
        const btn = document.getElementById('saveProfileBtn');
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const jobTitle = document.getElementById('jobTitle').value.trim();
        const phone = document.getElementById('phone').value.trim();

        if (!firstName) {
            showToast('First name is required', 'error');
            return;
        }

        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.btn-loader').style.display = 'inline';
        btn.disabled = true;

        setTimeout(() => {
            const updatedSession = {
                ...session,
                name: `${firstName} ${lastName}`.trim()
            };
            localStorage.setItem('cadence-session', JSON.stringify(updatedSession));
            localStorage.setItem('cadence-profile-jobTitle', jobTitle);
            localStorage.setItem('cadence-profile-phone', phone);

            document.getElementById('userName').textContent = updatedSession.name;
            document.getElementById('profileName').textContent = updatedSession.name;

            const newInitials = updatedSession.name.split(' ').map(n => n[0]).join('').toUpperCase();
            document.getElementById('userAvatar').innerHTML = `<span style="font-size:0.8rem;font-weight:600">${newInitials}</span>`;
            document.getElementById('profileAvatar').innerHTML = `<span style="font-size:1.6rem;font-weight:600">${newInitials}</span><div class="avatar-overlay"><i class="fas fa-camera"></i></div>`;

            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;

            showToast('Profile updated successfully!', 'success');
        }, 1000);
    });

    document.getElementById('resetProfileBtn')?.addEventListener('click', () => {
        const nameParts = (session.name || '').split(' ');
        document.getElementById('firstName').value = nameParts[0] || '';
        document.getElementById('lastName').value = nameParts.slice(1).join(' ') || '';
        document.getElementById('jobTitle').value = localStorage.getItem('cadence-profile-jobTitle') || '';
        document.getElementById('phone').value = localStorage.getItem('cadence-profile-phone') || '';
        showToast('Profile fields reset', 'info');
    });

    // Load saved profile data
    document.getElementById('jobTitle').value = localStorage.getItem('cadence-profile-jobTitle') || '';
    document.getElementById('phone').value = localStorage.getItem('cadence-profile-phone') || '';

    // ========== PASSWORD TOGGLE ==========
    function setupToggle(btnId, inputId) {
        document.getElementById(btnId)?.addEventListener('click', () => {
            const input = document.getElementById(inputId);
            const icon = document.querySelector(`#${btnId} i`);
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    }
    setupToggle('toggleCurrentPw', 'currentPassword');
    setupToggle('toggleSettingsNewPw', 'settingsNewPassword');

    // ========== CHANGE PASSWORD ==========
    const settingsNewPw = document.getElementById('settingsNewPassword');
    settingsNewPw?.addEventListener('input', () => {
        const val = settingsNewPw.value;
        let score = 0;
        if (val.length >= 8) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[a-z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        const levels = [
            { width: '0%', color: 'transparent', label: '' },
            { width: '20%', color: '#ef4444', label: 'Weak' },
            { width: '40%', color: '#f97316', label: 'Fair' },
            { width: '60%', color: '#eab308', label: 'Good' },
            { width: '80%', color: '#22c55e', label: 'Strong' },
            { width: '100%', color: '#22c55e', label: 'Very Strong' }
        ];

        const level = levels[score] || levels[0];
        document.getElementById('settingsStrengthFill').style.width = level.width;
        document.getElementById('settingsStrengthFill').style.background = level.color;
        document.getElementById('settingsStrengthText').textContent = level.label;
        document.getElementById('settingsStrengthText').style.color = level.color;
    });

    document.getElementById('settingsConfirmPassword')?.addEventListener('input', () => {
        const val = document.getElementById('settingsConfirmPassword').value;
        const newPw = document.getElementById('settingsNewPassword').value;
        const status = document.getElementById('settingsConfirmStatus');
        if (!val) {
            status.className = 'input-status';
            status.innerHTML = '';
            return;
        }
        if (val === newPw) {
            status.className = 'input-status valid';
            status.innerHTML = '<i class="fas fa-check-circle"></i>';
        } else {
            status.className = 'input-status invalid';
            status.innerHTML = '<i class="fas fa-times-circle"></i>';
        }
    });

    // ========== CHANGE PASSWORD (with email OTP verification) ==========
    // OTP helpers (generateOTP / sendOTP / verifyOTP) come from users.js.
    let settingsOtpGenerated = '';
    document.getElementById('otpEmailHint').textContent = session.email || 'your email';

    // Send OTP — only after current password + new password are validated
    document.getElementById('sendSettingsOtpBtn')?.addEventListener('click', async () => {
        const current = document.getElementById('currentPassword').value;
        const newPw = document.getElementById('settingsNewPassword').value;
        const confirm = document.getElementById('settingsConfirmPassword').value;
        const btn = document.getElementById('sendSettingsOtpBtn');
        const otpInput = document.getElementById('settingsOtp');
        const status = document.getElementById('settingsOtpStatus');

        if (!current) { showToast('Enter your current password first', 'error'); return; }
        if (newPw.length < 8) { showToast('New password must be at least 8 characters', 'error'); return; }
        if (newPw !== confirm) { showToast('Passwords do not match', 'error'); return; }

        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.btn-loader').style.display = 'inline';
        btn.disabled = true;
        status.textContent = '';

        try {
            // Confirm current password before sending OTP
            const authResult = await authenticateUser(session.email, current);
            if (!authResult.success) {
                showToast('Current password is incorrect', 'error');
                return;
            }

            settingsOtpGenerated = generateOTP();
            const sendResult = await sendOTP(session.email, settingsOtpGenerated, 'password-change');
            if (!sendResult.success) {
                status.style.color = '#ef4444';
                status.textContent = sendResult.error || 'Failed to send OTP';
                return;
            }

            otpInput.disabled = false;
            otpInput.focus();
            status.style.color = 'var(--success)';
            status.textContent = 'OTP sent to your email. Check inbox (and Spam).';
            showToast(`OTP sent to ${session.email}`, 'success');
        } catch (error) {
            console.error('Send OTP error:', error);
            status.style.color = '#ef4444';
            status.textContent = 'Failed to send OTP. Please try again.';
        } finally {
            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;
        }
    });

    document.getElementById('settingsOtp')?.addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '').slice(0, 6);
    });

    // Change password — requires a valid OTP first
    document.getElementById('changePasswordBtn')?.addEventListener('click', async () => {
        const current = document.getElementById('currentPassword').value;
        const newPw = document.getElementById('settingsNewPassword').value;
        const confirm = document.getElementById('settingsConfirmPassword').value;
        const enteredOtp = document.getElementById('settingsOtp').value;
        const btn = document.getElementById('changePasswordBtn');
        const status = document.getElementById('settingsOtpStatus');

        if (!current) { showToast('Enter your current password', 'error'); return; }
        if (newPw.length < 8) { showToast('New password must be at least 8 characters', 'error'); return; }
        if (newPw !== confirm) { showToast('Passwords do not match', 'error'); return; }

        // Step 1: verify OTP
        const otpResult = verifyOTP(session.email, enteredOtp);
        if (!otpResult.success) {
            status.style.color = '#ef4444';
            status.textContent = otpResult.error + ' (click Send OTP for a new code)';
            showToast(otpResult.error, 'error');
            return;
        }

        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.btn-loader').style.display = 'inline';
        btn.disabled = true;

        try {
            // Step 2: authenticate with current password
            const authResult = await authenticateUser(session.email, current);
            
            if (!authResult.success) {
                showToast('Current password is incorrect', 'error');
                btn.querySelector('.btn-text').style.display = '';
                btn.querySelector('.btn-loader').style.display = 'none';
                btn.disabled = false;
                return;
            }

            // Step 3: update password (local + Sheet2 via web app)
            const result = await changeUserPassword(session.email, newPw, enteredOtp);
            
            if (!result.success) {
                showToast(result.error || 'Failed to update password', 'error');
                btn.querySelector('.btn-text').style.display = '';
                btn.querySelector('.btn-loader').style.display = 'none';
                btn.disabled = false;
                return;
            }

            if (result.warning) {
                showToast(result.warning, 'info');
            }

            // Update session to reflect password change
            session.isDefaultPassword = false;
            localStorage.setItem('cadence-session', JSON.stringify(session));

            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;
            document.getElementById('currentPassword').value = '';
            document.getElementById('settingsNewPassword').value = '';
            document.getElementById('settingsConfirmPassword').value = '';
            document.getElementById('settingsOtp').value = '';
            document.getElementById('settingsOtp').disabled = true;
            status.textContent = '';
            showToast('Password updated successfully!', 'success');
        } catch (error) {
            console.error('Password change error:', error);
            showToast('Failed to update password. Please try again.', 'error');
            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;
        }
    });

    // ========== LANGUAGE & REGION ==========
    // Load saved regional settings
    document.getElementById('languageSelect').value = localStorage.getItem('cadence-language') || 'en';
    document.getElementById('dateFormat').value = localStorage.getItem('cadence-dateFormat') || 'DD/MM/YYYY';
    document.getElementById('timezone').value = localStorage.getItem('cadence-timezone') || 'Asia/Kolkata';
    document.getElementById('currency').value = localStorage.getItem('cadence-currency') || 'INR';

    document.getElementById('saveRegionalBtn')?.addEventListener('click', () => {
        localStorage.setItem('cadence-language', document.getElementById('languageSelect').value);
        localStorage.setItem('cadence-dateFormat', document.getElementById('dateFormat').value);
        localStorage.setItem('cadence-timezone', document.getElementById('timezone').value);
        localStorage.setItem('cadence-currency', document.getElementById('currency').value);
        showToast('Regional preferences saved!', 'success');
    });

    // ========== DATA STORAGE INFO ==========
    function calculateStorage() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage.getItem(key).length * 2; // UTF-16
            }
        }
        const kb = (total / 1024).toFixed(1);
        const mb = (total / (1024 * 1024)).toFixed(2);
        const percent = Math.min((total / (10 * 1024 * 1024)) * 100, 100).toFixed(0);

        document.getElementById('storageSize').textContent = `${kb} KB`;
        document.getElementById('cacheSize').textContent = '0 KB';
        document.getElementById('storageFill').style.width = `${percent}%`;
        document.getElementById('storageText').textContent = `${percent}% of 10 MB used`;
    }
    calculateStorage();

    // ========== CLEAR CACHE ==========
    document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
        const keysToKeep = [
            'cadence-session', 'cadence-theme', 'cadence-remember',
            'cadence-sidebar-collapsed', 'cadence-animations',
            'cadence-language', 'cadence-dateFormat', 'cadence-timezone', 'cadence-currency',
            'cadence-profile-jobTitle', 'cadence-profile-phone'
        ];

        const allKeys = Object.keys(localStorage);
        let cleared = 0;
        allKeys.forEach(key => {
            if (!keysToKeep.includes(key) && key.startsWith('cadence-')) {
                localStorage.removeItem(key);
                cleared++;
            }
        });

        calculateStorage();
        showToast(`Cache cleared! ${cleared} items removed.`, 'success');
    });

    // ========== EXPORT FUNCTIONS ==========
    document.getElementById('exportCSV')?.addEventListener('click', () => {
        const csv = 'Name,Role,Region,BH,Center\n';
        showToast('CSV export ready (demo)', 'success');
    });

    document.getElementById('exportJSON')?.addEventListener('click', () => {
        const data = { exportDate: new Date().toISOString(), user: session.name, role: session.role };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'cadence-export.json'; a.click();
        URL.revokeObjectURL(url);
        showToast('JSON exported successfully!', 'success');
    });

    document.getElementById('exportPDF')?.addEventListener('click', () => {
        showToast('PDF export coming soon!', 'info');
    });

    document.getElementById('exportExcel')?.addEventListener('click', () => {
        showToast('Excel export coming soon!', 'info');
    });

    // ========== IMPORT ZONE ==========
    const importZone = document.getElementById('importZone');
    const importFile = document.getElementById('importFile');

    importZone?.addEventListener('click', () => importFile.click());

    importZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        importZone.classList.add('dragover');
    });

    importZone?.addEventListener('dragleave', () => {
        importZone.classList.remove('dragover');
    });

    importZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        importZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleImport(file);
    });

    importFile?.addEventListener('change', (e) => {
        if (e.target.files[0]) handleImport(e.target.files[0]);
    });

    function handleImport(file) {
        const validTypes = ['text/csv', 'application/json'];
        if (!validTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.json')) {
            showToast('Invalid file type. Please use CSV or JSON.', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast('File too large. Maximum 5MB allowed.', 'error');
            return;
        }
        showToast(`Importing ${file.name}...`, 'info');
        setTimeout(() => showToast('Import complete! (demo)', 'success'), 1500);
    }

    // ========== DELETE ACCOUNT ==========
    document.getElementById('deleteAccountBtn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete your account? This action is irreversible.')) {
            if (confirm('All your data will be permanently deleted. Type DELETE to confirm.')) {
                localStorage.clear();
                showToast('Account deleted. Redirecting...', 'info');
                setTimeout(() => window.location.href = 'login.html', 2000);
            }
        }
    });

    // ========== LOGOUT ==========
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to sign out?')) {
            localStorage.removeItem('cadence-session');
            showToast('Signed out successfully', 'success');
            setTimeout(() => window.location.href = 'login.html', 800);
        }
    });

    console.log('%c CADENCE Settings Loaded ', 'background: linear-gradient(135deg, #3b82f6, #a855f7); color: white; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 14px;');

});
