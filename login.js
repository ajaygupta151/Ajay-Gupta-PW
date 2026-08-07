/* ============================================
   CADENCE LOGIN - Authentication Logic
   Dynamic sheet-based auth + https://script.google.com/macros/s/AKfycbxY5MMBvozaZFml959E9INGtwLb6Uv0DAjjU-pSF-88cXE1Ob5Ykrq-_UvCzi5P9pchKQ/exec + Password Reset
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ========== ROLE LABELS ==========
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

    // ========== LOGIN FORM ==========
    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
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

        try {
            // Authenticate against dynamic sheet data
            const result = await authenticateUser(email, password);
            
            if (!result.success) {
                passwordError.textContent = result.error;
                loginBtn.querySelector('.btn-text').style.display = '';
                loginBtn.querySelector('.btn-loader').style.display = 'none';
                loginBtn.disabled = false;
                return;
            }

            const user = result.user;

            // Success!
            const session = {
                email: user.email,
                name: user.name,
                role: user.role,
                region: user.region,
                vertical: user.vertical,
                center: user.center,
                rcl: user.rcl,
                bh: user.bh,
                rbh: user.rbh,
                isDefaultPassword: user.isDefaultPassword,
                loginTime: new Date().toISOString()
            };

            localStorage.setItem('cadence-session', JSON.stringify(session));

            if (document.getElementById('rememberMe')?.checked) {
                localStorage.setItem('cadence-remember', email);
            }

            showToast(`Welcome back, ${user.name}!`, 'success');

            // Go to dashboard (no forced password-change nagging)
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 800);
        } catch (error) {
            console.error('Login error:', error);
            passwordError.textContent = 'Login failed. Please try again.';
            loginBtn.querySelector('.btn-text').style.display = '';
            loginBtn.querySelector('.btn-loader').style.display = 'none';
            loginBtn.disabled = false;
        }
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
    document.getElementById('forgotForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value.trim();
        const errorEl = document.getElementById('forgotEmailError');
        const btn = document.getElementById('sendOtpBtn');

        errorEl.textContent = '';

        if (!email) { error.textContent = 'Email is required'; return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { error.textContent = 'Invalid email format'; return; }

        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.btn-loader').style.display = 'inline';
        btn.disabled = true;

        try {
            // Check if user exists
            const user = await getUserByEmail(email);
            
            if (!user) {
                errorEl.textContent = 'No account found with this email';
                btn.querySelector('.btn-text').style.display = '';
                btn.querySelector('.btn-loader').style.display = 'none';
                btn.disabled = false;
                return;
            }

            currentResetEmail = email;
            generatedOtp = generateOTP();

            document.getElementById('otpEmailDisplay').textContent = email;

            // Send OTP by email (Apps Script / EmailJS in production)
            const sendResult = await sendOTP(email, generatedOtp);
            if (!sendResult.success) {
                errorEl.textContent = sendResult.error || 'Failed to send OTP. Please try again.';
                btn.querySelector('.btn-text').style.display = '';
                btn.querySelector('.btn-loader').style.display = 'none';
                btn.disabled = false;
                return;
            }

            showCard('otpCard');
            startOtpTimer();

            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;

            showToast(`OTP sent to ${email}`, 'success');
        } catch (err) {
            console.error('Send OTP error:', err);
            errorEl.textContent = 'Failed to send OTP. Please try again.';
            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;
        }
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
            const result = verifyOTP(currentResetEmail, entered);
            
            if (!result.success) {
                error.textContent = result.error;
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

    document.getElementById('resendOtp')?.addEventListener('click', async (e) => {
        e.preventDefault();
        generatedOtp = generateOTP();
        await sendOTP(currentResetEmail, generatedOtp);
        startOtpTimer();
        showToast('New OTP sent to your email!', 'success');
    });

    // OTP Timer
    function startOtpTimer() {
        const timerEl = document.getElementById('otpTimer');
        const resendEl = document.getElementById('resendOtp');
        let seconds = 300; // 5 minutes

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
    document.getElementById('resetForm')?.addEventListener('submit', async (e) => {
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

        try {
            // Update password in dynamic database (local + Sheet2 via web app)
            const enteredOtp = Array.from(otpInputs).map(i => i.value).join('');
            const result = await changeUserPassword(currentResetEmail, newPass, enteredOtp);
            
            if (!result.success) {
                confirmError.textContent = result.error;
                btn.querySelector('.btn-text').style.display = '';
                btn.querySelector('.btn-loader').style.display = 'none';
                btn.disabled = false;
                return;
            }

            if (result.warning) {
                showToast(result.warning, 'info');
            }

            showCard('successCard');
            document.getElementById('successTitle').textContent = 'Password Reset Successful!';
            document.getElementById('successMessage').textContent = `Your password has been updated. You can now sign in with your new password.`;

            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;

            showToast('Password reset successful!', 'success');
        } catch (error) {
            console.error('Reset password error:', error);
            confirmError.textContent = 'Failed to reset password. Please try again.';
            btn.querySelector('.btn-text').style.display = '';
            btn.querySelector('.btn-loader').style.display = 'none';
            btn.disabled = false;
        }
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