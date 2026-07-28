/* ============================================
   CADENCE LOGIN - Authentication Logic
   Multi-theme + OTP + Password Reset
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ========== DEMO USERS DATABASE ==========
    const USERS_DB = {
        'admin@cadence.com': { password: 'admin123', name: 'Administrator', role: 'admin', region: null, bh: null, center: null },
        'rajesh@cadence.com': { password: 'rbh123', name: 'Rajesh Kumar', role: 'rbh', region: 'north', bh: 'bh-n1', center: null },
        'amit@cadence.com': { password: 'rcl123', name: 'Amit Verma', role: 'rcl', region: 'north', bh: null, center: null },
        'manoj@cadence.com': { password: 'bh123', name: 'Manoj Singh', role: 'bh', region: 'south', bh: 'bh-s1', center: null },
        'vikram@cadence.com': { password: 'cl123', name: 'Vikram Thapa', role: 'cl', region: 'north', bh: 'bh-n1', center: 'c-n1-a' }
    };

    const ROLE_LABELS = {
        admin: 'Administrator',
        rbh: 'Regional Branch Head',
        rcl: 'Regional Center Lead',
        bh: 'Branch Head',
        cl: 'Center Lead'
    };

    // ========== THEME SYSTEM ==========
    const THEMES = ['dark', 'light', 'blue', 'green', 'purple'];
    let currentTheme = localStorage.getItem('cadence-theme') || 'dark';

    function setTheme(theme) {
        currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('cadence-theme', theme);
        const icon = document.getElementById('themeIcon');
        if (icon) {
            icon.className = (theme === 'light') ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    // Cycle through themes on toggle
    document.getElementById('themeToggle')?.addEventListener('click', () => {
        const idx = THEMES.indexOf(currentTheme);
        const next = THEMES[(idx + 1) % THEMES.length];
        setTheme(next);
        showToast(`Theme: ${next.charAt(0).toUpperCase() + next.slice(1)}`, 'info');
    });

    setTheme(currentTheme);

    // ========== CARD NAVIGATION ==========
    function showCard(cardId) {
        document.querySelectorAll('.auth-card').forEach(c => c.style.display = 'none');
        const card = document.getElementById(cardId);
        if (card) {
            card.style.display = 'block';
            card.style.animation = 'none';
            card.offsetHeight; // trigger reflow
            card.style.animation = 'cardSlideIn 0.4s ease';
        }
    }

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

    // ========== PASSWORD TOGGLE ==========
    function setupTogglePassword(btnId, inputId) {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        if (btn && input) {
            btn.addEventListener('click', () => {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                btn.querySelector('i').className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
            });
        }
    }

    setupTogglePassword('togglePassword', 'loginPassword');
    setupTogglePassword('toggleNewPassword', 'newPassword');
    setupTogglePassword('toggleRegPassword', 'regPassword');

    // ========== LOGIN FORM ==========
    document.getElementById('loginForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const emailError = document.getElementById('emailError');
        const passwordError = document.getElementById('passwordError');
        const loginBtn = document.getElementById('loginBtn');

        // Reset errors
        emailError.textContent = '';
        passwordError.textContent = '';

        // Validation
        if (!email) {
            emailError.textContent = 'Email is required';
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            emailError.textContent = 'Please enter a valid email';
            return;
        }
        if (!password) {
            passwordError.textContent = 'Password is required';
            return;
        }

        // Show loader
        loginBtn.querySelector('.btn-text').style.display = 'none';
        loginBtn.querySelector('.btn-loader').style.display = 'inline';
        loginBtn.disabled = true;

        // Simulate API call
        setTimeout(() => {
            const user = USERS_DB[email];

            if (!user) {
                emailError.textContent = 'No account found with this email';
                loginBtn.querySelector('.btn-text').style.display = '';
                loginBtn.querySelector('.btn-loader').style.display = 'none';
                loginBtn.disabled = false;
                return;
            }

            if (user.password !== password) {
                passwordError.textContent = 'Incorrect password. Please try again.';
                loginBtn.querySelector('.btn-text').style.display = '';
                loginBtn.querySelector('.btn-loader').style.display = 'none';
                loginBtn.disabled = false;
                return;
            }

            // Success!
            const session = {
                email,
                name: user.name,
                role: user.role,
                region: user.region,
                bh: user.bh,
                center: user.center,
                loginTime: new Date().toISOString()
            };

            localStorage.setItem('cadence-session', JSON.stringify(session));

            if (document.getElementById('rememberMe')?.checked) {
                localStorage.setItem('cadence-remember', email);
            }

            showToast(`Welcome back, ${user.name}!`, 'success');

            setTimeout(() => {
                window.location.href = 'index.html';
            }, 800);
        }, 1200);
    });

    // Pre-fill remembered email
    const remembered = localStorage.getItem('cadence-remember');
    if (remembered) {
        document.getElementById('loginEmail').value = remembered;
        document.getElementById('rememberMe').checked = true;
    }

    // ========== EMAIL VALIDATION (REAL-TIME) ==========
    const loginEmail = document.getElementById('loginEmail');
    loginEmail?.addEventListener('blur', () => {
        const val = loginEmail.value.trim();
        const status = document.getElementById('emailStatus');
        const error = document.getElementById('emailError');
        if (!val) { status.className = 'input-status'; status.textContent = ''; error.textContent = ''; return; }
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            status.className = 'input-status valid';
            status.innerHTML = '<i class="fas fa-check-circle"></i>';
            error.textContent = '';
        } else {
            status.className = 'input-status invalid';
            status.innerHTML = '<i class="fas fa-times-circle"></i>';
            error.textContent = 'Invalid email format';
        }
    });

    // ========== FORGOT PASSWORD ==========
    let currentResetEmail = '';
    let generatedOtp = '';

    document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        showCard('forgotCard');
    });

    document.getElementById('backToLogin')?.addEventListener('click', (e) => {
        e.preventDefault();
        showCard('loginCard');
    });

    // Send OTP
    document.getElementById('forgotForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value.trim();
        const error = document.getElementById('forgotEmailError');
        const btn = document.getElementById('sendOtpBtn');

        error.textContent = '';

        if (!email) { error.textContent = 'Email is required'; return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { error.textContent = 'Invalid email format'; return; }

        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.btn-loader').style.display = 'inline';
        btn.disabled = true;

        setTimeout(() => {
            if (!USERS_DB[email]) {
                error.textContent = 'No account found with this email';
                btn.querySelector('.btn-text').style.display = '';
                btn.querySelector('.btn-loader').style.display = 'none';
                btn.disabled = false;
                return;
            }

            currentResetEmail = email;
            generatedOtp = String(Math.floor(100000 + Math.random() * 900000));

            document.getElementById('otpEmailDisplay').textContent = email;
            document.getElementById('generatedOtp').textContent = generatedOtp;

            showCard('otpCard');
            startOtpTimer();

            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;

            showToast(`OTP sent to ${email}`, 'success');
        }, 1500);
    });

    // Copy OTP
    document.getElementById('copyOtp')?.addEventListener('click', () => {
        navigator.clipboard?.writeText(generatedOtp);
        showToast('OTP copied to clipboard!', 'success');
    });

    // ========== OTP INPUTS ==========
    const otpInputs = document.querySelectorAll('.otp-input');

    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/[^0-9]/g, '');
            e.target.value = val;
            if (val) {
                e.target.classList.add('filled');
                if (index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
            } else {
                e.target.classList.remove('filled');
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                otpInputs[index - 1].focus();
                otpInputs[index - 1].value = '';
                otpInputs[index - 1].classList.remove('filled');
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
            for (let i = 0; i < Math.min(paste.length, 6); i++) {
                otpInputs[i].value = paste[i];
                otpInputs[i].classList.add('filled');
            }
            if (paste.length >= 6) otpInputs[5].focus();
        });
    });

    // Verify OTP
    document.getElementById('otpForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const error = document.getElementById('otpError');
        const btn = document.getElementById('verifyOtpBtn');

        const entered = Array.from(otpInputs).map(i => i.value).join('');
        error.textContent = '';

        if (entered.length !== 6) {
            error.textContent = 'Please enter the complete 6-digit OTP';
            return;
        }

        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.btn-loader').style.display = 'inline';
        btn.disabled = true;

        setTimeout(() => {
            if (entered !== generatedOtp) {
                error.textContent = 'Invalid OTP. Please try again.';
                btn.querySelector('.btn-text').style.display = '';
                btn.querySelector('.btn-loader').style.display = 'none';
                btn.disabled = false;
                return;
            }

            showToast('OTP verified successfully!', 'success');
            showCard('resetCard');
            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;
        }, 1000);
    });

    // Resend OTP
    document.getElementById('backToForgot')?.addEventListener('click', (e) => {
        e.preventDefault();
        showCard('forgotCard');
    });

    document.getElementById('resendOtp')?.addEventListener('click', (e) => {
        e.preventDefault();
        generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
        document.getElementById('generatedOtp').textContent = generatedOtp;
        startOtpTimer();
        showToast('New OTP sent!', 'success');
    });

    // OTP Timer
    function startOtpTimer() {
        const timerEl = document.getElementById('otpTimer');
        const resendEl = document.getElementById('resendOtp');
        let seconds = 30;

        resendEl.style.display = 'none';
        timerEl.style.display = 'inline';

        const interval = setInterval(() => {
            seconds--;
            const min = String(Math.floor(seconds / 60)).padStart(2, '0');
            const sec = String(seconds % 60).padStart(2, '0');
            timerEl.innerHTML = `Resend OTP in <strong>${min}:${sec}</strong>`;

            if (seconds <= 0) {
                clearInterval(interval);
                timerEl.style.display = 'none';
                resendEl.style.display = 'inline';
            }
        }, 1000);
    }

    // ========== RESET PASSWORD ==========
    document.getElementById('resetForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;
        const confirmError = document.getElementById('confirmError');
        const btn = document.getElementById('resetBtn');

        confirmError.textContent = '';

        if (newPass.length < 8) {
            confirmError.textContent = 'Password must be at least 8 characters';
            return;
        }
        if (newPass !== confirmPass) {
            confirmError.textContent = 'Passwords do not match';
            return;
        }

        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.btn-loader').style.display = 'inline';
        btn.disabled = true;

        setTimeout(() => {
            // Update password in users DB (simulated)
            if (USERS_DB[currentResetEmail]) {
                USERS_DB[currentResetEmail].password = newPass;
            }

            showCard('successCard');
            document.getElementById('successTitle').textContent = 'Password Reset Successful!';
            document.getElementById('successMessage').textContent = `Your password has been updated. You can now sign in with your new password.`;

            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;

            showToast('Password reset successful!', 'success');
        }, 1500);
    });

    // Password strength checker
    const newPasswordInput = document.getElementById('newPassword');
    newPasswordInput?.addEventListener('input', () => {
        const val = newPasswordInput.value;
        const strength = checkPasswordStrength(val);
        updateStrengthUI(strength);
        checkRequirements(val);
    });

    function checkPasswordStrength(password) {
        let score = 0;
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[a-z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        return score;
    }

    function updateStrengthUI(score) {
        const fill = document.getElementById('strengthFill');
        const text = document.getElementById('strengthText');
        const levels = [
            { width: '0%', color: 'transparent', label: '' },
            { width: '20%', color: 'var(--strength-weak)', label: 'Weak' },
            { width: '40%', color: 'var(--strength-fair)', label: 'Fair' },
            { width: '60%', color: 'var(--strength-good)', label: 'Good' },
            { width: '80%', color: 'var(--strength-strong)', label: 'Strong' },
            { width: '100%', color: 'var(--success)', label: 'Very Strong' }
        ];
        const level = levels[score] || levels[0];
        fill.style.width = level.width;
        fill.style.background = level.color;
        text.textContent = level.label;
        text.style.color = level.color;
    }

    function checkRequirements(password) {
        const checks = {
            reqLength: password.length >= 8,
            reqUpper: /[A-Z]/.test(password),
            reqLower: /[a-z]/.test(password),
            reqNumber: /[0-9]/.test(password),
            reqSpecial: /[^A-Za-z0-9]/.test(password)
        };

        Object.entries(checks).forEach(([id, met]) => {
            const el = document.getElementById(id);
            if (el) {
                el.className = met ? 'req met' : 'req';
                el.querySelector('i').className = met ? 'fas fa-check-circle' : 'fas fa-circle';
            }
        });
    }

    // Confirm password match
    const confirmInput = document.getElementById('confirmPassword');
    confirmInput?.addEventListener('input', () => {
        const status = document.getElementById('confirmStatus');
        const error = document.getElementById('confirmError');
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = confirmInput.value;

        if (!confirmPass) {
            status.className = 'input-status';
            status.innerHTML = '';
            error.textContent = '';
            return;
        }
        if (confirmPass === newPass) {
            status.className = 'input-status valid';
            status.innerHTML = '<i class="fas fa-check-circle"></i>';
            error.textContent = '';
        } else {
            status.className = 'input-status invalid';
            status.innerHTML = '<i class="fas fa-times-circle"></i>';
            error.textContent = 'Passwords do not match';
        }
    });

    // ========== SUCCESS BUTTON ==========
    document.getElementById('successBtn')?.addEventListener('click', () => {
        showCard('loginCard');
        // Clear forgot password fields
        document.getElementById('forgotEmail').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        otpInputs.forEach(i => { i.value = ''; i.classList.remove('filled'); });
    });

    // ========== REGISTER ==========
    document.getElementById('showRegister')?.addEventListener('click', (e) => {
        e.preventDefault();
        showCard('registerCard');
    });

    document.getElementById('backToLoginFromRegister')?.addEventListener('click', (e) => {
        e.preventDefault();
        showCard('loginCard');
    });

    document.getElementById('registerForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const firstName = document.getElementById('regFirstName').value.trim();
        const lastName = document.getElementById('regLastName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const role = document.getElementById('regRole').value;
        const password = document.getElementById('regPassword').value;
        const btn = document.getElementById('registerBtn');

        if (!firstName || !lastName || !email || !role || !password) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        if (USERS_DB[email]) {
            showToast('An account with this email already exists', 'error');
            return;
        }

        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.btn-loader').style.display = 'inline';
        btn.disabled = true;

        setTimeout(() => {
            USERS_DB[email] = {
                password,
                name: `${firstName} ${lastName}`,
                role,
                region: null,
                bh: null,
                center: null
            };

            showCard('successCard');
            document.getElementById('successTitle').textContent = 'Account Created!';
            document.getElementById('successMessage').textContent = `Your ${ROLE_LABELS[role]} account has been created. You can now sign in.`;

            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;

            showToast('Account created successfully!', 'success');
        }, 1500);
    });

    // ========== SOCIAL LOGIN (SIMULATED) ==========
    document.getElementById('googleLogin')?.addEventListener('click', () => {
        showToast('Google Sign-In coming soon!', 'info');
    });

    document.getElementById('microsoftLogin')?.addEventListener('click', () => {
        showToast('Microsoft Sign-In coming soon!', 'info');
    });

    // ========== KEYBOARD SHORTCUT ==========
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            showCard('loginCard');
        }
    });

    // ========== CHECK EXISTING SESSION ==========
    const existingSession = localStorage.getItem('cadence-session');
    if (existingSession) {
        try {
            const session = JSON.parse(existingSession);
            const loginTime = new Date(session.loginTime);
            const now = new Date();
            const hoursDiff = (now - loginTime) / (1000 * 60 * 60);

            // Session valid for 24 hours
            if (hoursDiff < 24) {
                showToast(`Welcome back, ${session.name}! Redirecting...`, 'info');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
                return;
            } else {
                localStorage.removeItem('cadence-session');
            }
        } catch (e) {}
    }

    console.log('%c CADENCE Login Loaded ', 'background: linear-gradient(135deg, #3b82f6, #a855f7); color: white; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 14px;');

});
